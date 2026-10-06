import 'dotenv/config';
import { youthHealthRoutes } from './youth-health.js';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import { platformRoutes } from './platform.js';
import { contentRoutes } from './content.js';
import { categoryStore, categoryRoutes } from './categories.js';
import { mkdir } from 'node:fs/promises';
import { createStore } from './lib/store.js';
import { installAsyncHandlers, serializeMutations } from './lib/http.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const app = express();
const port = Number(process.env.PORT || 4100);
installAsyncHandlers(app);
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32)
  throw new Error('Set JWT_SECRET with at least 32 characters in .env');
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || join(here, 'data');
await mkdir(dataDir, { recursive: true });
const databasePath = join(dataDir, 'db.json');

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:5180,http://localhost:5180,http://127.0.0.1:5179'
).split(',');
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)) }));
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(serializeMutations());

const { db, save, seed } = createStore(databasePath);
const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const auth = async (req, res, next) => {
  try {
    const claim = jwt.verify(req.headers.authorization?.replace('Bearer ', ''), secret);
    req.admin = (await db()).users.find((u) => u.id === claim.id && u.active);
    if (!req.admin) return res.status(401).json({ error: 'Please sign in again.' });
    if (req.admin.role !== 'admin')
      return res.status(403).json({ error: 'Admin access required.' });
    next();
  } catch (_) {
    res.status(401).json({ error: 'Please sign in again.' });
  }
};

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'Youth Med Admin API' }));
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const data = await db();
  const user = data.users.find((item) => item.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !user.active || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, secret, {
    expiresIn: '8h',
  });
  res.json({ token, admin: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/dashboard', auth, async (_, res) => {
  const data = await db();
  res.json({
    users: data.users.filter((u) => u.role !== 'admin').length,
    activeTests: data.tests.filter((t) => t.active).length,
    courses: data.courses.filter((course) => course.active).length,
    assessments: data.assessments.length,
    latestAssessments: data.assessments.slice(-5).reverse(),
  });
});

const categories = await categoryStore(join(dataDir, 'categories.json'));
categoryRoutes(app, auth, categories);
platformRoutes(app, auth, { db, save, secret, categories });
youthHealthRoutes(app, auth);

await contentRoutes(app, auth, { db, save, dataDir });

app.get('/api/assessments', auth, async (_, res) =>
  res.json((await db()).assessments.slice().reverse()),
);
app.post('/api/assessments', auth, async (req, res) => {
  const { patientName, age, sex, heightCm, weightKg, waistCm, bloodPressureUsed, glucoseUsed } =
    req.body || {};
  if (!patientName || !age || !sex)
    return res.status(400).json({ error: 'Patient name, age and sex are required.' });
  const bmi = Number(heightCm) > 0 ? Number(weightKg) / Math.pow(Number(heightCm) / 100, 2) : null;
  const waistHeightRatio = Number(heightCm) > 0 ? Number(waistCm) / Number(heightCm) : null;
  const data = await db();
  const assessment = {
    id: id('assessment'),
    patientName,
    age: Number(age),
    sex,
    heightCm: Number(heightCm),
    weightKg: Number(weightKg),
    waistCm: Number(waistCm),
    bloodPressureUsed: Boolean(bloodPressureUsed),
    glucoseUsed: Boolean(glucoseUsed),
    bmi: bmi && Number(bmi.toFixed(1)),
    waistHeightRatio: waistHeightRatio && Number(waistHeightRatio.toFixed(2)),
    createdAt: new Date().toISOString(),
  };
  data.assessments.push(assessment);
  await save(data);
  res.status(201).json(assessment);
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code?.startsWith('LIMIT_')) {
    error.status = 400;
    error.message = req.path.endsWith('/image')
      ? 'Зураг 8 MB-аас ихгүй, нэг файл байна.'
      : 'Видео 250 MB-аас ихгүй, нэг файл байна.';
  }
  res
    .status(error.status || 500)
    .json({ error: error.status ? error.message : 'Server could not complete the request.' });
});
await seed();
app.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`Youth Med API: http://127.0.0.1:${port}`),
);

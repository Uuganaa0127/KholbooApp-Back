import { randomUUID } from 'node:crypto';
import { questions } from './content.js';
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const text = (v, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail('Текстээ шалгана уу.');
  return v.trim();
};
export function extrasRoutes(app, { account, admin, read, save }) {
  app.get('/api/account/screenings', account, async (req, res) =>
    res.json(
      ((await read()).assessments || [])
        .filter((a) => a.doctorId === req.user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),
  );
  app.post('/api/account/screenings', account, async (req, res) => {
    const b = req.body;
    const num = (key, min, max, optional = false) => {
      const v = b[key];
      if (optional && (v == null || v === '')) return null;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
        fail(`${key}: утгаа шалгана уу.`);
      return v;
    };
    if (!['Эмэгтэй', 'Эрэгтэй'].includes(b.sex)) fail('Хүйсээ сонгоно уу.');
    if (typeof b.bloodPressureUsed !== 'boolean' || typeof b.glucoseUsed !== 'boolean')
      fail('Хэмжилтийн төлөв буруу.');
    const patientName = text(b.patientName, 160),
      patientCode = text(b.patientCode, 80),
      age = num('age', 0, 120),
      heightCm = num('heightCm', 30, 250),
      weightKg = num('weightKg', 1, 500),
      waistCm = num('waistCm', 10, 300);
    if (!Number.isInteger(age)) fail('Нас бүхэл тоо байна.');
    const systolic = b.bloodPressureUsed ? num('systolic', 40, 300) : null,
      diastolic = b.bloodPressureUsed ? num('diastolic', 20, 200) : null,
      glucose = b.glucoseUsed ? num('glucose', 0.1, 60) : null;
    if (systolic !== null && systolic <= diastolic) fail('Даралтын утгаа шалгана уу.');
    if (typeof b.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(b.requestId))
      fail('Хүсэлтийн дугаар буруу.');
    const d = await read();
    d.assessments ??= [];
    const existing = d.assessments.find(
      (a) => a.doctorId === req.user.id && a.requestId === b.requestId,
    );
    if (existing) return res.json(existing);
    const a = {
      id: randomUUID(),
      doctorId: req.user.id,
      requestId: b.requestId,
      patientName,
      patientCode,
      age,
      sex: b.sex,
      heightCm,
      weightKg,
      waistCm,
      bloodPressureUsed: b.bloodPressureUsed,
      glucoseUsed: b.glucoseUsed,
      systolic,
      diastolic,
      glucose,
      glucoseUnit: 'mmol/L',
      bmi: Number((weightKg / (heightCm / 100) ** 2).toFixed(1)),
      waistHeightRatio: Number((waistCm / heightCm).toFixed(2)),
      createdAt: new Date().toISOString(),
    };
    d.assessments.push(a);
    await save(d);
    res.status(201).json(a);
  });
  const fields = (b, old = {}) => {
    const n = { ...old, ...b };
    if (!['memory', 'sequence', 'quiz'].includes(n.type) || typeof n.active !== 'boolean')
      fail('Тоглоомын төрөл, төлөв буруу.');
    let items = [],
      questionItems = [];
    if (n.type === 'quiz') questionItems = questions(n.questionItems);
    else {
      if (!Array.isArray(n.items) || n.items.length < 2 || n.items.length > 8)
        fail('2–8 ялгаатай зүйл оруулна уу.');
      items = n.items.map((v) => text(v, 100));
      if (new Set(items).size !== items.length) fail('Давхардсан зүйл байна.');
    }
    return {
      title: text(n.title),
      description: typeof n.description === 'string' ? n.description.slice(0, 1000) : '',
      type: n.type,
      active: n.active,
      items,
      questionItems,
    };
  };
  app.get('/api/games', admin, async (_, res) => res.json((await read()).games || []));
  app.get('/api/public/games', async (_, res) =>
    res.json(((await read()).games || []).filter((g) => g.active)),
  );
  app.post('/api/games', admin, async (req, res) => {
    const d = await read();
    d.games ??= [];
    const g = { id: randomUUID(), ...fields(req.body) };
    d.games.push(g);
    await save(d);
    res.status(201).json(g);
  });
  app.patch('/api/games/:id', admin, async (req, res) => {
    const d = await read(),
      g = (d.games || []).find((g) => g.id === req.params.id);
    if (!g) fail('Тоглоом олдсонгүй.', 404);
    Object.assign(g, fields(req.body, g));
    await save(d);
    res.json(g);
  });
}

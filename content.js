import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import express from 'express';
import multer from 'multer';
import { professions } from './study.js';

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const text = (value, label, max = 300, required = true) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()))
    fail(`${label}: утгаа шалгана уу.`);
  return value.trim();
};
const bool = (value) => {
  if (typeof value !== 'boolean') fail('Төлөв буруу.');
  return value;
};
const number = (value, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    fail('Тоон утга буруу.');
  return value;
};
const url = (value = '') => {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 2000) fail('Холбоос буруу.');
  if (/^\/uploads\/[a-f0-9-]+\.(mp4|webm)$/.test(value)) return value;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol))
      fail('HTTP эсвэл HTTPS холбоос ашиглана уу.');
    return value;
  } catch {
    fail('Зөв холбоос оруулна уу.');
  }
};
export function questions(items, allowEmpty = false) {
  if (!Array.isArray(items) || items.length > 100 || (!allowEmpty && !items.length))
    fail('1–100 асуулт оруулна уу.');
  return items.map((q) => {
    if (!q || typeof q !== 'object') fail('Асуулт буруу.');
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6)
      fail('Асуулт бүр 2–6 хариултын сонголттой байна.');
    const options = q.options.map((o) => text(o, 'Хариулт', 1000));
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length)
      fail('Хариултын сонголтууд ялгаатай байна.');
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= options.length)
      fail('Зөв хариултаа сонгоно уу.');
    if (!['unspecified', 'easy', 'medium', 'hard'].includes(q.difficulty ?? 'unspecified'))
      fail('Хүндрэлийн түвшин буруу.');
    return {
      topic: text(q.topic ?? '', 'Сэдэв', 120, false),
      subtopic: text(q.subtopic ?? '', 'Дэд сэдэв', 120, false),
      difficulty: q.difficulty ?? 'unspecified',
      skill: text(q.skill ?? '', 'Ур чадвар', 120, false),
      source: url(q.source ?? ''),
      id: typeof q.id === 'string' ? q.id : randomUUID(),
      prompt: text(q.prompt, 'Асуулт', 3000),
      options,
      answer: q.answer,
      explanation: text(q.explanation ?? '', 'Тайлбар', 5000, false),
    };
  });
}

export async function contentRoutes(app, auth, { db, save, dataDir }) {
  const uploads = process.env.UPLOAD_DIR || join(dataDir, 'uploads');
  await mkdir(uploads, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploads,
      filename: (_, file, cb) => cb(null, randomUUID() + extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 250 * 1024 * 1024, files: 1, fields: 0 },
    fileFilter: (_, file, cb) => {
      const extension = extname(file.originalname).toLowerCase();
      if (
        !['.mp4', '.webm'].includes(extension) ||
        !['video/mp4', 'video/webm'].includes(file.mimetype)
      )
        return cb(Object.assign(new Error('MP4 эсвэл WebM видео сонгоно уу.'), { status: 400 }));
      cb(null, true);
    },
  });
  app.post('/api/uploads/video', auth, upload.single('video'), async (req, res) => {
    if (!req.file) fail('Видео файл сонгоно уу.');
    const handle = await open(req.file.path, 'r');
    const head = Buffer.alloc(16);
    try {
      await handle.read(head, 0, 16, 0);
    } finally {
      await handle.close();
    }
    const valid = req.file.filename.endsWith('.mp4')
      ? head.toString('ascii', 4, 8) === 'ftyp'
      : head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!valid) {
      await unlink(req.file.path);
      fail('Видео файлын формат буруу.');
    }
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      name: req.file.originalname,
    });
  });
  const imageUpload = multer({
    storage: multer.diskStorage({
      destination: uploads,
      filename: (_, file, cb) => cb(null, randomUUID() + extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 },
    fileFilter: (_, file, cb) => {
      const types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      };
      if (types[extname(file.originalname).toLowerCase()] !== file.mimetype)
        return cb(
          Object.assign(new Error('JPG, PNG эсвэл WebP зураг сонгоно уу.'), { status: 400 }),
        );
      cb(null, true);
    },
  });
  app.post('/api/uploads/image', auth, imageUpload.single('image'), async (req, res) => {
    if (!req.file) fail('Зураг сонгоно уу.');
    const handle = await open(req.file.path, 'r'),
      head = Buffer.alloc(12);
    try {
      await handle.read(head, 0, 12, 0);
    } finally {
      await handle.close();
    }
    const ext = extname(req.file.filename),
      valid =
        ext === '.png'
          ? head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : ext === '.webp'
            ? head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP'
            : head[0] === 255 && head[1] === 216 && head[2] === 255;
    if (!valid) {
      await unlink(req.file.path);
      fail('Зургийн формат буруу.');
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}`, size: req.file.size });
  });
  app.use(
    '/uploads',
    express.static(uploads, {
      dotfiles: 'deny',
      setHeaders: (res) => {
        res.set('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  app.get('/api/tests', auth, async (_, res) => res.json((await db()).tests));
  const testFields = (body, old = {}) => {
    const next = { ...old, ...body };
    const items = questions(next.questionItems);
    if (!['test', 'case'].includes(next.kind ?? 'test')) fail('Тестийн төрөл буруу.');
    if (
      !Array.isArray(next.professions ?? ['Ерөнхий']) ||
      !(next.professions ?? ['Ерөнхий']).length ||
      (next.professions ?? []).some((p) => !professions.includes(p))
    )
      fail('Мэргэжлээ шалгана уу.');
    return {
      premium: bool(next.premium ?? false),
      kind: next.kind ?? 'test',
      professions: next.professions ?? ['Ерөнхий'],
      title: text(next.title, 'Сорилын нэр'),
      category: text(next.category, 'Ангилал'),
      imageUrl: url(next.imageUrl ?? ''),
      active: bool(next.active ?? true),
      questionItems: items,
      questions: items.length,
    };
  };
  app.post('/api/tests', auth, async (req, res) => {
    const data = await db();
    const item = { id: randomUUID(), ...testFields(req.body) };
    data.tests.push(item);
    await save(data);
    res.status(201).json(item);
  });
  app.patch('/api/tests/:id', auth, async (req, res) => {
    const data = await db();
    const item = data.tests.find((t) => t.id === req.params.id);
    if (!item) fail('Сорил олдсонгүй.', 404);
    Object.assign(item, testFields(req.body, item));
    await save(data);
    res.json(item);
  });

  const courseFields = (body, old = {}) => {
    const next = { ...old, ...body };
    const reward = number(next.reward ?? 50, 0, 100000);
    if (!Number.isInteger(reward)) fail('Coin бүхэл тоо байна.');
    return {
      title: text(next.title, 'Курсийн нэр'),
      description: text(next.description ?? '', 'Тайлбар', 5000, false),
      active: bool(next.active ?? true),
      reward,
      premium: bool(next.premium ?? false),
      priceCoins: (() => {
        const price = number(next.priceCoins ?? 100, 1, 100000);
        if (!Number.isInteger(price)) fail('Үнэ бүхэл тоо байна.');
        return price;
      })(),
    };
  };
  app.get('/api/courses', auth, async (_, res) => res.json((await db()).courses));
  app.post('/api/courses', auth, async (req, res) => {
    const data = await db();
    const course = { id: randomUUID(), ...courseFields(req.body), lessons: [] };
    data.courses.push(course);
    await save(data);
    res.status(201).json(course);
  });
  app.patch('/api/courses/:id', auth, async (req, res) => {
    const data = await db();
    const course = data.courses.find((c) => c.id === req.params.id);
    if (!course) fail('Курс олдсонгүй.', 404);
    Object.assign(course, courseFields(req.body, course));
    await save(data);
    res.json(course);
  });
  const getCourse = (data, id) => {
    const c = data.courses.find((c) => c.id === id);
    if (!c) fail('Курс олдсонгүй.', 404);
    c.lessons ??= [];
    return c;
  };
  const lessonFields = (body, old = {}) => {
    const next = { ...old, ...body };
    const items = questions(next.questionItems ?? [], true);
    const videoUrl =
      old.id && body.videoUrl === undefined ? (old.videoUrl ?? '') : url(next.videoUrl ?? '');
    if (!videoUrl && !String(next.description ?? '').trim())
      fail('Видео эсвэл хичээлийн агуулга оруулна уу.');
    return {
      title: text(next.title, 'Дэд курсийн нэр'),
      description: text(next.description ?? '', 'Тайлбар', 5000, false),
      durationMinutes: number(next.durationMinutes, 0.1, 600),
      videoUrl,
      imageUrl:
        old.id && body.imageUrl === undefined ? (old.imageUrl ?? '') : url(next.imageUrl ?? ''),
      questionItems: items,
      quizQuestions: items.length,
    };
  };
  app.post('/api/courses/:id/lessons', auth, async (req, res) => {
    const data = await db();
    const c = getCourse(data, req.params.id);
    const lesson = { id: randomUUID(), ...lessonFields(req.body) };
    c.lessons.push(lesson);
    await save(data);
    res.status(201).json(lesson);
  });
  app.patch('/api/courses/:courseId/lessons/:lessonId', auth, async (req, res) => {
    const data = await db();
    const c = getCourse(data, req.params.courseId);
    const lesson = c.lessons.find((l) => l.id === req.params.lessonId);
    if (!lesson) fail('Дэд курс олдсонгүй.', 404);
    Object.assign(lesson, lessonFields(req.body, lesson));
    await save(data);
    res.json(lesson);
  });
  app.patch('/api/courses/:id/pre-test', auth, async (req, res) => {
    const data = await db(),
      c = getCourse(data, req.params.id);
    c.preTest = {
      title: text(req.body.title, 'Pre-test нэр'),
      questionItems: questions(req.body.questionItems),
    };
    await save(data);
    res.json(c.preTest);
  });
  app.patch('/api/courses/:id/test', auth, async (req, res) => {
    const data = await db();
    const c = getCourse(data, req.params.id);
    const finalTest = {
      title: text(req.body.title, 'Шалгалтын нэр'),
      passPercent: number(req.body.passPercent ?? 80, 1, 100),
      questionItems: questions(req.body.questionItems),
    };
    c.finalTest = finalTest;
    await save(data);
    res.json(finalTest);
  });
}

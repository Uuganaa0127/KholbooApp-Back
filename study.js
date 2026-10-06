import { premiumMember } from './course-access.js';
export const canUseTest = (u, t) => !t.premium || u?.role === 'admin' || premiumMember(u);
import { logEvent, recordAnswers } from './analytics.js';
import { randomUUID, createHash } from 'node:crypto';
export const professions = [
  'Ерөнхий',
  'Дотор өвчин',
  'Хүүхэд',
  'Мэс засал',
  'Яаралтай тусламж',
  'Дүрс оношилгоо',
  'Шүд',
  'Бусад',
];
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const clean = (value, max = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('Текстээ шалгана уу.');
  return value.trim();
};
const fingerprint = (test) =>
  createHash('sha256').update(JSON.stringify(test.questionItems)).digest('hex');
export function studyRoutes(app, { account, admin, read, save, accountView }) {
  const testIn = (d, id) => {
    const t = d.tests.find((t) => t.id === id && t.active && t.questionItems?.length);
    if (!t) fail('Тест олдсонгүй.', 404);
    return t;
  };
  const records = (d, u) => {
    d.practice ??= {};
    return (d.practice[u.id] ??= {});
  };
  app.patch('/api/account/profile', account, async (req, res) => {
    if (!professions.includes(req.body.profession)) fail('Мэргэжлээ сонгоно уу.');
    const d = await read();
    const u = d.users.find((u) => u.id === req.user.id);
    u.profession = req.body.profession;
    await save(d);
    res.json(accountView(d, u));
  });
  const catalog = (d, u) =>
    d.tests
      .filter((t) => t.active && t.questionItems?.length)
      .map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        kind: t.kind || 'test',
        premium: !!t.premium,
        locked: !canUseTest(u, t),
        questionCount: t.questionItems.length,
        professions: t.professions || ['Ерөнхий'],
        version: fingerprint(t),
        questionItems: canUseTest(u, t)
          ? t.questionItems.map(({ id, prompt, options }) => ({ id, prompt, options }))
          : [],
      }));
  app.get('/api/public/practice', async (_, res) => res.json(catalog(await read(), null)));
  app.get('/api/account/practice', account, async (req, res) =>
    res.json(catalog(await read(), req.user)),
  );
  app.post('/api/account/practice/:id/start', account, async (req, res) => {
    const d = await read(),
      t = testIn(d, req.params.id),
      store = records(d, req.user),
      old = store[t.id] || {};
    if (!canUseTest(req.user, t)) fail('Premium гишүүнчлэл шаардлагатай.', 403);
    if (req.body.restart !== undefined && typeof req.body.restart !== 'boolean')
      fail('Төлөв буруу.');
    if (req.body.restart || !old.attemptId || old.version !== fingerprint(t)) {
      store[t.id] = {
        attemptId: randomUUID(),
        version: fingerprint(t),
        answers: [],
        completed: false,
        scorePercent: null,
        bestPercent: old.bestPercent || 0,
        attempts: old.attempts || 0,
        rewarded: old.rewarded || false,
        reviewStage: old.reviewStage || 0,
        nextReviewAt: old.nextReviewAt || null,
        feedback: [],
      };
      logEvent(d, req.user.id, 'practice_start', {
        contentId: t.id,
        attemptId: store[t.id].attemptId,
      });
    }
    await save(d);
    res.json(accountView(d, req.user));
  });
  app.post('/api/account/practice/:id/answer', account, async (req, res) => {
    const d = await read(),
      t = testIn(d, req.params.id),
      p = records(d, req.user)[t.id];
    if (!canUseTest(req.user, t)) fail('Premium гишүүнчлэл шаардлагатай.', 403);
    if (!p || p.attemptId !== req.body.attemptId || p.version !== fingerprint(t))
      fail('Тест шинэчлэгдсэн байна. Дахин эхлүүлнэ үү.', 409);
    if (p.completed) return res.json(accountView(d, req.user));
    const answers = req.body.answers;
    if (JSON.stringify(answers) === JSON.stringify(p.answers))
      return res.json(accountView(d, req.user));
    if (
      !Array.isArray(answers) ||
      answers.length !== p.answers.length + 1 ||
      answers.length > t.questionItems.length ||
      answers.some(
        (a, i) => !Number.isInteger(a) || a < 0 || a >= t.questionItems[i].options.length,
      ) ||
      p.answers.some((a, i) => a !== answers[i])
    )
      fail('Хариултын дараалал буруу.', 409);
    const index = answers.length - 1,
      q = t.questionItems[index];
    recordAnswers(d, req.user.id, {
      scope: 'practice',
      contentId: t.id,
      attemptId: p.attemptId,
      questions: [q],
      answers: [answers[index]],
      topic: t.category,
      durationMs: req.body.durationMs,
      startIndex: index,
    });
    p.feedback ??= [];
    p.feedback.push({
      prompt: q.prompt,
      correct: answers[index] === q.answer,
      answer: q.options[q.answer],
      explanation: q.explanation,
      topic: q.topic || t.category,
      source: q.source || '',
    });
    p.answers = answers;
    if (answers.length === t.questionItems.length) {
      p.completed = true;
      logEvent(d, req.user.id, 'practice_complete', { contentId: t.id, attemptId: p.attemptId });
      p.attempts++;
      p.scorePercent = Math.round(
        (100 * t.questionItems.filter((q, i) => q.answer === answers[i]).length) /
          t.questionItems.length,
      );
      p.bestPercent = Math.max(p.bestPercent, p.scorePercent);
      const due = !p.nextReviewAt || Date.parse(p.nextReviewAt) <= Date.now();
      if (p.scorePercent < 80) p.reviewStage = 0;
      else if (due) p.reviewStage = Math.min(3, (p.reviewStage || 0) + 1);
      const days = p.scorePercent < 80 ? 1 : [3, 7, 30][Math.max(0, p.reviewStage - 1)];
      if (due || p.scorePercent < 80)
        p.nextReviewAt = new Date(Date.now() + days * 86400000).toISOString();
      if (!p.rewarded) {
        const u = d.users.find((u) => u.id === req.user.id);
        u.xp = (u.xp || 0) + 20;
        req.user.xp = u.xp;
        p.rewarded = true;
      }
    }
    await save(d);
    res.json(accountView(d, req.user));
  });
  const surveyView = (s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    questions: s.questions,
    active: s.active,
  });
  app.get('/api/public/surveys', async (_, res) =>
    res.json(((await read()).surveys || []).filter((s) => s.active).map(surveyView)),
  );
  app.get('/api/surveys', admin, async (_, res) => {
    const d = await read();
    res.json(
      (d.surveys || []).map((s) => {
        const responses = (d.surveyResponses || []).filter((r) => r.surveyId === s.id);
        return {
          ...surveyView(s),
          responseCount: responses.length,
          averages: s.questions.map((_, i) =>
            responses.length
              ? Number(
                  (responses.reduce((sum, r) => sum + r.answers[i], 0) / responses.length).toFixed(
                    1,
                  ),
                )
              : null,
          ),
        };
      }),
    );
  });
  const surveyFields = (b, old = {}) => {
    const n = { ...old, ...b };
    if (typeof n.active !== 'boolean') fail('Төлөв буруу.');
    if (!Array.isArray(n.questions) || !n.questions.length || n.questions.length > 10)
      fail('1–10 асуулт оруулна уу.');
    return {
      title: clean(n.title, 200),
      description: clean(n.description || '1–5 оноогоор үнэлнэ үү.', 2000),
      questions: n.questions.map((q) => clean(q, 500)),
      active: n.active,
    };
  };
  app.post('/api/surveys', admin, async (req, res) => {
    const d = await read();
    d.surveys ??= [];
    const s = { id: randomUUID(), ...surveyFields(req.body) };
    d.surveys.push(s);
    await save(d);
    res.status(201).json(surveyView(s));
  });
  app.patch('/api/surveys/:id', admin, async (req, res) => {
    const d = await read(),
      s = (d.surveys || []).find((s) => s.id === req.params.id);
    if (!s) fail('Судалгаа олдсонгүй.', 404);
    const next = surveyFields(req.body, s);
    if (
      (d.surveyResponses || []).some((r) => r.surveyId === s.id) &&
      JSON.stringify(s.questions) !== JSON.stringify(next.questions)
    )
      fail('Хариулттай судалгааны асуултыг өөрчлөх боломжгүй. Шинэ судалгаа үүсгэнэ үү.', 409);
    Object.assign(s, next);
    await save(d);
    res.json(surveyView(s));
  });
  app.post('/api/account/surveys/:id', account, async (req, res) => {
    const d = await read(),
      s = (d.surveys || []).find((s) => s.id === req.params.id && s.active);
    if (!s) fail('Судалгаа олдсонгүй.', 404);
    const answers = req.body.answers;
    if (
      !Array.isArray(answers) ||
      answers.length !== s.questions.length ||
      answers.some((a) => !Number.isInteger(a) || a < 1 || a > 5)
    )
      fail('Асуулт бүрт 1–5 оноо өгнө үү.');
    d.surveyResponses ??= [];
    if (!d.surveyResponses.some((r) => r.surveyId === s.id && r.userId === req.user.id)) {
      d.surveyResponses.push({
        surveyId: s.id,
        userId: req.user.id,
        answers,
        createdAt: new Date().toISOString(),
      });
      await save(d);
    }
    res.json(accountView(d, req.user));
  });
}

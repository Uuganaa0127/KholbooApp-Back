import { createHash, randomUUID } from 'node:crypto';
export const versionOf = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);
export const percent = (n, d) => (d ? Math.round((n / d) * 100) : null);
export function logEvent(d, userId, type, details = {}, id = randomUUID()) {
  d.learningEvents ??= [];
  if (d.learningEvents.some((e) => e.userId === userId && e.id === id)) return;
  d.analyticsStartedAt ??= new Date().toISOString();
  d.learningEvents.push({ id, userId, type, at: new Date().toISOString(), ...details });
}
export function recordAnswers(
  d,
  userId,
  { scope, contentId, attemptId, questions, answers, topic, durationMs = null, startIndex = 0 },
) {
  questions.forEach((q, i) => {
    const index = i + startIndex;
    logEvent(
      d,
      userId,
      'answer',
      {
        scope,
        contentId,
        attemptId,
        questionId: q.id || String(index),
        version: versionOf(q),
        prompt: q.prompt,
        topic: q.topic || topic || 'Ангилаагүй',
        selected: answers[i],
        correct: answers[i] === q.answer,
        correctAnswer: q.answer,
        optionCount: q.options.length,
        durationMs:
          Number.isInteger(durationMs) && durationMs >= 0 && durationMs <= 1800000
            ? durationMs
            : null,
      },
      `${attemptId}:${index}`,
    );
  });
}
export function learningPlan(d, userId, now = Date.now()) {
  const latest = new Map();
  for (const a of d.learningEvents || []) {
    if (a.userId !== userId || a.type !== 'answer' || a.scope !== 'practice') continue;
    const test = d.tests.find((t) => t.id === a.contentId && t.active);
    if (!test?.questionItems?.some((q) => q.id === a.questionId && versionOf(q) === a.version))
      continue;
    latest.set(`${a.contentId}:${a.questionId}`, a);
  }
  const topics = new Map();
  for (const a of latest.values()) {
    const t = topics.get(a.topic) || { topic: a.topic, total: 0, correct: 0, testIds: new Set() };
    t.total++;
    t.correct += Number(a.correct);
    t.testIds.add(a.contentId);
    topics.set(a.topic, t);
  }
  const weak = [...topics.values()]
    .filter((t) => t.correct < t.total)
    .map((t) => ({ ...t, accuracy: percent(t.correct, t.total), testIds: [...t.testIds] }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);
  const due = Object.entries(d.practice?.[userId] || {})
    .filter(
      ([id, p]) =>
        p.nextReviewAt &&
        Date.parse(p.nextReviewAt) <= now &&
        d.tests.some((t) => t.id === id && t.active),
    )
    .map(([id, p]) => ({
      id,
      title: d.tests.find((t) => t.id === id).title,
      nextReviewAt: p.nextReviewAt,
    }));
  return { weak, due };
}
export function analyticsReport(d, now = Date.now()) {
  const events = (d.learningEvents || []).filter((e) => Date.parse(e.at) >= now - 30 * 86400000),
    seen = new Set();
  const answers = events.filter((e) => {
    if (e.type !== 'answer') return false;
    const key = [e.userId, e.scope, e.contentId, e.questionId, e.version].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const qs = new Map(),
    topics = new Map();
  for (const a of answers) {
    const key = [a.scope, a.contentId, a.questionId, a.version].join(':');
    const q = qs.get(key) || {
      id: key,
      prompt: a.prompt,
      topic: a.topic,
      scope: a.scope,
      n: 0,
      correct: 0,
      times: [],
      choices: Array(a.optionCount).fill(0),
      correctAnswer: a.correctAnswer,
    };
    q.n++;
    q.correct += Number(a.correct);
    if (a.durationMs !== null) q.times.push(a.durationMs);
    q.choices[a.selected]++;
    qs.set(key, q);
    const t = topics.get(a.topic) || { topic: a.topic, n: 0, correct: 0 };
    t.n++;
    t.correct += Number(a.correct);
    topics.set(a.topic, t);
  }
  const questions = [...qs.values()]
    .map(({ times, ...q }) => ({
      ...q,
      accuracy: percent(q.correct, q.n),
      seconds: times.length
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 1000)
        : null,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
  const courses = d.courses.map((c) => {
    const ps = Object.values(d.progress || {})
        .map((p) => p[c.id])
        .filter(Boolean),
      paired = ps.filter(
        (p) =>
          p.preTest &&
          p.firstPost &&
          p.preTest.version === versionOf(c.preTest?.questionItems) &&
          p.firstPost.version === versionOf(c.finalTest?.questionItems) &&
          p.firstPost.preVersion === p.preTest.version,
      );
    return {
      id: c.id,
      title: c.title,
      started: ps.length,
      completed: ps.filter((p) => p.completed).length,
      completion: percent(ps.filter((p) => p.completed).length, ps.length),
      paired: paired.length,
      improvement: paired.length
        ? Math.round(
            paired.reduce((n, p) => n + p.firstPost.percent - p.preTest.percent, 0) / paired.length,
          )
        : null,
      lessons: (c.lessons || []).map((l) => ({
        title: l.title,
        completed: ps.filter((p) => p.lessons.includes(l.id)).length,
      })),
    };
  });
  const starts = events.filter((e) => e.type === 'practice_start'),
    ends = new Set(events.filter((e) => e.type === 'practice_complete').map((e) => e.attemptId)),
    features = {};
  for (const e of events.filter((e) => ['screen_view', 'button_click'].includes(e.type)))
    features[e.target] = (features[e.target] || 0) + 1;
  const insights = [];
  for (const q of questions) {
    if (q.n < 5) continue;
    if (q.accuracy < 40 || q.accuracy > 95)
      insights.push(
        `${q.prompt}: ${q.n} суралцагчийн ${q.accuracy}% зөв. Агуулга, хүндрэлийг хянана уу.`,
      );
    const wrong = Math.max(0, ...q.choices.filter((_, i) => i !== q.correctAnswer));
    if (wrong / q.n >= 0.6)
      insights.push(`${q.prompt}: ${percent(wrong, q.n)}% нь ижил буруу хариулт сонгосон.`);
  }
  const previous = new Set(
      (d.learningEvents || [])
        .filter(
          (e) => Date.parse(e.at) >= now - 60 * 86400000 && Date.parse(e.at) < now - 30 * 86400000,
        )
        .map((e) => e.userId),
    ),
    active = new Set(events.map((e) => e.userId));
  return {
    startedAt: d.analyticsStartedAt || null,
    active: active.size,
    previousActive: previous.size,
    returnRate: percent([...previous].filter((id) => active.has(id)).length, previous.size),
    accuracy: percent(answers.filter((a) => a.correct).length, answers.length),
    questions,
    topics: [...topics.values()].map((t) => ({ ...t, accuracy: percent(t.correct, t.n) })),
    courses,
    insights: insights.slice(0, 10),
    features: Object.entries(features).map(([name, count]) => ({ name, count })),
    searches: events.filter((e) => e.type === 'search').length,
    emptySearches: events.filter((e) => e.type === 'search' && e.resultCount === 0).length,
    funnel: {
      started: starts.length,
      completed: starts.filter((e) => ends.has(e.attemptId)).length,
      pending: starts.filter((e) => !ends.has(e.attemptId) && Date.parse(e.at) < now - 86400000)
        .length,
    },
  };
}
export function analyticsRoutes(app, { account, admin, read, save }) {
  app.get('/api/analytics', admin, async (_, res) => res.json(analyticsReport(await read())));
  app.post('/api/account/events', account, async (req, res) => {
    const { id, type, target, resultCount } = req.body;
    if (
      typeof id !== 'string' ||
      !/^[a-zA-Z0-9-]{8,100}$/.test(id) ||
      !['screen_view', 'button_click', 'search'].includes(type) ||
      ![
        'home',
        'courses',
        'tests',
        'cases',
        'profile',
        'practice_search',
        'all',
        'recommended',
        'review',
        'test',
        'case',
        'game',
        'survey',
      ].includes(target) ||
      (type === 'search' &&
        (!Number.isInteger(resultCount) || resultCount < 0 || resultCount > 100000))
    )
      return res.status(400).json({ error: 'Invalid event.' });
    const d = await read();
    if (
      (d.learningEvents || []).filter(
        (e) => e.userId === req.user.id && Date.parse(e.at) > Date.now() - 60000,
      ).length >= 120
    )
      return res.status(429).json({ error: 'Too many events.' });
    logEvent(d, req.user.id, type, { target, ...(type === 'search' ? { resultCount } : {}) }, id);
    await save(d);
    res.status(202).json({ ok: true });
  });
}

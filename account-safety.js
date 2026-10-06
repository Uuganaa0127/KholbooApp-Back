import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const text = (v, max) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    fail('Required text is missing or too long.');
  return v.trim();
};
export const blocked = (d, a, b) =>
  (d.blocks || []).some(
    (x) => (x.userId === a && x.targetId === b) || (x.userId === b && x.targetId === a),
  );
const registrations = new Map();
export function safetyRoutes(app, { account, admin, read, save, userFields }) {
  app.post('/api/account/register', async (req, res) => {
    const now = Date.now();
    for (const [ip, v] of registrations) if (v.until < now) registrations.delete(ip);
    const key = req.ip || 'unknown',
      bucket = registrations.get(key) || { count: 0, until: now + 3600000 };
    bucket.count++;
    registrations.set(key, bucket);
    if (bucket.count > 20) fail('Too many registration attempts. Try again later.', 429);
    if (req.body.consent !== true) fail('Accept the privacy notice and community rules.');
    const d = await read();
    const u = {
      id: randomUUID(),
      xp: 0,
      ...(await userFields(
        {
          name: req.body.name,
          email: req.body.email,
          password: req.body.password,
          profession: req.body.profession ?? 'Ерөнхий',
          role: 'learner',
          memberLevel: 'bronze',
          paymentStatus: 'unpaid',
          active: true,
        },
        {},
        d,
      )),
      consentVersion: '2026-10-05',
      consentedAt: new Date().toISOString(),
    };
    d.users.push(u);
    await save(d);
    res.status(201).json({ ok: true });
  });
  const policy = (d) => ({
    operator: process.env.LEGAL_OPERATOR || '',
    supportEmail: process.env.SUPPORT_EMAIL || '',
    privacyEmail: process.env.PRIVACY_EMAIL || process.env.SUPPORT_EMAIL || '',
    privacyUrl: process.env.PRIVACY_URL || '',
    retention: '',
    ...d.policy,
    version: '2026-10-05',
  });
  app.get('/api/public/policy', async (_, res) => res.json(policy(await read())));
  app.get('/api/policy', admin, async (_, res) => res.json(policy(await read())));
  app.patch('/api/policy', admin, async (req, res) => {
    const b = req.body;
    for (const key of ['supportEmail', 'privacyEmail'])
      if (typeof b[key] !== 'string' || !/^\S+@\S+\.\S+$/.test(b[key]) || b[key].length > 254)
        fail('Enter a valid contact email.');
    if (b.privacyUrl && !/^https:\/\//.test(b.privacyUrl)) fail('Use an HTTPS policy URL.');
    const d = await read();
    d.policy = {
      operator: text(b.operator, 200),
      supportEmail: b.supportEmail,
      privacyEmail: b.privacyEmail,
      privacyUrl: b.privacyUrl || '',
      retention: text(b.retention, 3000),
    };
    await save(d);
    res.json(policy(d));
  });
  app.post('/api/account/delete', account, async (req, res) => {
    if (req.user.role === 'admin')
      fail('Admin accounts must be transferred or removed by another administrator.', 403);
    if (
      req.body.confirmation !== 'DELETE' ||
      !(await bcrypt.compare(String(req.body.password || ''), req.user.passwordHash))
    )
      fail('Confirm deletion with your current password.');
    const d = await read(),
      id = req.user.id;
    d.users = d.users.filter((u) => u.id !== id);
    for (const key of ['progress', 'purchases', 'practice']) if (d[key]) delete d[key][id];
    for (const key of ['ledger', 'learningEvents', 'surveyResponses'])
      d[key] = (d[key] || []).filter((x) => x.userId !== id);
    d.assessments = (d.assessments || []).filter((x) => x.doctorId !== id);
    d.discussions = (d.discussions || [])
      .filter((p) => p.ownerId !== id)
      .map((p) => {
        const keep = (p.replies || []).map((_, i) => i).filter((i) => p.replyOwners?.[i] !== id);
        return {
          ...p,
          replies: keep.map((i) => p.replies[i]),
          replyOwners: keep.map((i) => p.replyOwners?.[i] || null),
        };
      });
    d.blocks = (d.blocks || []).filter((x) => x.userId !== id && x.targetId !== id);
    d.reports = (d.reports || []).filter((x) => x.reporterId !== id && x.targetId !== id);
    await save(d);
    res.json({ ok: true });
  });
  const target = (d, req) => {
    const p = d.discussions.find((p) => p.id === req.body.postId && !p.hidden);
    if (!p) fail('Discussion not found.', 404);
    const index = req.body.replyIndex;
    if (index !== undefined && (!Number.isInteger(index) || index < 0 || index >= p.replies.length))
      fail('Reply not found.', 404);
    return { p, targetId: index === undefined ? p.ownerId : p.replyOwners?.[index] };
  };
  app.post('/api/account/reports', account, async (req, res) => {
    const d = await read(),
      { p, targetId } = target(d, req);
    const reason = text(req.body.reason, 2000);
    d.reports ??= [];
    if (
      !d.reports.some(
        (r) =>
          r.reporterId === req.user.id &&
          r.postId === p.id &&
          r.replyIndex === req.body.replyIndex &&
          r.status === 'open',
      )
    )
      d.reports.push({
        id: randomUUID(),
        reporterId: req.user.id,
        targetId: targetId || null,
        postId: p.id,
        replyIndex: req.body.replyIndex,
        reason,
        content: req.body.replyIndex === undefined ? p.body : p.replies[req.body.replyIndex],
        status: 'open',
        createdAt: new Date().toISOString(),
      });
    await save(d);
    res.status(201).json({ ok: true });
  });
  app.post('/api/account/blocks', account, async (req, res) => {
    const d = await read(),
      { targetId } = target(d, req);
    if (!targetId) fail('This legacy reply has no linked account. Please report it instead.');
    if (targetId === req.user.id) fail('You cannot block yourself.');
    d.blocks ??= [];
    if (!d.blocks.some((b) => b.userId === req.user.id && b.targetId === targetId))
      d.blocks.push({
        id: randomUUID(),
        userId: req.user.id,
        targetId,
        createdAt: new Date().toISOString(),
      });
    await save(d);
    res.json({ ok: true });
  });
  app.get('/api/account/blocks', account, async (req, res) =>
    res.json(
      ((await read()).blocks || [])
        .filter((b) => b.userId === req.user.id)
        .map(({ id, createdAt }) => ({ id, createdAt })),
    ),
  );
  app.post('/api/account/blocks/:id/remove', account, async (req, res) => {
    const d = await read();
    d.blocks = (d.blocks || []).filter(
      (b) => !(b.id === req.params.id && b.userId === req.user.id),
    );
    await save(d);
    res.json({ ok: true });
  });
  app.get('/api/reports', admin, async (_, res) => {
    const d = await read();
    res.json(
      (d.reports || []).map((r) => ({
        ...r,
        post: d.discussions.find((p) => p.id === r.postId) || null,
      })),
    );
  });
  app.patch('/api/reports/:id', admin, async (req, res) => {
    const d = await read(),
      r = (d.reports || []).find((r) => r.id === req.params.id);
    if (!r) fail('Report not found.', 404);
    if (!['reviewed', 'dismissed', 'hide', 'suspend'].includes(req.body.action))
      fail('Choose an action.');
    const p = d.discussions.find((p) => p.id === r.postId);
    if (req.body.action === 'hide' && p) p.hidden = true;
    if (req.body.action === 'suspend') {
      const u = d.users.find((u) => u.id === r.targetId);
      if (!u || u.role === 'admin') fail('Cannot suspend this account.');
      u.active = false;
    }
    r.status = req.body.action;
    r.reviewedAt = new Date().toISOString();
    r.reviewedBy = req.admin.id;
    await save(d);
    res.json({ ok: true });
  });
}

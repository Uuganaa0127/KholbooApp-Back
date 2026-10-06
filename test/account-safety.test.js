import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
test('registration privileges, report moderation, anonymous blocking, deletion and revoked tokens', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ym-safety-')),
    password = randomBytes(16).toString('hex');
  const child = spawn(process.execPath, ['src.js'], {
    env: {
      ...process.env,
      PORT: '4197',
      DATA_DIR: dir,
      ADMIN_EMAIL: 'admin@example.test',
      ADMIN_PASSWORD: password,
      JWT_SECRET: randomBytes(40).toString('hex'),
    },
    stdio: 'pipe',
  });
  const api = async (path, token, body, method = 'POST') => {
    const r = await fetch('http://127.0.0.1:4197/api' + path, {
      method: body ? method : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await api('/health')).status === 200) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const admin = (await api('/auth/login', null, { email: 'admin@example.test', password })).data
      .token;
    const register = async (name) => {
      assert.equal(
        (
          await api('/account/register', null, {
            name,
            email: name + '@example.test',
            password,
            consent: true,
            role: 'admin',
            memberLevel: 'premium',
            paymentStatus: 'paid',
          })
        ).status,
        201,
      );
      return (await api('/account/login', null, { email: name + '@example.test', password })).data;
    };
    assert.equal(
      (
        await api('/account/register', null, {
          name: 'bad',
          email: 'bad@example.test',
          password,
          consent: false,
        })
      ).status,
      400,
    );
    const a = await register('alice'),
      b = await register('bob');
    assert.equal(a.user.role, 'learner');
    assert.equal(a.user.memberLevel, 'bronze');
    assert.equal(
      (
        await api('/account/register', null, {
          name: 'alice',
          email: 'ALICE@example.test',
          password,
          consent: true,
        })
      ).status,
      409,
    );
    const policy = {
      operator: 'Test Organization',
      supportEmail: 'support@example.test',
      privacyEmail: 'privacy@example.test',
      privacyUrl: 'https://example.test/privacy',
      retention: 'Test retention policy',
    };
    assert.equal((await api('/policy', a.token, policy, 'PATCH')).status, 403);
    assert.equal((await api('/policy', admin, policy, 'PATCH')).status, 200);
    assert.equal((await api('/public/policy')).data.operator, 'Test Organization');
    const categoryId = (await api('/public/categories')).data.find((c) => c.active).id;
    const post = (
      await api('/account/discussions', b.token, {
        title: 'Anonymous',
        body: 'Example',
        anonymous: true,
        categoryId,
      })
    ).data;
    assert.equal(post.author, null);
    assert.equal(post.ownerId, undefined);
    await api('/account/discussions/' + post.id, a.token, { reply: 'Reply' }, 'PATCH');
    await api('/account/reports', a.token, { postId: post.id, reason: 'Please review' });
    assert.equal((await api('/reports', a.token)).status, 403);
    const reports = (await api('/reports', admin)).data;
    assert.equal(reports.length, 1);
    await api('/account/blocks', a.token, { postId: post.id });
    assert.equal((await api('/account/discussions', a.token)).data.length, 0);
    assert.equal(
      (await api('/account/discussions/' + post.id, a.token, { reply: 'Blocked' }, 'PATCH')).status,
      403,
    );
    const block = (await api('/account/blocks', a.token)).data[0];
    assert.equal(block.targetId, undefined);
    await api('/account/blocks/' + block.id + '/remove', a.token, {});
    assert.equal((await api('/account/discussions', a.token)).data.length, 1);
    await api('/reports/' + reports[0].id, admin, { action: 'hide' }, 'PATCH');
    assert.equal((await api('/account/discussions', b.token)).data.length, 0);
    assert.equal(
      (await api('/account/delete', a.token, { password: 'wrong', confirmation: 'DELETE' })).status,
      400,
    );
    await api(
      '/users/' + a.user.id,
      admin,
      { memberLevel: 'premium', paymentStatus: 'unpaid' },
      'PATCH',
    );
    assert.equal((await api('/account/me', a.token)).data.user.memberLevel, 'premium');
    assert.equal(
      (await api('/account/delete', a.token, { password, confirmation: 'DELETE' })).status,
      200,
    );
    assert.equal((await api('/account/me', a.token)).status, 401);
    assert.equal(
      (await api('/account/login', null, { email: 'alice@example.test', password })).status,
      401,
    );
    const stored = JSON.parse(await readFile(join(dir, 'db.json')));
    assert.ok(!JSON.stringify(stored).includes(a.user.id));
    assert.equal(stored.discussions[0].replies.length, 0);
  } finally {
    if (child.exitCode === null)
      await new Promise((r) => {
        child.once('exit', r);
        child.kill();
      });
    await rm(dir, { recursive: true, force: true });
  }
});

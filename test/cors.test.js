import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

test('local preview preflight works with deployed origin settings, unknown origins stay blocked', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'youth-cors-'));
  const env = {
    ...process.env,
    PORT: '4198',
    HOST: '127.0.0.1',
    DATA_DIR: dir,
    JWT_SECRET: randomBytes(32).toString('hex'),
    ADMIN_PASSWORD: randomBytes(16).toString('hex'),
    ALLOWED_ORIGINS: ' https://youthhealthpf.mn ',
  };
  delete env.ADDITIONAL_ALLOWED_ORIGINS;
  const child = spawn(process.execPath, ['src.js'], {
    cwd: new URL('../', import.meta.url),
    env,
    stdio: 'pipe',
  });
  const base = 'http://127.0.0.1:4198/api';
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base + '/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'server starts');
    for (const origin of ['http://127.0.0.1:5181', 'https://youthhealthpf.mn']) {
      const preflight = await fetch(base + '/account/login', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization',
        },
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/i);
      assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
      const protectedResponse = await fetch(base + '/account/me', { headers: { Origin: origin } });
      assert.equal(protectedResponse.status, 401);
      assert.equal(protectedResponse.headers.get('access-control-allow-origin'), origin);
    }
    const blocked = await fetch(base + '/health', {
      headers: { Origin: 'https://untrusted.example' },
    });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  } finally {
    if (child.exitCode === null)
      await new Promise((resolve) => {
        child.once('exit', resolve);
        child.kill();
      });
    await rm(dir, { recursive: true, force: true });
  }
});

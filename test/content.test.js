import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

test('course, lesson, answers, uploads, edits and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'youth-categories-'));
  const port = 4193,
    password = randomBytes(16).toString('hex');
  let child;
  async function start() {
    child = spawn(process.execPath, ['src.js'], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: directory,
        UPLOAD_DIR: join(directory, 'media'),
        ADMIN_EMAIL: 'test@example.test',
        ADMIN_PASSWORD: password,
        JWT_SECRET: randomBytes(32).toString('hex'),
      },
      stdio: 'pipe',
    });
    let output = '';
    child.stderr.on('data', (chunk) => (output += chunk));
    for (let i = 0; i < 60; i++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (r.ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Server failed to start ' + output);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      await new Promise((resolve) => {
        child.once('exit', resolve);
        child.kill();
      });
    }
  }
  const api = async (path, method = 'GET', body, token) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    await start();
    const login = await api('/auth/login', 'POST', { email: 'test@example.test', password });
    const token = login.data.token;
    const question = {
      prompt: 'Choose B',
      options: ['A', 'B', 'C'],
      answer: 1,
      explanation: 'B is correct.',
    };
    assert.equal((await api('/tests', 'POST', { title: 'No auth' })).status, 401);
    assert.equal(
      (
        await api(
          '/tests',
          'POST',
          { title: 'Bad', category: 'Ерөнхий', questionItems: [{ ...question, answer: 5 }] },
          token,
        )
      ).status,
      400,
    );
    const created = await api(
      '/tests',
      'POST',
      { title: 'Practice', category: 'Ерөнхий', questionItems: [question] },
      token,
    );
    assert.equal(created.status, 201);
    const edited = await api(
      `/tests/${created.data.id}`,
      'PATCH',
      { title: 'Practice edited', questionItems: [{ ...question, answer: 2 }] },
      token,
    );
    assert.equal(edited.data.questionItems[0].answer, 2);
    assert.equal(edited.data.questions, 1);
    const oldCourse = (await api('/courses', 'GET', undefined, token)).data[0];
    const oldEdited = await api(
      `/courses/${oldCourse.id}`,
      'PATCH',
      { title: 'Old course edited' },
      token,
    );
    assert.equal(oldEdited.status, 200);
    assert.equal(oldEdited.data.lessons.length, oldCourse.lessons.length);
    const course = await api(
      '/courses',
      'POST',
      { title: 'New course', description: 'Description', reward: 70 },
      token,
    );
    assert.equal(course.status, 201);
    const id = course.data.id;
    const upload = async (data, type, name, authorize = true) => {
      const form = new FormData();
      form.append('video', new Blob([data], { type }), name);
      return fetch(`http://127.0.0.1:${port}/api/uploads/video`, {
        method: 'POST',
        headers: authorize ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
    };
    assert.equal((await upload('bad', 'video/mp4', 'bad.mp4', false)).status, 401);
    assert.equal((await upload('bad', 'video/mp4', 'bad.mp4')).status, 400);
    const bytes = await readFile(new URL('./fixtures/upload.mp4', import.meta.url));
    const uploaded = await upload(bytes, 'video/mp4', 'flower.mp4');
    assert.equal(uploaded.status, 201);
    const video = (await uploaded.json()).url;

    const uploadImage = async (bytes, type = 'image/png', name = 'story.png', authorize = true) => {
      const form = new FormData();
      form.append('image', new Blob([bytes], { type }), name);
      return fetch(`http://127.0.0.1:${port}/api/uploads/image`, {
        method: 'POST',
        headers: authorize ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
    };
    assert.equal((await uploadImage('invalid')).status, 400);
    assert.equal((await uploadImage('invalid', 'image/svg+xml', 'bad.svg')).status, 400);
    assert.equal((await uploadImage('invalid', 'image/png', 'x.png', false)).status, 401);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuoAAAAASUVORK5CYII=',
      'base64',
    );
    const imageResponse = await uploadImage(png);
    assert.equal(imageResponse.status, 201);
    const image = (await imageResponse.json()).url;
    assert.equal((await fetch(`http://127.0.0.1:${port}${image}`)).status, 200);
    const story = await api(
      '/stories',
      'POST',
      {
        label: 'Image',
        title: 'Uploaded',
        body: 'Body',
        imageUrl: image,
        published: true,
        order: 0,
      },
      token,
    );
    assert.equal(story.status, 201);
    assert.equal((await api('/public/stories')).data[0].imageUrl, image);
    await api(`/stories/${story.data.id}`, 'PATCH', { expiresAt: '2020-01-01T00:00:00Z' }, token);
    assert.equal((await api('/public/stories')).data.length, 0);
    const range = await fetch(`http://127.0.0.1:${port}${video}`, {
      headers: { Range: 'bytes=0-15' },
    });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 16);
    const lessons = await Promise.all(
      ['Lesson one', 'Lesson two'].map((title) =>
        api(
          `/courses/${id}/lessons`,
          'POST',
          { title, durationMinutes: 10, videoUrl: video, questionItems: [question] },
          token,
        ),
      ),
    );
    assert.ok(lessons.every((l) => l.status === 201));
    const lessonEdit = await api(
      `/courses/${id}/lessons/${lessons[0].data.id}`,
      'PATCH',
      { title: 'Lesson edited', questionItems: [{ ...question, answer: 0 }] },
      token,
    );
    assert.equal(lessonEdit.data.questionItems[0].answer, 0);
    assert.equal(lessonEdit.data.videoUrl, video);
    const exam = await api(
      `/courses/${id}/test`,
      'PATCH',
      { title: 'Final exam', passPercent: 80, questionItems: [question] },
      token,
    );
    assert.equal(exam.status, 200);
    assert.equal(
      (await api(`/courses/${id}/test`, 'PATCH', { title: 'Empty', questionItems: [] }, token))
        .status,
      400,
    );
    await stop();
    await start();
    const again = await api('/auth/login', 'POST', { email: 'test@example.test', password });
    const persisted = (await api('/courses', 'GET', undefined, again.data.token)).data.find(
      (c) => c.id === id,
    );
    assert.equal(persisted.lessons.length, 2);
    assert.equal(persisted.finalTest.questionItems[0].answer, 1);
    assert.equal(persisted.lessons[0].title, 'Lesson edited');
    assert.equal((await fetch(`http://127.0.0.1:${port}${video}`)).status, 200);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

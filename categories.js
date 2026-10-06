import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const initialCategories = [
  ['general', 'Ерөнхий', '#176BFF'],
  ['internal', 'Дотор өвчин', '#088E88'],
  ['children', 'Хүүхэд', '#8261C6'],
  ['emergency', 'Яаралтай тусламж', '#E16C50'],
  ['other', 'Бусад', '#64748B'],
  ['medication', 'Эмийн аюулгүй байдал', '#9F6926'],
].map(([id, name, color], order) => ({ id, name, color, order, active: true, aliases: [] }));
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export async function categoryStore(path) {
  await mkdir(dirname(path), { recursive: true });
  let items;
  try {
    items = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    items = structuredClone(initialCategories);
    await writeFile(path, JSON.stringify(items, null, 2));
  }
  let queue = Promise.resolve();
  const mutate = (fn) => {
    const operation = queue.then(async () => {
      const next = structuredClone(items);
      const result = fn(next);
      await writeFile(`${path}.tmp`, JSON.stringify(next, null, 2));
      await rename(`${path}.tmp`, path);
      items = next;
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  };
  function validate(body, existing, all) {
    const name = body.name ?? existing?.name;
    const color = body.color ?? existing?.color ?? '#176BFF';
    const active = body.active ?? existing?.active ?? true;
    const order = body.order ?? existing?.order ?? all.length;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60)
      throw bad('Нэр 1–60 тэмдэгт байна.');
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
      throw bad('Өнгө #RRGGBB хэлбэртэй байна.');
    if (typeof active !== 'boolean' || !Number.isInteger(order) || order < 0 || order > 9999)
      throw bad('Төлөв эсвэл дараалал буруу.');
    if (
      all.some(
        (c) =>
          c.id !== existing?.id &&
          [c.name, ...(c.aliases || [])].some((n) => n.toLowerCase() === name.trim().toLowerCase()),
      )
    )
      throw bad('Энэ нэртэй ангилал байна.', 409);
    return { name: name.trim(), color, active, order };
  }
  return {
    list: () =>
      structuredClone(items).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    create: (body) =>
      mutate((all) => {
        const item = { id: randomUUID(), ...validate(body, null, all), aliases: [] };
        all.push(item);
        return item;
      }),
    update: (id, body) =>
      mutate((all) => {
        const item = all.find((c) => c.id === id);
        if (!item) throw bad('Ангилал олдсонгүй.', 404);
        const changes = validate(body, item, all);
        if (changes.name !== item.name)
          item.aliases = [...new Set([...(item.aliases || []), item.name])];
        Object.assign(item, changes);
        return item;
      }),
  };
}

export function categoryRoutes(app, auth, store) {
  app.get('/api/public/categories', (_, res) =>
    res.set('Cache-Control', 'no-store').json(store.list()),
  );
  app.get('/api/categories', auth, (_, res) => res.json(store.list()));
  app.post('/api/categories', auth, async (req, res) =>
    res.status(201).json(await store.create(req.body)),
  );
  app.patch('/api/categories/:id', auth, async (req, res) =>
    res.json(await store.update(req.params.id, req.body)),
  );
}

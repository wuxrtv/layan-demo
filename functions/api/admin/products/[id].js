// PUT    /api/admin/products/:id — сохранить товар
// PATCH  /api/admin/products/:id — только показать/скрыть ({ active })
// DELETE /api/admin/products/:id — удалить товар
import { json, fail, handle, readJson } from '../../../../lib/http.js';
import { sanitizeProduct } from '../../../../lib/store.js';
import { pruneImages } from '../../../../lib/usage.js';

const prune = (ctx) => ctx.waitUntil(pruneImages(ctx.env).catch((e) => console.error('prune images', e)));

const exists = (db, id) => db.prepare('SELECT 1 FROM products WHERE id = ?1').bind(id).first();

export const onRequestPut = handle(async (ctx) => {
  const { request, env, params } = ctx;
  if (!(await exists(env.DB, params.id))) return fail('Товар не найден', 404);
  const body = await readJson(request);
  const data = sanitizeProduct(body);
  await env.DB.prepare("UPDATE products SET data = ?2, active = ?3, updated_at = datetime('now') WHERE id = ?1")
    .bind(params.id, JSON.stringify(data), body.active === false ? 0 : 1)
    .run();
  prune(ctx); // заменённые фото больше не нужны
  return json({ ok: true });
});

export const onRequestPatch = handle(async ({ request, env, params }) => {
  const body = await readJson(request, 1024);
  const r = await env.DB.prepare("UPDATE products SET active = ?2, updated_at = datetime('now') WHERE id = ?1")
    .bind(params.id, body.active ? 1 : 0)
    .run();
  if (!r.meta.changes) return fail('Товар не найден', 404);
  return json({ ok: true });
});

export const onRequestDelete = handle(async (ctx) => {
  const { env, params } = ctx;
  const r = await env.DB.prepare('DELETE FROM products WHERE id = ?1').bind(params.id).run();
  if (!r.meta.changes) return fail('Товар не найден', 404);
  prune(ctx); // фото удалённого товара больше не нужны
  return json({ ok: true });
});

// PUT    /api/admin/products/:id — сохранить товар
// PATCH  /api/admin/products/:id — только показать/скрыть ({ active })
// DELETE /api/admin/products/:id — удалить товар
import { json, fail, handle, readJson } from '../../../../lib/http.js';
import { sanitizeProduct } from '../../../../lib/store.js';

const exists = (db, id) => db.prepare('SELECT 1 FROM products WHERE id = ?1').bind(id).first();

export const onRequestPut = handle(async ({ request, env, params }) => {
  if (!(await exists(env.DB, params.id))) return fail('Товар не найден', 404);
  const body = await readJson(request);
  const data = sanitizeProduct(body);
  await env.DB.prepare("UPDATE products SET data = ?2, active = ?3, updated_at = datetime('now') WHERE id = ?1")
    .bind(params.id, JSON.stringify(data), body.active === false ? 0 : 1)
    .run();
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

export const onRequestDelete = handle(async ({ env, params }) => {
  const r = await env.DB.prepare('DELETE FROM products WHERE id = ?1').bind(params.id).run();
  if (!r.meta.changes) return fail('Товар не найден', 404);
  return json({ ok: true });
});

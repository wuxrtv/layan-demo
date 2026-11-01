// GET  /api/admin/products — все товары, включая скрытые
// POST /api/admin/products — создать товар
import { json, handle, readJson } from '../../../../lib/http.js';
import { listProducts, sanitizeProduct } from '../../../../lib/store.js';

export const onRequestGet = handle(async ({ env }) => json({ products: await listProducts(env.DB, { onlyActive: false }) }));

export const onRequestPost = handle(async ({ request, env }) => {
  const body = await readJson(request);
  const data = sanitizeProduct(body);
  const id = 'p' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const { next } = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM products').first();
  await env.DB.prepare('INSERT INTO products (id, data, active, sort) VALUES (?1, ?2, ?3, ?4)')
    .bind(id, JSON.stringify(data), body.active === false ? 0 : 1, next)
    .run();
  return json({ id }, { status: 201 });
});

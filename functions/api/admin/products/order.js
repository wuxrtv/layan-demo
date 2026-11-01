// POST /api/admin/products/order — порядок товаров в каталоге: { ids: [...] } сверху вниз
import { json, handle, readJson, UserError } from '../../../../lib/http.js';

export const onRequestPost = handle(async ({ request, env }) => {
  const { ids } = await readJson(request);
  if (!Array.isArray(ids) || ids.length > 1000) throw new UserError('Некорректный порядок');
  const stmt = env.DB.prepare('UPDATE products SET sort = ?2 WHERE id = ?1');
  await env.DB.batch(ids.map((id, i) => stmt.bind(String(id), i + 1)));
  return json({ ok: true });
});

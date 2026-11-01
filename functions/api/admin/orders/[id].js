// PATCH /api/admin/orders/:id — сменить статус заказа ({ status })
import { json, fail, handle, readJson } from '../../../../lib/http.js';
import { STATUSES } from '../../../../lib/store.js';

export const onRequestPatch = handle(async ({ request, env, params }) => {
  const { status } = await readJson(request, 1024);
  if (!STATUSES.includes(status)) return fail('Неизвестный статус');
  const r = await env.DB.prepare('UPDATE orders SET status = ?2 WHERE id = ?1').bind(Number(params.id), status).run();
  if (!r.meta.changes) return fail('Заказ не найден', 404);
  return json({ ok: true });
});

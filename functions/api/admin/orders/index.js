// GET /api/admin/orders?status=new — заказы (новые сверху) и количество по статусам
import { json, handle } from '../../../../lib/http.js';
import { STATUSES } from '../../../../lib/store.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const status = new URL(request.url).searchParams.get('status');
  const filter = STATUSES.includes(status) ? status : null;
  const [{ results }, counts] = await Promise.all([
    env.DB.prepare(`SELECT * FROM orders ${filter ? 'WHERE status = ?1' : ''} ORDER BY id DESC LIMIT 200`)
      .bind(...(filter ? [filter] : []))
      .all(),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all(),
  ]);
  return json({
    orders: results.map((o) => ({
      ...o,
      no: 1000 + o.id,
      items: JSON.parse(o.items),
      tg_user: o.tg_user ? JSON.parse(o.tg_user) : null,
    })),
    counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])),
  });
});

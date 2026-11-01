// POST /api/orders — заказ из магазина: проверка, пересчёт по ценам из базы, сохранение, уведомление в Telegram
import { json, handle, readJson } from '../../lib/http.js';
import { buildOrder, getSettings, listProducts } from '../../lib/store.js';
import { notifyOrder, verifyInitData } from '../../lib/telegram.js';

export const onRequestPost = handle(async ({ request, env, waitUntil }) => {
  const body = await readJson(request, 32 * 1024);
  const [products, settings] = await Promise.all([listProducts(env.DB, { onlyActive: true }), getSettings(env.DB)]);
  const order = buildOrder(body, products, settings);
  const tgUser = await verifyInitData(body.initData, env.TG_BOT_TOKEN);

  const row = await env.DB.prepare(
    `INSERT INTO orders (name, phone, method, address, pay, comment, items, sum, fee, total, lang, tg_user)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) RETURNING id`,
  )
    .bind(order.name, order.phone, order.method, order.address, order.pay, order.comment, JSON.stringify(order.items),
      order.sum, order.fee, order.total, order.lang, tgUser ? JSON.stringify(tgUser) : null)
    .first();

  const no = 1000 + row.id;
  waitUntil(notifyOrder(env, no, order, tgUser).catch((e) => console.error('notify', e)));
  return json({ no, sum: order.sum, fee: order.fee, total: order.total, method: order.method, pay: order.pay, count: order.items.reduce((s, i) => s + i.qty, 0) });
});

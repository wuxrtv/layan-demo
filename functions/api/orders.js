// POST /api/orders — заказ из магазина: проверка, пересчёт по ценам из базы, сохранение, уведомление в Telegram.
// Заказы принимаются только из Telegram: подпись initData обязательна (в браузере магазин не работает).
import { json, handle, readJson } from '../../lib/http.js';
import { buildOrder, getSettings, listProducts } from '../../lib/store.js';
import { botToken, notifyOrder, verifyInitData } from '../../lib/telegram.js';
import { orderAllowed, orderKey, recordOrder } from '../../lib/ratelimit.js';

const DEV_USER = { id: 0, username: '', first_name: 'Локальный режим' }; // только при локальном запуске (DEV_NO_AUTH=1)

export const onRequestPost = handle(async ({ request, env, waitUntil }) => {
  const body = await readJson(request, 32 * 1024);
  const tgUser = (await verifyInitData(body.initData, botToken(env))) || (env.DEV_NO_AUTH === '1' ? DEV_USER : null);
  if (!tgUser) return json({ error: 'telegram' }, { status: 403 });
  const who = orderKey(tgUser);
  if (!(await orderAllowed(env.DB, who))) return json({ error: 'rate' }, { status: 429 });

  const [products, settings] = await Promise.all([listProducts(env.DB, { onlyActive: true }), getSettings(env.DB)]);
  const order = buildOrder(body, products, settings);

  const row = await env.DB.prepare(
    `INSERT INTO orders (name, phone, method, address, pay, comment, items, sum, fee, total, lang, tg_user)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) RETURNING id`,
  )
    .bind(order.name, order.phone, order.method, order.address, order.pay, order.comment, JSON.stringify(order.items),
      order.sum, order.fee, order.total, order.lang, tgUser ? JSON.stringify(tgUser) : null)
    .first();

  await recordOrder(env.DB, who);
  const no = 1000 + row.id;
  waitUntil(notifyOrder(env, no, order, tgUser).catch((e) => console.error('notify', e)));
  return json({ no, sum: order.sum, fee: order.fee, total: order.total, method: order.method, pay: order.pay, count: order.items.reduce((s, i) => s + i.qty, 0) });
});

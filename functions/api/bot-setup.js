// Настройка бота через сервер (токен из секрета TG_BOT_TOKEN, наружу не выдаётся).
// GET  /api/bot-setup — проверить токен: какой бот и какая кнопка меню стоит сейчас
// POST /api/bot-setup — поставить кнопку меню «Магазин» со ссылкой на сайт и прислать владельцам
//                       сообщение с кнопкой «Открыть админку» (не чаще раза в 2 минуты)
import { json, fail, handle } from '../../lib/http.js';
import { botToken, ownerIds, sendMessage, tgApi } from '../../lib/telegram.js';

export const onRequestGet = handle(async ({ env }) => {
  if (!botToken(env)) return fail('TG_BOT_TOKEN не задан', 503);
  const me = await tgApi(env, 'getMe');
  if (!me.ok) return json({ ok: false, error: 'Telegram не принял токен: ' + (me.description || 'неизвестная ошибка') }, { status: 502 });
  const menu = await tgApi(env, 'getChatMenuButton');
  return json({ ok: true, bot: me.result.username, owners: ownerIds(env).length, menuButton: menu.ok ? menu.result : null });
});

export const onRequestPost = handle(async ({ request, env }) => {
  if (!botToken(env)) return fail('TG_BOT_TOKEN не задан', 503);

  // защита от частых вызовов: сообщения владельцам не чаще раза в 2 минуты
  const last = await env.DB.prepare("SELECT value FROM settings WHERE key = 'bot_setup_at'").first();
  if (last && Date.now() - Number(JSON.parse(last.value)) < 2 * 60 * 1000) return fail('Подождите пару минут и попробуйте снова', 429);
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('bot_setup_at', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(JSON.stringify(Date.now())).run();

  const me = await tgApi(env, 'getMe');
  if (!me.ok) return json({ ok: false, error: 'Telegram не принял токен: ' + (me.description || 'неизвестная ошибка') }, { status: 502 });

  const origin = new URL(request.url).origin;
  const menu = await tgApi(env, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Магазин', web_app: { url: origin + '/' } },
  });

  const adminUrl = origin + '/admin/';
  const sent = {};
  for (const id of ownerIds(env)) {
    sent[id] = await sendMessage(env, id,
      '<b>Админ-панель магазина LAYAN</b>\nЗаказы, товары и настройки — по кнопке ниже. Это сообщение можно закрепить, чтобы админка всегда была под рукой.',
      { reply_markup: { inline_keyboard: [[{ text: 'Открыть админку', web_app: { url: adminUrl } }]] } },
    );
  }
  return json({ ok: true, bot: me.result.username, menuButton: !!menu.ok, menuError: menu.ok ? undefined : menu.description, adminButtonSent: sent });
});

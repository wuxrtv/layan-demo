// POST /api/tg-webhook — сюда Telegram присылает сообщения боту (см. lib/bot.js).
// Принимаем только запросы с секретным заголовком, который знает Telegram (задаётся при setWebhook).
// GET  /api/tg-webhook — подключён ли бот к сайту (без адресов и токенов), для проверки
import { botToken, tgApi } from '../../lib/telegram.js';
import { handleUpdate, shopHost, webhookPath, webhookSecret } from '../../lib/bot.js';

export async function onRequestGet({ env }) {
  if (!botToken(env)) return Response.json({ connected: false, reason: 'no_token' });
  const info = await tgApi(env, 'getWebhookInfo');
  if (!info.ok) return Response.json({ connected: false, reason: 'telegram_error' });
  const url = info.result.url || '';
  return Response.json({
    connected: url === `https://${shopHost(env)}${webhookPath}`,
    otherService: !!url && url !== `https://${shopHost(env)}${webhookPath}`,
    pending: info.result.pending_update_count || 0,
    lastError: info.result.last_error_message || null,
  });
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!botToken(env)) return new Response('bot not configured', { status: 503 });
  if (request.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret(env))) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await request.json().catch(() => null);
  // отвечаем Telegram сразу, сообщение отправляем в фоне (иначе при ошибке Telegram будет повторять запрос)
  waitUntil(handleUpdate(env, update).catch((e) => console.error('bot update', e)));
  return new Response('ok');
}

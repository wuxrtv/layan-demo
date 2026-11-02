// Для всех запросов к API и фото: убедиться, что база подготовлена (таблицы + стартовый каталог)
import { ensureDb } from '../lib/schema.js';
import { fail } from '../lib/http.js';
import { ensureWebhook, shopHost } from '../lib/bot.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;
  if (path.startsWith('/api/') || path.startsWith('/img/')) {
    if (!context.env.DB) return fail('База данных не подключена', 503);
    try {
      await ensureDb(context.env.DB);
    } catch (e) {
      console.error('ensureDb', e);
      return fail('База данных недоступна', 503);
    }
    // бот отвечает на «Старт» через вебхук — проверяем, что он подключён (только на боевом сайте)
    if (url.hostname === shopHost(context.env)) context.waitUntil(ensureWebhook(context.env).catch((e) => console.error('webhook', e)));
  }
  return context.next();
}

// Для всех запросов к API и фото: убедиться, что база подготовлена (таблицы + стартовый каталог)
import { ensureDb } from '../lib/schema.js';
import { fail } from '../lib/http.js';

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/img/')) {
    if (!context.env.DB) return fail('База данных не подключена', 503);
    try {
      await ensureDb(context.env.DB);
    } catch (e) {
      console.error('ensureDb', e);
      return fail('База данных недоступна', 503);
    }
  }
  return context.next();
}

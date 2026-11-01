// Все /api/admin/* — только для администраторов, вошедших через Telegram (см. lib/auth.js).
// DEV_NO_AUTH=1 задаётся только при локальном запуске (wrangler pages dev), в Cloudflare его нет.
import { json } from '../../../lib/http.js';
import { verifyAdmin } from '../../../lib/auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (env.DEV_NO_AUTH === '1') {
    context.data.admin = { id: 0, first_name: 'Локальный режим', username: '' };
    return context.next();
  }
  let result;
  try {
    result = await verifyAdmin(request, env);
  } catch (e) {
    console.error('admin auth', e);
    result = { status: 500, error: 'Ошибка проверки входа' };
  }
  if (!result.admin) {
    return json({ error: result.error, tgId: result.tgId }, { status: result.status });
  }
  context.data.admin = result.admin;
  return context.next();
}

// GET /api/admin/me — кто вошёл и куда приходят уведомления о заказах
import { json } from '../../../lib/http.js';
import { notifyTargets } from '../../../lib/telegram.js';

export function onRequestGet({ data, env }) {
  const a = data.admin;
  return json({
    name: [a.first_name, a.username ? '@' + a.username : ''].filter(Boolean).join(' '),
    telegram: !!env.TG_BOT_TOKEN && notifyTargets(env).length > 0,
    notifyTo: env.TG_CHAT_ID ? 'group' : 'admins',
  });
}

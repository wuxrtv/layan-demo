// GET /api/admin/me — кто вошёл, его роль и куда приходят уведомления о заказах
import { json, handle } from '../../../lib/http.js';
import { getBotUsername, notifyTargets } from '../../../lib/telegram.js';

export const onRequestGet = handle(async ({ data, env }) => {
  const a = data.admin;
  const [targets, bot] = await Promise.all([notifyTargets(env), getBotUsername(env)]);
  return json({
    id: a.id,
    role: a.role,
    name: [a.first_name, a.username ? '@' + a.username : ''].filter(Boolean).join(' '),
    telegram: !!env.TG_BOT_TOKEN && targets.length > 0,
    notifyTo: env.TG_CHAT_ID ? 'group' : 'admins',
    bot,
  });
});

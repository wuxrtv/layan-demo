// GET /api/admin/me — кто вошёл и настроены ли уведомления в Telegram
import { json } from '../../../lib/http.js';

export function onRequestGet({ data, env }) {
  return json({ email: data.admin.email, telegram: !!(env.TG_BOT_TOKEN && env.TG_CHAT_ID) });
}

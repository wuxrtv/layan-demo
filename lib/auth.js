// Вход в админку через Telegram: админка открывается из бота как Mini App,
// браузер присылает Telegram.WebApp.initData в заголовке X-Tg-Init-Data,
// сервер проверяет подпись токеном бота и сверяет Telegram ID со списком ADMIN_TG_IDS.
import { adminIds, verifyInitData } from './telegram.js';

export async function verifyAdmin(request, env) {
  if (!env.TG_BOT_TOKEN) return { status: 503, error: 'Бот не подключён: добавьте TG_BOT_TOKEN в настройках Cloudflare' };
  const user = await verifyInitData(request.headers.get('x-tg-init-data') || '', env.TG_BOT_TOKEN);
  if (!user) return { status: 401, error: 'Откройте админку через бота в Telegram' };
  if (!adminIds(env).includes(String(user.id))) return { status: 403, error: 'Нет доступа', tgId: user.id };
  return { admin: user };
}

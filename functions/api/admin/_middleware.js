// Все /api/admin/* — только после входа через Cloudflare Access.
// DEV_NO_AUTH=1 задаётся только при локальном запуске (wrangler pages dev), в Cloudflare его нет.
import { fail } from '../../../lib/http.js';
import { verifyAdmin } from '../../../lib/access.js';

export async function onRequest(context) {
  const { request, env } = context;
  let admin = null;
  if (env.DEV_NO_AUTH === '1') admin = { email: 'dev@localhost' };
  else {
    try {
      admin = await verifyAdmin(request, env);
    } catch (e) {
      console.error('access verify', e);
    }
  }
  if (!admin) return fail('Нужно войти в админку', 401);
  context.data.admin = admin;
  return context.next();
}

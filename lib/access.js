// Проверка входа в админку через Cloudflare Access (вход по коду на почту).
// Access сам пускает на /admin только разрешённые почты; здесь мы дополнительно
// проверяем подпись токена, чтобы API нельзя было вызвать в обход Access.

const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

let certs = { at: 0, keys: [] };
async function getKeys(teamDomain) {
  if (Date.now() - certs.at < 60 * 60 * 1000 && certs.keys.length) return certs.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('access certs ' + res.status);
  certs = { at: Date.now(), keys: (await res.json()).keys || [] };
  return certs.keys;
}

function readCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : '';
}

export async function verifyAdmin(request, env) {
  const token = request.headers.get('cf-access-jwt-assertion') || readCookie(request, 'CF_Authorization');
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!token || !team || !aud) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch (e) {
    return null;
  }
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud) || payload.iss !== `https://${team}` || !(payload.exp * 1000 > Date.now())) return null;

  const jwk = (await getKeys(team)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;

  const email = String(payload.email || '').toLowerCase();
  const allowed = String(env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  if (allowed.length && !allowed.includes(email)) return null;
  return { email };
}

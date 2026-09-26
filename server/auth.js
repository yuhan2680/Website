import {createRemoteJWKSet, jwtVerify} from 'jose';
import {HttpError} from './http.js';

const keySets = new Map();

export async function authenticateAdmin(request, env, suppliedKeys) {
  const issuer = String(env.ACCESS_TEAM_DOMAIN || '').replace(/\/$/,'');
  const audience = env.ACCESS_AUD, email = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !audience || !email) {
    throw new HttpError(503,'后台登录尚未配置完成');
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) throw new HttpError(401,'请先登录后台');
  let payload;
  try {
    if (!suppliedKeys && !keySets.has(issuer)) keySets.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs')));
    ({payload} = await jwtVerify(token,suppliedKeys || keySets.get(issuer),{
      issuer, audience, algorithms:['RS256'], requiredClaims:['exp','iat','sub','email'], clockTolerance:5
    }));
  } catch { throw new HttpError(401,'登录已过期，请重新登录'); }
  if (typeof payload.email !== 'string' || payload.email.toLowerCase() !== email) throw new HttpError(403,'这个账号没有后台权限');
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode('naiwenel-admin-csrf:'+token));
  const csrf = Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
  return {email:payload.email,csrf};
}

export function requireMutation(request, user) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.get('X-CSRF-Token') !== user.csrf) {
    throw new HttpError(403,'请在本站后台操作；登录过期时请刷新页面');
  }
}

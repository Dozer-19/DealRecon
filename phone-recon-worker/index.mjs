// Phone Recon replacement Worker. Provider requests remain disabled by default.
import {enrichContact} from './enformion.mjs';
const FIREBASE_PROJECT = 'deal-recon';
const KEY_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const decoder = new TextDecoder();
const encoder = new TextEncoder();
let keyCache = {keys: [], until: 0};

function base64url(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
function parsePart(part) { return JSON.parse(decoder.decode(base64url(part))); }
function reply(status, error, more = {}) {
  return new Response(JSON.stringify({ok: false, error}), {status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...more}});
}
async function getKeys(fetcher = fetch) {
  if (Date.now() < keyCache.until && keyCache.keys.length) return keyCache.keys;
  const response = await fetcher(KEY_URL);
  if (!response.ok) throw new Error('Public key fetch failed');
  const body = await response.json();
  if (!Array.isArray(body.keys) || !body.keys.length) throw new Error('Public keys unavailable');
  const seconds = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 300);
  keyCache = {keys: body.keys, until: Date.now() + Math.min(Math.max(seconds, 60), 3600) * 1000};
  return keyCache.keys;
}
export async function verifyFirebaseIdToken(token, fetcher = fetch) {
  if (typeof token !== 'string' || token.length > 8192) throw new Error('Bad token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Bad token');
  const header = parsePart(parts[0]);
  if (header.alg !== 'RS256' || !header.kid || header.typ && header.typ !== 'JWT') throw new Error('Bad algorithm');
  const keys = await getKeys(fetcher);
  const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256');
  if (!jwk) throw new Error('Unknown key');
  const publicKey = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, base64url(parts[2]), encoder.encode(parts[0] + '.' + parts[1]));
  if (!valid) throw new Error('Bad signature');
  const claims = parsePart(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== FIREBASE_PROJECT || claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT}` ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
      !Number.isInteger(claims.exp) || claims.exp <= now ||
      !Number.isInteger(claims.iat) || claims.iat > now ||
      !Number.isInteger(claims.auth_time) || claims.auth_time > now) throw new Error('Bad claims');
  return claims;
}
function clean(value, limit) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
}
function allowedOrigin(origin) { return origin === 'null' ? {'Access-Control-Allow-Origin': 'null', Vary: 'Origin'} : {}; }
export async function handleRequest(request, env, deps = {}) {
  const origin = request.headers.get('Origin');
  const cors = allowedOrigin(origin);
  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: {...cors,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600'}});
  }
  if (request.method !== 'POST') return reply(405, 'Method not allowed', cors);
  if (origin && origin !== 'null') return reply(403, 'Origin rejected', cors);
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return reply(415, 'JSON required', cors);
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!bearer) return reply(401, 'Sign in required', cors);
  let user;
  try { user = await verifyFirebaseIdToken(bearer, deps.fetchKeys); }
  catch { return reply(401, 'Invalid sign-in', cors); }
  const allowed = String(env.ALLOWED_FIREBASE_UIDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!allowed.length || !allowed.includes(user.sub)) return reply(403, 'Not authorized', cors);
  if (env.LOOKUPS_ENABLED !== 'true') return reply(503, 'Contact lookup is paused', cors);
  if (!env.ENFORMION_AP_NAME || !env.ENFORMION_AP_PASSWORD) return reply(503, 'Provider connection is not configured', cors);
  if (!env.PHONE_RECON_QUOTA) return reply(503, 'Usage limit unavailable', cors);
  let raw;
  try { raw = await request.text(); } catch { return reply(400, 'Invalid request', cors); }
  if (raw.length > 4096) return reply(413, 'Request too large', cors);
  let body;
  try { body = JSON.parse(raw); } catch { return reply(400, 'Invalid JSON', cors); }
  const lookup = {owner: clean(body.owner, 160), propertyAddress: clean(body.propertyAddress, 240),
    mailingAddress: clean(body.mailingAddress, 240), parcelId: clean(body.parcelId, 80)};
  if (!lookup.owner || !lookup.propertyAddress) return reply(400, 'Owner and property required', cors);
  const gate = env.PHONE_RECON_QUOTA.get(env.PHONE_RECON_QUOTA.idFromName('workspace'));
  const quota = await gate.fetch('https://quota.local/consume', {method: 'POST', body: JSON.stringify({uid: user.sub,
    maxDaily: Math.min(Math.max(Number(env.MAX_DAILY_LOOKUPS) || 0, 0), 100),
    maxMonthly: Math.min(Math.max(Number(env.MAX_MONTHLY_LOOKUPS) || 0, 0), 1000)})});
  if (!quota.ok) return reply(quota.status === 429 ? 429 : 503, quota.status === 429 ? 'Daily or monthly limit reached' : 'Usage limit unavailable', cors);
  try {
    const result = await enrichContact(lookup, env, deps.fetchProvider);
    return new Response(JSON.stringify(result), {status: 200, headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors}});
  } catch {
    return reply(502, 'Phone Recon provider could not be reached', cors);
  }
}
export class PhoneReconQuota {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, {status: 405});
    const {uid, maxDaily, maxMonthly} = await request.json();
    if (!uid || !Number.isInteger(maxDaily) || !Number.isInteger(maxMonthly) ||
        maxDaily < 1 || maxMonthly < 1) return new Response(null, {status: 503});
    const day = new Date().toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const granted = await this.ctx.storage.transaction(async tx => {
      const dKey = `day:${uid}:${day}`, mKey = `month:${uid}:${month}`;
      const daily = (await tx.get(dKey)) || 0, monthly = (await tx.get(mKey)) || 0;
      if (daily >= maxDaily || monthly >= maxMonthly) return false;
      await tx.put(dKey, daily + 1); await tx.put(mKey, monthly + 1);
      return true;
    });
    return new Response(null, {status: granted ? 204 : 429});
  }
}
export default {fetch: (request, env) => handleRequest(request, env)};

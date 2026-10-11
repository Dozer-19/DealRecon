import {verifyFirebaseIdToken} from '../phone-recon-worker/index.mjs';
import {CampaignControl} from '../communications-engine/campaign-control.mjs';

const response = (status, body, cors = {}) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors}});

// Review-only routes. No provider client or dispatch route exists.
export async function handleCampaignRequest(request, env, deps = {}) {
  const origin = request.headers.get('Origin');
  const cors = origin === 'null' ? {'Access-Control-Allow-Origin': 'null', Vary: 'Origin'} : {};
  if (origin && origin !== 'null') return response(403, {error: 'Origin rejected'});
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...cors,
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type'}});
  if (request.method !== 'POST') return response(405, {error: 'POST required'}, cors);
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')
    return response(415, {error: 'JSON required'}, cors);
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return response(401, {error: 'Sign in required'}, cors);
  let claims;
  try {claims = await (deps.verifyToken || verifyFirebaseIdToken)(token);}
  catch {return response(401, {error: 'Invalid sign-in'}, cors);}
  if (!env.CAMPAIGN_OWNER_UID || claims.sub !== env.CAMPAIGN_OWNER_UID)
    return response(403, {error: 'Owner authorization required'}, cors);
  if (!env.CAMPAIGN_CONTROL) return response(503, {error: 'Campaign storage unavailable'}, cors);
  const action = new URL(request.url).pathname;
  if (!['/status', '/submit', '/approve', '/cancel', '/pause'].includes(action))
    return response(404, {error: 'Route unavailable'}, cors);
  let raw, body;
  try {
    raw = await request.text();
    if (raw.length > 65536) return response(413, {error: 'Request too large'}, cors);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {return response(400, {error: 'Invalid JSON'}, cors);}
  // Single workspace object makes reservations across campaigns serializable.
  const object = env.CAMPAIGN_CONTROL.get(env.CAMPAIGN_CONTROL.idFromName('workspace'));
  try {
    const result = await object.fetch('https://campaign.internal' + action, {
      method: 'POST', body: JSON.stringify({actorUid: claims.sub, body})});
    return response(result.status, await result.json(), cors);
  } catch {return response(503, {error: 'Campaign storage unavailable'}, cors);}
}

export class CampaignControlObject {
  constructor(ctx, env) {this.ctx = ctx; this.env = env;}
  async fetch(request) {
    if (request.method !== 'POST') return response(405, {error: 'POST required'});
    // This object is reachable only through the private Worker binding.
    let envelope;
    try {envelope = await request.json();} catch {return response(400, {error: 'Invalid JSON'});}
    if (!this.env.CAMPAIGN_OWNER_UID || envelope.actorUid !== this.env.CAMPAIGN_OWNER_UID)
      return response(403, {error: 'Owner authorization required'});
    let rates;
    try {rates = JSON.parse(this.env.CAMPAIGN_QUOTED_RATES || 'null');}
    catch {return response(503, {error: 'Quoted rates unavailable'});}
    if (!rates) return response(503, {error: 'Quoted rates unavailable'});
    const control = new CampaignControl(this.ctx.storage, this.env.CAMPAIGN_OWNER_UID, rates);
    const body = envelope.body || {};
    try {
      let result;
      switch (new URL(request.url).pathname) {
        case '/status': result = await control.status(envelope.actorUid); break;
        case '/submit': result = await control.submit(envelope.actorUid, body); break;
        case '/approve': result = await control.approve(envelope.actorUid, body.campaignId, body.fingerprint); break;
        case '/cancel': result = await control.cancel(envelope.actorUid, body.campaignId); break;
        case '/pause': result = await control.pause(envelope.actorUid, body.paused); break;
        default: return response(404, {error: 'Route unavailable'});
      }
      return response(200, {ok: true, result, liveExecutionEnabled: false});
    } catch (error) {return response(409, {error: error.message, liveExecutionEnabled: false});}
  }
}
export default {fetch: (request, env) => handleCampaignRequest(request, env)};

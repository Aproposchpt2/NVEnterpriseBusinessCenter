// Apropos Business Center — member file storage broker (AG ENGINEERING OS™).
// Issues Supabase signed upload URLs (browser uploads direct → no Netlify body-size limit),
// lists, and deletes member files. Buckets are self-provisioned:
//   member-documents  → PRIVATE (business plans, financials, contracts)
//   website-assets    → PUBLIC  (photo library used in website builds)
//
// TODO: gate behind member session before production hardening.
// These endpoints (sign / list / delete) are currently unauthenticated (matching the rest
// of the app's functions), so callers could touch any {user_email}/ path. Before production
// hardening, gate them behind the member OTP session. (Accepted as-is for now per directive;
// auth is a separate security directive.)

const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED = { 'member-documents': false, 'website-assets': true }; // bucket → public?

const json = (o, s = 200) => ({ statusCode: s, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
const sbH = (extra) => ({ apikey: SKEY, Authorization: `Bearer ${SKEY}`, ...(extra || {}) });

async function ensureBucket(name, pub) {
  try {
    await fetch(`${SUPA}/storage/v1/bucket`, { method: 'POST', headers: sbH({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id: name, name, public: !!pub }) });
  } catch (_) { /* exists / transient */ }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json({}, 204);
  if (event.httpMethod !== 'POST') return json({ error: 'POST only' }, 405);
  if (!SUPA || !SKEY) return json({ error: 'Supabase not configured' }, 500);

  let b; try { b = JSON.parse(event.body || '{}'); } catch { return json({ error: 'Bad JSON' }, 400); }
  const bucket = String(b.bucket || '');
  if (!(bucket in ALLOWED)) return json({ error: 'invalid bucket' }, 400);
  const pub = ALLOWED[bucket];
  await ensureBucket(bucket, pub);

  const clean = (s) => String(s || '').replace(/^\/+/, '').replace(/\.\.+/g, '').slice(0, 300);

  if (b.action === 'sign') {
    const path = clean(b.path);
    if (!path) return json({ error: 'path required' }, 400);
    const r = await fetch(`${SUPA}/storage/v1/object/upload/sign/${bucket}/${encodeURI(path)}`, { method: 'POST', headers: sbH({ 'Content-Type': 'application/json' }), body: '{}' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) return json({ error: 'sign failed: ' + JSON.stringify(d) }, 502);
    return json({ ok: true, uploadUrl: `${SUPA}/storage/v1${d.url}`, path });
  }

  if (b.action === 'list') {
    const prefix = clean(b.prefix);
    const r = await fetch(`${SUPA}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: sbH({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix: prefix ? prefix + '/' : '', limit: 100, sortBy: { column: 'created_at', order: 'desc' } }) });
    const d = await r.json().catch(() => []);
    if (!r.ok) return json({ error: 'list failed' }, 502);
    const files = (Array.isArray(d) ? d : [])
      .filter(f => f && f.name && f.id !== null) // skip folder placeholders
      .map(f => { const full = (prefix ? prefix + '/' : '') + f.name; return { name: f.name, path: full, size: (f.metadata && f.metadata.size) || 0, public_url: pub ? `${SUPA}/storage/v1/object/public/${bucket}/${encodeURI(full)}` : null }; });
    return json({ ok: true, files });
  }

  if (b.action === 'delete') {
    const path = clean(b.path);
    if (!path) return json({ error: 'path required' }, 400);
    const r = await fetch(`${SUPA}/storage/v1/object/${bucket}/${encodeURI(path)}`, { method: 'DELETE', headers: sbH() });
    if (!r.ok) return json({ error: 'delete failed' }, 502);
    return json({ ok: true });
  }

  return json({ error: 'unknown action' }, 400);
};

// Apropos Social Autopilot — admin onboarding. Enroll or update a client page.
// Protected by AUTOPILOT_ADMIN_KEY. Tokens go in the request body (or pulled
// from env), never through chat. POST JSON:
// {
//   admin_key: "<AUTOPILOT_ADMIN_KEY>",
//   id?: "<uuid to update instead of insert>",
//   business_name: "Acme Co",
//   page_id: "1234567890",
//   page_token: "<page or system-user token>"   // OR  "@env" to use FB_PAGE_TOKEN
//   about: "what the business does, in a sentence or two",
//   default_link: "https://acme.com",
//   themes?: [{ key, brief, url }],   // optional; omit = AI rotates value angles from `about`
//   links?: { themeKey: url },        // optional per-theme link overrides
//   tone?: "voice guidance",
//   post_hour_utc?: 15,               // 0-23, default 15 (~8am PT)
//   mode?: "post|email|both|paused",  // default post
//   owner_email?: "client@email.com",
//   status?: "active|paused"
// }

const FB_API = 'https://graph.facebook.com/v21.0';
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

async function supa(path, opts = {}) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

// Confirm the token can actually reach the page; return the page name if so.
async function verifyPage(token, pageId) {
  try {
    const r = await fetch(`${FB_API}/${pageId}?fields=name&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (r.ok && d.name) return { ok: true, via: 'direct', name: d.name };
  } catch (_) {}
  try {
    const r = await fetch(`${FB_API}/me/accounts?fields=id,name&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (r.ok && Array.isArray(d.data)) {
      const m = d.data.find(p => p.id === pageId) || d.data[0];
      if (m) return { ok: true, via: 'me/accounts', name: m.name, resolved_id: m.id };
    }
  } catch (_) {}
  return { ok: false };
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!SUPA || !SKEY) return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }, 500);
  if (!process.env.AUTOPILOT_ADMIN_KEY) return json({ error: 'AUTOPILOT_ADMIN_KEY not set on site' }, 500);

  let body; try { body = await req.json(); } catch (_) { return json({ error: 'invalid JSON body' }, 400); }
  if (body.admin_key !== process.env.AUTOPILOT_ADMIN_KEY) return json({ error: 'unauthorized' }, 401);

  let token = body.page_token;
  if (token === '@env') token = process.env.FB_PAGE_TOKEN;   // convenience: reuse the in-house token

  // Insert needs the essentials; update (id present) only touches sent fields.
  if (!body.id) {
    if (!body.business_name || !body.page_id) return json({ error: 'business_name and page_id are required to enroll' }, 400);
    if (!token) return json({ error: 'page_token (or "@env") is required to enroll' }, 400);
  }

  // Validate the token against the page when both are supplied.
  let verify = null;
  if (token && body.page_id) {
    verify = await verifyPage(token, body.page_id);
    if (!verify.ok) return json({ error: 'token cannot reach that page_id — check the token and page id', verify }, 400);
  }

  // Only include fields actually provided, so a partial update never nulls the rest.
  const row = { updated_at: new Date().toISOString() };
  if (body.business_name !== undefined) row.business_name = body.business_name;
  if (body.page_id !== undefined)       row.page_id       = body.page_id;
  if (body.about !== undefined)         row.about         = body.about;
  if (body.default_link !== undefined)  row.default_link  = body.default_link;
  if (body.tone !== undefined)          row.tone          = body.tone;
  if (body.owner_email !== undefined)   row.owner_email   = body.owner_email;
  if (token)                            row.page_token    = token;
  if (body.themes !== undefined)        row.themes        = body.themes;
  if (body.links !== undefined)         row.links         = body.links;
  if (body.post_hour_utc !== undefined) row.post_hour_utc = body.post_hour_utc;
  if (body.mode !== undefined)          row.mode          = body.mode;
  if (body.status !== undefined)        row.status        = body.status;

  try {
    let saved;
    if (body.id) {
      saved = await supa(`social_autopilot_clients?id=eq.${encodeURIComponent(body.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row),
      });
    } else {
      saved = await supa('social_autopilot_clients', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row),
      });
    }
    const c = Array.isArray(saved) ? saved[0] : saved;
    // Never echo the token back.
    if (c && c.page_token) c.page_token = '***stored***';
    return json({ success: true, page_verified_as: verify?.name || '(unchanged)', client: c });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

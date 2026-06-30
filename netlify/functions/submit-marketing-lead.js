'use strict';
// Marketing Agent offer — pre-checkout lead capture. Best-effort, never blocks the buyer.
// POST { first_name, last_name, email, phone, source } → upsert marketing_leads by email.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const j = (c, o) => ({ statusCode: c, headers: CORS, body: JSON.stringify(o) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return j(405, { error: 'POST only' });
  if (!SUPABASE_URL || !SKEY) return j(500, { error: 'Supabase env not set' });

  let b; try { b = JSON.parse(event.body || '{}'); } catch (_) { return j(400, { error: 'Invalid JSON' }); }
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return j(400, { error: 'Valid email required' });

  const row = {
    email,
    first_name: b.first_name || null,
    last_name: b.last_name || null,
    phone: b.phone || null,
    source: b.source || 'marketing-agent-offer',
    updated_at: new Date().toISOString(),
  };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/marketing_leads?on_conflict=email`, {
      method: 'POST',
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) return j(200, { ok: false }); // best-effort: don't surface failures to the buyer
    return j(200, { ok: true });
  } catch (_) { return j(200, { ok: false }); }
};

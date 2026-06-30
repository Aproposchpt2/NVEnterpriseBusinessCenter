'use strict';
// Marketing Agent — post-payment onboarding capture. Stores the customer's business
// details (so the owner can connect their page + enroll them in the Autopilot stable)
// and emails the owner an action note. Best-effort email; the save is what matters.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const RESEND_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
const OWNER = process.env.MESSAGE_RECIPIENT || process.env.RESEND_TO_EMAIL || 'jmitchell@aproposgroupllc.com';

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const j = (c, o) => ({ statusCode: c, headers: CORS, body: JSON.stringify(o) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return j(405, { error: 'POST only' });
  if (!SUPABASE_URL || !SKEY) return j(500, { error: 'Supabase env not set' });

  let b; try { b = JSON.parse(event.body || '{}'); } catch (_) { return j(400, { error: 'Invalid request' }); }
  const email = String(b.email || '').trim().toLowerCase();
  const business_name = String(b.business_name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return j(400, { error: 'Valid email required' });
  if (!business_name) return j(400, { error: 'Business name required' });

  const row = {
    email, business_name,
    about: b.about || null,
    fb_page: b.fb_page || null,
    website: b.website || null,
    status: 'onboarding',
    onboarded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/marketing_leads?on_conflict=email`, {
      method: 'POST',
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) { const t = await r.text(); return j(500, { error: 'Could not save: ' + t }); }
  } catch (e) { return j(500, { error: String(e.message || e) }); }

  // Best-effort owner alert — never blocks the customer's success screen.
  if (RESEND_KEY && RESEND_FROM) {
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#10241c">
      <h2 style="font-size:18px;margin:0 0 12px">🐎 New Marketing Agent customer — connect their page</h2>
      <table style="font-size:14px;line-height:1.7">
        <tr><td style="color:#7a8a82;padding-right:14px">Business</td><td><b>${business_name}</b></td></tr>
        <tr><td style="color:#7a8a82;padding-right:14px">Email</td><td>${email}</td></tr>
        <tr><td style="color:#7a8a82;padding-right:14px;vertical-align:top">About</td><td>${(b.about || '').replace(/</g, '&lt;')}</td></tr>
        <tr><td style="color:#7a8a82;padding-right:14px">FB Page</td><td>${(b.fb_page || '').replace(/</g, '&lt;')}</td></tr>
        <tr><td style="color:#7a8a82;padding-right:14px">Website</td><td>${(b.website || '').replace(/</g, '&lt;')}</td></tr>
      </table>
      <p style="font-size:13px;color:#3c5249;margin-top:16px">Next: get a page token for their FB page, then enroll them via <code>autopilot-enroll</code> (owner_email=${email}, mode=post).</p>
    </div>`;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: RESEND_FROM, to: [OWNER], subject: `New Marketing Agent customer — ${business_name}`, html }),
      });
    } catch (_) {}
  }

  return j(200, { ok: true });
};

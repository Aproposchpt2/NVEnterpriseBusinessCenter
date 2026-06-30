'use strict';
// Business Center — member login: request a sign-in code. Emails a 6-digit OTP to a
// returning member (matched in biz_center_members). Never reveals whether an email exists.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const RESEND_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL;

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const j = (c, o) => ({ statusCode: c, headers: CORS, body: JSON.stringify(o) });
const sbH = () => ({ apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return j(405, { error: 'POST only' });
  if (!SUPABASE_URL || !SKEY) return j(500, { error: 'Supabase env not set' });

  let b; try { b = JSON.parse(event.body || '{}'); } catch (_) { return j(400, { error: 'Invalid request' }); }
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return j(400, { error: 'Valid email required' });

  const base = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/biz_center_members`;
  try {
    const found = await fetch(`${base}?email=eq.${encodeURIComponent(email)}&select=id,full_name`, { headers: sbH() }).then(r => r.json()).catch(() => []);
    if (Array.isArray(found) && found.length) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await fetch(`${base}?email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', headers: { ...sbH(), Prefer: 'return=minimal' }, body: JSON.stringify({ login_code: code, login_code_expires: expires }) });
      if (RESEND_KEY && RESEND_FROM) {
        const first = String(found[0].full_name || '').split(' ')[0] || 'there';
        const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10241c"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c79a3e;font-weight:700;margin-bottom:10px">Apropos Business Center</div><p style="font-size:15px;color:#3c5249">Hi ${first}, here is your secure sign-in code:</p><div style="font-size:34px;font-weight:800;letter-spacing:.18em;color:#10623f;background:#e6f1ea;border:1px solid #cfe3d6;border-radius:12px;padding:16px;text-align:center;margin:14px 0">${code}</div><p style="font-size:13px;color:#7a8a82">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p></div>`;
        await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: RESEND_FROM, to: [email], subject: 'Your Business Center sign-in code', html }) }).catch(() => {});
      }
    }
  } catch (_) { /* swallow — never reveal */ }
  return j(200, { ok: true });
};

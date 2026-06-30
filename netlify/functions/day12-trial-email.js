// Apropos Business Center — Day-12 trial-expiry email.
// Runs daily: finds members STILL on trial whose trial ends ~2 days out, and emails the
// "your trial ends in 2 days — continue for $24.99/mo" nudge with the Stripe payment link.
// The +2-day calendar window matches each member exactly once, so no duplicate sends.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const RESEND_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
const PAY_LINK = 'https://buy.stripe.com/8x29AScw27OD14L0Mw7EQ1a';
const SITE = 'https://aibizcenter.aproposgroupllc.com';

const sbH = () => ({ apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' });

// Calendar day that is `daysAhead` days from now (UTC), as [start, nextDay).
function dayWindow(daysAhead) {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() + daysAhead);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function trialEndingSoon() {
  const { start, end } = dayWindow(2);
  const q = `biz_center_members?subscription_status=eq.trial&trial_end=gte.${start}&trial_end=lt.${end}&select=email,full_name,business_name,trial_end`;
  const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${q}`, { headers: sbH() });
  if (!r.ok) return [];
  return await r.json().catch(() => []);
}

async function sendNudge(m) {
  if (!RESEND_KEY || !RESEND_FROM || !m.email) return false;
  const first = String(m.full_name || '').split(' ')[0] || 'there';
  const biz = String(m.business_name || 'your business').replace(/</g, '&lt;');
  const subject = 'Your Business Center trial ends in 2 days';
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#10241c">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c79a3e;font-weight:700;margin-bottom:10px">Apropos Business Center</div>
    <h2 style="font-family:Georgia,serif;font-size:20px;margin:0 0 12px">${first}, your free trial ends in 2 days.</h2>
    <p style="font-size:15px;line-height:1.6;color:#3c5249">You've been building <b>${biz}</b> inside the Business Center. To keep your AI Business Advisor, assessment, contract matching, document generator, website tools, and everything else, continue for just <b>$24.99/month</b>.</p>
    <p style="font-size:15px;line-height:1.6;color:#3c5249">No interruption — your dashboard, plan, and progress stay exactly where you left them.</p>
    <a href="${PAY_LINK}" style="display:inline-block;background:#10623f;color:#fff;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:10px;margin:8px 0 14px">Subscribe Now — $24.99/month &rarr;</a>
    <p style="font-size:13px;color:#7a8a82">Or return to your dashboard: <a href="${SITE}" style="color:#10623f">${SITE}</a></p>
    <p style="font-size:12px;color:#9aa8a0;margin-top:18px">Apropos Business Center &middot; Cancel anytime.</p>
  </div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: [m.email], subject, html }),
    });
    return r.ok;
  } catch (_) { return false; }
}

export const handler = async () => {
  if (!SUPABASE_URL || !SKEY) return { statusCode: 200, body: 'supabase not configured' };
  let sent = 0, found = 0;
  try {
    const members = await trialEndingSoon();
    found = members.length;
    for (const m of members) { if (await sendNudge(m)) sent++; }
  } catch (e) { return { statusCode: 200, body: 'error: ' + String(e.message || e) }; }
  return { statusCode: 200, body: `day12 nudge: ${sent}/${found} sent` };
};

export const config = { schedule: '0 16 * * *' }; // daily ~9am Pacific

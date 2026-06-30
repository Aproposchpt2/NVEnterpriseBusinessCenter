// Apropos Message Horse — the in-house, set-and-forget daily messaging engine.
// Each day it generates an on-brand message and delivers it. Fully self-owned:
//   - Generates the post with Claude (on-brand voice, rotating value props).
//   - Posts it straight to the Facebook PAGE via the Meta Graph API (legit, ToS-safe).
//   - Emails the share-ready version to the owner (to one-tap share to a personal feed).
//
// MODE (env MESSAGE_HORSE_MODE): 'email' (default — review-only), 'post' (auto-post to FB),
//   or 'both'. Start in 'email' to watch it for a few days, then flip to 'both' and forget it.
//
// Runs on a daily schedule AND can be hit manually (GET the function URL) to test.

const FB_API = 'https://graph.facebook.com/v21.0';
const MODEL = process.env.MESSAGE_MODEL || 'claude-sonnet-4-6';
const SITE = 'https://aibizcenter.aproposgroupllc.com';

const THEMES = [
  { key: 'business-center', url: 'https://aibizcenter.aproposgroupllc.com',            brief: 'The Apropos Business Center is a real, online, full-service business center that DOES the work instead of advising — it hands you the finished plan, documents, website, and the contracts. The whole business journey, start to grow, in one place.' },
  { key: 'contrast',        url: 'https://aibizcenter.aproposgroupllc.com',            brief: "What a government-funded business development center won't do — Apropos does. No costume, no smoke and mirrors: a self-funded federal contractor and licensed Nevada corporation, built to deliver real results, not host another class." },
  { key: 'contracts',       url: 'https://nevadastategen.aproposgroupllc.com',         brief: 'Stop scrolling through endless pages of open and closed government contracts. StateGen brings the contracts to YOU — matched to your business, ranked, and ready to bid (Nevada and California live now).' },
  { key: 'capgen',          url: 'https://capgen.aproposgroupllc.com',                 brief: 'CapGen builds your brand, your website, your content, and your proposals FOR you — not a blank template, the finished thing. The creation work, done.' },
  { key: 'opportunity',     url: 'https://aibizcenter.aproposgroupllc.com',            brief: 'We provide opportunity — the kind that leads to success. Find the money and programs you actually qualify for, matched to your situation, in minutes.' },
  { key: 'documents',       url: 'https://aibizcenter.aproposgroupllc.com/#documents', brief: 'Need an NDA, an LLC operating agreement, a service contract, or a clean invoice? Generate a real, ready-to-use business document in minutes — drafted for your business.' },
  { key: 'free',            url: 'https://aibizcenter.aproposgroupllc.com/#start',     brief: 'Start FREE. Your tailored business plan, your business documents, and a 24/7 AI business assistant — free. We earn your business by delivering, not by charging at the door.' },
];

function pickTheme() {
  // Rotate by day so the message stays fresh and never repeats two days running.
  const dayIndex = Math.floor(Date.now() / 86400000);
  return THEMES[dayIndex % THEMES.length];
}

async function generateMessage(theme) {
  const link = theme.url || SITE;
  if (!process.env.ANTHROPIC_API_KEY) {
    return `${theme.brief}\n\nStart free at ${link}`;
  }
  const prompt = `You write the daily Facebook post for the Apropos Business Center (an online full-service business center built by Apropos Group LLC — a self-funded federal contractor and licensed Nevada corporation).

Voice: confident, plain-spoken, a little bold — a founder who is "about it," not all talk. Real, never corporate-stiff, never spammy.

Today's angle: ${theme.brief}

Write ONE Facebook post:
- A strong first-line hook that stops the scroll.
- 1–3 short paragraphs of real value (what it does FOR them, not buzzwords).
- A clear call to action ending with the link ${link}
- At most 1–2 relevant hashtags (or none). No emoji spam — one or two at most, only if natural.
- Do NOT name or attack any specific organization. Critique the "all talk, no delivery" model in general if relevant.
- Output ONLY the post text, ready to publish. No preamble, no quotes around it.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'AI generation failed');
  const text = (data.content || []).map(c => c.text || '').join('').trim();
  return text || `${theme.brief}\n\nStart free at ${link}`;
}

// A system-user token isn't a page token. Resolve the page's OWN access token
// (the canonical, ToS-safe way for New Pages Experience): try the page node,
// then /me/accounts (the system user's managed pages). Returns {id, token, diag}.
async function resolvePageContext(token, pageId) {
  const diag = {};
  // 1) Direct page node
  try {
    const r = await fetch(`${FB_API}/${pageId}?fields=access_token,name&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    diag.direct = r.ok ? (d.access_token ? 'got-token' : 'no-token') : (d?.error?.message || ('HTTP ' + r.status));
    if (r.ok && d.access_token) return { id: pageId, token: d.access_token, diag };
  } catch (e) { diag.direct = String(e.message || e); }
  // 2) /me/accounts — the pages this (system) user manages, each with a page token
  try {
    const r = await fetch(`${FB_API}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (r.ok && Array.isArray(d.data)) {
      diag.accounts = d.data.length;
      const match = d.data.find(p => p.id === pageId) || d.data[0];
      if (match && match.access_token) return { id: match.id, token: match.access_token, diag };
    } else {
      diag.accounts = d?.error?.message || ('HTTP ' + r.status);
    }
  } catch (e) { diag.accounts = String(e.message || e); }
  return { id: pageId, token, diag };
}

async function postToFacebook(message) {
  const pageId = process.env.FB_PAGE_ID || '61573363201770';
  const token = process.env.FB_PAGE_TOKEN;
  if (!token) return { posted: false, reason: 'FB_PAGE_TOKEN not set' };
  try {
    const ctx = await resolvePageContext(token, pageId);
    const r = await fetch(`${FB_API}/${ctx.id}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: ctx.token }),
    });
    const d = await r.json();
    if (!r.ok) return { posted: false, error: d?.error?.message || ('HTTP ' + r.status), diag: ctx.diag };
    return { posted: true, id: d.id, diag: ctx.diag };
  } catch (e) { return { posted: false, error: String(e.message || e) }; }
}

async function emailOwner(message, fb) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.MESSAGE_RECIPIENT || process.env.RESEND_TO_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !to || !from) return { emailed: false, reason: 'Resend env not set' };
  const status = fb && fb.posted ? '✅ Already posted to your Facebook Page — share it to your personal feed too.'
    : 'Copy/paste this to your Page and personal feed.';
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#10241c">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c79a3e;font-weight:700;margin-bottom:10px">Apropos Message Horse · Today's post</div>
    <div style="font-size:13px;color:#3c5249;margin-bottom:16px">${status}</div>
    <div style="background:#fbf9f3;border:1px solid #e3ddcf;border-radius:12px;padding:20px;white-space:pre-wrap;font-size:15px;line-height:1.6">${String(message).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>
  </div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject: "Today's Apropos post — ready to share", html }),
    });
    return { emailed: r.ok };
  } catch (e) { return { emailed: false, error: String(e.message || e) }; }
}

export const config = { schedule: '0 15 * * *' }; // ~8am Pacific daily

export default async (req) => {
  // ?dry=1 → generate + preview the post (and its link) WITHOUT publishing.
  let dry = false;
  try { dry = new URL(req.url).searchParams.get('dry') === '1'; } catch (_) {}

  const mode = dry ? 'preview' : (process.env.MESSAGE_HORSE_MODE || 'email').toLowerCase();
  const theme = pickTheme();
  let message;
  try { message = await generateMessage(theme); }
  catch (e) { message = `${theme.brief}\n\nStart free at ${theme.url || SITE}`; }

  const result = { ran: new Date().toISOString(), theme: theme.key, link: theme.url || SITE, mode };
  if (!dry && (mode === 'post' || mode === 'both')) result.facebook = await postToFacebook(message);
  if (!dry && (mode === 'email' || mode === 'both')) result.email = await emailOwner(message, result.facebook);
  result.message = message;

  return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

// Apropos Message Horse — the in-house, set-and-forget messaging engine.
// Each scheduled run selects an approved theme, generates an on-brand message,
// and delivers it according to the controlled publishing mode.
//
// MODE (env MESSAGE_HORSE_MODE):
//   paused  — stop immediately; do not generate, email, or publish
//   email   — generate and email for review
//   post    — generate and publish to the Facebook Page
//   both    — publish to Facebook and email the completed post
//
// The function also supports ?dry=1 for a generation-only preview.

const FB_API = 'https://graph.facebook.com/v21.0';
const SITE = 'https://aibizcenter.aproposgroupllc.com';
const VALID_MODES = new Set(['paused', 'email', 'post', 'both', 'preview']);

const THEMES = [
  {
    key: 'business-center',
    url: 'https://aibizcenter.aproposgroupllc.com',
    hashtags: '#SmallBusiness #BusinessGrowth',
    brief: 'The Apropos Business Center is a real, online, full-service business center that DOES the work instead of advising — it hands you the finished plan, documents, website, and the contracts. The whole business journey, start to grow, in one place.'
  },
  {
    key: 'contrast',
    url: 'https://aibizcenter.aproposgroupllc.com',
    hashtags: '#SmallBusiness #BusinessSupport',
    brief: "What a government-funded business development center won't do — Apropos does. No costume, no smoke and mirrors: a self-funded federal contractor and licensed Nevada corporation, built to deliver real results, not host another class."
  },
  {
    key: 'contracts',
    url: 'https://nevadastategen.aproposgroupllc.com',
    hashtags: '#GovernmentContracting #SmallBusiness',
    brief: 'Stop scrolling through endless pages of open and closed government contracts. StateGen brings the contracts to YOU — matched to your business, ranked, and ready to bid (Nevada and California live now).'
  },
  {
    key: 'capgen',
    url: 'https://capgen.aproposgroupllc.com',
    hashtags: '#BusinessDevelopment #SmallBusiness',
    brief: 'CapGen builds your brand, your website, your content, and your proposals FOR you — not a blank template, the finished thing. The creation work, done.'
  },
  {
    key: 'opportunity',
    url: 'https://aibizcenter.aproposgroupllc.com',
    hashtags: '#BusinessOpportunity #SmallBusiness',
    brief: 'We provide opportunity — the kind that leads to success. Find the money and programs you actually qualify for, matched to your situation, in minutes.'
  },
  {
    key: 'documents',
    url: 'https://aibizcenter.aproposgroupllc.com/#documents',
    hashtags: '#BusinessDocuments #SmallBusiness',
    brief: 'Need an NDA, an LLC operating agreement, a service contract, or a clean invoice? Generate a real, ready-to-use business document in minutes — drafted for your business.'
  },
  {
    key: 'free',
    url: 'https://aibizcenter.aproposgroupllc.com/#start',
    hashtags: '#SmallBusinessResources #SmallBusiness',
    brief: 'Start FREE. Your tailored business plan, your business documents, and a 24/7 AI business assistant — free. We earn your business by delivering, not by charging at the door.'
  }
];

function getEnv(name) {
  try {
    const netlifyValue = globalThis.Netlify?.env?.get(name);
    if (netlifyValue != null && netlifyValue !== '') return netlifyValue;
  } catch (_) {
    // Fall back to process.env for local development and legacy runtime support.
  }
  return process.env[name];
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function pickTheme() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  return THEMES[dayIndex % THEMES.length];
}

function fallbackMessage(theme) {
  return `${theme.brief}\n\nLearn more: ${theme.url || SITE}\n\n${theme.hashtags}`;
}

async function generateMessage(theme) {
  const link = theme.url || SITE;
  const apiKey = getEnv('ANTHROPIC_API_KEY');
  const model = getEnv('MESSAGE_MODEL') || 'claude-sonnet-4-6';

  if (!apiKey) return fallbackMessage(theme);

  const prompt = `You write the Facebook post for an approved Apropos Group LLC campaign asset.

Voice: confident, plain-spoken, useful, and credible. Never corporate-stiff, exaggerated, or spammy.

Today's approved angle: ${theme.brief}

Write ONE Facebook post:
- Begin with a strong first-line hook.
- Use 1–3 short paragraphs focused on what the asset does for the business.
- Include a clear call to action ending with this exact link: ${link}
- End with these exact approved hashtags, in this order: ${theme.hashtags}
- Do not add, replace, or invent hashtags.
- Do not name or attack any organization.
- Do not promise guaranteed business, funding, contracts, revenue, or outcomes.
- Output only the ready-to-publish post text. No preamble and no quotation marks.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'AI generation failed');

  const text = (data.content || []).map(item => item.text || '').join('').trim();
  return text || fallbackMessage(theme);
}

async function resolvePageContext(token, pageId) {
  const diagnostics = {};

  try {
    const response = await fetch(`${FB_API}/${pageId}?fields=access_token,name&access_token=${encodeURIComponent(token)}`);
    const data = await response.json();
    diagnostics.direct = response.ok
      ? (data.access_token ? 'got-token' : 'no-token')
      : (data?.error?.message || `HTTP ${response.status}`);

    if (response.ok && data.access_token) {
      return { id: pageId, token: data.access_token, diagnostics };
    }
  } catch (error) {
    diagnostics.direct = String(error?.message || error);
  }

  try {
    const response = await fetch(`${FB_API}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
    const data = await response.json();

    if (response.ok && Array.isArray(data.data)) {
      diagnostics.accounts = data.data.length;
      const match = data.data.find(page => page.id === pageId) || data.data[0];
      if (match?.access_token) {
        return { id: match.id, token: match.access_token, diagnostics };
      }
    } else {
      diagnostics.accounts = data?.error?.message || `HTTP ${response.status}`;
    }
  } catch (error) {
    diagnostics.accounts = String(error?.message || error);
  }

  return { id: pageId, token, diagnostics };
}

async function postToFacebook(message) {
  const pageId = getEnv('FB_PAGE_ID') || '61573363201770';
  const token = getEnv('FB_PAGE_TOKEN');

  if (!token) return { posted: false, reason: 'FB_PAGE_TOKEN not set' };

  try {
    const context = await resolvePageContext(token, pageId);
    const response = await fetch(`${FB_API}/${context.id}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: context.token })
    });
    const data = await response.json();

    if (!response.ok) {
      return {
        posted: false,
        error: data?.error?.message || `HTTP ${response.status}`,
        diagnostics: context.diagnostics
      };
    }

    return { posted: true, id: data.id, diagnostics: context.diagnostics };
  } catch (error) {
    return { posted: false, error: String(error?.message || error) };
  }
}

async function emailOwner(message, facebookResult) {
  const apiKey = getEnv('RESEND_API_KEY');
  const recipient = getEnv('MESSAGE_RECIPIENT') || getEnv('RESEND_TO_EMAIL');
  const sender = getEnv('RESEND_FROM_EMAIL');

  if (!apiKey || !recipient || !sender) {
    return { emailed: false, reason: 'Resend environment variables are not set' };
  }

  const status = facebookResult?.posted
    ? 'Already posted to your Facebook Page — share it to your personal feed too.'
    : 'Review and copy/paste this message when approved.';

  const escapedMessage = String(message)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#10241c">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c79a3e;font-weight:700;margin-bottom:10px">Apropos Message Horse · Campaign post</div>
    <div style="font-size:13px;color:#3c5249;margin-bottom:16px">${status}</div>
    <div style="background:#fbf9f3;border:1px solid #e3ddcf;border-radius:12px;padding:20px;white-space:pre-wrap;font-size:15px;line-height:1.6">${escapedMessage}</div>
  </div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: sender,
        to: Array.isArray(recipient) ? recipient : [recipient],
        subject: 'Apropos campaign post — ready to review',
        html
      })
    });

    return { emailed: response.ok };
  } catch (error) {
    return { emailed: false, error: String(error?.message || error) };
  }
}

export const config = { schedule: '0 15 * * *' }; // 15:00 UTC; approximately 8am Pacific during daylight time.

export default async request => {
  let dryRun = false;
  try {
    dryRun = new URL(request.url).searchParams.get('dry') === '1';
  } catch (_) {
    // Scheduled invocation may not provide a conventional browser URL.
  }

  const requestedMode = dryRun
    ? 'preview'
    : String(getEnv('MESSAGE_HORSE_MODE') || 'email').trim().toLowerCase();

  // Fail closed for unknown values. An invalid mode must never publish.
  const mode = VALID_MODES.has(requestedMode) ? requestedMode : 'paused';
  const ran = new Date().toISOString();

  // A true kill switch: no AI generation, email, or Facebook call occurs.
  if (mode === 'paused') {
    return jsonResponse({
      ran,
      mode,
      skipped: true,
      reason: requestedMode === 'paused'
        ? 'MESSAGE_HORSE_MODE is paused.'
        : `Unrecognized MESSAGE_HORSE_MODE value: ${requestedMode}`
    });
  }

  const theme = pickTheme();
  let message;

  try {
    message = await generateMessage(theme);
  } catch (error) {
    console.error('Message Horse generation failed:', error?.message || error);
    message = fallbackMessage(theme);
  }

  const result = {
    ran,
    theme: theme.key,
    link: theme.url || SITE,
    hashtags: theme.hashtags,
    mode
  };

  if (!dryRun && (mode === 'post' || mode === 'both')) {
    result.facebook = await postToFacebook(message);
  }

  if (!dryRun && (mode === 'email' || mode === 'both')) {
    result.email = await emailOwner(message, result.facebook);
  }

  result.message = message;
  return jsonResponse(result);
};
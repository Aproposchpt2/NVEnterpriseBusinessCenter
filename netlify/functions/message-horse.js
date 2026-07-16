// Apropos Message Horse - controlled campaign publishing engine.
//
// MESSAGE_HORSE_MODE:
//   paused - stop immediately; do not generate, email, or publish
//   email  - generate and email for review
//   post   - generate and publish to the Facebook Page
//   both   - publish to Facebook and email the completed post
//
// Add ?dry=1 for a generation-only preview.

const FB_API = 'https://graph.facebook.com/v21.0';
const SITE = 'https://nevadaenterprise.org/';
const VALID_MODES = new Set(['paused', 'email', 'post', 'both', 'preview']);

const THEMES = [
  {
    key: 'business-center',
    url: 'https://nevadaenterprise.org/',
    hashtags: '#SmallBusiness #BusinessGrowth',
    brief: 'The Apropos Business Center is a real online full-service business center that helps produce finished business plans, business documents, websites, and contract support. The business journey from startup through growth is available in one place.'
  },
  {
    key: 'contrast',
    url: 'https://nevadaenterprise.org/',
    hashtags: '#SmallBusiness #BusinessSupport',
    brief: 'Apropos provides practical business support built around useful deliverables, responsible guidance, and clear next steps rather than generic instruction alone.'
  },
  {
    key: 'contracts',
    url: 'https://nevadastategen.aproposgroupllc.com',
    hashtags: '#GovernmentContracting #SmallBusiness',
    brief: 'StateGen helps businesses discover Nevada and California government contract opportunities that align with their capabilities, reducing the time spent searching scattered procurement sources.'
  },
  {
    key: 'capgen',
    url: 'https://capgen.aproposgroupllc.com',
    hashtags: '#BusinessDevelopment #SmallBusiness',
    brief: 'CapGen supports business development through brand, website, content, opportunity intelligence, and proposal-development services designed around practical business needs.'
  },
  {
    key: 'opportunity',
    url: 'https://nevadaenterprise.org/',
    hashtags: '#BusinessOpportunity #SmallBusiness',
    brief: 'Apropos Group LLC helps businesses discover programs, resources, and government-marketplace opportunities that may align with their capabilities and stage of development.'
  },
  {
    key: 'documents',
    url: 'https://nevadaenterprise.org/#documents',
    hashtags: '#BusinessDocuments #SmallBusiness',
    brief: 'Businesses can prepare practical documents such as NDAs, operating agreements, service contracts, and invoices using information specific to their operations. Describe them as business documents, not legal documents or legal services.'
  },
  {
    key: 'free',
    url: 'https://nevadaenterprise.org/#start',
    hashtags: '#SmallBusinessResources #SmallBusiness',
    brief: 'Businesses can begin with free planning resources, business-document tools, and business-assistance features before deciding which additional services fit their needs.'
  }
];

function getEnv(name) {
  try {
    const value = globalThis.Netlify?.env?.get(name);
    if (value != null && value !== '') return value;
  } catch (_) {
    // Fall through for local development and legacy runtime support.
  }
  return process.env[name];
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
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

Voice: confident, plain-spoken, useful, and credible. Never exaggerated, corporate-stiff, or spammy.

Approved campaign angle: ${theme.brief}

Write ONE Facebook post:
- Begin with a strong first-line hook.
- Use 1-3 short paragraphs focused on what the asset does for a business.
- End the call to action with this exact link: ${link}
- End with these exact approved hashtags, in this order: ${theme.hashtags}
- Do not add, replace, or invent hashtags.
- Use the term business documents. Never claim Apropos provides legal documents, legal advice, or legal services.
- Do not name or attack any organization.
- Do not promise guaranteed business, funding, contracts, revenue, or outcomes.
- Use plain ASCII punctuation. Use a hyphen instead of an em dash.
- Output only the ready-to-publish post text.`;

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
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
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
    ? 'Already posted to your Facebook Page - share it to your personal feed too.'
    : 'Review and copy/paste this message when approved.';

  const escapedMessage = String(message)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#10241c">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c79a3e;font-weight:700;margin-bottom:10px">Apropos Message Horse - Campaign post</div>
    <div style="font-size:13px;color:#3c5249;margin-bottom:16px">${status}</div>
    <div style="background:#fbf9f3;border:1px solid #e3ddcf;border-radius:12px;padding:20px;white-space:pre-wrap;font-size:15px;line-height:1.6">${escapedMessage}</div>
  </div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        from: sender,
        to: Array.isArray(recipient) ? recipient : [recipient],
        subject: 'Apropos campaign post - ready to review',
        html
      })
    });

    return { emailed: response.ok };
  } catch (error) {
    return { emailed: false, error: String(error?.message || error) };
  }
}

export const config = { schedule: '0 15 * * *' };

export default async request => {
  let dryRun = false;
  try {
    dryRun = new URL(request.url).searchParams.get('dry') === '1';
  } catch (_) {
    // Scheduled invocations may not provide a conventional browser URL.
  }

  const requestedMode = dryRun
    ? 'preview'
    : String(getEnv('MESSAGE_HORSE_MODE') || 'email').trim().toLowerCase();

  const mode = VALID_MODES.has(requestedMode) ? requestedMode : 'paused';
  const ran = new Date().toISOString();

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
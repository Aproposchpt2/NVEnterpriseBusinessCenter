const FB_API = 'https://graph.facebook.com/v21.0';
const RUN_ONCE_AT = Date.parse('2026-07-17T04:35:00Z');
const WINDOW_MS = 10 * 60 * 1000;

const MESSAGE = `Many capable businesses never pursue government contracts because finding the right opportunity can be difficult, fragmented, and time-consuming.

The National Government Contract Center is conducting a short survey to better understand how businesses search for government opportunities, where they encounter challenges, and what support would help them compete more effectively.

Your experience can help shape better tools and services for the business community.

Complete the survey: https://govcontractsurvey.aproposgroupllc.com/?source=facebook&utm_campaign=government-contract-opportunity-survey&utm_content=message-horse-live-test

#GovernmentContracting #SmallBusiness #BusinessSurvey`;

function getEnv(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}

async function resolvePageContext(token, pageId) {
  const direct = await fetch(`${FB_API}/${pageId}?fields=access_token,name&access_token=${encodeURIComponent(token)}`);
  const directData = await direct.json();
  if (direct.ok && directData.access_token) {
    return { id: pageId, token: directData.access_token };
  }

  const accounts = await fetch(`${FB_API}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
  const accountsData = await accounts.json();
  if (accounts.ok && Array.isArray(accountsData.data)) {
    const match = accountsData.data.find(page => page.id === pageId) || accountsData.data[0];
    if (match?.access_token) return { id: match.id, token: match.access_token };
  }

  return { id: pageId, token };
}

async function postToFacebook(message) {
  const pageId = getEnv('FB_PAGE_ID') || '61573363201770';
  const token = getEnv('FB_PAGE_TOKEN');
  if (!token) throw new Error('FB_PAGE_TOKEN is not configured.');

  const context = await resolvePageContext(token, pageId);
  const response = await fetch(`${FB_API}/${context.id}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ message, access_token: context.token })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Facebook returned HTTP ${response.status}.`);
  return data.id;
}

export default async () => {
  const now = Date.now();
  if (Math.abs(now - RUN_ONCE_AT) > WINDOW_MS) {
    console.log('Survey Facebook test skipped outside the authorized one-time window.');
    return;
  }

  try {
    const postId = await postToFacebook(MESSAGE);
    console.log(`Survey Facebook test published successfully: ${postId}`);
  } catch (error) {
    console.error('Survey Facebook test failed:', error instanceof Error ? error.message : String(error));
  }
};

export const config = {
  schedule: '35 4 17 7 *'
};

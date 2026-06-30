// Apropos Business Center — Business Document Generator (real assistance).
// Generates actual, usable business documents from a few inputs. No smoke and mirrors:
//   - With ANTHROPIC_API_KEY → a complete, professionally-drafted document via Claude.
//   - Without it → a structured starter draft from the inputs, so it works today.
// Every document carries a "review before use" disclaimer (not legal advice).

const MODEL = process.env.DOC_MODEL || 'claude-sonnet-4-6';

const DOCS = {
  nda:        'Mutual Non-Disclosure Agreement (NDA)',
  operating:  'LLC Operating Agreement',
  contractor: 'Independent Contractor Agreement',
  service:    'Service Agreement / Statement of Work',
  invoice:    'Professional Invoice',
  proposal:   'Business Proposal',
  privacy:    'Website Privacy Policy',
  terms:      'Website Terms of Service',
  demand:     'Demand Letter for an Unpaid Invoice',
};

function clean(v, max) { return String(v || '').trim().slice(0, max || 800); }

function intake(body) {
  return {
    docType: clean(body.docType, 40).toLowerCase(),
    businessName: clean(body.businessName, 160) || 'Your Business',
    state: clean(body.state, 60),
    party: clean(body.party, 200),
    details: clean(body.details, 2000),
    amount: clean(body.amount, 40),
  };
}

function buildPrompt(i, label) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `You are a small-business attorney's drafting assistant. Draft a clear, professional, ready-to-use ${label} that a non-lawyer can actually use today. Date it ${today}.

PARTY / CONTEXT
- Business (first party): ${i.businessName}
- State / jurisdiction: ${i.state || '(not given — use a neutral, state-agnostic version and note where state law applies)'}
- Other party: ${i.party || '(not given — use a clearly bracketed placeholder)'}
- Amount / figures (if relevant): ${i.amount || '(none given)'}
- Specifics from the user: ${i.details || '(none given — use sensible standard terms)'}

RULES
- Produce the COMPLETE document with every standard section/clause expected for a ${label}.
- Use clear, plain language. Fill in everything you can from the inputs.
- Use bracketed placeholders like [SIGNATURE] or [DATE] ONLY where the user genuinely didn't provide the info — never leave a section vague.
- Include a signature block. For an invoice, include line items, totals, payment terms, and due date.
- Output ONLY the document itself (markdown headings ok). No preamble, no commentary, no "here is your document."`;
}

async function aiDoc(i, label) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3500, messages: [{ role: 'user', content: buildPrompt(i, label) }] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'AI generation failed');
  const text = (data.content || []).map(c => c.text || '').join('').trim();
  if (!text) throw new Error('Empty AI response');
  return text;
}

function starterDoc(i, label) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const other = i.party || '[OTHER PARTY]';
  const st = i.state || '[STATE]';
  return `# ${label}

**Date:** ${today}
**Between:** ${i.businessName} ("Company") and ${other} ("Counterparty")
**Governing law:** State of ${st}

## 1. Purpose
${i.details || 'This agreement sets out the terms between the parties named above.'}

## 2. Terms
[The detailed terms for a ${label} go here — the AI draft fills every standard clause automatically once connected.]

## 3. Payment / Consideration
${i.amount ? 'Amount: ' + i.amount + '.' : '[Amount and payment terms].'}

## 4. Term & Termination
[Start date, duration, and how either party may end this agreement.]

## 5. Signatures
${i.businessName}: ______________________  Date: __________

${other}: ______________________  Date: __________`;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad JSON' }) }; }
  const i = intake(body);
  const label = DOCS[i.docType];
  if (!label) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Pick a document type.' }) };

  let document, mode;
  try {
    if (process.env.ANTHROPIC_API_KEY) { document = await aiDoc(i, label); mode = 'ai'; }
    else { document = starterDoc(i, label); mode = 'starter'; }
  } catch (e) {
    document = starterDoc(i, label); mode = 'starter-fallback';
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      mode,
      docLabel: label,
      businessName: i.businessName,
      document,
      disclaimer: 'This is an AI-generated starting template for your convenience — not legal advice. Review it carefully and have a qualified professional review it before you sign or rely on it.',
    }),
  };
};

'use strict';

// Nevada Enterprise Business Center — Morgan Advisor function.
// Morgan is the post-assessment Business Advisor for NEBC.
// Live model provider: OpenAI.
// Fallback mode keeps the UI usable if OPENAI_API_KEY is unavailable.

const MODEL = process.env.ASSISTANT_MODEL || 'gpt-4o-mini';
const SUPA  = process.env.SUPABASE_URL;
const SKEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REQUIRED_CLOSE = 'Do you have any further questions for me?';

const CATALOG = {
  plan:       { label: 'Business Plan & Assessment',          kind: 'included', href: '#start',     desc: 'Your tailored plan, readiness score, and 30-day action plan.' },
  documents:  { label: 'Business Documents',                  kind: 'included', href: '#documents', desc: 'Generate contracts, agreements, proposals, invoices, and core business documents.' },
  website:    { label: 'Website Design Advisory',             kind: 'included', href: '/website-builder.html', desc: 'A guided website advisory path for building a professional web presence.' },
  proposal:   { label: 'Proposal Writer',                     kind: 'addon',    href: '#assistant', desc: 'Proposal support for selected opportunities. Coming soon / add-on.' },
  capgen:     { label: 'Federal Contract Opportunities',      kind: 'included', href: 'https://capgenmkt.aproposgroupllc.com', desc: 'Federal contract intelligence through CapGen.' },
  nevada:     { label: 'Nevada State Contract Opportunities', kind: 'included', href: 'https://nevadastategen.aproposgroupllc.com', desc: 'Nevada state and local contract intelligence.' },
  california: { label: 'California State Contract Opportunities', kind: 'included', href: 'https://calstategen.aproposgroupllc.com', desc: 'California state and local contract intelligence.' },
  funding:    { label: 'Capital & Funding Advisory',          kind: 'included', href: '#assistant', desc: 'Funding readiness guidance inside Morgan’s Office.' },
  registration:{ label: 'Business Registration Advisory',     kind: 'included', href: '#assistant', desc: 'Business formation, EIN, licensing, and registration guidance.' },
};

const CATALOG_LINES = Object.entries(CATALOG)
  .map(([id, s]) => `- ${id} [${s.kind}] — ${s.label}: ${s.desc}`)
  .join('\n');

const DEPARTMENTS = {
  'website-advisory': { label: 'Enter Website Design Advisory →', href: '/website-builder.html', primary: true },
  planning:           { label: 'Business Assessment & Planning →', href: '/assessment.html' },
  proposals:          { label: 'Contract Proposal Writing (Coming Soon)', href: '#' },
  marketing:          { label: 'Marketing & Promotions Advisory (Coming Soon)', href: '#' },
  funding:            { label: 'Capital & Funding Advisory →', href: '#' },
  registration:       { label: 'Business Registration Advisory →', href: '#' },
  federal:            { label: 'Federal Contract Opportunities →', href: 'https://capgenmkt.aproposgroupllc.com', blank: true },
  nevada:             { label: 'Nevada State Contract Opportunities →', href: 'https://nevadastategen.aproposgroupllc.com', blank: true },
  california:         { label: 'California State Contract Opportunities →', href: 'https://calstategen.aproposgroupllc.com', blank: true },
};

const DEPARTMENT_LINES = Object.entries(DEPARTMENTS)
  .map(([id, s]) => `- ${id} — ${s.label}: ${s.href}`)
  .join('\n');

const WEBSITE_REDIRECT_RULE = `WEBSITE REDIRECT RULE:
When the user expresses interest in building a website, getting a website, redesigning a website, or asks about web presence, first explain the business readiness reason in one or two sentences. Do not gather website requirements in Morgan’s Office. Give a short handoff to Website Design Advisory and include this final routing tag on its own line:
[[OPEN: website-advisory]]`;

const ROUTING_RULE = `DEPARTMENT ROUTING:
When an action requires a department or platform, end your reply with one final line in exactly this form:
[[OPEN: id1, id2]]
Valid ids: website-advisory, planning, proposals, marketing, funding, registration, federal, nevada, california.
Use at most 3 ids. Never explain the tag. The app reads it and removes it from the user-facing response.
Do not route before interpreting the issue and explaining why the destination is appropriate.`;

const KNOWLEDGE_BASE = `
PLATFORM IDENTITY:
You are Morgan, the professional Business Development Advisor inside Nevada Enterprise Business Center, an online full-service business center operated by Apropos Group LLC. NEBC is not a chatbot site and not a generic AI tool. It is a premium business services center powered by technology and guided by intelligence.

APPROVED FIRST-TIME FLOW:
Homepage → Start Free Business Assessment → Intake Form → Report Creation Screen → Assessment Report Renders From the Top → Save / Print Report → Morgan’s Office → Morgan Post-Assessment Interview.

APPROVED MORGAN STANDARD v1:
Morgan is NEBC’s professional post-assessment Business Development Advisor. Morgan interprets the assessment before recommending services, evaluates readiness, identifies one primary recommendation first, answers advisory questions directly when appropriate, routes only when action or specialized service is required, and maintains a professional, premium, clear, trustworthy, business-first voice.

ADVISOR IDENTITY RULES:
- Operate as a professional Business Development Advisor, post-assessment advisor, and business-first advisory resource.
- Do not present yourself as a generic chatbot, casual helper, homepage assistant, lawyer, tax advisor, lender, grant approval authority, or contract award authority.
- Do not invent NEBC services, departments, pricing, eligibility rules, URLs, or assessment facts.

ADVISORY METHOD:
Use this sequence whenever assessment or member context is available:
1. Acknowledge the assessment or saved profile context.
2. Interpret what the information means in plain business language.
3. Identify strengths.
4. Identify gaps.
5. Evaluate readiness.
6. Identify one primary next step first.
7. Explain why that step matters and what action is required.
8. Answer advisory questions directly when no outside action is required.
9. Route only when the user needs a service, platform, department, or specialist.

READINESS EVALUATION:
Evaluate readiness in practical business terms, including formation readiness, documentation readiness, financial readiness, funding readiness, website/digital presence readiness, contract readiness, compliance readiness, and operational readiness. Distinguish between what the user wants and what the business appears ready to pursue.

PRIORITY DISCIPLINE:
Recommend one primary next step first. Provide no more than two supporting next steps unless the user asks for a detailed plan. Do not present many equal priorities or overwhelm the user.

CHAT VS REDIRECT:
Answer advisory questions inside Morgan’s Office, including: NAICS code basics, SAM registration concepts, LLC/EIN/licensing readiness questions, CapGen explanation, certification guidance, readiness score explanation, gap analysis, action planning, and priority sequencing.
Redirect only when the user needs to take action in another department or platform: begin website advisory, open CapGen/StateGen, begin a purchase/free-access path, start a department workflow, or access a specialized platform.

GOVERNMENT CONTRACT READINESS:
You may discuss SAM.gov readiness, UEI, NAICS, capability statements, certifications, past performance, bid/no-bid discipline, proposal readiness, and compliance awareness. Do not promise contract awards, guarantee procurement success, or push users into opportunity pursuit before readiness gaps are addressed.

FUNDING READINESS:
You may discuss funding preparation, business planning, use of funds, documentation readiness, financial organization, cash-flow awareness, and general grant/loan readiness concepts. Do not promise funding, predict approvals, guarantee loans or grants, claim investor interest, or make lending decisions.

WEBSITE AND DIGITAL PRESENCE:
You may identify digital credibility gaps such as no website, weak online credibility, poor branding, missing contact information, no professional email, weak mobile readiness, unclear service descriptions, or lack of trust-building content. Route to Website Design Advisory when the website or digital presence gap affects business credibility or readiness.

CAPGEN FAMILY HANDOFF:
NEBC membership includes access to the CapGen family suite: Federal CapGen, Nevada StateGen, and CalStateGen.
Public Visitor Path: Visitors may view demos or marketing previews. Platform access requires paid subscription through the centralized Product Purchase / Offer site.
NEBC Member Path: NEBC members receive included access but must verify eligibility through the “Already an NEBC Member?” free-access gate. The free-access gate uses OTP/access code validation and may require an email instruction flow. Free-access validation does not replace CapGen onboarding. CapGen onboarding intake remains required because it builds the personal dashboard, connects the business profile, and supports contract record scanning and matching. One-login access should support the CapGen family suite.

ESCALATION BOUNDARIES:
Escalate or recommend qualified support when the user needs legal advice, tax advice, accounting advice, investment advice, lending approval guidance, loan qualification decisions, licensing disputes, compliance interpretation, government investigation guidance, contract legal interpretation, specialist review, billing/access/membership issue review, or an Orchestrator workflow decision.

PROHIBITED BEHAVIOR:
Do not provide legal, tax, accounting, funding, investment, or contract-award determinations. Do not promise business success, customers, approvals, funding, grants, loans, contracts, certifications, or revenue. Do not route before interpreting. Do not contradict approved NEBC standards.

TONE:
Professional, calm, confident, premium, clear, trustworthy, business-first, and first-class. Avoid generic chatbot phrases, excessive enthusiasm, emojis, “I’m just an AI,” vague motivational language, unsupported claims, and “How can I help you today?” as a default post-assessment opening.

ROOMS / DEPARTMENTS:
${DEPARTMENT_LINES}

LEGACY ROOM LIST:
${CATALOG_LINES}
`;

const STAGE1 = `You are Morgan, a professional Business Development Advisor at Nevada Enterprise Business Center.
The user is in the first advisory session after completing the Business Assessment Report.
Do not behave like a generic chatbot. Lead the session like a professional business consultant.
Your interview flow:
1. Acknowledge that the assessment is complete.
2. Interpret what the report means; do not simply repeat raw report data.
3. Explain the strongest relevant strengths.
4. Explain the highest-impact gaps.
5. Evaluate practical readiness.
6. Identify one highest-priority next step first.
7. Explain why that step matters and what action is required.
8. Answer advisory questions in chat when guidance is appropriate.
9. Route only when an action or specialized service is required.
10. Confirm the recommended next step.
Every advisory response must close with: ${REQUIRED_CLOSE}`;

const STAGE2 = `You are Morgan, a professional Business Development Advisor at Nevada Enterprise Business Center.
The user is a returning member. The user may lead the session, but you still answer as a business advisor, not a generic chatbot.
Use saved profile context when available to support follow-up, progress review, next-step clarification, and user-led advisory questions.
Do not claim assessment facts you do not have.
Continue to interpret before recommending, recommend one primary next step first, and route only when action or specialized service is required.
Every advisory response must close with: ${REQUIRED_CLOSE}`;

const LEGACY_SYSTEM = `You are Morgan, the professional Business Development Advisor inside Nevada Enterprise Business Center. You may receive context from the assessment page even when the frontend does not provide an explicit Morgan stage. Treat assessment-context conversations as Morgan’s Office advisory conversations. If no assessment or member context is available, do not invent facts; direct the user to the assessment or returning-member sign-in path when needed.

${STAGE1}

${WEBSITE_REDIRECT_RULE}

${ROUTING_RULE}

${KNOWLEDGE_BASE}`;

function morganSystem(stage, firstName, context) {
  const name = (firstName && String(firstName).trim()) || 'there';
  const base = (Number(stage) === 2 ? STAGE2 : STAGE1).replaceAll('[First Name]', name);
  let sys = `${base}\n\n${WEBSITE_REDIRECT_RULE}\n\n${ROUTING_RULE}\n\n${KNOWLEDGE_BASE}`;
  sys += `\n\nIMPORTANT: If a first greeting has already been delivered by the frontend, do not repeat it. Continue naturally from the user's most recent message.`;
  if (context) sys += `\n\nClient context: use it to tailor your help, never read it back verbatim, and never invent details you do not have. Interpret the context, identify strengths and gaps, and recommend one primary next step first.\n${context}`;
  return sys;
}

function ensureClosing(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return REQUIRED_CLOSE;
  if (cleaned.toLowerCase().includes(REQUIRED_CLOSE.toLowerCase())) return cleaned;
  return `${cleaned}\n\n${REQUIRED_CLOSE}`;
}

function extractActions(reply, catalog) {
  const m = String(reply || '').match(/\[\[\s*OPEN\s*:([^\]]*)\]\]/i);
  if (!m) return { text: String(reply || '').trim(), actions: [] };
  const text = String(reply || '').slice(0, m.index).trim();
  const ids = m[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const seen = new Set();
  const actions = [];
  for (const id of ids) {
    if (seen.has(id) || !catalog[id]) continue;
    seen.add(id);
    const s = catalog[id];
    const a = { id, label: s.label, href: s.href };
    if (s.kind) a.kind = s.kind;
    if (s.primary) a.primary = true;
    if (s.blank) a.blank = true;
    actions.push(a);
    if (actions.length >= 3) break;
  }
  return { text: text || String(reply || '').trim(), actions };
}

function fallback(messages) {
  const last = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const reply = `I’m Morgan, your Business Development Advisor. I can continue once the OpenAI connection is available. Based on your last question — “${String(last).slice(0, 140)}” — the safest next step is to review your assessment, identify the highest-priority gap, and route you only when an action is required.\n\n${REQUIRED_CLOSE}`;
  return { text: reply, actions: [] };
}

async function supa(path, opts = {}) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function saveMorganSession({ sessionId, userEmail, stage, messages }) {
  if (!SUPA || !SKEY || !sessionId) return;
  const row = {
    id: sessionId,
    user_email: userEmail || null,
    stage: String(stage || 'morgan'),
    messages,
    updated_at: new Date().toISOString(),
  };
  try {
    await supa('morgan_sessions', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  } catch (_) {}
}

async function callOpenAI(system, messages) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.35,
      max_tokens: 900,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error?.message || 'OpenAI advisor error');
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  let messages = Array.isArray(body.messages) ? body.messages : [];
  messages = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
    .slice(-12);

  if (!messages.length) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Say something to Morgan.' }) };

  const morganMode = body.stage === 1 || body.stage === 2 || body.stage === '1' || body.stage === '2';
  const context = String(body.context || '').slice(0, 6000);
  const catalog = morganMode ? DEPARTMENTS : CATALOG;
  let system = morganMode
    ? morganSystem(body.stage, body.firstName, context)
    : (context ? `${LEGACY_SYSTEM}\n\nClient context:\n${context}` : LEGACY_SYSTEM);

  if (body.document_context) {
    system += `\n\nThe user has shared a document. Use its content to give more specific, tailored advice. Document content:\n${String(body.document_context).slice(0, 14000)}`;
  }

  if (!process.env.OPENAI_API_KEY) {
    const { text, actions } = fallback(messages);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, mode: 'fallback', provider: 'openai', reply: text, actions }) };
  }

  try {
    const raw = await callOpenAI(system, messages);
    const extracted = extractActions(raw, catalog);
    const reply = ensureClosing(extracted.text || "I'm here — could you say a bit more?");
    if (morganMode || context) {
      await saveMorganSession({ sessionId: body.sessionId, userEmail: body.userEmail, stage: body.stage || 'morgan', messages: messages.concat([{ role: 'assistant', content: reply }]) });
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, mode: 'ai', provider: 'openai', reply, actions: extracted.actions }) };
  } catch (e) {
    const { text, actions } = fallback(messages);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, mode: 'fallback', provider: 'openai', reply: text, actions, error: e.message || 'OpenAI advisor error' }) };
  }
};
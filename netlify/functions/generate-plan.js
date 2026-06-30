// Apropos Business Center — AG ENGINEERING OS™ onboarding engine
// Intake -> AI diagnosis -> readiness score -> plan -> dashboard -> Supabase record.

const OPENAI_MODEL = process.env.PLAN_MODEL || 'gpt-4o-mini';

const SECTIONS = [
  'Executive Summary',
  'Company Overview',
  'Products & Services',
  'Market & Target Customer',
  'Competitive Edge',
  'Marketing & Sales Strategy',
  'Operations',
  'Milestones & Roadmap',
  'Financial Outline',
  'Funding Needs',
];

const { recommend } = require('./_recommend');

function clean(s, max = 600) { return String(s || '').trim().slice(0, max); }
function arr(v) { return Array.isArray(v) ? v.map(x => clean(x, 80)).filter(Boolean) : []; }

function intakeFrom(body) {
  const city = clean(body.city, 80);
  const state = clean(body.state, 80);
  return {
    fullName: clean(body.fullName || body.ownerName, 120),
    email: clean(body.email, 160).toLowerCase(),
    phone: clean(body.phone, 60),
    businessName: clean(body.businessName, 140) || 'Your Business',
    industry: clean(body.industry, 120),
    city,
    state,
    location: clean(body.location, 160) || [city, state].filter(Boolean).join(', '),
    businessStageInput: clean(body.businessStage || body.stage, 80) || 'not_sure',
    businessStatus: arr(body.businessStatus),
    servicesNeeded: arr(body.servicesNeeded),
    otherNeeds: clean(body.otherNeeds || body.idea || body.goal, 1200),
    targetCustomer: clean(body.targetCustomer || body.target, 700),
  };
}

function readinessScore(i, diagnosis) {
  const s = new Set(i.businessStatus);
  const n = new Set(i.servicesNeeded);
  const established = s.has('registered') || s.has('gov_regs');
  const foundation = (s.has('startup') ? 10 : 0) + (established ? 20 : 0) + (n.has('ein') ? 0 : 10);
  const marketing = (n.has('website') ? 0 : 10) + (established ? 5 : 0) + ((n.has('federal_contracts') || n.has('state_contracts')) ? 5 : 0);
  const operations = (established ? 10 : 0) + (n.has('ein') ? 0 : 5);
  const growth = (n.has('federal_contracts') ? 5 : 0) + (n.has('state_contracts') ? 5 : 0) + (diagnosis.businessStage === 'WIN CONTRACTS' ? 5 : 0);
  const government = (s.has('registered') ? 5 : 0) + (s.has('gov_regs') ? 5 : 0);
  const total = Math.max(0, Math.min(100, foundation + marketing + operations + growth + government));
  let rating = 'Starting Point';
  if (total >= 75) rating = 'Strong Foundation';
  else if (total >= 50) rating = 'Building Momentum';
  else if (total >= 25) rating = 'Early Foundation';
  return {
    total,
    max: 100,
    rating,
    categories: [
      { name: 'Foundation', score: foundation, max: 40 },
      { name: 'Marketing', score: marketing, max: 20 },
      { name: 'Operations', score: operations, max: 15 },
      { name: 'Growth', score: growth, max: 15 },
      { name: 'Government Readiness', score: government, max: 10 },
    ],
  };
}

function actionPlan(i, diagnosis) {
  const wantsContracts = diagnosis.businessStage === 'WIN CONTRACTS';
  const wantsWebsite = i.servicesNeeded.includes('website');
  return [
    { week: 'Week 1', title: 'Foundation', items: ['Review your Business Assessment Report.', 'Handle the first missing requirement.', 'Save your business plan and confirm your core offer.'] },
    { week: 'Week 2', title: wantsWebsite ? 'Website & Presence' : 'Brand & Positioning', items: wantsWebsite ? ['Begin the Website Design Advisory path.', 'Clarify your offer and customer message.', 'Prepare content for your first web presence.'] : ['Clarify your brand message.', 'Confirm your business positioning.', 'Review your customer-facing presentation.'] },
    { week: 'Week 3', title: wantsContracts ? 'Contract Leads & Opportunities' : 'Marketing & Customers', items: wantsContracts ? ['Confirm your capability profile is current.', 'Review federal opportunity paths through CapGen.', 'Review state opportunity paths through the State CapGen sites.'] : ['Create first promotional messages.', 'Build a customer outreach list.', 'Use Morgan for campaign ideas.'] },
    { week: 'Week 4', title: 'Launch & Optimization', items: ['Move into the highest-priority service path.', 'Collect feedback from prospects or customers.', 'Refine the next 30-day plan with Morgan.'] },
  ];
}

function journeyTimeline(i, diagnosis) {
  const s = new Set(i.businessStatus);
  const n = new Set(i.servicesNeeded);
  const has = key => s.has(key);
  return [
    { label: 'Profile Created', status: 'complete' },
    { label: 'Assessment Generated', status: 'complete' },
    { label: 'Business Plan Generated', status: 'complete' },
    { label: 'Startup Identified', status: has('startup') ? 'complete' : 'future' },
    { label: 'Federal Contractor Status', status: has('registered') ? 'complete' : (n.has('federal_contracts') ? 'pending' : 'future') },
    { label: 'Licensed Corporation', status: has('gov_regs') ? 'complete' : (diagnosis.businessStage === 'WIN CONTRACTS' ? 'pending' : 'future') },
    { label: 'Website Path', status: n.has('website') ? 'pending' : 'future' },
    { label: 'Contract Lead Path', status: n.has('federal_contracts') || n.has('state_contracts') ? 'pending' : 'future' },
  ];
}

function serviceTimeline(recommendedServices) {
  const immediate = ['business_plan', 'formation', 'documents', 'website', 'federal_contracts', 'state_contracts', 'assistant'];
  return {
    now: recommendedServices.filter(s => immediate.includes(s.key)).slice(0, 5),
    later: recommendedServices.filter(s => !immediate.includes(s.key)).slice(0, 5),
  };
}

function buildPlanPrompt(i, diagnosis) {
  return `You are the AI Business Agent for Apropos Business Center, an online full-service business center. Write a practical business plan for the client and use the intake data to make smart assumptions.

CLIENT INTAKE
- Name: ${i.fullName || '(not provided)'}
- Email: ${i.email || '(not provided)'}
- Phone: ${i.phone || '(not provided)'}
- Business name: ${i.businessName}
- Industry: ${i.industry || '(not provided)'}
- Location: ${i.location || '(not provided)'}
- Business status selected: ${i.businessStatus.join(', ') || '(none)'}
- Services requested: ${i.servicesNeeded.join(', ') || '(none)'}
- Target customer: ${i.targetCustomer || '(not provided)'}
- Other needs: ${i.otherNeeds || '(not provided)'}
- Diagnosed path: ${diagnosis.businessStage}
- Missing items: ${diagnosis.missingItems.join(', ') || 'None identified'}

Write a tailored business plan with EXACTLY these sections, each as a "## " markdown heading, in this order:
${SECTIONS.map(s => '## ' + s).join('\n')}

Rules:
- Plainspoken, specific, and action-oriented.
- No placeholders unless truly unavoidable.
- Include concrete first moves that connect to the Apropos Business Center services.
- If the user is pursuing federal or state contracts, refer to a capability profile, CapGen, and the State CapGen sites. Do not tell a registered federal contractor they lack a capability statement.
- End after the Funding Needs section.`;
}

async function openAiPlan(i, diagnosis) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.45,
      max_tokens: 3200,
      messages: [
        { role: 'system', content: 'You write concise, practical small-business plans and recommendations.' },
        { role: 'user', content: buildPlanPrompt(i, diagnosis) },
      ],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'OpenAI plan generation failed');
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty OpenAI response');
  return text;
}

function starterPlan(i, diagnosis) {
  const ind = i.industry || 'your industry';
  const loc = i.location || 'your market';
  return `## Executive Summary
${i.businessName} is positioned as a ${diagnosis.businessStage.toLowerCase()}-path business in ${ind}${loc ? ' serving ' + loc : ''}. The immediate priority is to organize the business foundation, clarify the offer, and use the Apropos Business Center to move from intake into a structured action plan.

## Company Overview
The business should operate with a clear legal and operational foundation. Missing items identified during intake should be handled first because they affect funding, marketing, and contract readiness.

## Products & Services
The first offer should be simple, specific, and easy to explain. Focus on the service or product most likely to generate the first paying customers, then expand once demand is proven.

## Market & Target Customer
The target customer should be defined by need, location, urgency, and ability to pay. If the customer profile is unclear, the first marketing task is to identify who has the problem and where they already look for a solution.

## Competitive Edge
The business should lead with a clear promise, fast response, reliable execution, and a professional online presence. The edge must be easy for customers to understand in one sentence.

## Marketing & Sales Strategy
Start with a website, a strong offer, consistent social content, direct outreach, and follow-up. Morgan can turn this into weekly content and daily customer-facing actions.

## Operations
Document how the business receives inquiries, quotes work, delivers service, collects payment, and follows up. Simple systems should be created before volume increases.

## Milestones & Roadmap
First 7 days: complete missing foundation items and save this plan. First 30 days: activate the highest-priority service path. First 90 days: build a repeatable process and prepare contract or customer acquisition materials if needed.

## Financial Outline
Track startup costs, monthly expenses, price per sale, expected sales volume, and break-even point. The first goal is not complexity; it is clarity around how many customers or contracts are needed to cover costs and create profit.

## Funding Needs
Funding should be tied to specific uses such as website launch, equipment, marketing, inventory, or working capital. Before applying, prepare documents, business plan, basic financial assumptions, and a clear use-of-funds statement.`;
}

async function sendWelcomeEmail(i, diagnosis, readiness, trialEnd) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !i.email) return false;
  const SITE = 'https://aibizcenter.aproposgroupllc.com';
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const first = esc((i.fullName || '').split(' ')[0] || 'there');
  const score = readiness && readiness.total != null ? readiness.total : '';
  let endStr = '';
  try { endStr = trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  catch (_) { endStr = trialEnd.toISOString().slice(0, 10); }
  const priorities = ((diagnosis.missingItems && diagnosis.missingItems.length ? diagnosis.missingItems : diagnosis.nextSteps) || []).slice(0, 3);
  const priHtml = priorities.length
    ? priorities.map((p, idx) => `<tr><td style="padding:6px 0;color:#10623f;font-weight:800;width:26px;vertical-align:top">${idx + 1}.</td><td style="padding:6px 0;color:#3c5249">${esc(p)}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:6px 0;color:#3c5249">No major gaps flagged — keep building with your advisor.</td></tr>`;
  const subject = `Welcome to the Apropos Business Center, ${first}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:26px;color:#10241c">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c79a3e;font-weight:700;margin-bottom:12px">Apropos Business Center&trade;</div>
    <h1 style="font-family:Georgia,serif;font-size:24px;line-height:1.2;margin:0 0 6px">Welcome, ${first} — your assessment is ready.</h1>
    <p style="font-size:15px;line-height:1.6;color:#3c5249;margin:0 0 18px">We've reviewed <b>${esc(i.businessName)}</b> and built your assessment, plan, and recommended path inside the Business Center.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 18px"><tr>
      <td style="background:#e6f1ea;border:1px solid #cfe3d6;border-radius:12px;padding:16px;text-align:center;width:46%">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#3c5249;font-weight:700">Readiness Score</div>
        <div style="font-family:Georgia,serif;font-size:34px;font-weight:800;color:#0a4a2f;line-height:1.1">${score}<span style="font-size:16px;color:#3c5249">/100</span></div>
      </td>
      <td style="width:8px"></td>
      <td style="background:#fbf9f3;border:1px solid #e3ddcf;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#3c5249;font-weight:700">Recommended Path</div>
        <div style="font-family:Georgia,serif;font-size:22px;font-weight:800;color:#10623f;line-height:1.2;margin-top:6px">${esc(diagnosis.businessStage)}</div>
      </td>
    </tr></table>
    <div style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#7a8a82;font-weight:700;margin:0 0 6px">Your Top 3 Priorities</div>
    <table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 20px">${priHtml}</table>
    <div style="background:#fff8e8;border:1px solid #ead3a0;border-radius:12px;padding:14px 16px;font-size:14px;color:#6f4d05;margin:0 0 20px">&#9203; <b>Your 14-day free access is active</b> and runs through <b>${endStr}</b>. Keep everything you build — cancel anytime.</div>
    <a href="${SITE}/coach.html" style="display:inline-block;background:#10623f;color:#fff;text-decoration:none;font-weight:800;padding:14px 26px;border-radius:10px;margin:0 0 10px">Continue to Morgan's Office &rarr;</a>
    <p style="font-size:13px;color:#7a8a82;margin:6px 0 0">Return to your dashboard anytime: <a href="${SITE}" style="color:#10623f">${SITE}</a></p>
    <p style="font-size:12px;color:#9aa8a0;margin-top:22px">&copy; 2026 Apropos Group LLC &middot; APROPOS BUSINESS CENTER&trade; &middot; AG ENGINEERING OS&trade;</p>
  </div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [i.email], subject, html }),
  });
  return r.ok;
}

async function saveIntakeRecord(i, diagnosis, recommendedServices, plan, mode, emailSent, trialStart, trialEnd, readiness, actionPlanData, journeyData) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { saved: false, id: null, error: 'Supabase env not configured' };
  const payload = {
    full_name: i.fullName,
    email: i.email,
    phone: i.phone || null,
    business_name: i.businessName,
    industry: i.industry,
    city: i.city,
    state: i.state,
    business_stage_input: i.businessStageInput,
    business_status: i.businessStatus,
    services_needed: i.servicesNeeded,
    other_needs: i.otherNeeds || null,
    target_customer: i.targetCustomer || null,
    ai_mode: mode,
    diagnosed_stage: diagnosis.businessStage,
    missing_items: diagnosis.missingItems,
    recommended_services: recommendedServices,
    next_steps: diagnosis.nextSteps,
    business_plan: plan,
    trial_start: trialStart.toISOString(),
    trial_end: trialEnd.toISOString(),
    welcome_email_sent: emailSent,
  };
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/abc_business_center_intakes`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) return { saved: false, id: null, error: data?.message || 'Supabase insert failed' };
  return { saved: true, id: Array.isArray(data) ? data[0]?.id : data?.id, error: null };
}

async function saveMember(i, diagnosis, readiness, trialStart, trialEnd) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { saved: false, error: 'Supabase env not configured' };
  const base = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/biz_center_members`;
  const H = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };
  const profile = {
    full_name: i.fullName,
    phone: i.phone || null,
    business_name: i.businessName,
    industry: i.industry,
    city: i.city,
    state: i.state,
    business_stage: diagnosis.businessStage,
    business_status: i.businessStatus,
    services_needed: i.servicesNeeded,
    other_needs: i.otherNeeds || null,
    target_customer: i.targetCustomer || null,
    readiness_score: readiness.total,
    last_visit: new Date().toISOString(),
  };
  try {
    const found = await fetch(`${base}?email=eq.${encodeURIComponent(i.email)}&select=id`, { headers: H }).then(r => r.json()).catch(() => []);
    if (Array.isArray(found) && found.length) {
      const r = await fetch(`${base}?email=eq.${encodeURIComponent(i.email)}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify(profile) });
      return { saved: r.ok, returning: true };
    }
    const insert = { ...profile, email: i.email, subscription_status: 'trial', trial_start: trialStart.toISOString(), trial_end: trialEnd.toISOString() };
    const r = await fetch(base, { method: 'POST', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify(insert) });
    return { saved: r.ok, returning: false };
  } catch (e) { return { saved: false, error: e.message || 'member save failed' }; }
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad JSON' }) }; }
  const i = intakeFrom(body);
  if (!i.fullName || !i.email || !i.businessName || !i.industry || !i.city || !i.state) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please complete the required contact and business fields.' }) };
  }

  const diagnosis = recommend({ businessStatus: i.businessStatus, servicesNeeded: i.servicesNeeded, businessStageInput: i.businessStageInput });
  let plan, mode;
  try {
    if (process.env.OPENAI_API_KEY) { plan = await openAiPlan(i, diagnosis); mode = 'openai'; }
    else { plan = starterPlan(i, diagnosis); mode = 'starter'; }
  } catch (_) { plan = starterPlan(i, diagnosis); mode = 'starter-fallback'; }

  const recommendedServices = diagnosis.recommendedServices;
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  const readiness = readinessScore(i, diagnosis);
  const actionPlanData = actionPlan(i, diagnosis);
  const journeyData = journeyTimeline(i, diagnosis);
  const timeline = serviceTimeline(recommendedServices);

  let emailSent = false;
  try { emailSent = await sendWelcomeEmail(i, diagnosis, readiness, trialEnd); } catch (_) { emailSent = false; }

  let supabaseRecord = { saved: false, id: null, error: null };
  try { supabaseRecord = await saveIntakeRecord(i, diagnosis, recommendedServices, plan, mode, emailSent, trialStart, trialEnd, readiness, actionPlanData, journeyData); }
  catch (e) { supabaseRecord = { saved: false, id: null, error: e.message || 'Supabase save failed' }; }

  let memberRecord = { saved: false };
  try { memberRecord = await saveMember(i, diagnosis, readiness, trialStart, trialEnd); }
  catch (e) { memberRecord = { saved: false, error: e.message || 'member save failed' }; }

  return { statusCode: 200, headers, body: JSON.stringify({
    ok: true,
    mode,
    emailSent,
    supabaseRecord,
    memberRecord,
    businessName: i.businessName,
    fullName: i.fullName,
    businessStage: diagnosis.businessStage,
    missingItems: diagnosis.missingItems,
    recommendedServices,
    nextSteps: diagnosis.nextSteps,
    readiness,
    actionPlan: actionPlanData,
    journey: journeyData,
    serviceTimeline: timeline,
    trial: { day: 1, daysTotal: 14, start: trialStart.toISOString(), end: trialEnd.toISOString() },
    plan,
    disclaimer: 'This plan and dashboard are AI-generated business guidance for planning purposes only. They are not legal, tax, financial, or accounting advice.',
  }) };
};
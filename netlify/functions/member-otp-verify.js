'use strict';
// Business Center — member login: verify a sign-in code and return the saved profile so
// the front-end can reload the dashboard / prime the AI advisor with the member's context.

const { recommend } = require('./_recommend');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const j = (c, o) => ({ statusCode: c, headers: CORS, body: JSON.stringify(o) });
const sbH = () => ({ apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return j(405, { error: 'POST only' });
  if (!SUPABASE_URL || !SKEY) return j(500, { error: 'Supabase env not set' });

  let b; try { b = JSON.parse(event.body || '{}'); } catch (_) { return j(400, { error: 'Invalid request' }); }
  const email = String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return j(400, { error: 'Valid email required' });
  if (!/^\d{6}$/.test(code)) return j(400, { error: 'Enter the 6-digit code' });

  const base = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/biz_center_members`;
  try {
    const sel = 'select=full_name,business_name,business_stage,readiness_score,business_status,services_needed,agent_context,subscription_status,trial_end,login_code,login_code_expires';
    const rows = await fetch(`${base}?email=eq.${encodeURIComponent(email)}&${sel}`, { headers: sbH() }).then(r => r.json()).catch(() => []);
    const m = Array.isArray(rows) && rows[0];
    if (!m || !m.login_code || m.login_code !== code) return j(401, { ok: false, error: 'Invalid or used code' });
    if (!m.login_code_expires || new Date(m.login_code_expires).getTime() < Date.now()) return j(401, { ok: false, error: 'Code expired — request a new one' });

    // success: clear the code (one-time use), stamp the visit
    await fetch(`${base}?email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', headers: { ...sbH(), Prefer: 'return=minimal' }, body: JSON.stringify({ login_code: null, login_code_expires: null, last_visit: new Date().toISOString() }) }).catch(() => {});

    // Recompute the member's recommended next steps + reasons from their saved
    // answers, so the Agent greets returning members with the same reasoned plan.
    const rec = recommend({ businessStatus: m.business_status, servicesNeeded: m.services_needed, businessStageInput: m.business_stage });

    return j(200, { ok: true, member: {
      email,
      fullName: m.full_name,
      businessName: m.business_name,
      businessStage: m.business_stage || rec.businessStage,
      readinessScore: m.readiness_score,
      servicesNeeded: m.services_needed || [],
      recommendedServices: rec.recommendedServices,
      agentContext: m.agent_context || '',
      subscriptionStatus: m.subscription_status,
      trialEnd: m.trial_end,
    } });
  } catch (e) { return j(500, { error: String(e.message || e) }); }
};

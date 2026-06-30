'use strict';
// Marketing Agent — Stripe webhook. Keeps posting in sync with the subscription:
//   • subscription canceled / lapsed  → PAUSE the customer's Autopilot client (stop posting)
//   • subscription active / reactivated → resume it
//   • checkout completed               → record the purchase (link Stripe ↔ email)
// Manual HMAC signature verification (no stripe SDK needed; Node-18 safe).

const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || process.env.STRIP_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST || '';
const WH_SECRET = process.env.MARKETING_STRIPE_WEBHOOK_SECRET || process.env.BIZ_CENTER_MARKETING_WEBHOOK || process.env.STRIPE_WEBHOOK_SECRET || '';

const sbH = (extra = {}) => ({ apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', ...extra });

async function supa(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: sbH(opts.headers || {}) });
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : null; } catch (_) { d = t; }
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${typeof d === 'string' ? d : JSON.stringify(d)}`);
  return d;
}

function verifySig(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  sigHeader.split(',').forEach(kv => { const i = kv.indexOf('='); if (i > 0) parts[kv.slice(0, i)] = kv.slice(i + 1); });
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`, 'utf8').digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function stripeCustomerEmail(customerId) {
  if (!customerId || !STRIPE_SECRET) return null;
  try {
    const r = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, { headers: { Authorization: `Bearer ${STRIPE_SECRET}` } });
    const c = await r.json();
    return c && c.email ? String(c.email).toLowerCase() : null;
  } catch (_) { return null; }
}

// Flip the matching Autopilot client(s): by subscription id first, then by owner_email.
async function setClient(subId, email, patch) {
  let touched = 0;
  if (subId) {
    const r = await supa(`social_autopilot_clients?stripe_subscription_id=eq.${encodeURIComponent(subId)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
    touched = Array.isArray(r) ? r.length : 0;
  }
  if (!touched && email) {
    const r = await supa(`social_autopilot_clients?owner_email=eq.${encodeURIComponent(email)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
    touched = Array.isArray(r) ? r.length : 0;
  }
  return touched;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if (!verifySig(raw, sig, WH_SECRET)) return { statusCode: 400, body: 'bad signature' };

  let evt; try { evt = JSON.parse(raw); } catch (_) { return { statusCode: 400, body: 'bad json' }; }
  const type = evt.type;
  const obj = (evt.data && evt.data.object) || {};

  try {
    if (type === 'customer.subscription.deleted' ||
        (type === 'customer.subscription.updated' && obj.status && obj.status !== 'active' && obj.status !== 'trialing')) {
      const email = await stripeCustomerEmail(obj.customer);
      await setClient(obj.id, email, { status: 'paused', mode: 'paused' });
      if (email) await supa(`marketing_leads?email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'canceled', updated_at: new Date().toISOString() }) }).catch(() => {});

    } else if (type === 'customer.subscription.updated' && (obj.status === 'active' || obj.status === 'trialing')) {
      const email = await stripeCustomerEmail(obj.customer);
      await setClient(obj.id, email, { status: 'active', mode: 'post' });

    } else if (type === 'checkout.session.completed') {
      const email = String((obj.customer_details && obj.customer_details.email) || obj.customer_email || '').toLowerCase();
      if (email) {
        // record the purchase; attach Stripe ids to an existing client if onboarding already ran
        await supa('marketing_leads?on_conflict=email', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ email, status: 'purchased', stripe_customer_id: obj.customer || null, stripe_subscription_id: obj.subscription || null, updated_at: new Date().toISOString() }),
        }).catch(() => {});
        await setClient(obj.subscription, email, { stripe_customer_id: obj.customer || null, stripe_subscription_id: obj.subscription || null, status: 'active', mode: 'post' }).catch(() => {});
      }
    }
  } catch (e) {
    // Never 500 a webhook on a downstream hiccup — Stripe would retry forever.
    return { statusCode: 200, body: 'ok (handled with error: ' + String(e.message || e) + ')' };
  }
  return { statusCode: 200, body: 'ok' };
};

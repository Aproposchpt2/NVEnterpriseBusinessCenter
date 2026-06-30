'use strict';
// Apropos Business Center — subscription webhook. Keeps biz_center_members in sync with Stripe:
//   • checkout.session.completed        → link Stripe ids to the member, mark 'active'
//   • customer.subscription.updated     → map Stripe status → trial / active / cancelled / expired
//   • customer.subscription.deleted     → mark 'cancelled'
// Manual HMAC signature verification (no Stripe SDK; Node-18 safe). Matches marketing-stripe-webhook.js.

const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const WH_SECRET = process.env.STRIPE_WEBHOOK_KEY || process.env.STRIPE_WEBHOOK_SECRET || process.env.BIZ_CENTER_STRIPE_WEBHOOK || '';

const enc = encodeURIComponent;
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

// Stripe subscription status → our biz_center_members.subscription_status enum.
function mapStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'trialing': return 'trial';
    case 'active': return 'active';
    case 'past_due': return 'active';            // grace period — keep access while Stripe retries
    case 'canceled': return 'cancelled';
    case 'unpaid':
    case 'incomplete_expired': return 'expired';
    default: return null;                         // unknown/incomplete — leave the row untouched
  }
}

// Patch the member by subscription id first, then fall back to email.
async function setMember(subId, email, patch) {
  let touched = 0;
  if (subId) {
    const r = await supa(`biz_center_members?stripe_subscription_id=eq.${enc(subId)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    touched = Array.isArray(r) ? r.length : 0;
  }
  if (!touched && email) {
    const r = await supa(`biz_center_members?email=eq.${enc(email)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
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
    if (type === 'checkout.session.completed') {
      const email = String((obj.customer_details && obj.customer_details.email) || obj.customer_email || '').toLowerCase();
      await setMember(obj.subscription, email, {
        stripe_customer_id: obj.customer || null,
        stripe_subscription_id: obj.subscription || null,
        subscription_status: 'active',
      });

    } else if (type === 'customer.subscription.updated') {
      const status = mapStatus(obj.status);
      if (status) {
        const email = await stripeCustomerEmail(obj.customer);
        await setMember(obj.id, email, {
          stripe_customer_id: obj.customer || null,
          stripe_subscription_id: obj.id || null,
          subscription_status: status,
        });
      }

    } else if (type === 'customer.subscription.deleted') {
      const email = await stripeCustomerEmail(obj.customer);
      await setMember(obj.id, email, { subscription_status: 'cancelled' });
    }
  } catch (e) {
    // Never 500 a webhook on a downstream hiccup — Stripe would retry forever.
    return { statusCode: 200, body: 'ok (handled with error: ' + String(e.message || e) + ')' };
  }
  return { statusCode: 200, body: 'ok' };
};

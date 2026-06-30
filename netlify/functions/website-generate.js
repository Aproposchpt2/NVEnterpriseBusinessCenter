// Apropos Business Center — Website Generation (AG ENGINEERING OS™).
// Receives intake data, generates Fortune-500-grade copy via Claude (claude-sonnet-4-6),
// populates the approved flagship-template.html placeholders, and stores the build in
// Supabase storage (bucket: website-builds). Buckets are self-provisioned on first run.
//
// TODO: gate behind member session before production hardening.
// This endpoint is currently unauthenticated (matching the rest of the app's functions).
// (Accepted as-is for now per directive; auth is a separate security directive.)

const MODEL = process.env.WEBSITE_MODEL || 'claude-sonnet-4-6';
const SUPA  = process.env.SUPABASE_URL;
const SKEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const COPY_SYSTEM = `You are a professional website copywriter working for the Apropos Business Center. You will receive intake data about a business and generate polished, professional website copy that would impress a Fortune 500 prospect. Every line must be specific to this business — never generic. Generate copy for these sections:
1. Hero headline (powerful, Cinzel-worthy, max 6 words)
2. Hero subheadline (one compelling sentence, Fraunces italic)
3. Eyebrow label (business type + city, uppercase, max 5 words)
4. About section headline (max 8 words)
5. About body copy (2 short paragraphs, warm and specific)
6. Services section headline (max 6 words)
7. Six service card titles and descriptions (2 sentences each)
8. Why choose us — 4 stats/differentiators specific to this business
9. Three testimonial placeholders (realistic, specific to industry)
10. CTA headline (max 8 words, action-oriented)
11. CTA subtext (one sentence)
12. Footer tagline (max 10 words)
Respond ONLY in valid JSON. No preamble, no markdown, no backticks.
The JSON shape:
{"hero_headline":"","hero_subheadline":"","eyebrow":"","about_headline":"","about_body":"","services_headline":"","services":[{"title":"","description":""}],"stats":[{"number":"","label":""}],"testimonials":[{"quote":"","name":"","business":""}],"cta_headline":"","cta_subtext":"","footer_tagline":""}`;

const json = (obj, status = 200) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(obj) });
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Replace the content between a <!-- PLACEHOLDER: key --> ... <!-- /PLACEHOLDER --> pair (all occurrences).
function setPH(html, key, value) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(<!--\\s*PLACEHOLDER:\\s*' + k + '\\s*-->)[\\s\\S]*?(<!--\\s*/PLACEHOLDER\\s*-->)', 'g');
  return html.replace(re, '$1' + String(value).replace(/\$/g, '$$$$') + '$2');
}

async function ensureBucket(name) {
  try {
    await fetch(`${SUPA}/storage/v1/bucket`, {
      method: 'POST',
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name, name, public: true }),
    });
  } catch (_) { /* already exists / transient — ignore */ }
}

async function uploadObject(bucket, path, body, contentType) {
  const r = await fetch(`${SUPA}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body,
  });
  if (!r.ok) throw new Error(`storage ${r.status}: ${await r.text()}`);
  return `${SUPA}/storage/v1/object/public/${bucket}/${path}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json({}, 204);

  // GET ?serve=ID → return the stored build as proper text/html (Supabase serves it as text/plain).
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    const sid = String(q.serve || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!sid) return json({ error: 'missing serve id' }, 400);
    try {
      const r = await fetch(`${SUPA}/storage/v1/object/public/website-builds/${sid}.html`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
      if (!r.ok) return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Preview not found' };
      const out = { 'Content-Type': 'text/html; charset=utf-8' };
      if (q.download) out['Content-Disposition'] = `attachment; filename="${String(q.name || 'website').replace(/[^a-zA-Z0-9_-]/g, '-')}.html"`;
      return { statusCode: 200, headers: out, body: await r.text() };
    } catch (e) { return { statusCode: 502, headers: { 'Content-Type': 'text/plain' }, body: 'error' }; }
  }

  if (event.httpMethod !== 'POST') return json({ error: 'POST only' }, 405);
  if (!SUPA || !SKEY) return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }, 500);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500);

  let d; try { d = JSON.parse(event.body || '{}'); } catch { return json({ error: 'Bad JSON' }, 400); }
  const session_id = String(d.session_id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || ('site-' + Date.now());

  // 1) Generate copy with Claude.
  let copy;
  try {
    const intake = {
      business_type: d.business_type, business_name: d.business_name, city_state: d.city_state,
      one_liner: d.one_liner, contact: d.contact, services: d.services || [], feel: d.feel || [],
    };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: COPY_SYSTEM, messages: [{ role: 'user', content: `Intake data:\n${JSON.stringify(intake, null, 2)}\n\nGenerate the website copy now. Respond ONLY with the JSON object.` }] }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'copy generation failed');
    let raw = (data.content || []).map(c => c.text || '').join('').trim();
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    copy = JSON.parse(raw);
  } catch (e) {
    return json({ error: 'Copy generation failed: ' + String(e.message || e) }, 502);
  }

  // 2) Resolve hero image (uploaded photo → website-assets, else AI-selected Unsplash URL).
  await ensureBucket('website-builds');
  await ensureBucket('website-assets');
  let heroUrl = String(d.hero_image || '');
  try {
    if (d.hero_upload && /^data:image\/(png|jpe?g|webp);base64,/.test(d.hero_upload)) {
      const m = d.hero_upload.match(/^data:(image\/[a-z]+);base64,(.*)$/i);
      const ct = m[1]; const ext = ct.split('/')[1].replace('jpeg', 'jpg');
      const buf = Buffer.from(m[2], 'base64');
      heroUrl = await uploadObject('website-assets', `${session_id}.${ext}`, buf, ct);
    }
  } catch (e) { /* fall back to provided hero_image URL */ }

  // 3) Fetch the approved flagship template from this same site, then populate it.
  let html;
  try {
    const origin = 'https://' + (event.headers['x-forwarded-host'] || event.headers.host);
    const tr = await fetch(`${origin}/flagship-template.html`);
    if (!tr.ok) throw new Error('template fetch ' + tr.status);
    html = await tr.text();
  } catch (e) {
    return json({ error: 'Template fetch failed: ' + String(e.message || e) }, 502);
  }

  const fills = {
    business_name: d.business_name || 'Your Business',
    eyebrow: copy.eyebrow || `${d.business_type || ''} · ${d.city_state || ''}`,
    subheadline: copy.hero_subheadline || d.one_liner || '',
    about_heading: copy.about_headline || 'Who We Are',
    services_heading: copy.services_headline || 'What We Do For You',
    cta_heading: copy.cta_headline || 'Ready to Get Started?',
    cta_subtext: copy.cta_subtext || 'Contact us today for a free consultation.',
    tagline: copy.footer_tagline || 'Excellence in every detail.',
    footer_description: d.one_liner || '',
    testimonials_heading: 'Trusted by Businesses Like Yours',
    why_heading: 'Why Clients Choose Us',
    hero_cta: 'Get Started Today →',
    contact_address: d.city_state || '',
  };
  (copy.services || []).slice(0, 6).forEach((s, i) => { fills[`service_${i + 1}_name`] = s.title || ''; fills[`service_${i + 1}_desc`] = s.description || ''; });
  (copy.stats || []).slice(0, 4).forEach((s, i) => { fills[`stat_${i + 1}_num`] = s.number || ''; fills[`stat_${i + 1}_label`] = s.label || ''; });
  (copy.testimonials || []).slice(0, 3).forEach((t, i) => { fills[`testimonial_${i + 1}_text`] = t.quote || ''; fills[`testimonial_${i + 1}_name`] = t.name || ''; fills[`testimonial_${i + 1}_title`] = t.business || ''; });
  const contact = String(d.contact || '');
  if (/@/.test(contact)) fills.contact_email = contact; else if (contact) fills.contact_phone = contact;

  for (const [k, v] of Object.entries(fills)) html = setPH(html, k, esc(v));

  // Raw-HTML placeholders.
  const paras = String(copy.about_body || '').split(/\n\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('\n');
  if (paras) html = setPH(html, 'about_body', paras);
  if (heroUrl) html = setPH(html, 'hero_image', `<img class="hero-bg" src="${heroUrl}" alt="">`);
  // Hero H1 → the generated headline (the H1 placeholder is shared "business_name"; override just the hero).
  html = html.replace(/(<h1 class="hero-h1">)[\s\S]*?(<\/h1>)/, (m, a, b) => `${a}<!-- PLACEHOLDER: hero_headline -->${esc(copy.hero_headline || d.business_name || '')}<!-- /PLACEHOLDER -->${b}`);

  // 4) Store the finished site (persistence + download source).
  try {
    await uploadObject('website-builds', `${session_id}.html`, html, 'text/html; charset=utf-8');
  } catch (e) {
    return json({ error: 'Storage failed: ' + String(e.message || e) }, 502);
  }

  // Serve via the function so it renders as text/html (Supabase serves stored HTML as text/plain).
  const origin = 'https://' + (event.headers['x-forwarded-host'] || event.headers.host);
  const preview_url = `${origin}/.netlify/functions/website-generate?serve=${session_id}`;
  return json({ ok: true, session_id, preview_url });
};

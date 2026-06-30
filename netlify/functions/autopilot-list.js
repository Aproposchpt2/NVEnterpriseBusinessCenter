// Apropos Social Autopilot — admin status view. GET ?admin_key=<AUTOPILOT_ADMIN_KEY>
// Lists every client and its health (last run, last post, last error). No tokens.

const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (!SUPA || !SKEY) return json({ error: 'SUPABASE env not set' }, 500);
  if (!process.env.AUTOPILOT_ADMIN_KEY) return json({ error: 'AUTOPILOT_ADMIN_KEY not set' }, 500);

  let key; try { key = new URL(req.url).searchParams.get('admin_key'); } catch (_) { key = null; }
  if (key !== process.env.AUTOPILOT_ADMIN_KEY) return json({ error: 'unauthorized' }, 401);

  const fields = 'id,business_name,owner_email,page_id,default_link,post_hour_utc,mode,status,last_run_at,last_post_id,last_error,created_at';
  try {
    const r = await fetch(`${SUPA}/rest/v1/social_autopilot_clients?select=${fields}&order=created_at.asc`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data }, 500);
    return json({ count: Array.isArray(data) ? data.length : 0, clients: data });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

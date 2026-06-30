// Apropos Business Center — Website Builder intake agent "Alex" (AG ENGINEERING OS™).
// Returns a single warm, 1-sentence acknowledgment after each intake answer.
// Degrades to a friendly scripted line if the API is unavailable, so the flow never stalls.

const MODEL = process.env.WEBSITE_AGENT_MODEL || 'claude-sonnet-4-6';

const SYSTEM = `You are Alex, the Website Design Agent at the Apropos Business Center. You guide business owners through a friendly, 5-question intake to gather everything needed to build their professional website. You ask one question at a time. You are warm, encouraging, and make the user feel confident even if they are unprepared. After each answer, give a brief warm acknowledgment (1 sentence) before moving to the next question. After all 5 questions are answered, summarize what you've gathered and tell the user their site is being built now.`;

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad JSON' }) }; }
  const question = String(body.question || '').slice(0, 500);
  const answer = String(body.answer || '').slice(0, 1000);
  const isFinal = !!body.final;
  const fallback = isFinal
    ? "Perfect — I have everything I need. Sit tight while I build your site."
    : "Love it — that's exactly what I needed. Let's keep going.";

  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, reply: fallback }) };

  try {
    const userMsg = isFinal
      ? `The user has finished all 5 intake questions. Their summary: "${answer}". Reply with ONE short, warm sentence telling them you have everything and their site is being built now. No preamble.`
      : `The user is in the website intake. Question asked: "${question}". Their answer: "${answer}". Reply with ONE short, warm, encouraging sentence acknowledging their answer. Do NOT ask the next question — only acknowledge. No preamble, no quotes.`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 90, system: SYSTEM, messages: [{ role: 'user', content: userMsg }] }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error('agent error');
    const reply = (data.content || []).map(c => c.text || '').join('').trim();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, reply: reply || fallback }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, reply: fallback }) };
  }
};

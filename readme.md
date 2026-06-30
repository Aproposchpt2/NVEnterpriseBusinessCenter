# Apropos Business Center — the opening play

**"They teach a class about it. We hand you the plan."**

The first wedge of the Apropos Online SBDC: a person answers a few questions and walks away with a **tailored business plan**, then gets **access to the CapGen products** to actually build it. We don't advise — we execute *with* the owner. Free front door → mass traffic → tools as the value layer.

## How it works (thin proof — functional today)
- `index.html` — landing + intake + plan render + CapGen handoff (vanilla JS, no build step).
- `netlify/functions/generate-plan.js` — turns the intake into a 10-section business plan.
  - **With `ANTHROPIC_API_KEY` set** → a genuinely AI-tailored plan (model via `PLAN_MODEL`, default `claude-sonnet-4-6`).
  - **Without it** → a solid "starter plan" assembled from the owner's inputs, so the flow works immediately.
- `netlify/functions/assistant.js` — the **personal AI Business Assistant**: a 24/7 chat advisor that auto-primes with the user's generated plan. With `ANTHROPIC_API_KEY` it's a live advisor (model via `ASSISTANT_MODEL`); without it, an honest helpful fallback so the chat never breaks. This is the SBDC's #1 service (1-on-1 counseling) democratized — no waitlist, knows your business, scales to the masses.

## To finish wiring (the two things only you can set)
1. **Turn on AI tailoring** — add `ANTHROPIC_API_KEY` in Netlify env (and optionally `PLAN_MODEL`). Until then it serves the starter plan.
2. **Point the CapGen buttons at the real products** — edit `CAPGEN_LINKS` near the bottom of `index.html`:
   - `website` → currently `ai4websitedesign.com`
   - `brand` → **TODO: the CapGen content/brand app URL**
   - `proposal` → currently `nevadastategen.aproposgroupllc.com`

## Deploy
Netlify → Add new site → Import from GitHub → this repo. No build command; `netlify.toml` handles it. Pick a domain (e.g. `start.aproposgroupllc.com` or a standalone).

## Next (after the proof lands)
Expand the journey beyond START: BUILD (CapGen brand/site), WIN (StateGen contracts + bid drafting), GROW (capital/grants). Add save/email-the-plan. Institution mode — deploy on SBDC/center computers as a service they offer ("we are the SBDC; CapGen is one of our tools").

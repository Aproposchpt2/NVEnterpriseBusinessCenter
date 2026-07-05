'use strict';
// Shared recommendation + REASON engine for the Apropos Business Center.
// Turns a member's intake answers into a diagnosed path, the services we
// recommend, and a plain-English reason for each ("Because you indicated X").
// Used by generate-plan.js (fresh assessment) AND member-otp-verify.js
// (returning visit) so the AI Agent greets every member identically.

const SERVICE_LIBRARY = {
  business_plan: { label: 'Business Plan', icon: '📄', href: '#results', blurb: 'Your tailored business plan and operating roadmap.' },
  formation: { label: 'Business Formation Guidance', icon: '🏢', href: '#assistant', blurb: 'Entity setup, EIN guidance, licensing readiness, and startup checklist support.' },
  documents: { label: 'Business Documents', icon: '📑', href: '#documents', blurb: 'Generate NDAs, agreements, proposals, invoices, and other business documents.' },
  website: { label: 'Website Design', icon: '🌐', href: 'https://ai4websitedesign.com', blurb: 'Move from idea to a live customer-facing website.' },
  marketing: { label: 'Marketing Agent', icon: '📣', href: 'https://ai4-product-purchasing.ai4businesses.org/marketing-agent-offer.html', blurb: 'Create consistent promotional content and customer outreach.' },
  federal_contracts: { label: 'Federal Contract Leads', icon: '🏛', href: 'https://capgenmkt.aproposgroupllc.com', blurb: 'Federal opportunity intelligence through CapGen, matched to the business capability profile.' },
  state_contracts: { label: 'State Contract Leads', icon: '🏙', href: 'https://nevadastategen.aproposgroupllc.com', blurb: 'State and local opportunity intelligence through the State CapGen sites.' },
  proposal: { label: 'Develop My Proposal', icon: '📝', href: 'https://gcpdc.aproposgroupllc.com', blurb: 'AI-engineered government contract proposals — tailored to the solicitation, matched to your capability profile, built to win.' },
  assistant: { label: 'Morgan’s Office', icon: '💬', href: '#assistant', blurb: 'Post-assessment advisory guidance is included automatically.' },
};

function arr(v) { return Array.isArray(v) ? v.map(x => String(x || '').trim()).filter(Boolean) : []; }

function recommend(input) {
  const statuses = new Set(arr(input.businessStatus));
  const needs = new Set(arr(input.servicesNeeded));
  const stage = String(input.businessStageInput || input.businessStage || 'not_sure').toLowerCase();

  const isStartup = statuses.has('startup') || ['idea', 'starting', 'start'].includes(stage);
  const noBasics = isStartup || statuses.has('none');
  const wantsFederal = needs.has('federal_contracts') || needs.has('contracts');
  const wantsState = needs.has('state_contracts');
  const wantsContracts = ['contracts', 'win contracts'].includes(stage) || wantsFederal || wantsState || needs.has('proposal');
  const wantsWebsite = needs.has('website');
  const wantsEin = needs.has('ein');

  const missing = [];
  if (wantsEin || isStartup) missing.push('EIN');
  if (wantsWebsite) missing.push('Website');
  if (wantsContracts && !statuses.has('registered')) missing.push('Registered Federal Contractor');
  if (wantsContracts && !statuses.has('gov_regs')) missing.push('Licensed Corporation');

  const rec = [];
  const seen = new Set();
  const add = (key, reason) => { if (seen.has(key) || !SERVICE_LIBRARY[key]) return; seen.add(key); rec.push({ key, reason }); };

  add('business_plan', 'Every path starts from your tailored business plan.');
  if (noBasics || wantsEin) { add('formation', 'Because you need the foundation organized before the next stage.'); add('documents', 'Because early business records and documents need to be in place.'); }
  if (wantsWebsite) add('website', 'Because you asked for help getting your website built.');
  if (wantsFederal) add('federal_contracts', 'Because you need leads to federal government contract opportunities through CapGen.');
  if (wantsState) add('state_contracts', 'Because you need leads to state government contract opportunities through the State CapGen sites.');
  if (wantsContracts) add('proposal', 'Because contract leads become valuable when the business is ready to respond.');
  add('assistant', 'Because Morgan’s post-assessment interview is included automatically.');

  const recommendedServices = rec.slice(0, 8).map(({ key, reason }) => ({ key, ...SERVICE_LIBRARY[key], reason }));

  let businessStage = 'BUILD';
  if (noBasics) businessStage = 'START';
  if (wantsContracts) businessStage = 'WIN CONTRACTS';
  if (stage === 'growing' || stage === 'grow') businessStage = 'GROW';

  const nextSteps = [
    'Review and save your AI-generated business plan.',
    missing.length ? `Start with the missing foundation item: ${missing[0]}.` : 'Continue to Morgan’s Office for your post-assessment interview.',
    wantsContracts ? 'Use CapGen for federal leads and the State CapGen sites for state and local contract leads.' : 'Use Morgan’s Office to turn this plan into a 7-day action list.',
  ];

  return { businessStage, missingItems: missing.slice(0, 8), recommendedServices, nextSteps };
}

module.exports = { recommend, SERVICE_LIBRARY };

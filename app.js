// Apropos Business Center — shared front-end helpers (loaded on every page).
// Pure utilities only: no element lookups at load, so it is safe on any page.
const $ = id => document.getElementById(id);

function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function mdToHtml(md){const lines=String(md||'').split('\n');let html='',inList=false;const inline=s=>escapeHtml(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');for(const raw of lines){const line=raw.trim();if(/^##\s+/.test(line)){if(inList){html+='</ul>';inList=false}html+='<h2>'+inline(line.replace(/^##\s+/,''))+'</h2>';continue}if(/^[-*]\s+/.test(line)){if(!inList){html+='<ul>';inList=true}html+='<li>'+inline(line.replace(/^[-*]\s+/,''))+'</li>';continue}if(line===''){if(inList){html+='</ul>';inList=false}continue}if(inList){html+='</ul>';inList=false}html+='<p>'+inline(line)+'</p>'}if(inList)html+='</ul>';return html;}

function mdInline(s){return escapeHtml(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');}

// Session store — carries the member's profile/context between pages.
const Store = {
  get(k){try{return JSON.parse(sessionStorage.getItem(k));}catch(_){return null;}},
  set(k,v){try{sessionStorage.setItem(k,JSON.stringify(v));}catch(_){}},
  del(k){try{sessionStorage.removeItem(k);}catch(_){} }
};

// Map a recommended-service href onto the multi-page routes.
// Internal section anchors from the recommendation engine → real pages.
function resolveHref(href){
  const h=String(href||'');
  if(/^https?:|^mailto:/i.test(h))return h;
  if(h==='#assistant')return '/morgans-office.html';
  if(h==='#documents')return '/documents.html';
  if(h==='#results'||h==='#start')return '/assessment.html';
  return h;
}

// Nevada Enterprise Business Center homepage hero upgrade.
(function(){
  function applyNebcHero(){
    var home=location.pathname==='/' || /\/index\.html$/.test(location.pathname);
    var hero=document.querySelector('section.hero');
    var logo=document.querySelector('.top .logo');
    if(!home || !hero || !logo) return;

    document.title='Nevada Enterprise Business Center — An Online Full-Service Business Center';
    var meta=document.querySelector('meta[name="description"]');
    if(meta) meta.content='Nevada Enterprise Business Center is an online full-service business center powered by AG ENGINEERING OS™.';

    if(!document.getElementById('nebc-hero-css')){
      var st=document.createElement('style');
      st.id='nebc-hero-css';
      st.textContent=':root{--nebc-navy:#061b3a;--nebc-gold:#d5aa4d;--nebc-gold2:#f0c978}.top{background:rgba(3,18,44,.97)!important;border-bottom:1px solid rgba(213,170,77,.25)!important}.top .wrap{min-height:72px!important;max-width:1180px!important}.top .logo{color:#fff!important;text-transform:uppercase;letter-spacing:.055em!important;line-height:1.08!important;font-size:.86rem!important}.top .logo .mk{background:transparent!important;border:1.5px solid var(--nebc-gold);color:var(--nebc-gold)!important;width:30px!important;height:30px!important}.nav{gap:18px!important}.nav a,.nav-gear{color:#fff!important}.nav-dd-toggle{background:transparent!important;border-color:transparent!important;color:#fff!important;font-size:.78rem!important;padding:7px 8px!important}.hero.nebc-hero{height:calc(100svh - 72px);min-height:640px;max-height:820px;padding:0!important;background:#071a37!important;display:flex;align-items:stretch;isolation:isolate;overflow:hidden}.hero.nebc-hero:before{content:"";position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(2,14,34,.96) 0%,rgba(5,23,52,.88) 29%,rgba(5,23,52,.52) 50%,rgba(5,23,52,.10) 76%),url("https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2200&q=85");background-size:cover;background-position:center right;z-index:-1}.nebc-hero .wrap{width:100%;max-width:1180px!important;display:flex;align-items:center}.nebc-hero-content{width:min(50vw,570px);padding:34px 0 28px;transform:translateX(-52px)}.nebc-kicker{display:inline-flex;align-items:center;gap:9px;padding:7px 14px;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(3,18,44,.48);color:#fff;font-size:.64rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:16px}.nebc-kicker:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--nebc-gold)}.nebc-hero h1{font-family:Cinzel,serif;color:#fff;font-size:clamp(2.85rem,4.2vw,4.95rem);letter-spacing:.012em;line-height:.98;margin:0 0 12px;text-shadow:0 5px 30px rgba(0,0,0,.30)}.nebc-subtitle{font-family:Fraunces,Georgia,serif;font-style:italic;font-size:clamp(1.18rem,1.8vw,1.65rem);color:#e8c982;margin-bottom:16px}.nebc-copy{color:rgba(255,255,255,.92);font-size:clamp(.92rem,1.05vw,1.04rem);line-height:1.55;max-width:520px;margin-bottom:18px}.nebc-open-line{font-family:Fraunces,Georgia,serif;font-style:italic;color:#e8c982;font-size:clamp(1rem,1.1vw,1.08rem);font-weight:600;line-height:1.35;letter-spacing:.01em;margin:-4px 0 18px;text-shadow:0 4px 20px rgba(0,0,0,.28)}.nebc-service-row{display:grid;grid-template-columns:repeat(6,minmax(62px,1fr));gap:10px;margin:18px 0 18px;max-width:620px}.nebc-service{color:#fff;text-align:center;font-size:.66rem;font-weight:700;line-height:1.2}.nebc-service span{width:34px;height:34px;margin:0 auto 7px;display:grid;place-items:center;border:1px solid rgba(213,170,77,.55);border-radius:10px;color:var(--nebc-gold);background:rgba(3,18,44,.35)}.nebc-trust{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:20px}.nebc-trust span{border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(3,18,44,.48);color:#fff;padding:6px 10px;font-size:.58rem;font-weight:900;letter-spacing:.075em;text-transform:uppercase}.nebc-hero .cta-row{gap:12px!important}.nebc-hero .btn{padding:13px 24px!important;font-size:.82rem!important}.nebc-hero .btn-primary{background:linear-gradient(135deg,var(--nebc-gold),var(--nebc-gold2))!important;border-color:var(--nebc-gold)!important;color:#071a37!important;text-transform:uppercase;letter-spacing:.08em}.nebc-hero .btn-ghost{background:rgba(3,18,44,.45)!important;border-color:rgba(255,255,255,.35)!important;color:#fff!important;text-transform:uppercase;letter-spacing:.08em}.nebc-no-card{font-size:.7rem;color:rgba(255,255,255,.76);margin-top:7px}.expect{margin-top:0!important}@media(min-width:1500px){.nebc-hero-content{transform:translateX(-36px);width:560px}.nebc-hero h1{font-size:4.65rem}}@media(max-width:1100px){.nebc-hero-content{transform:none;width:min(58vw,560px)}.nebc-hero h1{font-size:clamp(2.6rem,5vw,4.2rem)}.nebc-service-row{grid-template-columns:repeat(3,1fr);max-width:420px}.nebc-service{text-align:left;display:flex;align-items:center;gap:8px}.nebc-service span{margin:0}}@media(max-width:900px){.hero.nebc-hero{height:auto;max-height:none;min-height:auto}.hero.nebc-hero:before{background-image:linear-gradient(180deg,rgba(2,14,34,.97),rgba(5,23,52,.72)),url("https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80");background-position:center}.nebc-hero-content{width:100%;padding:58px 0 70px}.nebc-service-row{grid-template-columns:repeat(3,1fr);max-width:440px}.top .wrap{min-height:70px!important}.nav{width:100%}}@media(max-width:600px){.nebc-service-row{grid-template-columns:repeat(2,1fr)}.nebc-hero .btn{width:100%;max-width:320px}.nebc-hero .cta-row{flex-direction:column;align-items:flex-start}.nebc-hero h1{font-size:2.45rem}}';
      document.head.appendChild(st);
    }

    logo.innerHTML='<span class="mk">N</span><span>Nevada Enterprise<br>Business Center</span>';
    hero.className='hero nebc-hero';
    hero.innerHTML='<div class="wrap"><div class="nebc-hero-content"><span class="nebc-kicker">Your Partner in Business Success</span><h1>Nevada Enterprise<br>Business Center</h1><div class="nebc-subtitle">An Online Full-Service Business Center</div><p class="nebc-copy">Everything you need to start, manage, and grow your business — all in one place. Expert support. Powerful tools. Real opportunities.</p><p class="nebc-open-line">Always open. Always ready to serve — 24/7, 365 days a year.</p><div class="nebc-service-row"><div class="nebc-service"><span>▦</span>Business<br>Formation</div><div class="nebc-service"><span>◌</span>Business<br>Support</div><div class="nebc-service"><span>↗</span>Planning &amp;<br>Strategy</div><div class="nebc-service"><span>$</span>Funding<br>Resources</div><div class="nebc-service"><span>□</span>Contract<br>Opportunities</div><div class="nebc-service"><span>◎</span>Websites &amp;<br>Branding</div></div><div class="nebc-trust"><span>Expert Guidance</span><span>Fast &amp; Secure</span><span>All-in-One Platform</span><span>Trusted by Entrepreneurs</span></div><div class="cta-row"><a href="/assessment.html" class="btn btn-primary">Start Free Trial →</a><a href="/resume.html" class="btn btn-ghost">Member Login →</a></div><div class="nebc-no-card">No credit card required</div></div></div>';
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',applyNebcHero); else applyNebcHero();
})();

// Footer platform language update.
(function(){
  function updateFooterPlatform(){
    document.querySelectorAll('.footer-platform').forEach(function(el){
      el.innerHTML='BUILT BY INNOVATIVE ENGINEERING INTELLIGENCE<br>POWERED BY ENTERPRISE TECHNOLGY OS';
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',updateFooterPlatform); else updateFooterPlatform();
})();
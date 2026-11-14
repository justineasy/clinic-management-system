// Page layout, styles and small HTML helpers.
const { http, crypto, path, here, db, METHODS, logStock, list, nowLocal, bookHits, patientLabel, patientField, resolvePatient, statusText, billStatus, hash, verify, esc, peso, today, clinics, canAccess, scope, whereClinic, clinicField, filterBar, sid, getUser, fails, hasUsers } = require('./core');

let currentPath = '/'; // set per request before the (synchronous) handler runs; used to highlight the menu
const setPath = p => { currentPath = p; };
const ICONS = { // 24x24 stroke icons
  '/': 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0',
  '/appointments': 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  '/bills': 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  '/stock': 'M10 2h4v4l4 6v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8l4-6zM8 14h8',
  '/overview': 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  '/inventory': 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  '/clinics': 'M3 21h18M5 21V7l7-4 7 4v14M10 21v-5h4v5M12 8v4M10 10h4',
  '/services': 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01',
  '/audit': 'M12 8v4l3 3M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',
  '/export': 'M12 3v12M7 10l5 5 5-5M5 21h14',
  '/staff': 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
};
const icon = p => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${p}"/></svg>`;

const SUBTITLES = {
  '/': 'Every patient across all clinics. Click History to see visits and bills.',
  '/appointments': 'Book visits and mark them done, no-show or cancelled.',
  '/bills': 'Create bills, collect payments and print receipts.',
  '/stock': 'Record medicine used or sold so the stock count stays accurate.',
  '/inventory': 'Stock and expiry dates for every clinic.',
  '/inventory/log': 'Every stock change: who, what and when.',
  '/clinics': 'Your branches. Employees are assigned to one clinic each.',
  '/staff': 'Create employee accounts, move them between clinics, reset passwords.',
  '/account': 'Change your password.',
  '/audit': 'Who did what and when: bills, voids, stock, prices, staff changes and logins.',
  '/export': 'Download bills for your accountant and keep an off-site backup.',
  '/services': 'Set prices once; staff pick them when billing and the amount fills in.',
};
function page(user, title, body) {
  const clinicName = user?.clinic_id ? db.prepare('SELECT name FROM clinics WHERE id=?').get(user.clinic_id)?.name : '';
  const link = (href, label) => `<a href="${href}" class="${(href === '/' ? currentPath === '/' || currentPath === '/patient' : currentPath.startsWith(href)) ? 'active' : ''}">${icon(ICONS[href])}<span>${label}</span></a>`;
  const pending = user ? db.prepare(`SELECT COUNT(*) n FROM booking_requests WHERE status='pending' AND ${whereClinic('clinic_id', user.role === 'owner' ? null : user.clinic_id)}`).get().n : 0;
  const shell = user ? `<header class="topbar noprint"><button type="button" class="menu-btn" aria-label="Open menu" onclick="document.body.classList.add('nav-open')"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><div class="logo">✚</div><b>ClinicHub</b>${pending ? `<a class="top-count" href="/appointments">${pending} new</a>` : ''}</header>
    <div class="scrim noprint" onclick="document.body.classList.remove('nav-open')"></div><aside class="side noprint"><div class="brand"><div class="logo">✚</div><div><b>ClinicHub</b><small>${user.role === 'owner' ? 'All clinics' : esc(clinicName)}</small></div></div>
    <div class="group">Front desk</div>${link('/appointments', 'Appointments' + (pending ? ` <em class="count">${pending}</em>` : ''))}${link('/', 'Patients')}${link('/bills', 'Billing')}${link('/stock', 'Use stock')}
    ${user.role === 'owner' ? `<div class="group">Owner</div>${link('/overview', 'Overview')}${link('/inventory', 'Inventory')}${link('/services', 'Price list')}${link('/clinics', 'Clinics')}${link('/staff', 'Staff')}${link('/audit', 'Activity log')}${link('/export', 'Reports & backup')}` : ''}
    <div class="me"><div class="avatar">${esc(user.username[0].toUpperCase())}</div><a href="/account" class="who" title="My account / change password"><b>${esc(user.username)}</b><small>${user.role} · account</small></a>
    <form method="post" action="/logout"><button class="ghost" title="Log out" aria-label="Log out"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg></button></form></div></aside>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ClinicHub</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#f4f6fb;--card:#fff;--text:#0f172a;--muted:#64748b;--line:#e8ecf3;--brand:#0d9488;--brand2:#0f766e;--soft:#ccfbf1;--red:#dc2626;--amber:#d97706;--green:#16a34a}
*{box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;margin:0;background:var(--bg);color:var(--text);font-size:14px}
a{color:var(--brand2);text-decoration:none;font-weight:500}a:hover{text-decoration:underline}
.side{position:fixed;inset:0 auto 0 0;width:240px;overflow-y:auto;background:#0b1f2a;color:#cbd5e1;padding:20px 14px;display:flex;flex-direction:column;gap:2px}
.brand{display:flex;gap:10px;align-items:center;padding:0 8px 18px}.brand b{color:#fff;font-size:16px;display:block}.brand small,.me small{color:#94a3b8;font-size:12px;display:block}
.logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#14b8a6,#0f766e);color:#fff;display:grid;place-items:center;font-size:18px}
.group{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:14px 10px 6px}
.side a{display:flex;gap:10px;align-items:center;color:#cbd5e1;padding:9px 10px;border-radius:8px;font-weight:500}.side a:hover{background:#13303f;text-decoration:none;color:#fff}
.side a.active{background:var(--brand);color:#fff}
.me{margin-top:auto;display:flex;gap:10px;align-items:center;padding:12px 8px 0;border-top:1px solid #1e3a4a}.me b{color:#fff}.side a.who{display:block;padding:0}.side a.who:hover{background:none}.me form{margin-left:auto}
.avatar{width:34px;height:34px;border-radius:50%;background:#134e4a;color:#5eead4;display:grid;place-items:center;font-weight:700}
.ghost{background:transparent;border:1px solid #334155;color:#cbd5e1;padding:7px;line-height:0}.ghost:hover{background:#13303f}
main{margin-left:240px;padding:28px 32px;max-width:1280px}main.solo{margin:0 auto;max-width:420px;padding-top:12vh}
h1{font-size:24px;margin:0 0 20px;letter-spacing:-.02em}h2{font-size:15px;margin:28px 0 10px;color:var(--text)}
.card,form.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:0 0 16px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
form.card>b:first-child{display:block;font-size:15px;margin-bottom:10px}
input,select{padding:9px 12px;margin:4px 4px 4px 0;font:inherit;border:1px solid #d6dce6;border-radius:8px;background:#fff;color:var(--text);outline:none}
input:focus,select:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--soft)}input[type=checkbox]{width:16px;height:16px;vertical-align:middle;accent-color:var(--brand)}
label{color:var(--muted);margin-right:8px}
button{padding:9px 16px;margin:4px 0;font:inherit;font-weight:600;border:0;border-radius:8px;background:var(--brand);color:#fff;cursor:pointer}button:hover{background:var(--brand2)}
button[type=button],td button{background:#eef2f7;color:var(--text);font-weight:500;padding:6px 12px}td button:hover,button[type=button]:hover{background:#e2e8f0}
main>form:not(.card){display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:14px}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:14px;margin-bottom:16px}
table{width:100%;border-collapse:collapse}th{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;background:#f8fafc}
td,th{padding:12px 16px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}tr:last-child td{border-bottom:0}tbody tr:hover,tr:hover td{background:#fafcff}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}.b-paid{background:#dcfce7;color:#166534}.b-unpaid{background:#fef3c7;color:#92400e}.b-booked{background:#dbeafe;color:#1e40af}.b-done{background:#dcfce7;color:#166534}.b-cancelled,.b-no-show{background:#fee2e2;color:#991b1b}.b-voided{background:#f1f5f9;color:#64748b;text-decoration:line-through}
.err{color:var(--red);font-weight:500}.ok:empty{display:none}.ok{background:#dcfce7;color:#166534;padding:10px 14px;border-radius:10px;font-weight:500}.err:empty,p:empty{display:none}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:8px}.stats .card{margin:0;border-top:4px solid var(--brand)}
.stats .card:nth-child(2){border-top-color:#6366f1}.stats .card:nth-child(3){border-top-color:#0ea5e9}.stats .card:nth-child(4){border-top-color:var(--amber)}
.big{font-size:26px;font-weight:700;margin-top:6px;letter-spacing:-.02em}.stats .card{color:var(--muted);font-weight:500}
.dash-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin:-12px 0 8px}.dash-head form{margin:0!important}.muted{color:var(--muted)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin-bottom:16px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;position:relative;overflow:hidden}.kpi:before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--brand)}
.kpi.t2:before{background:#6366f1}.kpi.t3:before{background:#0ea5e9}.kpi.t4:before{background:var(--amber)}
.kpi-label{color:var(--muted);font-weight:500}.kpi-sub{color:var(--muted);font-size:13px;margin-top:6px}.up{color:var(--green)}.down{color:var(--red)}
.grid2{display:grid;grid-template-columns:1.6fr 1fr;gap:16px}.grid2.even{grid-template-columns:1fr 1fr}.grid2>.card{margin:0}
.card h3{font-size:15px;margin:0 0 14px}.card h3 .muted{font-weight:400;font-size:13px}
.chart{display:flex;align-items:flex-end;gap:14px;height:200px;padding:10px 4px 0;border-bottom:1px solid var(--line)}
.col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;position:relative;outline:none}.col small{position:absolute;bottom:-22px;color:var(--muted);font-size:12px}
.barv{width:100%;max-width:44px;background:var(--brand);border-radius:4px 4px 0 0;min-height:2px;transition:background .15s}.col:hover .barv,.col:focus .barv{background:var(--brand2)}
.tip{position:absolute;bottom:calc(100% + 4px);background:#0f172a;color:#fff;padding:4px 8px;border-radius:6px;font-size:12px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .1s}.col:hover .tip,.col:focus .tip{opacity:1}
details{margin-top:30px;font-size:13px}details .wrap{margin-top:8px}
.rows{list-style:none;margin:0;padding:0}.rows li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}.rows li:last-child{border:0}.rows small{display:block;color:var(--muted);font-size:12px}.right{text-align:right;white-space:nowrap}
.share{display:block;height:8px;background:#eef2f7;border-radius:999px;overflow:hidden}.share i{display:block;height:100%;background:var(--brand);border-radius:999px}
.empty p{color:var(--muted)}
@media(max-width:900px){.grid2,.grid2.even{grid-template-columns:1fr}}
.page-sub{color:var(--muted);margin:-14px 0 20px}
form.card{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center}form.card br{display:none}form.card>b:first-child,form.card>small,#lines{flex-basis:100%}form.card>b:first-child{margin-bottom:4px}
form.card input:not([type=checkbox]):not([type=hidden]),form.card select{flex:1 1 160px;min-width:0;margin:0}form.card label{display:flex;align-items:center;gap:6px;margin:0}form.card label input,form.card label select{flex:0 1 auto!important}
form.card button:not([type=button]){margin:0}.line{display:flex;gap:8px;margin-bottom:8px}.line input{flex:1;margin:0}.line input[name=amount]{flex:0 0 140px}
.empty-row{text-align:center!important;color:var(--muted);padding:28px!important}
td.actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}td.actions form{display:flex;gap:4px;align-items:center}td.actions input,td.actions select{padding:6px 8px;margin:0;width:140px}
.receipt{max-width:420px;padding:28px}form.card.noprint{max-width:420px}.r-head{text-align:center}.r-head .logo{margin:0 auto 8px}.r-head h2{margin:0}.receipt hr{border:0;border-top:1px dashed #cbd5e1;margin:14px 0}.receipt>div{margin:3px 0}
td a{font-weight:600}
.consent{display:flex;gap:10px;align-items:flex-start;color:var(--muted);font-size:13px;margin:4px 0 14px}.consent input{margin-top:2px;flex:none}
td.detail{white-space:normal;color:var(--muted);font-size:12px;max-width:420px}.privacy{border-left:4px solid #6366f1}code{background:#eef2f7;padding:1px 6px;border-radius:4px}
.grow2{flex:2 1 260px!important}.hp{position:absolute;left:-9999px}.center{text-align:center}.auth-card .fl select{display:block;width:100%;margin:6px 0 0;padding:12px 14px}
.steps{list-style:none;counter-reset:s;padding:0;margin:26px 0 0;display:grid;gap:16px}.steps li{counter-increment:s;display:grid;grid-template-columns:34px 1fr;column-gap:12px}
.auth-brand .steps li:before{content:counter(s);margin:0;font-size:14px;grid-row:span 2;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.15);display:grid;place-items:center;font-weight:700;color:#fff}.steps b{color:#fff}.steps span{color:#99f6e4;font-size:14px}
.done-box{width:64px;height:64px;border-radius:50%;background:#dcfce7;color:#16a34a;display:grid;place-items:center;font-size:30px;font-weight:700;margin:0 0 16px}
@media(max-width:820px){.steps{display:none}}
.side a .count{font-style:normal;margin-left:auto;background:var(--amber);color:#fff;border-radius:999px;padding:1px 8px;font-size:12px}
.btn-link{display:inline-block;background:var(--soft);color:var(--brand2);padding:6px 12px;border-radius:8px;font-weight:600}.btn-link:hover{text-decoration:none;background:#99f6e4}
.requests{border-left:4px solid var(--amber)}
tr.expired td{background:#fef2f2}tr.soon td{background:#fffbeb}tr.low td.qty{color:var(--red);font-weight:700}
.auth{display:grid;grid-template-columns:1.1fr 1fr;min-height:100vh}
.auth-brand{background:radial-gradient(circle at 20% 10%,#14b8a6 0,#0f766e 45%,#0b1f2a 100%);color:#e2fdf8;padding:64px 56px;display:flex;flex-direction:column;justify-content:center}
.auth-brand h2{font-size:34px;margin:18px 0 10px;color:#fff;letter-spacing:-.02em}.auth-brand p{font-size:16px;line-height:1.6;max-width:420px;color:#ccfbf1}
.auth-brand ul{list-style:none;padding:0;margin:22px 0 0;display:grid;gap:12px}.auth-brand li:before{content:'✓';display:inline-grid;place-items:center;width:22px;height:22px;margin-right:10px;border-radius:50%;background:rgba(255,255,255,.15);font-size:12px}
.big-logo{width:56px;height:56px;font-size:26px;border-radius:16px;background:rgba(255,255,255,.15);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.auth-form{display:grid;place-items:center;padding:32px 20px}.auth-card{width:100%;max-width:380px}.auth-card h1{font-size:28px;margin:0 0 6px}.sub{color:var(--muted);margin:0 0 24px}
.fl{display:block;color:var(--text);font-weight:500;margin:0 0 14px}.fl input{display:block;width:100%;margin:6px 0 0;padding:12px 14px}
.pw{position:relative;display:block}.pw input{padding-right:64px}.eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);margin:3px 0 0;padding:6px 10px;background:transparent!important;color:var(--brand2)!important;font-size:13px}
.wide{width:100%;padding:13px;font-size:15px;margin-top:6px}.hint{color:var(--muted);font-size:13px;text-align:center;margin-top:18px}
.or{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:22px 0 14px}.or:before,.or:after{content:'';flex:1;height:1px;background:var(--line)}
.patient-cta{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #99f6e4;background:#f0fdfa;border-radius:12px;color:var(--text);transition:.15s}.patient-cta:hover{text-decoration:none;border-color:var(--brand);background:#ccfbf1;transform:translateY(-1px)}
.patient-cta b{display:block;font-size:14px}.patient-cta small{display:block;color:var(--muted);font-weight:400;font-size:13px}.cta-ic{width:38px;height:38px;flex:none;border-radius:10px;background:#fff;display:grid;place-items:center;font-size:18px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.btn-outline{display:block;text-align:center;margin-top:12px;padding:12px;border:1.5px solid var(--brand);border-radius:8px;background:#fff;color:var(--brand2);font-size:15px;font-weight:600}.btn-outline:hover{background:#f0fdfa;text-decoration:none}
.cta-go{margin-left:auto;color:var(--brand2);font-size:18px;font-weight:700}
.alert{background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:10px 14px;border-radius:10px;margin-bottom:16px;font-weight:500}
@media(max-width:820px){.auth{grid-template-columns:1fr}.auth-brand{padding:28px 24px}.auth-brand ul,.auth-brand p{display:none}.auth-brand h2{margin:10px 0 0;font-size:24px}}
.solo h1{text-align:center}.solo .card input{width:100%}.solo .card button{width:100%;padding:11px}.solo:before{content:'✚';display:grid;place-items:center;width:52px;height:52px;margin:0 auto 16px;border-radius:14px;background:linear-gradient(135deg,#14b8a6,#0f766e);color:#fff;font-size:24px}
.topbar,.scrim{display:none}
.demo-banner{background:#fef3c7;color:#92400e;text-align:center;font-size:13px;padding:7px 12px;position:relative;z-index:60}body:has(.demo-banner) .side{top:33px}
.demo-box{margin-top:18px;padding:14px;border:1px dashed #cbd5e1;border-radius:12px;display:grid;gap:8px}.demo-box b{font-size:13px;color:var(--muted)}
.demo-box button{display:flex;justify-content:space-between;align-items:center;background:#f8fafc!important;color:var(--text)!important;border:1px solid var(--line);margin:0}.demo-box button:hover{border-color:var(--brand)}.demo-box small{color:var(--muted);font-weight:400}
@media(max-width:1100px){.side{width:208px;padding:18px 10px}main{margin-left:208px;padding:24px}}
@media(max-width:1240px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:820px){
  .topbar{display:flex;position:sticky;top:0;z-index:30;align-items:center;gap:10px;background:#0b1f2a;color:#fff;padding:10px 14px;box-shadow:0 1px 4px rgba(0,0,0,.2)}
  .topbar .logo{width:30px;height:30px;font-size:15px;border-radius:8px}.menu-btn{background:transparent!important;color:#fff!important;padding:6px;margin:0 0 0 -6px;line-height:0;display:grid;place-items:center}
  .top-count{margin-left:auto;background:var(--amber);color:#fff;border-radius:999px;padding:3px 10px;font-size:12px}
  .side{width:min(280px,85vw);z-index:50;transform:translateX(-100%);transition:transform .2s ease;box-shadow:4px 0 24px rgba(0,0,0,.3)}
  body.nav-open .side{transform:none}body.nav-open .scrim{display:block;position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:40}
  main{margin:0;padding:16px}h1{font-size:21px;margin-bottom:14px}.page-sub{margin:-8px 0 16px}
  input,select,textarea{font-size:16px}
  td,th{padding:10px 12px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.kpi{padding:14px}.big{font-size:20px}.kpi-sub{font-size:12px}
  .chart{height:160px;gap:8px}.dash-head{margin:0 0 10px}.card,form.card{padding:14px 16px;border-radius:12px}
}
@media(max-width:520px){
  form.card input:not([type=checkbox]):not([type=hidden]),form.card select{flex-basis:100%}form.card .line input[name=service]{flex-basis:auto}.line input[name=amount]{flex:0 0 108px}
  form.card>button:not([type=button]){width:100%}.receipt{padding:18px}td.actions input,td.actions select{width:120px}.big{font-size:18px}
}
@media print{.noprint{display:none!important}main{margin:0;padding:0}body{background:#fff}.card{border:0;box-shadow:none}}
</style></head>
<body>${process.env.DEMO ? '<div class="demo-banner noprint">Live demo with sample data. Feel free to click around; changes reset automatically.</div>' : ''}${shell}<main class="${user ? '' : 'solo'}"><h1>${esc(title)}</h1>${user && SUBTITLES[currentPath] ? `<p class="page-sub">${SUBTITLES[currentPath]}</p>` : ''}${body}</main></body></html>`;
}
// Login / setup screen: brand panel + form card.
const STAFF_BRAND = `<p>Clinic management for all your branches: appointments, billing, inventory and earnings in one place.</p>
    <ul><li>Appointments per clinic</li><li>Billing and printable receipts</li><li>Stock and expiry tracking</li><li>Owner-only earnings overview</li></ul>`;
function authPage(title, subtitle, err, form, brand = STAFF_BRAND) {
  const html = page(null, title, '');
  const body = `<div class="auth"><section class="auth-brand"><div class="logo big-logo">✚</div><h2>ClinicHub</h2>${brand}</section>
    <section class="auth-form"><form method="post" class="auth-card"><h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p>${err ? `<div class="alert">${esc(err)}</div>` : ''}${form}</form></section></div>`;
  return html.replace(`<main class="solo"><h1>${esc(title)}</h1></main>`, () => body);
}
const pwField = (name, label, extra = '') => `<label class="fl">${label}<span class="pw"><input name="${name}" type="password" ${extra} required><button type="button" class="eye" onclick="const i=this.previousElementSibling;i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'Show':'Hide'">Show</button></span></label>`;
const table = (head, rows) => `<div class="wrap"><table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.join('') || `<tr><td colspan="${head.length}" class="empty-row">Nothing here yet.</td></tr>`}</table></div>`;
const btn = (action, fields, label, confirm) => `<form method="post" action="${action}" style="display:inline">${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}<button${confirm ? ` onclick="return confirm('${confirm}')"` : ''}>${label}</button></form>`;
const errPage = (res, u, msg, back) => send(res, page(u, 'Error', `<p class="err">${esc(msg)} <a href="${back}">Back</a></p>`), 400);

const shiftDay = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
function invClass(i) {
  const t = today(), soon = new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-CA');
  return [i.expiry && i.expiry < t ? 'expired' : i.expiry && i.expiry <= soon ? 'soon' : '', i.qty <= i.low ? 'low' : ''].join(' ');
}

const send = (res, html, code = 200) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); };
const redirect = (res, to) => { res.writeHead(303, { Location: to }); res.end(); };

module.exports = { ICONS, icon, SUBTITLES, page, STAFF_BRAND, authPage, pwField, table, btn, errPage, shiftDay, invClass, send, redirect, setPath };

// ClinicHub multi-clinic management: run with `node server.js`, open http://localhost:3737
// No dependencies: Node's built-in http, sqlite and crypto. Code lives in ./lib:
//   core.js (database + helpers), ui.js (layout), routes-desk.js (front desk), routes-owner.js (owner pages).
// On Vercel (no permanent disk) always run as the public demo with a throwaway database in /tmp.
if (process.env.VERCEL) { process.env.DB ||= '/tmp/clinichub-demo.db'; process.env.DEMO ||= '1'; }
const http = require('node:http');
const { path, here, db, list, today, getUser } = require('./lib/core');
const { page, send, redirect, setPath } = require('./lib/ui');

if (process.env.DEMO) require('./lib/demo').seedDemo();
// In the public demo, visitors must not lock each other out.
const DEMO_BLOCKED = ['POST /setup', 'POST /account', 'POST /staff/password', 'POST /staff/active'];

const routes = {};
Object.assign(routes, require('./lib/routes-desk')(routes), require('./lib/routes-owner')(routes));

// Audit log: every successful change (redirect, or a handler that sets res.audited) is recorded once, here.
const ACTIONS = {
  'POST /login': 'Logged in', 'POST /logout': 'Logged out', 'POST /setup': 'Created owner account', 'POST /account': 'Changed own password',
  'POST /patients': 'Added patient', 'POST /patients/edit': 'Edited patient', 'POST /patients/delete': 'Deleted patient data',
  'POST /appointments': 'Booked appointment', 'POST /appointments/status': 'Changed appointment status',
  'POST /requests/confirm': 'Confirmed online request', 'POST /requests/decline': 'Declined online request', 'POST /book': 'Online booking request',
  'POST /bills': 'Created bill', 'POST /bills/pay': 'Marked bill paid', 'POST /bills/void': 'Voided bill',
  'POST /stock': 'Used stock', 'POST /inventory': 'Added inventory item', 'POST /inventory/adjust': 'Adjusted stock', 'POST /inventory/delete': 'Removed inventory item',
  'POST /services': 'Added price', 'POST /services/price': 'Changed price', 'POST /services/delete': 'Removed price',
  'POST /clinics': 'Added clinic', 'POST /staff': 'Created employee', 'POST /staff/clinic': 'Moved employee', 'POST /staff/password': 'Reset employee password', 'POST /staff/active': 'Enabled/disabled employee',
};
const SECRET = new Set(['password', 'current', 'confirm', 'website']);
function audit(req, res, key, user, f) {
  if (req.method !== 'POST' || !(res.statusCode === 303 || res.audited)) return;
  const who = user?.username || (key === 'POST /login' || key === 'POST /setup' ? f.username : key === 'POST /book' ? 'patient (online)' : '?');
  const detail = Object.entries(f).filter(([k]) => !SECRET.has(k)).map(([k, v]) => `${k}=${list(v).join('|')}`).join(', ').slice(0, 400);
  const clinicId = Number(f.clinic_id) || user?.clinic_id || null;
  db.prepare('INSERT INTO audit(who,clinic_id,action,detail) VALUES(?,?,?,?)').run(who, clinicId, ACTIONS[key] || key, detail);
}

const PUBLIC = ['GET /setup', 'POST /setup', 'GET /login', 'POST /login', 'POST /logout', 'GET /book', 'POST /book'];
const OWNER_PREFIXES = ['/overview', '/inventory', '/clinics', '/staff', '/services', '/audit', '/export'];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = `${req.method} ${url.pathname}`;
  setPath(url.pathname);
  const handler = routes[key];
  if (!handler) return send(res, page(null, 'Page not found', '<p class="card">That page does not exist. <a href="/">Go home</a></p>'), 404);
  const user = getUser(req);
  if (!PUBLIC.includes(key) && !user) return redirect(res, '/login');
  if (OWNER_PREFIXES.some(p => url.pathname.startsWith(p)) && user.role !== 'owner') return send(res, page(user, 'Owner only', '<p class="err">Only the owner can see this page.</p>'), 403);
  if (process.env.DEMO && DEMO_BLOCKED.includes(key)) return send(res, page(user, 'Not in the demo', '<p class="card">Changing passwords and accounts is turned off in the public demo.</p>'), 403);
  let body = '';
  req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
  req.on('end', () => {
    const params = Object.create(null); // only bill item fields may repeat; everything else stays a string
    for (const [k, v] of (req.method === 'POST' ? new URLSearchParams(body) : url.searchParams)) params[k] = (k === 'service' || k === 'amount') && k in params ? list(params[k]).concat(v) : v;
    try { handler(req, res, user, params); audit(req, res, key, user, params); }
    catch (e) { console.error(e); send(res, page(null, 'Something went wrong', '<p class="card">Please go back and try again.</p>'), 500); }
  });
});
// Daily backup into ./backups (keeps the newest 30). Copy that folder off the server too.
function backup() {
  const fs = require('node:fs');
  const dir = here('backups'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `clinic-${today()}.db`);
  if (!fs.existsSync(file)) db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort().slice(0, -30).forEach(f => fs.unlinkSync(path.join(dir, f)));
}
if (require.main === module && process.env.DB !== ':memory:') { backup(); setInterval(backup, 36e5); }
// Start on PORT (default 3737); if another program already uses it, try the next ports.
function start(port, triesLeft = 20) {
  server.once('error', e => {
    server.removeAllListeners('listening'); // drop this attempt's callback before retrying
    if (e.code === 'EADDRINUSE' && triesLeft > 0 && !process.env.PORT) return start(port + 1, triesLeft - 1);
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use by another program. Close it or set PORT to a free number.` : e.message);
    process.exit(1);
  });
  server.listen(port, () => {
    const url = 'http://localhost:' + port;
    console.log('ClinicHub running at ' + url + '  (keep this window open)');
    if (process.env.OPEN && process.platform === 'win32') require('node:child_process').exec(`start "" ${url}`);
  });
}
// 3737, not 3000: dev tools (Vite, React) often hold localhost:3000 on IPv6 only, which hides this app without any error.
if (require.main === module) start(Number(process.env.PORT) || 3737);
module.exports = server;

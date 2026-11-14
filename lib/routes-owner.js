// Owner pages: overview, activity log, exports, inventory, clinics, staff.
const { http, crypto, path, here, db, METHODS, logStock, list, nowLocal, bookHits, patientLabel, patientField, resolvePatient, statusText, billStatus, hash, verify, esc, peso, today, clinics, canAccess, scope, whereClinic, clinicField, filterBar, sid, getUser, fails, hasUsers } = require('./core');
const { ICONS, icon, SUBTITLES, page, STAFF_BRAND, authPage, pwField, table, btn, errPage, shiftDay, invClass, send, redirect, setPath } = require('./ui');

// Receives the shared routes object so handlers can call each other (e.g. re-render a form with an error).
module.exports = routes => ({
  // ---------- owner only ----------
  'GET /overview': (req, res, u, q) => {
    if (!clinics().length) return send(res, page(u, 'Overview', '<div class="card empty"><b>Welcome to ClinicHub!</b><p>Start by adding your clinics on the <a href="/clinics">Clinics</a> page, then create staff accounts.</p></div>'));
    const c = scope(u, q), w = whereClinic('clinic_id', c) + ' AND voided=0';
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const agg = cond => one(`SELECT COALESCE(SUM(cents),0) s, COUNT(*) n FROM bills WHERE ${w} AND ${cond}`);
    const T = "created=date('now','localtime')", M = "substr(created,1,7)=strftime('%Y-%m','now','localtime')";
    // Same days of last month (1st..today's date), so mid-month numbers compare fairly.
    const LM = "created BETWEEN date('now','localtime','start of month','-1 month') AND date('now','localtime','-1 month')";
    const tday = agg(`paid=1 AND ${T}`), month = agg(`paid=1 AND ${M}`), last = agg(`paid=1 AND ${LM}`), all = agg('paid=1'), unpaid = agg('paid=0');
    const appts = one(`SELECT COUNT(*) n, SUM(status='done') d FROM appointments WHERE ${whereClinic('clinic_id', c)} AND substr(at,1,10)=?`, today());
    const change = last.s ? Math.round((month.s - last.s) / last.s * 100) : null;

    // Last 6 calendar months, empty months included so the chart has no gaps.
    const byMonth = Object.fromEntries(db.prepare(`SELECT substr(created,1,7) m, SUM(cents) s FROM bills WHERE paid=1 AND ${w} GROUP BY m`).all().map(r => [r.m, r.s]));
    const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); const k = d.toLocaleDateString('en-CA').slice(0, 7); return { k, label: d.toLocaleDateString('en-US', { month: 'short' }), s: byMonth[k] || 0 }; });
    const max = Math.max(...months.map(m => m.s), 1);

    const perClinic = db.prepare(`SELECT c.name, c.id, SUM(CASE WHEN b.paid AND b.${T} THEN cents END) t, SUM(CASE WHEN b.paid AND substr(b.created,1,7)=strftime('%Y-%m','now','localtime') THEN cents END) m,
      SUM(CASE WHEN b.paid THEN cents END) a, SUM(CASE WHEN NOT b.paid THEN cents END) un FROM clinics c LEFT JOIN bills b ON b.clinic_id=c.id AND b.voided=0 GROUP BY c.id ORDER BY m DESC, c.name`).all();
    const topMonth = Math.max(...perClinic.map(r => r.m || 0), 1);
    const services = db.prepare(`SELECT COALESCE(i.service, b.service) service, COUNT(*) n, SUM(COALESCE(i.cents, b.cents)) s FROM bills b LEFT JOIN bill_items i ON i.bill_id=b.id
      WHERE b.paid=1 AND ${whereClinic('b.clinic_id', c)} AND b.voided=0 GROUP BY 1 ORDER BY s DESC LIMIT 6`).all();
    const methods = db.prepare(`SELECT method, SUM(cents) s FROM bills WHERE paid=1 AND ${w} AND ${M} GROUP BY method ORDER BY s DESC`).all();
    const alerts = db.prepare(`SELECT i.*, c.name clinic FROM inventory i JOIN clinics c ON c.id=i.clinic_id WHERE ${whereClinic('i.clinic_id', c)}
      AND (qty <= low OR (expiry != '' AND expiry <= date('now','localtime','+30 days'))) ORDER BY expiry = '', expiry LIMIT 8`).all();

    const hour = new Date().getHours(), hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const tile = (label, v, sub, tone) => `<div class="kpi ${tone}"><div class="kpi-label">${label}</div><div class="big">${v}</div><div class="kpi-sub">${sub}</div></div>`;
    const bar = (frac) => `<span class="share"><i style="width:${Math.max(frac * 100, frac ? 2 : 0).toFixed(1)}%"></i></span>`;
    const alertText = i => i.expiry && i.expiry < today() ? `<span class="badge b-cancelled">Expired</span>` : i.expiry && i.expiry <= new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-CA') ? `<span class="badge b-unpaid">Expires ${esc(i.expiry)}</span>` : '';
    const listCard = (title, rows, empty) => `<div class="card"><h3>${title}</h3>${rows.length ? `<ul class="rows">${rows.join('')}</ul>` : `<p class="muted">${empty}</p>`}</div>`;

    send(res, page(u, 'Overview', `<div class="dash-head"><p class="muted">${hello}, ${esc(u.username)} · ${new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>${filterBar(u, q)}</div>
      <div class="kpis">
        ${tile('Earned today', peso(tday.s), `${tday.n} paid bill${tday.n === 1 ? '' : 's'}`, 't1')}
        ${tile('Earned this month', peso(month.s), change === null ? 'No data for last month yet' : `<b class="${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%</b> vs same days last month`, 't2')}
        ${tile('Unpaid (to collect)', peso(unpaid.s), `${unpaid.n} open bill${unpaid.n === 1 ? '' : 's'} · <a href="/bills">View</a>`, 't4')}
        ${tile('Appointments today', appts.n, `${appts.d || 0} done · <a href="/appointments">View</a>`, 't3')}
      </div>
      <div class="grid2">
        <div class="card"><h3>Earnings, last 6 months <span class="muted">· all time ${peso(all.s)}</span></h3>
          <div class="chart" role="img" aria-label="Earnings by month">${months.map(m => `<div class="col" tabindex="0"><span class="tip">${m.label}: ${peso(m.s)}</span><div class="barv" style="height:${(m.s / max * 100).toFixed(1)}%"></div><small>${m.label}</small></div>`).join('')}</div>
          <details class="muted"><summary>Show as table</summary>${table(['Month', 'Earned'], months.map(m => `<tr><td>${m.k}</td><td>${peso(m.s)}</td></tr>`))}</details></div>
        ${listCard(`Inventory alerts ${alerts.length ? `<span class="badge b-cancelled">${alerts.length}</span>` : ''}`, alerts.map(i => `<li><div><b>${esc(i.name)}</b><small>${esc(i.clinic)}</small></div><div class="right">${i.qty <= i.low ? `<span class="badge b-cancelled">${i.qty} ${esc(i.unit)} left</span> ` : ''}${alertText(i)}</div></li>`), 'All stock is fine. Nothing low or expiring.')}
      </div>
      <h2>Clinics this month</h2>${table(['Clinic', 'This month', '', 'Today', 'All time', 'Unpaid'], perClinic.map(r => `<tr><td><a href="?clinic=${r.id}"><b>${esc(r.name)}</b></a></td><td><b>${peso(r.m)}</b></td><td style="width:30%">${bar((r.m || 0) / topMonth)}</td><td>${peso(r.t)}</td><td>${peso(r.a)}</td><td>${r.un ? `<span class="badge b-unpaid">${peso(r.un)}</span>` : peso(0)}</td></tr>`))}
      <div class="grid2 even">
        ${listCard('Top services', services.map(s => `<li><div><b>${esc(s.service)}</b><small>${s.n}×</small></div><div class="right"><b>${peso(s.s)}</b></div></li>`), 'No paid bills yet.')}
        ${listCard('Payment methods this month', methods.map(m => `<li><div><b>${esc(m.method.toUpperCase())}</b></div><div class="right">${peso(m.s)}</div></li>`), 'No payments this month yet.')}
      </div>`));
  },

  'GET /audit': (req, res, u, q) => {
    const c = scope(u, q), who = (q.who || '').trim();
    const rows = db.prepare(`SELECT a.*, c.name clinic FROM audit a LEFT JOIN clinics c ON c.id=a.clinic_id WHERE ${whereClinic('a.clinic_id', c)} AND (? = '' OR a.who = ?) ORDER BY a.id DESC LIMIT 500`).all(who, who);
    const people = db.prepare('SELECT DISTINCT who FROM audit WHERE who IS NOT NULL ORDER BY who').all();
    const whoSelect = `<select name="who"><option value="">Everyone</option>${people.map(p => `<option ${p.who === who ? 'selected' : ''}>${esc(p.who)}</option>`).join('')}</select>`;
    send(res, page(u, 'Activity log', `${filterBar(u, q, whoSelect)}
      ${table(['When', 'Who', 'Clinic', 'What', 'Details'], rows.map(r => `<tr><td>${r.at}</td><td><b>${esc(r.who)}</b></td><td>${esc(r.clinic || '—')}</td><td>${esc(r.action)}</td><td class="detail">${esc(r.detail)}</td></tr>`))}`));
  },
  'GET /export/backup': (req, res) => {
    const fs = require('node:fs'), os = require('node:os');
    const file = path.join(os.tmpdir(), `clinichub-${crypto.randomBytes(6).toString('hex')}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const data = fs.readFileSync(file); fs.unlinkSync(file);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="clinichub-backup-${today()}.db"` });
    res.end(data);
  },
  'GET /export/bills.csv': (req, res, u, q) => {
    const day = /^\d{4}-\d{2}-\d{2}$/, c = scope(u, q), from = day.test(q.from || '') ? q.from : '0000-00-00', to = day.test(q.to || '') ? q.to : '9999-99-99';
    const rows = db.prepare(`SELECT b.id, b.created, c.name clinic, p.name patient, b.service, b.subtotal, b.discount, b.cents, b.method, b.paid, b.voided, b.void_reason, b.created_by
      FROM bills b JOIN clinics c ON c.id=b.clinic_id JOIN patients p ON p.id=b.patient_id WHERE ${whereClinic('b.clinic_id', c)} AND b.created BETWEEN ? AND ? ORDER BY b.id`).all(from, to);
    // Leading ' stops Excel from running text that starts with = + - @ as a formula.
    const cell = v => { const t = String(v ?? ''); return '"' + (/^[=+\-@]/.test(t) ? "'" : '') + t.replace(/"/g, '""') + '"'; };
    const csv = [['Receipt', 'Date', 'Clinic', 'Patient', 'Items', 'Subtotal', 'Discount', 'Total', 'Method', 'Status', 'Void reason', 'Issued by'],
      ...rows.map(b => [b.id, b.created, b.clinic, b.patient, b.service, ((b.subtotal ?? b.cents) / 100).toFixed(2), b.discount, (b.cents / 100).toFixed(2), b.method, statusText(b), b.void_reason, b.created_by])]
      .map(r => r.map(cell).join(',')).join('\r\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bills-${today()}.csv"` });
    res.end('﻿' + csv); // BOM so Excel shows ₱ and Ñ correctly
  },
  'GET /export': (req, res, u) => {
    const first = today().slice(0, 8) + '01';
    send(res, page(u, 'Reports & backup', `<form class="card" method="get" action="/export/bills.csv"><b>Download bills for your accountant (Excel / CSV)</b>
      ${clinicField(u, null, { all: true, name: 'clinic' })} <label>From <input type="date" name="from" value="${first}"></label> <label>To <input type="date" name="to" value="${today()}"></label> <button>⬇ Download CSV</button></form>
      <div class="card"><h3>Backup</h3><p class="muted">The app saves a copy every day in the <code>backups</code> folder. Also download one regularly and keep it somewhere else (Google Drive, USB), because a backup on the same computer is lost if the computer is.</p>
      <a class="btn-link" href="/export/backup">⬇ Download full backup now</a></div>`));
  },
  'GET /inventory': (req, res, u, q) => {
    const c = scope(u, q);
    const rows = db.prepare(`SELECT i.*, c.name clinic FROM inventory i JOIN clinics c ON c.id=i.clinic_id WHERE ${whereClinic('i.clinic_id', c)} AND i.name LIKE ? ORDER BY c.name, i.name`).all(`%${q.search || ''}%`);
    send(res, page(u, 'Inventory', `<form class="card" method="post" action="/inventory">
      <b>Add item</b><br>${clinicField(u, c)} <input name="name" placeholder="Medicine / item" required> <input name="qty" type="number" min="0" placeholder="Qty" required>
      <input name="unit" placeholder="Unit (box, pcs)"> <label>Expiry <input name="expiry" type="date"></label> <input name="low" type="number" min="0" value="10" title="Warn when qty is at or below this"> <button>Add</button></form>
      ${filterBar(u, q, `<input name="search" placeholder="Search item" value="${esc(q.search)}">`)}
      <p><span style="background:#fee2e2">&nbsp;Expired&nbsp;</span> <span style="background:#fef9c3">&nbsp;Expires within 30 days&nbsp;</span> <b style="color:#b91c1c">Red qty</b> = low stock · <a href="/inventory/log">Stock log (who used what)</a></p>
      ${table(['Clinic', 'Item', 'Qty', 'Expiry', 'Stock in / out', ''], rows.map(i => `<tr class="${invClass(i)}"><td>${esc(i.clinic)}</td><td>${esc(i.name)}</td><td class="qty">${i.qty} ${esc(i.unit)}</td><td>${esc(i.expiry)}</td>
        <td><form method="post" action="/inventory/adjust" style="display:inline"><input type="hidden" name="id" value="${i.id}"><input name="change" type="number" placeholder="+10 or -2" style="width:90px" required> <button>Apply</button></form></td>
        <td>${btn('/inventory/delete', { id: i.id }, 'Remove', 'Remove this item?')}</td></tr>`))}`));
  },
  'POST /inventory': (req, res, u, f) => {
    const qty = parseInt(f.qty, 10), low = parseInt(f.low, 10) || 0;
    if (!db.prepare('SELECT 1 FROM clinics WHERE id=?').get(Number(f.clinic_id)) || !f.name?.trim() || !(qty >= 0)) return errPage(res, u, 'Clinic, name and qty are required.', '/inventory');
    const { lastInsertRowid: id } = db.prepare('INSERT INTO inventory(clinic_id,name,qty,unit,expiry,low) VALUES(?,?,?,?,?,?)').run(Number(f.clinic_id), f.name.trim(), qty, f.unit || '', f.expiry || '', low);
    logStock(u, { id, name: f.name.trim(), clinic_id: Number(f.clinic_id) }, qty);
    redirect(res, '/inventory');
  },
  'POST /inventory/adjust': (req, res, u, f) => {
    const i = db.prepare('SELECT * FROM inventory WHERE id=?').get(Number(f.id)), change = parseInt(f.change, 10);
    if (!i || !change) return errPage(res, u, 'Enter a number like 10 or -2.', '/inventory');
    if (i.qty + change < 0) return errPage(res, u, `Only ${i.qty} left; cannot remove ${-change}.`, '/inventory');
    db.prepare('UPDATE inventory SET qty=qty+? WHERE id=?').run(change, i.id);
    logStock(u, i, change);
    redirect(res, '/inventory');
  },
  'GET /inventory/log': (req, res, u, q) => {
    const c = scope(u, q);
    const rows = db.prepare(`SELECT l.*, c.name clinic FROM stock_log l LEFT JOIN clinics c ON c.id=l.clinic_id WHERE ${whereClinic('l.clinic_id', c)} ORDER BY l.id DESC LIMIT 300`).all();
    send(res, page(u, 'Stock log', `${filterBar(u, q)}<p><a href="/inventory">Back to inventory</a></p>
      ${table(['When', 'Clinic', 'Item', 'Change', 'By'], rows.map(r => `<tr><td>${r.at}</td><td>${esc(r.clinic)}</td><td>${esc(r.item)}</td><td>${r.change > 0 ? '+' : ''}${r.change}</td><td>${esc(r.by)}</td></tr>`))}`));
  },
  'POST /inventory/delete': (req, res, u, f) => {
    const i = db.prepare('SELECT * FROM inventory WHERE id=?').get(Number(f.id));
    if (i) { db.prepare('DELETE FROM inventory WHERE id=?').run(i.id); logStock(u, { ...i, name: i.name + ' (removed)' }, -i.qty); }
    redirect(res, '/inventory');
  },

  'GET /clinics': (req, res, u) => {
    send(res, page(u, 'Clinics', `<form class="card" method="post" action="/clinics"><b>Add clinic</b><br><input name="name" placeholder="Clinic name" required> <input name="address" placeholder="Address" size="40"> <button>Add</button></form>
      ${table(['Name', 'Address', 'Employees'], clinics().map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.address)}</td><td>${db.prepare('SELECT COUNT(*) n FROM users WHERE clinic_id=? AND active=1').get(c.id).n}</td></tr>`))}`));
  },
  'POST /clinics': (req, res, u, f) => {
    if (!f.name?.trim()) return errPage(res, u, 'Name is required.', '/clinics');
    try { db.prepare('INSERT INTO clinics(name,address) VALUES(?,?)').run(f.name.trim(), f.address || ''); } catch { return errPage(res, u, 'That clinic name already exists.', '/clinics'); }
    redirect(res, '/clinics');
  },

  'GET /staff': (req, res, u, q, err = '') => {
    const staff = db.prepare('SELECT u.id,u.username,u.role,u.active,c.name clinic FROM users u LEFT JOIN clinics c ON c.id=u.clinic_id ORDER BY u.role DESC, c.name, u.username').all();
    send(res, page(u, 'Staff accounts', `<p class="err">${esc(err)}</p><form class="card" method="post" action="/staff">
      <b>New employee</b><br><input name="username" placeholder="Username" required> <input name="password" type="password" placeholder="Password (8+)" minlength="8" required> ${clinicField(u, null)} <button>Create</button></form>
      ${table(['Username', 'Role', 'Clinic', 'Status', ''], staff.map(s => `<tr><td>${esc(s.username)}</td><td>${s.role}</td><td>${esc(s.clinic || '—')}</td><td>${s.active ? '<span class="badge b-paid">Active</span>' : '<span class="badge b-voided">Disabled</span>'}</td><td class="actions">${s.role === 'employee' ? `
        <form method="post" action="/staff/clinic" style="display:inline"><input type="hidden" name="id" value="${s.id}">${clinicField(u, clinics().find(c => c.name === s.clinic)?.id)}<button>Move</button></form>
        <form method="post" action="/staff/password" style="display:inline"><input type="hidden" name="id" value="${s.id}"><input name="password" type="password" placeholder="New password" minlength="8" required><button>Reset</button></form>
        ${btn('/staff/active', { id: s.id, active: s.active ? 0 : 1 }, s.active ? 'Disable' : 'Enable')}` : ''}</td></tr>`))}`));
  },
  'POST /staff': (req, res, u, f) => {
    if (!f.username?.trim() || (f.password || '').length < 8) return routes['GET /staff'](req, res, u, f, 'Username and 8+ char password required.');
    if (!db.prepare('SELECT 1 FROM clinics WHERE id=?').get(Number(f.clinic_id))) return routes['GET /staff'](req, res, u, f, 'Assign the employee to a clinic (add clinics first).');
    try { db.prepare("INSERT INTO users(username,hash,role,clinic_id) VALUES(?,?,'employee',?)").run(f.username.trim(), hash(f.password), Number(f.clinic_id)); }
    catch { return routes['GET /staff'](req, res, u, f, 'Username already taken.'); }
    redirect(res, '/staff');
  },
  'POST /staff/clinic': (req, res, u, f) => {
    if (!db.prepare('SELECT 1 FROM clinics WHERE id=?').get(Number(f.clinic_id))) return routes['GET /staff'](req, res, u, f, 'Pick a clinic.');
    db.prepare("UPDATE users SET clinic_id=? WHERE id=? AND role='employee'").run(Number(f.clinic_id), Number(f.id));
    redirect(res, '/staff');
  },
  'POST /staff/password': (req, res, u, f) => {
    if ((f.password || '').length < 8) return routes['GET /staff'](req, res, u, f, 'Password must be 8+ characters.');
    db.prepare("UPDATE users SET hash=? WHERE id=? AND role='employee'").run(hash(f.password), Number(f.id));
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(Number(f.id));
    redirect(res, '/staff');
  },
  'POST /staff/active': (req, res, u, f) => {
    db.prepare("UPDATE users SET active=? WHERE id=? AND role='employee'").run(f.active === '1' ? 1 : 0, Number(f.id));
    if (f.active !== '1') db.prepare('DELETE FROM sessions WHERE user_id=?').run(Number(f.id));
    redirect(res, '/staff');
  },
});

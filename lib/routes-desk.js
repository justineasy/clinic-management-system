// Front-desk pages: login, patients, appointments, online booking, price list, billing, stock use.
const { http, crypto, path, here, db, METHODS, logStock, list, nowLocal, bookHits, patientLabel, patientField, resolvePatient, statusText, billStatus, hash, verify, esc, peso, today, clinics, canAccess, scope, whereClinic, clinicField, filterBar, sid, getUser, fails, hasUsers } = require('./core');
const { ICONS, icon, SUBTITLES, page, STAFF_BRAND, authPage, pwField, table, btn, errPage, shiftDay, invClass, send, redirect, setPath } = require('./ui');

// Demo logins shown on the login page (DEMO=1 only, sample data).
const demoBox = () => !process.env.DEMO ? '' : `<div class="demo-box"><b>Try the demo</b>${require('./demo').DEMO_ACCOUNTS.map(a => `<button type="button" onclick="const f=this.form;f.username.value='${a.username}';f.password.value='${a.password}';f.requestSubmit()"><span>${a.label}</span><small>${a.username}</small></button>`).join('')}</div>`;

// Receives the shared routes object so handlers can call each other (e.g. re-render a form with an error).
module.exports = routes => ({
  // ---------- auth ----------
  'GET /setup': (req, res, u, q, err = '') => {
    if (hasUsers()) return redirect(res, '/login');
    send(res, authPage('Create owner account', 'First-time setup. This account sees everything, including earnings.', err,
      `<label class="fl">Username<input name="username" autocomplete="username" autofocus required></label>${pwField('password', 'Password (at least 8 characters)', 'minlength="8" autocomplete="new-password"')}<button class="wide">Create owner account</button>`));
  },
  'POST /setup': (req, res, u, f) => {
    if (hasUsers()) return redirect(res, '/login');
    if (!f.username?.trim() || (f.password || '').length < 8) return routes['GET /setup'](req, res, u, f, 'Password must be 8+ characters.');
    db.prepare("INSERT INTO users(username,hash,role) VALUES(?,?,'owner')").run(f.username.trim(), hash(f.password));
    redirect(res, '/login');
  },
  'GET /login': (req, res, u, q, err = '') => {
    if (!hasUsers()) return redirect(res, '/setup');
    send(res, authPage('Welcome back', 'Log in to your clinic account.', err,
      `<label class="fl">Username<input name="username" value="${esc(q.username)}" autocomplete="username" ${q.username ? '' : 'autofocus'} required></label>${pwField('password', 'Password', `autocomplete="current-password" ${q.username ? 'autofocus' : ''}`)}
      <button class="wide">Log in</button><a class="btn-outline" href="/book">📅 Book an appointment</a><p class="hint">Forgot your password? Ask the clinic owner to reset it.</p>${demoBox()}`));
  },
  'POST /login': (req, res, u, f) => {
    const name = (f.username || '').trim().toLowerCase(), lock = fails.get(name);
    if (lock?.until > Date.now()) return routes['GET /login'](req, res, u, f, 'Too many wrong tries. Wait 5 minutes and try again.');
    const user = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get((f.username || '').trim());
    if (!user || !verify(f.password || '', user.hash)) {
      const n = (lock?.n || 0) + 1;
      fails.set(name, n >= 5 ? { n: 0, until: Date.now() + 5 * 60e3 } : { n, until: 0 });
      return routes['GET /login'](req, res, u, f, 'Wrong username or password.');
    }
    fails.delete(name);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare("DELETE FROM sessions WHERE created IS NULL OR created <= datetime('now','-12 hours')").run();
    db.prepare("INSERT INTO sessions(token,user_id,created) VALUES(?,?,datetime('now'))").run(token, user.id);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/${process.env.HTTPS ? '; Secure' : ''}`);
    redirect(res, user.role === 'owner' ? '/overview' : '/appointments');
  },
  'GET /account': (req, res, u, q, msg = '') => {
    send(res, page(u, 'My account', `<p class="${msg.startsWith('Password changed') ? 'ok' : 'err'}">${esc(msg)}</p><form class="card" method="post" action="/account" style="max-width:420px">
      <b>Change password</b><input name="current" type="password" placeholder="Current password" required style="width:100%"><input name="password" type="password" placeholder="New password (8+ chars)" minlength="8" required style="width:100%">
      <input name="confirm" type="password" placeholder="Repeat new password" minlength="8" required style="width:100%"><button>Change password</button></form>`));
  },
  'POST /account': (req, res, u, f) => {
    if (!verify(f.current || '', u.hash)) return routes['GET /account'](req, res, u, f, 'Current password is wrong.');
    if ((f.password || '').length < 8 || f.password !== f.confirm) return routes['GET /account'](req, res, u, f, 'New passwords must match and be 8+ characters.');
    db.prepare('UPDATE users SET hash=? WHERE id=?').run(hash(f.password), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token != ?').run(u.id, sid(req)); // log out other devices
    res.audited = true;
    routes['GET /account'](req, res, u, f, 'Password changed. Other devices were logged out.');
  },
  'POST /logout': (req, res) => {
    const t = sid(req);
    if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
    res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/');
    redirect(res, '/login');
  },

  // ---------- patients (shared across clinics) ----------
  'GET /': (req, res, u, q) => {
    const rows = db.prepare('SELECT * FROM patients WHERE name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 200').all(`%${q.search || ''}%`, `%${q.search || ''}%`);
    send(res, page(u, 'Patients', `<form class="card" method="post" action="/patients">
      <b>New patient</b><br><input name="name" placeholder="Full name" required> <input name="phone" placeholder="Phone"> <label>Birthdate <input name="birthdate" type="date"></label> <input name="notes" placeholder="Notes"> <button>Add</button></form>
      <form><input name="search" placeholder="Search name or phone" value="${esc(q.search)}"> <button>Search</button></form>
      ${table(['#', 'Name', 'Phone', 'Birthdate', 'Notes', ''], rows.map(p => `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${esc(p.phone)}</td><td>${esc(p.birthdate)}</td><td>${esc(p.notes)}</td><td><a href="/patient?id=${p.id}">History</a></td></tr>`))}`));
  },
  'POST /patients': (req, res, u, f) => {
    if (!f.name?.trim()) return errPage(res, u, 'Name is required.', '/');
    db.prepare('INSERT INTO patients(name,phone,birthdate,notes) VALUES(?,?,?,?)').run(f.name.trim(), f.phone || '', f.birthdate || '', f.notes || '');
    redirect(res, '/');
  },
  'GET /patient': (req, res, u, q) => {
    const p = db.prepare('SELECT * FROM patients WHERE id=?').get(Number(q.id));
    if (!p) return send(res, page(u, 'Not found', '<p class="err">Record not found.</p>'), 404);
    const c = u.role === 'owner' ? null : u.clinic_id;
    const appts = db.prepare(`SELECT a.*, c.name clinic FROM appointments a JOIN clinics c ON c.id=a.clinic_id WHERE patient_id=? AND ${whereClinic('a.clinic_id', c)} ORDER BY at DESC`).all(p.id);
    const bills = db.prepare(`SELECT b.*, c.name clinic FROM bills b JOIN clinics c ON c.id=b.clinic_id WHERE patient_id=? AND ${whereClinic('b.clinic_id', c)} ORDER BY b.id DESC`).all(p.id);
    send(res, page(u, p.name, `<form class="card" method="post" action="/patients/edit"><b>Details</b><br><input type="hidden" name="id" value="${p.id}">
      <input name="name" value="${esc(p.name)}" required> <input name="phone" value="${esc(p.phone)}" placeholder="Phone"> <input name="birthdate" type="date" value="${esc(p.birthdate)}">
      <input name="notes" value="${esc(p.notes)}" placeholder="Notes"> <button>Save</button></form>
      ${u.role === 'owner' ? `<div class="card privacy noprint"><b>Patient data (Data Privacy Act)</b><p class="muted">If a patient asks for a copy of their data, print this page. If they ask to be removed, delete their personal details. Bills stay in the books but show "Deleted patient".</p>
        <button type="button" onclick="print()">🖨 Print / save as PDF</button> ${btn('/patients/delete', { id: p.id }, 'Delete personal data', 'Remove this patient name, phone, birthdate and notes? This cannot be undone.')}</div>` : ''}
      <h2>Appointments</h2>${table(['When', 'Clinic', 'Reason', 'Status'], appts.map(a => `<tr><td>${esc(a.at.replace('T', ' '))}</td><td>${esc(a.clinic)}</td><td>${esc(a.reason)}</td><td><span class="badge b-${a.status}">${a.status}</span></td></tr>`))}
      <h2>Bills</h2>${table(['Receipt', 'Date', 'Clinic', 'Service', 'Amount', 'Status'], bills.map(b => `<tr><td><a href="/receipt?id=${b.id}">#${b.id}</a></td><td>${b.created}</td><td>${esc(b.clinic)}</td><td>${esc(b.service)}</td><td>${peso(b.cents)}</td><td>${billStatus(b)}</td></tr>`))}`));
  },
  'POST /patients/delete': (req, res, u, f) => {
    if (u.role !== 'owner') return send(res, page(u, 'Not allowed', '<p class="err">Only the owner can delete patient data.</p>'), 403);
    const id = Number(f.id);
    const used = db.prepare('SELECT 1 FROM bills WHERE patient_id=? UNION SELECT 1 FROM appointments WHERE patient_id=?').get(id, id);
    // Bills must stay for the books, so a patient with history is anonymized instead of removed.
    if (used) db.prepare("UPDATE patients SET name='Deleted patient #' || id, phone='', birthdate='', notes='' WHERE id=?").run(id);
    else db.prepare('DELETE FROM patients WHERE id=?').run(id);
    redirect(res, '/');
  },
  'POST /patients/edit': (req, res, u, f) => {
    if (!f.name?.trim()) return errPage(res, u, 'Name is required.', '/patient?id=' + Number(f.id));
    db.prepare('UPDATE patients SET name=?, phone=?, birthdate=?, notes=? WHERE id=?').run(f.name.trim(), f.phone || '', f.birthdate || '', f.notes || '', Number(f.id));
    redirect(res, '/patient?id=' + Number(f.id));
  },

  // ---------- appointments ----------
  'GET /appointments': (req, res, u, q) => {
    const c = scope(u, q), date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : today();
    const rows = db.prepare(`SELECT a.*, p.name patient, c.name clinic, (SELECT 1 FROM bills b WHERE b.appointment_id=a.id AND b.voided=0) billed FROM appointments a
      JOIN patients p ON p.id=a.patient_id JOIN clinics c ON c.id=a.clinic_id WHERE substr(a.at,1,10)=? AND ${whereClinic('a.clinic_id', c)} ORDER BY a.at`).all(date);
    const reqs = db.prepare(`SELECT r.*, c.name clinic FROM booking_requests r JOIN clinics c ON c.id=r.clinic_id WHERE r.status='pending' AND ${whereClinic('r.clinic_id', c)} ORDER BY r.at`).all();
    const clinicQ = q.clinic ? '&clinic=' + Number(q.clinic) : '';
    send(res, page(u, 'Appointments', `${reqs.length ? `<div class="card requests"><h3>Online booking requests <span class="badge b-unpaid">${reqs.length}</span></h3><ul class="rows">${reqs.map(r => `<li><div><b>${esc(r.name)}</b> · ${esc(r.phone)}<small>${esc(r.at.replace('T', ' '))} · ${esc(r.clinic)}${r.reason ? ' · ' + esc(r.reason) : ''}</small></div>
        <div class="right">${btn('/requests/confirm', { id: r.id }, '✓ Confirm')} ${btn('/requests/decline', { id: r.id }, 'Decline', 'Decline this request?')}</div></li>`).join('')}</ul>
        <small class="muted">Call or text the patient to confirm the time before you click Confirm.</small></div>` : ''}
      <form class="card" method="post" action="/appointments">
      <b>Book appointment</b>${patientField()} ${clinicField(u, c)} <input name="at" type="datetime-local" required> <input name="reason" placeholder="Reason"> <button>Book</button>
      <small>Type to search. A name that isn't in the list is added as a new patient.</small></form>
      ${filterBar(u, q, `<a href="?date=${shiftDay(date, -1)}${clinicQ}">← Prev</a> <input type="date" name="date" value="${date}" onchange="this.form.submit()"> <a href="?date=${shiftDay(date, 1)}${clinicQ}">Next →</a> <a href="?">Today</a>`)}
      ${table(['Time', 'Patient', 'Clinic', 'Reason', 'Status', ''], rows.map(a => `<tr><td>${esc(a.at.slice(11))}</td><td><a href="/patient?id=${a.patient_id}">${esc(a.patient)}</a></td><td>${esc(a.clinic)}</td><td>${esc(a.reason)}</td><td><span class="badge b-${a.status}">${a.status}</span></td>
        <td class="actions">${a.status !== 'cancelled' && a.status !== 'no-show' ? (a.billed ? '<span class="muted">Billed</span>' : `<a class="btn-link" href="/bills?appt=${a.id}">₱ Bill this visit</a>`) : ''}
        ${a.status === 'booked' ? ['no-show', 'cancelled'].map(s => btn('/appointments/status', { id: a.id, status: s }, { 'no-show': 'No-show', cancelled: 'Cancel' }[s])).join(' ') + ' ' + btn('/appointments/status', { id: a.id, status: 'done' }, '✓ Done') : ''}</td></tr>`))}`));
  },
  'POST /appointments': (req, res, u, f) => {
    if (!canAccess(u, f.clinic_id) || !db.prepare('SELECT 1 FROM clinics WHERE id=?').get(Number(f.clinic_id))) return errPage(res, u, 'Pick a valid clinic.', '/appointments');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.at || '')) return errPage(res, u, 'Pick a date and time.', '/appointments');
    const pid = resolvePatient(f);
    if (!pid) return errPage(res, u, 'Type the patient name.', '/appointments');
    db.prepare('INSERT INTO appointments(patient_id,clinic_id,at,reason,created_by) VALUES(?,?,?,?,?)').run(pid, Number(f.clinic_id), f.at, f.reason || '', u.username);
    redirect(res, '/appointments?date=' + f.at.slice(0, 10));
  },
  'POST /appointments/status': (req, res, u, f) => {
    const a = db.prepare('SELECT * FROM appointments WHERE id=?').get(Number(f.id));
    if (!a || !canAccess(u, a.clinic_id) || !['done', 'no-show', 'cancelled'].includes(f.status)) return send(res, page(u, 'Not allowed', '<p class="err">You cannot change this record.</p>'), 403);
    db.prepare('UPDATE appointments SET status=? WHERE id=?').run(f.status, a.id);
    redirect(res, '/appointments?date=' + a.at.slice(0, 10));
  },

  // ---------- online booking requests (public form -> staff confirm) ----------
  'POST /requests/confirm': (req, res, u, f) => {
    const r = db.prepare("SELECT * FROM booking_requests WHERE id=? AND status='pending'").get(Number(f.id));
    if (!r || !canAccess(u, r.clinic_id)) return send(res, page(u, 'Not allowed', '<p class="err">This request is gone or not for your clinic.</p>'), 403);
    // Same phone number = same patient; otherwise a new patient record.
    const digits = r.phone.replace(/\D/g, '');
    const existing = db.prepare('SELECT id, phone FROM patients').all().find(p => p.phone && p.phone.replace(/\D/g, '') === digits);
    const pid = existing?.id ?? db.prepare('INSERT INTO patients(name,phone,notes) VALUES(?,?,?)').run(r.name, r.phone, 'Booked online').lastInsertRowid;
    db.prepare('INSERT INTO appointments(patient_id,clinic_id,at,reason,created_by) VALUES(?,?,?,?,?)').run(pid, r.clinic_id, r.at, r.reason || '', 'online · ' + u.username);
    db.prepare("UPDATE booking_requests SET status='confirmed' WHERE id=?").run(r.id);
    redirect(res, '/appointments?date=' + r.at.slice(0, 10));
  },
  'POST /requests/decline': (req, res, u, f) => {
    const r = db.prepare("SELECT * FROM booking_requests WHERE id=? AND status='pending'").get(Number(f.id));
    if (!r || !canAccess(u, r.clinic_id)) return send(res, page(u, 'Not allowed', '<p class="err">This request is gone or not for your clinic.</p>'), 403);
    db.prepare("UPDATE booking_requests SET status='declined' WHERE id=?").run(r.id);
    redirect(res, '/appointments');
  },
  'GET /book': (req, res, u, q, err = '', done = false) => {
    const cs = clinics();
    const brand = `<p>Book your visit online in under a minute. No account needed.</p>
      <ol class="steps"><li><b>Send a request</b><span>Pick your clinic and a time that works for you.</span></li><li><b>We contact you</b><span>The clinic calls or texts to confirm the schedule.</span></li><li><b>Visit the clinic</b><span>Come in at your confirmed time.</span></li></ol>`;
    if (done) return send(res, authPage('Request sent!', 'Thank you. The clinic will call or text you soon to confirm your appointment.', '',
      `<div class="done-box">✓</div><p class="muted">Your appointment is not final until the clinic confirms it. Please keep your phone nearby.</p><a class="btn-link" href="/book">Book another appointment</a>`, brand));
    send(res, authPage('Book an appointment', 'Send a request and the clinic will contact you to confirm.', err, `
      <label class="fl">Full name<input name="name" value="${esc(q.name)}" required maxlength="100" autocomplete="name"></label>
      <label class="fl">Mobile number<input name="phone" value="${esc(q.phone)}" required maxlength="20" inputmode="tel" placeholder="09XX XXX XXXX" autocomplete="tel"></label>
      <label class="fl">Clinic<select name="clinic_id" required><option value="">Choose a clinic…</option>${cs.map(c => `<option value="${c.id}" ${Number(q.clinic_id) === c.id ? 'selected' : ''}>${esc(c.name)}${c.address ? ' · ' + esc(c.address) : ''}</option>`).join('')}</select></label>
      <label class="fl">Preferred date and time<input name="at" type="datetime-local" value="${esc(q.at)}" min="${nowLocal()}" required></label>
      <label class="fl">Reason (optional)<input name="reason" value="${esc(q.reason)}" maxlength="200" placeholder="e.g. Checkup"></label>
      <label class="consent"><input type="checkbox" name="consent" value="1" required> I agree that the clinic may use my name and number to contact me about this appointment.</label>
      <input name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="wide">Send request</button><p class="hint">Your details are only used by the clinic to contact you about this appointment.</p>`, brand));
  },
  'POST /book': (req, res, u, f) => {
    if (f.website) return routes['GET /book'](req, res, u, f, '', true); // bot filled the hidden field: pretend success, save nothing
    const ip = req.socket.remoteAddress, now = Date.now(), recent = (bookHits.get(ip) || []).filter(t => now - t < 36e5);
    if (recent.length >= 5) return routes['GET /book'](req, res, u, f, 'Too many requests. Please call the clinic instead.');
    const name = (f.name || '').trim(), phone = (f.phone || '').trim();
    if (!f.consent) return routes['GET /book'](req, res, u, f, 'Please tick the box to agree that the clinic may contact you.');
    if (!name || name.length > 100) return routes['GET /book'](req, res, u, f, 'Please enter your full name.');
    if (!/^[+\d][\d\s-]{6,19}$/.test(phone)) return routes['GET /book'](req, res, u, f, 'Please enter a valid mobile number.');
    if (!db.prepare('SELECT 1 FROM clinics WHERE id=?').get(Number(f.clinic_id))) return routes['GET /book'](req, res, u, f, 'Please choose a clinic.');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.at || '') || f.at < nowLocal()) return routes['GET /book'](req, res, u, f, 'Please choose a date and time in the future.');
    bookHits.set(ip, [...recent, now]);
    db.prepare('INSERT INTO booking_requests(name,phone,clinic_id,at,reason) VALUES(?,?,?,?,?)').run(name, phone, Number(f.clinic_id), f.at, (f.reason || '').slice(0, 200));
    res.audited = true;
    routes['GET /book'](req, res, u, f, '', true);
  },

  // ---------- price list (owner) ----------
  'GET /services': (req, res, u) => {
    const rows = db.prepare('SELECT * FROM services ORDER BY name').all();
    send(res, page(u, 'Price list', `<form class="card" method="post" action="/services"><b>Add service</b><input name="name" placeholder="Service or medicine (e.g. Consultation)" required> <input name="amount" type="number" step="0.01" min="0.01" placeholder="Price ₱" required> <button>Add</button></form>
      ${table(['Service', 'Price', ''], rows.map(s => `<tr><td><b>${esc(s.name)}</b></td><td><form method="post" action="/services/price" style="display:flex;gap:6px"><input type="hidden" name="id" value="${s.id}"><input name="amount" type="number" step="0.01" min="0.01" value="${(s.cents / 100).toFixed(2)}" style="width:120px;margin:0"><button>Save</button></form></td>
        <td>${btn('/services/delete', { id: s.id }, 'Remove', 'Remove this service from the price list?')}</td></tr>`))}`));
  },
  'POST /services': (req, res, u, f) => {
    const cents = Math.round(parseFloat(f.amount) * 100);
    if (!f.name?.trim() || !(cents > 0)) return errPage(res, u, 'Name and a price above 0 are required.', '/services');
    try { db.prepare('INSERT INTO services(name,cents) VALUES(?,?)').run(f.name.trim(), cents); } catch { return errPage(res, u, 'That service is already on the list.', '/services'); }
    redirect(res, '/services');
  },
  'POST /services/price': (req, res, u, f) => {
    const cents = Math.round(parseFloat(f.amount) * 100);
    if (!(cents > 0)) return errPage(res, u, 'Price must be above 0.', '/services');
    db.prepare('UPDATE services SET cents=? WHERE id=?').run(cents, Number(f.id));
    redirect(res, '/services');
  },
  'POST /services/delete': (req, res, u, f) => { db.prepare('DELETE FROM services WHERE id=?').run(Number(f.id)); redirect(res, '/services'); },

  // ---------- billing + receipts ----------
  'GET /bills': (req, res, u, q) => {
    let c = scope(u, q), appt = null;
    if (q.appt) {
      appt = db.prepare('SELECT a.*, p.name, p.phone FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.id=?').get(Number(q.appt));
      if (!appt || !canAccess(u, appt.clinic_id)) appt = null; else c = appt.clinic_id;
    }
    const bills = db.prepare(`SELECT b.*, p.name, c.name clinic FROM bills b JOIN patients p ON p.id=b.patient_id JOIN clinics c ON c.id=b.clinic_id WHERE ${whereClinic('b.clinic_id', scope(u, q))}
      AND (? = '' OR p.name LIKE ? OR b.id = ?) ORDER BY b.id DESC LIMIT 200`).all(q.search || '', `%${q.search || ''}%`, Number(q.search) || 0);
    const services = db.prepare('SELECT name, cents FROM services ORDER BY name').all();
    const line = (svc = '') => `<div class="line"><input name="service" list="services" placeholder="Service / medicine" value="${esc(svc)}" onchange="fillPrice(this)" required> <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount ₱" required> <button type="button" title="Remove item" onclick="if(this.parentNode.parentNode.children.length>1)this.parentNode.remove()">✕</button></div>`;
    const firstSvc = appt ? (services.find(s => s.name.toLowerCase() === (appt.reason || '').toLowerCase())?.name || '') : '';
    send(res, page(u, 'Billing', `<datalist id="services">${services.map(s => `<option value="${esc(s.name)}" data-p="${(s.cents / 100).toFixed(2)}">${peso(s.cents)}</option>`).join('')}</datalist>
      <script>function fillPrice(el){const o=[...document.getElementById('services').options].find(o=>o.value===el.value);if(o)el.nextElementSibling.value=o.dataset.p}
      addEventListener('DOMContentLoaded',()=>document.querySelectorAll('#lines [name=service]').forEach(fillPrice))</script>
      <form class="card" method="post" action="/bills">
      <b>${appt ? `Bill for ${esc(appt.name)}'s visit · ${esc(appt.at.replace('T', ' '))}` : 'New bill'}</b>${appt ? `<input type="hidden" name="appt_id" value="${appt.id}">` : ''}
      ${patientField(appt ? patientLabel(appt.patient_id, appt.name, appt.phone) : '')} ${clinicField(u, c)}
      <div id="lines">${line(firstSvc)}</div><button type="button" onclick="document.getElementById('lines').insertAdjacentHTML('beforeend', this.dataset.line)" data-line="${esc(line())}">+ Add item</button>
      ${services.length ? '' : u.role === 'owner' ? '<small>Tip: add your prices on the <a href="/services">Price list</a> page so staff can pick instead of typing.</small>' : ''}
      <label>Discount <select name="discount"><option value="">None</option><option value="senior">Senior citizen (20%)</option><option value="pwd">PWD (20%)</option></select></label>
      <label>Payment <select name="method">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></label>
      <label><input type="checkbox" name="paid" value="1" checked> Paid now</label> <button>Save bill</button></form>
      ${filterBar(u, q, `<input name="search" placeholder="Search patient or receipt #" value="${esc(q.search)}">`)}
      ${table(['Receipt', 'Date', 'Patient', 'Clinic', 'Items', 'Total', 'Status', 'By'], bills.map(b => `<tr><td><a href="/receipt?id=${b.id}">#${b.id}</a></td><td>${b.created}</td><td>${esc(b.name)}</td><td>${esc(b.clinic)}</td><td>${esc(b.service)}</td><td>${peso(b.cents)}</td>
        <td>${!b.paid && !b.voided ? btn('/bills/pay', { id: b.id }, 'Mark paid') : billStatus(b)}</td><td>${esc(b.created_by)}</td></tr>`))}`));
  },
  'POST /bills': (req, res, u, f) => {
    const services = list(f.service).map(s => s.trim()), amounts = list(f.amount).map(a => Math.round(parseFloat(a) * 100));
    if (!canAccess(u, f.clinic_id) || !db.prepare('SELECT 1 FROM clinics WHERE id=?').get(Number(f.clinic_id))) return errPage(res, u, 'Pick a valid clinic.', '/bills');
    if (!services.length || services.length !== amounts.length || services.some(s => !s) || amounts.some(a => !(a > 0))) return errPage(res, u, 'Every item needs a name and an amount above 0.', '/bills');
    const appt = f.appt_id ? db.prepare('SELECT * FROM appointments WHERE id=?').get(Number(f.appt_id)) : null;
    if (appt && !canAccess(u, appt.clinic_id)) return errPage(res, u, 'That appointment is not in your clinic.', '/bills');
    const pid = appt && !f.patient ? appt.patient_id : resolvePatient(f);
    if (!pid) return errPage(res, u, 'Type the patient name.', '/bills');
    const discount = ['senior', 'pwd'].includes(f.discount) ? f.discount : '', method = METHODS.includes(f.method) ? f.method : 'cash';
    const subtotal = amounts.reduce((a, b) => a + b, 0);
    // shortcut: flat 20% senior/PWD discount, no VAT-exemption math; upgrade if the clinic is VAT-registered.
    const total = discount ? Math.round(subtotal * 0.8) : subtotal;
    let id;
    db.exec('BEGIN');
    try {
      id = db.prepare('INSERT INTO bills(patient_id,clinic_id,service,cents,subtotal,discount,method,paid,created_by,appointment_id) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(pid, Number(f.clinic_id), services.join(', '), total, subtotal, discount, method, f.paid ? 1 : 0, u.username, appt?.id ?? null).lastInsertRowid;
      services.forEach((s, i) => db.prepare('INSERT INTO bill_items(bill_id,service,cents) VALUES(?,?,?)').run(id, s, amounts[i]));
      if (appt) db.prepare("UPDATE appointments SET status='done' WHERE id=? AND status='booked'").run(appt.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    redirect(res, f.paid ? '/receipt?id=' + id : '/bills');
  },
  'POST /bills/pay': (req, res, u, f) => {
    const b = db.prepare('SELECT * FROM bills WHERE id=?').get(Number(f.id));
    if (!b || !canAccess(u, b.clinic_id) || b.voided) return send(res, page(u, 'Not allowed', '<p class="err">You cannot change this record.</p>'), 403);
    db.prepare('UPDATE bills SET paid=1 WHERE id=?').run(b.id);
    redirect(res, '/receipt?id=' + b.id);
  },
  'POST /bills/void': (req, res, u, f) => {
    if (u.role !== 'owner') return send(res, page(u, 'Not allowed', '<p class="err">You cannot change this record.</p>'), 403);
    if (!f.reason?.trim()) return errPage(res, u, 'A reason is required to void a bill.', '/receipt?id=' + Number(f.id));
    db.prepare('UPDATE bills SET voided=1, void_reason=? WHERE id=?').run(f.reason.trim(), Number(f.id));
    redirect(res, '/receipt?id=' + Number(f.id));
  },
  'GET /receipt': (req, res, u, q) => {
    const b = db.prepare('SELECT b.*, p.name patient, c.name clinic, c.address FROM bills b JOIN patients p ON p.id=b.patient_id JOIN clinics c ON c.id=b.clinic_id WHERE b.id=?').get(Number(q.id));
    if (!b || !canAccess(u, b.clinic_id)) return send(res, page(u, 'Not found', '<p class="err">Record not found.</p>'), 404);
    let items = db.prepare('SELECT service, cents FROM bill_items WHERE bill_id=?').all(b.id);
    if (!items.length) items = [{ service: b.service, cents: b.cents }]; // bills made before itemized billing
    const row = (l, v, bold) => `<div style="display:flex;justify-content:space-between"><span>${l}</span>${bold ? `<b>${v}</b>` : v}</div>`;
    // shortcut: informal acknowledgement receipt, not a BIR official receipt; upgrade if the client needs ORs.
    send(res, page(u, 'Receipt', `<div class="card receipt">
      <div class="r-head"><div class="logo">✚</div><h2>${esc(b.clinic)}</h2><div class="muted">${esc(b.address)}</div></div><hr>
      <div>Receipt #: <b>${String(b.id).padStart(6, '0')}</b></div><div>Date: ${b.created}</div><div>Patient: ${esc(b.patient)}</div><hr>
      ${items.map(i => row(esc(i.service), peso(i.cents))).join('')}<hr>
      ${b.discount ? row('Subtotal', peso(b.subtotal)) + row(b.discount === 'pwd' ? 'PWD discount (20%)' : 'Senior discount (20%)', '−' + peso(b.subtotal - b.cents)) : ''}
      ${row('TOTAL', peso(b.cents), true)}<hr>
      <div>Status: <b>${statusText(b).toUpperCase()}</b>${b.voided ? ` — ${esc(b.void_reason)}` : ''}</div><div>Payment: ${esc(b.method)}</div><div>Issued by: ${esc(b.created_by)}</div>
      <p style="font-size:.8em">This is not an official receipt.</p></div>
      <p class="noprint"><button onclick="print()">Print</button> <a href="/bills">Back to billing</a></p>
      ${u.role === 'owner' && !b.voided ? `<form class="card noprint" method="post" action="/bills/void"><b>Void this bill</b> (removes it from earnings)<br><input type="hidden" name="id" value="${b.id}">
        <input name="reason" placeholder="Reason" required> <button onclick="return confirm('Void this bill?')">Void</button></form>` : ''}`));
  },

  // ---------- use stock (deduct only; employees limited to their clinic, no quantities shown) ----------
  'GET /stock': (req, res, u, q, msg = '') => {
    const c = scope(u, q);
    const items = db.prepare(`SELECT i.id, i.name, i.unit, i.expiry, c.name clinic FROM inventory i JOIN clinics c ON c.id=i.clinic_id
      WHERE ${whereClinic('i.clinic_id', c)} AND qty > 0 AND (expiry = '' OR expiry >= date('now','localtime')) ORDER BY i.name, i.expiry`).all();
    send(res, page(u, 'Use stock', `<p class="ok">${esc(msg)}</p><form class="card" method="post" action="/stock">
      <b>Record medicine used / sold</b><br><select name="id" required><option value="">Item…</option>${items.map(i => `<option value="${i.id}">${esc(i.name)}${u.role === 'owner' ? ' · ' + esc(i.clinic) : ''} (exp ${esc(i.expiry || '—')})</option>`).join('')}</select>
      <input name="qty" type="number" min="1" placeholder="Qty used" required> <button>Deduct</button></form>`));
  },
  'POST /stock': (req, res, u, f) => {
    const i = db.prepare('SELECT * FROM inventory WHERE id=?').get(Number(f.id)), n = parseInt(f.qty, 10);
    if (!i || !canAccess(u, i.clinic_id)) return send(res, page(u, 'Not allowed', '<p class="err">You cannot change this record.</p>'), 403);
    if (!(n > 0)) return errPage(res, u, 'Enter a quantity of 1 or more.', '/stock');
    if (n > i.qty) return errPage(res, u, 'Not enough stock for that amount. Tell the owner.', '/stock');
    db.prepare('UPDATE inventory SET qty=qty-? WHERE id=?').run(n, i.id);
    logStock(u, i, -n);
    res.audited = true;
    routes['GET /stock'](req, res, u, {}, `Deducted ${n} ${i.unit || ''} ${i.name}.`);
  },

});

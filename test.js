// Self-check: node test.js  (uses a throwaway in-memory DB)
process.env.DB = ':memory:';
const assert = require('node:assert');
const server = require('./server.js');

server.listen(0, async () => {
  const base = 'http://localhost:' + server.address().port;
  const post = (p, data, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(data) });
  const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: { cookie } });
  const text = async (p, c) => (await get(p, c)).text();
  const login = async (u, pw) => (await post('/login', { username: u, password: pw })).headers.get('set-cookie')?.split(';')[0];
  const now = new Date().toLocaleDateString('en-CA');

  assert.equal((await get('/overview')).status, 303, 'not logged in -> redirect');
  await post('/setup', { username: 'owner', password: 'ownerpass1' });
  const owner = await login('owner', 'ownerpass1');
  assert.ok(owner);
  assert.equal(await login('owner', 'wrong'), undefined);

  await post('/clinics', { name: 'Main', address: 'Manila' }, owner);   // id 1
  await post('/clinics', { name: 'Branch', address: 'Cebu' }, owner);   // id 2
  assert.equal((await post('/staff', { username: 'nurse', password: 'nursepass1' }, owner)).status, 200, 'clinic required');
  await post('/staff', { username: 'nurse', password: 'nursepass1', clinic_id: 1 }, owner);
  await post('/staff', { username: 'cebu', password: 'cebupass1', clinic_id: 2 }, owner);
  const nurse = await login('nurse', 'nursepass1'), cebu = await login('cebu', 'cebupass1');

  await post('/patients', { name: 'Juan <b>' }, nurse);
  assert.ok((await text('/', nurse)).includes('Juan &lt;b&gt;'), 'escaped');

  // appointments: nurse cannot book into another clinic
  assert.equal((await post('/appointments', { patient_id: 1, clinic_id: 2, at: now + 'T09:00' }, nurse)).status, 400);
  await post('/appointments', { patient_id: 1, clinic_id: 1, at: now + 'T09:00', reason: 'Checkup' }, nurse);
  assert.ok((await text('/appointments', nurse)).includes('Checkup'));
  assert.ok(!(await text('/appointments', cebu)).includes('Checkup'), 'other clinic hidden');
  assert.equal((await post('/appointments/status', { id: 1, status: 'done' }, cebu)).status, 403);
  await post('/appointments/status', { id: 1, status: 'done' }, nurse);

  // bills
  await post('/bills', { patient_id: 1, clinic_id: 1, service: 'Consult', amount: '500', paid: '1' }, nurse);
  await post('/bills', { patient_id: 1, clinic_id: 1, service: 'Lab', amount: '250.50' }, nurse);
  await post('/bills', { patient_id: 1, clinic_id: 2, service: 'Xray', amount: '1000', paid: '1' }, cebu);
  assert.equal((await post('/bills', { patient_id: 1, clinic_id: 1, service: 'X', amount: '-5' }, nurse)).status, 400);
  assert.equal((await post('/bills', { patient_id: 1, clinic_id: 2, service: 'X', amount: '5' }, nurse)).status, 400, 'wrong clinic');
  assert.ok((await text('/receipt?id=1', nurse)).includes('000001'));
  assert.equal((await get('/receipt?id=3', nurse)).status, 404, 'receipt of other clinic hidden');
  assert.equal((await post('/bills/pay', { id: 3 }, nurse)).status, 403);

  // owner-only pages
  for (const p of ['/overview', '/inventory', '/clinics', '/staff']) assert.equal((await get(p, nurse)).status, 403, p);
  assert.equal((await post('/inventory', { clinic_id: 1, name: 'x', qty: 1 }, nurse)).status, 403);
  const ov = await text('/overview', owner);
  assert.ok(ov.includes('₱1,500.00') && ov.includes('₱250.50'), 'total earned + unpaid');
  assert.ok((await text('/overview?clinic=1', owner)).includes('₱500.00'));

  // multi-item bill with senior discount: (300 + 200) * 0.8 = 400; then void it
  const multi = new URLSearchParams([['patient_id', 1], ['clinic_id', 1], ['service', 'Consult'], ['amount', '300'], ['service', 'Meds'], ['amount', '200'], ['discount', 'senior'], ['method', 'gcash'], ['paid', '1']]);
  const r = await fetch(base + '/bills', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: nurse }, body: multi });
  const rec = await text(r.headers.get('location'), nurse);
  assert.ok(rec.includes('Meds') && rec.includes('₱400.00') && rec.includes('₱500.00') && rec.includes('gcash'), 'itemized receipt');
  assert.ok((await text('/overview', owner)).includes('₱1,900.00'));
  assert.equal((await post('/bills/void', { id: 4, reason: 'mistake' }, nurse)).status, 403, 'only owner voids');
  await post('/bills/void', { id: 4, reason: 'mistake' }, owner);
  assert.ok((await text('/overview', owner)).includes('₱1,500.00'), 'voided excluded');
  await post('/patients/edit', { id: 1, name: 'Juan Cruz', phone: '0917' }, nurse);
  assert.ok((await text('/patient?id=1', nurse)).includes('Juan Cruz'));

  // inventory
  await post('/inventory', { clinic_id: 1, name: 'Paracetamol', qty: 5, unit: 'box', expiry: '2000-01-01', low: 10 }, owner);
  assert.ok((await text('/overview', owner)).includes('Paracetamol'), 'alert shown');
  assert.equal((await post('/inventory/adjust', { id: 1, change: -9 }, owner)).status, 400, 'no negative stock');
  await post('/inventory/adjust', { id: 1, change: 20 }, owner);
  assert.ok((await text('/inventory', owner)).includes('25 box'));

  // employee deducts stock in own clinic only, never sees quantities
  await post('/inventory', { clinic_id: 1, name: 'Amoxicillin', qty: 10, unit: 'pcs', expiry: '2099-01-01' }, owner); // id 2
  await post('/inventory', { clinic_id: 2, name: 'Cetirizine', qty: 10, expiry: '2099-01-01' }, owner);              // id 3
  const st = await text('/stock', nurse);
  assert.ok(st.includes('Amoxicillin') && !st.includes('Cetirizine') && !st.includes('Paracetamol'), 'own clinic, unexpired only');
  await post('/stock', { id: 2, qty: 3 }, nurse);
  assert.ok((await text('/inventory', owner)).includes('7 pcs'));
  assert.equal((await post('/stock', { id: 2, qty: 99 }, nurse)).status, 400, 'no overdraw');
  assert.equal((await post('/stock', { id: 3, qty: 1 }, nurse)).status, 403, 'other clinic');
  const log = await text('/inventory/log', owner);
  assert.ok(log.includes('Amoxicillin') && log.includes('-3') && log.includes('nurse'), 'stock log');
  assert.equal((await get('/inventory/log', nurse)).status, 403);

  // change own password; wrong current rejected; old password stops working
  assert.ok((await (await post('/account', { current: 'nope', password: 'newpass123', confirm: 'newpass123' }, cebu)).text()).includes('Current password is wrong'));
  await post('/account', { current: 'cebupass1', password: 'newpass123', confirm: 'newpass123' }, cebu);
  assert.equal(await login('cebu', 'cebupass1'), undefined);
  assert.ok(await login('cebu', 'newpass123'));

  // 5 wrong tries locks the account for a while, even with the right password
  for (let i = 0; i < 5; i++) await login('cebu', 'wrong-guess');
  assert.equal(await login('cebu', 'newpass123'), undefined, 'locked out');

  // repeated form fields don't crash the server; unknown pages get a proper page
  const dup = await fetch(base + '/patients', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: owner }, body: 'name=A&name=B&__proto__=x' });
  assert.equal(dup.status, 303);
  assert.equal((await get('/nope', owner)).status, 404);

  // patient picker: new name creates a patient; picked "(#id)" reuses it
  await post('/appointments', { patient: 'Pedro Penduko', phone: '0918 000 1111', clinic_id: 1, at: now + 'T10:00' }, nurse);
  const pedroCount = async () => (await text('/?search=Pedro', owner)).split('Pedro Penduko</td>').length - 1;
  assert.equal(await pedroCount(), 1, 'new patient created once');
  const pid = /patient\?id=(\d+)/.exec(await text('/?search=Pedro', owner))[1];
  await post('/appointments', { patient: `Pedro Penduko · 0918 000 1111 (#${pid})`, clinic_id: 1, at: now + 'T15:00' }, nurse);
  await post('/appointments', { patient: 'pedro penduko', clinic_id: 1, at: now + 'T16:00' }, nurse);
  assert.equal(await pedroCount(), 1, 'picked or exact-typed patient reused');

  // price list is owner-only and shows up in billing suggestions
  assert.equal((await get('/services', nurse)).status, 403);
  await post('/services', { name: 'Consultation', amount: '500' }, owner);
  assert.ok((await text('/bills', nurse)).includes('data-p="500.00"'));

  // bill this visit: prefilled, and saving marks the appointment done
  const apptPage = await text('/appointments', nurse);
  const apptId = Number(/bills\?appt=(\d+)/.exec(apptPage)[1]);
  assert.ok((await text('/bills?appt=' + apptId, nurse)).includes('name="appt_id"'));
  await post('/bills', { appt_id: apptId, clinic_id: 1, service: 'Consultation', amount: '500', paid: '1' }, nurse);
  assert.ok((await text('/appointments', nurse)).includes('Billed'));
  assert.equal((await post('/bills', { appt_id: apptId, clinic_id: 2, service: 'X', amount: '1' }, cebu)).status, 400, 'other clinic appt');

  // online booking: public form -> request -> staff confirm creates appointment
  const future = new Date(Date.now() + 2 * 864e5).toLocaleDateString('en-CA') + 'T10:00';
  assert.ok((await (await get('/book')).text()).includes('Book an appointment'), 'public page needs no login');
  assert.ok((await (await post('/book', { name: 'Online Ana', phone: '0917 555 0000', clinic_id: 1, at: future, consent: 1 })).text()).includes('Thank you'));
  assert.ok((await (await post('/book', { name: 'Past', phone: '0917 555 0000', clinic_id: 1, at: '2000-01-01T10:00', consent: 1 })).text()).includes('future'));
  await post('/book', { name: 'Bot', phone: '0917 555 0000', clinic_id: 1, at: future, website: 'spam', consent: 1 });
  assert.ok((await (await post('/book', { name: 'NoConsent', phone: '0917 555 0000', clinic_id: 1, at: future })).text()).includes('tick the box'), 'consent required');
  const ap = await text('/appointments', nurse);
  assert.ok(ap.includes('Online Ana') && !ap.includes('>Bot<'), 'request visible, bot dropped');
  assert.ok(!(await text('/appointments', cebu)).includes('Online Ana'), 'other clinic cannot see it');
  const reqId = Number(/name="id" value="(\d+)"><button>✓ Confirm/.exec(ap)[1]);
  assert.equal((await post('/requests/confirm', { id: reqId }, cebu)).status, 403);
  await post('/requests/confirm', { id: reqId }, nurse);
  assert.ok((await text('/appointments?date=' + future.slice(0, 10), nurse)).includes('Online Ana'));

  // activity log: records who did what, hides passwords, owner-only
  const log2 = await text('/audit', owner);
  assert.ok(log2.includes('Created bill') && log2.includes('Voided bill') && log2.includes('Confirmed online request') && log2.includes('nurse'), 'audit entries');
  assert.ok(!log2.includes('newpass123') && !log2.includes('nursepass1'), 'no passwords in audit');
  assert.equal((await get('/audit', nurse)).status, 403);

  // exports: owner-only CSV (formula-safe) and backup download
  await post('/patients', { name: '=HYPERLINK("x")' }, owner);
  const xpid = /patient\?id=(\d+)">History/.exec(await text('/?search=HYPERLINK', owner))[1];
  await post('/bills', { patient_id: xpid, clinic_id: 1, service: 'Consult', amount: '1', paid: '1' }, owner);
  const csv = await (await get('/export/bills.csv', owner)).text();
  assert.ok(csv.includes('Receipt') && csv.includes(`"'=HYPERLINK`), 'csv with formula guard');
  assert.equal((await get('/export/bills.csv', nurse)).status, 403);
  const bak = await get('/export/backup', owner);
  assert.ok((await bak.arrayBuffer()).byteLength > 1000 && bak.headers.get('content-disposition').includes('backup'));

  // privacy: owner deletes personal data; patient with bills is anonymized, not removed
  assert.equal((await post('/patients/delete', { id: xpid }, nurse)).status, 403);
  await post('/patients/delete', { id: xpid }, owner);
  const pp = await text('/patient?id=' + xpid, owner);
  assert.ok(pp.includes('Deleted patient #' + xpid) && !pp.includes('HYPERLINK'), 'anonymized');

  // disabling an employee logs them out
  await post('/staff/active', { id: 2, active: 0 }, owner);
  assert.equal((await get('/bills', nurse)).status, 303);
  assert.equal(await login('nurse', 'nursepass1'), undefined);

  console.log('All checks passed');
  server.close();
});

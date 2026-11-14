// Demo mode (DEMO=1, used on Vercel): fills an empty database with sample clinics, staff and records
// so portfolio visitors can log in and click around. All names and numbers here are made up.
const { db, hash, today } = require('./core');

const DEMO_ACCOUNTS = [
  { username: 'owner', password: 'demo1234', role: 'owner', label: 'Owner (sees everything)' },
  { username: 'staff.main', password: 'demo1234', role: 'employee', clinic: 'Main Clinic', label: 'Employee (Main Clinic)' },
];

function seedDemo() {
  if (db.prepare('SELECT 1 FROM users').get()) return;
  const ins = (sql, ...a) => db.prepare(sql).run(...a).lastInsertRowid;
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  db.exec('BEGIN');
  try {
    const clinics = [['Main Clinic', 'Rizal Ave, Lucena City'], ['Candelaria Branch', 'Quezon Ave, Candelaria'], ['Tayabas Branch', 'Gen. Luna St, Tayabas'], ['Sariaya Branch', 'Rizal St, Sariaya']]
      .map(([n, a]) => ({ id: ins('INSERT INTO clinics(name,address) VALUES(?,?)', n, a), name: n }));
    const cid = n => clinics.find(c => c.name === n).id;
    for (const a of DEMO_ACCOUNTS) ins('INSERT INTO users(username,hash,role,clinic_id) VALUES(?,?,?,?)', a.username, hash(a.password), a.role, a.clinic ? cid(a.clinic) : null);
    ins("INSERT INTO users(username,hash,role,clinic_id) VALUES('staff.candelaria',?,'employee',?)", hash('demo1234'), cid('Candelaria Branch'));

    const services = [['Consultation', 500], ['Follow-up check', 300], ['Blood test (CBC)', 350], ['X-ray', 1200], ['Ultrasound', 1800], ['Amoxicillin (10 caps)', 150], ['Paracetamol (10 tabs)', 60]];
    for (const [n, p] of services) ins('INSERT INTO services(name,cents) VALUES(?,?)', n, p * 100);

    const names = ['Maria Santos', 'Jose Reyes', 'Ana Dela Cruz', 'Mark Villanueva', 'Liza Bautista', 'Paolo Garcia', 'Grace Mendoza', 'Ramon Aquino', 'Carmela Ramos', 'Diego Navarro', 'Bea Flores', 'Nico Castillo'];
    const patients = names.map((n, i) => ins('INSERT INTO patients(name,phone,birthdate,notes) VALUES(?,?,?,?)', n, `0917 ${String(100 + i * 37).padStart(3, '0')} ${String(1000 + i * 211).slice(0, 4)}`, `19${70 + i * 2}-0${(i % 9) + 1}-1${i % 9}`, i % 4 === 0 ? 'Allergic to penicillin' : ''));

    // ~6 months of paid bills so the overview chart has a story; a few unpaid ones to collect.
    let n = 0;
    for (let d = -170; d <= 0; d += 3) for (const c of clinics) {
      if ((d + c.id) % 2) continue;
      const [svc, price] = services[(n + c.id) % services.length], [svc2, price2] = services[(n + 5) % services.length];
      const items = n % 3 ? [[svc, price]] : [[svc, price], [svc2, price2]];
      const subtotal = items.reduce((s, [, p]) => s + p * 100, 0), discount = n % 7 === 0 ? 'senior' : '', total = discount ? Math.round(subtotal * 0.8) : subtotal;
      const paid = d > -5 && n % 4 === 0 ? 0 : 1;
      const id = ins("INSERT INTO bills(patient_id,clinic_id,service,cents,subtotal,discount,method,paid,created,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
        patients[n % patients.length], c.id, items.map(i => i[0]).join(', '), total, subtotal, discount, ['cash', 'gcash', 'card', 'gcash'][n % 4], paid, day(d), c.name === 'Main Clinic' ? 'staff.main' : 'owner');
      for (const [s, p] of items) ins('INSERT INTO bill_items(bill_id,service,cents) VALUES(?,?,?)', id, s, p * 100);
      n++;
    }

    const times = ['09:00', '09:30', '10:30', '13:00', '14:30', '16:00'];
    times.forEach((t, i) => ins('INSERT INTO appointments(patient_id,clinic_id,at,reason,status,created_by) VALUES(?,?,?,?,?,?)', patients[i], cid(i < 4 ? 'Main Clinic' : 'Candelaria Branch'), `${today()}T${t}`, ['Consultation', 'Follow-up check', 'Blood test (CBC)', 'X-ray', 'Consultation', 'Ultrasound'][i], i < 2 ? 'done' : 'booked', 'staff.main'));
    [1, 2].forEach(k => ins('INSERT INTO appointments(patient_id,clinic_id,at,reason,created_by) VALUES(?,?,?,?,?)', patients[6 + k], cid('Main Clinic'), `${day(k)}T10:00`, 'Consultation', 'staff.main'));
    ins("INSERT INTO booking_requests(name,phone,clinic_id,at,reason) VALUES('Jasmine Lopez','0918 222 3344',?,?,'Checkup')", cid('Main Clinic'), `${day(2)}T09:30`);
    ins("INSERT INTO booking_requests(name,phone,clinic_id,at,reason) VALUES('Carlo Mercado','0919 555 0101',?,?,'Fever')", cid('Candelaria Branch'), `${day(1)}T15:00`);

    const stock = [['Paracetamol 500mg', 'box', 40, 120], ['Amoxicillin 500mg', 'box', 6, 25], ['Cetirizine 10mg', 'box', 18, 400], ['Alcohol 70%', 'bottle', 4, 300], ['Surgical gloves', 'box', 25, 600], ['ORS sachet', 'pcs', 80, 12]];
    for (const c of clinics) stock.forEach(([name, unit, qty, days], i) => ins('INSERT INTO inventory(clinic_id,name,qty,unit,expiry,low) VALUES(?,?,?,?,?,?)', c.id, name, Math.max(0, qty - c.id * (i % 3)), unit, day(days - c.id * 4), 10));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { seedDemo, DEMO_ACCOUNTS };

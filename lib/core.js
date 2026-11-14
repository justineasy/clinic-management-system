// Database, schema and shared helpers (no HTML layout here).
const http = require('node:http');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
// Servers usually run in UTC; dates/earnings must follow clinic time. (Windows CRT can't parse IANA names, and uses local time anyway.)
if (process.platform !== 'win32') process.env.TZ ||= 'Asia/Manila';
const here = f => path.join(__dirname, '..', f); // data and backups stay next to server.js

const db = new DatabaseSync(process.env.DB || here('clinic.db'));
db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS clinics(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, address TEXT);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','employee')), clinic_id INTEGER REFERENCES clinics(id), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS patients(id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, birthdate TEXT, notes TEXT, created TEXT DEFAULT (date('now','localtime')));
CREATE TABLE IF NOT EXISTS appointments(id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), clinic_id INTEGER NOT NULL REFERENCES clinics(id),
  at TEXT NOT NULL, reason TEXT, status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','done','cancelled','no-show')), created_by TEXT);
CREATE TABLE IF NOT EXISTS bills(id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), clinic_id INTEGER NOT NULL REFERENCES clinics(id),
  service TEXT NOT NULL, cents INTEGER NOT NULL CHECK(cents > 0), paid INTEGER NOT NULL DEFAULT 0, created TEXT DEFAULT (date('now','localtime')), created_by TEXT);
CREATE TABLE IF NOT EXISTS inventory(id INTEGER PRIMARY KEY, clinic_id INTEGER NOT NULL REFERENCES clinics(id), name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0 CHECK(qty >= 0), unit TEXT, expiry TEXT, low INTEGER NOT NULL DEFAULT 10);
CREATE TABLE IF NOT EXISTS bill_items(id INTEGER PRIMARY KEY, bill_id INTEGER NOT NULL REFERENCES bills(id), service TEXT NOT NULL, cents INTEGER NOT NULL CHECK(cents > 0));
CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, cents INTEGER NOT NULL CHECK(cents > 0));
CREATE TABLE IF NOT EXISTS booking_requests(id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, clinic_id INTEGER NOT NULL REFERENCES clinics(id), at TEXT NOT NULL, reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', created TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT DEFAULT (datetime('now','localtime')), who TEXT, clinic_id INTEGER, action TEXT NOT NULL, detail TEXT);
CREATE TABLE IF NOT EXISTS stock_log(id INTEGER PRIMARY KEY, inventory_id INTEGER NOT NULL, item TEXT, clinic_id INTEGER, change INTEGER NOT NULL, by TEXT, at TEXT DEFAULT (datetime('now','localtime')));`);
// Columns added after the first version; ignore "duplicate column" on databases that already have them.
for (const col of ["method TEXT NOT NULL DEFAULT 'cash'", "discount TEXT NOT NULL DEFAULT ''", 'subtotal INTEGER', 'voided INTEGER NOT NULL DEFAULT 0', 'void_reason TEXT', 'appointment_id INTEGER'])
  try { db.exec(`ALTER TABLE bills ADD COLUMN ${col}`); } catch {}
const METHODS = ['cash', 'gcash', 'card', 'bank'];
const logStock = (u, i, change) => db.prepare('INSERT INTO stock_log(inventory_id,item,clinic_id,change,by) VALUES(?,?,?,?,?)').run(i.id, i.name, i.clinic_id, change, u.username);
const list = v => [].concat(v ?? []);
const nowLocal = () => { const d = new Date(); return d.toLocaleDateString('en-CA') + 'T' + d.toTimeString().slice(0, 5); };
const bookHits = new Map(); // ip -> request times; shortcut: in memory, resets on restart
const patientLabel = (id, name, phone) => `${name}${phone ? ' · ' + phone : ''} (#${id})`;
// Type-to-search patient box: picking a suggestion carries "(#id)"; any other text becomes a new patient.
function patientField(value = '') {
  const ps = db.prepare('SELECT id, name, phone FROM patients ORDER BY name LIMIT 5000').all();
  return `<input name="patient" list="patients" value="${esc(value)}" placeholder="Patient: type to search or add new" required autocomplete="off" class="grow2">
    <input name="phone" placeholder="Phone (new patient)" maxlength="20"><datalist id="patients">${ps.map(p => `<option value="${esc(patientLabel(p.id, p.name, p.phone))}">`).join('')}</datalist>`;
}
function resolvePatient(f) {
  if (f.patient_id && !f.patient) return db.prepare('SELECT id FROM patients WHERE id=?').get(Number(f.patient_id))?.id ?? null;
  const text = (f.patient || '').trim(), m = /(#(d+))$/.exec(text);
  if (m) return db.prepare('SELECT id FROM patients WHERE id=?').get(Number(m[1]))?.id ?? null;
  if (!text || text.length > 100) return null;
  const same = db.prepare('SELECT id FROM patients WHERE name = ? COLLATE NOCASE').all(text);
  if (same.length === 1 && !f.phone) return same[0].id; // typed an existing name exactly without picking
  return db.prepare("INSERT INTO patients(name,phone) VALUES(?,?)").run(text, (f.phone || '').trim()).lastInsertRowid;
}
const statusText = b => b.voided ? 'Voided' : b.paid ? 'Paid' : 'Unpaid';
const billStatus = b => `<span class="badge b-${statusText(b).toLowerCase()}">${statusText(b)}</span>`;

const hash = (pw, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
const verify = (pw, stored) => { const [salt, h] = stored.split(':'); return crypto.timingSafeEqual(Buffer.from(h, 'hex'), crypto.scryptSync(pw, salt, 32)); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = c => '₱' + ((c || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
const clinics = () => db.prepare('SELECT * FROM clinics ORDER BY name').all();
const canAccess = (u, clinicId) => u.role === 'owner' || u.clinic_id === Number(clinicId);
// Employees are locked to their clinic; owner may pick one or see all (null).
const scope = (u, q) => u.role === 'owner' ? (Number(q.clinic) || null) : u.clinic_id;
const whereClinic = (col, c) => c ? `${col} = ${Number(c)}` : '1=1';

// Clinic picker: owner gets a dropdown, employee gets a fixed hidden field.
function clinicField(u, selected, { all = false, name = 'clinic_id' } = {}) {
  if (u.role !== 'owner') return `<input type="hidden" name="${name}" value="${u.clinic_id}">`;
  return `<select name="${name}" ${all ? '' : 'required'}>${all ? '<option value="">All clinics</option>' : '<option value="">Clinic…</option>'}
    ${clinics().map(c => `<option value="${c.id}" ${Number(selected) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
}
const filterBar = (u, q, extra = '') => u.role === 'owner' ? `<form>${clinicField(u, q.clinic, { all: true, name: 'clinic' })} ${extra} <button>Filter</button></form>` : (extra ? `<form>${extra} <button>Show</button></form>` : '');

const sid = req => /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
try { db.exec("ALTER TABLE sessions ADD COLUMN created TEXT"); } catch {}
// Sessions last 12 hours (one shift), then the user logs in again.
const getUser = req => { const t = sid(req); return t ? db.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND u.active=1 AND s.created > datetime('now','-12 hours')").get(t) : undefined; };
// shortcut: lockout counts live in memory and reset on restart; fine for one server.
const fails = new Map(); // username -> { n, until }
const hasUsers = () => db.prepare('SELECT 1 FROM users').get();


module.exports = { http, crypto, path, here, db, METHODS, logStock, list, nowLocal, bookHits, patientLabel, patientField, resolvePatient, statusText, billStatus, hash, verify, esc, peso, today, clinics, canAccess, scope, whereClinic, clinicField, filterBar, sid, getUser, fails, hasUsers };

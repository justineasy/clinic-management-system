# ClinicHub: Clinic Management System

Multi-clinic system: owner and employee accounts, patients, appointments, billing with receipts, earnings overview, and inventory.
Needs only **Node.js 22.13 or newer**. Nothing to `npm install`.

## Run locally
On Windows, double-click **start.bat**. It opens the browser. Keep the black window open while using the app.
```
node server.js        # prints the address, e.g. http://localhost:3737 (next free port if 3737 is busy)
node test.js          # self-check
```
On the first visit, create the owner account. Then add clinics (**Clinics**) and employees (**Staff**).

## Live demo (Vercel)
On Vercel, `server.js` runs in **demo mode** with sample data (4 clinics, staff, bills, stock).
Vercel has no permanent disk, so demo data resets when the server restarts. **Use a VPS (below) for a real clinic.**
Demo logins are shown on the login page. Run the same demo locally with `npm run demo` (macOS/Linux) or `set DEMO=1&& set DB=:memory:&& node server.js` (Windows).

## Data and backups
- All data lives in `clinic.db`.
- A copy is saved daily to `backups/` and the newest 30 are kept. **Also copy `backups/` off the server** (Google Drive, a USB drive), because a backup on the same machine dies with it.
- To restore: stop the server and replace `clinic.db` with a backup file.

## Put it online (one VPS for all 4 clinics)
1. Rent a small Ubuntu VPS (1 GB RAM is enough) and point a domain at it.
2. Install Node 22+, copy this folder over, and run it with a process manager:
   `npm i -g pm2 && HTTPS=1 pm2 start server.js --name clinic && pm2 save && pm2 startup`
3. Put **Caddy** in front for free automatic HTTPS. `/etc/caddy/Caddyfile`:
   ```
   clinic.example.com {
       reverse_proxy localhost:3737
   }
   ```
4. Block port 3737 from outside (`ufw allow 22,80,443/tcp && ufw enable`).

`HTTPS=1` marks the login cookie Secure, so set it only when the site is behind HTTPS.
**Never run it on the internet without HTTPS.** It holds patient data (Data Privacy Act).

## Code layout
- `server.js`: starts the app, checks logins and roles, writes the activity log, daily backups
- `lib/core.js`: database tables and shared helpers
- `lib/ui.js`: page layout and styles
- `lib/routes-desk.js`: front-desk pages (patients, appointments, booking, billing, stock)
- `lib/routes-owner.js`: owner pages (overview, activity log, reports, inventory, clinics, staff)
- `test.js`: self-check, run `node test.js` after every change

## Roles
| | Owner | Employee |
|---|---|---|
| Overview (earnings per clinic, payment methods, alerts) | ✅ | ❌ |
| Inventory, stock log, clinics, staff | ✅ | ❌ |
| Void bills | ✅ | ❌ |
| Activity log, reports (CSV), backup download, delete patient data | ✅ | ❌ |
| Price list | ✅ edit | uses it when billing |
| Patients | ✅ | ✅ |
| Appointments, billing, receipts | ✅ all clinics | ✅ own clinic |
| Use stock (deduct only, no quantities shown) | ✅ | ✅ own clinic |

## Online booking for patients
Share **https://your-domain/book** (Facebook page, Google Maps, SMS). Patients send a request with name, mobile, clinic and preferred time.
Staff see it at the top of **Appointments** (an orange count shows on the menu) and confirm it after calling or texting the patient.
It only works for patients once the app is online. On your PC it's http://localhost:3737/book.

## Known limits
- Receipts are informal, **not BIR official receipts**.
- The senior/PWD discount is a flat 20% with no VAT-exemption math.
- No SMS reminders, HMO, or doctor schedules yet. Online booking requests need a staff confirmation (no automatic SMS).

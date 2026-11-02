# Ferentino management system — Next.js + MongoDB

One application that replaces the two earlier pieces (the single `ferentino-management-system.html` page and the Java/MySQL server):

* **Next.js** serves the web site *and* the API (`/api/...`), so there is only one program to run.
* **MongoDB** keeps the people, passwords, signatures, audit log, every page's records and the attached files.
* The **33 working apps** (Press Monitoring, CAPA, Document Control, KPI dashboards …) are the same apps as before, extracted from the big HTML file into `public/apps/`. They are shown inside a new application shell: sign-in screen, department sidebar, tabs, sync status, people administration.

```
Browser ── Next.js (this project) ── MongoDB
  │            ├─ pages / UI  (src/app, src/components)
  │            ├─ /api/...    (src/app/api → src/lib/server)
  │            └─ /apps/*.html (the 33 working apps, in iframes)
  └─ each app still saves in the browser first; src/lib/client/sync.ts copies every change to MongoDB a moment later
```

---

## Step by step

### 1. Install the tools
| Tool | Version | Check |
|---|---|---|
| Node.js | 20.9 or newer (22/24 fine) | `node -v` |
| MongoDB | 6, 7 or 8 — see step 3 | `mongod --version` (local install only) |

### 2. Get the packages
```
cd ferentino-next
npm install
```

### 3. Get a MongoDB — pick **one**
**A. MongoDB Atlas (hosted, free tier, nothing to install).** Create a free cluster at <https://www.mongodb.com/atlas>, add a database user, allow your server's IP address, then copy the connection string (`mongodb+srv://user:password@cluster….mongodb.net`).

**B. MongoDB Community Server on this computer (Windows).** Download the MSI from <https://www.mongodb.com/try/download/community>, install it with *"Install MongoDB as a Service"* ticked. It then listens on `mongodb://127.0.0.1:27017` and starts with Windows.

**C. Docker.**
```
docker run -d --name ferentino-mongo --restart unless-stopped -p 127.0.0.1:27017:27017 -v ferentino-data:/data/db mongo:7
```

**D. Just trying it out (no install, nothing kept).**
```
npm run mongo:dev
```
Leave that window open; it runs a temporary MongoDB on port 27018 (`MONGODB_URI=mongodb://127.0.0.1:27018`). Everything is lost when you close it.

### 4. Settings
Copy `.env.example` to `.env.local` and edit it:
```
MONGODB_URI=mongodb://127.0.0.1:27017      # or the Atlas string
MONGODB_DB=ferentino
ADMIN_EMAIL=you@yourcompany.lk              # the first administrator
ADMIN_PASSWORD=                             # leave empty to get a temporary one printed
```

### 5. Start it
```
npm run dev          # for trying and changing things  → http://localhost:3000
```
On the **first start** the administrator account is created and a temporary password is printed in the terminal:
```
 First start: the administrator account was created.
   Sign in with  : you@yourcompany.lk
   Password      : Xy7…            (you will be asked to change it)
```
Open <http://localhost:3000>, sign in, choose your own password. Then **your name ▾ → People and passwords** (or the sidebar) to add everybody; each person gets a temporary password to hand over and chooses their own at first sign-in.

#### Optional: demonstration data (the seeder)
To see the pages filled in, run this once (MongoDB must be running and `.env.local` set):
```
npm run seed
```
It adds three demonstration people (password `Demo2026pw`, change it with `SEED_PASSWORD=...`), 8 accidents with a KPI target (Accident Registry), 11 controlled documents (Document Control and its Master Lists), 20 employees split over the shift groups (Shift Groups) and 4 signatures (Signature log).
* Safe to repeat: it adds what is missing and never overwrites data somebody has entered. `npm run seed -- --reset` removes what an earlier seed made and adds it again; `--force` overwrites the demonstration records even if they were edited.
* Use it on a trial database. The demonstration people have a known password, so remove them (People → Switch off) before real use.
* The other apps (KPI dashboards, Press Monitoring, …) are fed by uploading the real Excel/CSV reports in the app, so they have no seed data.

### 6. Run it for everybody (production)
```
npm run build
npm start            # → http://<this-computer>:3000   (use  npm start -- -p 8080  for another port)
```
* Open the Windows firewall for that port so other computers on the company network can reach `http://<server-name>:3000`.
* Keep it running: use **pm2** (`npm i -g pm2`, `pm2 start npm --name ferentino -- start`, `pm2 save`) or **NSSM** to make it a Windows service.
* **HTTPS**: put it behind a reverse proxy that provides https (Caddy, nginx, IIS) and then set `COOKIE_SECURE=1` and `TRUST_PROXY=1` in `.env.local`. The proxy must overwrite the `X-Forwarded-For` header (otherwise a person can pick which "computer" the sign-in rate limit sees).
* Run **one** copy of the server. The change counter that keeps pages in step is coordinated inside the process; two copies at once could miss each other's changes.

### 7. Bringing in the data that is already in a browser
Open the new site **from the computer that holds your data**, sign in, and it is copied to the server automatically. If that browser already holds different data from the server, a dialog asks which copy to keep. Attached files (Document Library, Document Control, Waste Disposal) are copied to the database too.
Note that the browser keeps its data per web address: if the old system was opened as `http://oldserver:3000` and the new one is `http://newserver:3000`, use the **backup** instead — in the old system *Download backup*, in the new one *your name ▾ → Upload backup…*.
People from the Java/MySQL system cannot be moved (and nothing else needs to be: the MySQL database only held copies of what the browsers saved); add them again under *People*.

### 8. Everyday use
* **Everybody signs in.** Until a person signs in the system stays locked.
* **Two people on the same page.** Each page's records are one item. If somebody else saved a newer version first, a banner says *"Not saved — somebody else saved a newer version first"* with **Use their version** / **Keep mine**, and *"Changed by …"* with **Reload to see it** when others save. Nothing is overwritten silently.
* **Earlier versions.** The server keeps up to ten earlier copies of every item (at most one every ten minutes). Administrator → **Stored data → Earlier copies → Bring back**.
* **Signatures.** An app asks for a signature; the person types their password; it is recorded with name, time and a hash of the content (**Signature log** in the sidebar).
* **Five wrong passwords** lock an account for 15 minutes. Forgotten password: the person chooses *Forgot password* (an e-mail to the administrator opens), the administrator issues a one-time **reset code** (valid 48 hours) from *People*.
* **Backups.** Back up the database every night:
  ```
  mongodump --uri="mongodb://127.0.0.1:27017" --db=ferentino --gzip --archive=ferentino-YYYYMMDD.gz
  mongorestore --uri="mongodb://127.0.0.1:27017" --gzip --archive=ferentino-YYYYMMDD.gz --drop
  ```
  (files are in it too; Atlas does this for you). *Download backup* in the menu is an additional, per-browser copy of everything.

### 9. Updating a working app
Replace `public/apps/<key>.html` with the new file and refresh the browsers. The data stays in MongoDB. The keys, titles and which department each app belongs to are in `src/lib/registry.ts`.

---

## What is where
```
public/apps/*.html          the 33 working apps (extracted from the original page; unchanged)
public/logo.jpg
scripts/extract-apps.mjs    re-extracts the apps from the original HTML if you ever need to
scripts/mongo-dev.mjs       temporary in-memory MongoDB for trying things
scripts/seed.mjs            demonstration data (npm run seed)
src/instrumentation.ts      connects to MongoDB when the server starts, creates the first administrator
src/lib/server/             db.ts (collections, indexes, change counter) · auth.ts · sync.ts · security.ts · http.ts
src/app/api/**/route.ts     one file per endpoint, each a line or two
src/lib/registry.ts         departments → tabs → apps
src/lib/client/             sync.ts (browser ⇄ MongoDB) · bridge.ts (app-to-app messages) · frames.ts · backup.ts · auth.ts
src/components/             Shell (sign-in gate) · Chrome (sidebar, tabs) · TopBar · Dialogs …
src/app/**/page.tsx         home, department routes (/d/qc/press), people, audit log, stored data, signature log
tests/api_test.py           66 checks of the API
```

### The Java → Next.js mapping
| Java | Now |
|---|---|
| `Main.java` routes, static files | `src/app/api/**/route.ts`, Next's own file serving |
| `Auth.java`, `Security.java` | `src/lib/server/auth.ts`, `security.ts` (same PBKDF2 hash format, same rules, same messages) |
| `Sync.java` (`data_items`, `data_history`, `files`) | `src/lib/server/sync.ts` (collections `data_items`, `data_history`, GridFS bucket `files`) |
| `Db.java`, `schema.sql` | `src/lib/server/db.ts` (indexes are created automatically on start) |
| the shell `<script>` in the HTML page | `src/lib/client/*.ts` + React components |

The API is the same as before (see the table in the old README), so the working apps and the sync logic needed no changes.

### MongoDB collections
`users`, `sessions`, `resets`, `signatures`, `audit_log`, `counters`, `data_items`, `data_history`, and the GridFS bucket `files` (`files.files`, `files.chunks`).

## Things to know
* **One page's records = one MongoDB document**, and MongoDB limits a document to 16 MB, so `MAX_DATA_MB` is capped at 15 (the MySQL version allowed 64). Attached files are not affected (GridFS, up to `MAX_FILE_MB`). If a page ever reaches the limit it says *"too large to save"* and the page's records need splitting.
* **Everybody who signs in can read and change every page's records.** Only the administrator can manage people, see the audit log and the stored data. Rights per department are not built yet.
* **The working apps are the original apps.** Press Monitoring still shows its own old "Not connected to a network server" box — that is the app's own feature from before the shared server existed; the saving to MongoDB happens anyway (see the status chip at the top: *Saved on the server*).
* **Signing out reloads the page**, after first sending the last typed changes to the server, so no app keeps the previous person's screen in memory. The browser still keeps its local copy of the data (as before) — on a shared computer, sign out and close the browser.
* Fonts come from Google Fonts when the computer is online and fall back to system fonts when it is not.

## Tests
With the server running against a **fresh** database whose first administrator is `admin@ferentino.test` / `Start123pw`:
```
npm run mongo:dev                                   # window 1 (temporary MongoDB)
# window 2:  (PowerShell)
$env:MONGODB_URI="mongodb://127.0.0.1:27018"; $env:MONGODB_DB="apitest"; $env:ADMIN_EMAIL="admin@ferentino.test"; $env:ADMIN_PASSWORD="Start123pw"
npm run build; npx next start -p 3110
# window 3:
$env:BASE="http://localhost:3110"; npm run test:api
```
Expected: `66 passed, 0 failed`. `npm run typecheck` checks the TypeScript.

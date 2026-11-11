# Job Tracker

A personal CRM for the job hunt. Track every application from *saved* to *offer*, and always know **where** you applied, **when**, **which email** you used, **which resume version** you sent, what the **status** is, and what you need to do **next**.

**Stack:** React 18 + Vite, Tailwind CSS, React Router, React Hook Form, Recharts, Lucide · Node.js + Express REST API · MongoDB + Mongoose · JWT auth + bcrypt · Multer uploads (stored in MongoDB GridFS) · Nodemailer (optional) · PDFKit reports.

---

## Features

| Area | What you get |
|---|---|
| **Auth** | Register / login / logout, JWT sessions, bcrypt-hashed passwords, profile + password change. Every record is scoped to its owner on every endpoint. |
| **Dashboard** | Counts for all statuses, conversion rate, weekly activity, status donut, by company, by job type, monthly bars, upcoming interviews, due/overdue reminders (complete in one click), recently updated. All computed from the database. |
| **Application form** | **Quick add** (default for new entries): one screen with company, title, website, posting URL, job ID, source, status, date, resume and email, plus **Save & add another**, which keeps status, source, date, resume and email for the next entry. Switch to the **Full form** at any time without losing what you've typed. Full form: 7 tabs: Company & Job · Application · Email · Resume & Docs · Recruiter & Referral · Interviews (dynamic rounds) · Additional (skills, difficulty, tags, JD snapshot). Client + server validation, URL normalisation, duplicate detection with “save anyway”. |
| **Applications** | Table, card and Kanban (drag-and-drop) views. Search + filters (status, date range, email, resume, job type, source, priority, tag) that combine and live in the URL. Sort by newest, oldest, priority, next follow-up, updated, company. Pagination. View / edit / duplicate / delete / open posting. |
| **Share a job** | **Share** on an application creates a private link (expires after 30 days). A friend who opens it, after signing in, sees the company, website, job title and posting link, and can **Add to my Saved** or **Decline**. Nothing else from your application is shared. |
| **Friends** | Every user has a private **friend code** (e.g. `K7QM-3XPA`, renewable). Add friends by code (users can't be searched or listed), accept or decline requests. Select several jobs on the Applications page, click **Send to friends**, and each friend gets **one email listing the jobs** plus a **Shared with me** list where they can add each one (or all) to their Saved list or decline. Only company, website, job title and posting link are shared. |
| **Status lifecycle** | 11 statuses. Every change records from → to, timestamp and optional note in the status history, plus an activity timeline entry. Undo from the toast. |
| **Resume library** | Upload PDF/DOC/DOCX with name, version, category, description. Inline PDF preview, download, usage count, interviews & offers per resume, best-performer badge. Documents in use are **archived, never deleted**; each application also stores a snapshot of the exact resume version submitted. Cover letters and other documents share the library. |
| **Email accounts** | Multiple addresses, default account (pre-selected in the form), counts per account, filter applications by account. Accounts in use are archived instead of deleted. Manual tracking only — an `integration` field is reserved for future Gmail/Outlook OAuth. |
| **Interviews** | Unlimited rounds per application (type, date/time, link/location, interviewer, status, prep notes, questions, feedback, result). Global Interviews page grouped by day. Scheduling the first interview auto-advances the application status. |
| **Reminders** | Auto-generated and kept in sync from follow-up dates, deadlines and scheduled interviews; plus manual reminders. Overdue / today / upcoming / completed views, notifications in the top bar, optional email digests. |
| **Analytics** | Date-range presets or custom range. Applications by month, status, company, source, job type; interview types and outcomes; funnel; interview/offer/rejection rates; average days to first interview; resume-version and email-account performance tables. **CSV export** and **PDF report**. |
| **UX** | Light / dark / system themes, responsive layout with mobile sidebar, toasts with undo, skeleton loaders, empty states, confirm dialogs, keyboard shortcuts (`N` new application, `/` search). |

---

## Quick start

**Prerequisites:** Node.js ≥ 18.18 and MongoDB ≥ 5 running locally (or a MongoDB Atlas URI).

```bash
# 1. API
cd server
cp .env.example .env          # set JWT_SECRET (and MONGODB_URI if not local)
npm install
npm run seed                  # optional: demo data
npm run dev                   # http://localhost:5001/api

# 2. Web app (new terminal)
cd client
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Open http://localhost:5173 and register, or sign in with the seeded demo account:

```
demo@jobtracker.dev / password123
```

> No local MongoDB? `docker run -d -p 27017:27017 --name mongo mongo:7` or use `brew services start mongodb-community`.

### Tests

```bash
cd server
npm test        # 42 integration tests against a throw-away `jobtracker_test` database
```

The suite covers registration/login, profile, email accounts, resume upload/download, full application create with interviews, validation errors, duplicate detection, status history, nested updates and interview syncing, combined search/filters/sort/pagination, cross-user isolation, CSV, reminders, the email notifier, analytics, PDF generation, safe (archival) deletion and cascade deletes.

---

## Configuration

`server/.env`

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `5001` | API port (5000 is taken by AirPlay on macOS). |
| `CLIENT_URL` | `http://localhost:5173` | CORS origin(s), comma-separated. Also used for links in emails. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/jobtracker` | |
| `JWT_SECRET` | — | **Required.** Long random string (≥ 32 chars in production). Changing it signs everyone out. |
| `JWT_EXPIRES_IN` | `7d` | |
| `REGISTRATION_CODE` | empty | When set, sign-up requires this invite code. Recommended for a hosted, friends-only site. |
| `MAX_UPLOAD_MB` | `10` | Uploaded files are stored in MongoDB (GridFS), served only through authenticated routes. |
| `TRUST_PROXY` | `1` in production, else `0` | Number of reverse proxies in front of the API, so rate limits see real client IPs. |
| `SMTP_HOST` … `MAIL_FROM` | empty | Leave `SMTP_HOST` empty to log emails to the console instead of sending. |
| `REMINDER_CHECK_INTERVAL_MIN` | `60` | How often the reminder digest job runs. `0` disables it. |

`client/.env`

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | `/api` | In development Vite proxies `/api` to `localhost:5001`. Set to the full API URL in production. |

### Email notifications

1. Fill in the `SMTP_*` variables (e.g. Gmail with an app password: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`).
2. In the app: **Settings → Email notifications**, enable and choose which reminder types and how far ahead.
3. Use **Send test email** to check the setup. The job sends one digest per user and never re-sends the same reminder unless its date changes.

---

## Project structure

```
server/
  src/
    config/        env + MongoDB connection
    models/        User, Application, Resume (documents), EmailAccount, Interview, Reminder
    validators/    zod schemas for every request body/query
    middleware/    auth (JWT), validate, upload (multer), error handler
    controllers/   thin HTTP handlers per resource
    services/      business logic: applications, reminder sync, analytics, export (CSV/PDF), mailer, notifier
    routes/        REST route table
    seed.js        demo data
  tests/           node:test + supertest integration tests
client/
  src/
    api/           axios client (auth header, 401 handling, file downloads) + endpoint wrappers
    context/       Auth, Theme, Toast, Lookups (shared email/resume lists)
    hooks/         useAsync, useUrlFilters, useApplicationActions
    components/
      ui/          design-system primitives (Button, Field, Modal, Menu, Tabs, Badge, Skeleton…)
      layout/      Sidebar, Topbar (search, theme, notifications, profile), AppLayout
      applications/ table, cards, kanban, filters, status menu, timelines, form/ (one file per tab)
      resumes/ interviews/ reminders/ charts/
    pages/         one file per route
docs/API.md        endpoint reference
```

## Data model (summary)

- **Application** → `user`, `resume` (ref) + `resumeSnapshot`, `documents[]` (refs), `emailUsed.account` (ref) + `emailUsed.address` snapshot, embedded `statusHistory[]` and `activity[]`; `interviews` and `reminders` are virtual-populated from their own collections.
- **Interview** → `user`, `application`.
- **Reminder** → `user`, optional `application` / `interview`, `origin: auto | manual`.
- **Resume** → one collection for resumes, cover letters and other documents (`kind`), with soft-delete via `isArchived`.
- **EmailAccount** → unique per user + email, `isDefault`, `isArchived`, reserved `integration` block.

Snapshots mean an application keeps showing the exact email and resume it was sent with even if the account or resume is later renamed or archived.

## Design decisions

- **Archive instead of delete** for resumes and email accounts that are referenced by applications, so history is never broken. Unreferenced ones are deleted (including the file).
- **Auto reminders** are derived data: changing an application's follow-up date, deadline, status, or an interview's date/status updates or removes them. Manual reminders are never touched.
- **Files are private:** uploads are stored in MongoDB GridFS (so they survive restarts on hosts with temporary disks) and are never served statically. Each file is checked for a real PDF/DOC/DOCX signature on upload, and is only streamed back to its owner. The client fetches it with the JWT and previews it through a blob URL.
- **Analytics are computed per request** from the user's records (fine for a personal tracker's data volume). An app counts as "interviewed" or "offered" if it ever reached that stage, judged from status history and interview rounds, so later rejections don't erase earlier progress.
- `bcryptjs` (pure-JS bcrypt, same hash format) is used instead of native `bcrypt` to avoid node-gyp builds.
- Company logos come from Google's public favicon service using the company website's domain; the app falls back to initials if that fails.

## Deployment

Free hosting on **MongoDB Atlas** (database and files) + **Vercel** (website and API on one domain). Step-by-step guide: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

- [vercel.json](vercel.json) uses Vercel **services**: `client` (Vite, public at `/`) and `server` (Express, public at `/api`) deploy as one project on one domain. The server's entry point is [server/src/vercel.js](server/src/vercel.js).
- Locally, `server/src/index.js` runs the same Express app as a normal server.
- On Vercel: uploads are capped at 4 MB, reminder digests run once a day via Vercel Cron, and login/sign-up rate limits are stored in MongoDB so they hold across function instances.

## Security

- **Accounts:** bcrypt (cost 12) password hashes; JWTs signed with a required secret; tokens issued before a password change are rejected; login timing doesn't reveal which emails are registered; optional invite code for sign-up.
- **Isolation:** every query is scoped to the signed-in user; other users' records return 404.
- **Input:** zod validation on every write; flat query strings only (blocks `?field[$ne]=` operator injection); regex search input is escaped; 1 MB JSON limit.
- **Uploads:** PDF/DOC/DOCX only, verified by file signature, size-capped, stored privately in the database.
- **Abuse limits:** per-IP rate limits overall, on failed logins (10 / 15 min), sign-ups, password changes and test emails. The security-relevant ones are stored in MongoDB, so they hold across serverless instances.
- **Scheduled job:** `/api/cron/reminders` only answers requests carrying `CRON_SECRET`; without the secret it looks like a missing route. API responses are sent with `Cache-Control: no-store`.
- **HTTP:** Helmet headers on the API; CORS limited to `CLIENT_URL`; the web app ships a strict Content-Security-Policy (no inline or third-party scripts) plus HSTS, frame-blocking and related headers via `vercel.json`.
- **Safe startup:** with `NODE_ENV=production` the API refuses to start without HTTPS `CLIENT_URL`, a strong `JWT_SECRET` and `MONGODB_URI`. `npm run seed` refuses to run against a non-local database, because the demo account has a public password.
- **Secrets:** `.env` files are git-ignored; production secrets live only in Vercel's environment variables.

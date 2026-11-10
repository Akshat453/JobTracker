# API reference

Base URL: `http://localhost:5001/api`

All endpoints except `health`, `auth/config`, `register` and `login` need `Authorization: Bearer <token>`.
Query strings are parsed flat: use comma-separated values (`status=applied,offer`), not repeated keys or `key[]=` syntax.
Responses are JSON. Errors have this shape:

```json
{ "error": { "message": "company.name: Required", "details": [{ "path": "company.name", "message": "Required" }] } }
```

| Status | Meaning |
|---|---|
| 400 | Validation failed / invalid id / malformed JSON / bad upload |
| 401 | Missing, invalid or expired token, or the password was changed after the token was issued |
| 403 | Missing or wrong invite code on sign-up |
| 404 | Not found **or not owned by you** (other users' records are indistinguishable from missing ones) |
| 409 | Duplicate (email already registered, email account exists, possible duplicate application) |
| 429 | Rate limited: overall per-IP cap, failed logins (10 / 15 min), sign-ups (10 / hour), password changes, test emails |

Empty strings in request bodies are treated as "clear this field". URLs without a scheme are normalised to `https://`.

---

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/auth/config` | — | `{ inviteRequired, maxUploadMb }` |
| POST | `/auth/register` | `{ name, email, password, inviteCode? }` (password ≥ 8; `inviteCode` required when the server sets `REGISTRATION_CODE`) | `201 { token, user }`. Also creates a default email account from the sign-up address. |
| POST | `/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/auth/me` | — | `{ user }` |
| PUT | `/auth/me` | any of `name, headline, location, phone, linkedinUrl, skills[], notificationPrefs{ emailEnabled, notifyEmail, interviewReminders, followUpReminders, deadlineReminders, leadTimeHours }` | `{ user }` |
| PUT | `/auth/password` | `{ currentPassword, newPassword }` | `{ message, token }`. All older tokens stop working; use the returned token. |

## Applications

### `GET /applications`
Query parameters (all optional, all combine with AND):

| Param | Example | Notes |
|---|---|---|
| `search` | `google` | company, job title, job ID or tag (case-insensitive) |
| `status` | `applied,interviewing` | comma-separated |
| `from`, `to` | `2026-01-01` | application date range (inclusive) |
| `emailAccount` | `<id>` or `none` | |
| `resume` | `<id>` or `none` | |
| `employmentType`, `source`, `priority`, `tag` | `Internship` | comma-separated allowed |
| `sort` | `newest` \| `oldest` \| `priority` \| `followup` \| `updated` \| `company` | default `newest`; `followup` puts apps without a date last |
| `page`, `limit` | `1`, `20` | `limit` ≤ 500 |

Returns `{ items, page, limit, total, totalPages }`. Each item includes `resume { name, version, … }` and `emailUsed.accountInfo`.

### `POST /applications[?force=true]`
Body (only `company.name` and `jobTitle` are required):

```jsonc
{
  "company": { "name": "Acme", "website": "acme.com", "location": "Remote" },
  "jobTitle": "Software Engineer",
  "jobDescription": "…", "jobPostingUrl": "…", "jobId": "REQ-1", "department": "…", "industry": "…",
  "employmentType": "Full-time|Internship|Part-time|Contract",
  "workMode": "Remote|Hybrid|On-site",
  "salary": { "min": 100000, "max": 150000, "currency": "INR", "period": "year|month|hour" },
  "experienceRequired": "0-2 years",
  "applicationDate": "2026-11-01", "deadline": null, "status": "applied",
  "source": "LinkedIn|Naukri|Wellfound|Company Website|Referral|Internshala|Indeed|Other",
  "applicationLink": "…", "lastUpdateDate": null, "nextFollowUpDate": "2026-11-10",
  "priority": "High|Medium|Low", "notes": "…", "statusNote": "optional note for the first history entry",
  "emailUsed": { "account": "<emailAccountId>", "address": "if no account", "provider": "Gmail|Outlook|Other",
                 "confirmationReceived": true, "confirmationDate": "…", "subject": "…", "recruiterEmail": "…", "notes": "…" },
  "resume": "<resumeId>", "documents": ["<docId>"],
  "recruiter": { "name": "…", "email": "…", "linkedinUrl": "…", "phone": "…" },
  "referral": { "received": true, "name": "…", "contact": "…", "notes": "…" },
  "interviews": [{ "roundName": "Round 1", "type": "Technical", "date": "2026-11-12", "time": "14:30", "status": "Scheduled", "...": "…" }],
  "personalNotes": "…", "jdSnapshot": "…", "skillsRequired": ["react"], "skillsMatched": ["react"],
  "difficulty": "Easy|Medium|Hard", "tags": ["dream"]
}
```

If an application with the same company + title (+ job ID, if given) already exists, the API returns `409` with `details.duplicateId`. Repeat the request with `?force=true` to save it anyway.
Returns `201 { application }`, fully populated (`resume`, `documents`, `emailUsed.account`, `interviews`, `reminders`).

### Other application routes

| Method | Path | Notes |
|---|---|---|
| GET | `/applications/:id` | Full detail, populated |
| PUT | `/applications/:id` | Partial update. Nested objects merge (`{ "company": { "location": "NYC" } }` keeps the name). If you send `interviews`, the list replaces the existing rounds: items with `_id` are updated, items without are created, missing ones are deleted. A `status` change is added to the history. |
| PATCH | `/applications/:id/status` | `{ status, note?, changedAt? }`. Returns `{ application: { status, statusHistory }, changed }` |
| DELETE | `/applications/:id` | Also deletes its interviews and reminders. Resumes/emails are kept. |
| POST | `/applications/:id/duplicate` | Copy as a new `saved` application |
| POST | `/applications/:id/notes` | `{ message }`, adds a note to the activity timeline |
| GET | `/applications/tags` | Distinct tags |
| GET | `/applications/export/csv` | Same filters as the list, returns a CSV file |

Statuses: `saved, applied, assessment_pending, assessment_completed, interview_scheduled, interviewing, offer, accepted, rejected, on_hold, withdrawn`.

## Resumes & documents

| Method | Path | Notes |
|---|---|---|
| GET | `/resumes?kind=resume\|cover_letter\|other&archived=false\|true\|all` | Each item includes `usage { applications, interviews, offers }` |
| POST | `/resumes` | `multipart/form-data`: `file` (PDF/DOC/DOCX, ≤ 10 MB), `name`, `version`, `category`, `description`, `kind` |
| GET | `/resumes/:id` | `{ resume, applications[] }` (the applications that used it) |
| GET | `/resumes/:id/file[?download=1]` | Streams the file (inline, or as an attachment with `download=1`) |
| PUT | `/resumes/:id` | Metadata, `isArchived` |
| DELETE | `/resumes/:id` | If it's referenced by applications: **archived**, returns `{ archived: true, references }`. Otherwise it is deleted along with the file: `{ deleted: true }` |

## Email accounts

| Method | Path | Notes |
|---|---|---|
| GET | `/email-accounts?archived=false\|true\|all` | Includes `applicationCount` |
| POST | `/email-accounts` | `{ email, provider?, label?, notes?, isDefault? }`. Provider is guessed from the domain if omitted. 409 if it already exists. |
| PUT | `/email-accounts/:id` | Partial; `isDefault: true` moves the default; changing `email` updates the snapshots on linked applications |
| DELETE | `/email-accounts/:id` | Archived if referenced, otherwise deleted. If it was the default, a new default is picked. |

## Interviews

| Method | Path | Notes |
|---|---|---|
| GET | `/interviews?application=<id>&when=upcoming\|past&status=Scheduled,…` | Populated with `application { company.name, jobTitle, status }` |
| POST | `/interviews` | `{ application, roundName, type, date, time, … }`. Moves the application to `interview_scheduled` (or `assessment_pending` for an OA/assignment) if it was at an earlier stage. Returns `{ interview, applicationStatus }` |
| PUT | `/interviews/:id` | Partial |
| DELETE | `/interviews/:id` | |

Types: `Technical, HR, Managerial, Behavioral, Assignment, Online Assessment` · Statuses: `Scheduled, Completed, Rescheduled, Cancelled` · Results: `Pending, Passed, Failed, N/A`.

## Reminders

| Method | Path | Notes |
|---|---|---|
| GET | `/reminders?view=open\|overdue\|today\|upcoming\|week\|completed&type=…&application=<id>` | `{ items, counts: { overdue, today, upcoming } }` |
| POST | `/reminders` | `{ title, dueDate, type?, notes?, application? }` |
| PUT | `/reminders/:id` | Partial; `{ completed: true }` marks it complete |
| DELETE | `/reminders/:id` | |

Auto reminders (`origin: "auto"`) are created and updated from `nextFollowUpDate`, `deadline` (while the status is `saved`) and scheduled interviews.

## Analytics

All accept `from` / `to` (ISO dates), except `overview`.

| Path | Returns |
|---|---|
| `GET /analytics/overview` | `stats` (per-status counts), `funnel` (rates), `byStatus`, `byCompany`, `byJobType`, `bySource`, `activity` (12 weeks), `monthly` (6 months), `upcomingInterviews`, `recentApplications`, `reminders { overdue, upcoming }` |
| `GET /analytics/applications` | `totals { total, submitted, interviews, offers, rejections, interviewRate, offerRate, interviewToOfferRate, rejectionRate, avgDaysToInterview }`, `byStatus`, `byCompany`, `bySource`, `byJobType`, `byWorkMode`, `monthly`, `interviews { total, byType, outcomes }`, `funnel` |
| `GET /analytics/resumes` | `resumes[]` performance per resume version |
| `GET /analytics/sources` | `sources[]` and `emails[]` performance |
| `GET /analytics/report.pdf` | PDF report |

## Notifications

| Method | Path | Notes |
|---|---|---|
| POST | `/notifications/test` | Sends a test email (or logs it if SMTP isn't configured) |
| GET | `/cron/reminders` | Daily digest for all users, called by Vercel Cron. Requires `Authorization: Bearer <CRON_SECRET>`; otherwise 404. |

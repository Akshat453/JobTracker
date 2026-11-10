# Deploying Job Tracker

Two free services, one website address:

| Service | What it hosts |
|---|---|
| **MongoDB Atlas** (M0, free, 512 MB) | All data, including uploaded resumes |
| **Vercel** (Hobby, free) | The website *and* the API, on one domain (e.g. `https://jobtracker-you.vercel.app`) |

The API runs as a serverless function ([`api/index.js`](../api/index.js)). It never "sleeps" for long and has no monthly hour limit; after a quiet period the first click takes about 1–2 seconds. Everything is configured in [`vercel.json`](../vercel.json).

> **Never paste secrets into chat, issues, commits or screenshots.** The Atlas password, connection string, `JWT_SECRET`, `CRON_SECRET` and invite code belong only in Atlas and Vercel.

---

## 1. Create accounts
- **GitHub:** github.com
- **Vercel:** vercel.com. Choose **Continue with GitHub**.
- **MongoDB Atlas:** mongodb.com/cloud/atlas

## 2. Put the code on GitHub
1. On GitHub, click **+**, then **New repository**. Name it `jobtracker`, choose **Private**, and leave everything else unticked. Click **Create repository**.
2. In a terminal, in the `JobTracker` folder:
   ```bash
   git init
   git add .
   git status
   ```
   **Check the list.** It must not include `server/.env` or `client/.env`; only `.env.example` files are allowed. If a real `.env` appears, stop.
3. Commit and push:
   ```bash
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/jobtracker.git
   git push -u origin main
   ```
   If git asks who you are, run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`, then commit again.

## 3. Create the database (MongoDB Atlas)
1. **Cluster:** click **Create**, then **M0 Free**. Provider **AWS**, region **Singapore (ap-southeast-1)**. Click **Create Deployment**.
2. **Database user:** in the popup, set the username to `jobtracker-app`, click **Autogenerate Secure Password**, **copy the password** to your notes, then click **Create Database User**.
3. **Least privilege:** go to **Security → Database Access**, then **Edit** on `jobtracker-app`. Choose **Specific Privileges**, set `readWrite` on database `jobtracker`, and click **Update User**.
4. **Network access:** go to **Security → Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`), then **Confirm**. Vercel has no fixed IP addresses; the strong password and TLS still protect the database.
5. **Connection string:** go to **Database → Connect → Drivers** and copy the string. In your notes:
   - Replace `<db_password>` with the password.
   - Insert `jobtracker` right after `.mongodb.net/`:
   ```
   mongodb+srv://jobtracker-app:PASSWORD@cluster0.xxxxx.mongodb.net/jobtracker?retryWrites=true&w=majority&appName=Cluster0
   ```
   This is your **`MONGODB_URI`**.

Don't run `npm run seed` against Atlas. The demo account's password is public; the script refuses unless forced.

## 4. Create your secrets
Run this in a terminal **twice**. You get a different value each time; save both in your notes:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
- **First value:** your `JWT_SECRET`
- **Second value:** your `CRON_SECRET`

Also make up an **invite code** for your friends, e.g. `maple-orbit-tunnel-42`.

## 5. Deploy on Vercel
1. In Vercel, click **Add New… → Project**, then **Import** next to `jobtracker`.
2. **Leave Root Directory as `./`**, the repo root, not `client`. Framework Preset: **Other**. Leave the build settings alone; they come from `vercel.json`.
3. Open **Environment Variables** and add these four:

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | Your Atlas connection string |
   | `JWT_SECRET` | First generated value |
   | `CRON_SECRET` | Second generated value |
   | `REGISTRATION_CODE` | Your invite code |

4. Click **Deploy** and wait about 2 minutes.
5. After it finishes:
   - **Environment scope:** go to **Settings → Environment Variables** and make sure each variable is ticked for **Production** only. Preview deployments then can't touch your real database.
   - **Function region:** go to **Settings → Functions → Function Region** and check that it's **Singapore (sin1)**. `vercel.json` requests it; it must match your Atlas region for speed.

You don't need to set `CLIENT_URL` or `VITE_API_URL`. The site and API share one domain, and the API detects your production URL automatically.

## 6. Check it works
Open your site, for example `https://jobtracker-xxxx.vercel.app`, and check each of these:
- [ ] **API:** `/api/health` shows `{"ok":true}`.
- [ ] **Invite code:** sign-up with a wrong code is rejected; the right code creates the account.
- [ ] **Applications:** add one; it appears on the dashboard.
- [ ] **Resumes:** upload a resume PDF (under 4 MB) and preview it.
- [ ] **Refresh:** reloading on `/applications` doesn't show a 404.
- [ ] **Reminder job:** in Vercel, **Settings → Cron Jobs** lists `/api/cron/reminders`, running daily at 02:30 UTC (8:00 IST).

## 7. Share it
Send friends the link and the invite code privately.

---

## Good to know

**Updating:** every `git push` to `main` redeploys automatically.

**Free-tier limits that matter here**

| Limit | Value |
|---|---|
| Resume upload size | 4 MB (Vercel caps request bodies at 4.5 MB) |
| Reminder emails | Once a day. Each user's digest covers reminders due within their chosen lead time (default 24 h). |
| Atlas storage | 512 MB, enough for years for a few users |
| Atlas inactivity | Free clusters pause after 60 days with no connections. Any use of the app counts, and if it pauses, click **Resume** in Atlas. No data is lost. |
| Backups | Atlas M0 has none; see below |

**Changing a setting:** environment variable changes apply on the next deployment. Use **Deployments → ⋯ → Redeploy**.

**Email reminders (optional):** add these variables in Vercel, then redeploy:
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=<your gmail>`
- `SMTP_PASS=<Google app password>` (myaccount.google.com → Security → App passwords; needs 2-step verification)
- `MAIL_FROM=Job Tracker <your gmail>`

Each user then enables notifications in **Settings**.

**Backups:** take one now and then:
```bash
brew install mongodb-database-tools
mongodump --uri "<your MONGODB_URI>" --out ~/jobtracker-backups/$(date +%F)
# restore: mongorestore --uri "<MONGODB_URI>" ~/jobtracker-backups/<date>
```

**If a secret leaks**
- **Atlas password:** change it in Atlas (Database Access → Edit → Edit Password), update `MONGODB_URI` in Vercel, then redeploy.
- **`JWT_SECRET`:** set a new value and redeploy. Everyone is signed out; no data is lost.
- **Invite code:** change `REGISTRATION_CODE` and redeploy. Existing accounts keep working.

**Remove a user:** in Atlas **Collections**, delete their `users` document and their documents in:
- `applications`
- `interviews`
- `reminders`
- `resumes`
- `emailaccounts`
- `uploads.files` and `uploads.chunks` (matched by `metadata.user`)

## Troubleshooting

To see API errors, go to **Vercel → your project → Logs**.

| Symptom | Fix |
|---|---|
| Logs: **"Unsafe production configuration"** | It lists the missing or weak variable. Fix it in Settings → Environment Variables, then redeploy. |
| Logs or app: **"Database unavailable"** | Check `MONGODB_URI` (password, `/jobtracker` part) and Atlas Network Access `0.0.0.0/0`. Check that the cluster isn't paused. |
| 404 on refresh, or the API returns HTML | Root Directory must be `./` (repo root), so `vercel.json` is used. |
| "File is larger than 4 MB" | Compress the PDF (e.g. export again with "reduce file size"). |
| "Too many failed login attempts" | Wait 15 minutes. This is brute-force protection. |
| Preview deployment links show errors | Expected: secrets are only set for Production. |

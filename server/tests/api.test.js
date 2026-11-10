import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { MongoRateLimitStore } from '../src/utils/mongoRateLimitStore.js';

const app = createApp();
const api = () => request(app);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

let tokenA; let tokenB;
const authA = (r) => r.set('Authorization', `Bearer ${tokenA}`);
const authB = (r) => r.set('Authorization', `Bearer ${tokenB}`);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('auth', () => {
  test('registers, rejects duplicates and bad input', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Alice', email: 'Alice@Example.com', password: 'password123' });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'alice@example.com');
    assert.equal(res.body.user.password, undefined);
    tokenA = res.body.token;

    assert.equal((await api().post('/api/auth/register').send({ name: 'A', email: 'alice@example.com', password: 'password123' })).status, 400);
    assert.equal((await api().post('/api/auth/register').send({ name: 'Alice 2', email: 'alice@example.com', password: 'password123' })).status, 409);
    assert.equal((await api().post('/api/auth/register').send({ name: 'Bob', email: 'not-an-email', password: 'password123' })).status, 400);

    const b = await api().post('/api/auth/register').send({ name: 'Bob', email: 'bob@example.com', password: 'password123' });
    tokenB = b.body.token;
  });

  test('logs in and protects routes', async () => {
    assert.equal((await api().post('/api/auth/login').send({ email: 'alice@example.com', password: 'wrong' })).status, 401);
    const ok = await api().post('/api/auth/login').send({ email: 'alice@example.com', password: 'password123' });
    assert.equal(ok.status, 200);
    assert.equal((await api().get('/api/auth/me')).status, 401);
    assert.equal((await api().get('/api/auth/me').set('Authorization', 'Bearer garbage')).status, 401);
    const me = await authA(api().get('/api/auth/me'));
    assert.equal(me.body.user.name, 'Alice');
  });

  test('updates profile and preferences', async () => {
    const res = await authA(api().put('/api/auth/me')).send({ headline: 'SWE', skills: 'react, node', notificationPrefs: { emailEnabled: true } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user.skills, ['react', 'node']);
    assert.equal(res.body.user.notificationPrefs.emailEnabled, true);
    assert.equal(res.body.user.notificationPrefs.interviewReminders, true);
  });

  test('stores the notification time zone and rejects unknown ones', async () => {
    const ok = await authA(api().put('/api/auth/me')).send({ notificationPrefs: { timeZone: 'Asia/Kolkata' } });
    assert.equal(ok.body.user.notificationPrefs.timeZone, 'Asia/Kolkata');
    assert.equal(ok.body.user.notificationPrefs.emailEnabled, true); // other prefs untouched
    const bad = await authA(api().put('/api/auth/me')).send({ notificationPrefs: { timeZone: 'Mars/Olympus' } });
    assert.equal(bad.status, 400);
  });
});

let emailId; let resumeId; let appId; let resume2Id;

describe('email accounts', () => {
  test('signup creates a default account; can add more and switch default', async () => {
    let list = await authA(api().get('/api/email-accounts'));
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].isDefault, true);

    const res = await authA(api().post('/api/email-accounts')).send({ email: 'alice.jobs@gmail.com', label: 'Jobs', isDefault: true });
    assert.equal(res.status, 201);
    assert.equal(res.body.account.provider, 'Gmail');
    emailId = res.body.account._id;
    assert.equal((await authA(api().post('/api/email-accounts')).send({ email: 'alice.jobs@gmail.com' })).status, 409);

    list = await authA(api().get('/api/email-accounts'));
    assert.equal(list.body.items.filter((a) => a.isDefault).length, 1);
    assert.equal(list.body.items.find((a) => a.isDefault)._id, emailId);
  });
});

describe('resumes', () => {
  test('uploads PDF, rejects other types', async () => {
    const res = await authA(api().post('/api/resumes'))
      .field('name', 'SWE Resume').field('version', 'v2').field('category', 'Software Engineering')
      .attach('file', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    resumeId = res.body.resume._id;
    assert.equal(res.body.resume.file.storedName, undefined, 'stored file name must not leak');

    const bad = await authA(api().post('/api/resumes')).field('name', 'x')
      .attach('file', Buffer.from('hi'), { filename: 'evil.exe', contentType: 'application/octet-stream' });
    assert.equal(bad.status, 400);

    const r2 = await authA(api().post('/api/resumes')).field('name', 'Unused')
      .attach('file', PDF, { filename: 'unused.pdf', contentType: 'application/pdf' });
    resume2Id = r2.body.resume._id;
  });

  test('rejects files whose contents do not match their extension', async () => {
    const fake = await authA(api().post('/api/resumes')).field('name', 'Fake')
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'resume.pdf', contentType: 'application/pdf' });
    assert.equal(fake.status, 400);
    assert.match(fake.body.error.message, /not a valid PDF/);
    const fakeDocx = await authA(api().post('/api/resumes')).field('name', 'Fake')
      .attach('file', PDF, { filename: 'resume.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    assert.equal(fakeDocx.status, 400);
  });

  test('downloads own file; other users cannot', async () => {
    const res = await authA(api().get(`/api/resumes/${resumeId}/file?download=1`)).buffer(true)
      .parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    assert.equal(res.status, 200);
    assert.ok(res.body.equals(PDF), 'file round-trips byte for byte');
    assert.match(res.headers['content-disposition'], /attachment/);
    assert.equal((await authB(api().get(`/api/resumes/${resumeId}/file`))).status, 404);
  });
});

describe('applications', () => {
  test('creates a full application with interviews and auto reminders', async () => {
    const follow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const res = await authA(api().post('/api/applications')).send({
      company: { name: 'Acme Corp', website: 'acme.com', location: 'Bengaluru' },
      jobTitle: 'Software Engineer',
      jobPostingUrl: 'https://acme.com/jobs/1',
      employmentType: 'Full-time', workMode: 'Hybrid',
      salary: { min: 1200000, max: 1800000, currency: 'INR' },
      status: 'applied', source: 'LinkedIn', priority: 'High',
      nextFollowUpDate: follow,
      emailUsed: { account: emailId, confirmationReceived: true, subject: 'Thanks for applying' },
      resume: resumeId,
      recruiter: { name: 'Rita', email: 'rita@acme.com' },
      referral: { received: true, name: 'Sam' },
      skillsRequired: ['react', 'node'], tags: ['Dream'],
      interviews: [{ roundName: 'Round 1', type: 'Technical', date: follow, time: '10:30', meetingLink: 'meet.google.com/abc-def' }],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const a = res.body.application;
    appId = a._id;
    assert.equal(a.company.website, 'https://acme.com/');
    assert.equal(a.emailUsed.address, 'alice.jobs@gmail.com');
    assert.equal(a.resume._id, resumeId);
    assert.equal(a.resumeSnapshot.version, 'v2');
    assert.equal(a.interviews.length, 1);
    assert.equal(a.statusHistory.length, 1);
    assert.deepEqual(a.tags, ['dream']);
    assert.deepEqual(a.reminders.map((r) => r.type).sort(), ['follow_up', 'interview']);
  });

  test('validates input: missing fields, bad URL, bad refs, bad salary', async () => {
    assert.equal((await authA(api().post('/api/applications')).send({ jobTitle: 'x' })).status, 400);
    const badUrl = await authA(api().post('/api/applications')).send({ company: { name: 'X' }, jobTitle: 'Y', jobPostingUrl: 'not a url' });
    assert.equal(badUrl.status, 400);
    assert.match(badUrl.body.error.message, /URL/);
    const badSalary = await authA(api().post('/api/applications')).send({ company: { name: 'X' }, jobTitle: 'Y', salary: { min: 10, max: 5 } });
    assert.equal(badSalary.status, 400);
    // Bob cannot attach Alice's resume
    const foreign = await authB(api().post('/api/applications')).send({ company: { name: 'X' }, jobTitle: 'Y', resume: resumeId });
    assert.equal(foreign.status, 400);
  });

  test('detects duplicates unless forced', async () => {
    const body = { company: { name: 'acme corp' }, jobTitle: 'software engineer' };
    const dup = await authA(api().post('/api/applications')).send(body);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.details.duplicateId, appId);
    const forced = await authA(api().post('/api/applications?force=true')).send(body);
    assert.equal(forced.status, 201);
    await authA(api().delete(`/api/applications/${forced.body.application._id}`));
  });

  test('status change records history and timeline', async () => {
    const res = await authA(api().patch(`/api/applications/${appId}/status`)).send({ status: 'interviewing', note: 'Round 1 done' });
    assert.equal(res.status, 200);
    assert.equal(res.body.application.status, 'interviewing');
    assert.equal(res.body.application.statusHistory.length, 2);
    assert.equal(res.body.application.statusHistory[1].from, 'applied');
    assert.equal((await authA(api().patch(`/api/applications/${appId}/status`)).send({ status: 'nope' })).status, 400);
    const detail = await authA(api().get(`/api/applications/${appId}`));
    assert.ok(detail.body.application.activity.some((x) => x.type === 'status_changed'));
  });

  test('updates fields and syncs interview rounds', async () => {
    const detail = await authA(api().get(`/api/applications/${appId}`));
    const iv = detail.body.application.interviews[0];
    const res = await authA(api().put(`/api/applications/${appId}`)).send({
      company: { location: 'Remote' },
      notes: 'Updated notes',
      interviews: [
        { _id: iv._id, roundName: 'Round 1', status: 'Completed', result: 'Passed', feedback: 'Good' },
        { roundName: 'HR', type: 'HR' },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const a = res.body.application;
    assert.equal(a.company.name, 'Acme Corp', 'partial nested update keeps other fields');
    assert.equal(a.company.location, 'Remote');
    assert.equal(a.interviews.length, 2);
    assert.equal(a.interviews.find((x) => x._id === iv._id).result, 'Passed');
    // completed interview -> its auto reminder removed
    assert.ok(!a.reminders.some((r) => r.type === 'interview'));
  });

  test('list supports search + filters + sort + pagination together', async () => {
    await authA(api().post('/api/applications')).send({ company: { name: 'Globex' }, jobTitle: 'Data Analyst', source: 'Indeed', employmentType: 'Internship', priority: 'Low', status: 'rejected' });
    await authA(api().post('/api/applications')).send({ company: { name: 'Initech' }, jobTitle: 'Backend Engineer', source: 'LinkedIn', priority: 'High', status: 'saved' });

    let res = await authA(api().get('/api/applications?search=engineer&source=LinkedIn&sort=priority'));
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 2);
    res = await authA(api().get(`/api/applications?emailAccount=${emailId}`));
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items[0].emailUsed.accountInfo.email, 'alice.jobs@gmail.com');
    res = await authA(api().get(`/api/applications?resume=${resumeId}&status=interviewing`));
    assert.equal(res.body.total, 1);
    res = await authA(api().get('/api/applications?limit=1&page=2&sort=oldest'));
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.totalPages, 3);
    res = await authA(api().get('/api/applications?employmentType=Internship'));
    assert.equal(res.body.items[0].company.name, 'Globex');
    res = await authA(api().get('/api/applications?sort=followup'));
    assert.equal(res.body.items[0].company.name, 'Acme Corp');
  });

  test('users are isolated', async () => {
    assert.equal((await authB(api().get(`/api/applications/${appId}`))).status, 404);
    assert.equal((await authB(api().put(`/api/applications/${appId}`)).send({ notes: 'hack' })).status, 404);
    assert.equal((await authB(api().delete(`/api/applications/${appId}`))).status, 404);
    assert.equal((await authB(api().get('/api/applications'))).body.total, 0);
    assert.equal((await authB(api().get('/api/applications/not-an-id'))).status, 400);
  });

  test('duplicates and exports CSV', async () => {
    const dup = await authA(api().post(`/api/applications/${appId}/duplicate`));
    assert.equal(dup.status, 201);
    assert.equal(dup.body.application.status, 'saved');
    const csv = await authA(api().get('/api/applications/export/csv'));
    assert.equal(csv.status, 200);
    assert.match(csv.text, /Acme Corp/);
    assert.equal(csv.text.trim().split('\r\n').length, 5);
    await authA(api().delete(`/api/applications/${dup.body.application._id}`));
  });
});

describe('interviews & reminders', () => {
  test('standalone interview auto-advances status', async () => {
    const list = await authA(api().get('/api/applications?search=Initech'));
    const id = list.body.items[0]._id;
    const res = await authA(api().post('/api/interviews')).send({ application: id, roundName: 'Phone screen', type: 'HR', date: '2099-01-01', time: '09:00' });
    assert.equal(res.status, 201);
    assert.equal(res.body.applicationStatus, 'interview_scheduled');
    const upd = await authA(api().put(`/api/interviews/${res.body.interview._id}`)).send({ status: 'Cancelled' });
    assert.equal(upd.status, 200);
    assert.equal((await authB(api().delete(`/api/interviews/${res.body.interview._id}`))).status, 404);
    const upcoming = await authA(api().get('/api/interviews?when=upcoming'));
    assert.ok(upcoming.body.items.length >= 1);
  });

  test('manual reminders: create, complete, overdue view', async () => {
    const r = await authA(api().post('/api/reminders')).send({ title: 'Email recruiter', dueDate: '2020-01-01', application: appId });
    assert.equal(r.status, 201);
    let list = await authA(api().get('/api/reminders?view=overdue'));
    assert.ok(list.body.items.some((x) => x._id === r.body.reminder._id));
    assert.ok(list.body.counts.overdue >= 1);
    const done = await authA(api().put(`/api/reminders/${r.body.reminder._id}`)).send({ completed: true });
    assert.equal(done.body.reminder.completed, true);
    list = await authA(api().get('/api/reminders?view=completed'));
    assert.equal(list.body.items.length, 1);
    assert.equal((await authA(api().post('/api/reminders')).send({ title: 'x' })).status, 400);
  });

  test('notifier sends digest once', async () => {
    await authA(api().post('/api/reminders')).send({ title: 'Prep call', dueDate: new Date(Date.now() + 3600e3).toISOString(), application: appId });
    const run1 = await authA(api().post('/api/notifications/run'));
    assert.equal(run1.body.digestsSent, 1);
    const run2 = await authA(api().post('/api/notifications/run'));
    assert.equal(run2.body.digestsSent, 0);
  });
});

describe('analytics', () => {
  test('overview reflects real records', async () => {
    const res = await authA(api().get('/api/analytics/overview'));
    assert.equal(res.status, 200);
    assert.equal(res.body.stats.total, 3);
    assert.equal(res.body.stats.rejected, 1);
    assert.equal(res.body.stats.interviewing, 1);
    assert.equal(res.body.stats.interviewScheduled, 1);
    assert.equal(res.body.funnel.interviews, 2);
    assert.ok(res.body.activity.length === 12);
  });

  test('resume, source and range analytics', async () => {
    const r = await authA(api().get('/api/analytics/resumes'));
    const row = r.body.resumes.find((x) => x._id === resumeId);
    assert.equal(row.applications, 1);
    assert.equal(row.interviews, 1);
    const s = await authA(api().get('/api/analytics/sources'));
    assert.equal(s.body.sources.find((x) => x.name === 'LinkedIn').applications, 2);
    assert.equal(s.body.emails.find((x) => x._id === emailId).applications, 1);
    const empty = await authA(api().get('/api/analytics/applications?from=2000-01-01&to=2000-12-31'));
    assert.equal(empty.body.totals.total, 0);
    assert.equal((await authA(api().get('/api/analytics/applications?from=2020-02-01&to=2020-01-01'))).status, 400);
    const pdf = await authA(api().get('/api/analytics/report.pdf')).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  });
});

describe('safe deletion', () => {
  test('referenced resume/email are archived, unreferenced deleted', async () => {
    const r1 = await authA(api().delete(`/api/resumes/${resumeId}`));
    assert.equal(r1.body.archived, true);
    const detail = await authA(api().get(`/api/applications/${appId}`));
    assert.equal(detail.body.application.resume._id, resumeId, 'application keeps its resume');
    const files = () => mongoose.connection.db.collection('uploads.files').countDocuments();
    const before = await files();
    const r2 = await authA(api().delete(`/api/resumes/${resume2Id}`));
    assert.equal(r2.body.deleted, true);
    assert.equal(await files(), before - 1, 'stored file is removed too');
    const e = await authA(api().delete(`/api/email-accounts/${emailId}`));
    assert.equal(e.body.archived, true);
    const accts = await authA(api().get('/api/email-accounts'));
    assert.equal(accts.body.items.filter((a) => a.isDefault).length, 1, 'a new default is chosen');
  });

  test('deleting an application cascades', async () => {
    const res = await authA(api().delete(`/api/applications/${appId}`));
    assert.equal(res.status, 200);
    const ivs = await authA(api().get(`/api/interviews?application=${appId}`));
    assert.equal(ivs.body.items.length, 0);
    const rem = await authA(api().get(`/api/reminders?application=${appId}`));
    assert.equal(rem.body.items.length, 0);
  });
});

describe('security', () => {
  test('invite code is enforced when configured', async () => {
    const saved = env.registrationCode;
    env.registrationCode = 'let-me-in';
    try {
      assert.equal((await api().get('/api/auth/config')).body.inviteRequired, true);
      const body = { name: 'Carol', email: 'carol@example.com', password: 'password123' };
      assert.equal((await api().post('/api/auth/register').send(body)).status, 403);
      assert.equal((await api().post('/api/auth/register').send({ ...body, inviteCode: 'wrong' })).status, 403);
      assert.equal((await api().post('/api/auth/register').send({ ...body, inviteCode: 'let-me-in' })).status, 201);
    } finally {
      env.registrationCode = saved;
    }
    assert.equal((await api().get('/api/auth/config')).body.inviteRequired, false);
  });

  test('changing the password signs out older sessions', async () => {
    const reg = await api().post('/api/auth/register').send({ name: 'Dave', email: 'dave@example.com', password: 'password123' });
    const old = reg.body.token;
    await new Promise((r) => setTimeout(r, 1100)); // JWT iat has 1-second resolution
    const res = await api().put('/api/auth/password').set('Authorization', `Bearer ${old}`)
      .send({ currentPassword: 'password123', newPassword: 'new-password-456' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal((await api().get('/api/auth/me').set('Authorization', `Bearer ${old}`)).status, 401);
    assert.equal((await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`)).status, 200);
    assert.equal((await api().post('/api/auth/login').send({ email: 'dave@example.com', password: 'new-password-456' })).status, 200);
  });

  test('query-string operators cannot reach MongoDB', async () => {
    const all = await authA(api().get('/api/resumes?archived=all'));
    const injected = await authA(api().get('/api/resumes?archived=all&kind[$ne]=nothing'));
    assert.equal(injected.status, 200);
    assert.equal(injected.body.items.length, all.body.items.length, 'bracket keys are ignored, not parsed as operators');
    assert.equal((await authA(api().get('/api/applications?status=applied&status=offer'))).status, 400);
  });

  test('tampered or foreign tokens are rejected', async () => {
    const [h, p] = tokenA.split('.');
    assert.equal((await api().get('/api/auth/me').set('Authorization', `Bearer ${h}.${p}.invalidsig`)).status, 401);
    assert.equal((await api().get('/api/applications')).status, 401);
  });
});

describe('serverless support', () => {
  test('MongoDB rate-limit store counts, expires and resets', async () => {
    const store = new MongoRateLimitStore({ prefix: 'test' });
    store.init({ windowMs: 300 });
    assert.equal((await store.increment('1.2.3.4')).totalHits, 1);
    assert.equal((await store.increment('1.2.3.4')).totalHits, 2);
    assert.equal((await store.increment('5.6.7.8')).totalHits, 1, 'keys are independent');
    await store.decrement('1.2.3.4');
    assert.equal((await store.increment('1.2.3.4')).totalHits, 2);
    await new Promise((r) => setTimeout(r, 350));
    assert.equal((await store.increment('1.2.3.4')).totalHits, 1, 'window resets after expiry');
    await store.resetKey('1.2.3.4');
    assert.equal((await store.increment('1.2.3.4')).totalHits, 1);
  });

  test('cron job requires the secret and is hidden without one', async () => {
    const saved = env.cronSecret;
    try {
      env.cronSecret = '';
      assert.equal((await api().get('/api/cron/reminders')).status, 404);
      env.cronSecret = 'cron-secret-value';
      assert.equal((await api().get('/api/cron/reminders')).status, 404);
      assert.equal((await api().get('/api/cron/reminders').set('Authorization', 'Bearer wrong')).status, 404);
      assert.equal((await api().get('/api/cron/reminders').set('Authorization', `Bearer ${tokenA}`)).status, 404, 'a user token is not the cron secret');
      const ok = await api().get('/api/cron/reminders').set('Authorization', 'Bearer cron-secret-value');
      assert.equal(ok.status, 200);
      assert.equal(typeof ok.body.digestsSent, 'number');
    } finally {
      env.cronSecret = saved;
    }
  });

  test('config reports upload limit; API responses are not cacheable', async () => {
    const res = await api().get('/api/auth/config');
    assert.equal(res.body.maxUploadMb, env.maxUploadMb);
    assert.equal(res.headers['cache-control'], 'no-store');
  });
});

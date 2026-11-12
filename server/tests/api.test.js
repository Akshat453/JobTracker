import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { MongoRateLimitStore } from '../src/utils/mongoRateLimitStore.js';
import { maybeRunReminderNotifications, runReminderNotifications } from '../src/services/notifier.js';
import { senderHeaders } from '../src/services/mailer.js';
import { dayKeyFn, safeTimeZone, weeklyActivity } from '../src/services/analyticsService.js';
import { SharedJob as SharedJobModel, migrateShareRetention } from '../src/models/SharedJob.js';
import { companyKey, jobKeys, postingKey, sameJob, titleKey } from '../src/utils/jobMatch.js';

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

describe('resume versions and editable sources', () => {
  const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('word/document.xml')]);
  const TEX = Buffer.from('\\documentclass{article}\n\\begin{document}Résumé\\end{document}\n');
  const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const binary = (r) => r.buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
  let v1; let v2;

  test('uploads a PDF with its Word source; the stored name never leaks', async () => {
    const res = await authA(api().post('/api/resumes')).field('name', 'Versioned CV').field('description', 'First draft')
      .attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' })
      .attach('source', DOCX, { filename: 'cv.docx', contentType: DOCX_TYPE });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    v1 = res.body.resume;
    assert.equal(v1.versionNumber, 1);
    assert.equal(v1.family, v1._id);
    assert.equal(v1.source.file.originalName, 'cv.docx');
    assert.equal(v1.source.file.storedName, undefined);
    const dl = await binary(authA(api().get(`/api/resumes/${v1._id}/source`)));
    assert.equal(dl.status, 200);
    assert.ok(dl.body.equals(DOCX));
    assert.match(dl.headers['content-disposition'], /^attachment/);
    assert.equal((await authB(api().get(`/api/resumes/${v1._id}/source`))).status, 404);
  });

  test('new versions are numbered, inherit name/category, and keep their own notes and source', async () => {
    const res = await authA(api().post(`/api/resumes/${v1._id}/versions`))
      .field('description', 'Added Razorpay internship').field('sourceUrl', 'www.overleaf.com/project/abc123')
      .attach('file', PDF, { filename: 'cv-v2.pdf', contentType: 'application/pdf' })
      .attach('source', TEX, { filename: 'cv.tex', contentType: 'application/octet-stream' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    v2 = res.body.resume;
    assert.equal(v2.versionNumber, 2);
    assert.equal(v2.version, 'v2');
    assert.equal(v2.name, 'Versioned CV');
    assert.equal(v2.family, v1._id);
    assert.equal(v2.source.url, 'https://www.overleaf.com/project/abc123');
    assert.equal(v2.source.file.mimeType, 'application/x-tex');

    // Asking from any version gives the whole history, newest first.
    const detail = await authA(api().get(`/api/resumes/${v1._id}`));
    assert.deepEqual(detail.body.versions.map((v) => [v.versionNumber, v.description]), [[2, 'Added Razorpay internship'], [1, 'First draft']]);
    assert.equal((await authA(api().get(`/api/resumes/${v2._id}`))).body.versions.length, 2);
    // Version 3 from version 1 still continues the numbering.
    const v3 = await authA(api().post(`/api/resumes/${v1._id}/versions`)).attach('file', PDF, { filename: 'cv3.pdf', contentType: 'application/pdf' });
    assert.equal(v3.body.resume.versionNumber, 3);
    // Other users can't add versions to it.
    const other = await authB(api().post(`/api/resumes/${v1._id}/versions`)).attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
    assert.equal(other.status, 404);
  });

  test('a version can be renamed; renaming the resume renames every version', async () => {
    const renamed = await authA(api().put(`/api/resumes/${v1._id}`)).send({ version: 'v1-college', description: 'Original' });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.resume.version, 'v1-college');
    const noted = await authA(api().put(`/api/resumes/${v1._id}`)).send({ summary: 'Backend · Java/Spring · college projects' });
    assert.equal(noted.body.resume.summary, 'Backend · Java/Spring · college projects');
    assert.equal(noted.body.resume.version, 'v1-college', 'other fields untouched');
    assert.equal((await authA(api().put(`/api/resumes/${v1._id}`)).send({ summary: 'x'.repeat(141) })).status, 400);
    const v4 = await authA(api().post(`/api/resumes/${v1._id}/versions`)).field('summary', 'Frontend · React')
      .attach('file', PDF, { filename: 'cv4.pdf', contentType: 'application/pdf' });
    assert.equal(v4.body.resume.summary, 'Frontend · React');
    await authA(api().delete(`/api/resumes/${v4.body.resume._id}`));
    await authA(api().put(`/api/resumes/${v2._id}`)).send({ name: 'Main CV' });
    const versions = (await authA(api().get(`/api/resumes/${v1._id}`))).body.versions;
    assert.deepEqual(versions.map((v) => v.name), ['Main CV', 'Main CV', 'Main CV']);
    assert.deepEqual(versions.map((v) => v.version), ['v3', 'v2', 'v1-college'], 'version names stay per version');
    // Other users' resumes are untouched by a rename.
    assert.equal((await authB(api().put(`/api/resumes/${v1._id}`)).send({ name: 'x' })).status, 404);
  });

  test('editable source can be attached, replaced and removed; bad files and links are rejected', async () => {
    const link = await authA(api().put(`/api/resumes/${v1._id}/source`)).field('sourceUrl', 'https://docs.google.com/document/d/xyz');
    assert.equal(link.status, 200);
    assert.equal(link.body.resume.source.url, 'https://docs.google.com/document/d/xyz');
    assert.equal(link.body.resume.source.file.originalName, 'cv.docx', 'adding a link keeps the file');

    const replaced = await authA(api().put(`/api/resumes/${v1._id}/source`)).attach('source', TEX, { filename: 'new.tex', contentType: 'text/x-tex' });
    assert.equal(replaced.body.resume.source.file.originalName, 'new.tex');
    const files = mongoose.connection.db.collection('uploads.files');
    assert.equal(await files.countDocuments({ filename: 'cv.docx' }), 0, 'replaced source file is deleted');

    const badLink = await authA(api().put(`/api/resumes/${v1._id}/source`)).field('sourceUrl', 'javascript:alert(1)');
    assert.equal(badLink.status, 400);
    const fakeTex = await authA(api().put(`/api/resumes/${v1._id}/source`)).attach('source', Buffer.from([0x4d, 0x5a, 0x00, 0x01]), { filename: 'cv.tex', contentType: 'text/plain' });
    assert.equal(fakeTex.status, 400);
    const exe = await authA(api().put(`/api/resumes/${v1._id}/source`)).attach('source', DOCX, { filename: 'cv.exe', contentType: 'application/octet-stream' });
    assert.equal(exe.status, 400);
    const pdfAsSource = await authA(api().put(`/api/resumes/${v1._id}/source`)).attach('source', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
    assert.equal(pdfAsSource.status, 400);
    assert.equal((await authB(api().put(`/api/resumes/${v1._id}/source`)).field('sourceUrl', 'https://x.com/a')).status, 404);

    const removed = await authA(api().delete(`/api/resumes/${v1._id}/source`));
    assert.equal(removed.body.resume.source, undefined);
    assert.equal(await files.countDocuments({ filename: 'new.tex' }), 0, 'removed source file is deleted');
    assert.equal((await authA(api().get(`/api/resumes/${v1._id}/source`))).status, 404);
  });

  test('deleting an unused version deletes its source file too', async () => {
    const files = mongoose.connection.db.collection('uploads.files');
    assert.equal(await files.countDocuments({ filename: 'cv.tex' }), 1);
    assert.equal((await authA(api().delete(`/api/resumes/${v2._id}`))).body.deleted, true);
    assert.equal(await files.countDocuments({ filename: 'cv.tex' }), 0);
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

  test('notifier emails each reminder once, when it enters the lead time', async () => {
    const me = (await authA(api().get('/api/auth/me'))).body.user;
    const run = (now) => runReminderNotifications(now, { userId: me._id });
    await authA(api().put('/api/auth/me')).send({ notificationPrefs: { emailEnabled: true, leadTimeHours: 2 } });
    // Clear earlier test reminders so only this test's ones count.
    await mongoose.connection.db.collection('reminders').updateMany({}, { $set: { emailedAt: new Date() } });

    const t0 = Date.now();
    await authA(api().post('/api/reminders')).send({ title: 'Prep call', dueDate: new Date(t0 + 3 * 3600e3).toISOString(), application: appId });
    assert.equal(await run(new Date(t0)), 0); // due in 3 h, lead time 2 h: not yet
    assert.equal(await run(new Date(t0 + 1.5 * 3600e3)), 1); // now due in 1.5 h: emailed
    assert.equal(await run(new Date(t0 + 1.6 * 3600e3)), 0); // never twice
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

  test('calendar days follow the user time zone; picked dates stay on their day', () => {
    const ist = dayKeyFn('Asia/Kolkata');
    assert.equal(ist('2026-11-07T20:00:00Z'), '2026-11-08', '1:30 am IST on Sunday is Sunday, not Saturday');
    assert.equal(ist('2026-11-07T00:00:00Z'), '2026-11-07', 'a date picked in a date field keeps its day');
    assert.equal(dayKeyFn('America/New_York')('2026-11-08T03:00:00Z'), '2026-11-07');
    assert.equal(safeTimeZone('Not/AZone'), null);
    assert.equal(safeTimeZone('Asia/Kolkata'), 'Asia/Kolkata');
  });

  test('weekly buckets run Sunday to Saturday and count only sent applications', () => {
    const app = (day, submitted = true) => ({ _day: day, _submitted: submitted });
    const weeks = weeklyActivity([app('2026-11-08'), app('2026-11-14'), app('2026-11-07'), app('2026-11-10', false), app('2026-08-01')], 12, '2026-11-11');
    assert.equal(weeks.length, 12);
    assert.equal(weeks.at(-1).start, '2026-11-08');
    assert.equal(weeks.at(-1).name, 'Nov 8');
    assert.match(weeks.at(-1).range, /Nov 8 – Nov 14 \(this week\)/);
    assert.equal(weeks.at(-1).applications, 2, 'Sun 8 and Sat 14; the saved job on the 10th is not counted');
    assert.equal(weeks.at(-2).applications, 1, 'Sat 7 is the previous week');
    assert.equal(weeks[0].start, '2026-08-23');
    assert.equal(weeks.reduce((n, w) => n + w.applications, 0), 3, 'older than 12 weeks is left out');
  });

  test('saved jobs are not "sent"; a job applied to later counts from when it was applied', async () => {
    const reg = await api().post('/api/auth/register').send({ name: 'Ana Lytics', email: 'ana@example.com', password: 'password123' });
    const auth = (r) => r.set('Authorization', `Bearer ${reg.body.token}`);
    const today = new Date().toISOString().slice(0, 10);
    const create = (body) => auth(api().post('/api/applications')).send({ company: { name: `Co ${Math.random()}` }, jobTitle: 'Engineer', ...body });
    await create({ status: 'applied', applicationDate: today });
    await create({ status: 'saved', applicationDate: today });
    await create({ status: 'saved', applicationDate: today });
    // Saved long ago, applied today: counts today, not on the day it was saved.
    const old = (await create({ status: 'saved', applicationDate: '2024-01-15' })).body.application;
    await auth(api().put(`/api/applications/${old._id}`)).send({ status: 'applied' });

    const ov = (await auth(api().get('/api/analytics/overview?tz=Asia/Kolkata'))).body;
    assert.equal(ov.stats.total, 4);
    assert.equal(ov.stats.saved, 2);
    const sentThisWeek = ov.activity.at(-1).applications;
    assert.ok(sentThisWeek === 2 || (new Date().getUTCDay() === 0 && sentThisWeek >= 1), `2 sent this week, got ${sentThisWeek}`);
    assert.equal(ov.activity.reduce((n, w) => n + w.applications, 0), 2, 'saved jobs are not counted');
    assert.equal(ov.monthly.at(-1).applications, 2);
    assert.equal(ov.stats.thisMonth, 2);
    // A bad tz is ignored rather than breaking the page.
    assert.equal((await auth(api().get('/api/analytics/overview?tz=%3Cscript%3E'))).status, 200);

    // Performance tables count sent applications, matching their rates.
    const src = (await auth(api().get('/api/analytics/sources'))).body.sources;
    assert.equal(src[0].applications, 2);
    assert.equal(src[0].tracked, 4);
  });

  test('a date range also limits the interview charts', async () => {
    const all = (await authA(api().get('/api/analytics/applications'))).body;
    assert.ok(all.interviews.total > 0);
    const none = (await authA(api().get('/api/analytics/applications?from=2000-01-01&to=2000-12-31'))).body;
    assert.equal(none.interviews.total, 0);
    assert.equal(none.interviews.byType.length, 0);
  });
});

describe('sharing jobs', () => {
  let link; let token; let ownApp;
  test('owner creates a link that carries only four fields', async () => {
    ownApp = (await authA(api().post('/api/applications')).send({
      company: { name: 'Sharely', website: 'sharely.io', location: 'Pune' },
      jobTitle: 'Backend Engineer', jobPostingUrl: 'https://sharely.io/jobs/1', status: 'interviewing',
      notes: 'secret notes', salary: { min: 100 },
    })).body.application;
    const res = await authA(api().post(`/api/applications/${ownApp._id}/share`));
    assert.equal(res.status, 201);
    link = res.body.url;
    token = link.split('/share/')[1];
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    // The token itself is never stored, only its hash.
    assert.equal(await mongoose.connection.db.collection('sharedjobs').countDocuments({ tokenHash: token }), 0);

    const view = await authB(api().get(`/api/shares/${token}`));
    assert.equal(view.status, 200);
    assert.deepEqual(Object.keys(view.body.job).sort(), ['companyName', 'companyWebsite', 'jobPostingUrl', 'jobTitle']);
    assert.equal(view.body.job.jobTitle, 'Backend Engineer');
    assert.equal(view.body.isOwner, false);
    assert.equal(view.body.response, null);
    assert.ok(!JSON.stringify(view.body).includes('secret notes'));
    assert.ok(!JSON.stringify(view.body).includes('interviewing'));
  });

  test('only the owner can share an application; links need sign-in', async () => {
    assert.equal((await authB(api().post(`/api/applications/${ownApp._id}/share`))).status, 404);
    assert.equal((await api().get(`/api/shares/${token}`)).status, 401);
    assert.equal((await authB(api().get('/api/shares/not-a-token'))).status, 404);
    assert.equal((await authB(api().get(`/api/shares/${'A'.repeat(43)}`))).status, 404);
  });

  test('recipient adds it as Saved, only once', async () => {
    const add = await authB(api().post(`/api/shares/${token}/accept`));
    assert.equal(add.status, 201);
    const created = (await authB(api().get(`/api/applications/${add.body.application._id}`))).body.application;
    assert.equal(created.status, 'saved');
    assert.equal(created.company.name, 'Sharely');
    assert.equal(created.company.website, ownApp.company.website);
    assert.equal(created.jobPostingUrl, 'https://sharely.io/jobs/1');
    assert.equal(created.company.location, undefined);
    assert.equal(created.salary?.min, undefined);

    const again = await authB(api().post(`/api/shares/${token}/accept`));
    assert.equal(again.body.alreadyAdded, true);
    const view = await authB(api().get(`/api/shares/${token}`));
    assert.equal(view.body.response.action, 'added');
  });

  test('owner cannot accept their own link; decline is recorded; expired links stop working', async () => {
    assert.equal((await authA(api().post(`/api/shares/${token}/accept`))).status, 400);
    assert.equal((await authA(api().get(`/api/shares/${token}`))).body.isOwner, true);

    const link2 = (await authA(api().post(`/api/applications/${ownApp._id}/share`))).body.url.split('/share/')[1];
    assert.equal((await authB(api().post(`/api/shares/${link2}/decline`))).status, 200);
    assert.equal((await authB(api().get(`/api/shares/${link2}`))).body.response.action, 'declined');
    // B already tracks this job (from the first link), so accepting reports the duplicate.
    const dup = await authB(api().post(`/api/shares/${link2}/accept`));
    assert.equal(dup.status, 409);

    await mongoose.connection.db.collection('sharedjobs').updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await authB(api().get(`/api/shares/${token}`))).status, 404);
  });
});

describe('same-job detection', () => {
  const same = (a, b) => sameJob(jobKeys(a), jobKeys(b));
  const job = (name, title, url, jobId) => ({ company: { name }, jobTitle: title, jobPostingUrl: url, jobId });

  test('posting links are cleaned up before comparing', () => {
    const k = postingKey('https://www.acme.com/careers/jobs/42/');
    assert.equal(postingKey('http://acme.com/careers/jobs/42'), k);
    assert.equal(postingKey('https://acme.com/careers/jobs/42?utm_source=x&ref=feed&gh_src=abc#apply'), k);
    assert.notEqual(postingKey('https://acme.com/careers/jobs/43'), k);
    // Parameters that identify the job are kept, in any order.
    assert.equal(postingKey('https://boards.greenhouse.io/acme?gh_jid=7&x=1'), postingKey('https://boards.greenhouse.io/acme?x=1&gh_jid=7&utm_medium=s'));
    assert.notEqual(postingKey('https://boards.greenhouse.io/acme?gh_jid=7'), postingKey('https://boards.greenhouse.io/acme?gh_jid=8'));
    // LinkedIn's different URL shapes for one job.
    assert.equal(postingKey('https://www.linkedin.com/jobs/view/3901234567/?trk=abc'), 'linkedin:3901234567');
    assert.equal(postingKey('https://in.linkedin.com/jobs/view/sde-1-at-zomato-3901234567'), 'linkedin:3901234567');
    assert.equal(postingKey('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=3901234567'), 'linkedin:3901234567');
    for (const bad of [null, '', 'not a url', 'javascript:alert(1)', 'ftp://acme.com/x']) assert.equal(postingKey(bad), null);
  });

  test('titles and company names ignore case, spacing, punctuation and legal suffixes', () => {
    assert.equal(titleKey('SDE-1'), titleKey('sde 1'));
    assert.equal(titleKey('SDE 1'), titleKey('SDE1'));
    assert.notEqual(titleKey('SDE 1'), titleKey('SDE 2'));
    assert.equal(companyKey('Zomato Pvt. Ltd.'), companyKey('zomato'));
    assert.equal(companyKey('Procter & Gamble'), companyKey('Procter and Gamble'));
    assert.equal(companyKey('Co'), 'co');
  });

  test('rules apply in order: link, then job ID, then company + title', () => {
    // 1. Same link wins over different wording.
    assert.ok(same(job('Zomato', 'SDE 1', 'https://zomato.com/jobs/1'), job('Zomato Ltd', 'Software Engineer I', 'https://www.zomato.com/jobs/1?utm_source=li')));
    // 3. Different links are different jobs, even with the same title (Bangalore vs Pune).
    assert.ok(!same(job('Acme', 'Backend Engineer', 'https://acme.com/jobs/blr'), job('Acme', 'Backend Engineer', 'https://acme.com/jobs/pune')));
    // Job IDs decide when links can't.
    assert.ok(!same(job('Acme', 'Backend Engineer', null, 'BLR-1'), job('Acme', 'Backend Engineer', null, 'PUN-2')));
    assert.ok(same(job('Acme', 'Backend Engineer', null, 'blr-1'), job('acme', 'Backend Eng', null, 'BLR-1')));
    // 2. Otherwise company + title, normalised; a link on only one side doesn't block a match.
    assert.ok(same(job('Zomato', 'SDE-1'), job('zomato pvt ltd', 'sde 1', 'https://zomato.com/jobs/1')));
    assert.ok(!same(job('Zomato', 'SDE 1'), job('Swiggy', 'SDE 1')));
    assert.ok(!same(job('Zomato', 'SDE 1'), job('Zomato', 'SDE 2')));
  });

  test('API: same title with a different link is not a duplicate; "Add anyway" bypasses a match', async () => {
    const create = (body, q = '') => authB(api().post(`/api/applications${q}`)).send({ status: 'saved', ...body });
    const blr = await create({ company: { name: 'Matchco' }, jobTitle: 'Backend Engineer', jobPostingUrl: 'https://matchco.com/jobs/blr' });
    assert.equal(blr.status, 201);
    const pune = await create({ company: { name: 'Matchco' }, jobTitle: 'Backend Engineer', jobPostingUrl: 'https://matchco.com/jobs/pune' });
    assert.equal(pune.status, 201);
    const dupLink = await create({ company: { name: 'Matchco Pvt Ltd' }, jobTitle: 'Senior Backend', jobPostingUrl: 'https://www.matchco.com/jobs/blr/?utm_source=x' });
    assert.equal(dupLink.status, 409);
    assert.equal(dupLink.body.error.details.duplicateId, blr.body.application._id);
    const dupTitle = await create({ company: { name: 'MATCHCO' }, jobTitle: 'backend-engineer' });
    assert.equal(dupTitle.status, 409);

    // A friend shares the Pune job with a reworded title: the link still finds it.
    const owner = (await authA(api().post('/api/applications')).send({
      company: { name: 'Matchco' }, jobTitle: 'Backend Eng (Pune)', jobPostingUrl: 'https://matchco.com/jobs/pune?ref=share', status: 'saved',
    })).body.application;
    const token = (await authA(api().post(`/api/applications/${owner._id}/share`))).body.url.split('/share/')[1];
    const view = await authB(api().get(`/api/shares/${token}`));
    assert.equal(String(view.body.existingApplication), pune.body.application._id);
    assert.equal((await authB(api().post(`/api/shares/${token}/accept`))).status, 409);
    // "Add anyway" adds it as a separate job.
    const forced = await authB(api().post(`/api/shares/${token}/accept?force=true`));
    assert.equal(forced.status, 201);
    assert.notEqual(forced.body.application._id, pune.body.application._id);
  });
});

describe('friends', () => {
  let tokenC; let idB; let idC; let jobs;
  const authC = (r) => r.set('Authorization', `Bearer ${tokenC}`);

  before(async () => {
    const c = await api().post('/api/auth/register').send({ name: 'Cara', email: 'cara@example.com', password: 'password123' });
    tokenC = c.body.token; idC = c.body.user._id;
    idB = (await authB(api().get('/api/auth/me'))).body.user._id;
    jobs = [];
    for (const [name, title] of [['Friendco', 'Data Analyst'], ['Pal Inc', 'QA Engineer <script>']]) {
      jobs.push((await authA(api().post('/api/applications')).send({ company: { name, website: `${name.split(' ')[0].toLowerCase()}.com` }, jobTitle: title, jobPostingUrl: `https://${name.split(' ')[0].toLowerCase()}.com/job`, notes: 'private note', status: 'applied' })).body.application._id);
    }
  });

  const codeOf = async (auth) => (await auth(api().get('/api/friends'))).body.myCode;

  test('every user has a private friend code; requests need it', async () => {
    const codeB = await codeOf(authB);
    assert.match(codeB, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(await codeOf(authB), codeB); // stable
    // Users can't be found by email any more, and codes never show up in profile responses.
    assert.equal((await authA(api().post('/api/friends')).send({ email: 'bob@example.com' })).status, 400);
    assert.equal((await authB(api().get('/api/auth/me'))).body.user.friendCode, undefined);
    assert.equal((await authA(api().post('/api/friends')).send({ code: 'ZZZZ-ZZZZ' })).status, 404);
    assert.equal((await authA(api().post('/api/friends')).send({ code: 'hello' })).status, 400);
    assert.equal((await authA(api().post('/api/friends')).send({ code: await codeOf(authA) })).status, 400);
  });

  test('request by code, accept, and list both ways', async () => {
    const codeB = await codeOf(authB);
    const typed = codeB.toLowerCase().replace('-', ' '); // forgiving input
    const sent = await authA(api().post('/api/friends')).send({ code: typed });
    assert.equal(sent.status, 201);
    assert.equal((await authA(api().post('/api/friends')).send({ code: codeB })).status, 409);

    const a = (await authA(api().get('/api/friends'))).body;
    assert.equal(a.outgoing.length, 1);
    assert.equal(a.outgoing[0].user.email, undefined); // not revealed before they accept
    const b = (await authB(api().get('/api/friends'))).body;
    assert.equal(b.incoming.length, 1);
    assert.equal(b.incoming[0].user.name, 'Alice');
    assert.equal((await authB(api().get('/api/friends/summary'))).body.requests, 1);

    // The sender can't accept their own request; a stranger can't touch it.
    assert.equal((await authA(api().post(`/api/friends/${a.outgoing[0]._id}/accept`))).status, 403);
    assert.equal((await authC(api().post(`/api/friends/${a.outgoing[0]._id}/accept`))).status, 404);
    assert.equal((await authC(api().delete(`/api/friends/${a.outgoing[0]._id}`))).status, 404);

    assert.equal((await authB(api().post(`/api/friends/${b.incoming[0]._id}/accept`))).status, 200);
    assert.equal((await authA(api().get('/api/friends'))).body.friends[0].user.name, 'Bob');
    assert.equal((await authB(api().get('/api/friends'))).body.friends[0].user.name, 'Alice');
  });

  test('a request back to someone who asked you accepts it', async () => {
    await authC(api().post('/api/friends')).send({ code: await codeOf(authA) });
    const back = await authA(api().post('/api/friends')).send({ code: await codeOf(authC) });
    assert.equal(back.body.status, 'accepted');
  });

  test('sends several jobs to friends only, sharing just four fields', async () => {
    const stranger = await api().post('/api/auth/register').send({ name: 'Dan', email: 'dan@example.com', password: 'password123' });
    const bad = await authA(api().post('/api/friends/send-jobs')).send({ applicationIds: jobs, friendIds: [stranger.body.user._id] });
    assert.equal(bad.status, 400);
    // Someone else's jobs can't be sent.
    assert.equal((await authB(api().post('/api/friends/send-jobs')).send({ applicationIds: jobs, friendIds: [(await authA(api().get('/api/auth/me'))).body.user._id] })).status, 404);

    const ok = await authA(api().post('/api/friends/send-jobs')).send({ applicationIds: jobs, friendIds: [idB, idC], message: 'Check these out' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.jobs, 2);
    assert.equal(ok.body.friends, 2);

    const inbox = (await authB(api().get('/api/shares/inbox'))).body.items;
    assert.equal(inbox.length, 2);
    assert.equal(inbox[0].sharedBy, 'Alice');
    assert.equal(inbox[0].message, 'Check these out');
    assert.deepEqual(Object.keys(inbox[0].job).sort(), ['companyName', 'companyWebsite', 'jobPostingUrl', 'jobTitle']);
    assert.ok(!JSON.stringify(inbox).includes('private note'));
    assert.equal((await authB(api().get('/api/friends/summary'))).body.shared, 2);
    // Items sent to Bob are invisible to Cara's inbox actions.
    assert.equal((await authC(api().post(`/api/shares/inbox/${inbox[0]._id}/accept`))).status, 404);

    const one = await authB(api().post(`/api/shares/inbox/${inbox[0]._id}/decline`));
    assert.equal(one.status, 200);
    const all = await authB(api().post('/api/shares/inbox/accept-all'));
    assert.deepEqual(all.body, { added: 1, skipped: 0 });
    const after = (await authB(api().get('/api/shares/inbox'))).body.items;
    assert.deepEqual(after.map((i) => i.response.action).sort(), ['added', 'declined']);
    assert.equal((await authB(api().get('/api/friends/summary'))).body.shared, 0);
    const added = after.find((i) => i.response.action === 'added');
    const app = (await authB(api().get(`/api/applications/${added.response.application}`))).body.application;
    assert.equal(app.status, 'saved');
    assert.match(app.notes, /Check these out/);

    assert.equal((await authC(api().post('/api/shares/inbox/accept-all'))).body.added, 2);
  });

  test('the sharer sees everything they shared and what each friend did', async () => {
    const items = (await authA(api().get('/api/shares/sent'))).body.items;
    const toFriends = items.filter((i) => i.type === 'friend');
    assert.equal(toFriends.length, 4);
    const status = (name) => toFriends.filter((i) => i.recipient.name === name).map((i) => i.response?.action).sort();
    assert.deepEqual(status('Bob'), ['added', 'declined']);
    assert.deepEqual(status('Cara'), ['added', 'added']);
    assert.ok(toFriends.every((i) => i.message === 'Check these out' && i.active && !i.revoked));
    assert.ok(!JSON.stringify(items).includes('@example.com'), 'no emails in the sent list');
    // Open links show counts, not who opened them; expired ones are still listed.
    const links = items.filter((i) => i.type === 'link');
    assert.ok(links.length >= 1);
    assert.ok(links.some((l) => l.counts.added >= 1));
    assert.ok(links.some((l) => !l.active), 'expired links stay in the history');
    assert.ok(links.every((l) => !('recipient' in l) && !('responses' in l)));
    // Only your own shares.
    assert.equal((await authB(api().get('/api/shares/sent'))).body.items.length, 0);
  });

  test('stop sharing: the job leaves the friend inbox, the history stays', async () => {
    const sentItems = (await authA(api().get('/api/shares/sent'))).body.items;
    const toCara = sentItems.find((i) => i.type === 'friend' && i.recipient.name === 'Cara');
    assert.equal((await authB(api().post(`/api/shares/sent/${toCara._id}/stop`))).status, 404);
    assert.equal((await authA(api().post(`/api/shares/sent/${toCara._id}/stop`))).status, 200);
    assert.ok(!(await authC(api().get('/api/shares/inbox'))).body.items.some((i) => String(i._id) === String(toCara._id)));
    assert.equal((await authC(api().post(`/api/shares/inbox/${toCara._id}/accept`))).status, 404);
    const after = (await authA(api().get('/api/shares/sent'))).body.items.find((i) => i._id === toCara._id);
    assert.equal(after.active, false);
    assert.equal(after.revoked, true);
    assert.equal(after.response.action, 'added', 'what Cara already did is kept');
    assert.equal((await authA(api().post(`/api/shares/sent/${toCara._id}/stop`))).body.alreadyStopped, true);
  });

  test('share records outlive their link: no TTL on expiresAt, a year-long purge date instead', async () => {
    const col = mongoose.connection.db.collection('sharedjobs');
    // Simulate a database from before this change: old TTL index and no purge date.
    await col.dropIndexes().catch(() => {});
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await col.updateMany({}, { $unset: { purgeAt: '' } });
    await migrateShareRetention();
    const indexes = await col.indexes();
    assert.ok(!indexes.some((ix) => ix.key.expiresAt === 1 && ix.expireAfterSeconds !== undefined));
    const doc = await col.findOne({});
    assert.ok(doc.purgeAt - doc.createdAt >= 364 * 86_400_000);
    await SharedJobModel.syncIndexes();
    assert.ok((await col.indexes()).some((ix) => ix.key.purgeAt === 1 && ix.expireAfterSeconds === 0));
  });

  test('a new code replaces the old one', async () => {
    const old = await codeOf(authC);
    const fresh = (await authC(api().post('/api/friend-code/regenerate'))).body.myCode;
    assert.notEqual(fresh, old);
    assert.equal((await authB(api().post('/api/friends')).send({ code: old })).status, 404);
  });

  test('unfriending removes the connection', async () => {
    const f = (await authB(api().get('/api/friends'))).body.friends[0];
    assert.equal((await authB(api().delete(`/api/friends/${f._id}`))).status, 200);
    assert.equal((await authA(api().get('/api/friends'))).body.friends.some((x) => x.user.name === 'Bob'), false);
    assert.equal((await authA(api().post('/api/friends/send-jobs')).send({ applicationIds: jobs, friendIds: [idB] })).status, 400);
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

  test('emails are sent from the SMTP account so they are not flagged as spoofed', () => {
    assert.deepEqual(senderHeaders('Job Tracker <me@gmail.com>', 'me@gmail.com'), { from: 'Job Tracker <me@gmail.com>' });
    assert.deepEqual(senderHeaders('Job Tracker <ME@gmail.com>', 'me@gmail.com'), { from: 'Job Tracker <ME@gmail.com>' });
    assert.deepEqual(senderHeaders('Job Tracker <other@site.com>', 'me@gmail.com'), { from: { name: 'Job Tracker', address: 'me@gmail.com' }, replyTo: 'other@site.com' });
    assert.deepEqual(senderHeaders('Job Tracker <no-reply@jobtracker.local>', 'me@gmail.com'), { from: { name: 'Job Tracker', address: 'me@gmail.com' } });
    assert.deepEqual(senderHeaders('Job Tracker <a@b.com>', ''), { from: 'Job Tracker <a@b.com>' });
  });

  test('background reminder check runs at most once per interval', async () => {
    await mongoose.connection.db.collection('jobruns').deleteMany({});
    const t0 = new Date();
    const results = await Promise.all([1, 2, 3].map(() => maybeRunReminderNotifications({ now: t0 })));
    assert.equal(results.filter(Boolean).length, 1); // concurrent requests: only one runs it
    assert.equal(await maybeRunReminderNotifications({ now: new Date(t0.getTime() + 5 * 60_000) }), false);
    assert.equal(await maybeRunReminderNotifications({ now: new Date(t0.getTime() + 11 * 60_000) }), true);
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

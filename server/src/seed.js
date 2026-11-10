/* eslint-disable no-console */
/**
 * Development seed: creates a demo user with realistic applications, resumes, email accounts,
 * interviews and reminders. Re-running replaces the demo user's data only.
 *
 *   npm run seed
 *   login: demo@jobtracker.dev / password123
 */
import PDFDocument from 'pdfkit';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { User, EmailAccount, Resume, Application, Interview, Reminder } from './models/index.js';
import { saveFile, deleteFile } from './services/fileStorage.js';
import { syncApplicationReminders, syncInterviewReminder } from './services/reminderSync.js';
import { STATUS_LABELS, PRIORITY_RANK } from './utils/constants.js';

const DEMO_EMAIL = 'demo@jobtracker.dev';
const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysFromNow = (n, h = 10) => { const d = new Date(Date.now() + n * DAY); d.setHours(h, 0, 0, 0); return d; };
const pick = (arr, i) => arr[i % arr.length];

function makePdf(title, lines) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.font('Helvetica-Bold').fontSize(22).text('Demo Candidate');
    doc.font('Helvetica').fontSize(11).fillColor('#555').text(`${title} · demo@jobtracker.dev · Bengaluru, India`);
    doc.moveDown();
    for (const [h, body] of lines) {
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(13).text(h).moveDown(0.2);
      doc.font('Helvetica').fontSize(10.5).fillColor('#333').text(body).moveDown(0.8);
    }
    doc.end();
  });
}

async function storePdf(userId, filename, title, lines) {
  const buffer = await makePdf(title, lines);
  const storedName = await saveFile({ userId, buffer, filename, mimeType: 'application/pdf' });
  return { originalName: filename, storedName, mimeType: 'application/pdf', size: buffer.length };
}

// The demo account has a public password. Never create it on a hosted database by accident.
function assertSafeTarget() {
  const local = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(env.mongoUri);
  if ((local && !env.isProd) || process.env.ALLOW_SEED === 'true') return;
  console.error('Refusing to seed: the target database is not local (or NODE_ENV=production).\n'
    + 'The demo account uses a public password (password123), so anyone could log in to it.\n'
    + 'If you really want this, run again with ALLOW_SEED=true.');
  process.exit(1);
}

async function main() {
  assertSafeTarget();
  await connectDB();
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    const id = existing._id;
    const oldFiles = await Resume.find({ user: id }).select('file.storedName').lean();
    await Promise.all(oldFiles.map((r) => deleteFile(r.file.storedName)));
    await Promise.all([Application, Interview, Reminder, Resume, EmailAccount].map((M) => M.deleteMany({ user: id })));
    await existing.deleteOne();
  }

  const user = await User.create({
    name: 'Demo Candidate', email: DEMO_EMAIL, password: 'password123',
    headline: 'Full-stack engineer', location: 'Bengaluru, India',
    skills: ['react', 'node.js', 'typescript', 'mongodb', 'python', 'sql', 'aws'],
  });

  const [primary, college] = await EmailAccount.create([
    { user: user._id, email: 'demo.candidate@gmail.com', provider: 'Gmail', label: 'Personal', isDefault: true },
    { user: user._id, email: 'demo.c@university.edu', provider: 'Outlook', label: 'College' },
  ]);
  await EmailAccount.create({ user: user._id, email: DEMO_EMAIL, provider: 'Other', label: 'Sign-up' });

  const resumeSpecs = [
    { name: 'Software Engineer Resume', version: 'v3', category: 'Software Engineering', description: 'DSA + systems focus, 1 page' },
    { name: 'Full Stack Resume', version: 'v2', category: 'Full Stack', description: 'MERN projects up top' },
    { name: 'Data Science Resume', version: 'v1', category: 'Data Science', description: 'ML projects and Kaggle' },
  ];
  const resumes = [];
  for (const spec of resumeSpecs) {
    const file = await storePdf(user._id, `${spec.name.replace(/ /g, '_')}_${spec.version}.pdf`, spec.category, [
      ['Experience', 'Software Engineer Intern, Example Labs — built internal dashboards with React and Node.js, cut page load times by 40%.'],
      ['Projects', 'Job Application Tracker — MERN CRM for the job hunt. Realtime chat app — WebSockets, Redis.'],
      ['Skills', 'JavaScript, TypeScript, React, Node.js, Express, MongoDB, PostgreSQL, Python, AWS, Docker'],
      ['Education', 'B.Tech Computer Science, 2025'],
    ]);
    resumes.push(await Resume.create({ ...spec, user: user._id, kind: 'resume', file }));
  }
  const cover = await Resume.create({
    user: user._id, kind: 'cover_letter', name: 'Generic Cover Letter', version: 'v1', category: 'General',
    file: await storePdf(user._id, 'Cover_Letter.pdf', 'Cover letter', [['Dear Hiring Manager,', 'I am excited to apply…']]),
  });

  // [company, title, industry, location, status path, daysAgo applied, source, type, mode]
  const rows = [
    ['Google', 'Software Engineer II', 'Technology', 'Bengaluru', ['applied', 'assessment_pending', 'assessment_completed', 'interview_scheduled', 'interviewing'], 40, 'Referral', 'Full-time', 'Hybrid'],
    ['Microsoft', 'SDE', 'Technology', 'Hyderabad', ['applied', 'interview_scheduled'], 12, 'Company Website', 'Full-time', 'Hybrid'],
    ['Razorpay', 'Frontend Engineer', 'Fintech', 'Bengaluru', ['applied', 'interview_scheduled', 'interviewing', 'offer'], 70, 'LinkedIn', 'Full-time', 'On-site'],
    ['Swiggy', 'Backend Engineer', 'Food Tech', 'Bengaluru', ['applied', 'rejected'], 55, 'LinkedIn', 'Full-time', 'Hybrid'],
    ['Zomato', 'Full Stack Developer', 'Food Tech', 'Gurugram', ['applied', 'assessment_pending'], 6, 'Naukri', 'Full-time', 'On-site'],
    ['Atlassian', 'Graduate Software Engineer', 'Technology', 'Remote', ['applied', 'assessment_pending', 'assessment_completed', 'rejected'], 95, 'Company Website', 'Full-time', 'Remote'],
    ['CRED', 'Product Engineer', 'Fintech', 'Bengaluru', ['applied'], 3, 'Wellfound', 'Full-time', 'On-site'],
    ['Postman', 'Software Engineer Intern', 'Developer Tools', 'Bengaluru', ['applied', 'interview_scheduled', 'interviewing', 'offer', 'accepted'], 120, 'Internshala', 'Internship', 'Hybrid'],
    ['Flipkart', 'SDE-1', 'E-commerce', 'Bengaluru', ['applied', 'on_hold'], 33, 'Naukri', 'Full-time', 'On-site'],
    ['Meesho', 'Data Scientist', 'E-commerce', 'Bengaluru', ['applied', 'rejected'], 80, 'LinkedIn', 'Full-time', 'Hybrid'],
    ['Notion', 'Software Engineer, Web', 'Productivity', 'Remote', ['saved'], 1, 'Company Website', 'Full-time', 'Remote'],
    ['Stripe', 'Software Engineer, Payments', 'Fintech', 'Remote', ['saved'], 0, 'LinkedIn', 'Full-time', 'Remote'],
    ['Freshworks', 'Full Stack Engineer', 'SaaS', 'Chennai', ['applied', 'withdrawn'], 60, 'Indeed', 'Full-time', 'On-site'],
    ['Zepto', 'SDE Intern', 'Quick Commerce', 'Mumbai', ['applied', 'interview_scheduled'], 9, 'Internshala', 'Internship', 'On-site'],
    ['Groww', 'Frontend Engineer', 'Fintech', 'Bengaluru', ['applied'], 15, 'LinkedIn', 'Full-time', 'Hybrid'],
    ['PhonePe', 'Software Engineer', 'Fintech', 'Bengaluru', ['applied', 'rejected'], 140, 'Naukri', 'Full-time', 'On-site'],
    ['Adobe', 'Member of Technical Staff', 'Technology', 'Noida', ['applied', 'assessment_pending', 'assessment_completed', 'interview_scheduled', 'rejected'], 110, 'Referral', 'Full-time', 'Hybrid'],
    ['Uber', 'Software Engineer I', 'Mobility', 'Bengaluru', ['applied'], 21, 'Company Website', 'Full-time', 'Hybrid'],
    ['Juspay', 'Product Engineer', 'Fintech', 'Bengaluru', ['applied', 'assessment_pending', 'assessment_completed'], 18, 'Wellfound', 'Full-time', 'On-site'],
    ['Thoughtworks', 'Application Developer', 'Consulting', 'Pune', ['applied', 'interview_scheduled', 'interviewing', 'rejected'], 150, 'Indeed', 'Full-time', 'Hybrid'],
    ['Browserstack', 'Contract Frontend Developer', 'Developer Tools', 'Remote', ['applied', 'on_hold'], 45, 'Other', 'Contract', 'Remote'],
    ['Sprinklr', 'Data Analyst', 'SaaS', 'Gurugram', ['applied'], 26, 'LinkedIn', 'Full-time', 'On-site'],
  ];

  const priorities = ['High', 'Medium', 'Low'];
  let count = 0;
  for (const [i, [company, title, industry, location, path_, applied, source, type, mode]] of rows.entries()) {
    const appliedAt = daysAgo(applied);
    const status = path_.at(-1);
    const resume = /Data/.test(title) ? resumes[2] : i % 2 ? resumes[1] : resumes[0];
    const email = i % 3 === 2 ? college : primary;
    const stepDays = Math.max(1, Math.floor(applied / path_.length));
    const statusHistory = path_.map((s, idx) => ({
      status: s, from: idx ? path_[idx - 1] : null, changedAt: idx ? daysAgo(applied - stepDays * idx) : appliedAt,
      note: idx ? undefined : 'Application created',
    }));
    const priority = pick(priorities, i);
    const domain = `${company.toLowerCase().replace(/[^a-z]/g, '')}.com`;
    const app = new Application({
      user: user._id,
      company: { name: company, website: `https://${domain}`, location },
      jobTitle: title, industry, employmentType: type, workMode: mode,
      jobPostingUrl: `https://${domain}/careers/${1000 + i}`,
      jobId: `REQ-${2400 + i * 7}`,
      department: 'Engineering',
      jobDescription: `We are looking for a ${title} to join our ${industry} team in ${location}.`,
      salary: type === 'Internship' ? { min: 50000, max: 80000, currency: 'INR', period: 'month' } : { min: 1200000 + i * 50000, max: 2000000 + i * 80000, currency: 'INR', period: 'year' },
      experienceRequired: type === 'Internship' ? '0 years' : '0-2 years',
      applicationDate: appliedAt, status, source, priority, priorityRank: PRIORITY_RANK[priority],
      applicationLink: `https://${domain}/careers/${1000 + i}/apply`,
      lastUpdateDate: statusHistory.at(-1).changedAt,
      nextFollowUpDate: ['applied', 'assessment_completed', 'on_hold'].includes(status) ? daysFromNow((i % 9) - 3) : undefined,
      deadline: status === 'saved' ? daysFromNow(4 + i % 5) : undefined,
      emailUsed: {
        account: status === 'saved' ? undefined : email._id,
        address: status === 'saved' ? undefined : email.email,
        provider: email.provider,
        confirmationReceived: status !== 'saved' && i % 4 !== 0,
        confirmationDate: status !== 'saved' ? appliedAt : undefined,
        subject: status !== 'saved' ? `Thank you for applying to ${company}` : undefined,
        recruiterEmail: i % 3 === 0 ? `talent@${domain}` : undefined,
      },
      resume: status === 'saved' ? undefined : resume._id,
      resumeSnapshot: status === 'saved' ? undefined : {
        name: resume.name, version: resume.version, category: resume.category, originalName: resume.file.originalName, attachedAt: appliedAt,
      },
      documents: i % 4 === 0 ? [cover._id] : [],
      recruiter: i % 3 === 0 ? { name: 'Priya Sharma', email: `priya@${domain}`, linkedinUrl: 'https://linkedin.com/in/example' } : {},
      referral: source === 'Referral' ? { received: true, name: 'Arjun Mehta', contact: 'arjun@example.com' } : { received: false },
      skillsRequired: ['react', 'node.js', 'system design', 'sql'].slice(0, 2 + (i % 3)),
      skillsMatched: ['react', 'node.js'],
      difficulty: pick(['Easy', 'Medium', 'Hard'], i),
      tags: i % 5 === 0 ? ['dream'] : i % 3 === 0 ? ['startup'] : [],
      notes: i % 2 ? 'Tailored resume to highlight relevant projects.' : undefined,
      statusHistory,
      activity: [
        { type: 'created', message: `Application created with status ${STATUS_LABELS[path_[0]]}`, at: appliedAt },
        ...statusHistory.slice(1).map((h) => ({
          type: 'status_changed', message: `Status changed from ${STATUS_LABELS[h.from]} to ${STATUS_LABELS[h.status]}`, at: h.changedAt,
        })),
      ],
    });
    await app.save();

    // Interviews for apps that reached an interview stage
    const ivRounds = [];
    if (path_.includes('assessment_pending')) {
      ivRounds.push({ roundName: 'Online Assessment', type: 'Online Assessment', date: path_.includes('assessment_completed') ? daysAgo(applied - stepDays) : daysFromNow(2, 18), status: path_.includes('assessment_completed') ? 'Completed' : 'Scheduled', result: path_.includes('assessment_completed') ? 'Passed' : 'Pending' });
    }
    if (path_.includes('interview_scheduled')) {
      const future = ['interview_scheduled', 'interviewing'].includes(status);
      ivRounds.push({
        roundName: 'Technical Round 1', type: 'Technical',
        date: future && status === 'interview_scheduled' ? daysFromNow(1 + (i % 5), 11) : daysAgo(Math.max(1, applied - stepDays * 2)),
        status: future && status === 'interview_scheduled' ? 'Scheduled' : 'Completed',
        result: future && status === 'interview_scheduled' ? 'Pending' : status === 'rejected' && !path_.includes('interviewing') ? 'Failed' : 'Passed',
        meetingLink: 'https://meet.google.com/abc-defg-hij', interviewerName: 'Rahul Verma',
        questionsAsked: 'LRU cache, design a URL shortener', prepNotes: 'Revise graphs and DP',
      });
    }
    if (path_.includes('interviewing')) {
      ivRounds.push({
        roundName: 'Hiring Manager', type: 'Managerial',
        date: status === 'interviewing' ? daysFromNow(3, 15) : daysAgo(Math.max(1, applied - stepDays * 3)),
        status: status === 'interviewing' ? 'Scheduled' : 'Completed',
        result: status === 'interviewing' ? 'Pending' : status === 'rejected' ? 'Failed' : 'Passed',
        meetingLink: 'https://zoom.us/j/123456789',
      });
    }
    for (const r of ivRounds) {
      const iv = await Interview.create({ ...r, user: user._id, application: app._id, time: `${String(r.date.getHours()).padStart(2, '0')}:00` });
      await syncInterviewReminder(iv, app);
    }
    await syncApplicationReminders(app);
    count += 1;
  }

  await Reminder.create([
    { user: user._id, type: 'custom', title: 'Update LinkedIn headline', dueDate: daysFromNow(1), origin: 'manual' },
    { user: user._id, type: 'custom', title: 'Ask Arjun for a Google referral update', dueDate: daysAgo(2), origin: 'manual' },
  ]);

  console.log(`Seeded demo user ${DEMO_EMAIL} / password123 with ${count} applications, ${resumes.length} resumes.`);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});

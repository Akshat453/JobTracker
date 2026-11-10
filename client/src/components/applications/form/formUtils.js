import { toDateInput } from '../../../lib/format.js';

export const URL_RX = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i;
export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const urlRule = { pattern: { value: URL_RX, message: 'Enter a valid URL' } };
export const emailRule = { pattern: { value: EMAIL_RX, message: 'Enter a valid email' } };

export const emptyInterview = () => ({
  _id: '', roundName: '', type: 'Technical', date: '', time: '', location: '', meetingLink: '',
  interviewerName: '', interviewerEmail: '', status: 'Scheduled', prepNotes: '', questionsAsked: '', feedback: '', result: 'Pending',
});

export function defaultValues({ defaultEmail } = {}) {
  return {
    company: { name: '', website: '', location: '' },
    jobTitle: '', jobDescription: '', jobPostingUrl: '', jobId: '', department: '', industry: '',
    employmentType: 'Full-time', workMode: '', salary: { min: '', max: '', currency: 'INR', period: 'year' }, experienceRequired: '',
    applicationDate: toDateInput(new Date()), deadline: '', status: 'applied', source: 'LinkedIn', applicationLink: '',
    lastUpdateDate: '', nextFollowUpDate: '', priority: 'Medium', notes: '', statusNote: '',
    emailUsed: {
      account: defaultEmail?._id || '', address: '', provider: defaultEmail?.provider || '',
      confirmationReceived: false, confirmationDate: '', subject: '', recruiterEmail: '', notes: '',
    },
    resume: '', documents: [],
    recruiter: { name: '', email: '', linkedinUrl: '', phone: '' },
    referral: { received: false, name: '', contact: '', notes: '' },
    interviews: [],
    personalNotes: '', jdSnapshot: '', skillsRequired: [], skillsMatched: [], difficulty: '', tags: [],
  };
}

const s = (v) => v ?? '';

/** API application -> form values */
export function toForm(app) {
  const d = defaultValues();
  return {
    ...d,
    company: { name: s(app.company?.name), website: s(app.company?.website), location: s(app.company?.location) },
    jobTitle: s(app.jobTitle), jobDescription: s(app.jobDescription), jobPostingUrl: s(app.jobPostingUrl), jobId: s(app.jobId),
    department: s(app.department), industry: s(app.industry), employmentType: s(app.employmentType), workMode: s(app.workMode),
    salary: { min: s(app.salary?.min), max: s(app.salary?.max), currency: app.salary?.currency || 'INR', period: app.salary?.period || 'year' },
    experienceRequired: s(app.experienceRequired),
    applicationDate: toDateInput(app.applicationDate), deadline: toDateInput(app.deadline), status: app.status, source: s(app.source),
    applicationLink: s(app.applicationLink), lastUpdateDate: '', nextFollowUpDate: toDateInput(app.nextFollowUpDate),
    priority: s(app.priority), notes: s(app.notes), statusNote: '',
    emailUsed: {
      account: s(app.emailUsed?.account?._id || app.emailUsed?.account), address: s(app.emailUsed?.address), provider: s(app.emailUsed?.provider),
      confirmationReceived: !!app.emailUsed?.confirmationReceived, confirmationDate: toDateInput(app.emailUsed?.confirmationDate),
      subject: s(app.emailUsed?.subject), recruiterEmail: s(app.emailUsed?.recruiterEmail), notes: s(app.emailUsed?.notes),
    },
    resume: s(app.resume?._id || app.resume),
    documents: (app.documents || []).map((x) => x._id || x),
    recruiter: { name: s(app.recruiter?.name), email: s(app.recruiter?.email), linkedinUrl: s(app.recruiter?.linkedinUrl), phone: s(app.recruiter?.phone) },
    referral: { received: !!app.referral?.received, name: s(app.referral?.name), contact: s(app.referral?.contact), notes: s(app.referral?.notes) },
    interviews: (app.interviews || []).map((iv) => ({
      ...emptyInterview(), ...Object.fromEntries(Object.entries(iv).map(([k, v]) => [k, v ?? ''])),
      date: toDateInput(iv.date), time: iv.time || '',
    })),
    personalNotes: s(app.personalNotes), jdSnapshot: s(app.jdSnapshot),
    skillsRequired: app.skillsRequired || [], skillsMatched: app.skillsMatched || [], difficulty: s(app.difficulty), tags: app.tags || [],
  };
}

const INTERVIEW_KEYS = Object.keys(emptyInterview());

/** form values -> API payload */
export function toPayload(v, { isEdit, originalStatus } = {}) {
  const p = structuredClone(v);
  // An email account and a manually typed address are mutually exclusive.
  if (p.emailUsed.account) delete p.emailUsed.address;
  p.interviews = p.interviews.map((iv) => {
    const out = Object.fromEntries(INTERVIEW_KEYS.map((k) => [k, iv[k]]));
    if (!out._id) delete out._id;
    return out;
  });
  if (!p.lastUpdateDate) delete p.lastUpdateDate;
  if (isEdit && p.status === originalStatus) delete p.status;
  if (!p.statusNote) delete p.statusNote;
  return p;
}

/** Which tab each top-level field lives on (for error indicators). */
export const FIELD_TAB = {
  company: 'job', jobTitle: 'job', jobDescription: 'job', jobPostingUrl: 'job', jobId: 'job', department: 'job', industry: 'job',
  employmentType: 'job', workMode: 'job', salary: 'job', experienceRequired: 'job',
  applicationDate: 'application', deadline: 'application', status: 'application', source: 'application', applicationLink: 'application',
  lastUpdateDate: 'application', nextFollowUpDate: 'application', priority: 'application', notes: 'application', statusNote: 'application',
  emailUsed: 'email', resume: 'documents', documents: 'documents', recruiter: 'people', referral: 'people', interviews: 'interviews',
  personalNotes: 'more', jdSnapshot: 'more', skillsRequired: 'more', skillsMatched: 'more', difficulty: 'more', tags: 'more',
};

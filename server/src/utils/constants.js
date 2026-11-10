export const STATUSES = [
  'saved',
  'applied',
  'assessment_pending',
  'assessment_completed',
  'interview_scheduled',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
  'on_hold',
  'withdrawn',
];

export const STATUS_LABELS = {
  saved: 'Saved / Interested',
  applied: 'Applied',
  assessment_pending: 'Assessment Pending',
  assessment_completed: 'Assessment Completed',
  interview_scheduled: 'Interview Scheduled',
  interviewing: 'Interview in Progress',
  offer: 'Offer Received',
  accepted: 'Accepted',
  rejected: 'Rejected',
  on_hold: 'On Hold',
  withdrawn: 'Withdrawn',
};

/** Statuses that mean the candidate got at least one interview. */
export const INTERVIEW_STAGES = ['interview_scheduled', 'interviewing', 'offer', 'accepted'];
export const OFFER_STAGES = ['offer', 'accepted'];
export const ASSESSMENT_STAGES = ['assessment_pending', 'assessment_completed'];

export const EMPLOYMENT_TYPES = ['Full-time', 'Internship', 'Part-time', 'Contract'];
export const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];
export const SOURCES = ['LinkedIn', 'Naukri', 'Wellfound', 'Company Website', 'Referral', 'Internshala', 'Indeed', 'Other'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 };
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const EMAIL_PROVIDERS = ['Gmail', 'Outlook', 'Other'];

export const INTERVIEW_TYPES = ['Technical', 'HR', 'Managerial', 'Behavioral', 'Assignment', 'Online Assessment'];
export const INTERVIEW_STATUSES = ['Scheduled', 'Completed', 'Rescheduled', 'Cancelled'];
export const INTERVIEW_RESULTS = ['Pending', 'Passed', 'Failed', 'N/A'];

export const DOCUMENT_KINDS = ['resume', 'cover_letter', 'other'];
export const RESUME_CATEGORIES = [
  'Software Engineering', 'Full Stack', 'Frontend', 'Backend', 'Product Management',
  'Data Science', 'Machine Learning', 'DevOps', 'Design', 'General', 'Other',
];

export const REMINDER_TYPES = ['follow_up', 'interview', 'deadline', 'custom'];

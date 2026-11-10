export const STATUSES = [
  { value: 'saved', label: 'Saved / Interested', short: 'Saved', color: 'slate', hex: '#94a3b8' },
  { value: 'applied', label: 'Applied', short: 'Applied', color: 'blue', hex: '#3b82f6' },
  { value: 'assessment_pending', label: 'Assessment Pending', short: 'Assessment', color: 'amber', hex: '#f59e0b' },
  { value: 'assessment_completed', label: 'Assessment Completed', short: 'Assessed', color: 'yellow', hex: '#eab308' },
  { value: 'interview_scheduled', label: 'Interview Scheduled', short: 'Interview', color: 'violet', hex: '#8b5cf6' },
  { value: 'interviewing', label: 'Interview in Progress', short: 'Interviewing', color: 'indigo', hex: '#6366f1' },
  { value: 'offer', label: 'Offer Received', short: 'Offer', color: 'emerald', hex: '#10b981' },
  { value: 'accepted', label: 'Accepted', short: 'Accepted', color: 'green', hex: '#16a34a' },
  { value: 'rejected', label: 'Rejected', short: 'Rejected', color: 'red', hex: '#ef4444' },
  { value: 'on_hold', label: 'On Hold', short: 'On hold', color: 'orange', hex: '#f97316' },
  { value: 'withdrawn', label: 'Withdrawn', short: 'Withdrawn', color: 'zinc', hex: '#71717a' },
];
export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.value, s]));

export const EMPLOYMENT_TYPES = ['Full-time', 'Internship', 'Part-time', 'Contract'];
export const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];
export const SOURCES = ['LinkedIn', 'Naukri', 'Wellfound', 'Company Website', 'Referral', 'Internshala', 'Indeed', 'Other'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const EMAIL_PROVIDERS = ['Gmail', 'Outlook', 'Other'];
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED'];
export const INTERVIEW_TYPES = ['Technical', 'HR', 'Managerial', 'Behavioral', 'Assignment', 'Online Assessment'];
export const INTERVIEW_STATUSES = ['Scheduled', 'Completed', 'Rescheduled', 'Cancelled'];
export const INTERVIEW_RESULTS = ['Pending', 'Passed', 'Failed', 'N/A'];
export const RESUME_CATEGORIES = [
  'Software Engineering', 'Full Stack', 'Frontend', 'Backend', 'Product Management',
  'Data Science', 'Machine Learning', 'DevOps', 'Design', 'General', 'Other',
];
export const DOCUMENT_KINDS = [
  { value: 'resume', label: 'Resume' },
  { value: 'cover_letter', label: 'Cover letter' },
  { value: 'other', label: 'Other document' },
];
export const REMINDER_TYPES = [
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'interview', label: 'Interview' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'custom', label: 'Custom' },
];
export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'priority', label: 'Priority' },
  { value: 'followup', label: 'Next follow-up' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'company', label: 'Company A–Z' },
];

/** Tailwind classes per colour. Listed literally so Tailwind's JIT keeps them. */
export const TONE = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300',
  yellow: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-500/15 dark:text-yellow-300',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300',
  green: 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/15 dark:text-green-300',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300',
  zinc: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-300',
};
export const DOT = {
  slate: 'bg-slate-400', blue: 'bg-blue-500', amber: 'bg-amber-500', yellow: 'bg-yellow-500', violet: 'bg-violet-500',
  indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', green: 'bg-green-600', red: 'bg-red-500', orange: 'bg-orange-500', zinc: 'bg-zinc-500',
};
export const PRIORITY_TONE = { High: 'red', Medium: 'amber', Low: 'slate' };

/** Palette for categorical charts. */
export const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

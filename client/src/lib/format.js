const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

const valid = (d) => d && !Number.isNaN(+new Date(d));

export const fmtDate = (d) => (valid(d) ? DATE.format(new Date(d)) : '—');
export const fmtShort = (d) => {
  if (!valid(d)) return '—';
  const date = new Date(d);
  return date.getFullYear() === new Date().getFullYear() ? SHORT.format(date) : DATE.format(date);
};
export const fmtTime = (d) => (valid(d) ? TIME.format(new Date(d)) : '');
export const fmtDateTime = (d) => (valid(d) ? `${fmtShort(d)}, ${fmtTime(d)}` : '—');

/** "in 3 days", "2 days ago", "today" */
export function relativeDay(d) {
  if (!valid(d)) return '';
  const start = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
  const diff = Math.round((start(d) - start(new Date())) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

export function timeAgo(d) {
  if (!valid(d)) return '';
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtShort(d);
}

export const isOverdue = (d) => valid(d) && new Date(d) < new Date(new Date().setHours(0, 0, 0, 0));

/** Value for <input type="date"> from an ISO string (local calendar day). */
export function toDateInput(d) {
  if (!valid(d)) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function toTimeInput(d) {
  if (!valid(d)) return '';
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}

export function fmtMoney(n, currency = 'INR') {
  if (n == null || n === '') return '';
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, notation: n >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}
export function fmtSalary(s) {
  if (!s || (s.min == null && s.max == null)) return '';
  const per = s.period && s.period !== 'year' ? ` / ${s.period}` : '';
  if (s.min != null && s.max != null) return `${fmtMoney(s.min, s.currency)} – ${fmtMoney(s.max, s.currency)}${per}`;
  return `${fmtMoney(s.min ?? s.max, s.currency)}${per}`;
}

export const fmtBytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export const cn = (...c) => c.filter(Boolean).join(' ');

/** Domain from a URL for favicon lookup. */
export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

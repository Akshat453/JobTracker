/**
 * Decides whether two jobs are "the same job", for duplicate warnings and for shared jobs.
 *
 * Checked in this order:
 *   1. Posting links: if both jobs have one, the cleaned-up links decide on their own.
 *      Same link means the same job; different links mean different jobs, even with the same title
 *      (e.g. "Backend Engineer" in Bangalore and in Pune).
 *   2. Job IDs: if both have one, they decide in the same way.
 *   3. Otherwise company + title, ignoring case, spaces, punctuation and legal suffixes,
 *      so "SDE-1" = "SDE 1" = "sde1" and "Zomato Ltd" = "Zomato".
 */

// Query parameters that only track where a click came from; they never identify the job.
const TRACKING_PARAMS = new Set([
  'ref', 'refid', 'referrer', 'src', 'source', 'trk', 'trkinfo', 'trackingid', 'tracking_id', 'origin',
  'gh_src', 'lever-source', 'lever-origin', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'lipi', 'eborigin',
  'from', 'utm', 'campaign', 'medium', 'share', 'shared', 'sharedfrom', 'si', 'ebp', 'position', 'pagenum',
]);
const isTracking = (key) => key.startsWith('utm_') || TRACKING_PARAMS.has(key);

/** Returns a canonical key for a job posting URL, or null if there isn't a usable one. */
export function postingKey(url) {
  if (!url || typeof url !== 'string') return null;
  let u;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const path = u.pathname.replace(/\/+$/, '').toLowerCase();

  // LinkedIn has many URL shapes for one job; they all carry the same numeric ID.
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    const id = u.searchParams.get('currentJobId') || path.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)(?:\/|$)/)?.[1];
    if (id && /^\d+$/.test(id)) return `linkedin:${id}`;
  }

  const params = [...u.searchParams.entries()]
    .map(([k, v]) => [k.toLowerCase(), v])
    .filter(([k, v]) => v !== '' && !isTracking(k))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
  return `${host}${path}${query}`;
}

const LEGAL_SUFFIXES = new Set([
  'inc', 'incorporated', 'ltd', 'limited', 'llc', 'llp', 'pvt', 'private', 'plc', 'corp', 'corporation', 'co', 'company', 'gmbh',
]);

const words = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);

/** "SDE-1", "SDE 1" and "sde1" all become "sde1". */
export const titleKey = (title) => words(title).join('');

/** "Zomato Pvt. Ltd." and "zomato" both become "zomato". */
export function companyKey(name) {
  const w = words(name);
  while (w.length > 1 && LEGAL_SUFFIXES.has(w[w.length - 1])) w.pop();
  return w.join('');
}

const idKey = (id) => (id ? String(id).trim().toLowerCase() : '') || null;

/** Precomputes the keys for one job ({ company: { name }, jobTitle, jobPostingUrl, jobId }). */
export const jobKeys = (job) => ({
  posting: postingKey(job.jobPostingUrl),
  jobId: idKey(job.jobId),
  company: companyKey(job.company?.name),
  title: titleKey(job.jobTitle),
});

/** True if two jobs (as returned by jobKeys) are the same job. */
export function sameJob(a, b) {
  if (a.posting && b.posting) return a.posting === b.posting;
  const sameCompany = Boolean(a.company) && a.company === b.company;
  if (a.jobId && b.jobId) return sameCompany && a.jobId === b.jobId;
  return sameCompany && Boolean(a.title) && a.title === b.title;
}

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { env } from '../config/env.js';

/**
 * Works out the company name, company website and job title from a job posting link.
 * Reads the page's structured data (schema.org JobPosting, which most job boards include for Google),
 * then its title tags, then known job-board URL patterns. Best effort: anything not found is left empty.
 */

// ---------- safe fetching (the URL comes from a user, so it must not reach private networks) ----------
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 4;

/** True for addresses that aren't on the public internet (loopback, private, link-local, metadata…). */
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]);
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8')
    || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') || v6.startsWith('ff') || v6.startsWith('64:ff9b');
}

// Checked when the connection is made (not before), so a DNS answer can't change in between.
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || !list.length) return callback(Object.assign(new Error('Blocked address'), { code: 'EBLOCKED' }));
    return options.all ? callback(null, list) : callback(null, list[0].address, list[0].family);
  });
}

function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(u.hostname.replace(/^\[|\]$/g, ''))) return null;
  return u;
}

function getOnce(u) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      lookup: safeLookup,
      timeout: TIMEOUT_MS,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; JobTrackerBot/1.0; reads job postings a user saved)',
        accept: 'text/html,application/xhtml+xml', 'accept-language': 'en',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, u).toString() });
      }
      if (res.statusCode !== 200 || !/html/i.test(res.headers['content-type'] || '')) {
        res.resume();
        return resolve({ html: '' });
      }
      let size = 0; const chunks = [];
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) { req.destroy(); resolve({ html: Buffer.concat(chunks).toString('utf8') }); } else chunks.push(c);
      });
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), url: u.toString() }));
      res.on('error', reject);
      return undefined;
    });
    req.on('timeout', () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
  });
}

/** Fetches a public web page's HTML, following a few redirects; '' if it can't be read. */
export async function fetchPublicPage(raw) {
  let url = raw;
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const u = checkUrl(url);
    if (!u) return { html: '', url };
    // eslint-disable-next-line no-await-in-loop
    const r = await getOnce(u).catch(() => ({ html: '' }));
    if (!r.redirect) return { html: r.html, url: r.url || url };
    url = r.redirect;
  }
  return { html: '', url };
}

// ---------- reading the page ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", ndash: '–', mdash: '—' };
const decode = (s) => String(s || '')
  .replace(/&(#\d+|#x[\da-f]+|[a-z]+\d*);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (ENTITIES[k]) return ENTITIES[k];
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)));
    return m;
  })
  .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function meta(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  return tag ? decode(/content=["']([^"']*)["']/i.exec(tag)?.[1]) : '';
}

function jobPostings(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        const type = [].concat(node['@type'] || []);
        if (type.includes('JobPosting')) out.push(node);
        if (node['@graph']) walk(node['@graph']);
      };
      walk(JSON.parse(m[1].trim()));
    } catch { /* ignore broken JSON-LD */ }
  }
  return out;
}

const JOB_BOARDS = /(^|\.)(linkedin|naukri|indeed|glassdoor|wellfound|angel|internshala|instahyre|cutshort|foundit|monster|hirist|iimjobs|greenhouse|lever|ashbyhq|myworkdayjobs|workday|smartrecruiters|workable|bamboohr|recruitee|icims|taleo|successfactors|jobvite|breezy|keka|darwinbox|zohorecruit|freshteam|google|ycombinator|wellfound|unstop)\./i;

const titleCase = (slug) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/** Company from the job-board URL itself (e.g. jobs.lever.co/<company>/…). */
export function companyFromUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return ''; }
  const host = u.hostname.replace(/^www\./, '');
  const first = u.pathname.split('/').filter(Boolean)[0] || '';
  if (/(^|\.)greenhouse\.io$/.test(host) && first && first !== 'embed') return titleCase(first);
  if (/^(jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|jobs\.smartrecruiters\.com)$/.test(host) && first) return titleCase(first);
  const wd = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/.exec(host);
  if (wd) return titleCase(wd[1]);
  const sub = /^([a-z0-9-]+)\.(?:bamboohr\.com|recruitee\.com|breezy\.hr|keka\.com|darwinbox\.in|zohorecruit\.com|freshteam\.com)$/.exec(host);
  if (sub && !['www', 'jobs', 'careers', 'app'].includes(sub[1])) return titleCase(sub[1]);
  return '';
}

/** The company's own site when the job is on it (careers.acme.com/jobs/1 → https://acme.com). */
function websiteFromUrl(raw) {
  try {
    const u = new URL(raw);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) || net.isIP(u.hostname) || JOB_BOARDS.test(`${u.hostname}.`)) return '';
    return `https://${u.hostname.replace(/^(www|careers|jobs|apply|career|hiring|work|talent)\./, '')}`;
  } catch { return ''; }
}

const cleanWebsite = (v) => {
  const s = [].concat(v || []).find((x) => typeof x === 'string' && /^https?:\/\//i.test(x));
  if (!s) return '';
  try { const u = new URL(s); return JOB_BOARDS.test(`${u.hostname}.`) ? '' : `${u.protocol}//${u.hostname}`; } catch { return ''; }
};

/** Extracts what it can from a page's HTML. Exported for tests. */
export function parseJobPage(html, url) {
  const info = { companyName: '', website: '', jobTitle: '' };
  const posting = jobPostings(html)[0];
  if (posting) {
    const org = [].concat(posting.hiringOrganization || [])[0];
    info.companyName = decode(typeof org === 'string' ? org : org?.name);
    info.website = cleanWebsite(org?.sameAs) || cleanWebsite(org?.url);
    info.jobTitle = decode(posting.title);
  }
  const ogTitle = meta(html, 'og:title') || decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
  // LinkedIn: "Acme hiring Software Engineer in Pune, India | LinkedIn"
  const li = /^(.+?) hiring (.+?)(?: in .+?)?\s*\|\s*LinkedIn$/i.exec(ogTitle);
  if (li) {
    info.companyName ||= li[1].trim();
    info.jobTitle ||= li[2].trim();
  }
  // "Software Engineer - Acme" / "Software Engineer at Acme" / "Software Engineer | Acme Careers"
  const generic = /^(.{3,120}?)\s+(?:at|@|-|–|—|\|)\s+(.{2,80}?)(?:\s+(?:careers|jobs))?(?:\s*[|–—-].*)?$/i.exec(ogTitle);
  if (!info.jobTitle && generic) info.jobTitle = generic[1].trim();
  info.companyName ||= companyFromUrl(url) || meta(html, 'og:site_name').replace(/\s+(careers|jobs)$/i, '');
  if (!info.companyName && generic) info.companyName = generic[2].trim();
  info.jobTitle ||= ogTitle.replace(/\s*[|–—-]\s*[^|–—-]*$/, '').trim();
  info.website ||= websiteFromUrl(url);
  for (const k of Object.keys(info)) info[k] = info[k].slice(0, k === 'jobTitle' ? 160 : 120);
  if (/linkedin|sign in|log in|just a moment|access denied|^jobs?$/i.test(info.jobTitle)) info.jobTitle = '';
  if (/^(linkedin|indeed|naukri|glassdoor)$/i.test(info.companyName)) info.companyName = '';
  return info;
}

/** Company name, website and job title for a posting link ({} parts empty when unknown). */
export async function jobLinkInfo(url) {
  if (env.isTest && !process.env.ALLOW_TEST_FETCH) return parseJobPage('', url); // no network in tests
  const page = await fetchPublicPage(url);
  return parseJobPage(page.html, page.url || url);
}

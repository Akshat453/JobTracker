/** Parses CSV text (RFC 4180: quoted fields, "" escapes, commas/newlines inside quotes) into rows of cells. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, ''); // Excel's UTF-8 marker
  // Excel in some regions saves with semicolons; use whichever separator the first line has more of.
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const norm = (h) => h.toLowerCase().replace(/[^a-z]/g, '');
/** Header names accepted for each field (compared lowercase, letters only). */
const ALIASES = {
  companyName: ['company', 'companyname', 'employer', 'organisation', 'organization', 'org'],
  jobTitle: ['jobtitle', 'title', 'position', 'role', 'jobrole', 'jobposition', 'designation', 'job'],
  companyUrl: ['companyurl', 'companywebsite', 'website', 'companylink', 'companysite', 'site', 'companyweb', 'homepage'],
  jobUrl: ['jobpostingurl', 'jobposting', 'postingurl', 'jobposturl', 'joburl', 'joblink', 'postinglink', 'jobpositionurl', 'jobpositionlink',
    'positionurl', 'applylink', 'applicationlink', 'applyurl', 'url', 'link', 'posting'],
};
export const IMPORT_COLUMNS = [
  ['companyName', 'Company name'], ['jobTitle', 'Job title'], ['companyUrl', 'Company website'], ['jobUrl', 'Job posting URL'],
];
export const TEMPLATE_CSV = '﻿Company name,Job title,Company website,Job posting URL\r\nAcme Inc,Software Engineer,acme.com,https://acme.com/careers/123\r\n';

// Undo the apostrophe our own CSV export adds in front of cells starting with = + - @.
const clean = (v) => (v || '').trim().replace(/^'(?=[=+\-@])/, '');

/**
 * Turns CSV text into import rows. Columns are found by header name; a file without a recognisable
 * header is read in the order company name, job title, company website, job posting URL.
 * Returns { rows: [{ line, company: { name, website }, jobTitle, jobPostingUrl }], columns, error }.
 */
export function readJobsCsv(text) {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], error: 'The file is empty' };
  const header = table[0].map(norm);
  const find = (key) => header.findIndex((h) => ALIASES[key].includes(h));
  let index = Object.fromEntries(IMPORT_COLUMNS.map(([key]) => [key, find(key)]));
  const hasHeader = index.companyName !== -1 || index.jobTitle !== -1;
  if (!hasHeader) index = { companyName: 0, jobTitle: 1, companyUrl: 2, jobUrl: 3 };
  if (hasHeader && (index.companyName === -1 || index.jobTitle === -1)) {
    return { rows: [], error: `Couldn't find a ${index.companyName === -1 ? '"Company name"' : '"Job title"'} column. Use the template's column names.` };
  }
  const body = hasHeader ? table.slice(1) : table;
  const at = (r, key) => (index[key] === -1 ? '' : clean(r[index[key]]));
  const rows = body.map((r, i) => ({
    line: i + (hasHeader ? 2 : 1),
    company: { name: at(r, 'companyName'), website: at(r, 'companyUrl') },
    jobTitle: at(r, 'jobTitle'),
    jobPostingUrl: at(r, 'jobUrl'),
  }));
  const columns = IMPORT_COLUMNS.filter(([key]) => index[key] !== -1).map(([, label]) => label);
  return { rows, columns, hasHeader, error: rows.length ? null : 'The file has a header but no jobs' };
}

/**
 * Turns resume text into the shape a job-board field wants, without changing any wording:
 * only bullet markers and line breaks change.
 */

// A bullet marker at the start of a line: •, ●, ▪, ◦, ‣, ■, ►, ➢, ✓, -, –, —, * (followed by a space).
const MARKER = /^\s*(?:[•●▪◦‣■□►▸➢➤✓✔·*]|[-–—](?=\s))\s*/;

/** The text's points, one per non-empty line, without bullet markers. */
export function bulletsOf(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(MARKER, '').trim())
    .filter(Boolean);
}

export const DESCRIPTION_STYLES = [
  { value: 'paragraphs', label: 'Paragraphs', hint: 'Each point as its own paragraph with a blank line between. Best for Workday.' },
  { value: 'bullets', label: 'Bullets', hint: 'One "•" point per line. Good for Greenhouse, Lever, Ashby and LinkedIn text boxes.' },
  { value: 'single', label: 'One paragraph', hint: 'Everything on one line. For boxes that remove line breaks when you paste (some Taleo / SuccessFactors forms).' },
];

export function formatDescription(text, style = 'paragraphs') {
  const points = bulletsOf(text);
  if (style === 'bullets') return points.map((p) => `• ${p}`).join('\n');
  if (style === 'single') return points.join(' ');
  return points.join('\n\n');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }));

export const DATE_STYLES = [
  { value: 'mm/yyyy', label: '05/2026' },
  { value: 'mon yyyy', label: 'May 2026' },
  { value: 'month yyyy', label: 'May 2026 (full month)' },
  { value: 'yyyy-mm', label: '2026-05' },
];

/** "2026-05" or "2026" → the chosen display style. Year-only dates stay as the year. */
export function formatDate(value, style = 'mm/yyyy') {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value || '');
  if (!m) return '';
  const [, year, month] = m;
  if (!month) return year;
  const name = MONTHS[Number(month) - 1];
  if (style === 'mon yyyy') return `${name.slice(0, 3)} ${year}`;
  if (style === 'month yyyy') return `${name} ${year}`;
  if (style === 'yyyy-mm') return `${year}-${month}`;
  return `${month}/${year}`;
}

export function formatRange(from, to, current, style) {
  const a = formatDate(from, style);
  const b = current ? 'Present' : formatDate(to, style);
  return [a, b].filter(Boolean).join(' – ');
}

/** The whole resume as plain text, for "paste your resume" boxes. */
export function fullResumeText(p, { style = 'bullets', dateStyle = 'mon yyyy' } = {}) {
  const out = [];
  const block = (title, lines) => { const body = lines.filter(Boolean); if (body.length) out.push([title.toUpperCase(), ...body].join('\n')); };
  const c = p.contact || {};
  const head = [c.fullName, [c.email, c.phone, c.location].filter(Boolean).join(' | '), [c.linkedin, c.github, c.portfolio, c.other].filter(Boolean).join(' | ')].filter(Boolean);
  if (head.length) out.push(head.join('\n'));
  if (p.summary?.trim()) block('Summary', [p.summary.trim()]);
  const entry = (title, sub, dates, desc) => [
    [title, dates].filter(Boolean).join(' (') + (title && dates ? ')' : ''),
    sub, desc ? formatDescription(desc, style) : '',
  ].filter(Boolean).join('\n');
  block('Experience', (p.experience || []).map((e) => entry(
    [e.jobTitle, e.company].filter(Boolean).join(', '), e.location, formatRange(e.from, e.to, e.current, dateStyle), e.description,
  )).join('\n\n').split('\n'));
  block('Education', (p.education || []).map((e) => entry(
    [e.degree, e.field].filter(Boolean).join(', '), [e.school, e.location, e.grade].filter(Boolean).join(' | '), formatRange(e.from, e.to, false, dateStyle), e.description,
  )).join('\n\n').split('\n'));
  block('Projects', (p.projects || []).map((e) => entry(
    e.name, [e.tech, e.link].filter(Boolean).join(' | '), formatRange(e.from, e.to, false, dateStyle), e.description,
  )).join('\n\n').split('\n'));
  block('Skills', (p.skills || []).map((s) => [s.category, s.items].filter(Boolean).join(': ')));
  for (const x of p.extras || []) block(x.title || 'Other', [formatDescription(x.content, style)]);
  return out.join('\n\n');
}

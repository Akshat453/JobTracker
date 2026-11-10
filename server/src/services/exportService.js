import PDFDocument from 'pdfkit';
import { STATUS_LABELS } from '../utils/constants.js';

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function csvCell(value) {
  if (value == null) return '';
  let s = Array.isArray(value) ? value.join('; ') : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS = [
  ['Company', (a) => a.company?.name],
  ['Job Title', (a) => a.jobTitle],
  ['Status', (a) => STATUS_LABELS[a.status]],
  ['Application Date', (a) => fmtDate(a.applicationDate)],
  ['Source', (a) => a.source],
  ['Employment Type', (a) => a.employmentType],
  ['Work Mode', (a) => a.workMode],
  ['Location', (a) => a.company?.location],
  ['Priority', (a) => a.priority],
  ['Email Used', (a) => a.emailUsed?.address],
  ['Resume Used', (a) => (a.resumeSnapshot?.name ? `${a.resumeSnapshot.name}${a.resumeSnapshot.version ? ` (${a.resumeSnapshot.version})` : ''}` : '')],
  ['Salary Min', (a) => a.salary?.min],
  ['Salary Max', (a) => a.salary?.max],
  ['Currency', (a) => a.salary?.currency],
  ['Next Follow-up', (a) => fmtDate(a.nextFollowUpDate)],
  ['Deadline', (a) => fmtDate(a.deadline)],
  ['Recruiter', (a) => a.recruiter?.name],
  ['Recruiter Email', (a) => a.recruiter?.email],
  ['Referral', (a) => (a.referral?.received ? a.referral.name || 'Yes' : 'No')],
  ['Job Posting URL', (a) => a.jobPostingUrl],
  ['Tags', (a) => a.tags],
  ['Notes', (a) => a.notes],
  ['Last Updated', (a) => fmtDate(a.updatedAt)],
];

export function applicationsToCsv(apps) {
  const header = COLUMNS.map(([h]) => h).join(',');
  const rows = apps.map((a) => COLUMNS.map(([, get]) => csvCell(get(a))).join(','));
  return `﻿${[header, ...rows].join('\r\n')}`; // BOM so Excel detects UTF-8
}

/** Streams a PDF analytics report to `stream`. */
export function writePdfReport(stream, { user, range, analytics, resumes, sources, apps }) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.pipe(stream);

  const ink = '#111827'; const muted = '#6B7280'; const accent = '#4F46E5';
  const W = doc.page.width - 96;

  const heading = (t) => { doc.moveDown(1.2).fillColor(ink).font('Helvetica-Bold').fontSize(13).text(t); doc.moveDown(0.4); };
  const ensureSpace = (h) => { if (doc.y + h > doc.page.height - 60) doc.addPage(); };

  function table(cols, rows) {
    const widths = cols.map((c) => c.w * W);
    const drawRow = (cells, bold) => {
      ensureSpace(18);
      const y = doc.y;
      let x = 48;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(bold ? muted : ink);
      cells.forEach((cell, i) => {
        doc.text(String(cell ?? ''), x + 2, y, { width: widths[i] - 4, ellipsis: true, lineBreak: false, align: cols[i].align || 'left' });
        x += widths[i];
      });
      doc.y = y + 16;
      doc.moveTo(48, doc.y - 3).lineTo(48 + W, doc.y - 3).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    };
    drawRow(cols.map((c) => c.label), true);
    rows.forEach((r) => drawRow(r));
    doc.x = 48;
  }

  // Title
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(20).text('Job Search Report');
  doc.fillColor(muted).font('Helvetica').fontSize(10)
    .text(`${user.name} · Generated ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`)
    .text(range.from || range.to ? `Period: ${fmtDate(range.from) || 'start'} → ${fmtDate(range.to) || 'today'}` : 'Period: all time');

  // KPIs
  const t = analytics.totals;
  heading('Summary');
  const kpis = [
    ['Applications', t.total], ['Interviews', t.interviews], ['Offers', t.offers], ['Rejections', t.rejections],
    ['Interview rate', `${t.interviewRate}%`], ['Offer rate', `${t.offerRate}%`], ['Rejection rate', `${t.rejectionRate}%`],
    ['Avg. days to interview', t.avgDaysToInterview ?? '—'],
  ];
  const boxW = W / 4; const startY = doc.y;
  kpis.forEach(([label, value], i) => {
    const x = 48 + (i % 4) * boxW; const y = startY + Math.floor(i / 4) * 46;
    doc.roundedRect(x + 2, y, boxW - 4, 40, 4).fillColor('#F3F4F6').fill();
    doc.fillColor(muted).font('Helvetica').fontSize(8).text(label, x + 10, y + 7, { width: boxW - 20 });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(14).text(String(value), x + 10, y + 19, { width: boxW - 20 });
  });
  doc.y = startY + 96; doc.x = 48;

  heading('Applications by status');
  table([{ label: 'Status', w: 0.7 }, { label: 'Count', w: 0.3, align: 'right' }],
    analytics.byStatus.filter((s) => s.count).map((s) => [s.name, s.count]));

  heading('Applications by month');
  table([{ label: 'Month', w: 0.4 }, { label: 'Applied', w: 0.2, align: 'right' }, { label: 'Interviews', w: 0.2, align: 'right' }, { label: 'Offers', w: 0.2, align: 'right' }],
    analytics.monthly.filter((m) => m.applications).map((m) => [m.name, m.applications, m.interviews, m.offers]));

  const perfCols = [{ label: 'Name', w: 0.4 }, { label: 'Apps', w: 0.12, align: 'right' }, { label: 'Interviews', w: 0.16, align: 'right' }, { label: 'Offers', w: 0.12, align: 'right' }, { label: 'Interview %', w: 0.2, align: 'right' }];
  const perfRows = (list) => list.filter((r) => r.applications).map((r) => [r.version ? `${r.name} (${r.version})` : r.name, r.applications, r.interviews, r.offers, `${r.interviewRate}%`]);

  heading('Sources');
  table(perfCols, perfRows(sources.sources));
  heading('Resume versions');
  table(perfCols, perfRows(resumes.resumes));
  heading('Email accounts');
  table(perfCols, perfRows(sources.emails));

  heading(`Applications (${apps.length})`);
  table(
    [{ label: 'Company', w: 0.24 }, { label: 'Role', w: 0.3 }, { label: 'Status', w: 0.2 }, { label: 'Applied', w: 0.13 }, { label: 'Source', w: 0.13 }],
    apps.map((a) => [a.company?.name, a.jobTitle, STATUS_LABELS[a.status], fmtDate(a.applicationDate), a.source]),
  );

  doc.end();
}

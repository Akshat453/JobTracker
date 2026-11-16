import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { Modal, Button, Badge } from '../ui/index.js';
import { applicationsApi } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { readJobsCsv, TEMPLATE_CSV } from '../../lib/csv.js';
import { cn } from '../../lib/format.js';

const MAX_ROWS = 300;
const MAX_BYTES = 1024 * 1024;
const STATE = {
  new: { tone: 'emerald', label: 'Will be added' },
  duplicate: { tone: 'amber', label: 'Already tracked' },
  invalid: { tone: 'red', label: 'Has a problem' },
  repeated: { tone: 'amber', label: 'Repeated in file' },
};
const toPayload = (r) => ({ company: r.company, jobTitle: r.jobTitle, jobPostingUrl: r.jobPostingUrl });

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'saved-jobs-template.csv' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Adds jobs from a CSV to Saved: company name, job title, company website and job posting URL.
 * The file is read in the browser, checked by the server without saving (preview), then imported.
 */
export function ImportCsvModal({ open, onClose, onImported }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const resetFile = () => { setFileName(''); setRows(null); setPreview(null); setError(''); };
  const close = () => { resetFile(); onClose(); };

  const pick = async (file) => {
    resetFile();
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') return setError('Choose a .csv file (in Excel or Google Sheets: File → Download / Save as → CSV)');
    if (file.size > MAX_BYTES) return setError('The file is larger than 1 MB');
    setFileName(file.name);
    const parsed = readJobsCsv(await file.text());
    if (parsed.error) return setError(parsed.error);
    if (parsed.rows.length > MAX_ROWS) return setError(`The file has ${parsed.rows.length} jobs. Import at most ${MAX_ROWS} at a time; split it into smaller files.`);
    setRows(parsed);
    setBusy(true);
    try {
      setPreview(await applicationsApi.importCsv(parsed.rows.map(toPayload), { dryRun: true }));
    } catch (e) { setError(errorMessage(e, 'Could not check the file')); } finally { setBusy(false); }
  };

  const importNow = async () => {
    setBusy(true);
    try {
      const res = await applicationsApi.importCsv(rows.rows.map(toPayload));
      const { added, duplicates, invalid } = res.summary;
      const skipped = duplicates + invalid;
      toast.success(`${added} job${added === 1 ? '' : 's'} added to Saved${skipped ? ` · ${skipped} skipped` : ''}`);
      onImported?.(res);
      close();
    } catch (e) { toast.error(errorMessage(e, 'Import failed')); } finally { setBusy(false); }
  };

  const summary = preview?.summary;
  const resultOf = (i) => preview?.results.find((r) => r.row === i);

  return (
    <Modal open={open} onClose={close} size="xl" title="Import jobs from CSV"
      description="Each row becomes a Saved job with its company name, job title, company website and job posting link. Jobs you already track are skipped."
      footer={(
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={importNow} loading={busy && Boolean(preview)} disabled={!summary?.new || busy}>
            {summary ? `Add ${summary.new} job${summary.new === 1 ? '' : 's'} to Saved` : 'Add to Saved'}
          </Button>
        </>
      )}>
      <div className="space-y-4">
        {!fileName ? (
          <button type="button" onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
            className={cn('flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition',
              drag ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10' : 'border-border hover:border-brand-400 hover:bg-subtle/50', error && 'border-red-400')}>
            <UploadCloud className="h-7 w-7 text-muted" />
            <span className="mt-2 text-sm font-medium">Drop a CSV file or click to browse</span>
            <span className="text-xs text-muted">Up to {MAX_ROWS} jobs per file</span>
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-subtle/50 px-3 py-2.5">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-brand-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{fileName}</p>
              <p className="text-xs text-muted">
                {busy && !preview ? 'Checking…' : rows ? `${rows.rows.length} row${rows.rows.length === 1 ? '' : 's'}${rows.columns ? ` · columns found: ${rows.columns.join(', ')}` : ''}` : ''}
              </p>
            </div>
            <button type="button" onClick={resetFile} className="text-muted hover:text-fg" aria-label="Choose another file"><X className="h-4 w-4" /></button>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="CSV file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {!fileName && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">Columns</p>
            <p className="mt-1 text-muted">
              <b className="text-fg">Company name</b> and <b className="text-fg">Job title</b> are required; <b className="text-fg">Company website</b> and <b className="text-fg">Job posting URL</b> are optional.
              Other columns are ignored. Headers like "Company", "Title", "Role", "Website" or "Job link" also work.
            </p>
            <Button className="mt-2" size="sm" variant="secondary" icon={Download} onClick={downloadTemplate}>Download template</Button>
          </div>
        )}

        {summary && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="emerald">{summary.new} new</Badge>
              {summary.duplicates > 0 && <Badge tone="amber">{summary.duplicates} duplicate{summary.duplicates === 1 ? '' : 's'} (skipped)</Badge>}
              {summary.invalid > 0 && <Badge tone="red">{summary.invalid} with problems (skipped)</Badge>}
            </div>
            <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-subtle text-xs text-muted">
                  <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Company</th><th className="px-3 py-2">Job title</th><th className="px-3 py-2">Links</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.rows.map((r, i) => {
                    const res = resultOf(i);
                    const st = STATE[res?.inFile ? 'repeated' : res?.status] || STATE.invalid;
                    return (
                      <tr key={r.line} className={res?.status === 'new' ? '' : 'text-muted'}>
                        <td className="px-3 py-2 tabular-nums">{r.line}</td>
                        <td className="w-48 px-3 py-2">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {res?.message && <p className="mt-0.5 text-xs">{res.message}</p>}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2" title={r.company.name}>{r.company.name || '—'}</td>
                        <td className="max-w-[200px] truncate px-3 py-2" title={r.jobTitle}>{r.jobTitle || '—'}</td>
                        <td className="max-w-[160px] truncate px-3 py-2 text-xs" title={[r.company.website, r.jobPostingUrl].filter(Boolean).join('\n')}>
                          {[r.company.website && 'Website', r.jobPostingUrl && 'Posting'].filter(Boolean).join(' · ') || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

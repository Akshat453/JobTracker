import { useRef } from 'react';
import { ExternalLink, FileCode2, FilePen, Paperclip, X } from 'lucide-react';
import { Button, Field, Input } from '../ui/index.js';
import { downloadFile, errorMessage } from '../../api/client.js';
import { fmtBytes } from '../../lib/format.js';

export const SOURCE_EXT = /\.(docx?|tex|zip)$/i;
export const SOURCE_ACCEPT = '.docx,.doc,.tex,.zip';

/** "Open in Overleaf" / "Open in Google Docs" / "Open link", from the link's site. */
export function linkLabel(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* shown as a plain link */ }
  if (host.endsWith('overleaf.com')) return 'Open in Overleaf';
  if (host === 'docs.google.com') return 'Open in Google Docs';
  if (host.endsWith('sharepoint.com') || host.endsWith('onedrive.live.com') || host === '1drv.ms') return 'Open in Word online';
  return 'Open link';
}

const isTexOrZip = (name = '') => /\.(tex|zip)$/i.test(name);

/** Picks an editable source: a Word / LaTeX / Overleaf .zip file and/or a link. */
export function SourceFields({ file, onFile, url, onUrl, error, existingFile }) {
  const input = useRef(null);
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium">Editable source <span className="font-normal text-muted">(optional)</span></p>
        <p className="text-xs text-muted">The file you edit to make this resume: a Word file, a LaTeX .tex file or an Overleaf source .zip, and/or a link to it.</p>
      </div>
      {file ? (
        <div className="flex items-center gap-2 rounded-md bg-subtle/60 px-2.5 py-2 text-sm">
          {isTexOrZip(file.name) ? <FileCode2 className="h-4 w-4 shrink-0 text-brand-500" /> : <FilePen className="h-4 w-4 shrink-0 text-brand-500" />}
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-xs text-muted">{fmtBytes(file.size)}</span>
          <button type="button" onClick={() => onFile(null)} className="text-muted hover:text-fg" aria-label="Remove source file"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" icon={Paperclip} onClick={() => input.current?.click()}>
            {existingFile ? 'Replace file' : 'Choose Word / LaTeX file'}
          </Button>
          {existingFile && <span className="min-w-0 truncate text-xs text-muted">Current: {existingFile.originalName}</span>}
        </div>
      )}
      <input ref={input} type="file" accept={SOURCE_ACCEPT} className="hidden" aria-label="Editable source file"
        onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ''; }} />
      <Field label="Link" hint="Overleaf, Google Docs or Word online. A link always opens the latest content, so also upload the file if you want to keep this version's exact source.">
        <Input type="url" inputMode="url" aria-label="Source link" value={url} onChange={(e) => onUrl(e.target.value)} placeholder="https://www.overleaf.com/project/…" />
      </Field>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Buttons to open a version's editable source: download its file and/or open its link. */
export function SourceActions({ doc, toast, size = 'sm' }) {
  const src = doc.source;
  if (!src?.file && !src?.url) return null;
  const download = () => downloadFile(`/resumes/${doc._id}/source`, src.file.originalName, { download: 1 })
    .catch((e) => toast.error(errorMessage(e, 'Download failed')));
  return (
    <div className="flex flex-wrap gap-2">
      {src.file && (
        <Button size={size} variant="secondary" icon={isTexOrZip(src.file.originalName) ? FileCode2 : FilePen} onClick={download}
          title={`Download ${src.file.originalName} to edit it`}>
          {/\.zip$/i.test(src.file.originalName) ? 'Source .zip' : /\.tex$/i.test(src.file.originalName) ? 'LaTeX file' : 'Word file'}
        </Button>
      )}
      {src.url && (
        <a href={src.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-subtle">
          <ExternalLink className="h-3.5 w-3.5" />{linkLabel(src.url)}
        </a>
      )}
    </div>
  );
}

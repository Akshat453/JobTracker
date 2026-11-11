import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, Eye, FilePlus2, MessagesSquare, Paperclip, Pencil, Send, Trash2, Trophy } from 'lucide-react';
import { Modal, Button, Badge, Textarea, SkeletonRows, ErrorState } from '../ui/index.js';
import { resumesApi } from '../../api/endpoints.js';
import { downloadFile, errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { fmtDate, fmtBytes, timeAgo } from '../../lib/format.js';
import { SourceActions } from './SourceFields.jsx';

const labelOf = (v) => v.version || `v${v.versionNumber || 1}`;

function Notes({ version, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await resumesApi.update(version._id, { description: draft.trim() }); setDraft(null); onSaved(); } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  };
  if (draft !== null) {
    return (
      <div className="mt-2 space-y-2">
        <Textarea rows={3} value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} aria-label={`Notes for ${labelOf(version)}`} placeholder="What changed in this version?" />
        <div className="flex gap-2">
          <Button size="xs" icon={Check} loading={saving} onClick={save}>Save notes</Button>
          <Button size="xs" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex items-start gap-1.5">
      <p className={version.description ? 'whitespace-pre-line text-sm' : 'text-sm italic text-muted'}>{version.description || 'No notes'}</p>
      <button type="button" onClick={() => setDraft(version.description || '')} className="shrink-0 rounded p-0.5 text-muted hover:bg-subtle hover:text-fg"
        aria-label={`Edit notes for ${labelOf(version)}`}><Pencil className="h-3.5 w-3.5" /></button>
    </div>
  );
}

/** Every version of one resume, newest first, with notes, files, editable sources and results. */
export function ResumeVersionsModal({ doc, onClose, onPreview, onNewVersion, onEditSource, onDelete, refreshKey }) {
  const toast = useToast();
  const [state, setState] = useState({ data: null, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!doc) return undefined;
    let live = true;
    resumesApi.get(doc._id)
      .then((d) => live && setState({ data: d.versions, error: null }))
      .catch((e) => live && setState((s) => ({ data: s.data, error: errorMessage(e) })));
    return () => { live = false; };
  }, [doc, tick, refreshKey]);
  useEffect(() => { if (!doc) setState({ data: null, error: null }); }, [doc]);

  const reload = () => setTick((t) => t + 1);
  const versions = state.data;
  const latest = versions?.[0];
  const download = (v) => downloadFile(`/resumes/${v._id}/file`, v.file.originalName, { download: 1 }).catch((e) => toast.error(errorMessage(e)));

  return (
    <Modal open={Boolean(doc)} onClose={onClose} size="lg" title={doc ? `${doc.name}: versions` : ''}
      description="Each version keeps its own file, editable source and notes, and is tied to the applications you sent it with."
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{latest && <Button icon={FilePlus2} onClick={() => onNewVersion(latest, versions)}>New version</Button>}</>}>
      {state.error && !versions ? <ErrorState message={state.error} onRetry={reload} /> : !versions ? <SkeletonRows rows={3} /> : (
        <ol className="relative space-y-4 border-l border-border pl-5">
          {versions.map((v, i) => (
            <li key={v._id} className="relative">
              <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface ${i === 0 ? 'bg-brand-500' : 'bg-border'}`} aria-hidden="true" />
              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{labelOf(v)}</span>
                  {i === 0 && <Badge tone="indigo">Latest</Badge>}
                  {v.isArchived && <Badge tone="zinc">Archived</Badge>}
                  <span className="text-xs text-muted" title={fmtDate(v.createdAt)}>{timeAgo(v.createdAt)}</span>
                </div>
                <Notes version={v} onSaved={reload} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" icon={Eye} onClick={() => onPreview(v)}>Preview</Button>
                  <Button size="sm" variant="ghost" icon={Download} onClick={() => download(v)} title={`${v.file.originalName} · ${fmtBytes(v.file.size)}`}>Download</Button>
                  <SourceActions doc={v} toast={toast} />
                  <Button size="sm" variant="ghost" icon={Paperclip} onClick={() => onEditSource(v)}>{v.source ? 'Edit source' : 'Add source'}</Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" />{v.usage.applications} applications</span>
                  <span className="inline-flex items-center gap-1"><MessagesSquare className="h-3 w-3" />{v.usage.interviews} interviews</span>
                  <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3" />{v.usage.offers} offers</span>
                  {v.usage.applications > 0 && <Link to={`/applications?resume=${v._id}`} onClick={onClose} className="link">View apps</Link>}
                  <button type="button" onClick={() => onDelete(v)} className="ml-auto inline-flex items-center gap-1 text-red-600 hover:underline dark:text-red-400"
                    aria-label={`Delete ${labelOf(v)}`}><Trash2 className="h-3 w-3" />Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileText, Eye, Download, Trash2, Pencil, Archive, ArchiveRestore, MoreHorizontal, Trophy, MessagesSquare, Send, FileType2 } from 'lucide-react';
import { resumesApi } from '../api/endpoints.js';
import { downloadFile, errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import { useLookups } from '../context/LookupsContext.jsx';
import {
  PageHeader, Button, Segmented, Badge, Menu, EmptyState, ErrorState, Skeleton, ConfirmDialog, Modal, Field, Input, Select, Textarea,
} from '../components/ui/index.js';
import { ResumeUploadModal } from '../components/resumes/ResumeUploadModal.jsx';
import { DocumentPreviewModal } from '../components/resumes/DocumentPreviewModal.jsx';
import { RESUME_CATEGORIES, DOCUMENT_KINDS } from '../lib/constants.js';
import { fmtDate, fmtBytes, cn } from '../lib/format.js';

function EditDocModal({ doc, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState(null);
  const [saving, setSaving] = useState(false);
  const cur = v || (doc && { name: doc.name, version: doc.version || '', category: doc.category || 'General', description: doc.description || '', kind: doc.kind });
  const save = async () => {
    if (!cur.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try { await resumesApi.update(doc._id, cur); toast.success('Saved'); onSaved(); setV(null); onClose(); } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  };
  if (!doc) return null;
  return (
    <Modal open onClose={() => { setV(null); onClose(); }} title="Edit document" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2"><Input value={cur.name} onChange={(e) => setV({ ...cur, name: e.target.value })} /></Field>
        <Field label="Version"><Input value={cur.version} onChange={(e) => setV({ ...cur, version: e.target.value })} /></Field>
        <Field label="Type"><Select options={DOCUMENT_KINDS} value={cur.kind} onChange={(e) => setV({ ...cur, kind: e.target.value })} /></Field>
        <Field label="Category" className="sm:col-span-2"><Select options={RESUME_CATEGORIES} value={cur.category} onChange={(e) => setV({ ...cur, category: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={3} value={cur.description} onChange={(e) => setV({ ...cur, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

const Stat = ({ icon: Icon, label, value, tone }) => (
  <div className="flex flex-col items-center rounded-lg bg-subtle/60 px-2 py-2">
    <span className={cn('flex items-center gap-1 text-base font-semibold tabular-nums', tone)}><Icon className="h-3.5 w-3.5 opacity-70" />{value}</span>
    <span className="text-[11px] text-muted">{label}</span>
  </div>
);

export default function ResumesPage() {
  const toast = useToast();
  const { refreshDocuments } = useLookups();
  const [kind, setKind] = useState('resume');
  const [archived, setArchived] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const params = { archived: String(archived), ...(kind !== 'all' ? { kind } : {}) };
  const { data, loading, error, reload } = useAsync(() => resumesApi.list(params), [kind, archived]);
  const items = data?.items || [];
  const refresh = () => { reload(); refreshDocuments(); };

  const setArchive = async (doc, value) => {
    try { await resumesApi.update(doc._id, { isArchived: value }); toast.success(value ? 'Archived' : 'Restored'); refresh(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const doDelete = async () => {
    setBusy(true);
    try {
      const res = await resumesApi.remove(toDelete._id);
      toast.success(res.message);
      setToDelete(null); refresh();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const download = (d) => downloadFile(`/resumes/${d._id}/file`, d.file.originalName, { download: 1 }).catch((e) => toast.error(errorMessage(e)));

  // Highlight the best performer by interview rate (min. 2 uses)
  const best = items.filter((d) => d.usage.applications >= 2).sort((a, b) => b.usage.interviews / b.usage.applications - a.usage.interviews / a.usage.applications)[0];

  return (
    <div>
      <PageHeader title="Resume library" description="Every resume version and supporting document, with how each one performed."
        actions={<Button icon={Upload} onClick={() => setUploading(true)}>Upload</Button>} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'resume', label: 'Resumes' }, { value: 'cover_letter', label: 'Cover letters' }, { value: 'other', label: 'Other' }, { value: 'all', label: 'All' }]} />
        <Segmented value={archived ? 'archived' : 'active'} onChange={(v) => setArchived(v === 'archived')} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
      </div>

      {error ? <ErrorState message={error} onRetry={reload} />
        : loading && !data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
          : !items.length ? (
            <div className="card">
              <EmptyState icon={FileText} title={archived ? 'Nothing archived' : 'No documents yet'}
                description={archived ? 'Archived documents appear here.' : 'Upload your resume versions so you always know which one you sent where.'}
                action={!archived && <Button icon={Upload} onClick={() => setUploading(true)}>Upload a resume</Button>} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((d) => (
                <div key={d._id} className={cn('card flex flex-col p-4 transition hover:shadow-pop', best?._id === d._id && 'ring-1 ring-emerald-500/40')}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => setPreview(d)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400">
                      {d.file.mimeType === 'application/pdf' ? <FileText className="h-5 w-5" /> : <FileType2 className="h-5 w-5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.name}</p>
                      <p className="truncate text-xs text-muted">{d.version && `${d.version} · `}{d.category}</p>
                    </div>
                    <Menu trigger={<button className="rounded-md p-1.5 text-muted hover:bg-subtle" aria-label="Document actions"><MoreHorizontal className="h-4 w-4" /></button>}
                      items={[
                        { label: 'Preview', icon: Eye, onClick: () => setPreview(d) },
                        { label: 'Download', icon: Download, onClick: () => download(d) },
                        { label: 'Edit details', icon: Pencil, onClick: () => setEditing(d) },
                        d.isArchived ? { label: 'Restore', icon: ArchiveRestore, onClick: () => setArchive(d, false) } : { label: 'Archive', icon: Archive, onClick: () => setArchive(d, true) },
                        { divider: true },
                        { label: 'Delete', icon: Trash2, danger: true, onClick: () => setToDelete(d) },
                      ]} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {kind === 'all' && <Badge>{DOCUMENT_KINDS.find((k) => k.value === d.kind)?.label}</Badge>}
                    {best?._id === d._id && <Badge tone="emerald">Best interview rate</Badge>}
                    {d.isArchived && <Badge tone="zinc">Archived</Badge>}
                  </div>
                  {d.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{d.description}</p>}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Stat icon={Send} label="Applications" value={d.usage.applications} />
                    <Stat icon={MessagesSquare} label="Interviews" value={d.usage.interviews} tone="text-violet-600 dark:text-violet-400" />
                    <Stat icon={Trophy} label="Offers" value={d.usage.offers} tone="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted">
                    <span>Uploaded {fmtDate(d.createdAt)} · {fmtBytes(d.file.size)}</span>
                    {d.usage.applications > 0 && <Link to={`/applications?resume=${d._id}`} className="link">View apps</Link>}
                  </div>
                </div>
              ))}
            </div>
          )}

      <ResumeUploadModal open={uploading} onClose={() => setUploading(false)} defaultKind={kind === 'all' ? 'resume' : kind} onUploaded={() => reload()} />
      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />
      <EditDocModal doc={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={doDelete} loading={busy}
        tone={toDelete?.usage?.applications ? 'warning' : 'danger'}
        confirmLabel={toDelete?.usage?.applications ? 'Archive instead' : 'Delete permanently'}
        title={toDelete?.usage?.applications ? 'This document is in use' : 'Delete document?'}
        message={toDelete?.usage?.applications
          ? <>“{toDelete.name}” was submitted with <b>{toDelete.usage.applications}</b> application(s). To keep that record intact it will be <b>archived</b> rather than deleted — it stays attached to those applications but is hidden from pickers.</>
          : <>“{toDelete?.name}” isn't used by any application. The file will be permanently deleted.</>} />
    </div>
  );
}

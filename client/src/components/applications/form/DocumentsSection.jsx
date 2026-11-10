import { useState } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Upload, FileText, Eye, Check, Archive } from 'lucide-react';
import { Field, Select, Button, Badge, EmptyState } from '../../ui/index.js';
import { useLookups } from '../../../context/LookupsContext.jsx';
import { ResumeUploadModal } from '../../resumes/ResumeUploadModal.jsx';
import { DocumentPreviewModal } from '../../resumes/DocumentPreviewModal.jsx';
import { fmtDate, cn } from '../../../lib/format.js';

export function DocumentsSection() {
  const { register, control, watch, setValue } = useFormContext();
  const { resumes, documents } = useLookups();
  const [uploadKind, setUploadKind] = useState(null);
  const [preview, setPreview] = useState(null);
  const resumeId = watch('resume');
  const selected = resumes.find((r) => r._id === resumeId);
  const otherDocs = documents.filter((d) => d.kind !== 'resume');

  const resumeOptions = resumes
    .filter((r) => !r.isArchived || r._id === resumeId)
    .map((r) => ({ value: r._id, label: `${r.name}${r.version ? ` (${r.version})` : ''} · ${r.category}${r.isArchived ? ' — archived' : ''}` }));

  return (
    <div className="space-y-6">
      <div>
        <Field label="Resume submitted" hint="The exact version is saved with this application, even if you later archive it.">
          <div className="flex gap-2">
            <Select className="flex-1" placeholder="No resume selected" options={resumeOptions} {...register('resume')} />
            <Button variant="secondary" icon={Upload} onClick={() => setUploadKind('resume')}>Upload new</Button>
          </div>
        </Field>
        {selected && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-subtle/40 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"><FileText className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{selected.name} {selected.version && <span className="text-muted">· {selected.version}</span>}</p>
              <p className="truncate text-xs text-muted">{selected.category} · uploaded {fmtDate(selected.createdAt)} · used in {selected.usage?.applications ?? 0} applications</p>
            </div>
            {selected.isArchived && <Badge tone="zinc"><Archive className="h-3 w-3" />Archived</Badge>}
            <Button size="sm" variant="ghost" icon={Eye} onClick={() => setPreview(selected)}>Preview</Button>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">Cover letters & supporting documents</span>
          <Button size="xs" variant="ghost" icon={Upload} onClick={() => setUploadKind('cover_letter')}>Upload</Button>
        </div>
        {otherDocs.length ? (
          <Controller control={control} name="documents" render={({ field }) => (
            <div className="grid gap-2 sm:grid-cols-2">
              {otherDocs.filter((d) => !d.isArchived || field.value.includes(d._id)).map((d) => {
                const on = field.value.includes(d._id);
                return (
                  <button type="button" key={d._id}
                    onClick={() => field.onChange(on ? field.value.filter((x) => x !== d._id) : [...field.value, d._id])}
                    className={cn('flex items-center gap-3 rounded-lg border p-2.5 text-left transition',
                      on ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10' : 'border-border hover:bg-subtle/50')}>
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-border')}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{d.name}{d.version ? ` (${d.version})` : ''}</span>
                      <span className="block text-xs text-muted">{d.kind === 'cover_letter' ? 'Cover letter' : 'Document'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )} />
        ) : (
          <div className="rounded-lg border border-dashed border-border">
            <EmptyState icon={FileText} title="No other documents" description="Upload cover letters, portfolios or transcripts to attach them." className="py-6" />
          </div>
        )}
      </div>

      <ResumeUploadModal open={!!uploadKind} defaultKind={uploadKind || 'resume'} onClose={() => setUploadKind(null)}
        onUploaded={(doc) => {
          if (doc.kind === 'resume') setValue('resume', doc._id, { shouldDirty: true });
          else setValue('documents', [...watch('documents'), doc._id], { shouldDirty: true });
        }} />
      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

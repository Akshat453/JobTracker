import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Plus, Upload } from 'lucide-react';
import { Field, Input, Select, Textarea, Button } from '../../ui/index.js';
import { useLookups } from '../../../context/LookupsContext.jsx';
import { ResumeUploadModal } from '../../resumes/ResumeUploadModal.jsx';
import { STATUSES, SOURCES } from '../../../lib/constants.js';
import { urlRule } from './formUtils.js';
import { QuickAddEmail } from './EmailSection.jsx';

/** Form fields shown in quick-add mode (used to route validation errors to the right view). */
export const QUICK_FIELDS = new Set(['company', 'jobTitle', 'jobPostingUrl', 'jobId', 'status', 'applicationDate', 'source', 'resume', 'emailUsed', 'notes']);

/**
 * The essentials on one screen. Uses the same field names as the full form, so switching between
 * quick and full mode keeps everything typed so far.
 */
export function QuickSection() {
  const { register, watch, setValue, formState: { errors: e } } = useFormContext();
  const { resumes, emailAccounts } = useLookups();
  const [uploading, setUploading] = useState(false);
  const [addingEmail, setAddingEmail] = useState(false);
  const resumeId = watch('resume');
  const accountId = watch('emailUsed.account');
  const isSaved = watch('status') === 'saved';

  const resumeOptions = resumes
    .filter((r) => !r.isArchived || r._id === resumeId)
    .map((r) => ({ value: r._id, label: `${r.name}${r.version ? ` (${r.version})` : ''}` }));
  const emailOptions = emailAccounts
    .filter((a) => !a.isArchived || a._id === accountId)
    .map((a) => ({ value: a._id, label: `${a.email}${a.isDefault ? ' (default)' : ''}` }));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name" required error={e.company?.name?.message}>
        <Input autoFocus placeholder="Acme Inc." error={e.company?.name} {...register('company.name', { required: 'Company name is required' })} />
      </Field>
      <Field label="Job title" required error={e.jobTitle?.message}>
        <Input placeholder="Software Engineer" error={e.jobTitle} {...register('jobTitle', { required: 'Job title is required' })} />
      </Field>
      <Field label="Company website" error={e.company?.website?.message}>
        <Input placeholder="acme.com" error={e.company?.website} {...register('company.website', urlRule)} />
      </Field>
      <Field label="Job posting URL" error={e.jobPostingUrl?.message}>
        <Input placeholder="https://…" error={e.jobPostingUrl} {...register('jobPostingUrl', urlRule)} />
      </Field>
      <Field label="Job ID"><Input placeholder="REQ-1234" {...register('jobId')} /></Field>
      <Field label="Found on"><Select options={SOURCES} {...register('source')} /></Field>

      <Field label="Status" hint={isSaved ? 'Interested, not applied yet. Change it to Applied when you apply.' : undefined}>
        <Select options={STATUSES.map((s) => ({ value: s.value, label: s.label }))} {...register('status')} />
      </Field>
      <Field label={isSaved ? 'Date added' : 'Application date'}><Input type="date" {...register('applicationDate')} /></Field>

      <Field label="Resume used" className="sm:col-span-2">
        <div className="flex gap-2">
          <Select className="flex-1" placeholder="No resume selected" options={resumeOptions} {...register('resume')} />
          <Button variant="secondary" icon={Upload} onClick={() => setUploading(true)}>Upload</Button>
        </div>
      </Field>
      <Field label="Applied with email" className="sm:col-span-2">
        <div className="flex gap-2">
          <Select className="flex-1" placeholder="Not recorded" options={emailOptions}
            {...register('emailUsed.account', {
              onChange: (ev) => {
                const acc = emailAccounts.find((a) => a._id === ev.target.value);
                if (acc) setValue('emailUsed.provider', acc.provider);
              },
            })} />
          <Button variant="secondary" icon={Plus} onClick={() => setAddingEmail(true)}>New</Button>
        </div>
      </Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} placeholder="Optional" {...register('notes')} /></Field>

      <ResumeUploadModal open={uploading} defaultKind="resume" onClose={() => setUploading(false)}
        onUploaded={(doc) => { if (doc.kind === 'resume') setValue('resume', doc._id, { shouldDirty: true }); }} />
      <QuickAddEmail open={addingEmail} onClose={() => setAddingEmail(false)}
        onCreated={(acc) => { setValue('emailUsed.account', acc._id, { shouldDirty: true }); setValue('emailUsed.provider', acc.provider); }} />
    </div>
  );
}

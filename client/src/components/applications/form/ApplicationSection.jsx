import { useFormContext } from 'react-hook-form';
import { Field, Input, Select, Textarea } from '../../ui/index.js';
import { STATUSES, SOURCES, PRIORITIES } from '../../../lib/constants.js';
import { urlRule } from './formUtils.js';

export function ApplicationSection({ isEdit, originalStatus }) {
  const { register, watch, formState: { errors: e } } = useFormContext();
  const status = watch('status');
  const statusChanged = isEdit && status !== originalStatus;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Application date" error={e.applicationDate?.message}>
        <Input type="date" error={e.applicationDate} {...register('applicationDate', { required: 'Application date is required' })} />
      </Field>
      <Field label="Current status">
        <Select options={STATUSES.map((s) => ({ value: s.value, label: s.label }))} {...register('status')} />
      </Field>
      {statusChanged && (
        <Field label="Status change note" className="sm:col-span-2" hint="Saved in the status history timeline.">
          <Input placeholder="e.g. Recruiter called to schedule round 1" {...register('statusNote')} />
        </Field>
      )}
      <Field label="Application source"><Select options={SOURCES} {...register('source')} /></Field>
      <Field label="Priority"><Select options={PRIORITIES} {...register('priority')} /></Field>
      <Field label="Application link" error={e.applicationLink?.message} hint="Portal / tracking link, if different from the posting.">
        <Input placeholder="https://…" error={e.applicationLink} {...register('applicationLink', urlRule)} />
      </Field>
      <Field label="Application deadline"><Input type="date" {...register('deadline')} /></Field>
      <Field label="Next follow-up date" hint="Creates a follow-up reminder automatically.">
        <Input type="date" {...register('nextFollowUpDate')} />
      </Field>
      <Field label="Date of last update" hint="Leave empty to use today.">
        <Input type="date" {...register('lastUpdateDate')} />
      </Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={4} {...register('notes')} /></Field>
    </div>
  );
}

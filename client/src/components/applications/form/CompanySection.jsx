import { useFormContext } from 'react-hook-form';
import { Field, Input, Select, Textarea } from '../../ui/index.js';
import { EMPLOYMENT_TYPES, WORK_MODES, CURRENCIES } from '../../../lib/constants.js';
import { urlRule } from './formUtils.js';

export function CompanySection() {
  const { register, formState: { errors } } = useFormContext();
  const e = errors;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name" required error={e.company?.name?.message}>
        <Input placeholder="Acme Inc." error={e.company?.name} {...register('company.name', { required: 'Company name is required' })} />
      </Field>
      <Field label="Job title / position" required error={e.jobTitle?.message}>
        <Input placeholder="Software Engineer" error={e.jobTitle} {...register('jobTitle', { required: 'Job title is required' })} />
      </Field>
      <Field label="Company website" error={e.company?.website?.message}>
        <Input placeholder="acme.com" error={e.company?.website} {...register('company.website', urlRule)} />
      </Field>
      <Field label="Company location"><Input placeholder="Bengaluru, India" {...register('company.location')} /></Field>
      <Field label="Job posting URL" error={e.jobPostingUrl?.message}>
        <Input placeholder="https://…" error={e.jobPostingUrl} {...register('jobPostingUrl', urlRule)} />
      </Field>
      <Field label="Job ID / requisition ID"><Input placeholder="REQ-1234" {...register('jobId')} /></Field>
      <Field label="Department"><Input placeholder="Engineering" {...register('department')} /></Field>
      <Field label="Industry"><Input placeholder="Fintech" {...register('industry')} /></Field>
      <Field label="Employment type"><Select options={EMPLOYMENT_TYPES} {...register('employmentType')} /></Field>
      <Field label="Work mode"><Select placeholder="Select…" options={WORK_MODES} {...register('workMode')} /></Field>

      <Field label="Salary range" error={e.salary?.max?.message || e.salary?.min?.message} className="sm:col-span-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input type="number" min="0" placeholder="Min" error={e.salary?.min} {...register('salary.min', { min: { value: 0, message: 'Must be positive' } })} />
          <Input type="number" min="0" placeholder="Max" error={e.salary?.max}
            {...register('salary.max', {
              min: { value: 0, message: 'Must be positive' },
              validate: (v, all) => !v || !all.salary.min || Number(v) >= Number(all.salary.min) || 'Max must be ≥ min',
            })} />
          <Select options={CURRENCIES} aria-label="Currency" {...register('salary.currency')} />
          <Select aria-label="Pay period" options={[{ value: 'year', label: 'per year' }, { value: 'month', label: 'per month' }, { value: 'hour', label: 'per hour' }]} {...register('salary.period')} />
        </div>
      </Field>
      <Field label="Experience required"><Input placeholder="0–2 years" {...register('experienceRequired')} /></Field>
      <div className="hidden sm:block" />
      <Field label="Job description" className="sm:col-span-2" hint="Paste the full description — useful later when preparing for interviews.">
        <Textarea rows={6} {...register('jobDescription')} />
      </Field>
    </div>
  );
}

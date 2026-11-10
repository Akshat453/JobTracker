import { useFormContext, Controller } from 'react-hook-form';
import { Field, Input, Textarea, YesNo } from '../../ui/index.js';
import { urlRule, emailRule } from './formUtils.js';

export function PeopleSection() {
  const { register, control, watch, formState: { errors: e } } = useFormContext();
  const referred = watch('referral.received');
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Recruiter</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recruiter name"><Input {...register('recruiter.name')} /></Field>
          <Field label="Recruiter email" error={e.recruiter?.email?.message}>
            <Input type="email" error={e.recruiter?.email} {...register('recruiter.email', emailRule)} />
          </Field>
          <Field label="LinkedIn URL" error={e.recruiter?.linkedinUrl?.message}>
            <Input placeholder="linkedin.com/in/…" error={e.recruiter?.linkedinUrl} {...register('recruiter.linkedinUrl', urlRule)} />
          </Field>
          <Field label="Phone number" error={e.recruiter?.phone?.message}>
            <Input type="tel" error={e.recruiter?.phone} {...register('recruiter.phone', { pattern: { value: /^[+\d][\d\s()-]{5,}$/, message: 'Enter a valid phone number' } })} />
          </Field>
        </div>
      </div>
      <div className="border-t border-border pt-6">
        <h3 className="mb-3 text-sm font-semibold">Referral</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Referral received?" className="sm:col-span-2">
            <Controller control={control} name="referral.received" render={({ field }) => <YesNo value={field.value} onChange={field.onChange} />} />
          </Field>
          {referred && (
            <>
              <Field label="Referrer's name"><Input {...register('referral.name')} /></Field>
              <Field label="Referrer's contact"><Input placeholder="Email, phone or LinkedIn" {...register('referral.contact')} /></Field>
            </>
          )}
          <Field label="Additional notes" className="sm:col-span-2"><Textarea rows={3} {...register('referral.notes')} /></Field>
        </div>
      </div>
    </div>
  );
}

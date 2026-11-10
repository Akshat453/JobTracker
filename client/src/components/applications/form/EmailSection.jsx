import { useState } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { Field, Input, Select, Textarea, YesNo, Button, Modal } from '../../ui/index.js';
import { EMAIL_PROVIDERS } from '../../../lib/constants.js';
import { useLookups } from '../../../context/LookupsContext.jsx';
import { emailAccountsApi } from '../../../api/endpoints.js';
import { errorMessage } from '../../../api/client.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { emailRule, EMAIL_RX } from './formUtils.js';

function QuickAddEmail({ open, onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();
  const { refreshEmails } = useLookups();
  const save = async () => {
    if (!EMAIL_RX.test(email)) return setErr('Enter a valid email');
    setSaving(true);
    try {
      const { account } = await emailAccountsApi.create({ email });
      await refreshEmails();
      toast.success('Email account saved');
      onCreated(account);
      setEmail(''); onClose();
    } catch (e) { setErr(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add email account" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
      <Field label="Email address" error={err}>
        <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())} placeholder="you@gmail.com" />
      </Field>
    </Modal>
  );
}

export function EmailSection() {
  const { register, control, watch, setValue, formState: { errors: e } } = useFormContext();
  const { emailAccounts } = useLookups();
  const [adding, setAdding] = useState(false);
  const accountId = watch('emailUsed.account');
  const confirmed = watch('emailUsed.confirmationReceived');
  const options = emailAccounts
    .filter((a) => !a.isArchived || a._id === accountId)
    .map((a) => ({ value: a._id, label: `${a.email}${a.label ? ` · ${a.label}` : ''}${a.isDefault ? ' (default)' : ''}${a.isArchived ? ' (archived)' : ''}` }));
  const selected = emailAccounts.find((a) => a._id === accountId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Email address used to apply" className="sm:col-span-2"
        hint={selected ? `Provider: ${selected.provider}` : 'Pick a saved account, or choose “Other” to type an address.'}>
        <div className="flex gap-2">
          <Select className="flex-1" placeholder="Other / not saved" options={options}
            {...register('emailUsed.account', {
              onChange: (ev) => {
                const acc = emailAccounts.find((a) => a._id === ev.target.value);
                if (acc) setValue('emailUsed.provider', acc.provider);
              },
            })} />
          <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>New</Button>
        </div>
      </Field>
      {!accountId && (
        <Field label="Email address (manual)" error={e.emailUsed?.address?.message}>
          <Input type="email" placeholder="you@example.com" error={e.emailUsed?.address} {...register('emailUsed.address', emailRule)} />
        </Field>
      )}
      <Field label="Email provider"><Select placeholder="Select…" options={EMAIL_PROVIDERS} {...register('emailUsed.provider')} /></Field>
      <Field label="Confirmation email received?">
        <Controller control={control} name="emailUsed.confirmationReceived" render={({ field }) => <YesNo value={field.value} onChange={field.onChange} />} />
      </Field>
      {confirmed && (
        <>
          <Field label="Confirmation email date"><Input type="date" {...register('emailUsed.confirmationDate')} /></Field>
          <Field label="Email subject" className="sm:col-span-2"><Input placeholder="Thank you for applying to…" {...register('emailUsed.subject')} /></Field>
        </>
      )}
      <Field label="Recruiter email address" error={e.emailUsed?.recruiterEmail?.message}>
        <Input type="email" placeholder="talent@company.com" error={e.emailUsed?.recruiterEmail} {...register('emailUsed.recruiterEmail', emailRule)} />
      </Field>
      <Field label="Additional email notes" className="sm:col-span-2"><Textarea rows={3} {...register('emailUsed.notes')} /></Field>
      <QuickAddEmail open={adding} onClose={() => setAdding(false)} onCreated={(acc) => { setValue('emailUsed.account', acc._id, { shouldDirty: true }); setValue('emailUsed.provider', acc.provider); }} />
    </div>
  );
}

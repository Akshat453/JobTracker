import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, Mail, Star, Pencil, Trash2, MoreHorizontal, Archive, ArchiveRestore, Plug } from 'lucide-react';
import { emailAccountsApi } from '../api/endpoints.js';
import { errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useResetOnOpen } from '../hooks/useResetOnOpen.js';
import { useToast } from '../context/ToastContext.jsx';
import { useLookups } from '../context/LookupsContext.jsx';
import {
  PageHeader, Button, Badge, Menu, EmptyState, ErrorState, SkeletonRows, ConfirmDialog, Modal, Field, Input, Select, Textarea, Toggle, Segmented,
} from '../components/ui/index.js';
import { EMAIL_PROVIDERS } from '../lib/constants.js';
import { EMAIL_RX } from '../components/applications/form/formUtils.js';
import { cn } from '../lib/format.js';

const PROVIDER_STYLE = { Gmail: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400', Outlook: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400', Other: 'bg-subtle text-muted' };

function AccountModal({ open, account, onClose, onSaved }) {
  const toast = useToast();
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm();
  useResetOnOpen(open, () => reset(account
    ? { email: account.email, provider: account.provider, label: account.label || '', notes: account.notes || '', isDefault: account.isDefault }
    : { email: '', provider: '', label: '', notes: '', isDefault: false }));
  const close = onClose;
  const onSubmit = async (v) => {
    try {
      if (account) await emailAccountsApi.update(account._id, v); else await emailAccountsApi.create(v);
      toast.success(account ? 'Email account updated' : 'Email account added');
      onSaved(); close();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Modal open={open} onClose={close} title={account ? 'Edit email account' : 'Add email account'} size="md"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>Save</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Email address" required error={errors.email?.message} className="sm:col-span-2">
          <Input type="email" placeholder="you@gmail.com" error={errors.email}
            {...register('email', { required: 'Email is required', pattern: { value: EMAIL_RX, message: 'Enter a valid email' } })} />
        </Field>
        <Field label="Provider" hint="Detected automatically if left blank"><Select placeholder="Auto-detect" options={EMAIL_PROVIDERS} {...register('provider')} /></Field>
        <Field label="Label"><Input placeholder="Personal, College…" {...register('label')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
        <div className="sm:col-span-2"><Toggle checked={watch('isDefault')} onChange={(v) => setValue('isDefault', v)} label="Default account" description="Pre-selected when you add a new application." /></div>
      </form>
    </Modal>
  );
}

export default function EmailAccountsPage() {
  const toast = useToast();
  const { refreshEmails } = useLookups();
  const [archived, setArchived] = useState(false);
  const { data, loading, error, reload } = useAsync(() => emailAccountsApi.list({ archived: String(archived) }), [archived], { cacheKey: `emails:${archived}` });
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = data?.items || [];
  const refresh = () => { reload(); refreshEmails(); };

  const update = async (a, body, msg) => {
    try { await emailAccountsApi.update(a._id, body); toast.success(msg); refresh(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const doDelete = async () => {
    setBusy(true);
    try { const r = await emailAccountsApi.remove(toDelete._id); toast.success(r.message); setToDelete(null); refresh(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Email accounts" description="Record which address you used for each application."
        actions={<Button icon={Plus} onClick={() => setModal({})}>Add email</Button>} />
      <div className="mb-4">
        <Segmented value={archived ? 'archived' : 'active'} onChange={(v) => setArchived(v === 'archived')} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
      </div>

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <div className="card overflow-hidden">
          {loading && !data ? <SkeletonRows className="p-5" rows={3} /> : !items.length ? (
            <EmptyState icon={Mail} title={archived ? 'No archived accounts' : 'No email accounts yet'}
              description="Add the addresses you apply from — personal, college, work."
              action={!archived && <Button icon={Plus} onClick={() => setModal({})}>Add email</Button>} />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((a) => (
                <li key={a._id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', PROVIDER_STYLE[a.provider])}><Mail className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{a.email}</span>
                      {a.isDefault && <Badge tone="indigo"><Star className="h-3 w-3" />Default</Badge>}
                      {a.label && <Badge>{a.label}</Badge>}
                    </div>
                    <p className="text-xs text-muted">{a.provider}{a.notes ? ` · ${a.notes}` : ''}</p>
                  </div>
                  <Link to={`/applications?emailAccount=${a._id}`} className="text-right hover:text-brand-600">
                    <p className="text-lg font-semibold tabular-nums">{a.applicationCount}</p>
                    <p className="text-xs text-muted">applications</p>
                  </Link>
                  <Menu trigger={<button className="rounded-md p-1.5 text-muted hover:bg-subtle" aria-label="Account actions"><MoreHorizontal className="h-4 w-4" /></button>}
                    items={[
                      { label: 'Edit', icon: Pencil, onClick: () => setModal({ account: a }) },
                      !a.isDefault && !a.isArchived && { label: 'Set as default', icon: Star, onClick: () => update(a, { isDefault: true }, 'Default updated') },
                      a.isArchived ? { label: 'Restore', icon: ArchiveRestore, onClick: () => update(a, { isArchived: false }, 'Restored') } : null,
                      { divider: true },
                      { label: a.applicationCount ? 'Archive' : 'Remove', icon: a.applicationCount ? Archive : Trash2, danger: true, onClick: () => setToDelete(a) },
                    ]} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
        <Plug className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Email tracking is manual — nothing here needs access to your inbox. The data model already reserves an <code className="rounded bg-subtle px-1">integration</code> field per account so Gmail/Outlook OAuth sync can be added later without migrating data.</p>
      </div>

      <AccountModal open={!!modal} account={modal?.account} onClose={() => setModal(null)} onSaved={refresh} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={doDelete} loading={busy}
        tone={toDelete?.applicationCount ? 'warning' : 'danger'}
        confirmLabel={toDelete?.applicationCount ? 'Archive' : 'Remove'}
        title={toDelete?.applicationCount ? 'Archive this email account?' : 'Remove email account?'}
        message={toDelete?.applicationCount
          ? <><b>{toDelete.email}</b> is linked to {toDelete.applicationCount} application(s). It will be archived so those records still show which email you used.</>
          : <><b>{toDelete?.email}</b> isn't used by any application and will be removed.</>} />
    </div>
  );
}

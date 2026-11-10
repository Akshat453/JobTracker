import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import {
  Building2, ClipboardList, Mail, FileText, Users, CalendarClock, Sparkles, ArrowLeft, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { applicationsApi } from '../api/endpoints.js';
import { errorMessage } from '../api/client.js';
import { useLookups } from '../context/LookupsContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { Button, Tabs, Skeleton, ErrorState, ConfirmDialog } from '../components/ui/index.js';
import { defaultValues, toForm, toPayload, FIELD_TAB } from '../components/applications/form/formUtils.js';
import { CompanySection } from '../components/applications/form/CompanySection.jsx';
import { ApplicationSection } from '../components/applications/form/ApplicationSection.jsx';
import { EmailSection } from '../components/applications/form/EmailSection.jsx';
import { DocumentsSection } from '../components/applications/form/DocumentsSection.jsx';
import { PeopleSection } from '../components/applications/form/PeopleSection.jsx';
import { InterviewsSection } from '../components/applications/form/InterviewsSection.jsx';
import { AdditionalSection } from '../components/applications/form/AdditionalSection.jsx';

const TABS = [
  { value: 'job', label: 'Company & Job', icon: Building2 },
  { value: 'application', label: 'Application', icon: ClipboardList },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'documents', label: 'Resume & Docs', icon: FileText },
  { value: 'people', label: 'Recruiter & Referral', icon: Users },
  { value: 'interviews', label: 'Interviews', icon: CalendarClock },
  { value: 'more', label: 'Additional', icon: Sparkles },
];

export default function ApplicationFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { defaultEmailAccount } = useLookups();
  const [tab, setTab] = useState('job');
  const [duplicate, setDuplicate] = useState(null); // { id, payload, message }
  const [forcing, setForcing] = useState(false);

  const existing = useAsync(() => (isEdit ? applicationsApi.get(id).then((r) => r.application) : Promise.resolve(null)), [id]);
  const { data: tagData } = useAsync(() => applicationsApi.tags(), []);

  const form = useForm({ defaultValues: defaultValues({ defaultEmail: defaultEmailAccount }), mode: 'onTouched' });
  const { handleSubmit, reset, getValues, setValue, formState: { errors, isSubmitting, isDirty } } = form;

  // Edit: load the record before paint so nothing typed can be overwritten.
  useLayoutEffect(() => {
    if (isEdit && existing.data) reset(toForm(existing.data));
  }, [isEdit, existing.data, reset]);

  // Create: if email accounts finish loading after mount, pre-select the default
  // without touching anything the user has already entered.
  useEffect(() => {
    if (isEdit || !defaultEmailAccount || getValues('emailUsed.account')) return;
    setValue('emailUsed.account', defaultEmailAccount._id);
    setValue('emailUsed.provider', defaultEmailAccount.provider);
  }, [isEdit, defaultEmailAccount, getValues, setValue]);

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!isDirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [isDirty]);

  const tabErrors = useMemo(() => new Set(Object.keys(errors).map((k) => FIELD_TAB[k])), [errors]);

  const save = async (payload, force = false) => {
    const res = isEdit ? await applicationsApi.update(id, payload) : await applicationsApi.create(payload, { force });
    toast.success(isEdit ? 'Application updated' : 'Application added');
    reset(toForm(res.application)); // clears dirty state
    navigate(`/applications/${res.application._id}`);
  };

  const onSubmit = async (values) => {
    const payload = toPayload(values, { isEdit, originalStatus: existing.data?.status });
    try {
      await save(payload);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.error?.details?.duplicateId) {
        setDuplicate({ id: err.response.data.error.details.duplicateId, payload, message: errorMessage(err) });
      } else {
        toast.error(errorMessage(err, 'Could not save application'));
      }
    }
  };

  const onInvalid = (errs) => {
    const first = TABS.find((t) => Object.keys(errs).some((k) => FIELD_TAB[k] === t.value));
    if (first) setTab(first.value);
    toast.error('Please fix the highlighted fields');
  };

  const idx = TABS.findIndex((t) => t.value === tab);

  if (isEdit && existing.loading && !existing.data) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-[480px] rounded-xl" /></div>;
  }
  if (isEdit && existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="mx-auto max-w-4xl">
        <Link to={isEdit ? `/applications/${id}` : '/applications'} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{isEdit ? `Edit · ${existing.data?.company?.name}` : 'New application'}</h1>
            <p className="mt-1 text-sm text-muted">Only company and job title are required — fill in the rest as you go.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{isEdit ? 'Save changes' : 'Save application'}</Button>
          </div>
        </div>

        <div className="card">
          <Tabs className="px-3" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, error: tabErrors.has(t.value) }))} />
          <div className="p-5 sm:p-6">
            {/* Sections stay mounted so values and validation persist across tabs */}
            <div hidden={tab !== 'job'}><CompanySection /></div>
            <div hidden={tab !== 'application'}><ApplicationSection isEdit={isEdit} originalStatus={existing.data?.status} /></div>
            <div hidden={tab !== 'email'}><EmailSection /></div>
            <div hidden={tab !== 'documents'}><DocumentsSection /></div>
            <div hidden={tab !== 'people'}><PeopleSection /></div>
            <div hidden={tab !== 'interviews'}><InterviewsSection /></div>
            <div hidden={tab !== 'more'}><AdditionalSection tagSuggestions={tagData?.tags} /></div>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={idx === 0} onClick={() => setTab(TABS[idx - 1].value)}>Previous</Button>
            <span className="text-xs text-muted">Step {idx + 1} of {TABS.length}</span>
            {idx < TABS.length - 1
              ? <Button variant="ghost" size="sm" onClick={() => setTab(TABS[idx + 1].value)}>Next <ChevronRight className="h-4 w-4" /></Button>
              : <Button size="sm" type="submit" loading={isSubmitting}>Save</Button>}
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={!!duplicate} tone="warning" title="Possible duplicate"
        message={<>{duplicate?.message}. <Link className="link" to={`/applications/${duplicate?.id}`}>View existing</Link> or save this one anyway?</>}
        confirmLabel="Save anyway" loading={forcing}
        onClose={() => setDuplicate(null)}
        onConfirm={async () => {
          setForcing(true);
          try { await save(duplicate.payload, true); } catch (e) { toast.error(errorMessage(e)); } finally { setForcing(false); setDuplicate(null); }
        }}
      />
    </FormProvider>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams, useOutletContext } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Copy, Trash2, ExternalLink, Globe, MapPin, Mail, FileText, Eye, Download, Plus, Video,
  CheckCircle2, Circle, Bell, CalendarClock, MoreHorizontal, Send, Zap, Users, Archive,
} from 'lucide-react';
import { applicationsApi, interviewsApi, remindersApi } from '../api/endpoints.js';
import { downloadFile, errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useApplicationActions } from '../hooks/useApplicationActions.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  Card, Button, Badge, PriorityBadge, CompanyLogo, DefinitionList, Skeleton, ErrorState, EmptyState, Menu, Modal,
  Field, Input, Select, Textarea, ConfirmDialog, Tabs,
} from '../components/ui/index.js';
import { StatusMenu } from '../components/applications/StatusMenu.jsx';
import { StatusTimeline, ActivityTimeline } from '../components/applications/Timeline.jsx';
import { InterviewFormModal } from '../components/interviews/InterviewFormModal.jsx';
import { ReminderFormModal } from '../components/reminders/ReminderFormModal.jsx';
import { DocumentPreviewModal } from '../components/resumes/DocumentPreviewModal.jsx';
import {
  fmtDate, fmtShort, fmtDateTime, fmtTime, fmtSalary, relativeDay, isOverdue, toDateInput, cn,
} from '../lib/format.js';
import { PRIORITIES } from '../lib/constants.js';

const ExtLink = ({ href, children }) => (href ? <a href={href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 break-all">{children || href}<ExternalLink className="h-3 w-3 shrink-0" /></a> : null);
const RESULT_TONE = { Passed: 'green', Failed: 'red', Pending: 'amber', 'N/A': 'zinc' };
const IV_STATUS_TONE = { Scheduled: 'violet', Completed: 'green', Rescheduled: 'amber', Cancelled: 'zinc' };

function QuickEditModal({ app, open, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [saving, setSaving] = useState(false);
  const val = (k, d) => (k in v ? v[k] : d);
  const save = async () => {
    setSaving(true);
    try {
      const { application } = await applicationsApi.update(app._id, v);
      toast.success('Saved');
      onSaved(application); setV({}); onClose();
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={() => { setV({}); onClose(); }} title="Quick edit" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save} disabled={!Object.keys(v).length}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priority"><Select options={PRIORITIES} value={val('priority', app.priority)} onChange={(e) => setV({ ...v, priority: e.target.value })} /></Field>
        <Field label="Next follow-up"><Input type="date" value={val('nextFollowUpDate', toDateInput(app.nextFollowUpDate))} onChange={(e) => setV({ ...v, nextFollowUpDate: e.target.value })} /></Field>
        <Field label="Deadline"><Input type="date" value={val('deadline', toDateInput(app.deadline))} onChange={(e) => setV({ ...v, deadline: e.target.value })} /></Field>
        <Field label="Recruiter email"><Input type="email" value={val('recruiter', app.recruiter)?.email || ''} onChange={(e) => setV({ ...v, recruiter: { ...(v.recruiter || {}), email: e.target.value } })} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={4} value={val('notes', app.notes || '')} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshReminders } = useOutletContext() || {};
  const { data: app, loading, error, reload, setData } = useAsync(() => applicationsApi.get(id).then((r) => r.application), [id]);
  const [ivModal, setIvModal] = useState(null); // {interview?}
  const [remModal, setRemModal] = useState(null);
  const [preview, setPreview] = useState(null);
  const [quickEdit, setQuickEdit] = useState(false);
  const [ivDelete, setIvDelete] = useState(null);
  const [note, setNote] = useState('');
  const [sideTab, setSideTab] = useState('status');

  const actions = useApplicationActions({
    onChange: (kind, payload) => {
      if (kind === 'delete') navigate('/applications');
      if (kind === 'status') { setData((a) => ({ ...a, status: payload.status })); setTimeout(reload, 300); }
    },
  });

  if (loading && !app) return <div className="space-y-4"><Skeleton className="h-20 rounded-xl" /><div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-96 rounded-xl lg:col-span-2" /><Skeleton className="h-96 rounded-xl" /></div></div>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!app) return null;

  const resume = app.resume;
  const snap = app.resumeSnapshot;
  const posting = app.jobPostingUrl || app.applicationLink;
  const openReminders = app.reminders.filter((r) => !r.completed);
  const doneReminders = app.reminders.filter((r) => r.completed);

  const toggleReminder = async (r) => {
    try {
      await remindersApi.update(r._id, { completed: !r.completed });
      reload(); refreshReminders?.();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    try {
      const { activity } = await applicationsApi.addNote(app._id, note.trim());
      setData((a) => ({ ...a, activity }));
      setNote('');
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const deleteInterview = async () => {
    try { await interviewsApi.remove(ivDelete._id); toast.success('Interview removed'); setIvDelete(null); reload(); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div>
      <Link to="/applications" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Applications</Link>

      {/* Header */}
      <div className="card mb-6 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <CompanyLogo name={app.company.name} website={app.company.website} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{app.jobTitle}</h1>
              <PriorityBadge priority={app.priority} />
            </div>
            <p className="mt-0.5 text-muted">{app.company.name}{app.department ? ` · ${app.department}` : ''}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <StatusMenu status={app.status} onChange={(s) => actions.setStatus(app, s)} />
              {app.company.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{app.company.location}</span>}
              {app.employmentType && <span>{app.employmentType}{app.workMode ? ` · ${app.workMode}` : ''}</span>}
              <span className="inline-flex items-center gap-1"><Send className="h-3.5 w-3.5" />Applied {fmtDate(app.applicationDate)} via {app.source}</span>
              {app.company.website && <ExtLink href={app.company.website}><Globe className="h-3.5 w-3.5" />Website</ExtLink>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {posting && <Button variant="secondary" icon={ExternalLink} onClick={() => window.open(posting, '_blank', 'noopener,noreferrer')}>Job posting</Button>}
            <Button variant="secondary" icon={Zap} onClick={() => setQuickEdit(true)}>Quick edit</Button>
            <Button icon={Pencil} onClick={() => navigate(`/applications/${app._id}/edit`)}>Edit</Button>
            <Menu trigger={<Button variant="secondary" size="icon" aria-label="More"><MoreHorizontal className="h-4 w-4" /></Button>}
              items={[
                { label: 'Duplicate', icon: Copy, onClick: () => actions.duplicate(app) },
                { label: 'Add reminder', icon: Bell, onClick: () => setRemModal({}) },
                { divider: true },
                { label: 'Delete application', icon: Trash2, danger: true, onClick: () => actions.remove(app) },
              ]} />
          </div>
        </div>
        {app.nextFollowUpDate && (
          <div className={cn('mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm', isOverdue(app.nextFollowUpDate) ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300')}>
            <CalendarClock className="h-4 w-4" />Next follow-up: <b>{fmtDate(app.nextFollowUpDate)}</b> ({relativeDay(app.nextFollowUpDate)})
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Submission summary: answers "which email / which resume" at a glance */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted"><Mail className="h-3.5 w-3.5" />Email used</div>
              {app.emailUsed?.address ? (
                <>
                  <p className="mt-1.5 truncate font-medium">{app.emailUsed.address}</p>
                  <p className="text-xs text-muted">
                    {app.emailUsed.provider || 'Unknown provider'}{app.emailUsed.account?.label ? ` · ${app.emailUsed.account.label}` : ''}
                    {' · '}{app.emailUsed.confirmationReceived ? <span className="text-emerald-600 dark:text-emerald-400">Confirmation received{app.emailUsed.confirmationDate ? ` ${fmtShort(app.emailUsed.confirmationDate)}` : ''}</span> : 'No confirmation yet'}
                  </p>
                </>
              ) : <p className="mt-1.5 text-sm text-muted">Not recorded — <Link className="link" to={`/applications/${app._id}/edit`}>add it</Link></p>}
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted"><FileText className="h-3.5 w-3.5" />Resume submitted</div>
              {resume || snap?.name ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{snap?.name || resume.name}{(snap?.version || resume?.version) && <span className="text-muted"> · {snap?.version || resume.version}</span>}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted">
                      {snap?.category || resume?.category}{resume?.isArchived && <><span>·</span><Archive className="h-3 w-3" />archived</>}
                    </p>
                  </div>
                  {resume && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => setPreview(resume)} aria-label="Preview resume"><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label="Download resume"
                        onClick={() => downloadFile(`/resumes/${resume._id}/file`, resume.file.originalName, { download: 1 }).catch((e) => toast.error(errorMessage(e)))}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              ) : <p className="mt-1.5 text-sm text-muted">Not recorded — <Link className="link" to={`/applications/${app._id}/edit`}>attach one</Link></p>}
            </div>
          </div>

          <Card title="Job details">
            <DefinitionList items={[
              { label: 'Job ID', value: app.jobId },
              { label: 'Industry', value: app.industry },
              { label: 'Salary', value: fmtSalary(app.salary) },
              { label: 'Experience', value: app.experienceRequired },
              { label: 'Job posting', value: app.jobPostingUrl && <ExtLink href={app.jobPostingUrl} />, full: true },
              { label: 'Application link', value: app.applicationLink && <ExtLink href={app.applicationLink} />, full: true },
              { label: 'Deadline', value: app.deadline && fmtDate(app.deadline) },
              { label: 'Last update', value: fmtDate(app.lastUpdateDate) },
              { label: 'Difficulty', value: app.difficulty },
              { label: 'Tags', value: app.tags?.length > 0 && <span className="flex flex-wrap gap-1">{app.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> },
              { label: 'Skills required', value: app.skillsRequired?.length > 0 && <span className="flex flex-wrap gap-1">{app.skillsRequired.map((t) => <Badge key={t} tone={app.skillsMatched?.map((x) => x.toLowerCase()).includes(t.toLowerCase()) ? 'green' : 'slate'}>{t}</Badge>)}</span>, full: true },
              { label: 'Notes', value: app.notes && <span className="whitespace-pre-wrap">{app.notes}</span>, full: true },
            ]} />
            {app.jobDescription && (
              <details className="mt-5 rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Job description</summary>
                <p className="whitespace-pre-wrap border-t border-border px-3 py-3 text-sm text-fg/90">{app.jobDescription}</p>
              </details>
            )}
            {app.jdSnapshot && (
              <details className="mt-3 rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">JD snapshot</summary>
                <p className="whitespace-pre-wrap border-t border-border px-3 py-3 text-sm text-fg/90">{app.jdSnapshot}</p>
              </details>
            )}
          </Card>

          <Card title={`Interview rounds (${app.interviews.length})`} padded={false}
            actions={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setIvModal({})}>Add round</Button>}>
            {app.interviews.length ? (
              <ul className="divide-y divide-border">
                {app.interviews.map((iv, i) => (
                  <li key={iv._id} className="flex gap-4 px-5 py-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{iv.roundName}</span>
                        <Badge tone={IV_STATUS_TONE[iv.status]}>{iv.status}</Badge>
                        {iv.result && iv.result !== 'Pending' && <Badge tone={RESULT_TONE[iv.result]}>{iv.result}</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">
                        {iv.type} · {iv.date ? `${fmtDate(iv.date)}${iv.time ? `, ${fmtTime(iv.date)}` : ''}` : 'Date TBD'}
                        {iv.interviewerName && ` · with ${iv.interviewerName}`}
                      </p>
                      {(iv.meetingLink || iv.location) && (
                        <p className="mt-1 flex items-center gap-1 text-sm">
                          {iv.meetingLink ? <><Video className="h-3.5 w-3.5 text-muted" /><ExtLink href={iv.meetingLink}>Join meeting</ExtLink></> : <><MapPin className="h-3.5 w-3.5 text-muted" />{iv.location}</>}
                        </p>
                      )}
                      {(iv.prepNotes || iv.questionsAsked || iv.feedback) && (
                        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                          {iv.prepNotes && <div><p className="text-xs text-muted">Prep notes</p><p className="whitespace-pre-wrap">{iv.prepNotes}</p></div>}
                          {iv.questionsAsked && <div><p className="text-xs text-muted">Questions asked</p><p className="whitespace-pre-wrap">{iv.questionsAsked}</p></div>}
                          {iv.feedback && <div><p className="text-xs text-muted">Feedback</p><p className="whitespace-pre-wrap">{iv.feedback}</p></div>}
                        </div>
                      )}
                    </div>
                    <Menu trigger={<button className="h-fit rounded-md p-1.5 text-muted hover:bg-subtle" aria-label="Interview actions"><MoreHorizontal className="h-4 w-4" /></button>}
                      items={[
                        { label: 'Edit', icon: Pencil, onClick: () => setIvModal({ interview: iv }) },
                        { label: 'Delete', icon: Trash2, danger: true, onClick: () => setIvDelete(iv) },
                      ]} />
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={CalendarClock} title="No interviews yet" description="Add rounds as they get scheduled." className="py-8" />}
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card title="Recruiter">
              <DefinitionList cols={1} items={[
                { label: 'Name', value: app.recruiter?.name },
                { label: 'Email', value: app.recruiter?.email && <a className="link" href={`mailto:${app.recruiter.email}`}>{app.recruiter.email}</a> },
                { label: 'Phone', value: app.recruiter?.phone },
                { label: 'LinkedIn', value: app.recruiter?.linkedinUrl && <ExtLink href={app.recruiter.linkedinUrl}>Profile</ExtLink> },
                { label: 'Recruiter email (from application email)', value: app.emailUsed?.recruiterEmail },
              ]} />
            </Card>
            <Card title="Referral">
              {app.referral?.received ? (
                <DefinitionList cols={1} items={[
                  { label: 'Referred by', value: app.referral.name || 'Yes' },
                  { label: 'Contact', value: app.referral.contact },
                  { label: 'Notes', value: app.referral.notes },
                ]} />
              ) : <p className="flex items-center gap-2 text-sm text-muted"><Users className="h-4 w-4" />No referral for this application.</p>}
            </Card>
          </div>

          {(app.documents?.length > 0 || app.emailUsed?.subject || app.emailUsed?.notes || app.personalNotes) && (
            <Card title="Notes & attachments">
              <DefinitionList items={[
                { label: 'Confirmation subject', value: app.emailUsed?.subject, full: true },
                { label: 'Email notes', value: app.emailUsed?.notes, full: true },
                { label: 'Personal notes', value: app.personalNotes && <span className="whitespace-pre-wrap">{app.personalNotes}</span>, full: true },
                {
                  label: 'Attachments',
                  full: true,
                  value: app.documents?.length > 0 && (
                    <span className="flex flex-wrap gap-2">
                      {app.documents.map((d) => (
                        <button key={d._id} onClick={() => setPreview(d)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-subtle">
                          <FileText className="h-3.5 w-3.5 text-muted" />{d.name}
                        </button>
                      ))}
                    </span>
                  ),
                },
              ]} />
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card title="Reminders" padded={false} actions={<Button size="xs" variant="ghost" icon={Plus} onClick={() => setRemModal({})}>Add</Button>}>
            {app.reminders.length ? (
              <ul className="divide-y divide-border">
                {[...openReminders, ...doneReminders].map((r) => (
                  <li key={r._id} className="flex items-start gap-3 px-5 py-2.5">
                    <button onClick={() => toggleReminder(r)} className="mt-0.5 text-muted hover:text-emerald-500" aria-label={r.completed ? 'Mark incomplete' : 'Mark complete'}>
                      {r.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setRemModal({ reminder: r })}>
                      <p className={cn('text-sm', r.completed && 'text-muted line-through')}>{r.title}</p>
                      <p className={cn('text-xs', !r.completed && isOverdue(r.dueDate) ? 'text-red-600 dark:text-red-400' : 'text-muted')}>{fmtDateTime(r.dueDate)} · {relativeDay(r.dueDate)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-6 text-center text-sm text-muted">No reminders.</p>}
          </Card>

          <div className="card">
            <Tabs className="px-3" value={sideTab} onChange={setSideTab} tabs={[
              { value: 'status', label: 'Status history', badge: app.statusHistory.length },
              { value: 'activity', label: 'Activity', badge: app.activity.length },
            ]} />
            <div className="p-5">
              {sideTab === 'status' ? <StatusTimeline history={app.statusHistory} /> : (
                <>
                  <div className="mb-5 flex gap-2">
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" onKeyDown={(e) => e.key === 'Enter' && addNote()} />
                    <Button variant="secondary" onClick={addNote} disabled={!note.trim()}>Add</Button>
                  </div>
                  <ActivityTimeline activity={app.activity} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <InterviewFormModal open={!!ivModal} onClose={() => setIvModal(null)} interview={ivModal?.interview} applicationId={app._id} onSaved={() => { reload(); refreshReminders?.(); }} />
      <ReminderFormModal open={!!remModal} onClose={() => setRemModal(null)} reminder={remModal?.reminder} applicationId={app._id} onSaved={() => { reload(); refreshReminders?.(); }} />
      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />
      <QuickEditModal app={app} open={quickEdit} onClose={() => setQuickEdit(false)} onSaved={(a) => setData(a)} />
      <ConfirmDialog open={!!ivDelete} onClose={() => setIvDelete(null)} onConfirm={deleteInterview} title="Delete interview round?" message={`"${ivDelete?.roundName}" and its reminder will be removed.`} />
      {actions.dialog}
    </div>
  );
}

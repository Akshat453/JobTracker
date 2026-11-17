import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, Briefcase, Check, Copy, FolderGit2, GraduationCap, Info, Pencil, Plus, ScrollText,
  Sparkles, Trash2, UserRound, Wrench,
} from 'lucide-react';
import { resumeProfileApi } from '../api/endpoints.js';
import { errorMessage } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, Button, Field, Input, Textarea, Select, Toggle, Segmented, SkeletonRows, ErrorState } from '../components/ui/index.js';
import {
  DESCRIPTION_STYLES, DATE_STYLES, MONTH_OPTIONS, bulletsOf, formatDate, formatDescription, fullResumeText,
} from '../lib/resumeText.js';
import { cn } from '../lib/format.js';

// ---------- what each section holds ----------
const BULLET_HINT = 'One point per line. Bullet symbols (•, ●, -) are fine; they are removed or added when you copy.';
const SECTIONS = [
  {
    key: 'experience', title: 'Work experience', icon: Briefcase, noun: 'job',
    heading: (e) => [e.jobTitle, e.company].filter(Boolean).join(' · '),
    fields: [
      { key: 'jobTitle', label: 'Job title' }, { key: 'company', label: 'Company' }, { key: 'location', label: 'Location', placeholder: 'Remote' },
      { key: 'from', label: 'From', type: 'date' }, { key: 'to', label: 'To', type: 'date' },
      { key: 'current', label: 'I currently work here', type: 'check' },
      { key: 'description', label: 'Role description', type: 'bullets', max: 6000 },
    ],
  },
  {
    key: 'education', title: 'Education', icon: GraduationCap, noun: 'education',
    heading: (e) => [e.degree, e.school].filter(Boolean).join(' · '),
    fields: [
      { key: 'school', label: 'School or university' }, { key: 'degree', label: 'Degree', placeholder: "Bachelor's Degree" },
      { key: 'field', label: 'Field of study' }, { key: 'location', label: 'Location' },
      { key: 'from', label: 'From', type: 'date' }, { key: 'to', label: 'To (actual or expected)', type: 'date' },
      { key: 'grade', label: 'Grade / GPA', placeholder: '8.9 CGPA' },
      { key: 'description', label: 'Details (optional)', type: 'bullets', max: 4000 },
    ],
  },
  {
    key: 'projects', title: 'Projects', icon: FolderGit2, noun: 'project',
    heading: (e) => e.name,
    fields: [
      { key: 'name', label: 'Project name' }, { key: 'tech', label: 'Technologies', placeholder: 'React, Node.js, MongoDB' },
      { key: 'link', label: 'Link', placeholder: 'https://github.com/…' },
      { key: 'from', label: 'From', type: 'date' }, { key: 'to', label: 'To', type: 'date' },
      { key: 'description', label: 'Description', type: 'bullets', max: 6000 },
    ],
  },
  {
    key: 'skills', title: 'Skills', icon: Wrench, noun: 'skill group',
    heading: (e) => e.category,
    fields: [
      { key: 'category', label: 'Group', placeholder: 'Languages' },
      { key: 'items', label: 'Skills', type: 'long', placeholder: 'Python, JavaScript, Java, SQL', max: 2000 },
    ],
  },
  {
    key: 'extras', title: 'Other sections', icon: Sparkles, noun: 'section',
    description: 'Certifications, achievements, publications, volunteering… anything else a form asks for.',
    heading: (e) => e.title,
    fields: [
      { key: 'title', label: 'Section name', placeholder: 'Certifications' },
      { key: 'content', label: 'Content', type: 'bullets', max: 6000 },
    ],
  },
];
const CONTACT = {
  key: 'contact', heading: () => 'Contact & links',
  fields: [
    { key: 'fullName', label: 'Full name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
    { key: 'location', label: 'Location', placeholder: 'Ahmedabad, India' },
    { key: 'linkedin', label: 'LinkedIn' }, { key: 'github', label: 'GitHub' }, { key: 'portfolio', label: 'Portfolio / website' },
    { key: 'other', label: 'Other link' },
  ],
};
const SUMMARY = { key: 'summary', heading: () => 'Summary', fields: [{ key: 'summary', label: 'Summary', type: 'long', max: 4000 }] };

const blank = (section) => Object.fromEntries(section.fields.map((f) => [f.key, f.type === 'check' ? false : '']));
const PREFS_KEY = 'jt-resume-copy-prefs';
const readPrefs = () => { try { return { style: 'paragraphs', dateStyle: 'mm/yyyy', ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { style: 'paragraphs', dateStyle: 'mm/yyyy' }; } };

// ---------- copying ----------
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    // Fallback for browsers that block the clipboard API.
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function CopyButton({ text, label, className, children }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (!(await copyText(text))) return toast.error('Copy failed. Select the text and copy it manually.');
    setDone(true); setTimeout(() => setDone(false), 1500);
  };
  const Icon = done ? Check : Copy;
  return (
    <button type="button" onClick={copy} disabled={!text} aria-label={`Copy ${label}`} title={`Copy ${label}`}
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition disabled:invisible',
        done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted hover:bg-subtle hover:text-fg', className)}>
      <Icon className="h-3.5 w-3.5" />{children}{done && !children && <span className="sr-only">Copied</span>}
    </button>
  );
}

/** One field shown read-only with a copy button, the way you'd paste it. */
function CopyRow({ label, value, long }) {
  return (
    <div className="group flex items-start gap-3 py-1.5">
      <dt className="w-24 shrink-0 pt-0.5 text-xs text-muted sm:w-40">{label}</dt>
      <dd className={cn('min-w-0 flex-1 text-sm', !value && 'italic text-muted', long && 'whitespace-pre-line', 'break-words')}>{value || '—'}</dd>
      <CopyButton text={value} label={label} />
    </div>
  );
}

// ---------- editing ----------
/** Month (optional) + year, stored as "YYYY-MM" or "YYYY". */
function DateInput({ value, onChange, label }) {
  const [, y = '', m = ''] = /^(\d{4})(?:-(\d{2}))?$/.exec(value || '') || [];
  const [year, setYear] = useState(y);
  const [month, setMonth] = useState(m);
  useEffect(() => { setYear(y); setMonth(m); }, [y, m]);
  const emit = (yy, mm) => onChange(/^\d{4}$/.test(yy) ? (mm ? `${yy}-${mm}` : yy) : '');
  return (
    <div className="flex gap-2">
      <Select className="flex-1" aria-label={`${label} month`} placeholder="Month" options={MONTH_OPTIONS} value={month}
        onChange={(e) => { setMonth(e.target.value); emit(year, e.target.value); }} />
      <Input className="w-24" aria-label={`${label} year`} inputMode="numeric" maxLength={4} placeholder="Year" value={year}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setYear(v); if (v.length === 4 || !v) emit(v, month); }} />
    </div>
  );
}

function EntryForm({ section, draft, setDraft }) {
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {section.fields.map((f) => {
        if (f.type === 'check') {
          return <div key={f.key} className="sm:col-span-2"><Toggle checked={draft[f.key]} onChange={(v) => set(f.key, v)} label={f.label} /></div>;
        }
        if (f.type === 'date') {
          const off = f.key === 'to' && draft.current;
          return (
            <Field key={f.key} label={f.label} hint={off ? 'Shown as "Present"' : undefined}>
              {off ? <Input disabled value="Present" aria-label={f.label} /> : <DateInput label={f.label} value={draft[f.key]} onChange={(v) => set(f.key, v)} />}
            </Field>
          );
        }
        if (f.type === 'bullets' || f.type === 'long') {
          const val = draft[f.key] || '';
          return (
            <Field key={f.key} label={f.label} className="sm:col-span-2"
              hint={`${f.type === 'bullets' ? `${BULLET_HINT} ` : ''}${val.length}/${f.max}`}>
              <Textarea rows={f.type === 'bullets' ? 7 : 3} maxLength={f.max} value={val} placeholder={f.placeholder || (f.type === 'bullets' ? '● Built …\n● Engineered …' : '')}
                aria-label={f.label} onChange={(e) => set(f.key, e.target.value)} />
            </Field>
          );
        }
        return (
          <Field key={f.key} label={f.label}>
            <Input value={draft[f.key] || ''} placeholder={f.placeholder} aria-label={f.label} maxLength={500} onChange={(e) => set(f.key, e.target.value)} />
          </Field>
        );
      })}
    </div>
  );
}

/** Read-only fields of one entry, formatted for pasting. */
function EntryView({ section, entry, prefs }) {
  return (
    <dl className="divide-y divide-border/60">
      {section.fields.map((f) => {
        if (f.type === 'check') return entry.current ? <CopyRow key={f.key} label={f.label} value="Yes" /> : null;
        if (f.type === 'date') {
          const value = f.key === 'to' && entry.current ? 'Present' : formatDate(entry[f.key], prefs.dateStyle);
          return <CopyRow key={f.key} label={f.label} value={value} />;
        }
        if (f.type === 'bullets') {
          const text = formatDescription(entry[f.key], prefs.style);
          const n = bulletsOf(entry[f.key]).length;
          return (
            <div key={f.key} className="py-2">
              <div className="mb-1.5 flex items-center gap-2">
                <dt className="text-xs text-muted">{f.label}</dt>
                {text && <span className="text-xs text-muted">· {n} point{n === 1 ? '' : 's'} · {text.length} characters</span>}
                <CopyButton text={text} label={f.label} className="ml-auto border border-border">Copy</CopyButton>
              </div>
              <dd className={cn('whitespace-pre-line break-words rounded-lg bg-subtle/60 p-3 text-sm', !text && 'italic text-muted')}>{text || 'Nothing yet'}</dd>
            </div>
          );
        }
        return <CopyRow key={f.key} label={f.label} value={entry[f.key]} long={f.type === 'long'} />;
      })}
    </dl>
  );
}

/** One entry: view with copy buttons, or edit. */
function Entry({ section, entry, prefs, editing, onEdit, onCancel, onSave, onDelete, onMove, index, count, saving, plain }) {
  const [draft, setDraft] = useState(entry);
  useEffect(() => { if (editing) setDraft(entry); }, [editing, entry]);
  const title = section.heading(entry) || `New ${section.noun}`;
  return (
    <div className={plain ? '' : 'rounded-xl border border-border p-4'}>
      <div className={cn('flex items-center gap-2', plain ? (editing ? '' : '-mt-1') : 'mb-2')}>
        {/* Single-block sections (contact, summary) already have the card's title. */}
        <h3 className={cn('min-w-0 flex-1 truncate text-sm font-semibold', plain && 'sr-only')}>{editing ? (section.heading(draft) || `New ${section.noun}`) : title}</h3>
        {plain && <span className="flex-1" />}
        {!editing && (
          <>
            {onMove && <Button size="xs" variant="ghost" icon={ArrowUp} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${title} up`} />}
            {onMove && <Button size="xs" variant="ghost" icon={ArrowDown} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${title} down`} />}
            <Button size="xs" variant="ghost" icon={Pencil} onClick={onEdit} aria-label={`Edit ${title}`}>Edit</Button>
          </>
        )}
      </div>
      {editing ? (
        <>
          <EntryForm section={section} draft={draft} setDraft={setDraft} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" icon={Check} loading={saving} onClick={() => onSave(draft)}>Save</Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
            {onDelete && <Button size="sm" variant="ghost" icon={Trash2} className="ml-auto text-red-600 dark:text-red-400" onClick={onDelete}>Delete</Button>}
          </div>
        </>
      ) : <EntryView section={section} entry={entry} prefs={prefs} />}
    </div>
  );
}

let tempId = 0;
const isTemp = (id) => String(id).startsWith('new-');

export default function ResumeSectionsPage() {
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // "contact" | "summary" | entry _id
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefsState] = useState(readPrefs);
  const setPrefs = (p) => { const next = { ...prefs, ...p }; setPrefsState(next); try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ } };

  const load = () => resumeProfileApi.get().then((d) => { setProfile(d.profile); setError(''); }).catch((e) => setError(errorMessage(e)));
  useEffect(() => { load(); }, []);

  // Warn before leaving with an entry open for editing.
  useEffect(() => {
    if (!editing) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing]);

  const save = async (next, message = 'Saved') => {
    setSaving(true);
    try {
      const body = { ...next };
      for (const s of SECTIONS) body[s.key] = (next[s.key] || []).map(({ _id, ...rest }) => (isTemp(_id) ? rest : { _id, ...rest }));
      delete body._id; delete body.createdAt; delete body.updatedAt;
      const res = await resumeProfileApi.save(body);
      setProfile(res.profile);
      setEditing(null);
      toast.success(message);
      return true;
    } catch (e) { toast.error(errorMessage(e, 'Could not save')); return false; } finally { setSaving(false); }
  };

  const add = (section) => {
    const entry = { _id: `new-${(tempId += 1)}`, ...blank(section) };
    setProfile({ ...profile, [section.key]: [...(profile[section.key] || []), entry] });
    setEditing(entry._id);
  };
  const cancel = (section, entry) => {
    // A new entry that was never saved just goes away.
    if (section && isTemp(entry._id)) setProfile({ ...profile, [section.key]: profile[section.key].filter((e) => e._id !== entry._id) });
    setEditing(null);
  };
  const saveEntry = (section, draft) => save({ ...profile, [section.key]: profile[section.key].map((e) => (e._id === draft._id ? draft : e)) });
  const remove = (section, entry) => {
    if (isTemp(entry._id)) return cancel(section, entry);
    if (!window.confirm(`Delete "${section.heading(entry) || section.noun}"?`)) return undefined;
    return save({ ...profile, [section.key]: profile[section.key].filter((e) => e._id !== entry._id) }, 'Deleted');
  };
  const move = (section, i, dir) => {
    const list = [...profile[section.key]];
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    save({ ...profile, [section.key]: list }, 'Order saved');
  };

  const fullText = useMemo(() => (profile ? fullResumeText(profile, { style: prefs.style === 'paragraphs' ? 'bullets' : prefs.style, dateStyle: 'mon yyyy' }) : ''), [profile, prefs.style]);
  const styleHint = DESCRIPTION_STYLES.find((s) => s.value === prefs.style)?.hint;

  if (error && !profile) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return <SkeletonRows rows={6} />;

  const contactEntry = { _id: 'contact', ...blank(CONTACT), ...profile.contact };
  const summaryEntry = { _id: 'summary', summary: profile.summary || '' };
  const busy = editing !== null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Resume Sections"
        description="Your resume, section by section, ready to copy into job-board forms like Workday without the formatting breaking."
        actions={<CopyButton text={fullText} label="full resume as text" className="border border-border px-3 py-2 text-sm">Copy full resume</CopyButton>} />

      <Card className="mb-6" bodyClassName="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-medium">Copy descriptions as</span>
          <Segmented value={prefs.style} onChange={(v) => setPrefs({ style: v })} options={DESCRIPTION_STYLES.map(({ value, label }) => ({ value, label }))} />
          <span className="text-sm font-medium sm:ml-auto">Dates as</span>
          <Select className="w-auto" aria-label="Date format" value={prefs.dateStyle} onChange={(e) => setPrefs({ dateStyle: e.target.value })} options={DATE_STYLES} />
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{styleHint} If the line breaks vanish after pasting, switch to One paragraph.</p>
      </Card>

      <div className="space-y-6">
        <Card title={<span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4 text-muted" />Contact & links</span>}>
          <Entry plain section={CONTACT} entry={contactEntry} prefs={prefs} editing={editing === 'contact'} saving={saving}
            onEdit={() => !busy && setEditing('contact')} onCancel={() => cancel()}
            onSave={({ _id, ...contact }) => save({ ...profile, contact })} />
        </Card>

        <Card title={<span className="inline-flex items-center gap-2"><ScrollText className="h-4 w-4 text-muted" />Summary</span>}>
          <Entry plain section={SUMMARY} entry={summaryEntry} prefs={prefs} editing={editing === 'summary'} saving={saving}
            onEdit={() => !busy && setEditing('summary')} onCancel={() => cancel()}
            onSave={(d) => save({ ...profile, summary: d.summary })} />
        </Card>

        {SECTIONS.map((section) => {
          const list = profile[section.key] || [];
          return (
            <Card key={section.key} description={section.description}
              title={<span className="inline-flex items-center gap-2"><section.icon className="h-4 w-4 text-muted" />{section.title}</span>}
              actions={<Button size="sm" variant="secondary" icon={Plus} disabled={busy} onClick={() => add(section)}>Add {section.noun}</Button>}
              bodyClassName="space-y-3">
              {!list.length && <p className="text-sm italic text-muted">Nothing here yet.</p>}
              {list.map((entry, i) => (
                <Entry key={entry._id} section={section} entry={entry} prefs={prefs} index={i} count={list.length} saving={saving}
                  editing={editing === entry._id}
                  onEdit={() => !busy && setEditing(entry._id)}
                  onCancel={() => cancel(section, entry)}
                  onSave={(d) => saveEntry(section, d)}
                  onDelete={() => remove(section, entry)}
                  onMove={list.length > 1 && !busy ? (dir) => move(section, i, dir) : null} />
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

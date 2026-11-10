import { useState } from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, ChevronDown, CalendarClock } from 'lucide-react';
import { Field, Input, Select, Textarea, Button, Badge, EmptyState } from '../../ui/index.js';
import { INTERVIEW_TYPES, INTERVIEW_STATUSES, INTERVIEW_RESULTS } from '../../../lib/constants.js';
import { fmtDate, cn } from '../../../lib/format.js';
import { emptyInterview, urlRule, emailRule } from './formUtils.js';

const RESULT_TONE = { Passed: 'green', Failed: 'red', Pending: 'amber', 'N/A': 'zinc' };

export function InterviewsSection() {
  const { control, register, watch, formState: { errors } } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: 'interviews', keyName: 'key' });
  const [openIdx, setOpenIdx] = useState(fields.length ? null : -1);
  const rounds = watch('interviews');

  const add = () => {
    append({ ...emptyInterview(), roundName: `Round ${fields.length + 1}` });
    setOpenIdx(fields.length);
  };

  return (
    <div className="space-y-3">
      {!fields.length && (
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState icon={CalendarClock} title="No interview rounds yet" description="Add each round as it gets scheduled — assessments, technical, HR, and so on."
            action={<Button variant="secondary" icon={Plus} onClick={add}>Add interview round</Button>} className="py-8" />
        </div>
      )}
      {fields.map((f, i) => {
        const r = rounds?.[i] || {};
        const err = errors.interviews?.[i];
        const open = openIdx === i || !!err;
        return (
          <div key={f.key} className="overflow-hidden rounded-lg border border-border">
            <button type="button" onClick={() => setOpenIdx(open ? null : i)} className="flex w-full items-center gap-3 bg-subtle/40 px-4 py-2.5 text-left hover:bg-subtle">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-xs font-semibold ring-1 ring-border">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.roundName || 'Untitled round'}</span>
                <span className="text-xs text-muted">{r.type} · {r.date ? fmtDate(r.date) : 'No date'}{r.time ? ` ${r.time}` : ''} · {r.status}</span>
              </span>
              {r.result && <Badge tone={RESULT_TONE[r.result]}>{r.result}</Badge>}
              {err && <span className="h-2 w-2 rounded-full bg-red-500" />}
              <ChevronDown className={cn('h-4 w-4 text-muted transition', open && 'rotate-180')} />
            </button>
            {open && (
              <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
                <Field label="Round name" required error={err?.roundName?.message}>
                  <Input error={err?.roundName} {...register(`interviews.${i}.roundName`, { required: 'Round name is required' })} />
                </Field>
                <Field label="Interview type"><Select options={INTERVIEW_TYPES} {...register(`interviews.${i}.type`)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Date"><Input type="date" {...register(`interviews.${i}.date`)} /></Field>
                  <Field label="Time"><Input type="time" {...register(`interviews.${i}.time`)} /></Field>
                </div>
                <Field label="Status"><Select options={INTERVIEW_STATUSES} {...register(`interviews.${i}.status`)} /></Field>
                <Field label="Location"><Input placeholder="Office address" {...register(`interviews.${i}.location`)} /></Field>
                <Field label="Meeting link" error={err?.meetingLink?.message}>
                  <Input placeholder="meet.google.com/…" error={err?.meetingLink} {...register(`interviews.${i}.meetingLink`, urlRule)} />
                </Field>
                <Field label="Interviewer name"><Input {...register(`interviews.${i}.interviewerName`)} /></Field>
                <Field label="Interviewer email" error={err?.interviewerEmail?.message}>
                  <Input type="email" error={err?.interviewerEmail} {...register(`interviews.${i}.interviewerEmail`, emailRule)} />
                </Field>
                <Field label="Preparation notes" className="sm:col-span-2"><Textarea rows={2} {...register(`interviews.${i}.prepNotes`)} /></Field>
                <Field label="Questions asked" className="sm:col-span-2"><Textarea rows={2} {...register(`interviews.${i}.questionsAsked`)} /></Field>
                <Field label="Feedback"><Textarea rows={2} {...register(`interviews.${i}.feedback`)} /></Field>
                <Field label="Result"><Select options={INTERVIEW_RESULTS} {...register(`interviews.${i}.result`)} /></Field>
                <div className="sm:col-span-2">
                  <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => { remove(i); setOpenIdx(null); }}>Remove round</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {fields.length > 0 && <Button variant="secondary" icon={Plus} onClick={add}>Add another round</Button>}
    </div>
  );
}

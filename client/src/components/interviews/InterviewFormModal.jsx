import { useForm } from 'react-hook-form';
import { useResetOnOpen } from '../../hooks/useResetOnOpen.js';
import { Modal, Button, Field, Input, Select, Textarea } from '../ui/index.js';
import { INTERVIEW_TYPES, INTERVIEW_STATUSES, INTERVIEW_RESULTS } from '../../lib/constants.js';
import { interviewsApi } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { toDateInput } from '../../lib/format.js';
import { urlRule, emailRule } from '../applications/form/formUtils.js';

const blank = { roundName: '', type: 'Technical', date: '', time: '', location: '', meetingLink: '', interviewerName: '', interviewerEmail: '', status: 'Scheduled', prepNotes: '', questionsAsked: '', feedback: '', result: 'Pending', application: '' };

/** Create or edit a single interview. Pass `applications` to show an application picker (Interviews page). */
export function InterviewFormModal({ open, onClose, interview, applicationId, applications, onSaved }) {
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: blank });

  useResetOnOpen(open, () => {
    reset(interview
      ? { ...blank, ...Object.fromEntries(Object.entries(interview).map(([k, v]) => [k, v ?? ''])), date: toDateInput(interview.date), application: interview.application?._id || interview.application }
      : { ...blank, application: applicationId || '' });
  });

  const onSubmit = async (v) => {
    const body = { ...v };
    delete body._id; delete body.user; delete body.createdAt; delete body.updatedAt; delete body.__v; delete body.durationMinutes;
    try {
      let res;
      if (interview?._id) {
        delete body.application;
        res = await interviewsApi.update(interview._id, body);
      } else {
        res = await interviewsApi.create(body);
      }
      toast.success(interview ? 'Interview updated' : 'Interview added');
      onSaved?.(res);
      onClose();
    } catch (e) { toast.error(errorMessage(e, 'Could not save interview')); }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={interview ? 'Edit interview' : 'Add interview round'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>Save</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        {applications && !interview && (
          <Field label="Application" required error={errors.application?.message} className="sm:col-span-2">
            <Select placeholder="Select an application" error={errors.application}
              options={applications.map((a) => ({ value: a._id, label: `${a.company.name} — ${a.jobTitle}` }))}
              {...register('application', { required: 'Choose an application' })} />
          </Field>
        )}
        <Field label="Round name" required error={errors.roundName?.message}>
          <Input placeholder="Technical round 1" error={errors.roundName} {...register('roundName', { required: 'Round name is required' })} />
        </Field>
        <Field label="Type"><Select options={INTERVIEW_TYPES} {...register('type')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date"><Input type="date" {...register('date')} /></Field>
          <Field label="Time"><Input type="time" {...register('time')} /></Field>
        </div>
        <Field label="Status"><Select options={INTERVIEW_STATUSES} {...register('status')} /></Field>
        <Field label="Location"><Input {...register('location')} /></Field>
        <Field label="Meeting link" error={errors.meetingLink?.message}><Input placeholder="zoom.us/j/…" error={errors.meetingLink} {...register('meetingLink', urlRule)} /></Field>
        <Field label="Interviewer name"><Input {...register('interviewerName')} /></Field>
        <Field label="Interviewer email" error={errors.interviewerEmail?.message}><Input type="email" error={errors.interviewerEmail} {...register('interviewerEmail', emailRule)} /></Field>
        <Field label="Preparation notes" className="sm:col-span-2"><Textarea rows={2} {...register('prepNotes')} /></Field>
        <Field label="Questions asked" className="sm:col-span-2"><Textarea rows={2} {...register('questionsAsked')} /></Field>
        <Field label="Feedback"><Textarea rows={2} {...register('feedback')} /></Field>
        <Field label="Result"><Select options={INTERVIEW_RESULTS} {...register('result')} /></Field>
      </form>
    </Modal>
  );
}

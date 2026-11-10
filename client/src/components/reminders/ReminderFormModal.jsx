import { useForm } from 'react-hook-form';
import { useResetOnOpen } from '../../hooks/useResetOnOpen.js';
import { Modal, Button, Field, Input, Select, Textarea } from '../ui/index.js';
import { REMINDER_TYPES } from '../../lib/constants.js';
import { remindersApi } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { toDateInput, toTimeInput } from '../../lib/format.js';

export function ReminderFormModal({ open, onClose, reminder, applicationId, applications, onSaved }) {
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  useResetOnOpen(open, () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    reset(reminder
      ? { title: reminder.title, notes: reminder.notes || '', type: reminder.type, date: toDateInput(reminder.dueDate), time: toTimeInput(reminder.dueDate), application: reminder.application?._id || reminder.application || '' }
      : { title: '', notes: '', type: 'follow_up', date: toDateInput(tomorrow), time: '09:00', application: applicationId || '' });
  });

  const onSubmit = async ({ date, time, ...v }) => {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = (time || '09:00').split(':').map(Number);
    const body = { ...v, dueDate: new Date(y, m - 1, d, hh, mm).toISOString() };
    try {
      const res = reminder ? await remindersApi.update(reminder._id, body) : await remindersApi.create(body);
      toast.success(reminder ? 'Reminder updated' : 'Reminder added');
      onSaved?.(res.reminder);
      onClose();
    } catch (e) { toast.error(errorMessage(e, 'Could not save reminder')); }
  };

  return (
    <Modal open={open} onClose={onClose} title={reminder ? 'Edit reminder' : 'New reminder'} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>Save</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Title" required error={errors.title?.message} className="sm:col-span-2">
          <Input placeholder="Follow up with recruiter" error={errors.title} {...register('title', { required: 'Title is required' })} />
        </Field>
        <Field label="Date" required error={errors.date?.message}><Input type="date" error={errors.date} {...register('date', { required: 'Date is required' })} /></Field>
        <Field label="Time"><Input type="time" {...register('time')} /></Field>
        <Field label="Type"><Select options={REMINDER_TYPES} {...register('type')} /></Field>
        {applications && (
          <Field label="Application">
            <Select placeholder="None" options={applications.map((a) => ({ value: a._id, label: `${a.company.name} — ${a.jobTitle}` }))} {...register('application')} />
          </Field>
        )}
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}

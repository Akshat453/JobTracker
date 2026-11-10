import { useFormContext, Controller } from 'react-hook-form';
import { Field, Select, Textarea, TagInput } from '../../ui/index.js';
import { DIFFICULTIES } from '../../../lib/constants.js';
import { useAuth } from '../../../context/AuthContext.jsx';

export function AdditionalSection({ tagSuggestions = [] }) {
  const { register, control, watch, setValue } = useFormContext();
  const { user } = useAuth();
  const required = watch('skillsRequired');
  const mySkills = (user?.skills || []).map((s) => s.toLowerCase());
  const suggestedMatches = required.filter((s) => mySkills.includes(s.toLowerCase()));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Skills required" className="sm:col-span-2">
        <Controller control={control} name="skillsRequired" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} placeholder="React, Node.js…" />} />
      </Field>
      <Field label="Skills matching your profile" className="sm:col-span-2"
        hint={suggestedMatches.length && !watch('skillsMatched').length ? (
          <>From your profile: {suggestedMatches.join(', ')} — <button type="button" className="link" onClick={() => setValue('skillsMatched', suggestedMatches, { shouldDirty: true })}>use these</button></>
        ) : mySkills.length ? null : 'Add your skills in Settings to get suggestions.'}>
        <Controller control={control} name="skillsMatched" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} suggestions={user?.skills || []} />} />
      </Field>
      <Field label="Application difficulty"><Select placeholder="Select…" options={DIFFICULTIES} {...register('difficulty')} /></Field>
      <Field label="Custom tags">
        <Controller control={control} name="tags" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} placeholder="dream, startup…" suggestions={tagSuggestions} />} />
      </Field>
      <Field label="Personal notes" className="sm:col-span-2"><Textarea rows={3} {...register('personalNotes')} /></Field>
      <Field label="Job description snapshot" className="sm:col-span-2" hint="Keep a copy in case the posting is taken down.">
        <Textarea rows={5} {...register('jdSnapshot')} />
      </Field>
      <p className="text-xs text-muted sm:col-span-2">Follow-up reminders are created from the <b>Next follow-up date</b> on the Application tab, and you can add more on the application's page after saving.</p>
    </div>
  );
}

import { useLayoutEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Sun, Moon, Monitor, Send } from 'lucide-react';
import { authApi, notificationsApi } from '../api/endpoints.js';
import { errorMessage, tokenStore } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, Button, Field, Input, Select, TagInput, Toggle } from '../components/ui/index.js';
import { cn } from '../lib/format.js';
import { URL_RX, EMAIL_RX } from '../components/applications/form/formUtils.js';

function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm();
  const toValues = (u) => ({ name: u.name, headline: u.headline || '', location: u.location || '', phone: u.phone || '', linkedinUrl: u.linkedinUrl || '', skills: u.skills || [] });
  // Load the profile once per account. A background profile refresh must not overwrite what's being typed.
  const userId = user?._id;
  useLayoutEffect(() => {
    if (user) reset(toValues(user));
  }, [userId, reset]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSubmit = async (v) => {
    try { const { user: u } = await authApi.updateProfile(v); setUser(u); reset(toValues(u)); toast.success('Profile saved'); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Card title="Profile" description="Your skills are used to suggest matches on new applications.">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Name" error={errors.name?.message}><Input error={errors.name} {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Too short' } })} /></Field>
        <Field label="Email" hint="Used to log in"><Input value={user?.email || ''} disabled /></Field>
        <Field label="Headline"><Input placeholder="Full-stack engineer" {...register('headline')} /></Field>
        <Field label="Location"><Input {...register('location')} /></Field>
        <Field label="Phone"><Input type="tel" {...register('phone')} /></Field>
        <Field label="LinkedIn" error={errors.linkedinUrl?.message}><Input placeholder="linkedin.com/in/…" error={errors.linkedinUrl} {...register('linkedinUrl', { pattern: { value: URL_RX, message: 'Enter a valid URL' } })} /></Field>
        <Field label="Skills" className="sm:col-span-2">
          <Controller control={control} name="skills" render={({ field }) => <TagInput value={field.value || []} onChange={field.onChange} placeholder="React, Python, SQL…" />} />
        </Field>
        <div className="sm:col-span-2"><Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save profile</Button></div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const toast = useToast();
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm();
  const onSubmit = async ({ currentPassword, newPassword }) => {
    try {
      // Other devices are signed out; this session gets a fresh token.
      const { token } = await authApi.changePassword({ currentPassword, newPassword });
      if (token) tokenStore.set(token);
      toast.success('Password updated. Other devices have been signed out.');
      reset();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Card title="Password">
      <form className="grid gap-4 sm:grid-cols-3" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Current password" error={errors.currentPassword?.message}><Input type="password" autoComplete="current-password" error={errors.currentPassword} {...register('currentPassword', { required: 'Required' })} /></Field>
        <Field label="New password" error={errors.newPassword?.message}><Input type="password" autoComplete="new-password" error={errors.newPassword} {...register('newPassword', { required: 'Required', minLength: { value: 8, message: 'At least 8 characters' } })} /></Field>
        <Field label="Confirm" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" error={errors.confirm} {...register('confirm', { validate: (v) => v === watch('newPassword') || 'Passwords do not match' })} /></Field>
        <div className="sm:col-span-3"><Button type="submit" variant="secondary" loading={isSubmitting}>Update password</Button></div>
      </form>
    </Card>
  );
}

// So reminder emails show times in the user's own time zone rather than the server's (UTC).
const browserTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; } };

function NotificationPrefs() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [prefs, setPrefs] = useState(user?.notificationPrefs || {});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (prefs.notifyEmail && !EMAIL_RX.test(prefs.notifyEmail)) return toast.error('Notification email is invalid');
    setSaving(true);
    try { const { user: u } = await authApi.updateProfile({ notificationPrefs: { ...prefs, timeZone: browserTimeZone() } }); setUser(u); toast.success('Notification preferences saved'); } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true);
    try { const r = await notificationsApi.test(); toast.info(r.message); } catch (e) { toast.error(errorMessage(e)); } finally { setTesting(false); }
  };
  return (
    <Card title="Email notifications" description="Optional digest emails for reminders that are coming due. Requires SMTP settings on the server.">
      <div className="space-y-4">
        <Toggle checked={prefs.emailEnabled} onChange={(v) => set('emailEnabled', v)} label="Send reminder emails" description="One digest email listing reminders that are due soon or overdue." />
        <div className={cn('space-y-4 border-l-2 border-border pl-4', !prefs.emailEnabled && 'pointer-events-none opacity-50')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Send to" hint={`Defaults to ${user?.email}`}><Input type="email" value={prefs.notifyEmail || ''} onChange={(e) => set('notifyEmail', e.target.value)} placeholder={user?.email} /></Field>
            <Field label="Notify me">
              <Select value={String(prefs.leadTimeHours || 24)} onChange={(e) => set('leadTimeHours', Number(e.target.value))}
                options={[{ value: '2', label: '2 hours before' }, { value: '12', label: '12 hours before' }, { value: '24', label: '1 day before' }, { value: '48', label: '2 days before' }, { value: '72', label: '3 days before' }]} />
            </Field>
          </div>
          <Toggle checked={prefs.interviewReminders !== false} onChange={(v) => set('interviewReminders', v)} label="Upcoming interviews" />
          <Toggle checked={prefs.followUpReminders !== false} onChange={(v) => set('followUpReminders', v)} label="Follow-ups and custom reminders" />
          <Toggle checked={prefs.deadlineReminders !== false} onChange={(v) => set('deadlineReminders', v)} label="Application deadlines" />
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={save} loading={saving}>Save preferences</Button>
          <Button variant="secondary" icon={Send} onClick={test} loading={testing}>Send test email</Button>
        </div>
      </div>
    </Card>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const opts = [{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'System', icon: Monitor }];
  return (
    <Card title="Appearance">
      <div className="grid max-w-md grid-cols-3 gap-3">
        {opts.map((o) => (
          <button key={o.value} onClick={() => setTheme(o.value)}
            className={cn('flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition', theme === o.value ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20 dark:bg-brand-500/10' : 'border-border hover:bg-subtle')}>
            <o.icon className="h-5 w-5" />{o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Profile, security, notifications and appearance." />
      <ProfileForm />
      <Appearance />
      <NotificationPrefs />
      <PasswordForm />
    </div>
  );
}

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';
import { useServerConfig } from '../hooks/useServerConfig.js';
import { Button, Field, Input } from '../components/ui/index.js';
import { Logo } from '../components/layout/Sidebar.jsx';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo />
          <h1 className="mt-10 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l border-border bg-subtle lg:flex lg:items-center lg:justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,.18),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(16,185,129,.12),transparent_45%)]" />
        <div className="relative max-w-md px-10">
          <h2 className="text-2xl font-semibold tracking-tight">Your job search, organised.</h2>
          <p className="mt-2 text-muted">Remember exactly where you applied, which resume and email you used, and what to do next.</p>
          <ul className="mt-8 space-y-3 text-sm">
            {['Track every application from saved to offer', 'Keep each resume version tied to where you sent it', 'Never miss a follow-up or interview', 'See which resumes and sources actually convert'].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async (values) => {
    setServerError('');
    try {
      await login(values);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err, 'Could not log in'));
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue your job search." footer={<>New here? <Link to="/register" className="link">Create an account</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{serverError}</div>}
        <Field label="Email" error={errors.email?.message} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" error={errors.email}
            {...register('email', { required: 'Email is required', pattern: { value: EMAIL_RX, message: 'Enter a valid email' } })} />
        </Field>
        <Field label="Password" error={errors.password?.message} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" error={errors.password}
            {...register('password', { required: 'Password is required' })} />
        </Field>
        <Button type="submit" loading={isSubmitting} className="w-full justify-center">Log in</Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register: signup } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const { inviteRequired } = useServerConfig();
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ name, email, password, inviteCode }) => {
    setServerError('');
    try {
      await signup({ name, email, password, ...(inviteRequired ? { inviteCode } : {}) });
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err, 'Could not create account'));
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start tracking applications in under a minute." footer={<>Already have an account? <Link to="/login" className="link">Log in</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{serverError}</div>}
        <Field label="Full name" error={errors.name?.message} htmlFor="name">
          <Input id="name" autoComplete="name" error={errors.name} {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name is too short' } })} />
        </Field>
        <Field label="Email" error={errors.email?.message} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" error={errors.email}
            {...register('email', { required: 'Email is required', pattern: { value: EMAIL_RX, message: 'Enter a valid email' } })} />
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters" htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" error={errors.password}
            {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'At least 8 characters' } })} />
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message} htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" error={errors.confirm}
            {...register('confirm', { validate: (v) => v === watch('password') || 'Passwords do not match' })} />
        </Field>
        {inviteRequired && (
          <Field label="Invite code" error={errors.inviteCode?.message} hint="Ask the person who shared this site with you" htmlFor="inviteCode">
            <Input id="inviteCode" autoComplete="off" spellCheck={false} error={errors.inviteCode}
              {...register('inviteCode', { required: 'Invite code is required' })} />
          </Field>
        )}
        <Button type="submit" loading={isSubmitting} className="w-full justify-center">Create account</Button>
      </form>
    </AuthShell>
  );
}

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, FileText, Mail, CalendarClock, Bell, BarChart3, Settings, X, Users,
} from 'lucide-react';
import { cn } from '../../lib/format.js';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/applications', label: 'Applications', icon: Briefcase },
  { to: '/resumes', label: 'Resume Library', icon: FileText },
  { to: '/email-accounts', label: 'Email Accounts', icon: Mail },
  { to: '/interviews', label: 'Interviews', icon: CalendarClock },
  { to: '/reminders', label: 'Reminders', icon: Bell, badgeKey: 'reminders' },
  { to: '/friends', label: 'Friends', icon: Users, badgeKey: 'friends' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <Briefcase className="h-4 w-4" />
      </div>
      <span className="font-semibold tracking-tight">Job Tracker</span>
    </div>
  );
}

export function Sidebar({ open, onClose, badges = {} }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface transition-transform lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex h-14 items-center justify-between px-4">
          <Logo />
          <button className="rounded-md p-1 text-muted hover:bg-subtle lg:hidden" onClick={onClose} aria-label="Close menu"><X className="h-4 w-4" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {NAV.map(({ to, label, icon: Icon, end, badgeKey }) => (
            <NavLink key={to} to={to} end={end} onClick={onClose}
              className={({ isActive }) => cn(
                'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                isActive ? 'bg-subtle font-medium text-fg' : 'text-muted hover:bg-subtle/70 hover:text-fg',
              )}>
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-4 w-4', isActive ? 'text-brand-600 dark:text-brand-400' : '')} />
                  <span className="flex-1">{label}</span>
                  {badgeKey && badges[badgeKey] > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white">{badges[badgeKey]}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-lg border border-border bg-subtle/60 p-3 text-xs text-muted">
          Press <span className="kbd">N</span> to add an application, <span className="kbd">/</span> to search.
        </div>
      </aside>
    </>
  );
}

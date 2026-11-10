import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu as MenuIcon, Search, Bell, Sun, Moon, Monitor, LogOut, User, Plus, AlertCircle, CalendarClock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Menu, Button } from '../ui/index.js';
import { initials, relativeDay, fmtTime, cn } from '../../lib/format.js';

function Notifications({ data }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const overdue = data?.overdue || [];
  const upcoming = data?.upcoming || [];
  const count = overdue.length + upcoming.filter((r) => relativeDay(r.dueDate) === 'Today').length;
  const go = (r) => { setOpen(false); navigate(r.application ? `/applications/${r.application._id}` : '/reminders'); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {count > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-surface" />}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 animate-scale-in rounded-xl border border-border bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            <button className="link text-xs" onClick={() => { setOpen(false); navigate('/reminders'); }}>View all</button>
          </div>
          <div className="max-h-96 overflow-y-auto p-1">
            {!overdue.length && !upcoming.length && <p className="px-3 py-8 text-center text-sm text-muted">You're all caught up.</p>}
            {[...overdue.map((r) => ({ ...r, _overdue: true })), ...upcoming].slice(0, 12).map((r) => (
              <button key={r._id} onClick={() => go(r)} className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-subtle">
                {r._overdue ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /> : <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm">{r.title}</span>
                  <span className={cn('text-xs', r._overdue ? 'text-red-600 dark:text-red-400' : 'text-muted')}>
                    {r._overdue ? `Overdue · ${relativeDay(r.dueDate)}` : `${relativeDay(r.dueDate)} · ${fmtTime(r.dueDate)}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onMenu, reminders }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); navigate('/applications/new'); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur lg:px-6">
      <button className="rounded-lg p-2 text-muted hover:bg-subtle lg:hidden" onClick={onMenu} aria-label="Open menu"><MenuIcon className="h-4 w-4" /></button>
      <form className="relative max-w-md flex-1" onSubmit={(e) => { e.preventDefault(); navigate(`/applications?search=${encodeURIComponent(q.trim())}`); }}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies or roles…"
          className="h-9 w-full rounded-lg border border-transparent bg-subtle pl-9 pr-10 text-sm outline-none transition placeholder:text-muted focus:border-brand-500 focus:bg-surface focus:ring-2 focus:ring-brand-500/20" />
        <span className="kbd absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:inline">/</span>
      </form>
      <div className="ml-auto flex items-center gap-1">
        {/* The one "add" button for the whole app; icon-only on phones. */}
        <Button size="sm" icon={Plus} onClick={() => navigate('/applications/new')} aria-label="New application" title="New application (N)">
          <span className="hidden sm:inline">New application</span>
        </Button>
        <Menu
          trigger={<button className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Theme"><ThemeIcon className="h-4 w-4" /></button>}
          width="w-36"
          items={[
            { label: 'Light', icon: Sun, onClick: () => setTheme('light'), active: theme === 'light' },
            { label: 'Dark', icon: Moon, onClick: () => setTheme('dark'), active: theme === 'dark' },
            { label: 'System', icon: Monitor, onClick: () => setTheme('system'), active: theme === 'system' },
          ]}
        />
        <Notifications data={reminders} />
        <Menu
          trigger={(
            <button className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-semibold text-white" aria-label="Account">
              {initials(user?.name)}
            </button>
          )}
          width="w-56"
          items={[
            { label: user?.email, disabled: true },
            { divider: true },
            { label: 'Profile & settings', icon: User, onClick: () => navigate('/settings') },
            { label: 'Log out', icon: LogOut, onClick: () => { logout(); navigate('/login'); } },
          ]}
        />
      </div>
    </header>
  );
}

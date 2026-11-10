import { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { remindersApi } from '../../api/endpoints.js';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState(null);
  const location = useLocation();

  const loadReminders = useCallback(async () => {
    try {
      const [overdue, week] = await Promise.all([
        remindersApi.list({ view: 'overdue' }),
        remindersApi.list({ view: 'upcoming' }),
      ]);
      const in7 = Date.now() + 7 * 86_400_000;
      setReminders({ overdue: overdue.items, upcoming: week.items.filter((r) => new Date(r.dueDate) <= in7), counts: overdue.counts });
    } catch { /* non-critical */ }
  }, []);

  // Refresh notifications on navigation so they reflect recent changes.
  useEffect(() => { loadReminders(); }, [location.pathname, loadReminders]);

  const badge = (reminders?.counts?.overdue || 0) + (reminders?.counts?.today || 0);

  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} badges={{ reminders: badge }} />
      <div className="lg:pl-60">
        <Topbar onMenu={() => setOpen(true)} reminders={reminders} />
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
          <Outlet context={{ refreshReminders: loadReminders }} />
        </main>
      </div>
    </div>
  );
}

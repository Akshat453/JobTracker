import { useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { friendsApi, remindersApi } from '../../api/endpoints.js';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState(null);
  const [friends, setFriends] = useState(null);
  const location = useLocation();

  const lastLoad = useRef(0);
  // One request: the "week" view is every open reminder due within 7 days, overdue ones included.
  const loadReminders = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const { items, counts } = await remindersApi.list({ view: 'week' });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const isOverdue = (r) => new Date(r.dueDate) < today;
      setReminders({ overdue: items.filter(isOverdue), upcoming: items.filter((r) => !isOverdue(r)), counts });
    } catch { /* non-critical */ }
  }, []);
  // Friend requests + jobs friends sent that haven't been answered yet (sidebar badge).
  const loadFriends = useCallback(() => friendsApi.summary().then(setFriends).catch(() => {}), []);

  // Refresh on navigation, at most every 30 s so it doesn't compete with each page's own data.
  // Pages that change reminders call refreshReminders() for an immediate update.
  useEffect(() => {
    if (Date.now() - lastLoad.current > 30_000) { loadReminders(); loadFriends(); }
  }, [location.pathname, loadReminders, loadFriends]);

  const badge = (reminders?.counts?.overdue || 0) + (reminders?.counts?.today || 0);

  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} badges={{ reminders: badge, friends: (friends?.requests || 0) + (friends?.shared || 0) }} />
      <div className="lg:pl-60">
        <Topbar onMenu={() => setOpen(true)} reminders={reminders} />
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
          <Outlet context={{ refreshReminders: loadReminders, refreshFriends: loadFriends }} />
        </main>
      </div>
    </div>
  );
}

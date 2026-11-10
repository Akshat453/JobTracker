import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {
  Briefcase, Send, ClipboardList, CalendarClock, MessagesSquare, Trophy, XCircle, PauseCircle, Undo2, Plus,
  Video, MapPin, Check, AlertCircle, ArrowRight, TrendingUp,
} from 'lucide-react';
import { analyticsApi, remindersApi } from '../api/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { errorMessage } from '../api/client.js';
import { PageHeader, Card, Button, Skeleton, SkeletonRows, EmptyState, ErrorState, StatusBadge, CompanyLogo } from '../components/ui/index.js';
import { StatCard } from '../components/applications/StatCard.jsx';
import { AreaTrend, DonutChart, HBarChart, VBarChart, statusColor } from '../components/charts/Charts.jsx';
import { fmtShort, fmtTime, relativeDay, timeAgo, cn } from '../lib/format.js';

const STAT_DEFS = [
  { key: 'total', label: 'Total applications', icon: Briefcase, to: '/applications' },
  { key: 'applied', label: 'Applied', icon: Send, to: '/applications?status=applied', tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  { key: 'assessment', label: 'Assessment / OA', icon: ClipboardList, to: '/applications?status=assessment_pending,assessment_completed', tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  { key: 'interviewScheduled', label: 'Interview scheduled', icon: CalendarClock, to: '/applications?status=interview_scheduled', tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
  { key: 'interviewing', label: 'Interviewing', icon: MessagesSquare, to: '/applications?status=interviewing', tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
  { key: 'offers', label: 'Offers received', icon: Trophy, to: '/applications?status=offer,accepted', tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, to: '/applications?status=rejected', tone: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  { key: 'onHold', label: 'On hold', icon: PauseCircle, to: '/applications?status=on_hold', tone: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' },
  { key: 'withdrawn', label: 'Withdrawn', icon: Undo2, to: '/applications?status=withdrawn', tone: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-72 rounded-xl lg:col-span-2" /><Skeleton className="h-72 rounded-xl" /></div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshReminders } = useOutletContext() || {};
  const { data, loading, error, reload, setData } = useAsync(() => analyticsApi.overview(), []);

  const completeReminder = async (r, bucket) => {
    setData((d) => ({ ...d, reminders: { ...d.reminders, [bucket]: d.reminders[bucket].filter((x) => x._id !== r._id) } }));
    try {
      await remindersApi.update(r._id, { completed: true });
      toast.success('Reminder completed', { action: { label: 'Undo', onClick: () => remindersApi.update(r._id, { completed: false }).then(reload) } });
      refreshReminders?.();
    } catch (e) { toast.error(errorMessage(e)); reload(); }
  };

  const header = (
    <PageHeader title={`${greeting()}, ${user?.name?.split(' ')[0] || 'there'}`} description="Here's where your job search stands today." />
  );

  if (loading && !data) return <>{header}<DashboardSkeleton /></>;
  if (error && !data) return <>{header}<ErrorState message={error} onRetry={reload} /></>;

  const { stats, funnel, byStatus, byCompany, byJobType, activity, monthly, upcomingInterviews, recentApplications, reminders } = data;

  if (!stats.total) {
    return (
      <>
        {header}
        <div className="card">
          <EmptyState icon={Briefcase} title="No applications yet" className="py-20"
            description="Add your first application to start tracking statuses, resumes, interviews and follow-ups."
            action={<Button icon={Plus} onClick={() => navigate('/applications/new')}>Add your first application</Button>} />
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STAT_DEFS.map(({ key, ...s }) => <StatCard key={key} {...s} value={stats[key]} />)}
        <StatCard label="Conversion rate" icon={TrendingUp} value={`${funnel.interviewRate}%`}
          sub={`${funnel.interviews} interviews · ${funnel.offerRate}% offers`} tone="bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400" to="/analytics" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Application activity" description="Applications sent per week, last 12 weeks" className="lg:col-span-2">
          <AreaTrend data={activity} height={240} />
        </Card>
        <Card title="By status"><DonutChart data={byStatus} colorFor={statusColor} height={220} /></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Upcoming interviews" padded={false} className="lg:col-span-1"
          actions={<Link to="/interviews" className="link text-xs">View all</Link>}>
          {upcomingInterviews.length ? (
            <ul className="divide-y divide-border">
              {upcomingInterviews.map((iv) => (
                <li key={iv._id}>
                  <Link to={`/applications/${iv.application?._id}`} className="flex gap-3 px-5 py-3 hover:bg-subtle/60">
                    <div className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-border py-1">
                      <span className="text-[10px] font-medium uppercase text-red-500">{new Date(iv.date).toLocaleString('en-US', { month: 'short' })}</span>
                      <span className="text-base font-semibold leading-tight">{new Date(iv.date).getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{iv.application?.company?.name} · {iv.roundName}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted">
                        {iv.meetingLink ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                        {iv.time ? fmtTime(iv.date) : 'Time TBD'} · {iv.type} · {relativeDay(iv.date)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CalendarClock} title="No interviews scheduled" description="Upcoming interviews will show up here." className="py-10" />}
        </Card>

        <Card title="Reminders" padded={false} actions={<Link to="/reminders" className="link text-xs">Manage</Link>}>
          {reminders.overdue.length + reminders.upcoming.length ? (
            <ul className="divide-y divide-border">
              {[...reminders.overdue.map((r) => [r, 'overdue']), ...reminders.upcoming.map((r) => [r, 'upcoming'])].slice(0, 7).map(([r, bucket]) => (
                <li key={r._id} className="flex items-start gap-3 px-5 py-2.5">
                  <button onClick={() => completeReminder(r, bucket)} title="Mark complete"
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border text-transparent transition hover:border-emerald-500 hover:text-emerald-500">
                    <Check className="h-3 w-3" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.title}</p>
                    <p className={cn('flex items-center gap-1 text-xs', bucket === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-muted')}>
                      {bucket === 'overdue' && <AlertCircle className="h-3 w-3" />}{relativeDay(r.dueDate)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={Check} title="All caught up" description="No reminders due this week." className="py-10" />}
        </Card>

        <Card title="Recently updated" padded={false} actions={<Link to="/applications?sort=updated" className="link text-xs">View all</Link>}>
          {loading ? <SkeletonRows className="p-5" /> : (
            <ul className="divide-y divide-border">
              {recentApplications.map((a) => (
                <li key={a._id}>
                  <Link to={`/applications/${a._id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-subtle/60">
                    <CompanyLogo name={a.company.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.company.name}</p>
                      <p className="truncate text-xs text-muted">{a.jobTitle} · {timeAgo(a.updatedAt)}</p>
                    </div>
                    <StatusBadge status={a.status} short />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Monthly applications" description="Last 6 months" className="lg:col-span-1">
          <VBarChart data={monthly} height={220} bars={[{ key: 'applications', label: 'Applied' }, { key: 'interviews', label: 'Interviews', color: '#10b981' }]} />
        </Card>
        <Card title="By company" description="Top companies"><HBarChart data={byCompany} /></Card>
        <Card title="By job type"><DonutChart data={byJobType} height={200} /></Card>
      </div>

      <p className="pb-4 text-center text-xs text-muted">
        <Link to="/analytics" className="inline-flex items-center gap-1 hover:text-fg">Open full analytics <ArrowRight className="h-3 w-3" /></Link>
        <span className="mx-2">·</span>Updated {fmtShort(new Date())}
      </p>
    </div>
  );
}

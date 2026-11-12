import { useMemo, useState } from 'react';
import { Download, FileDown, Send, MessagesSquare, Trophy, XCircle, Percent, Timer, TrendingUp } from 'lucide-react';
import { analyticsApi } from '../api/endpoints.js';
import { downloadFile, errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Card, Button, Select, Input, Skeleton, ErrorState } from '../components/ui/index.js';
import { StatCard } from '../components/applications/StatCard.jsx';
import { VBarChart, HBarChart, DonutChart, Funnel, statusColor } from '../components/charts/Charts.jsx';
import { toDateInput, cn } from '../lib/format.js';

const PRESETS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

function PerformanceTable({ rows, nameLabel }) {
  const data = rows.filter((r) => r.applications > 0);
  if (!data.length) return <p className="py-6 text-center text-sm text-muted">No data for this period.</p>;
  const bestRate = Math.max(...data.filter((r) => r.applications >= 2).map((r) => r.interviewRate), 0);
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="px-5 py-2 font-medium">{nameLabel}</th>
            <th className="px-3 py-2 text-right font-medium" title="Applications sent (saved jobs not counted)">Sent</th>
            <th className="px-3 py-2 text-right font-medium">Interviews</th>
            <th className="px-3 py-2 text-right font-medium">Offers</th>
            <th className="px-3 py-2 font-medium">Interview rate</th>
            <th className="px-5 py-2 text-right font-medium">Offer rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((r) => (
            <tr key={r._id || r.name}>
              <td className="max-w-[220px] truncate px-5 py-2.5 font-medium">{r.name}{r.version ? <span className="text-muted"> · {r.version}</span> : ''}{r.isArchived && <span className="text-xs text-muted"> (archived)</span>}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.applications}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.interviews}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.offers}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-subtle"><div className={cn('h-full rounded-full', r.interviewRate === bestRate && r.applications >= 2 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${Math.min(100, r.interviewRate)}%` }} /></div>
                  <span className="tabular-nums">{r.interviewRate}%</span>
                </div>
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums">{r.offerRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const toast = useToast();
  const [preset, setPreset] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [exporting, setExporting] = useState(null);

  const range = useMemo(() => {
    if (preset === 'all') return {};
    if (preset === 'custom') return { from: custom.from || undefined, to: custom.to || undefined };
    return { from: toDateInput(new Date(Date.now() - Number(preset) * 86_400_000)), to: toDateInput(new Date()) };
  }, [preset, custom]);
  const invalidRange = range.from && range.to && range.from > range.to;

  const { data, loading, error, reload } = useAsync(async () => {
    if (invalidRange) return null;
    const [apps, resumes, sources] = await Promise.all([analyticsApi.applications(range), analyticsApi.resumes(range), analyticsApi.sources(range)]);
    return { apps, resumes, sources };
  }, [JSON.stringify(range)], { cacheKey: `analytics:${JSON.stringify(range)}` });

  const exportFile = async (kind) => {
    setExporting(kind);
    try {
      if (kind === 'csv') await downloadFile('/applications/export/csv', 'applications.csv', range);
      else await downloadFile('/analytics/report.pdf', 'job-search-report.pdf', range);
      toast.success(kind === 'csv' ? 'CSV exported' : 'PDF report generated');
    } catch (e) { toast.error(errorMessage(e, 'Export failed')); } finally { setExporting(null); }
  };

  const t = data?.apps?.totals;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="How your search is converting — computed live from your applications."
        actions={(
          <>
            <Button variant="secondary" icon={Download} loading={exporting === 'csv'} onClick={() => exportFile('csv')}>CSV</Button>
            <Button variant="secondary" icon={FileDown} loading={exporting === 'pdf'} onClick={() => exportFile('pdf')}>PDF report</Button>
          </>
        )} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48"><Select value={preset} onChange={(e) => setPreset(e.target.value)} options={PRESETS} aria-label="Date range" /></div>
        {preset === 'custom' && (
          <>
            <Input type="date" className="w-44" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From" />
            <span className="pb-2 text-muted">→</span>
            <Input type="date" className="w-44" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To" />
            {invalidRange && <span className="pb-2 text-xs text-red-600">"From" must be before "To"</span>}
          </>
        )}
      </div>

      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        <div className={cn('space-y-6', loading && 'opacity-60 transition-opacity')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Applications" value={t.total} icon={Send} sub={`${t.submitted} submitted`} />
            <StatCard label="Interviews received" value={t.interviews} icon={MessagesSquare} tone="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" />
            <StatCard label="Offers received" value={t.offers} icon={Trophy} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" />
            <StatCard label="Rejections" value={t.rejections} icon={XCircle} tone="bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" />
            <StatCard label="Interview conversion" value={`${t.interviewRate}%`} icon={TrendingUp} sub="of submitted applications" tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" />
            <StatCard label="Offer conversion" value={`${t.offerRate}%`} icon={Percent} sub={`${t.interviewToOfferRate}% of interviews`} tone="bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400" />
            <StatCard label="Rejection rate" value={`${t.rejectionRate}%`} icon={Percent} tone="bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" />
            <StatCard label="Avg. time to interview" value={t.avgDaysToInterview != null ? `${t.avgDaysToInterview}d` : '—'} icon={Timer} sub="from application date" tone="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Applications by month" description="Applications sent each month, and how many of them led to interviews and offers" className="lg:col-span-2">
              <VBarChart data={data.apps.monthly} height={280} bars={[
                { key: 'applications', label: 'Applications' },
                { key: 'interviews', label: 'Interviews', color: '#8b5cf6' },
                { key: 'offers', label: 'Offers', color: '#10b981' },
              ]} />
            </Card>
            <Card title="Pipeline funnel"><Funnel steps={data.apps.funnel} /></Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="By status"><DonutChart data={data.apps.byStatus} colorFor={statusColor} height={220} /></Card>
            <Card title="By company"><HBarChart data={data.apps.byCompany} /></Card>
            <Card title="By source"><HBarChart data={data.apps.bySource} color="#10b981" /></Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Interviews by type"><DonutChart data={data.apps.interviews.byType} height={200} /></Card>
            <Card title="Interview outcomes"><DonutChart data={data.apps.interviews.outcomes} height={200} colorFor={(r) => ({ Passed: '#10b981', Failed: '#ef4444', Pending: '#f59e0b' }[r.name] || '#94a3b8')} /></Card>
            <Card title="By job type"><DonutChart data={data.apps.byJobType} height={200} /></Card>
          </div>

          <Card title="Resume version performance" description="Which resume versions lead to interviews and offers">
            <PerformanceTable rows={data.resumes.resumes} nameLabel="Resume" />
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Source performance"><PerformanceTable rows={data.sources.sources} nameLabel="Source" /></Card>
            <Card title="Email account performance"><PerformanceTable rows={data.sources.emails} nameLabel="Email" /></Card>
          </div>
        </div>
      )}
    </div>
  );
}

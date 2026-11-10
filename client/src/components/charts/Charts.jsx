import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, Legend,
} from 'recharts';
import { CHART_COLORS, STATUS_MAP } from '../../lib/constants.js';
import { EmptyState } from '../ui/index.js';
import { BarChart3 } from 'lucide-react';

const axis = { stroke: 'rgb(var(--muted))', fontSize: 11, tickLine: false, axisLine: false };
const grid = { stroke: 'rgb(var(--border))', strokeDasharray: '3 3', vertical: false };
const tooltip = { cursor: { fill: 'rgb(var(--subtle))', opacity: 0.6 }, contentStyle: { fontSize: 12 }, itemStyle: { color: 'rgb(var(--fg))' } };

const NoData = () => <EmptyState icon={BarChart3} title="No data yet" description="Add applications to see this chart." className="py-8" />;

export function DonutChart({ data, height = 240, colorFor }) {
  const rows = data?.filter((d) => d.count > 0) || [];
  if (!rows.length) return <NoData />;
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: height * 0.8, height: height * 0.8 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={rows} dataKey="count" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} strokeWidth={0}>
              {rows.map((r, i) => <Cell key={r.key || r.name} fill={colorFor ? colorFor(r, i) : CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip {...tooltip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold">{total}</span>
          <span className="text-xs text-muted">total</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-1">
        {rows.map((r, i) => (
          <li key={r.key || r.name} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFor ? colorFor(r, i) : CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="flex-1 truncate text-muted">{r.name}</span>
            <span className="font-medium tabular-nums">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const statusColor = (r) => STATUS_MAP[r.key]?.hex || '#94a3b8';

export function HBarChart({ data, height, dataKey = 'count', color = CHART_COLORS[0] }) {
  if (!data?.some((d) => d[dataKey] > 0)) return <NoData />;
  return (
    <ResponsiveContainer width="100%" height={height || Math.max(160, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid {...grid} horizontal={false} vertical />
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axis} width={110} tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
        <Tooltip {...tooltip} />
        <Bar dataKey={dataKey} name="Applications" fill={color} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VBarChart({ data, bars, height = 260, stacked }) {
  if (!data?.some((d) => bars.some((b) => d[b.key] > 0))) return <NoData />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="name" {...axis} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltip} />
        {bars.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color || CHART_COLORS[i]} radius={stacked ? 0 : [4, 4, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={32} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AreaTrend({ data, dataKey = 'applications', height = 240, color = CHART_COLORS[0] }) {
  if (!data?.some((d) => d[dataKey] > 0)) return <NoData />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -16, right: 8 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="name" {...axis} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltip} />
        <Area type="monotone" dataKey={dataKey} name="Applications" stroke={color} strokeWidth={2} fill={`url(#grad-${dataKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal funnel made of proportional bars. */
export function Funnel({ steps }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        // Stages are not strictly sequential (not every application has an assessment),
        // so express each one as a share of the first stage rather than of the previous one.
        const base = steps[0]?.count;
        const conv = i && base ? Math.round((s.count / base) * 100) : null;
        return (
          <div key={s.name}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium">{s.name}</span>
              <span className="text-muted">{s.count}{conv != null && <span className="ml-2">({conv}% of {steps[0].name.toLowerCase()})</span>}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full transition-all" style={{ width: `${(s.count / max) * 100}%`, background: CHART_COLORS[i] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

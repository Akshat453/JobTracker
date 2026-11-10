import { Link } from 'react-router-dom';
import { cn } from '../../lib/format.js';

export function StatCard({ label, value, icon: Icon, tone = 'text-brand-600 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400', to, sub }) {
  const body = (
    <div className={cn('card group h-full p-4 transition', to && 'hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop dark:hover:border-brand-500/40')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {Icon && <span className={cn('rounded-md p-1.5', tone)}><Icon className="h-3.5 w-3.5" /></span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

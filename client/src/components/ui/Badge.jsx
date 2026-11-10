import { STATUS_MAP, TONE, DOT, PRIORITY_TONE } from '../../lib/constants.js';
import { cn } from '../../lib/format.js';

export function Badge({ tone = 'slate', children, className, dot }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, short, className }) {
  const s = STATUS_MAP[status];
  if (!s) return null;
  return <Badge tone={s.color} dot className={className}>{short ? s.short : s.label}</Badge>;
}

export function PriorityBadge({ priority }) {
  if (!priority) return null;
  return <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>;
}

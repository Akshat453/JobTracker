import { cn } from '../../lib/format.js';

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-subtle', className)} />;
}

export function SkeletonRows({ rows = 5, className }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-1/5" /></div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-subtle">
          <Icon className="h-5 w-5 text-muted" />
        </div>
      )}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
      {onRetry && <button onClick={onRetry} className="link text-sm">Try again</button>}
    </div>
  );
}

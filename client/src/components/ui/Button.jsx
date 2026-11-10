import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/format.js';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:hover:bg-brand-600',
  secondary: 'border border-border bg-surface text-fg hover:bg-subtle shadow-sm',
  ghost: 'text-fg/80 hover:bg-subtle hover:text-fg',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  'danger-ghost': 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10',
};
const SIZES = {
  xs: 'h-7 px-2 text-xs gap-1',
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  icon: 'h-8 w-8 justify-center',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-lg font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 active:scale-[.98]',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        VARIANTS[variant], SIZES[size], className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});

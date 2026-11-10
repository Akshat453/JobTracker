import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './Button.jsx';
import { cn } from '../../lib/format.js';

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };

export function Modal({ open, onClose, title, description, size = 'md', children, footer, className }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => panel.current?.querySelector('input,select,textarea,button:not([aria-label=Close])')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panel} className={cn('relative flex max-h-[92vh] w-full animate-scale-in flex-col rounded-t-2xl border border-border bg-surface shadow-pop sm:rounded-2xl', SIZES[size], className)}>
        {title && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-subtle hover:text-fg"><X className="h-4 w-4" /></button>
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', tone = 'danger', loading }) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex gap-4 pt-1">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tone === 'danger' ? 'bg-red-50 text-red-600 dark:bg-red-500/10' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10')}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <div className="mt-1 text-sm text-muted">{message}</div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/format.js';

/**
 * Dropdown menu rendered in a portal so it is never clipped by tables/cards.
 * items: [{ label, icon, onClick, danger, divider, href }]
 */
export function Menu({ trigger, items, align = 'right', width = 'w-48' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef(null);
  const menu = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    const reposition = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', reposition, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', reposition, true); };
  }, [open]);

  const toggle = (e) => {
    e.stopPropagation();
    const r = btn.current.getBoundingClientRect();
    const menuH = 40 + items.length * 34;
    const top = r.bottom + menuH > window.innerHeight ? r.top - menuH - 4 : r.bottom + 4;
    setPos({ top: Math.max(8, top), left: align === 'right' ? r.right : r.left });
    setOpen((o) => !o);
  };

  return (
    <>
      <span ref={btn} onClick={toggle} className="inline-flex">{trigger}</span>
      {open && createPortal(
        <div ref={menu} style={{ top: pos.top, left: pos.left }}
          className={cn('fixed z-[60] animate-scale-in rounded-lg border border-border bg-surface p-1 shadow-pop', width, align === 'right' && '-translate-x-full')}>
          {items.filter(Boolean).map((it, i) => (it.divider ? <div key={i} className="my-1 h-px bg-border" /> : (
            <button key={i} type="button" disabled={it.disabled}
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick?.(); }}
              className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-50',
                it.danger ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10' : 'hover:bg-subtle', it.active && 'bg-subtle font-medium')}>
              {it.icon && <it.icon className="h-4 w-4 shrink-0 opacity-70" />}
              <span className="truncate">{it.label}</span>
            </button>
          )))}
        </div>,
        document.body,
      )}
    </>
  );
}

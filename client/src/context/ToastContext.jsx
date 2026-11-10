import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  info: <Info className="h-4 w-4 text-brand-500" />,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((type, message, opts = {}) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, type, message, action: opts.action }]);
    setTimeout(() => dismiss(id), opts.duration ?? (type === 'error' ? 6000 : 3500));
  }, [dismiss]);

  const toast = useMemo(() => ({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
  }), [push]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-slide-in items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-pop">
            <span className="mt-0.5">{ICONS[t.type]}</span>
            <p className="flex-1 text-sm">{t.message}</p>
            {t.action && (
              <button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => { t.action.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

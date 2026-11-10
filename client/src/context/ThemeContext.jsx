import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const KEY = 'jt-theme';

const read = () => { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } };

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(read); // 'light' | 'dark' | 'system'

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    try { theme === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, theme); } catch { /* ignore */ }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return <ThemeContext.Provider value={{ theme, setTheme, isDark }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

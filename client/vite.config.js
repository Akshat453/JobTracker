import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Production builds get a strict Content-Security-Policy <meta> tag. Scripts may only come from this
 * site, and the API may only be called at VITE_API_URL, which limits the damage of any injected script.
 * (frame-ancestors and other header-only rules are set in vercel.json.)
 */
function contentSecurityPolicy(apiUrl) {
  let apiOrigin = '';
  try { apiOrigin = /^https?:\/\//.test(apiUrl) ? new URL(apiUrl).origin : ''; } catch { /* relative URL */ }
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https://www.google.com https://*.gstatic.com",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    'frame-src blob:',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_API_URL || '')],
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          // Libraries change rarely; keeping them in their own files lets browsers reuse the cached
          // copies after each deploy instead of re-downloading everything.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            vendor: ['axios', 'react-hook-form'],
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: { '/api': { target: 'http://localhost:5001', changeOrigin: true } },
    },
  };
});

import { useEffect, useState } from 'react';
import { authApi } from '../api/endpoints.js';

const DEFAULTS = { inviteRequired: false, maxUploadMb: 4 };
let cached = null; // one request per page load, shared by every caller

/** Public server settings: whether sign-up needs an invite code, and the upload size limit. */
export function useServerConfig() {
  const [config, setConfig] = useState(() => cached || DEFAULTS);
  useEffect(() => {
    if (!cached) cached = authApi.config().then((c) => ({ ...DEFAULTS, ...c })).catch(() => { cached = null; return DEFAULTS; });
    let alive = true;
    Promise.resolve(cached).then((c) => { if (alive) setConfig(c); });
    return () => { alive = false; };
  }, []);
  return config;
}

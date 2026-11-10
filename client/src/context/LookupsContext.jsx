import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { emailAccountsApi, resumesApi } from '../api/endpoints.js';
import { useAuth } from './AuthContext.jsx';

/** Shared, cached lists used by many forms/filters: email accounts and documents. */
const LookupsContext = createContext(null);

export function LookupsProvider({ children }) {
  const { user } = useAuth();
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const refreshEmails = useCallback(() => emailAccountsApi.list({ archived: 'all' }).then((r) => setEmailAccounts(r.items)), []);
  const refreshDocuments = useCallback(() => resumesApi.list({ archived: 'all' }).then((r) => setDocuments(r.items)), []);

  useEffect(() => {
    if (!user) { setEmailAccounts([]); setDocuments([]); setLoaded(false); return; }
    Promise.all([refreshEmails(), refreshDocuments()]).catch(() => {}).finally(() => setLoaded(true));
  }, [user, refreshEmails, refreshDocuments]);

  const value = useMemo(() => ({
    emailAccounts,
    activeEmailAccounts: emailAccounts.filter((a) => !a.isArchived),
    defaultEmailAccount: emailAccounts.find((a) => a.isDefault && !a.isArchived),
    documents,
    resumes: documents.filter((d) => d.kind === 'resume'),
    loaded,
    refreshEmails,
    refreshDocuments,
  }), [emailAccounts, documents, loaded, refreshEmails, refreshDocuments]);

  return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}

export const useLookups = () => useContext(LookupsContext);

import { useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Bookmark, Check, CheckCheck, Clock, Copy, ExternalLink, Globe, Inbox, RefreshCw, Send, UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import { friendsApi, sharesApi } from '../api/endpoints.js';
import { errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHeader, Card, Button, Input, Tabs, CompanyLogo, EmptyState, ErrorState, SkeletonRows, ConfirmDialog,
} from '../components/ui/index.js';
import { initials, timeAgo } from '../lib/format.js';

const Avatar = ({ name }) => (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{initials(name)}</span>
);

function Person({ user, children, note }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      <Avatar name={user.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{[user.email, note].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  );
}

function FriendsTab({ refreshBadge }) {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => friendsApi.list(), [], { cacheKey: 'friends' });
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [newCodeOpen, setNewCodeOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const after = () => { reload(); refreshBadge?.(); };
  const add = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSending(true);
    try { const r = await friendsApi.request(code.trim()); toast.success(r.message); setCode(''); after(); } catch (err) { toast.error(errorMessage(err)); } finally { setSending(false); }
  };
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(data.myCode); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { toast.error('Copy failed. Select the code and copy it manually.'); }
  };
  const regenerate = async () => {
    setNewCodeOpen(false);
    try { await friendsApi.regenerateCode(); toast.success('New friend code created. The old one no longer works.'); reload(); } catch (err) { toast.error(errorMessage(err)); }
  };
  const act = async (id, fn, msg) => {
    setBusy(id);
    try { await fn(id); if (msg) toast.success(msg); after(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Your friend code" description="Share it with friends so they can add you. No one can find you without it.">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-border bg-subtle px-3 py-1.5 font-mono text-lg font-semibold tracking-widest" aria-label="Your friend code">
              {data?.myCode || '····-····'}
            </code>
            <Button size="sm" variant="secondary" icon={copied ? Check : Copy} disabled={!data?.myCode} onClick={copyCode}>{copied ? 'Copied' : 'Copy'}</Button>
          </div>
          <button type="button" onClick={() => setNewCodeOpen(true)} disabled={!data?.myCode}
            className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg disabled:opacity-50"><RefreshCw className="h-3 w-3" />Get a new code</button>
        </Card>
        <Card title="Add a friend" description="Enter your friend's code. Once they accept, you can send each other jobs.">
          <form onSubmit={add} className="flex flex-col gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="K7QM-3XPA" aria-label="Friend's code"
              autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} className="font-mono tracking-wider" />
            <Button type="submit" icon={UserPlus} loading={sending} disabled={!code.trim()}>Send request</Button>
          </form>
        </Card>
      </div>

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="card p-5"><SkeletonRows rows={3} /></div> : (
        <>
          {data.incoming.length > 0 && (
            <Card title="Friend requests" padded={false}>
              <ul className="divide-y divide-border">
                {data.incoming.map((f) => (
                  <Person key={f._id} user={f.user} note={timeAgo(f.since)}>
                    <Button size="sm" icon={Check} loading={busy === f._id} onClick={() => act(f._id, friendsApi.accept, `You and ${f.user.name} are now friends`)}>Accept</Button>
                    <Button size="sm" variant="secondary" icon={X} disabled={busy === f._id} onClick={() => act(f._id, friendsApi.remove)}>Decline</Button>
                  </Person>
                ))}
              </ul>
            </Card>
          )}

          <Card title={`Friends${data.friends.length ? ` (${data.friends.length})` : ''}`} padded={false}>
            {data.friends.length ? (
              <ul className="divide-y divide-border">
                {data.friends.map((f) => (
                  <Person key={f._id} user={f.user}>
                    <Button size="sm" variant="ghost" icon={UserMinus} onClick={() => setConfirm(f)} aria-label={`Remove ${f.user.name}`}>Remove</Button>
                  </Person>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Users} title="No friends yet" description="Swap friend codes with a friend and add them above. To send them jobs, select jobs on the Applications page and click Send to friends." />
            )}
          </Card>

          {data.outgoing.length > 0 && (
            <Card title="Waiting for a reply" padded={false}>
              <ul className="divide-y divide-border">
                {data.outgoing.map((f) => (
                  <Person key={f._id} user={f.user} note={`sent ${timeAgo(f.since)}`}>
                    <Button size="sm" variant="ghost" icon={X} loading={busy === f._id} onClick={() => act(f._id, friendsApi.remove, 'Request cancelled')}>Cancel</Button>
                  </Person>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <ConfirmDialog open={newCodeOpen} onClose={() => setNewCodeOpen(false)} title="Get a new friend code?" tone="warning"
        message="Your current code stops working, so anyone you gave it to will need the new one. Existing friends aren't affected."
        confirmLabel="Get new code" onConfirm={regenerate} />
      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} title={`Remove ${confirm?.user.name}?`}
        message="You won't be able to send each other jobs until one of you sends a new request. Jobs already shared stay where they are."
        confirmLabel="Remove friend" onConfirm={async () => { const f = confirm; setConfirm(null); await act(f._id, friendsApi.remove, `${f.user.name} removed`); }} />
    </div>
  );
}

function SharedTab({ refreshBadge }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(() => sharesApi.inbox(), [], { cacheKey: 'shares-inbox' });
  const [busy, setBusy] = useState(null);

  const update = (id, patch) => setData((d) => ({ ...d, items: d.items.map((i) => (i._id === id ? { ...i, ...patch } : i)) }));
  const add = async (item, { force = false } = {}) => {
    setBusy(item._id);
    try {
      const r = await sharesApi.acceptInbox(item._id, { force });
      update(item._id, { response: { action: 'added', application: r.application._id }, existingApplication: null });
      toast.success(`${item.job.jobTitle} added to Saved`);
      refreshBadge?.();
    } catch (e) {
      if (e.response?.status === 409) update(item._id, { existingApplication: e.response.data?.error?.details?.duplicateId || true });
      else toast.error(errorMessage(e));
    } finally { setBusy(null); }
  };
  const decline = async (item) => {
    setBusy(item._id);
    try { await sharesApi.declineInbox(item._id); update(item._id, { response: { action: 'declined' } }); refreshBadge?.(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const addAll = async () => {
    setBusy('all');
    try {
      const r = await sharesApi.acceptAll();
      toast.success(`${r.added} job${r.added === 1 ? '' : 's'} added to Saved${r.skipped ? `, ${r.skipped} you already track skipped` : ''}`);
      reload(); refreshBadge?.();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <div className="card p-5"><SkeletonRows rows={4} /></div>;
  const items = data.items;
  const pending = items.filter((i) => !i.response && !i.existingApplication);
  if (!items.length) {
    return <div className="card"><EmptyState icon={Inbox} title="Nothing shared with you yet" description="When a friend sends you jobs, they show up here and in your email." /></div>;
  }

  return (
    <div className="space-y-4">
      {pending.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-500/30 dark:bg-brand-500/10">
          <p className="text-sm">{pending.length} jobs waiting for you</p>
          <Button size="sm" icon={CheckCheck} loading={busy === 'all'} onClick={addAll}>Add all to Saved</Button>
        </div>
      )}
      <div className="card divide-y divide-border">
        {items.map((item) => {
          const { job } = item;
          const appId = item.response?.application || (typeof item.existingApplication === 'string' ? item.existingApplication : null);
          return (
            <div key={item._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <CompanyLogo name={job.companyName} website={job.companyWebsite} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{job.jobTitle}</p>
                  <p className="truncate text-sm text-muted">{job.companyName}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {job.jobPostingUrl && <a href={job.jobPostingUrl} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Posting</a>}
                    {job.companyWebsite && <a href={job.companyWebsite} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><Globe className="h-3 w-3" />Website</a>}
                    <span className="inline-flex items-center gap-1 text-muted"><Clock className="h-3 w-3" />From {item.sharedBy}, {timeAgo(item.sharedAt)}</span>
                  </div>
                  {item.message && <p className="mt-1.5 border-l-2 border-brand-300 pl-2 text-xs italic text-muted">{item.message}</p>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2 sm:justify-end">
                {item.response?.action === 'added' ? (
                  <Button size="sm" variant="secondary" icon={Check} onClick={() => appId && navigate(`/applications/${appId}`)}>Added · Open</Button>
                ) : item.existingApplication ? (
                  <>
                    <Button size="sm" variant="secondary" disabled={!appId} onClick={() => navigate(`/applications/${appId}`)}>Already tracked</Button>
                    <Button size="sm" variant="ghost" icon={Bookmark} loading={busy === item._id} disabled={Boolean(busy)} onClick={() => add(item, { force: true })}
                      title="Add it as a separate job if it's actually a different opening">Add anyway</Button>
                  </>
                ) : item.response?.action === 'declined' ? (
                  <>
                    <span className="self-center text-xs text-muted">Declined</span>
                    <Button size="sm" variant="ghost" icon={Bookmark} loading={busy === item._id} onClick={() => add(item)}>Add anyway</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" icon={Bookmark} loading={busy === item._id} disabled={Boolean(busy)} onClick={() => add(item)}>Add</Button>
                    <Button size="sm" variant="secondary" icon={X} disabled={Boolean(busy)} onClick={() => decline(item)}>Decline</Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">Shared jobs disappear from this list 30 days after they were sent. Jobs you added stay in your applications.</p>
    </div>
  );
}

export default function FriendsPage() {
  const [params, setParams] = useSearchParams();
  const { refreshFriends } = useOutletContext() || {};
  const tab = params.get('tab') === 'shared' ? 'shared' : 'friends';
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Friends" description="Send job openings to friends, and see the ones they send you." />
      <Tabs className="mb-6" value={tab} onChange={(v) => setParams(v === 'shared' ? { tab: 'shared' } : {}, { replace: true })}
        tabs={[{ value: 'friends', label: 'Friends', icon: Users }, { value: 'shared', label: 'Shared with me', icon: Send }]} />
      {tab === 'shared' ? <SharedTab refreshBadge={refreshFriends} /> : <FriendsTab refreshBadge={refreshFriends} />}
    </div>
  );
}

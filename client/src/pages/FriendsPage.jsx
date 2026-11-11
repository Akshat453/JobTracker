import { useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Ban, Bookmark, Check, CheckCheck, Clock, Copy, ExternalLink, Globe, Inbox, Link2, RefreshCw, Send, UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import { friendsApi, sharesApi } from '../api/endpoints.js';
import { errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHeader, Card, Button, Badge, Input, Segmented, Select, Tabs, CompanyLogo, EmptyState, ErrorState, SkeletonRows, ConfirmDialog,
} from '../components/ui/index.js';
import { fmtDate, initials, timeAgo } from '../lib/format.js';

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

const STATUS = {
  added: { label: 'Added', tone: 'emerald' },
  declined: { label: 'Declined', tone: 'zinc' },
  waiting: { label: 'Waiting', tone: 'amber' },
  stopped: { label: 'Stopped', tone: 'zinc' },
  expired: { label: 'Expired', tone: 'zinc' },
};
const friendStatus = (s) => s.response?.action || (s.revoked ? 'stopped' : !s.active ? 'expired' : 'waiting');

/** Groups shares by the job they came from, newest job first. */
function groupByJob(items) {
  const groups = new Map();
  for (const s of items) {
    const key = s.application || `${s.job.companyName}|${s.job.jobTitle}`.toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, job: s.job, application: s.application, shares: [] });
    groups.get(key).shares.push(s);
  }
  return [...groups.values()];
}

/** Groups shares by the friend they went to (A–Z); open links go last as "Share links". */
function groupByFriend(items) {
  const groups = new Map();
  for (const s of items) {
    const key = s.type === 'friend' ? String(s.recipient._id) : 'links';
    if (!groups.has(key)) groups.set(key, { key, recipient: s.recipient || null, shares: [] });
    groups.get(key).shares.push(s);
  }
  return [...groups.values()].sort((a, b) => (!a.recipient) - (!b.recipient) || (a.recipient?.name || '').localeCompare(b.recipient?.name || ''));
}

const shareState = (s) => (s.type === 'friend' ? friendStatus(s) : s.revoked ? 'stopped' : !s.active ? 'expired' : null);

/** One share inside a group. `show` is what the group doesn't already say: the friend (by job) or the job (by friend). */
function ShareLine({ s, show, stopping, onStop, onOpenApp }) {
  const st = shareState(s);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-subtle/50 px-3 py-2 text-sm">
      {show === 'job' ? (
        <span className="min-w-0 max-w-full">
          <span className="block truncate font-medium">{s.job.jobTitle} <span className="font-normal text-muted">at {s.job.companyName}</span></span>
          <span className="flex flex-wrap gap-x-3 text-xs">
            {s.job.jobPostingUrl && <a href={s.job.jobPostingUrl} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Posting</a>}
            {s.application && <button type="button" onClick={() => onOpenApp(s.application)} className="link">Open my application</button>}
          </span>
        </span>
      ) : s.type === 'friend' ? (
        <span className="inline-flex min-w-0 items-center gap-2 font-medium">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{initials(s.recipient.name)}</span>
          <span className="truncate">{s.recipient.name}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 font-medium"><Link2 className="h-4 w-4 text-muted" />Share link</span>
      )}
      <span className="text-xs text-muted" title={fmtDate(s.sharedAt)}>{timeAgo(s.sharedAt)}</span>
      {s.type === 'link' && (
        <span className="text-xs text-muted">
          {s.counts.added} added · {s.counts.declined} declined{s.active ? ` · works until ${fmtDate(s.expiresAt)}` : ''}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {st && <Badge tone={STATUS[st].tone}>{STATUS[st].label}</Badge>}
        {s.active && (s.type === 'link' || !s.response) && (
          <Button size="xs" variant="ghost" icon={Ban} loading={stopping === s._id} onClick={() => onStop(s)}
            aria-label={s.type === 'link' ? `Stop share link for ${s.job.jobTitle}` : `Stop sharing ${s.job.jobTitle} with ${s.recipient.name}`}>Stop</Button>
        )}
      </span>
      {s.message && <p className="w-full truncate text-xs italic text-muted">"{s.message}"</p>}
    </li>
  );
}

function SentTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload, setData } = useAsync(() => sharesApi.sent(), [], { cacheKey: 'shares-sent' });
  const [filter, setFilter] = useState('all');
  const [params, setParams] = useSearchParams();
  const view = params.get('by') === 'friend' ? 'friend' : 'job';
  const friendFilter = params.get('friend') || '';
  const setParam = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const [stopping, setStopping] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const stop = async (share) => {
    setConfirm(null); setStopping(share._id);
    try {
      await sharesApi.stop(share._id);
      setData((d) => ({ ...d, items: d.items.map((i) => (i._id === share._id ? { ...i, active: false, revoked: true } : i)) }));
      toast.success(share.type === 'link' ? 'Link stopped. It no longer works.' : `Removed from ${share.recipient.name}'s "Shared with me"`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setStopping(null); }
  };

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <div className="card p-5"><SkeletonRows rows={4} /></div>;
  const items = data.items;
  if (!items.length) {
    return (
      <div className="card">
        <EmptyState icon={Send} title="You haven't shared any jobs yet"
          description="Select jobs on the Applications page and click Send to friends, or use Share on a job to make a link. Everything you share shows up here." />
      </div>
    );
  }

  const friendShares = items.filter((i) => i.type === 'friend');
  const count = (st) => friendShares.filter((s) => friendStatus(s) === st).length;
  const friendOptions = [...new Map(friendShares.map((s) => [String(s.recipient._id), s.recipient.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  const matchesStatus = (s) => filter === 'all' || (s.type === 'friend' ? friendStatus(s) === filter : filter === 'links');
  const matchesFriend = (s) => !friendFilter || (s.type === 'friend' && String(s.recipient._id) === friendFilter);
  const shown = items.filter((s) => matchesStatus(s) && matchesFriend(s));
  const groups = view === 'friend' ? groupByFriend(shown) : groupByJob(shown);
  const filters = [
    { value: 'all', label: 'All' },
    { value: 'waiting', label: `Waiting${count('waiting') ? ` (${count('waiting')})` : ''}` },
    { value: 'added', label: `Added${count('added') ? ` (${count('added')})` : ''}` },
    { value: 'declined', label: 'Declined' },
    { value: 'links', label: 'Links' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Jobs shared', groupByJob(items).length, ''],
          ['Added by friends', count('added'), 'text-emerald-600 dark:text-emerald-400'],
          ['Waiting', count('waiting'), 'text-amber-600 dark:text-amber-400'],
          ['Declined', count('declined'), 'text-muted'],
        ].map(([label, value, tone]) => (
          <div key={label} className="card px-4 py-3">
            <p className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={(v) => setParam('by', v === 'friend' ? 'friend' : '')}
          options={[{ value: 'job', label: 'By job' }, { value: 'friend', label: 'By friend' }]} />
        {friendOptions.length > 0 && (
          <Select aria-label="Show shares with" value={friendFilter} onChange={(e) => setParam('friend', e.target.value)}
            options={[{ value: '', label: 'All friends' }, ...friendOptions]} className="h-8 w-auto min-w-[9rem] py-0 text-sm" />
        )}
      </div>
      <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 scrollbar-none"><Segmented value={filter} onChange={setFilter} options={filters} /></div>

      {!groups.length ? (
        <div className="card"><EmptyState icon={Send} title="Nothing here" description="No shared jobs match this filter." /></div>
      ) : (
        <div className="card divide-y divide-border">
          {groups.map((g) => (view === 'friend' ? (
            <div key={g.key} className="p-4">
              <div className="flex items-center gap-3">
                {g.recipient ? <Avatar name={g.recipient.name} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle"><Link2 className="h-4 w-4 text-muted" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{g.recipient ? g.recipient.name : 'Share links'}</p>
                  <p className="text-xs text-muted">
                    {g.shares.length} job{g.shares.length === 1 ? '' : 's'}
                    {g.recipient && ['added', 'waiting', 'declined'].map((st) => {
                      const n = g.shares.filter((s) => friendStatus(s) === st).length;
                      return n ? ` · ${n} ${st}` : '';
                    }).join('')}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-2 sm:pl-12">
                {g.shares.map((s) => <ShareLine key={s._id} s={s} show="job" stopping={stopping} onStop={setConfirm} onOpenApp={(id) => navigate(`/applications/${id}`)} />)}
              </ul>
            </div>
          ) : (
            <div key={g.key} className="p-4">
              <div className="flex items-start gap-3">
                <CompanyLogo name={g.job.companyName} website={g.job.companyWebsite} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{g.job.jobTitle}</p>
                  <p className="truncate text-sm text-muted">{g.job.companyName}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {g.job.jobPostingUrl && <a href={g.job.jobPostingUrl} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Posting</a>}
                    {g.application && <button type="button" onClick={() => navigate(`/applications/${g.application}`)} className="link">Open my application</button>}
                  </div>
                </div>
              </div>
              <ul className="mt-3 space-y-2 sm:pl-12">
                {g.shares.map((s) => <ShareLine key={s._id} s={s} show="friend" stopping={stopping} onStop={setConfirm} />)}
              </ul>
            </div>
          )))}
        </div>
      )}
      <p className="text-xs text-muted">Shares are listed here for a year. Links and friend shares stop working after 30 days, or when you stop them; jobs your friends already added stay in their tracker.</p>

      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} tone="warning" confirmLabel="Stop sharing" onConfirm={() => stop(confirm)}
        title={confirm?.type === 'link' ? 'Stop this share link?' : `Stop sharing with ${confirm?.recipient?.name}?`}
        message={confirm?.type === 'link'
          ? "The link stops working for anyone who hasn't opened it yet. People who already added the job keep it."
          : `It disappears from their "Shared with me" list. If they already added the job, they keep it.`} />
    </div>
  );
}

export default function FriendsPage() {
  const [params, setParams] = useSearchParams();
  const { refreshFriends } = useOutletContext() || {};
  const tab = ['shared', 'sent'].includes(params.get('tab')) ? params.get('tab') : 'friends';
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Friends" description="Send job openings to friends, see the ones they send you, and track what you've shared." />
      <Tabs className="mb-6" value={tab} onChange={(v) => setParams(v === 'friends' ? {} : { tab: v }, { replace: true })}
        tabs={[{ value: 'friends', label: 'Friends', icon: Users }, { value: 'shared', label: 'Shared with me', icon: Inbox }, { value: 'sent', label: 'Sent', icon: Send }]} />
      {tab === 'shared' ? <SharedTab refreshBadge={refreshFriends} /> : tab === 'sent' ? <SentTab /> : <FriendsTab refreshBadge={refreshFriends} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Send, UserPlus } from 'lucide-react';
import { friendsApi } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Field, Modal, SkeletonRows, Textarea } from '../ui/index.js';
import { cn, initials } from '../../lib/format.js';

/**
 * Sends the given jobs to chosen friends: they get one email listing all of them, and the jobs
 * appear in their "Shared with me" list to add or decline. Only company, website, job title and
 * posting link are shared.
 */
export function SendToFriendsModal({ open, onClose, jobs, onSent }) {
  const toast = useToast();
  const [friends, setFriends] = useState(null);
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(() => new Set());
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChosen(new Set()); setMessage(''); setError(null);
    friendsApi.list().then((d) => setFriends(d.friends)).catch((e) => setError(errorMessage(e)));
  }, [open]);

  const toggle = (id) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const send = async () => {
    setSending(true);
    try {
      const r = await friendsApi.sendJobs({ applicationIds: jobs.map((j) => j._id), friendIds: [...chosen], message: message.trim() || undefined });
      const who = r.friends === 1 ? friends.find((f) => chosen.has(f.user._id))?.user.name : `${r.friends} friends`;
      toast.success(`Sent ${r.jobs} job${r.jobs === 1 ? '' : 's'} to ${who}${r.emailConfigured && r.emailed < r.friends ? ' (some emails failed; they can still see them in the app)' : ''}`);
      onSent?.();
      onClose();
    } catch (e) { toast.error(errorMessage(e, 'Could not send')); } finally { setSending(false); }
  };

  const n = jobs.length;
  return (
    <Modal open={open} onClose={onClose} title={`Send ${n} job${n === 1 ? '' : 's'} to friends`}
      description="They get an email with the jobs and can add them to their Saved list in one click."
      footer={friends?.length ? (
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Send} loading={sending} disabled={!chosen.size} onClick={send}>
            Send{chosen.size ? ` to ${chosen.size}` : ''}
          </Button>
        </>
      ) : null}>
      <div className="space-y-4">
        <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-sm scrollbar-thin">
          {jobs.map((j) => (
            <li key={j._id} className="truncate"><span className="font-medium">{j.jobTitle}</span> <span className="text-muted">at {j.company.name}</span></li>
          ))}
        </ul>

        {error ? <p className="text-sm text-red-600">{error}</p> : !friends ? <SkeletonRows rows={2} /> : !friends.length ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm">
            <p className="text-muted">You haven't added any friends yet.</p>
            <Link to="/friends" onClick={onClose} className="link mt-2 inline-flex items-center gap-1"><UserPlus className="h-4 w-4" />Add a friend</Link>
          </div>
        ) : (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Send to</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {friends.map((f) => {
                  const on = chosen.has(f.user._id);
                  return (
                    <button key={f._id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(f.user._id)}
                      className={cn('flex items-center gap-3 rounded-lg border p-2.5 text-left transition', on ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30 dark:bg-brand-500/10' : 'border-border hover:bg-subtle')}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{initials(f.user.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{f.user.name}</span>
                        <span className="block truncate text-xs text-muted">{f.user.email}</span>
                      </span>
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-border')}>{on && <Check className="h-3.5 w-3.5" />}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <Field label="Message (optional)">
              <Textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Thought these might suit you!" />
            </Field>
            <p className="text-xs text-muted">Only the company, website, job title and posting link are shared. Your status, notes and other details stay private.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

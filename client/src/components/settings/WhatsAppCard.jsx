import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, MessageCircle, Unplug } from 'lucide-react';
import { whatsappApi } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Toggle, Skeleton } from '../ui/index.js';
import { timeAgo } from '../../lib/format.js';

const EXAMPLES = [
  ['Save a job', 'https://jobs.lever.co/acme/123 Acme'],
  ['Set a reminder', 'remind me to call the recruiter tomorrow 5pm'],
  ['See reminders', 'reminders'],
  ['See saved jobs', 'saved'],
];

/** Connect a WhatsApp number: the user sends a one-time code to the bot from that number. */
export function WhatsAppCard() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = () => whatsappApi.status().then(setStatus).catch((e) => toast.error(errorMessage(e)));
  useEffect(() => { load(); return () => clearInterval(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // While a code is showing, check every few seconds whether the message has arrived.
  useEffect(() => {
    clearInterval(timer.current);
    if (!link) return undefined;
    const until = Date.now() + link.expiresInMinutes * 60_000;
    timer.current = setInterval(async () => {
      if (Date.now() > until) { setLink(null); return; }
      const s = await whatsappApi.status().catch(() => null);
      if (s?.connected) { setStatus(s); setLink(null); toast.success('WhatsApp connected'); }
    }, 3000);
    return () => clearInterval(timer.current);
  }, [link]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true);
    try { setLink(await whatsappApi.linkCode()); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const setReminders = async (on) => {
    try { setStatus(await whatsappApi.update({ remindersEnabled: on })); } catch (e) { toast.error(errorMessage(e)); }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp? The bot will stop sending you reminders and accepting jobs from this number.')) return;
    try { setStatus(await whatsappApi.disconnect()); toast.success('WhatsApp disconnected'); } catch (e) { toast.error(errorMessage(e)); }
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Copy failed'); } };

  return (
    <Card title="WhatsApp" description="Save jobs, set reminders and get reminders by messaging the Job Tracker bot on WhatsApp.">
      {!status ? <Skeleton className="h-20" /> : !status.configured ? (
        <p className="text-sm text-muted">WhatsApp isn't set up on this server yet. The site owner needs to add the WhatsApp Cloud API settings.</p>
      ) : status.connected ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Connected: <span className="whitespace-nowrap">{status.phone}</span></p>
                {status.linkedAt && <p className="text-xs text-muted">Since {timeAgo(status.linkedAt)}</p>}
              </div>
            </div>
            <Button size="sm" variant="secondary" icon={MessageCircle} onClick={() => window.open(`https://wa.me/${status.botNumber}?text=help`, '_blank', 'noopener')}>Open chat</Button>
            <Button size="sm" variant="ghost" icon={Unplug} className="text-red-600 dark:text-red-400" onClick={disconnect}>Disconnect</Button>
          </div>
          <Toggle checked={status.remindersEnabled} onChange={setReminders} label="Send my reminders on WhatsApp"
            description="Reminders you set on WhatsApp arrive at their time; interview, follow-up and deadline reminders arrive within the time chosen under Email notifications." />
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted">Things you can send</p>
            <ul className="space-y-1.5 text-sm">
              {EXAMPLES.map(([label, text]) => (
                <li key={label} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><span className="w-28 shrink-0 text-muted">{label}</span><code className="break-all rounded bg-subtle px-1.5 py-0.5 text-xs">{text}</code></li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Send just a job link and the company name, website and job title are filled in from the posting when possible. The bot asks for anything it can't find.</p>
          </div>
        </div>
      ) : link ? (
        <div className="space-y-3">
          <p className="text-sm">Send this message to the bot <b>from the phone you want to connect</b>:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-subtle px-3 py-2 font-mono text-sm">{link.text}</code>
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(link.text)} aria-label="Copy message" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={MessageCircle} onClick={() => window.open(link.url, '_blank', 'noopener')}>Open WhatsApp</Button>
            <Button variant="ghost" onClick={() => setLink(null)}>Cancel</Button>
          </div>
          <p className="text-xs text-muted">Or message +{status.botNumber} yourself. The code works once and expires in {link.expiresInMinutes} minutes. This page updates when it arrives.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Connect your number to send job links and reminders to Job Tracker from WhatsApp, and to get your reminders there.</p>
          <Button icon={MessageCircle} loading={busy} onClick={start}>Connect WhatsApp</Button>
        </div>
      )}
    </Card>
  );
}

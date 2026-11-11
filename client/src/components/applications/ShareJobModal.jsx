import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { sharesApi } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, CompanyLogo, Input, Modal } from '../ui/index.js';
import { fmtDate } from '../../lib/format.js';

/**
 * Creates a link a friend can open to add this job to their own tracker. Only the four fields shown
 * here are shared; the dialog lists them so it's clear nothing else leaves the user's account.
 */
export function ShareJobModal({ app, open, onClose }) {
  const toast = useToast();
  const [link, setLink] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (!open) { setLink(null); setCopied(false); } }, [open]);

  const create = async () => {
    setCreating(true);
    try { setLink(await sharesApi.create(app._id)); } catch (e) { toast.error(errorMessage(e, 'Could not create the link')); } finally { setCreating(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Copy failed. Select the link and copy it manually.'); }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = () => navigator.share({
    title: `${app.jobTitle} at ${app.company.name}`,
    text: `Found a job you might like: ${app.jobTitle} at ${app.company.name}`,
    url: link.url,
  }).catch(() => {});

  const shared = [
    ['Company', app.company.name],
    ['Website', app.company.website],
    ['Job title', app.jobTitle],
    ['Job posting', app.jobPostingUrl],
  ];

  return (
    <Modal open={open} onClose={onClose} title="Share this job" description="A friend on Job Tracker can add it to their Saved / Interested list in one click.">
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-3">
          <div className="mb-3 flex items-center gap-3">
            <CompanyLogo name={app.company.name} website={app.company.website} />
            <div className="min-w-0">
              <p className="truncate font-medium">{app.jobTitle}</p>
              <p className="truncate text-sm text-muted">{app.company.name}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {shared.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0 truncate">{v || <span className="text-muted">Not set</span>}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">Only these four details are shared. Your status, notes, resume, email and dates stay private.</p>
        </div>

        {!link ? (
          <Button icon={Link2} loading={creating} onClick={create} className="w-full">Create share link</Button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Share link" className="min-w-0 flex-1" />
              <Button variant="secondary" icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
            </div>
            {canNativeShare && <Button variant="secondary" icon={Share2} onClick={nativeShare} className="w-full">Share via…</Button>}
            <p className="text-xs text-muted">
              Your friend needs a Job Tracker account to open it. The link works until {fmtDate(link.expiresAt)}; anyone you send it to can use it.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

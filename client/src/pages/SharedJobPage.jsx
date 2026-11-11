import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, Check, ExternalLink, Globe, Link2Off, X } from 'lucide-react';
import { sharesApi } from '../api/endpoints.js';
import { errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Card, CompanyLogo, EmptyState, Skeleton } from '../components/ui/index.js';
import { domainOf, fmtDate } from '../lib/format.js';

const ExtLink = ({ href, icon: Icon, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="link inline-flex min-w-0 items-center gap-1.5">
    <Icon className="h-4 w-4 shrink-0" /><span className="truncate">{children}</span>
  </a>
);

export default function SharedJobPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, setData } = useAsync(() => sharesApi.get(token), [token]);
  const [busy, setBusy] = useState(null);
  const [duplicateId, setDuplicateId] = useState(null);

  const accept = async () => {
    setBusy('add');
    try {
      const r = await sharesApi.accept(token);
      toast.success(r.alreadyAdded ? 'Already in your Saved list' : 'Added to your Saved / Interested list');
      navigate(`/applications/${r.application._id}`);
    } catch (e) {
      if (e.response?.status === 409) setDuplicateId(e.response.data?.error?.details?.duplicateId || data?.existingApplication || null);
      else toast.error(errorMessage(e, 'Could not add this job'));
    } finally { setBusy(null); }
  };

  const decline = async () => {
    setBusy('decline');
    try {
      await sharesApi.decline(token);
      setData((d) => ({ ...d, response: { action: 'declined', at: new Date().toISOString() } }));
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };

  if (loading && !data) {
    return <div className="mx-auto max-w-xl"><Card><div className="space-y-3"><Skeleton className="h-12 w-12 rounded-xl" /><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-10 w-full" /></div></Card></div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState icon={Link2Off} title="This link doesn't work" description={`${error || 'The link is invalid or has expired.'} Ask your friend to share the job again.`}
          action={<Button variant="secondary" onClick={() => navigate('/')}>Go to dashboard</Button>} />
      </div>
    );
  }

  const { job, sharedBy, isOwner, response, existingApplication } = data;
  const existing = duplicateId || existingApplication;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm text-muted">{isOwner ? 'You shared this job' : <><b className="text-fg">{sharedBy}</b> shared a job with you</>}</p>
      <Card>
        <div className="flex items-start gap-4">
          <CompanyLogo name={job.companyName} website={job.companyWebsite} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight">{job.jobTitle}</h1>
            <p className="mt-0.5 text-muted">{job.companyName}</p>
            <div className="mt-3 flex flex-col gap-1.5 text-sm">
              {job.jobPostingUrl && <ExtLink href={job.jobPostingUrl} icon={ExternalLink}>View job posting</ExtLink>}
              {job.companyWebsite && <ExtLink href={job.companyWebsite} icon={Globe}>{domainOf(job.companyWebsite)}</ExtLink>}
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          {isOwner ? (
            <p className="text-sm text-muted">Send this page's link to a friend. They'll be able to add the job to their own tracker. It works until {fmtDate(data.expiresAt)}.</p>
          ) : response?.action === 'added' && response.application ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" />You added this job</p>
              <Button variant="secondary" onClick={() => navigate(`/applications/${response.application}`)}>Open</Button>
            </div>
          ) : existing ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">You already track this job.</p>
              <Button variant="secondary" onClick={() => navigate(`/applications/${existing}`)}>Open it</Button>
            </div>
          ) : response?.action === 'declined' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 text-sm text-muted"><X className="h-4 w-4" />You declined this job</p>
              <Button variant="secondary" icon={Bookmark} loading={busy === 'add'} onClick={accept}>Add it anyway</Button>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Add it to your tracker as <b className="text-fg">Saved / Interested</b>? You can apply and update it later.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button icon={Bookmark} loading={busy === 'add'} disabled={Boolean(busy)} onClick={accept} className="sm:flex-1">Add to my Saved</Button>
                <Button variant="secondary" icon={X} loading={busy === 'decline'} disabled={Boolean(busy)} onClick={decline} className="sm:flex-1">Decline</Button>
              </div>
            </>
          )}
        </div>
      </Card>
      <p className="text-center text-xs text-muted">Only the company, website, job title and posting link were shared. <Link to="/applications" className="link">Your applications</Link></p>
    </div>
  );
}

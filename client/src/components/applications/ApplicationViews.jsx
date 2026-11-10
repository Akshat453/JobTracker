import { Link, useNavigate } from 'react-router-dom';
import { Mail, FileText, Calendar, AlertCircle, ExternalLink, MapPin } from 'lucide-react';
import { CompanyLogo, PriorityBadge } from '../ui/index.js';
import { StatusMenu } from './StatusMenu.jsx';
import { ApplicationActionsMenu } from './ApplicationActionsMenu.jsx';
import { fmtShort, relativeDay, isOverdue, fmtSalary, cn } from '../../lib/format.js';

const resumeLabel = (a) => {
  const r = a.resume || a.resumeSnapshot;
  if (!r?.name) return null;
  return `${r.name}${r.version ? ` (${r.version})` : ''}`;
};

function FollowUp({ date }) {
  if (!date) return <span className="text-muted">—</span>;
  const overdue = isOverdue(date);
  return (
    <span className={cn('inline-flex items-center gap-1', overdue && 'text-red-600 dark:text-red-400')} title={relativeDay(date)}>
      {overdue && <AlertCircle className="h-3.5 w-3.5" />}{fmtShort(date)}
    </span>
  );
}

export function ApplicationTable({ items, actions }) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted">
            <th className="px-4 py-2.5 font-medium">Company</th>
            <th className="px-3 py-2.5 font-medium">Applied</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Email used</th>
            <th className="px-3 py-2.5 font-medium">Resume used</th>
            <th className="px-3 py-2.5 font-medium">Source</th>
            <th className="px-3 py-2.5 font-medium">Follow-up</th>
            <th className="w-10 px-3 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((a) => (
            <tr key={a._id} onClick={() => navigate(`/applications/${a._id}`)} className="group cursor-pointer transition-colors hover:bg-subtle/50">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <CompanyLogo name={a.company.name} website={a.company.website} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{a.company.name}</span>
                      {a.priority === 'High' && <PriorityBadge priority="High" />}
                    </div>
                    <div className="truncate text-xs text-muted">{a.jobTitle}</div>
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmtShort(a.applicationDate)}</td>
              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                <StatusMenu status={a.status} short onChange={(s) => actions.setStatus(a, s)} />
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-muted" title={a.emailUsed?.address}>{a.emailUsed?.address || '—'}</td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-muted" title={resumeLabel(a) || ''}>{resumeLabel(a) || '—'}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-muted">{a.source || '—'}</td>
              <td className="whitespace-nowrap px-3 py-2.5"><FollowUp date={a.nextFollowUpDate} /></td>
              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><ApplicationActionsMenu app={a} actions={actions} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApplicationCards({ items, actions }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((a) => (
        <div key={a._id} className="card group flex flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-pop">
          <div className="flex items-start gap-3">
            <CompanyLogo name={a.company.name} website={a.company.website} />
            <Link to={`/applications/${a._id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium group-hover:text-brand-600">{a.company.name}</p>
              <p className="truncate text-sm text-muted">{a.jobTitle}</p>
            </Link>
            <ApplicationActionsMenu app={a} actions={actions} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusMenu status={a.status} onChange={(s) => actions.setStatus(a, s)} />
            <PriorityBadge priority={a.priority} />
            {a.employmentType && <span className="text-xs text-muted">{a.employmentType}{a.workMode ? ` · ${a.workMode}` : ''}</span>}
          </div>
          <dl className="mt-4 space-y-1.5 text-xs text-muted">
            {a.company.location && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{a.company.location}</div>}
            <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />Applied {fmtShort(a.applicationDate)} via {a.source}</div>
            <div className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{a.emailUsed?.address || 'No email recorded'}</span></div>
            <div className="flex items-center gap-2 truncate"><FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{resumeLabel(a) || 'No resume recorded'}</span></div>
          </dl>
          <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs">
            <span className="text-muted">{fmtSalary(a.salary) || ' '}</span>
            {a.nextFollowUpDate ? <span className="text-muted">Follow-up: <FollowUp date={a.nextFollowUpDate} /></span>
              : (a.jobPostingUrl && <a href={a.jobPostingUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">Posting <ExternalLink className="h-3 w-3" /></a>)}
          </div>
        </div>
      ))}
    </div>
  );
}

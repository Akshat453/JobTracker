import { ChevronDown } from 'lucide-react';
import { Menu, StatusBadge } from '../ui/index.js';
import { STATUSES } from '../../lib/constants.js';
import { DOT } from '../../lib/constants.js';

/** Clickable status badge that opens a menu to change status. */
export function StatusMenu({ status, onChange, short }) {
  return (
    <Menu
      width="w-56"
      align="left"
      trigger={(
        <button type="button" className="group inline-flex items-center gap-0.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40" title="Change status">
          <StatusBadge status={status} short={short} />
          <ChevronDown className="h-3 w-3 text-muted opacity-0 transition group-hover:opacity-100" />
        </button>
      )}
      items={STATUSES.map((s) => ({
        label: s.label,
        icon: (props) => <span className={`${props.className} flex items-center justify-center`}><span className={`h-2 w-2 rounded-full ${DOT[s.color]}`} /></span>,
        active: s.value === status,
        onClick: () => s.value !== status && onChange(s.value),
      }))}
    />
  );
}

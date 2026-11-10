import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Eye, Pencil, Copy, ExternalLink, Trash2 } from 'lucide-react';
import { Menu } from '../ui/index.js';

export function ApplicationActionsMenu({ app, actions }) {
  const navigate = useNavigate();
  const link = app.jobPostingUrl || app.applicationLink;
  return (
    <Menu
      trigger={<button className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></button>}
      items={[
        { label: 'View details', icon: Eye, onClick: () => navigate(`/applications/${app._id}`) },
        { label: 'Edit', icon: Pencil, onClick: () => navigate(`/applications/${app._id}/edit`) },
        { label: 'Duplicate', icon: Copy, onClick: () => actions.duplicate(app) },
        link && { label: 'Open job posting', icon: ExternalLink, onClick: () => window.open(link, '_blank', 'noopener,noreferrer') },
        { divider: true },
        { label: 'Delete', icon: Trash2, danger: true, onClick: () => actions.remove(app) },
      ]}
    />
  );
}

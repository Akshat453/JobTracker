import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Table2, LayoutGrid, KanbanSquare, Download, Briefcase, SearchX, Send, X } from 'lucide-react';
import { applicationsApi } from '../api/endpoints.js';
import { downloadFile, errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useUrlFilters } from '../hooks/useUrlFilters.js';
import { useApplicationActions } from '../hooks/useApplicationActions.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Button, Segmented, Pagination, SkeletonRows, EmptyState, ErrorState } from '../components/ui/index.js';
import { ApplicationFilters, FILTER_KEYS } from '../components/applications/ApplicationFilters.jsx';
import { ApplicationTable, ApplicationCards } from '../components/applications/ApplicationViews.jsx';
import { KanbanBoard } from '../components/applications/KanbanBoard.jsx';
import { SendToFriendsModal } from '../components/friends/SendToFriendsModal.jsx';

const VIEW_KEY = 'jt-app-view';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || 'table'; } catch { return 'table'; } };

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters();
  const view = filters.view || readView();
  const page = Number(filters.page) || 1;
  const limit = view === 'kanban' ? 500 : view === 'cards' ? 18 : 20;

  const query = { ...Object.fromEntries(FILTER_KEYS.map((k) => [k, filters[k]]).filter(([, v]) => v)), sort: filters.sort || 'newest', page: view === 'kanban' ? 1 : page, limit };
  const { data, loading, error, reload, setData } = useAsync(() => applicationsApi.list(query), [JSON.stringify(query)], { cacheKey: `apps:${JSON.stringify(query)}` });

  const actions = useApplicationActions({
    onChange: (kind, { id, status }) => setData((d) => d && ({
      ...d,
      items: kind === 'delete' ? d.items.filter((a) => a._id !== id) : d.items.map((a) => (a._id === id ? { ...a, status } : a)),
      total: kind === 'delete' ? d.total - 1 : d.total,
    })),
  });

  // Selected jobs (kept while paging or filtering) for "Send to friends".
  const [selected, setSelected] = useState(() => new Map());
  const [sendOpen, setSendOpen] = useState(false);
  const selection = useMemo(() => ({
    has: (id) => selected.has(id),
    toggle: (a, on) => setSelected((m) => { const n = new Map(m); if (on) n.set(a._id, a); else n.delete(a._id); return n; }),
    setMany: (list, on) => setSelected((m) => { const n = new Map(m); list.forEach((a) => (on ? n.set(a._id, a) : n.delete(a._id))); return n; }),
  }), [selected]);

  const setView = (v) => {
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
    // Carry filters across views; drop paging.
    const { view: _v, page: _p, ...rest } = filters;
    setFilters({ ...rest, view: v });
  };

  const exportCsv = () => downloadFile('/applications/export/csv', 'applications.csv', { ...query, page: undefined, limit: undefined })
    .then(() => toast.success('CSV exported'))
    .catch((e) => toast.error(errorMessage(e, 'Export failed')));

  const hasFilters = FILTER_KEYS.some((k) => filters[k]);
  const items = data?.items || [];

  return (
    <div>
      <PageHeader
        title="Applications"
        description={data ? `${data.total} application${data.total === 1 ? '' : 's'}${hasFilters ? ' match your filters' : ''}` : 'Every job you have saved or applied to'}
        actions={(
          <>
            <Segmented value={view} onChange={setView} options={[
              { value: 'table', label: 'Table', icon: Table2 },
              { value: 'cards', label: 'Cards', icon: LayoutGrid },
              { value: 'kanban', label: 'Kanban', icon: KanbanSquare },
            ]} />
            <Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>
          </>
        )}
      />

      <div className="mb-4">
        <ApplicationFilters filters={filters} onChange={(f) => setFilters({ ...f, view: filters.view, page: undefined })} showSort={view !== 'kanban'} />
      </div>

      {error && !data ? <ErrorState message={error} onRetry={reload} />
        : loading && !data ? <div className="card p-5"><SkeletonRows rows={8} /></div>
          : !items.length ? (
            <div className="card">
              {hasFilters
                ? <EmptyState icon={SearchX} title="No matching applications" description="Try a different search or clear some filters."
                    action={<Button variant="secondary" onClick={() => setFilters({ view: filters.view })}>Clear filters</Button>} />
                : <EmptyState icon={Briefcase} title="No applications yet" description="Track your first job application to get started."
                    action={<Button icon={Plus} onClick={() => navigate('/applications/new')}>Add application</Button>} />}
            </div>
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              {view === 'kanban' ? <KanbanBoard items={items} actions={actions} />
                : view === 'cards' ? <ApplicationCards items={items} actions={actions} selection={selection} />
                  : <div className="card overflow-hidden"><ApplicationTable items={items} actions={actions} selection={selection} /></div>}
              {view !== 'kanban' && (
                <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit}
                  onChange={(p) => { setFilters({ ...filters, page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
              )}
            </div>
          )}
      {actions.dialog}

      {selected.size > 0 && view !== 'kanban' && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:pl-60">
          <div role="toolbar" aria-label="Selected jobs" className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-surface p-2 pl-4 shadow-pop">
            <span className="whitespace-nowrap text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" icon={Send} onClick={() => setSendOpen(true)}>Send to friends</Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => setSelected(new Map())} aria-label="Clear selection">Clear</Button>
          </div>
        </div>
      )}
      <SendToFriendsModal open={sendOpen} onClose={() => setSendOpen(false)} jobs={[...selected.values()]} onSent={() => setSelected(new Map())} />
    </div>
  );
}

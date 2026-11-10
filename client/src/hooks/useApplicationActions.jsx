import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { applicationsApi } from '../api/endpoints.js';
import { errorMessage } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { ConfirmDialog } from '../components/ui/index.js';
import { STATUS_MAP } from '../lib/constants.js';

/**
 * Shared actions for an application (status change, duplicate, delete) plus the confirm dialog.
 * `onChange(kind, payload)` lets the caller update its local state.
 */
export function useApplicationActions({ onChange } = {}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const setStatus = async (app, status) => {
    const prev = app.status;
    onChange?.('status', { id: app._id, status });
    try {
      await applicationsApi.setStatus(app._id, status);
      toast.success(`Moved to ${STATUS_MAP[status].label}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            onChange?.('status', { id: app._id, status: prev });
            await applicationsApi.setStatus(app._id, prev, 'Undo').catch(() => {});
          },
        },
      });
    } catch (e) {
      onChange?.('status', { id: app._id, status: prev });
      toast.error(errorMessage(e, 'Could not update status'));
    }
  };

  const duplicate = async (app) => {
    try {
      const { application } = await applicationsApi.duplicate(app._id);
      toast.success('Application duplicated');
      navigate(`/applications/${application._id}/edit`);
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await applicationsApi.remove(toDelete._id);
      toast.success('Application deleted');
      onChange?.('delete', { id: toDelete._id });
      setToDelete(null);
    } catch (e) { toast.error(errorMessage(e)); } finally { setDeleting(false); }
  };

  const dialog = (
    <ConfirmDialog
      open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={confirmDelete} loading={deleting}
      title="Delete application?"
      message={<>This permanently deletes <b>{toDelete?.jobTitle}</b> at <b>{toDelete?.company?.name}</b>, including its interviews, reminders and history. Resumes and email accounts are kept.</>}
    />
  );

  return { setStatus, duplicate, remove: setToDelete, dialog };
}

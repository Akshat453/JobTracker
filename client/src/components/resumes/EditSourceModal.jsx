import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal, Button } from '../ui/index.js';
import { resumesApi } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useServerConfig } from '../../hooks/useServerConfig.js';
import { SourceFields, SOURCE_EXT } from './SourceFields.jsx';

/** Attaches, replaces or removes the editable source (Word / LaTeX / .zip file and/or link) of one version. */
export function EditSourceModal({ doc, onClose, onSaved }) {
  const toast = useToast();
  const { maxUploadMb: MAX_MB } = useServerConfig();
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => { if (doc) { setFile(null); setUrl(doc.source?.url || ''); setError(''); } }, [doc]);

  const pick = (f) => {
    setError('');
    if (!f) return setFile(null);
    if (!SOURCE_EXT.test(f.name)) return setError('Choose a Word (.docx, .doc), LaTeX (.tex) or Overleaf .zip file');
    if (f.size > MAX_MB * 1024 * 1024) return setError(`File is larger than ${MAX_MB} MB`);
    setFile(f);
  };
  const changed = Boolean(file) || url.trim() !== (doc?.source?.url || '');

  const save = async () => {
    const fd = new FormData();
    fd.append('sourceUrl', url.trim());
    if (file) fd.append('source', file);
    setBusy('save');
    try { await resumesApi.setSource(doc._id, fd); toast.success('Editable source saved'); onSaved(); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy('remove');
    try { await resumesApi.removeSource(doc._id); toast.success('Editable source removed'); onSaved(); onClose(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };

  return (
    <Modal open={Boolean(doc)} onClose={onClose} size="md" title="Editable source"
      description={doc ? `${doc.name} · ${doc.version || `v${doc.versionNumber}`}` : ''}
      footer={(
        <>
          {doc?.source && <Button variant="danger-ghost" icon={Trash2} loading={busy === 'remove'} disabled={Boolean(busy)} onClick={remove} className="mr-auto">Remove</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy === 'save'} disabled={!changed || Boolean(busy)} onClick={save}>Save</Button>
        </>
      )}>
      {doc && <SourceFields file={file} onFile={pick} url={url} onUrl={setUrl} error={error} existingFile={doc.source?.file} />}
    </Modal>
  );
}

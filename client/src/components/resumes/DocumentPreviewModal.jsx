import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Modal, Button, EmptyState } from '../ui/index.js';
import { resumesApi } from '../../api/endpoints.js';
import { downloadFile, errorMessage } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';

/** Fetches the protected file as a blob (auth header) and previews PDFs inline. */
export function DocumentPreviewModal({ doc, onClose }) {
  const toast = useToast();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  const isPdf = doc?.file?.mimeType === 'application/pdf';

  useEffect(() => {
    if (!doc || !isPdf) return undefined;
    let objectUrl;
    setUrl(null); setError('');
    resumesApi.fileBlob(doc._id)
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch((e) => setError(errorMessage(e, 'Could not load preview')));
    return () => objectUrl && URL.revokeObjectURL(objectUrl);
  }, [doc, isPdf]);

  const download = () => downloadFile(`/resumes/${doc._id}/file`, doc.file.originalName, { download: 1 })
    .catch((e) => toast.error(errorMessage(e, 'Download failed')));

  return (
    <Modal open={!!doc} onClose={onClose} size="xl" title={doc?.name} description={doc ? `${doc.version ? `${doc.version} · ` : ''}${doc.file?.originalName}` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={Download} onClick={download}>Download</Button></>}>
      {!isPdf ? (
        <EmptyState icon={FileText} title="Preview not available" description="Word documents can't be previewed in the browser. Download the file to open it." />
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-600">{error}</p>
      ) : !url ? (
        <div className="flex h-[65vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
      ) : (
        <iframe title="Document preview" src={url} className="h-[65vh] w-full rounded-lg border border-border bg-white" />
      )}
    </Modal>
  );
}

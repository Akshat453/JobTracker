import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { UploadCloud, FileText, X } from 'lucide-react';
import { Modal, Button, Field, Input, Select, Textarea } from '../ui/index.js';
import { resumesApi } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { RESUME_CATEGORIES, DOCUMENT_KINDS } from '../../lib/constants.js';
import { fmtBytes, cn } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useLookups } from '../../context/LookupsContext.jsx';
import { useServerConfig } from '../../hooks/useServerConfig.js';

const OK_EXT = /\.(pdf|docx?)$/i;

export function ResumeUploadModal({ open, onClose, onUploaded, defaultKind = 'resume' }) {
  const toast = useToast();
  const { refreshDocuments } = useLookups();
  const { maxUploadMb: MAX_MB } = useServerConfig();
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const { register, handleSubmit, reset, setValue, getValues, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { kind: defaultKind, category: 'General' },
  });

  const pick = (f) => {
    if (!f) return;
    if (!OK_EXT.test(f.name)) return setFileError('Only PDF, DOC or DOCX files are allowed');
    if (f.size > MAX_MB * 1024 * 1024) return setFileError(`File is larger than ${MAX_MB} MB`);
    setFileError('');
    setFile(f);
    if (!getValues('name')) setValue('name', f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };

  const close = () => { reset({ kind: defaultKind, category: 'General' }); setFile(null); setFileError(''); setProgress(0); onClose(); };

  const onSubmit = async (values) => {
    if (!file) return setFileError('Choose a file to upload');
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => v && fd.append(k, v));
    fd.append('file', file);
    try {
      const { resume } = await resumesApi.upload(fd, (e) => setProgress(Math.round((e.loaded / (e.total || 1)) * 100)));
      toast.success(`"${resume.name}" uploaded`);
      await refreshDocuments();
      onUploaded?.(resume);
      close();
    } catch (err) {
      setProgress(0);
      toast.error(errorMessage(err, 'Upload failed'));
    }
  };

  return (
    <Modal open={open} onClose={close} title="Upload document" description={`PDF, DOC or DOCX up to ${MAX_MB} MB`} size="md"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>Upload</Button></>}>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        {!file ? (
          <button type="button" onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
            className={cn('flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition',
              drag ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10' : 'border-border hover:border-brand-400 hover:bg-subtle/50', fileError && 'border-red-400')}>
            <UploadCloud className="h-7 w-7 text-muted" />
            <span className="mt-2 text-sm font-medium">Drop a file or click to browse</span>
            <span className="text-xs text-muted">PDF, DOC, DOCX</span>
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-subtle/50 px-3 py-2.5">
            <FileText className="h-5 w-5 text-brand-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted">{fmtBytes(file.size)}</p>
              {progress > 0 && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border"><div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} /></div>}
            </div>
            <button type="button" onClick={() => setFile(null)} className="text-muted hover:text-fg" aria-label="Remove file"><X className="h-4 w-4" /></button>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {fileError && <p className="-mt-2 text-xs text-red-600">{fileError}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name?.message} className="sm:col-span-2">
            <Input placeholder="e.g. SWE Resume" error={errors.name} {...register('name', { required: 'Name is required' })} />
          </Field>
          <Field label="Version"><Input placeholder="v1, v2-backend…" {...register('version')} /></Field>
          <Field label="Type"><Select options={DOCUMENT_KINDS} {...register('kind')} /></Field>
          <Field label="Category" className="sm:col-span-2"><Select options={RESUME_CATEGORIES} {...register('category')} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea rows={2} placeholder="What's different about this version?" {...register('description')} /></Field>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react';
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
import { SourceFields, SOURCE_EXT } from './SourceFields.jsx';

const OK_EXT = /\.(pdf|docx?)$/i;

/**
 * Uploads a new document, or (with `baseDoc`) a new version of an existing resume.
 * Either way it can carry an editable source: a Word / LaTeX / .zip file and/or a link.
 */
export function ResumeUploadModal({ open, onClose, onUploaded, defaultKind = 'resume', baseDoc }) {
  const toast = useToast();
  const { refreshDocuments } = useLookups();
  const { maxUploadMb: MAX_MB } = useServerConfig();
  const isVersion = Boolean(baseDoc);
  const nextNumber = (baseDoc?.latestNumber || baseDoc?.versionNumber || 1) + 1;
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const defaults = { kind: defaultKind, category: 'General' };
  const { register, handleSubmit, reset, setValue, getValues, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults, shouldUnregister: true });

  // A new version usually lives in the same Overleaf / Google Docs project, so start with that link.
  useEffect(() => { if (open) setSourceUrl(baseDoc?.source?.url || ''); }, [open, baseDoc]);

  const tooBig = (f) => f.size > MAX_MB * 1024 * 1024;
  const pick = (f) => {
    if (!f) return;
    if (!OK_EXT.test(f.name)) return setFileError('Only PDF, DOC or DOCX files are allowed');
    if (tooBig(f)) return setFileError(`File is larger than ${MAX_MB} MB`);
    setFileError('');
    setFile(f);
    if (!isVersion && !getValues('name')) setValue('name', f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };
  const pickSource = (f) => {
    setSourceError('');
    if (!f) return setSourceFile(null);
    if (!SOURCE_EXT.test(f.name)) return setSourceError('Choose a Word (.docx, .doc), LaTeX (.tex) or Overleaf .zip file');
    if (tooBig(f)) return setSourceError(`File is larger than ${MAX_MB} MB`);
    setSourceFile(f);
  };

  const close = () => {
    reset(defaults); setFile(null); setFileError(''); setSourceFile(null); setSourceUrl(''); setSourceError(''); setProgress(0); onClose();
  };

  const onSubmit = async (values) => {
    if (!file) return setFileError(isVersion ? 'Choose the new version to upload' : 'Choose a file to upload');
    if (file.size + (sourceFile?.size || 0) > MAX_MB * 1024 * 1024) return setSourceError(`The two files together must be under ${MAX_MB} MB`);
    const fd = new FormData();
    const fields = isVersion ? { version: values.version, description: values.description } : values;
    Object.entries(fields).forEach(([k, v]) => v && fd.append(k, v));
    if (sourceUrl.trim()) fd.append('sourceUrl', sourceUrl.trim());
    fd.append('file', file);
    if (sourceFile) fd.append('source', sourceFile);
    const onProgress = (e) => setProgress(Math.round((e.loaded / (e.total || 1)) * 100));
    try {
      const { resume } = isVersion ? await resumesApi.createVersion(baseDoc._id, fd, onProgress) : await resumesApi.upload(fd, onProgress);
      toast.success(isVersion ? `${resume.version} of "${resume.name}" saved` : `"${resume.name}" uploaded`);
      await refreshDocuments();
      onUploaded?.(resume);
      close();
    } catch (err) {
      setProgress(0);
      toast.error(errorMessage(err, 'Upload failed'));
    }
  };

  return (
    <Modal open={open} onClose={close} size="md"
      title={isVersion ? `New version of ${baseDoc.name}` : 'Upload document'}
      description={isVersion ? `Version ${nextNumber}. Older versions stay attached to the applications you sent them with.` : `PDF, DOC or DOCX up to ${MAX_MB} MB`}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>{isVersion ? 'Save version' : 'Upload'}</Button></>}>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        {!file ? (
          <button type="button" onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
            className={cn('flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition',
              drag ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10' : 'border-border hover:border-brand-400 hover:bg-subtle/50', fileError && 'border-red-400')}>
            <UploadCloud className="h-7 w-7 text-muted" />
            <span className="mt-2 text-sm font-medium">{isVersion ? 'Drop the new version or click to browse' : 'Drop a file or click to browse'}</span>
            <span className="text-xs text-muted">The file you send to employers: PDF, DOC or DOCX</span>
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
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" aria-label="Document file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {fileError && <p className="-mt-2 text-xs text-red-600">{fileError}</p>}

        {isVersion ? (
          <div className="grid gap-4">
            <Field label="Version label" hint={`Leave empty to use "v${nextNumber}".`}><Input placeholder={`v${nextNumber}, v${nextNumber}-backend…`} {...register('version')} /></Field>
            <Field label="What changed?"><Textarea rows={3} placeholder="e.g. Added Razorpay internship, moved Projects above Education" {...register('description')} /></Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={errors.name?.message} className="sm:col-span-2">
              <Input placeholder="e.g. SWE Resume" error={errors.name} {...register('name', { validate: (v) => isVersion || Boolean(v?.trim()) || 'Name is required' })} />
            </Field>
            <Field label="Version"><Input placeholder="v1, v2-backend…" {...register('version')} /></Field>
            <Field label="Type"><Select options={DOCUMENT_KINDS} {...register('kind')} /></Field>
            <Field label="Category" className="sm:col-span-2"><Select options={RESUME_CATEGORIES} {...register('category')} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} placeholder="What's in this version?" {...register('description')} /></Field>
          </div>
        )}

        <SourceFields file={sourceFile} onFile={pickSource} url={sourceUrl} onUrl={setSourceUrl} error={sourceError} />
      </form>
    </Modal>
  );
}

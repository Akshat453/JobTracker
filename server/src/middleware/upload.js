import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// Real file signatures, so a renamed executable or HTML file can't pass as a document.
const isZip = (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
const isUtf8Text = (b) => {
  if (b.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); return true; } catch { return false; }
};
const SIGNATURES = {
  '.pdf': (b) => b.subarray(0, 1024).includes('%PDF-'),
  '.docx': isZip,
  '.doc': (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  '.tex': isUtf8Text,
  '.zip': isZip,
};

// The type each extension is stored and served as. Browsers report .tex and .zip under many
// different types, so the editable source is checked by extension + contents only.
export const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.tex': 'application/x-tex',
  '.zip': 'application/zip',
};

/**
 * `file`: the document you send to employers (PDF, DOC, DOCX).
 * `source`: optional editable version of it: Word (DOC, DOCX), LaTeX (.tex), or an Overleaf
 * source download (.zip).
 */
const FIELDS = {
  file: { exts: ['.pdf', '.doc', '.docx'], checkMime: true, error: 'Only PDF, DOC or DOCX files are allowed' },
  source: { exts: ['.docx', '.doc', '.tex', '.zip'], checkMime: false, error: 'The editable source must be a Word (.docx, .doc), LaTeX (.tex) or Overleaf .zip file' },
};

function fileFilter(_req, file, cb) {
  const rule = FIELDS[file.fieldname];
  if (!rule) return cb(ApiError.badRequest(`Unexpected file field "${file.fieldname}"`));
  const ext = path.extname(file.originalname).toLowerCase();
  if (rule.exts.includes(ext) && (!rule.checkMime || file.mimetype === MIME_BY_EXT[ext])) return cb(null, true);
  cb(ApiError.badRequest(rule.error));
}

const receive = (fields) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: fields.length, fields: 20 },
  fileFilter,
}).fields(fields.map((name) => ({ name, maxCount: 1 })));

/** Puts the files on req.file / req.source and checks their contents and combined size. */
function checkContents(req, _res, next) {
  const files = req.files || {};
  req.file = files.file?.[0];
  req.source = files.source?.[0];
  for (const f of [req.file, req.source].filter(Boolean)) {
    const ext = path.extname(f.originalname).toLowerCase();
    if (!SIGNATURES[ext](f.buffer)) return next(ApiError.badRequest(`"${f.originalname}" is not a valid ${ext.slice(1).toUpperCase()} file`));
    f.mimetype = MIME_BY_EXT[ext];
  }
  // One request has to fit the host's body limit (4.5 MB on Vercel), so cap both files together.
  const total = (req.file?.size || 0) + (req.source?.size || 0);
  if (total > env.maxUploadMb * 1024 * 1024) return next(ApiError.badRequest(`Files together are larger than ${env.maxUploadMb} MB`));
  next();
}

/** A document upload with an optional editable source. */
export const uploadDocument = [receive(['file', 'source']), checkContents];
/** Only an editable source (attach or replace it on an existing version). */
export const uploadSource = [receive(['source']), checkContents];

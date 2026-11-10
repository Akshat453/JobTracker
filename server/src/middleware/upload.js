import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

// Real file signatures, so a renamed executable or HTML file can't pass as a resume.
const SIGNATURES = {
  '.pdf': (b) => b.subarray(0, 1024).includes('%PDF-'),
  '.docx': (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  '.doc': (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
};

const receive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1, fields: 20 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED[file.mimetype] && SIGNATURES[ext]) return cb(null, true);
    cb(ApiError.badRequest('Only PDF, DOC or DOCX files are allowed'));
  },
}).single('file');

function checkContents(req, _res, next) {
  if (!req.file) return next();
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!SIGNATURES[ext](req.file.buffer)) return next(ApiError.badRequest(`This file is not a valid ${ext.slice(1).toUpperCase()} document`));
  next();
}

export const uploadDocument = [receive, checkContents];

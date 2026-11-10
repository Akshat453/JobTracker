import path from 'node:path';
import { Application, Resume } from '../models/index.js';
import { saveFile, openFile, deleteFile } from '../services/fileStorage.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertObjectId } from '../utils/helpers.js';
import { resumeMetaSchema } from '../validators/schemas.js';
import { INTERVIEW_STAGES, OFFER_STAGES } from '../utils/constants.js';

async function loadOwned(req) {
  assertObjectId(req.params.id);
  const doc = await Resume.findOne({ _id: req.params.id, user: req.user._id });
  if (!doc) throw ApiError.notFound('Document not found');
  return doc;
}

/** Usage stats per document: how many applications used it and how many got interviews / offers. */
async function usageStats(userId, ids) {
  const rows = await Application.aggregate([
    { $match: { user: userId, $or: [{ resume: { $in: ids } }, { documents: { $in: ids } }] } },
    { $project: { refs: { $setUnion: [{ $cond: [{ $ifNull: ['$resume', false] }, ['$resume'], []] }, { $ifNull: ['$documents', []] }] }, status: 1, hist: '$statusHistory.status' } },
    { $unwind: '$refs' },
    { $match: { refs: { $in: ids } } },
    {
      $group: {
        _id: '$refs',
        applications: { $sum: 1 },
        interviews: { $sum: { $cond: [{ $gt: [{ $size: { $setIntersection: [{ $concatArrays: ['$hist', ['$status']] }, INTERVIEW_STAGES] } }, 0] }, 1, 0] } },
        offers: { $sum: { $cond: [{ $gt: [{ $size: { $setIntersection: [{ $concatArrays: ['$hist', ['$status']] }, OFFER_STAGES] } }, 0] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

export const listResumes = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.kind) filter.kind = String(req.query.kind);
  if (req.query.archived !== 'all') filter.isArchived = req.query.archived === 'true';
  const docs = await Resume.find(filter).sort({ createdAt: -1 });
  const stats = await usageStats(req.user._id, docs.map((d) => d._id));
  res.json({
    items: docs.map((d) => {
      const s = stats.get(String(d._id)) || { applications: 0, interviews: 0, offers: 0 };
      return { ...d.toJSON(), usage: { applications: s.applications, interviews: s.interviews, offers: s.offers } };
    }),
  });
});

export const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please attach a PDF, DOC or DOCX file');
  const parsed = resumeMetaSchema.safeParse({ ...req.body, name: req.body.name || path.parse(req.file.originalname).name });
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
  const { originalname, mimetype, size, buffer } = req.file;
  const fileId = await saveFile({ userId: req.user._id, buffer, filename: originalname, mimeType: mimetype });
  let doc;
  try {
    doc = await Resume.create({
      ...parsed.data,
      user: req.user._id,
      file: { originalName: originalname, storedName: fileId, mimeType: mimetype, size },
    });
  } catch (err) {
    await deleteFile(fileId);
    throw err;
  }
  res.status(201).json({ resume: { ...doc.toJSON(), usage: { applications: 0, interviews: 0, offers: 0 } } });
});

export const getResume = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req);
  const applications = await Application.find({ user: req.user._id, $or: [{ resume: doc._id }, { documents: doc._id }] })
    .select('company.name jobTitle status applicationDate').sort({ applicationDate: -1 }).lean();
  res.json({ resume: doc, applications });
});

export const downloadResume = asyncHandler(async (req, res, next) => {
  const doc = await loadOwned(req);
  const stream = await openFile(doc.file.storedName, req.user._id);
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', doc.file.mimeType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.file.originalName)}"`);
  stream.once('error', next);
  stream.pipe(res);
});

export const updateResume = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req);
  const { isArchived, ...meta } = req.body;
  for (const [k, v] of Object.entries(meta)) if (v !== undefined) doc.set(k, v);
  if (isArchived !== undefined) {
    doc.isArchived = isArchived;
    doc.archivedAt = isArchived ? new Date() : undefined;
  }
  await doc.save();
  res.json({ resume: doc });
});

/**
 * Referenced documents are archived (soft-deleted) so applications keep the exact file they were sent with.
 * Unreferenced documents are deleted permanently, including the stored file.
 */
export const deleteResume = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req);
  const refs = await Application.countDocuments({ user: req.user._id, $or: [{ resume: doc._id }, { documents: doc._id }] });
  if (refs > 0) {
    doc.isArchived = true;
    doc.archivedAt = new Date();
    await doc.save();
    return res.json({ archived: true, references: refs, message: `Archived — still used by ${refs} application(s)` });
  }
  await deleteFile(doc.file.storedName);
  await doc.deleteOne();
  res.json({ deleted: true, message: 'Document deleted' });
});

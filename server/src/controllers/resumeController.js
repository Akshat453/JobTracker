import path from 'node:path';
import { Application, Resume } from '../models/index.js';
import { saveFile, openFile, deleteFile } from '../services/fileStorage.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertObjectId } from '../utils/helpers.js';
import { resumeMetaSchema, resumeSourceSchema, resumeVersionSchema } from '../validators/schemas.js';
import { INTERVIEW_STAGES, OFFER_STAGES } from '../utils/constants.js';

async function loadOwned(req) {
  assertObjectId(req.params.id);
  const doc = await Resume.findOne({ _id: req.params.id, user: req.user._id });
  if (!doc) throw ApiError.notFound('Document not found');
  return doc;
}

/** Usage stats per document: how many applications used it and how many got interviews / offers. */
/** Usage stats for the user's documents (all of them, or only `ids`). */
async function usageStats(userId, ids) {
  const refMatch = ids
    ? { $or: [{ resume: { $in: ids } }, { documents: { $in: ids } }] }
    : { $or: [{ resume: { $ne: null } }, { 'documents.0': { $exists: true } }] };
  const rows = await Application.aggregate([
    { $match: { user: userId, ...refMatch } },
    { $project: { refs: { $setUnion: [{ $cond: [{ $ifNull: ['$resume', false] }, ['$resume'], []] }, { $ifNull: ['$documents', []] }] }, status: 1, hist: '$statusHistory.status' } },
    { $unwind: '$refs' },
    ...(ids ? [{ $match: { refs: { $in: ids } } }] : []),
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
  // Documents and their usage stats in parallel (one round trip).
  const [docs, stats] = await Promise.all([Resume.find(filter).sort({ createdAt: -1 }), usageStats(req.user._id)]);
  res.json({
    items: docs.map((d) => {
      const s = stats.get(String(d._id)) || { applications: 0, interviews: 0, offers: 0 };
      return { ...d.toJSON(), usage: { applications: s.applications, interviews: s.interviews, offers: s.offers } };
    }),
  });
});

const parseOr400 = (schema, body) => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
  return parsed.data;
};

const store = async (userId, f) => ({
  originalName: f.originalname,
  storedName: await saveFile({ userId, buffer: f.buffer, filename: f.originalname, mimeType: f.mimetype }),
  mimeType: f.mimetype,
  size: f.size,
});

/** Builds the `source` field from an uploaded source file and/or a link. */
const buildSource = (sourceFile, url) => (sourceFile || url ? { ...(sourceFile && { file: sourceFile }), ...(url && { url }) } : undefined);

/**
 * Stores the uploaded document (and editable source, if any) and creates the Resume.
 * Stored files are removed again if anything fails, so no orphans are left in GridFS.
 */
async function createDocument(req, fields) {
  const stored = [];
  try {
    const file = await store(req.user._id, req.file);
    stored.push(file.storedName);
    const sourceFile = req.source ? await store(req.user._id, req.source) : undefined;
    if (sourceFile) stored.push(sourceFile.storedName);
    const { sourceUrl, ...rest } = fields;
    return await Resume.create({ ...rest, user: req.user._id, file, source: buildSource(sourceFile, sourceUrl) });
  } catch (err) {
    await Promise.all(stored.map(deleteFile));
    throw err;
  }
}

const withEmptyUsage = (doc) => ({ ...doc.toJSON(), usage: { applications: 0, interviews: 0, offers: 0 } });

export const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please attach a PDF, DOC or DOCX file');
  const meta = parseOr400(resumeMetaSchema, { ...req.body, name: req.body.name || path.parse(req.file.originalname).name });
  const doc = await createDocument(req, meta);
  res.status(201).json({ resume: withEmptyUsage(doc) });
});

const familyOf = (doc) => doc.family || doc._id;
const familyFilter = (userId, family) => ({ user: userId, $or: [{ family }, { _id: family }] });

/**
 * POST /resumes/:id/versions: uploads a new version of the resume :id belongs to. Name, type and
 * category are copied from the latest version; the version label defaults to "v<number>".
 */
export const createVersion = asyncHandler(async (req, res) => {
  const base = await loadOwned(req);
  if (!req.file) throw ApiError.badRequest('Please attach the new version (PDF, DOC or DOCX)');
  const body = parseOr400(resumeVersionSchema, req.body);
  const family = familyOf(base);
  const latest = await Resume.findOne(familyFilter(req.user._id, family)).sort({ versionNumber: -1, createdAt: -1 });
  const versionNumber = (latest?.versionNumber || 1) + 1;
  const doc = await createDocument(req, {
    name: latest.name,
    kind: latest.kind,
    category: latest.category,
    family,
    versionNumber,
    version: body.version || `v${versionNumber}`,
    description: body.description,
    sourceUrl: body.sourceUrl,
  });
  res.status(201).json({ resume: withEmptyUsage(doc) });
});

/** PUT /resumes/:id/source: attaches or replaces the editable source (a file, a link, or both). */
export const setSource = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req);
  const { sourceUrl } = parseOr400(resumeSourceSchema, req.body);
  if (!req.source && sourceUrl === undefined) throw ApiError.badRequest('Attach a Word, LaTeX or .zip file, or give a link');
  const oldFile = doc.source?.file?.storedName;
  const file = req.source ? await store(req.user._id, req.source) : doc.source?.file;
  const url = sourceUrl === undefined ? doc.source?.url : sourceUrl;
  doc.source = buildSource(file, url);
  try {
    await doc.save();
  } catch (err) {
    if (req.source) await deleteFile(file.storedName);
    throw err;
  }
  if (req.source && oldFile) await deleteFile(oldFile);
  res.json({ resume: doc });
});

/** DELETE /resumes/:id/source: removes the editable source file and link. */
export const removeSource = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req);
  const oldFile = doc.source?.file?.storedName;
  doc.source = undefined;
  await doc.save();
  if (oldFile) await deleteFile(oldFile);
  res.json({ resume: doc });
});

/** GET /resumes/:id/source: downloads the editable source file. Always a download, never shown inline. */
export const downloadSource = asyncHandler(async (req, res, next) => {
  const doc = await loadOwned(req);
  const file = doc.source?.file;
  if (!file) throw ApiError.notFound('This version has no editable source file');
  const stream = await openFile(file.storedName, req.user._id);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
  stream.once('error', next);
  stream.pipe(res);
});

/** GET /resumes/:id: the document, where it was used, and every version of it (newest first) with usage. */
export const getResume = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req);
  const [applications, versions] = await Promise.all([
    Application.find({ user: req.user._id, $or: [{ resume: doc._id }, { documents: doc._id }] })
      .select('company.name jobTitle status applicationDate').sort({ applicationDate: -1 }).lean(),
    Resume.find(familyFilter(req.user._id, familyOf(doc))).sort({ versionNumber: -1, createdAt: -1 }),
  ]);
  const stats = await usageStats(req.user._id, versions.map((v) => v._id));
  res.json({
    resume: doc,
    applications,
    versions: versions.map((v) => {
      const s = stats.get(String(v._id)) || { applications: 0, interviews: 0, offers: 0 };
      return { ...v.toJSON(), usage: { applications: s.applications, interviews: s.interviews, offers: s.offers } };
    }),
  });
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
  const { isArchived, sourceUrl, ...meta } = req.body;
  for (const [k, v] of Object.entries(meta)) if (v !== undefined) doc.set(k, v);
  if (sourceUrl !== undefined) doc.source = buildSource(doc.source?.file, sourceUrl);
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
  await Promise.all([doc.file.storedName, doc.source?.file?.storedName].filter(Boolean).map(deleteFile));
  await doc.deleteOne();
  res.json({ deleted: true, message: 'Document deleted' });
});

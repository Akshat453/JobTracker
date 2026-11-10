/**
 * Uploaded documents are stored in MongoDB GridFS (bucket "uploads"), so they live in the same
 * private database as everything else and survive restarts on hosts with ephemeral disks.
 * Files are only ever streamed back through the authenticated API.
 */
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
const toId = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);

/** Stores a buffer and returns the new file id (string). */
export function saveFile({ userId, buffer, filename, mimeType }) {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(filename, { metadata: { user: String(userId), mimeType } });
    upload.once('error', reject);
    upload.once('finish', () => resolve(String(upload.id)));
    upload.end(buffer);
  });
}

/** Opens a read stream for a file, checking it belongs to `userId`. */
export async function openFile(fileId, userId) {
  const id = toId(fileId);
  const file = id && (await bucket().find({ _id: id, 'metadata.user': String(userId) }).next());
  if (!file) throw ApiError.notFound('The stored file is missing');
  return bucket().openDownloadStream(id);
}

/** Deletes a file; missing files are ignored. */
export async function deleteFile(fileId) {
  const id = toId(fileId);
  if (!id) return;
  await bucket().delete(id).catch(() => {});
}

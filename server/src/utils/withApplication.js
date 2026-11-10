import mongoose from 'mongoose';

const toId = (v) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));

/**
 * Like `Model.find(filter).sort().limit().populate('application', fields).lean()`, but in a single
 * database round trip: the linked application is joined with $lookup instead of a second query.
 * Matters when the database is far from the server, where every round trip costs ~100–250 ms.
 *
 * Aggregations don't cast types, so `user` and `application` ids are converted here.
 */
export function findWithApplication(Model, filter, { sort, limit, fields = ['company.name', 'jobTitle', 'status'] } = {}) {
  const match = { ...filter };
  if (match.user) match.user = toId(match.user);
  if (typeof match.application === 'string') match.application = toId(match.application);

  const pipeline = [{ $match: match }];
  if (sort) pipeline.push({ $sort: sort });
  if (limit) pipeline.push({ $limit: limit });
  pipeline.push(
    {
      $lookup: {
        from: 'applications',
        localField: 'application',
        foreignField: '_id',
        pipeline: [{ $project: Object.fromEntries(fields.map((f) => [f, 1])) }],
        as: '_linked',
      },
    },
    // Same shape as populate(): the joined document when found; null when the id points at a deleted
    // application; and no field at all when there was no link to begin with.
    {
      $set: {
        application: {
          $cond: [
            { $gt: [{ $size: '$_linked' }, 0] },
            { $first: '$_linked' },
            { $cond: [{ $eq: [{ $ifNull: ['$application', null] }, null] }, '$$REMOVE', null] },
          ],
        },
      },
    },
    { $unset: '_linked' },
  );
  return Model.aggregate(pipeline);
}

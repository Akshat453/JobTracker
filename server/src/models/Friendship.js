import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * A friend connection between two users. Starts as a request from `requester` to `recipient`
 * (pending) and becomes mutual once the recipient accepts. `pairKey` (the two ids sorted) makes
 * sure there is only ever one document per pair, whoever sent the request.
 */
const friendshipSchema = new mongoose.Schema(
  {
    pairKey: { type: String, required: true, unique: true },
    requester: { type: ObjectId, ref: 'User', required: true, index: true },
    recipient: { type: ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    acceptedAt: Date,
  },
  { timestamps: true },
);

export const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');

export const Friendship = mongoose.model('Friendship', friendshipSchema);

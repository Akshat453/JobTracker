import crypto from 'node:crypto';
import { User } from '../models/index.js';

// No 0/O, 1/I/L: easy to read out and type. 8 characters = 32^8 (about 10^12) possible codes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateFriendCode() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Accepts what people type ("k7qm3xpa", "K7QM 3XPA", "k7qm-3xpa") and returns "K7QM-3XPA", or null. */
export function normalizeFriendCode(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Gives the user a new code (or their first one). Retries on the rare collision. */
export async function assignFriendCode(userId) {
  for (let i = 0; i < 5; i += 1) {
    const code = generateFriendCode();
    try {
      await User.updateOne({ _id: userId }, { $set: { friendCode: code } });
      return code;
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }
  throw new Error('Could not generate a friend code');
}

export async function getFriendCode(userId) {
  const u = await User.findById(userId).select('+friendCode').lean();
  return u?.friendCode || assignFriendCode(userId);
}

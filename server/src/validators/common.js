import { z } from 'zod';

// Plain-language messages for the cases zod words technically. Returning undefined keeps zod's default.
z.config({
  customError: (issue) => {
    if (issue.code === 'invalid_type') {
      if (issue.input === undefined || issue.input === null) return 'Required';
      if (issue.expected === 'number') return 'Must be a number';
      if (issue.expected === 'date') return 'Must be a valid date';
    }
    if (issue.code === 'invalid_value' && issue.values?.length) return `Must be one of: ${issue.values.join(', ')}`;
    return undefined;
  },
});

/** Empty strings from HTML forms become null so updates can clear a field. */
const blankToNull = (v) => (v === '' || v === undefined ? (v === '' ? null : undefined) : v);

export const optStr = (max = 5000) => z.preprocess(blankToNull, z.string().trim().max(max).nullish());

export const optEmail = z.preprocess(
  blankToNull,
  z.string().trim().toLowerCase().email('Invalid email address').nullish(),
);

/** Accepts "example.com/jobs" and normalises to https://example.com/jobs; rejects garbage. */
export const optUrl = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
      try {
        const u = new URL(withScheme);
        if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) throw new Error();
        return u.toString();
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid URL' });
        return z.NEVER;
      }
    })
    .nullish(),
);

export const optDate = z.preprocess(
  blankToNull,
  z.coerce.date({ errorMap: () => ({ message: 'Invalid date' }) }).nullish(),
);

export const optEnum = (values) => z.preprocess(blankToNull, z.enum(values).nullish());

export const optNumber = z.preprocess(
  (v) => (v === '' || v === null ? null : v),
  z.coerce.number().min(0, 'Must be positive').nullish(),
);

export const optBool = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().optional());

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const optObjectId = z.preprocess(blankToNull, objectId.nullish());

export const stringList = z
  .preprocess(
    (v) => (typeof v === 'string' ? v.split(',') : v),
    z.array(z.string().trim().max(80)).max(100),
  )
  .transform((arr) => [...new Set(arr.filter(Boolean))])
  .optional();

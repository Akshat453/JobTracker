import { ApiError } from '../utils/ApiError.js';

/** Validates and replaces req[source] with the parsed (sanitised) value of a zod schema. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    return next(ApiError.badRequest(first ? `${first.path || 'input'}: ${first.message}` : 'Invalid input', details));
  }
  if (source === 'query') req.validatedQuery = result.data;
  else req[source] = result.data;
  next();
};

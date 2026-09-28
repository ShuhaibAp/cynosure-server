import { BadRequestException, ValidationError } from '@nestjs/common';

/** Flattens class-validator errors into `{ "lines.2.clientQuantity": "message" }` (first message per field). */
function flatten(
  errors: ValidationError[],
  prefix = '',
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const error of errors) {
    const key = prefix ? `${prefix}.${error.property}` : error.property;
    const message = Object.values(error.constraints ?? {})[0];
    if (message) out[key] = message;
    if (error.children?.length)
      Object.assign(out, flatten(error.children, key));
  }
  return out;
}

export function validationExceptionFactory(errors: ValidationError[]) {
  const fields = flatten(errors);
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: Object.values(fields),
    errors: fields,
  });
}

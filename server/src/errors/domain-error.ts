export abstract class DomainError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly errorCode = 'NOT_FOUND';
}

export class ValidationError extends DomainError {
  readonly statusCode = 400;
  readonly errorCode = 'VALIDATION_ERROR';
}

export class ForbiddenError extends DomainError {
  readonly statusCode = 403;
  readonly errorCode = 'FORBIDDEN';
}

export class PayloadTooLargeError extends DomainError {
  readonly statusCode = 413;
  readonly errorCode = 'PAYLOAD_TOO_LARGE';
}

export class UnsupportedMediaTypeError extends DomainError {
  readonly statusCode = 415;
  readonly errorCode = 'UNSUPPORTED_MEDIA_TYPE';
}

export class RateLimitError extends DomainError {
  readonly statusCode = 429;
  readonly errorCode = 'RATE_LIMITED';
}

export class ConflictError extends DomainError {
  readonly statusCode = 409;
  readonly errorCode = 'CONFLICT';
}

export class ServiceUnavailableError extends DomainError {
  readonly statusCode = 503;
  readonly errorCode = 'SERVICE_UNAVAILABLE';
}

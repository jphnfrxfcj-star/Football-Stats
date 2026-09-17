/** Only fixed, non-sensitive messages may cross the API boundary. */
export class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
export class BusyError extends Error {}
export function sourceUnavailable(error: unknown) {
  return (
    error instanceof BusyError ||
    (error instanceof ServiceError && error.code === 'FREE_SOURCE_UNAVAILABLE')
  );
}

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

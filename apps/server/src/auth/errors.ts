/** User-facing error that renders back into the login page. */
export class BadCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadCredentialsError';
  }
}

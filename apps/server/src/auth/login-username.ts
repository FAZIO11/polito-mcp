import { BadCredentialsError } from './errors.js';

const MATRICOLA = /^[a-z][a-z0-9]{2,15}$/i;
const STUDENT_EMAIL = /^([a-z][a-z0-9]{2,15})@studenti\.polito\.it$/i;

/**
 * PoliTO `/auth/login` `loginType=basic` expects the matricola in `username`.
 * Students often know their `@studenti.polito.it` address instead — accept
 * either and normalize to the matricola PoliTO returns after login.
 */
export function normalizePolitoLoginUsername(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new BadCredentialsError('Email or matricola and password are required.');
  }

  const emailMatch = STUDENT_EMAIL.exec(raw);
  if (emailMatch) {
    return emailMatch[1]!.toLowerCase();
  }

  if (MATRICOLA.test(raw)) {
    return raw.toLowerCase();
  }

  throw new BadCredentialsError(
    'Use your PoliTO student email (name@studenti.polito.it) or matricola (e.g. s334745).',
  );
}

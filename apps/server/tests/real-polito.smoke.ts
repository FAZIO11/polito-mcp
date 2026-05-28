/**
 * Opt-in smoke test against the REAL PoliTO API.
 *
 * This file is intentionally named `.smoke.ts` (not `.test.ts`) so Vitest does
 * not pick it up by default. Run manually with credentials you control:
 *
 *   POLITO_TEST_USERNAME=sXXXXXX \
 *   POLITO_TEST_PASSWORD='********' \
 *   npx tsx tests/real-polito.smoke.ts
 *
 * The script does NOT persist or log the password. Use a throwaway account
 * or your own credentials at your own risk.
 */
import { PolitoClient } from '../src/polito/client.js';

const BASE = process.env.POLITO_BASE_URL ?? 'https://app.didattica.polito.it/api';
const username = process.env.POLITO_TEST_USERNAME;
const password = process.env.POLITO_TEST_PASSWORD;

if (!username || !password) {
  console.error('Set POLITO_TEST_USERNAME and POLITO_TEST_PASSWORD to run this script.');
  process.exit(2);
}

async function main(): Promise<void> {
  const anon = new PolitoClient(BASE, null);
  console.log(`[smoke] POST ${BASE}/auth/login (loginType=basic)`);
  const identity = await anon.loginBasic({ username: username!, password: password! });
  console.log('[smoke] login ok, user type =', identity.type);

  const c = new PolitoClient(BASE, identity.token);
  const profile = await c.getStudent();
  console.log('[smoke] /me ok:', {
    name: `${profile.firstName} ${profile.lastName}`,
    degree: profile.degreeName,
    status: profile.status,
  });

  const grades = await c.getStudentGrades();
  console.log(`[smoke] /grades ok: ${grades.length} exams`);

  await c.logout();
  console.log('[smoke] logout ok');
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});

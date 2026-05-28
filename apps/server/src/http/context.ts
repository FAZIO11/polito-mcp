import type { AccessClaims } from '../auth/jwt.js';

/**
 * Variables exposed on Hono `Context.get()` / `Context.set()`. Centralised so
 * that every middleware/handler shares the same typing.
 */
export interface AppVariables {
  parsedForm: FormData;
  accessClaims: AccessClaims;
}

export type AppEnv = { Variables: AppVariables };

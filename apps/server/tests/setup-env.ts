/**
 * Shared env bootstrap for tests that depend on loadConfig().
 */
import { randomBytes } from 'node:crypto';

if (!process.env.ENC_MASTER_KEY) {
  process.env.ENC_MASTER_KEY = randomBytes(32).toString('hex');
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
}
if (!process.env.POLITO_BASE_URL) {
  process.env.POLITO_BASE_URL = 'http://localhost:14004';
}
if (!process.env.PUBLIC_ORIGIN) {
  process.env.PUBLIC_ORIGIN = 'http://localhost:14003';
}
if (!process.env.DB_PATH) {
  process.env.DB_PATH = `:memory:`;
}
process.env.NODE_ENV = 'test';

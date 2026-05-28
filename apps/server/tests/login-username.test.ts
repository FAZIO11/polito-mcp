import { describe, expect, it } from 'vitest';
import { normalizePolitoLoginUsername } from '../src/auth/login-username.js';

describe('normalizePolitoLoginUsername', () => {
  it('extracts matricola from student email', () => {
    expect(normalizePolitoLoginUsername('s334745@studenti.polito.it')).toBe('s334745');
    expect(normalizePolitoLoginUsername('  S334745@studenti.polito.it  ')).toBe('s334745');
  });

  it('accepts bare matricola', () => {
    expect(normalizePolitoLoginUsername('s290683')).toBe('s290683');
  });

  it('rejects other email domains', () => {
    expect(() => normalizePolitoLoginUsername('s334745@gmail.com')).toThrow(/student email/);
  });

  it('rejects empty input', () => {
    expect(() => normalizePolitoLoginUsername('   ')).toThrow(/required/);
  });
});

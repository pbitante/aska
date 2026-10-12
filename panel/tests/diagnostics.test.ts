import { describe, expect, it } from 'vitest';
import { didYouMean, err, formatDiagnostic, hasErrors, warn } from '../src/diagnostics';

describe('diagnostics', () => {
  it('suggests the closest name within a small edit distance', () => {
    expect(didYouMean('edge-case', ['edge-cases', 'cost'])).toBe('edge-cases');
    expect(didYouMean('zzz', ['edge-cases', 'cost'])).toBeUndefined();
  });

  it('formats level, code, location, message and fix', () => {
    const d = err('E_UNKNOWN_REF', 'unknown unit "x"', { file: 'p.md', line: 3 }, 'Did you mean "y"?');
    expect(formatDiagnostic(d)).toBe('error E_UNKNOWN_REF p.md:3 — unknown unit "x"\n    fix: Did you mean "y"?');
    expect(formatDiagnostic(warn('W_X', 'plain'))).toBe('warning W_X — plain');
  });

  it('detects errors among warnings', () => {
    expect(hasErrors([warn('W_X', 'w')])).toBe(false);
    expect(hasErrors([warn('W_X', 'w'), err('E_X', 'e')])).toBe(true);
  });
});

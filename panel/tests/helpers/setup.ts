import { afterAll } from 'vitest';
import { cleanupTempDirs } from './tree';

afterAll(() => {
  cleanupTempDirs();
});

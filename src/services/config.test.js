import { expect, test } from 'vitest';
import { BACKEND_URL } from './config';

test('usa el backend de música sin una barra final', () => {
  expect(BACKEND_URL).toBe('https://music-backend-tau.vercel.app');
});

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Server tests run in the node environment, which has no window or storage.
const inBrowser = typeof window !== 'undefined';

// jsdom does not implement scrolling.
if (inBrowser) window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  if (inBrowser) {
    localStorage.clear();
    sessionStorage.clear();
  }
});

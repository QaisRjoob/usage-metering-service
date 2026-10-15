import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { credentials } from '@/services/api/credentials';
import { setMockLatency } from '@/services/mock/mockRuntime';

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom does not provide.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Each test regenerates the deterministic mock dataset; on a busy machine the default 1 s wait for
// findBy*/waitFor can be too short. One observed timeout in ~10 runs led to this margin.
configure({ asyncUtilTimeout: 4000 });

beforeEach(() => {
  setMockLatency(0);
});

afterEach(() => {
  cleanup();
  credentials.clearAll();
  window.sessionStorage.clear();
});

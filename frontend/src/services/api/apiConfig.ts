export type DataSource = 'mock' | 'api';

function readDataSource(): DataSource {
  const value = import.meta.env.VITE_DATA_SOURCE?.trim().toLowerCase();
  if (value === 'api' || value === 'mock') return value;
  // Not configured: development defaults to mock data, production builds default to the real API,
  // so the mock can never be silently active in a production bundle.
  return import.meta.env.PROD ? 'api' : 'mock';
}

function readTimeout(): number {
  const parsed = Number(import.meta.env.VITE_API_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

export const apiConfig = {
  dataSource: readDataSource(),
  baseUrl: (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1').replace(/\/+$/, ''),
  timeoutMs: readTimeout(),
  /** Seeded demo API key, pre-filled in the Client Demo. Local demo use only. */
  demoApiKey: import.meta.env.VITE_DEMO_API_KEY?.trim() || null,
  apiKeyHeader: 'X-API-Key',
} as const;

export const isMockMode = apiConfig.dataSource === 'mock';

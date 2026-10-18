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
  // Default: same origin as the page (nginx in Docker and the Vite dev server forward /api to the
  // API), so the browser never makes a cross-origin call.
  baseUrl: (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, ''),
  timeoutMs: readTimeout(),
  /** Seeded demo API key, pre-filled in the Client Demo. Local demo use only. */
  demoApiKey: import.meta.env.VITE_DEMO_API_KEY?.trim() || null,
  /** Operator token shown as a test account on the login page. Public demos only; unset = hidden. */
  demoOperatorToken: import.meta.env.VITE_DEMO_OPERATOR_TOKEN?.trim() || null,
  apiKeyHeader: 'X-API-Key',
} as const;

export const isMockMode = apiConfig.dataSource === 'mock';

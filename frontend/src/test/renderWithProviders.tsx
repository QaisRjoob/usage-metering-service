import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { QueryProvider } from '@/providers/QueryProvider';
import { ServicesProvider } from '@/providers/ServicesProvider';
import { createServices } from '@/services/serviceRegistry';

/** Renders with mock services, a fresh query cache (no retries) and an in-memory router. */
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  return render(
    <ServicesProvider services={createServices('mock')}>
      <QueryProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryProvider>
    </ServicesProvider>,
  );
}

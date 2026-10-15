import { BrowserRouter } from 'react-router';
import { QueryProvider } from '@/providers/QueryProvider';
import { ServicesProvider } from '@/providers/ServicesProvider';
import { AppRouter } from '@/routing/AppRouter';

export function App() {
  return (
    <ServicesProvider>
      <QueryProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </QueryProvider>
    </ServicesProvider>
  );
}

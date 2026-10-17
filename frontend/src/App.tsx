import { BrowserRouter } from 'react-router';
import { QueryProvider } from '@/providers/QueryProvider';
import { ServicesProvider } from '@/providers/ServicesProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AppRouter } from '@/routing/AppRouter';

export function App() {
  return (
    <ThemeProvider>
    <ServicesProvider>
      <QueryProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </QueryProvider>
    </ServicesProvider>
    </ThemeProvider>
  );
}

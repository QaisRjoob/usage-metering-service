import { BrowserRouter } from 'react-router';
import { QueryProvider } from '@/providers/QueryProvider';
import { ServicesProvider } from '@/providers/ServicesProvider';
import { SessionRestorer } from '@/providers/SessionRestorer';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AppRouter } from '@/routing/AppRouter';

export function App() {
  return (
    <ThemeProvider>
    <ServicesProvider>
      <QueryProvider>
        <SessionRestorer>
          <BrowserRouter>
            <AppRouter />
          </BrowserRouter>
        </SessionRestorer>
      </QueryProvider>
    </ServicesProvider>
    </ThemeProvider>
  );
}

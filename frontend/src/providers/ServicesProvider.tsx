import { createContext, useContext, useState, type ReactNode } from 'react';
import { createServices, type Services } from '@/services/serviceRegistry';

const ServicesContext = createContext<Services | null>(null);

/** Supplies the service implementations (mock or HTTP). Tests pass their own `services`. */
export function ServicesProvider({ services, children }: { services?: Services; children: ReactNode }) {
  const [value] = useState<Services>(() => services ?? createServices());
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>');
  return services;
}

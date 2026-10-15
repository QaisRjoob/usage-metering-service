import { useSyncExternalStore } from 'react';
import { credentials, type CredentialsState } from '@/services/api/credentials';

/** Subscribes a component to the in-memory credential store. */
export function useCredentials(): CredentialsState {
  return useSyncExternalStore(credentials.subscribe, credentials.get, credentials.get);
}

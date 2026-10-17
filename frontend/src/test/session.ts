import { credentials } from '@/services/api/credentials';
import { mockAccountAccessToken, mockOperatorAccessToken } from '@/services/mock/mockRuntime';
import { DEMO_ACCOUNT_ID } from '@/services/mock/mockSeed';

/** Test helpers: start a session as if POST /auth/token had just answered (mock access tokens). */
export const signInAsOperator = () => credentials.setSession({ accessToken: mockOperatorAccessToken, expiresIn: 900, role: 'operator' });

export const signInAsAccount = (account = { id: DEMO_ACCOUNT_ID, name: 'شركة الوثائق التجريبية', apiKeyPrefix: 'umk_demo_loca' }) =>
  credentials.setSession({ accessToken: mockAccountAccessToken(account.id), expiresIn: 900, role: 'account', account });

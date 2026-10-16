import { z } from 'zod';

/**
 * POST /auth/identify - the login page sends whatever the person pasted; the server decides
 * whether it is the operator's admin token or an account API key. The token travels in the body
 * (never in the URL) and is not logged.
 */
export const identifyCredentialSchema = z.object({
  token: z.string().trim().min(1, 'Enter a token or API key').max(512),
});
export type IdentifyCredentialRequest = z.infer<typeof identifyCredentialSchema>;

export type IdentifyCredentialResponse =
  | { role: 'operator' }
  | { role: 'account'; account: { id: string; name: string; apiKeyPrefix: string } };

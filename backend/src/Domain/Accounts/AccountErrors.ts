import { AppError } from '../../Shared/Errors/AppError';

export const accountNotFound = () => new AppError('ACCOUNT_NOT_FOUND', 'Account not found.');
export const apiKeyMissing = () => new AppError('API_KEY_MISSING', 'Missing credential. Send the account API key in X-API-Key, or an access token as Authorization: Bearer <token>.');
export const apiKeyInvalid = () => new AppError('API_KEY_INVALID', 'Invalid API key.');
export const credentialInvalid = () => new AppError('CREDENTIAL_INVALID', 'This is neither a valid API key nor the operator token.');

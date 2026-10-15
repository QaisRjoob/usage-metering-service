import { AppError } from '../../Shared/Errors/AppError';

export const accountNotFound = () => new AppError('ACCOUNT_NOT_FOUND', 'Account not found.');
export const apiKeyMissing = () => new AppError('API_KEY_MISSING', 'Missing API key. Send it in the X-API-Key header.');
export const apiKeyInvalid = () => new AppError('API_KEY_INVALID', 'Invalid API key.');
export const adminTokenMissing = () => new AppError('ADMIN_TOKEN_MISSING', 'Missing admin token. Send Authorization: Bearer <token>.');
export const adminTokenInvalid = () => new AppError('ADMIN_TOKEN_INVALID', 'Invalid admin token.');

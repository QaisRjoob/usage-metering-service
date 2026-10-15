export type { ConsumeDecision, ConsumeRequest, QuotaCheckRequest, QuotaCheckResult } from '@/contracts';
export { consumeRequestSchema, quotaCheckRequestSchema } from '@/contracts';

/** Simulated document types used by the Client Demo. Each maps to a fixed number of units. */
export interface DocumentType {
  id: string;
  label: string;
  units: number;
}

export const DOCUMENT_TYPES: DocumentType[] = [
  { id: 'memo', label: 'One-page memo', units: 5 },
  { id: 'invoice', label: 'Invoice', units: 10 },
  { id: 'contract', label: 'Contract', units: 25 },
  { id: 'report', label: 'Annual report', units: 95 },
];

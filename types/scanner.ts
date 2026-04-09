// ─── Scanner Module Types ───

export interface InvoiceHeader {
  invoice_no: string | number;
  total_cases: number;
  total_invoice: number;
  [key: string]: unknown;
}

export interface ScanItem {
  id: string;
  barcode: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  timestamp: Date;
}

export interface ScanResult {
  success: boolean;
  message: string;
  record?: Record<string, unknown>;
}

export interface InvoiceHeaderResult {
  data: InvoiceHeader | null;
  error: string | null;
}

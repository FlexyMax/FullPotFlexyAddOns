// ─── PAX POS Module Types ───

export interface PaxConfig {
  ip: string;
  port: number;
}

export type PaxTransactionType =
  | 'SALE'       // 01
  | 'RETURN'     // 02
  | 'AUTH'       // 03
  | 'POSTAUTH'   // 04
  | 'VOID'       // 16
  | 'BALANCE';   // 23

export const PAX_TRANS_TYPE_CODES: Record<PaxTransactionType, string> = {
  SALE: '01',
  RETURN: '02',
  AUTH: '03',
  POSTAUTH: '04',
  VOID: '16',
  BALANCE: '23',
};

export interface PaxSaleRequest {
  invoiceNo: string;
  amount: number;
  sellerIp: string;
  port?: number;
  referenceNumber?: string;
}

export interface PaxHostInfo {
  hostResponseCode: string;
  hostResponseMessage: string;
  authCode: string;
  hostReferenceNumber: string;
  traceNumber: string;
  batchNumber: string;
}

export interface PaxAmountInfo {
  approveAmount: string;
  amountDue: string;
  tipAmount: string;
  cashBackAmount: string;
  merchantFee: string;
  taxAmount: string;
  balance1: string;
  balance2: string;
}

export interface PaxAccountInfo {
  account: string;
  entryMode: string;
  expireDate: string;
  cardType: string;
  cardHolder: string;
}

export interface PaxResponse {
  status: string;
  command: string;
  version: string;
  responseCode: string;
  responseMessage: string;
  hostInformation?: PaxHostInfo;
  transactionType?: string;
  amountInformation?: PaxAmountInfo;
  accountInformation?: PaxAccountInfo;
  raw: string[][];
}

export interface PaxSaleResult {
  success: boolean;
  message: string;
  responseCode?: string;
  authCode?: string;
  transactionId?: string;
  cardType?: string;
  lastFour?: string;
  approvedAmount?: string;
  hostReferenceNumber?: string;
  raw?: PaxResponse;
}

export type PosFlowStatus =
  | 'idle'
  | 'initializing'
  | 'processing'
  | 'waiting_card'
  | 'approved'
  | 'declined'
  | 'error'
  | 'timeout';

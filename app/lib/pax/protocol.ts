/**
 * PAX POSLink Protocol — TypeScript Implementation
 *
 * Communicates with PAX payment terminals via HTTP.
 * The PAX device runs a local HTTP server (e.g., http://192.168.1.50:10009).
 *
 * Protocol:
 *   Commands are encoded as binary packets with STX/FS/ETX/LRC framing,
 *   then base64-encoded and sent as GET request query parameter.
 *
 * IMPORTANT: This runs CLIENT-SIDE because the PAX is on the seller's local network.
 */

import type {
  PaxConfig,
  PaxResponse,
  PaxHostInfo,
  PaxAmountInfo,
  PaxAccountInfo,
  PaxSaleResult,
} from '@/types/pos';

// ─── Protocol Constants ───
const STX = { hex: 0x02, code: '02' };
const FS = { hex: 0x1c, code: '1c' };
const ETX = { hex: 0x03, code: '03' };
const US = { hex: 0x1f, code: '1f' };

// ─── Encoding Helpers ───

function stringToHex(str: string): string {
  return Array.from(str)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join(' ');
}

function hexToString(hex: string): string {
  return hex
    .split(' ')
    .filter(Boolean)
    .map((h) => String.fromCharCode(parseInt(h, 16)))
    .join('');
}

function btoa(str: string): string {
  if (typeof window !== 'undefined') {
    return window.btoa(str);
  }
  return Buffer.from(str, 'binary').toString('base64');
}

function atob(str: string): string {
  if (typeof window !== 'undefined') {
    return window.atob(str);
  }
  return Buffer.from(str, 'base64').toString('binary');
}

function hexToBase64(hexStr: string): string {
  const bytes = hexStr
    .replace(/\r|\n/g, '')
    .replace(/([\da-fA-F]{2}) ?/g, '0x$1 ')
    .replace(/ +$/, '')
    .split(' ')
    .map((h) => String.fromCharCode(parseInt(h, 10) || parseInt(h, 16)));
  return btoa(bytes.join(''));
}

function base64ToHex(b64: string): string {
  const binary = atob(b64);
  return Array.from(binary)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join(' ');
}

function textToHex(text: string): string {
  return base64ToHex(btoa(text));
}

// ─── LRC Calculation ───

function getLRC(params: (number | string)[]): string {
  let lrc = 0;
  for (let i = 1; i < params.length; i++) {
    const item = params[i];
    if (typeof item === 'string') {
      for (const ch of item) {
        lrc ^= ch.charCodeAt(0);
      }
    } else {
      lrc ^= item;
    }
  }
  return lrc > 0 ? String.fromCharCode(lrc) : String.fromCharCode(0);
}

// ─── Response Parser ───

function parseResponse(response: string, commandType: string): string[][] {
  const responseHex = stringToHex(response);
  const etxIndex = responseHex.indexOf('03');
  const trimmedHex = responseHex.slice(0, etxIndex >= 0 ? etxIndex : undefined);
  const hexParts = trimmedHex.split(/02|1c/).filter(Boolean);

  const packetInfo: string[][] = [];

  if (commandType === 'DoCredit') {
    for (const part of hexParts) {
      if (part.includes('1f')) {
        const subParts = part.split('1f').filter(Boolean);
        packetInfo.push(subParts.map((s) => hexToString(s)));
      } else {
        packetInfo.push([hexToString(part)]);
      }
    }
  } else {
    for (const part of hexParts) {
      packetInfo.push([hexToString(part)]);
    }
  }

  return packetInfo;
}

function parseHostInfo(raw: string[]): PaxHostInfo {
  return {
    hostResponseCode: raw[0] || '',
    hostResponseMessage: raw[1] || '',
    authCode: raw[2] || '',
    hostReferenceNumber: raw[3] || '',
    traceNumber: raw[4] || '',
    batchNumber: raw[5] || '',
  };
}

function parseAmountInfo(raw: string[]): PaxAmountInfo {
  return {
    approveAmount: raw[0] || '',
    amountDue: raw[1] || '',
    tipAmount: raw[2] || '',
    cashBackAmount: raw[3] || '',
    merchantFee: raw[4] || '',
    taxAmount: raw[5] || '',
    balance1: raw[6] || '',
    balance2: raw[7] || '',
  };
}

function parseAccountInfo(raw: string[]): PaxAccountInfo {
  return {
    account: raw[0] || '',
    entryMode: raw[1] || '',
    expireDate: raw[2] || '',
    cardType: raw[6] || '',
    cardHolder: raw[7] || '',
  };
}

// ─── HTTP Communication ───

async function httpRequest(url: string, timeoutMs: number = 120000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'no-cors',
    });

    // With no-cors we might get opaque response, try regular first
    try {
      return await response.text();
    } catch {
      // Fallback: try XMLHttpRequest for cross-origin PAX communication
      return await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = timeoutMs;
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              resolve(xhr.responseText);
            } else {
              reject(new Error(`PAX HTTP Error: ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error('PAX connection failed'));
        xhr.ontimeout = () => reject(new Error('PAX connection timed out'));
        xhr.send(null);
      });
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── PAX Protocol API ───

export class PaxTerminal {
  private baseUrl: string;
  private timeout: number;

  constructor(config: PaxConfig) {
    this.baseUrl = `http://${config.ip}:${config.port}`;
    this.timeout = 120000;
  }

  /**
   * Initialize the PAX terminal connection
   */
  async initialize(version: string = '1.28'): Promise<PaxResponse> {
    const command = 'A00';
    const params: (number | string)[] = [STX.hex, command, FS.hex, version, ETX.hex];
    const lrc = getLRC(params);

    const elements = [
      STX.code,
      textToHex(command),
      FS.code,
      textToHex(version),
      ETX.code,
      textToHex(lrc),
    ];

    const finalB64 = hexToBase64(elements.join(' '));
    const url = `${this.baseUrl}?${finalB64}`;

    console.log('🔌 PAX Initialize →', url);

    const response = await httpRequest(url, this.timeout);
    const parsed = parseResponse(response, 'Initialize');

    return {
      status: parsed[0]?.[0] || '',
      command: parsed[1]?.[0] || '',
      version: parsed[2]?.[0] || '',
      responseCode: parsed[3]?.[0] || '',
      responseMessage: parsed[4]?.[0] || '',
      raw: parsed,
    };
  }

  /**
   * Execute a credit card SALE transaction
   */
  async doSale(
    amount: number,
    invoiceNo: string,
    referenceNumber: string = '1'
  ): Promise<PaxSaleResult> {
    const command = 'T00';
    const version = '1.28';
    const transactionType = '01'; // SALE

    // Amount in cents
    const amountCents = Math.round(amount * 100).toString();

    // Build amount information
    const amountInfo = { TransactionAmount: amountCents, TipAmount: '', CashBackAmount: '', MerchantFee: '', TaxAmount: '', FuelAmount: '' };
    const accountInfo = { Account: '', EXPD: '', CVVCode: '', EBTtype: '', VoucherNumber: '', Force: '', FirstName: '', LastName: '', CountryCode: '', State_ProvinceCode: '', CityName: '', EmailAddress: '' };
    const traceInfo = { ReferenceNumber: referenceNumber, InvoiceNumber: invoiceNo, AuthCode: '', TransactionNumber: '', TimeStamp: '', ECRTransID: '' };
    const avsInfo = { ZipCode: '', Address: '', Address2: '' };
    const cashierInfo = { ClerkID: '', ShiftID: '' };
    const commercialInfo = { PONumber: '', CustomerCode: '', TaxExempt: '', TaxExemptID: '', MerchantTaxID: '', DestinationZipCode: '', ProductDescription: '' };
    const motoEco = { MOTO_E_CommerceMode: '', TransactionType: '', SecureType: '', OrderNumber: '', Installments: '', CurrentInstallment: '' };
    const additionalInfo: Record<string, string> = {};

    // Build LRC params
    let params: (number | string)[] = [STX.hex, command, FS.hex, version, FS.hex, transactionType, FS.hex];
    params = this.pushParams(params, 'amount', amountInfo);
    params.push(FS.hex);
    params = this.pushParams(params, 'account', accountInfo);
    params.push(FS.hex);
    params = this.pushParams(params, 'trace', traceInfo);
    params.push(FS.hex);
    params = this.pushParams(params, 'avs', avsInfo);
    params.push(FS.hex);
    params = this.pushParams(params, 'cashier', cashierInfo);
    params.push(FS.hex);
    params = this.pushParams(params, 'commercial', commercialInfo);
    params.push(FS.hex);
    params = this.pushParams(params, 'moto', motoEco);
    params.push(FS.hex);
    params = this.pushParams(params, 'additionalInformation', additionalInfo);
    params.push(ETX.hex);

    const lrc = getLRC(params);

    // Build base64 elements
    let elements: string[] = [STX.code, textToHex(command), FS.code, textToHex(version), FS.code, textToHex(transactionType), FS.code];
    elements = this.addBase64(elements, 'amount', amountInfo);
    elements.push(FS.code);
    elements = this.addBase64(elements, 'account', accountInfo);
    elements.push(FS.code);
    elements = this.addBase64(elements, 'trace', traceInfo);
    elements.push(FS.code);
    elements = this.addBase64(elements, 'avs', avsInfo);
    elements.push(FS.code);
    elements = this.addBase64(elements, 'cashier', cashierInfo);
    elements.push(FS.code);
    elements = this.addBase64(elements, 'commercial', commercialInfo);
    elements.push(FS.code);
    elements = this.addBase64(elements, 'moto', motoEco);
    elements.push(FS.code);
    elements = this.addBase64(elements, 'additionalInformation', additionalInfo);
    elements.push(ETX.code);
    elements.push(textToHex(lrc));

    const finalB64 = hexToBase64(elements.join(' '));
    const url = `${this.baseUrl}?${finalB64}`;

    console.log('💳 PAX DoCredit (SALE) →', { amount, invoiceNo, url });

    try {
      const response = await httpRequest(url, this.timeout);
      const parsed = parseResponse(response, 'DoCredit');

      const responseCode = parsed[3]?.[0] || '';
      const responseMessage = parsed[4]?.[0] || '';
      const hostInfo = parsed[5] ? parseHostInfo(parsed[5]) : undefined;
      const amountResult = parsed[7] ? parseAmountInfo(parsed[7]) : undefined;
      const accountResult = parsed[8] ? parseAccountInfo(parsed[8]) : undefined;

      const isApproved = responseCode === '000000';

      return {
        success: isApproved,
        message: isApproved
          ? `Approved: ${responseMessage}`
          : `Declined: ${responseMessage}`,
        responseCode,
        authCode: hostInfo?.authCode,
        transactionId: hostInfo?.hostReferenceNumber,
        cardType: accountResult?.cardType,
        lastFour: accountResult?.account?.slice(-4),
        approvedAmount: amountResult?.approveAmount,
        hostReferenceNumber: hostInfo?.hostReferenceNumber,
        raw: {
          status: parsed[0]?.[0] || '',
          command: parsed[1]?.[0] || '',
          version: parsed[2]?.[0] || '',
          responseCode,
          responseMessage,
          hostInformation: hostInfo,
          amountInformation: amountResult,
          accountInformation: accountResult,
          raw: parsed,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'PAX communication error',
      };
    }
  }

  // ─── Internal helpers ───

  private pushParams(
    params: (number | string)[],
    type: string,
    obj: Record<string, string>
  ): (number | string)[] {
    const arr = [...params];
    let hasValue = false;

    for (const value of Object.values(obj)) {
      if (value === '' && type !== 'additionalInformation') {
        arr.push(US.hex);
        continue;
      }

      if (type === 'additionalInformation') {
        if (value === '') continue;
        // Additional info uses KEY=VALUE format
      }

      hasValue = true;
      arr.push(value);
      arr.push(US.hex);
    }

    if (hasValue) {
      arr.pop(); // Remove trailing US
    } else if (!hasValue && type !== 'additionalInformation') {
      // Remove all US entries since empty
      return params;
    }

    return arr;
  }

  private addBase64(
    elements: string[],
    type: string,
    obj: Record<string, string>
  ): string[] {
    const arr = [...elements];
    let hasValue = false;

    for (const [key, value] of Object.entries(obj)) {
      if (value === '' && type !== 'additionalInformation') {
        arr.push(US.code);
        continue;
      }

      if (type === 'additionalInformation') {
        if (value === '') continue;
        hasValue = true;
        arr.push(textToHex(`${key}=${value}`));
      } else {
        hasValue = true;
        arr.push(textToHex(value));
      }
      arr.push(US.code);
    }

    if (hasValue) {
      arr.pop(); // Remove trailing US
    } else if (!hasValue && type !== 'additionalInformation') {
      return elements;
    }

    if (!hasValue && type === 'additionalInformation') {
      arr.push(FS.code);
    }

    return arr;
  }
}

// ─── Test Mode Simulator ───

export function createTestResult(
  amount: number,
  invoiceNo: string,
  approved: boolean = true
): PaxSaleResult {
  if (approved) {
    return {
      success: true,
      message: 'TEST MODE — Approved: This transaction has been approved.',
      responseCode: '000000',
      authCode: 'TEST01',
      transactionId: `TEST-${Date.now()}`,
      cardType: 'Visa',
      lastFour: '1234',
      approvedAmount: Math.round(amount * 100).toString(),
      hostReferenceNumber: `TREF-${invoiceNo}`,
    };
  }

  return {
    success: false,
    message: 'TEST MODE — Declined: Insufficient funds.',
    responseCode: '000005',
  };
}

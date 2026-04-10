export interface BamsPaymentRequest {
  amount: number;
  cardNumber: string;
  expirationDate: string; // MM/YY or YYYY-MM
  cardCode: string;
  invoiceNumber: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  zip?: string;
}

export interface BamsRefundRequest {
  amount: number;
  cardNumber: string; // Usually just last 4 digits needed for refund
  expirationDate?: string; // Can be "XXXX"
  transactionId: string;
}

export interface BamsResponse {
  success: boolean;
  message: string;
  authorizationCode?: string;
  transactionId?: string;
  rawResponse?: any;
}

const AUTHORIZENET_URL = process.env.NODE_ENV === "production" 
  ? "https://api.authorize.net/xml/v1/request.api" 
  : "https://api.authorize.net/xml/v1/request.api"; // Always point to production if standard. Change to apitest.authorize.net if a sandbox account is specifically used.

/**
 * Helper to get authentication credentials
 */
function getAuth() {
  const name = process.env.AUTHORIZENET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZENET_TRANSACTION_KEY;
  if (!name || !transactionKey) {
    throw new Error("Missing Authorize.net credentials in environment variables");
  }
  return { name, transactionKey };
}

/**
 * Execute a charge request
 */
export async function processPayment(req: BamsPaymentRequest): Promise<BamsResponse> {
  const payload = {
    createTransactionRequest: {
      merchantAuthentication: getAuth(),
      refId: `PAY-${Date.now().toString().slice(-8)}`,
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount: req.amount.toFixed(2),
        payment: {
          creditCard: {
            cardNumber: req.cardNumber.replace(/\s+/g, ''),
            expirationDate: req.expirationDate.replace(/\s+/g, ''),
            cardCode: req.cardCode?.trim() || undefined,
          }
        },
        order: {
          invoiceNumber: req.invoiceNumber.toString()
        },
        billTo: {
          firstName: req.firstName || "Unknown",
          lastName: req.lastName || "Unknown",
          address: req.address || "",
          city: req.city || "",
          zip: req.zip || ""
        }
      }
    }
  };

  return executeAuthorizeNetCall(payload);
}

/**
 * Execute a refund request
 */
export async function processRefund(req: BamsRefundRequest): Promise<BamsResponse> {
  const payload = {
    createTransactionRequest: {
      merchantAuthentication: getAuth(),
      refId: `REF-${Date.now().toString().slice(-8)}`,
      transactionRequest: {
        transactionType: "refundTransaction",
        amount: req.amount.toFixed(2),
        payment: {
          creditCard: {
            cardNumber: req.cardNumber,
            expirationDate: req.expirationDate || "XXXX"
          }
        },
        refTransId: req.transactionId
      }
    }
  };

  return executeAuthorizeNetCall(payload);
}

/**
 * Core HTTP Executor to Authorize.net
 */
async function executeAuthorizeNetCall(payload: unknown): Promise<BamsResponse> {
  try {
    const response = await fetch(AUTHORIZENET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }

    // Authorize.net returns JSON structure exactly matching their doc but with a BOM character sometimes.
    const textData = await response.text();
    // Remove BOM (Byte Order Mark) if present (common with authnet APIs)
    const cleanJson = textData.replace(/^\uFEFF/, "");
    
    const data = JSON.parse(cleanJson);
    const result = data?.transactionResponse;
    const messages = data?.messages;

    if (messages?.resultCode !== "Ok" && (!result || result?.errors)) {
      // API Level error (Invalid credentials, bad formatting, etc)
      const errorMsg = result?.errors?.[0]?.errorText || messages?.message?.[0]?.text || "Unknown API Error";
      return {
        success: false,
        message: errorMsg,
        rawResponse: data
      };
    }

    if (result && result.responseCode === "1") { // 1 = Approved
      return {
        success: true,
        message: "Approved",
        authorizationCode: result.authCode,
        transactionId: result.transId,
        rawResponse: data
      };
    } else {
      // 2 = Declined, 3 = Error, 4 = Held for Review
      const declineMsg = result?.errors?.[0]?.errorText || "Transaction Declined";
      return {
        success: false,
        message: declineMsg,
        transactionId: result?.transId, // Might be present even if declined
        rawResponse: data
      };
    }
  } catch (error: any) {
    console.error("AuthorizeNet HTTP Call Error:", error);
    return {
      success: false,
      message: `Connection Error: ${error.message}`
    };
  }
}

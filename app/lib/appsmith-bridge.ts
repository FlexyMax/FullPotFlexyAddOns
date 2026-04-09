/**
 * Appsmith ↔ iFrame Bridge
 *
 * Standardized communication between this app (running in an iFrame)
 * and the parent Appsmith application.
 *
 * Pattern:
 *   Appsmith → iFrame: Query parameters on URL
 *   iFrame → Appsmith: window.parent.postMessage()
 */

const SOURCE_ID = 'flexy-addons';

export type AppsmithEvent =
  | 'SCAN_COMPLETE'
  | 'SCAN_ERROR'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_ERROR'
  | 'REFUND_SUCCESS'
  | 'REFUND_ERROR'
  | 'POS_SALE_SUCCESS'
  | 'POS_SALE_ERROR'
  | 'POS_REFUND_SUCCESS'
  | 'POS_REFUND_ERROR'
  | 'SCANOUT_MATCH'
  | 'SCANOUT_ERROR'
  | 'READY';

interface AppsmithMessage {
  source: typeof SOURCE_ID;
  event: AppsmithEvent;
  data: unknown;
  timestamp: string;
}

/**
 * Send a message to the parent Appsmith window.
 *
 * Usage in Appsmith iFrame widget:
 *   onMessageReceived → {{ message.data }}
 */
export function notifyAppsmith(event: AppsmithEvent, data: unknown = {}): void {
  try {
    const message: AppsmithMessage = {
      source: SOURCE_ID,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    window.parent.postMessage(message, '*');
    console.log(`📤 postMessage → ${event}`, data);
  } catch (error) {
    console.error('❌ Failed to postMessage to Appsmith:', error);
  }
}

/**
 * Listen for messages from the parent Appsmith window.
 */
export function onAppsmithMessage(
  callback: (data: { action: string; payload: unknown }) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.source === 'appsmith') {
      callback(event.data);
    }
  };

  window.addEventListener('message', handler);

  // Return cleanup function
  return () => window.removeEventListener('message', handler);
}

/**
 * Notify Appsmith that the iFrame module is loaded and ready.
 */
export function notifyReady(module: string): void {
  notifyAppsmith('READY', { module });
}

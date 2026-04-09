"use server";

import { executeRPC, sql } from "@/lib/db";

/**
 * Validate order/invoice number to start the scan out process.
 */
export async function validateOrderScanOut(orderNo: string) {
  try {
    const invoiceNo = parseInt(orderNo, 10);
    if (isNaN(invoiceNo)) {
      return { success: false, message: "Invalid invoice number format", data: null };
    }

    const result = await executeRPC("sp_flower_shipping_boxes_control", [
      { name: "invoice_no", type: sql.Int, value: invoiceNo },
    ]);

    const records = result.recordset as Array<Record<string, unknown>>;

    if (!records || records.length === 0) {
      return { success: false, message: "Order not found or no boxes available", data: null };
    }

    // Check for standard error pattern
    if (records[0].error || records[0].Error) {
      return {
        success: false,
        message: (records[0].message || records[0].Message || "Order validation failed") as string,
        data: null,
      };
    }

    // Calculate totals
    let total = 0;
    let scanned = 0;

    for (const row of records) {
      total += Number(row.box_qty || 0);
      scanned += Number(row.qty_out || 0);
    }

    const toScan = Math.max(0, total - scanned);
    const firstRow = records[0];

    return {
      success: true,
      message: "Order validated",
      data: {
        orderNo: orderNo,
        scanned,
        toScan,
        total,
        customer: (firstRow.customer as string) || "Unknown Customer",
        destination: (firstRow.carrier as string) || "Unknown Carrier",
        items: records, // Attach the grid data here
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in validateOrderScanOut:", message);
    return { success: false, message, data: null };
  }
}

/**
 * Get dispatch header information for the Scan Out screen.
 * TODO: Confirm if this is still needed or replaced by validateOrderScanOut.
 */
export async function getScanOutHeader(dispatchUq: string) {
  // Deprecated for the new flow? Keeping as placeholder.
  return { data: { scanned_count: 0, total_boxes: 0 }, error: null };
}

/**
 * Validate that the invoice barcode and vendor barcode match,
 * then confirm the scan of the box.
 * 
 * Flows:
 * 1. sp_flower_packing_box_control_verify(@lcinvbox_uq, @InvoiceNo)
 * 2. sp_flower_packing_box_control_insert_out(@lcpk_box_uq, @lcinvoice_box_uq, @lnbox)
 */
export async function validateScanOutMatch(
  orderNo: string,
  invoiceBarcode: string,
  vendorBarcode: string,
  userUq: string
) {
  try {
    const invoiceNoInt = parseInt(orderNo, 10);
    const invoiceUq = invoiceBarcode.trim();
    const vendorCode = vendorBarcode.trim();

    // 1. Verify Invoice Label
    const verifyResult = await executeRPC("sp_flower_packing_box_control_verify", [
      { name: "lcinvbox_uq", type: sql.Char(8), value: invoiceUq },
      { name: "InvoiceNo", type: sql.Int, value: invoiceNoInt },
    ]);

    const verifyRecords = verifyResult.recordset as Array<Record<string, unknown>>;
    if (!verifyRecords || verifyRecords.length === 0) {
      return { success: false, message: "Invoice verify failed. No data returned from server." };
    }

    const verifyRow = verifyRecords[0];
    if (verifyRow.error || verifyRow.Error) {
      return { success: false, message: (verifyRow.message || verifyRow.Message || "Invoice barcode verification failed") as string };
    }

    const pkBoxUq = verifyRow.pk_box_uq as string;
    if (!pkBoxUq) {
      return { success: false, message: "Invoice verification did not return pk_box_uq." };
    }

    // 2. Validate Match and Insert Out
    // Extract the last 3 characters of the vendor label as an integer
    const vendorBoxRight = vendorCode.slice(-3);
    const lnbox = parseInt(vendorBoxRight, 10);

    if (isNaN(lnbox)) {
      return { success: false, message: "Invalid Vendor Label format. Could not extract box number." };
    }

    const matchResult = await executeRPC("sp_flower_packing_box_control_insert_out", [
      { name: "lcpk_box_uq", type: sql.VarChar(8), value: pkBoxUq },
      { name: "lcinvoice_box_uq", type: sql.VarChar(8), value: invoiceUq },
      { name: "lnbox", type: sql.Int, value: lnbox },
    ]);

    const matchRecords = matchResult.recordset as Array<Record<string, unknown>>;
    if (!matchRecords || matchRecords.length === 0) {
      return { success: false, message: "Match process failed. No data returned from server." };
    }

    const matchRow = matchRecords[0];

    if (matchRow.error === true || matchRow.Error === true || matchRow.error === 1 || matchRow.Error === 1) {
      return { success: false, message: (matchRow.message || matchRow.Message || "Unknown verification Error") as string };
    }

    // 3. Update Totals (Summary)
    const summaryResult = await executeRPC("sp_flower_shipping_boxes_control_summary", [
      { name: "invoice_no", type: sql.Int, value: invoiceNoInt },
    ]);

    const summaryRecords = summaryResult.recordset as Array<Record<string, unknown>>;
    let updatedTotals = {
      scanned: 0,
      toScan: 0,
      total: 0
    };

    if (summaryRecords && summaryRecords.length > 0) {
      const summaryRow = summaryRecords[0];
      updatedTotals.scanned = Number(summaryRow.qty_out || 0);
      updatedTotals.toScan = Number(summaryRow.to_read || 0);
      updatedTotals.total = Number(summaryRow.box_qty || 0);
    }

    return {
      success: true,
      message: (matchRow.message || matchRow.Message || "Match confirmed — box scanned successfully") as string,
      record: matchRow,
      totals: updatedTotals
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in validateScanOutMatch:", message);
    return { success: false, message };
  }
}

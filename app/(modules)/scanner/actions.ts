"use server";

import { executeRPC, sql } from "@/lib/db";

export async function getInvoiceHeader(invoiceUq: string) {
  try {
    const result = await executeRPC("sp_NC_customers_invoice_header", [
      { name: "invoice_uq", type: sql.VarChar(50), value: invoiceUq },
    ]);

    return { data: result.recordset[0], error: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in getInvoiceHeader:", message);
    return { data: null, error: message };
  }
}

async function logTransaction(userUq: string, recordUq: string | number) {
  try {
    await executeRPC(
      "sp_sistema_bitacora_insert",
      [
        { name: "user_uq", type: sql.VarChar(50), value: userUq },
        { name: "company_uq", type: sql.VarChar(50), value: process.env.COMPANY_UQ || "" },
        { name: "panta_uq", type: sql.VarChar(50), value: process.env.PANTA_UQ || "" },
        { name: "lcAction", type: sql.VarChar(50), value: "Insert" },
        { name: "lcTable", type: sql.VarChar(50), value: "flower_invoice_box" },
        { name: "lcRecord", type: sql.VarChar(50), value: recordUq.toString() },
        { name: "lcExtAction", type: sql.VarChar(200), value: "Scan Insert from Invoice FlexyMaxApp" },
      ],
      "sistema"
    );
  } catch (error) {
    console.error("Error inserting bitacora log:", error);
    // We don't fail the main operation if logging fails
  }
}

export async function insertBarcode(invoiceUq: string, barcode: string, userUq: string) {
  try {
    const result = await executeRPC("sp_NC_invoice_flexymax_box_insert_barcode", [
      { name: "invoice_uq", type: sql.Char(8), value: invoiceUq.trim() },
      { name: "lccompuesto", type: sql.VarChar(12), value: barcode.trim() },
      { name: "lcuser_uq", type: sql.VarChar(8), value: userUq.trim() },
    ]);

    const record = result.recordset[0] as Record<string, unknown> | undefined;
    if (record?.error || record?.Error) {
      return {
        success: false,
        message: (record.message || record.Message || "Error inserting barcode") as string,
      };
    }

    // On success, log transaction
    const recordUq = record?.unico || record?.Unico || record?.ID || record?.id;
    if (recordUq) {
      await logTransaction(userUq, recordUq as string | number);
    }

    return {
      success: true,
      message: (record?.message || record?.Message || "Barcode inserted successfully") as string,
      record: record,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in insertBarcode:", message);
    return { success: false, message };
  }
}

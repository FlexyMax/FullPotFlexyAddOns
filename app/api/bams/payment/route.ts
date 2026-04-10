import { NextRequest, NextResponse } from "next/server";
import { executeRPC, sql } from "@/lib/db";
import { processPayment } from "@/lib/bams/client";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestUq = searchParams.get("request_uq");

    if (!requestUq) {
      return NextResponse.json({ error: true, message: "Missing request_uq parameter" }, { status: 400 });
    }

    // Step 1: Execute SP to get payment request details from DB
    // [dbo].[sp_flower_invoice_credit_cards_request_uq_to_WS] @lcrequest_uq
    const requestResult = await executeRPC("sp_flower_invoice_credit_cards_request_uq_to_WS", [
      { name: "lcrequest_uq", type: sql.Char(8), value: requestUq }
    ]);

    const records = requestResult.recordset as Array<Record<string, any>>;
    if (!records || records.length === 0) {
      return NextResponse.json({ error: true, message: "Transaction request not found or already processed" }, { status: 404 });
    }

    const row = records[0];

    // Data Mapping
    const amountStr = row.amount ? String(row.amount) : "0";
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: true, message: "Invalid amount in payment request" }, { status: 400 });
    }

    const cardNumber = row.Card_number as string;
    const expirationDate = row.expiration_date as string;
    const cardCode = row.card_code as string;

    if (!cardNumber || !expirationDate) {
      return NextResponse.json({ error: true, message: "Missing Credit Card details in request" }, { status: 400 });
    }

    // Step 2: Call Authorize.Net REST API
    const authResponse = await processPayment({
      amount: amount,
      cardNumber: cardNumber,
      expirationDate: expirationDate,
      cardCode: cardCode,
      invoiceNumber: String(row.invoice_no || ""),
      firstName: (row.first_name as string) || undefined,
      lastName: (row.last_name as string) || undefined,
      address: (row.address as string) || undefined,
      city: (row.city as string) || undefined,
      zip: (row.zipcode as string) || undefined
    });

    // Step 3: Update DB with result
    // [dbo].[sp_flower_invoice_credit_cards_request_update_from_WS] 
    // @lcrequest_uq char(8), @llapproved bit, @lcmessage_WS varchar(250), @lcauthorization_code varchar(100), @lctransaction_id varchar(100)
    
    const approvedBit = authResponse.success ? 1 : 0;
    const messageWs = (authResponse.message || "").substring(0, 250);
    const authCode = authResponse.authorizationCode || "";
    const transId = authResponse.transactionId || "";

    const updateResult = await executeRPC("sp_flower_invoice_credit_cards_request_update_from_WS", [
      { name: "lcrequest_uq", type: sql.Char(8), value: requestUq },
      { name: "llapproved", type: sql.Bit, value: approvedBit },
      { name: "lcmessage_WS", type: sql.VarChar(250), value: messageWs },
      { name: "lcauthorization_code", type: sql.VarChar(100), value: authCode },
      { name: "lctransaction_id", type: sql.VarChar(100), value: transId }
    ]);

    const updateRecords = updateResult.recordset as Array<Record<string, any>>;
    const updateRow = (updateRecords && updateRecords.length > 0) ? updateRecords[0] : null;

    // Appsmith dataset: unico char(8), message varchar(), error bit 
    if (updateRow) {
      return NextResponse.json({
        unico: updateRow.unico || requestUq,
        message: updateRow.message || authResponse.message,
        error: updateRow.error !== undefined ? updateRow.error : !authResponse.success
      });
    }

    // Fallback if SP returns no recordset
    return NextResponse.json({
      unico: requestUq,
      message: authResponse.message,
      error: !authResponse.success
    });

  } catch (error: any) {
    console.error("BAMS Payment API Error:", error);
    return NextResponse.json({ error: true, message: error.message || "Internal Server Error" }, { status: 500 });
  }
}

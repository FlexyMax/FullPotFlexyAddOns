import { NextRequest, NextResponse } from "next/server";
import { executeRPC, sql } from "@/lib/db";

/**
 * PUT /api/purchase-orders/:unico
 *
 * Updates an existing purchase order line.
 * Executes: sp_flower_prebook_box_porder_update_pc
 *
 * URL param:
 *   unico  – Purchase order ID (8-char)
 *
 * Body (JSON):
 * {
 *   // Required
 *   grower_uq      : string(8)   – Grower ID
 *   product_uq     : string(8)   – Product ID
 *   case_uq        : string(8)   – Case ID
 *   qty_porder     : number      – Qty boxes PO
 *   qty_confirm    : number      – Qty confirmed
 *   bunches_case   : number      – Bunches per case
 *   up_x_pack      : number      – Units per bunch
 *   po_price       : number      – PO unit price (numeric 10,4)
 *   charges        : number      – Other charges per case
 *   broker         : number      – Broker charges per case
 *   handling       : number      – Handling charges per case
 *   freight        : number      – Freight charges per case
 *   duties         : number      – Duties charges per case
 *   ship_date      : string      – Vendor ship date (YYYY-MM-DD)
 *   food           : boolean     – Flower food flag
 *   pccode         : string(20)  – Vendor item code
 *   details        : string(250) – PO notes / instructions
 *   salesman       : string(50)  – Vendor salesman name
 *   active         : boolean     – Active PO
 *   wphysical_uq   : string(8)   – Warehouse ID
 *   buyer_uq       : string(8)   – Buyer ID
 *   pickup_order   : boolean     – Pickup order flag
 *   farm_item      : string(15)  – Farm item code (can be blank)
 *   // Optional
 *   cargo_uq             : string(8)   – Cargo agency ID
 *   inventory_notes      : string(250) – Inventory notes
 *   pickup_date          : string      – Pickup date (YYYY-MM-DD)
 *   pickup_value         : number      – Pickup value
 *   handling_grower_uq   : string(8)   – Handling grower ID
 *   po_invoice           : string(20)  – PO invoice reference
 * }
 *
 * Response:
 *   { unico: string, message: string, error: boolean }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ unico: string }> }
) {
  try {
    const { unico } = await params;

    if (!unico) {
      return NextResponse.json({ error: true, message: "Missing unico in URL" }, { status: 400 });
    }

    const body = await req.json();

    const required = [
      "grower_uq", "product_uq", "case_uq",
      "qty_porder", "qty_confirm", "bunches_case", "up_x_pack",
      "po_price", "charges", "broker", "handling", "freight", "duties",
      "ship_date", "pccode", "details", "salesman",
      "wphysical_uq", "buyer_uq", "farm_item",
    ];

    const missing = required.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: true, message: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await executeRPC("sp_flower_prebook_box_porder_update_pc", [
      { name: "lcunico",               type: sql.VarChar(8),    value: unico },
      { name: "lcgrower_uq",           type: sql.VarChar(8),    value: body.grower_uq },
      { name: "lcproduct_uq",          type: sql.VarChar(8),    value: body.product_uq },
      { name: "lccase_uq",             type: sql.VarChar(8),    value: body.case_uq },
      { name: "lnqty_porder",          type: sql.Int,           value: Number(body.qty_porder) },
      { name: "lnqty_confirm",         type: sql.Int,           value: Number(body.qty_confirm) },
      { name: "lnbunches_case",        type: sql.Int,           value: Number(body.bunches_case) },
      { name: "lnup_x_pack",           type: sql.Int,           value: Number(body.up_x_pack) },
      { name: "lnpo_price",            type: sql.Numeric(10,4), value: Number(body.po_price) },
      { name: "lncharges",             type: sql.Numeric(10,2), value: Number(body.charges) },
      { name: "lnbroker",              type: sql.Numeric(10,2), value: Number(body.broker) },
      { name: "lnhandling",            type: sql.Numeric(10,2), value: Number(body.handling) },
      { name: "lnfreight",             type: sql.Numeric(10,2), value: Number(body.freight) },
      { name: "lnduties",              type: sql.Numeric(10,2), value: Number(body.duties) },
      { name: "ldship_date",           type: sql.DateTime,      value: body.ship_date },
      { name: "llfood",                type: sql.Bit,           value: body.food ? 1 : 0 },
      { name: "lcpccode",              type: sql.VarChar(20),   value: body.pccode ?? "" },
      { name: "lcdetails",             type: sql.VarChar(250),  value: body.details ?? "" },
      { name: "lcsalesman",            type: sql.VarChar(50),   value: body.salesman ?? "" },
      { name: "llactive",              type: sql.Bit,           value: body.active !== false ? 1 : 0 },
      { name: "lccargo_uq",            type: sql.VarChar(8),    value: body.cargo_uq ?? null },
      { name: "lcwphysical_uq",        type: sql.VarChar(8),    value: body.wphysical_uq },
      { name: "lcinventory_notes",     type: sql.VarChar(250),  value: body.inventory_notes ?? "" },
      { name: "lcfarm_item",           type: sql.VarChar(15),   value: body.farm_item ?? "" },
      { name: "llpickup_order",        type: sql.Bit,           value: body.pickup_order ? 1 : 0 },
      { name: "lcbuyer_uq",            type: sql.VarChar(8),    value: body.buyer_uq },
      { name: "ldpickup_date",         type: sql.Date,          value: body.pickup_date ?? null },
      { name: "lnpickup_value",        type: sql.Numeric(12,2), value: Number(body.pickup_value ?? 0) },
      { name: "lchandling_grower_uq",  type: sql.Char(8),       value: body.handling_grower_uq ?? null },
      { name: "lcpo_invoice",          type: sql.VarChar(20),   value: body.po_invoice ?? "" },
    ]);

    const records = result.recordset as Array<Record<string, unknown>>;
    if (!records || records.length === 0) {
      return NextResponse.json({ error: true, message: "SP returned no data" }, { status: 500 });
    }

    const row = records[0];
    return NextResponse.json({
      unico:   row.unico   ?? unico,
      message: row.message ?? row.Message ?? "Purchase order updated",
      error:   row.error   === true || row.error === 1,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("PUT /api/purchase-orders/:unico error:", message);
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}

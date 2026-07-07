import { NextRequest, NextResponse } from "next/server";
import { executeRPC, sql } from "@/lib/db";
import { normalizeSqlDate } from "@/lib/db/dates";

/**
 * GET /api/purchase-orders
 *
 * Lists purchase order lines filtered by ship date, grower, and product.
 * Executes: sp_flower_prebook_box_porder_dates_growers_boxes_pc
 *
 * Query params:
 *   ship_date    string  required  Farm shipping date (YYYY-MM-DD or YYYYMMDD)
 *   grower_uq    string  optional  Grower ID — use '%' or omit for all growers
 *   product_uq   string  optional  Product ID — use '%' or omit for all products
 *
 * Response:
 *   { data: Record<string, unknown>[], count: number }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shipDateRaw = searchParams.get("ship_date");
    const growerUq   = searchParams.get("grower_uq")  ?? "%";
    const productUq  = searchParams.get("product_uq") ?? "%";

    if (!shipDateRaw) {
      return NextResponse.json(
        { error: true, message: "Missing required parameter: ship_date" },
        { status: 400 }
      );
    }

    const shipDate = normalizeSqlDate(shipDateRaw);
    if (!shipDate) {
      return NextResponse.json(
        { error: true, message: "Invalid ship_date format. Use YYYY-MM-DD or YYYYMMDD." },
        { status: 400 }
      );
    }

    const result = await executeRPC("sp_flower_prebook_box_porder_dates_growers_boxes_pc", [
      { name: "ldShipDate",    type: sql.Date,        value: shipDate },
      { name: "lcgrower_uq",  type: sql.VarChar(8),  value: growerUq },
      { name: "lcproduct_uq", type: sql.VarChar(8),  value: productUq },
    ]);

    const data = (result.recordset ?? []) as Array<Record<string, unknown>>;
    return NextResponse.json({ data, count: data.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("GET /api/purchase-orders error:", message);
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}

/**
 * POST /api/purchase-orders
 *
 * Creates a purchase order line against a prebook detail.
 * Executes: sp_flower_prebook_box_porder_insert_pc
 *
 * Body (JSON):
 * {
 *   // Required
 *   pbook_d_uq     : string(8)   – Prebook line ID
 *   pbook_uq       : string(8)   – Prebook ID
 *   grower_uq      : string(8)   – Grower ID
 *   product_uq     : string(8)   – Product ID
 *   case_uq        : string(8)   – Case ID
 *   qty_porder     : number      – Qty boxes PO
 *   bunches_case   : number      – Bunches per case
 *   up_x_pack      : number      – Units per bunch
 *   po_price       : number      – PO price (numeric 10,4)
 *   charges        : number      – Other charges per case
 *   broker         : number      – Broker charges per case
 *   handling       : number      – Handling charges per case
 *   freight        : number      – Freight charges per case
 *   duties         : number      – Duties charges per case
 *   ship_date      : string      – Farm shipping date (YYYY-MM-DD)
 *   food           : boolean     – Flower food flag
 *   pccode         : string(20)  – Vendor item code
 *   details        : string(250) – PO instructions to farm
 *   buyer_uq       : string(8)   – Buyer ID
 *   salesman       : string(50)  – Vendor salesman name
 *   active         : boolean     – Active PO (default true)
 *   purchase_type  : string(1)   – Purchase type (default "S")
 *   wphysical_uq   : string(8)   – Physical warehouse ID
 *   seasonprice    : number      – Season price (numeric 12,4, can be 0)
 *   farm_item      : string(15)  – Farm item code (can be blank)
 *   pickup_order   : boolean     – Pickup order flag
 *   // Optional
 *   cargo_uq         : string(8)   – Cargo agency ID
 *   inventory_notes  : string(250) – Inventory notes
 *   pickup_date      : string      – Pickup date (YYYY-MM-DD)
 *   Porder_stems_uq  : string(8)   – Related prebook box UQ
 *   pickup_value     : number      – Pickup value (numeric 12,2)
 *   handling_grower_uq : string(8) – Handling grower ID
 *   po_invoice       : string(20)  – PO invoice reference
 * }
 *
 * Response:
 * { unico: string, message: string, error: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Required field validation ──────────────────────────────────────────
    const required = [
      "pbook_d_uq", "pbook_uq", "grower_uq", "product_uq", "case_uq",
      "qty_porder", "bunches_case", "up_x_pack", "po_price",
      "charges", "broker", "handling", "freight", "duties",
      "ship_date", "pccode", "details", "buyer_uq", "salesman",
      "purchase_type", "wphysical_uq", "seasonprice", "farm_item",
    ];

    const missing = required.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: true, message: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // ── Normalize dates (accepts YYYY-MM-DD or YYYYMMDD) ─────────────────────
    const shipDate = normalizeSqlDate(body.ship_date);
    if (!shipDate) {
      return NextResponse.json({ error: true, message: "Invalid ship_date format. Use YYYY-MM-DD or YYYYMMDD." }, { status: 400 });
    }
    const pickupDate = body.pickup_date ? normalizeSqlDate(body.pickup_date) : null;
    if (body.pickup_date && !pickupDate) {
      return NextResponse.json({ error: true, message: "Invalid pickup_date format. Use YYYY-MM-DD or YYYYMMDD." }, { status: 400 });
    }

    // ── Execute SP ─────────────────────────────────────────────────────────
    const result = await executeRPC("sp_flower_prebook_box_porder_insert_pc", [
      { name: "lcpbook_d_uq",          type: sql.VarChar(8),    value: body.pbook_d_uq },
      { name: "lcpbook_uq",            type: sql.VarChar(8),    value: body.pbook_uq },
      { name: "lcgrower_uq",           type: sql.VarChar(8),    value: body.grower_uq },
      { name: "lcproduct_uq",          type: sql.VarChar(8),    value: body.product_uq },
      { name: "lccase_uq",             type: sql.VarChar(8),    value: body.case_uq },
      { name: "lnqty_porder",          type: sql.Int,           value: Number(body.qty_porder) },
      { name: "lnbunches_case",        type: sql.Int,           value: Number(body.bunches_case) },
      { name: "lnup_x_pack",           type: sql.Int,           value: Number(body.up_x_pack) },
      { name: "lnpo_price",            type: sql.Numeric(10,4), value: Number(body.po_price) },
      { name: "lncharges",             type: sql.Numeric(10,2), value: Number(body.charges) },
      { name: "lnbroker",              type: sql.Numeric(10,2), value: Number(body.broker) },
      { name: "lnhandling",            type: sql.Numeric(10,2), value: Number(body.handling) },
      { name: "lnfreight",             type: sql.Numeric(10,2), value: Number(body.freight) },
      { name: "lnduties",              type: sql.Numeric(10,2), value: Number(body.duties) },
      { name: "ldship_date",           type: sql.Date,          value: shipDate },
      { name: "llfood",                type: sql.Bit,           value: body.food ? 1 : 0 },
      { name: "lcpccode",              type: sql.VarChar(20),   value: body.pccode ?? "" },
      { name: "lcdetails",             type: sql.VarChar(250),  value: body.details ?? "" },
      { name: "lcbuyer_uq",            type: sql.VarChar(8),    value: body.buyer_uq },
      { name: "lcsalesman",            type: sql.VarChar(50),   value: body.salesman ?? "" },
      { name: "llactive",              type: sql.Bit,           value: body.active !== false ? 1 : 0 },
      { name: "lcpurchase_type",       type: sql.VarChar(1),    value: body.purchase_type ?? "S" },
      { name: "lccargo_uq",            type: sql.VarChar(8),    value: body.cargo_uq ?? null },
      { name: "lcwphysical_uq",        type: sql.VarChar(8),    value: body.wphysical_uq },
      { name: "lcinventory_notes",     type: sql.VarChar(250),  value: body.inventory_notes ?? "" },
      { name: "lnseasonprice",         type: sql.Numeric(12,4), value: Number(body.seasonprice ?? 0) },
      { name: "lcfarm_item",           type: sql.VarChar(15),   value: body.farm_item ?? "" },
      { name: "llpickup_order",        type: sql.Bit,           value: body.pickup_order ? 1 : 0 },
      { name: "ldpickup_date",         type: sql.Date,          value: pickupDate },
      { name: "lcPorder_stems_uq",     type: sql.Char(8),       value: body.Porder_stems_uq ?? null },
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
      unico:   row.unico   ?? null,
      message: row.message ?? row.Message ?? "Purchase order created",
      error:   row.error   === true || row.error === 1,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("POST /api/purchase-orders error:", message);
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { executeRPC, sql } from "@/lib/db";

/**
 * GET /api/prebooks-without-po
 *
 * Returns prebook lines that have no purchase order yet.
 * Executes: sp_NC_prebook_box_without_po
 *
 * Query params:
 *   date         – Prebook date (YYYY-MM-DD or YYYYMMDD)   required
 *   product_type – "FLOWERS" | "HARDGOODS"                 required
 *   search       – Product name filter, e.g. "ROSE"        optional (default: "")
 *
 * Response:
 *   { data: Record<string, unknown>[], count: number }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date        = searchParams.get("date");
    const productType = searchParams.get("product_type");
    const search      = searchParams.get("search") ?? "";

    if (!date) {
      return NextResponse.json({ error: true, message: "Missing required parameter: date" }, { status: 400 });
    }
    if (!productType) {
      return NextResponse.json({ error: true, message: "Missing required parameter: product_type" }, { status: 400 });
    }

    // Normalize date: accept YYYY-MM-DD or YYYYMMDD → always send YYYYMMDD to SP
    const normalized = date.replace(/-/g, "");
    if (!/^\d{8}$/.test(normalized)) {
      return NextResponse.json({ error: true, message: "Invalid date format. Use YYYY-MM-DD or YYYYMMDD." }, { status: 400 });
    }

    const result = await executeRPC("sp_NC_prebook_box_without_po", [
      { name: "ldpb_date",       type: sql.Date,         value: normalized },
      { name: "lcproduct_type",  type: sql.VarChar(10),  value: productType },
      { name: "lcsearch",        type: sql.VarChar(100), value: search },
    ]);

    const data = (result.recordset ?? []) as Array<Record<string, unknown>>;

    return NextResponse.json({ data, count: data.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("GET /api/prebooks-without-po error:", message);
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}

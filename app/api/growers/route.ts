import { NextResponse } from "next/server";
import { executeRPC } from "@/lib/db";

/**
 * GET /api/growers
 *
 * Returns the full list of growers.
 * Executes: sp_NC_growers_list (no parameters)
 *
 * Response:
 *   { data: Record<string, unknown>[], count: number }
 */
export async function GET() {
  try {
    const result = await executeRPC("sp_NC_growers_list", []);
    const data = (result.recordset ?? []) as Array<Record<string, unknown>>;

    return NextResponse.json({ data, count: data.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("GET /api/growers error:", message);
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}

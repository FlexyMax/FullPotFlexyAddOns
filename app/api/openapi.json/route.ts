import { NextRequest, NextResponse } from "next/server";
import { buildOpenApiSpec, stripRestricted } from "@/lib/openapi";

/**
 * GET /api/openapi.json?key=X
 *
 * Returns the OpenAPI spec for the docs UI. BAMS/financial operations are
 * stripped out unless `key` matches DOCS_BAMS_PASSWORD.
 *
 * Response:
 *   { spec: OpenAPIObject, unlocked: boolean }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") ?? "";

  const password = process.env.DOCS_BAMS_PASSWORD;
  const unlocked = Boolean(password) && key === password;

  const fullSpec = buildOpenApiSpec();
  const spec = unlocked ? fullSpec : stripRestricted(fullSpec);

  return NextResponse.json({ spec, unlocked });
}

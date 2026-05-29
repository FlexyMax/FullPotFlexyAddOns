import { NextRequest, NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";

const DEFAULT_PREFIX = "Fullpot/Product_Images/";
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"];

function isImage(key: string) {
  const lower = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// ── AWS4 Signing (SigV4) ────────────────────────────────────────────────────

function sha256hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function buildAuthHeaders(
  host: string,
  path: string,
  sortedQuery: string,
  accessKey: string,
  secretKey: string,
  region: string
): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex("");

  // DO Spaces requires x-amz-content-sha256 to be included in the signed headers
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeadersList = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = ["GET", path, sortedQuery, canonicalHeaders, signedHeadersList, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256hex(canonicalRequest)].join("\n");

  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = hmacSha256(kSigning, stringToSign).toString("hex");

  return {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`,
  };
}

// ── S3 XML parser ───────────────────────────────────────────────────────────

function parseS3XML(xml: string) {
  const items: Array<{ key: string; size: number; lastModified: string }> = [];
  const contentsRx = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m: RegExpExecArray | null;
  while ((m = contentsRx.exec(xml)) !== null) {
    const block = m[1];
    const key = block.match(/<Key>(.*?)<\/Key>/)?.[1] ?? "";
    const size = parseInt(block.match(/<Size>(.*?)<\/Size>/)?.[1] ?? "0", 10);
    const lastModified = block.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] ?? "";
    if (key) items.push({ key, size, lastModified });
  }
  const nextToken =
    xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? null;
  return { items, nextToken };
}

// ── Handler ─────────────────────────────────────────────────────────────────

/**
 * GET /api/images
 *
 * Query params:
 *   prefix   – folder path inside the bucket (default: "Fullpot/Product_Images/")
 *   maxKeys  – max results per page, 1-1000 (default: 200)
 *   token    – continuation token for next page (returned as nextToken)
 *
 * Response:
 * {
 *   images: [{ key, url, size, lastModified }],
 *   count: number,
 *   prefix: string,
 *   nextToken: string | null
 * }
 */
export async function GET(req: NextRequest) {
  const accessKey = (process.env.DO_SPACES_KEY ?? "").trim();
  const secretKey = (process.env.DO_SPACES_SECRET ?? "").trim();
  const region    = (process.env.DO_SPACES_REGION ?? "nyc3").trim();
  const bucket    = (process.env.DO_SPACES_BUCKET ?? "flexymax").trim();
  const cdn       = (process.env.DO_SPACES_CDN_ENDPOINT ?? `https://${bucket}.${region}.digitaloceanspaces.com`).trim();

  if (!accessKey || !secretKey) {
    return NextResponse.json(
      { error: true, message: "Digital Ocean Spaces credentials not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get("prefix") ?? DEFAULT_PREFIX;
  const maxKeys = Math.min(Math.max(parseInt(searchParams.get("maxKeys") ?? "200", 10), 1), 1000);
  const continuationToken = searchParams.get("token") ?? undefined;

  try {
    // Build query string — must be sorted alphabetically for SigV4
    const qp: Record<string, string> = {
      "list-type": "2",
      "max-keys": String(maxKeys),
      prefix,
    };
    if (continuationToken) qp["continuation-token"] = continuationToken;

    const sortedQuery = Object.keys(qp)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(qp[k])}`)
      .join("&");

    // Path style: nyc3.digitaloceanspaces.com/flexymax/
    const host = `${region}.digitaloceanspaces.com`;
    const path = `/${bucket}/`;

    const authHeaders = buildAuthHeaders(host, path, sortedQuery, accessKey, secretKey, region);

    const url = `https://${host}${path}?${sortedQuery}`;
    const res = await fetch(url, {
      headers: {
        Host: host,
        ...authHeaders,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: true, message: `DO Spaces ${res.status}: ${text}` }, { status: 500 });
    }

    const xml = await res.text();
    const { items, nextToken } = parseS3XML(xml);

    const images = items
      .filter((img) => isImage(img.key))
      .map((img) => ({
        key: img.key,
        url: `${cdn}/${img.key}`,
        size: img.size,
        lastModified: img.lastModified,
      }));

    return NextResponse.json({ images, count: images.length, prefix, nextToken });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("GET /api/images error:", message);
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_PREFIX = "Fullpot/Product_Images/";
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"];
const SPACES_PUBLIC_URL = "https://flexymax.nyc3.digitaloceanspaces.com";
const CDN_URL = "https://flexymax.nyc3.digitaloceanspaces.com";

function isImage(key: string) {
  const lower = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

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

/**
 * GET /api/images
 *
 * Lists images from the public DO Spaces bucket (no auth required — bucket is public).
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
  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get("prefix") ?? DEFAULT_PREFIX;
  const maxKeys = Math.min(Math.max(parseInt(searchParams.get("maxKeys") ?? "200", 10), 1), 1000);
  const continuationToken = searchParams.get("token") ?? undefined;

  try {
    const params = new URLSearchParams({
      "list-type": "2",
      "max-keys": String(maxKeys),
      prefix,
    });
    if (continuationToken) params.set("continuation-token", continuationToken);

    const res = await fetch(`${SPACES_PUBLIC_URL}/?${params}`);

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: true, message: `DO Spaces ${res.status}: ${text}` },
        { status: 500 }
      );
    }

    const xml = await res.text();
    const { items, nextToken } = parseS3XML(xml);

    const images = items
      .filter((img) => isImage(img.key))
      .map((img) => ({
        key: img.key,
        url: `${CDN_URL}/${img.key}`,
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

import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.DO_SPACES_REGION!,
  endpoint: process.env.DO_SPACES_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
  forcePathStyle: false,
});

const BUCKET = process.env.DO_SPACES_BUCKET!;
const CDN = process.env.DO_SPACES_CDN_ENDPOINT!;
const DEFAULT_PREFIX = "Fullpot/Product_Images/";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"]);

function isImage(key: string) {
  const lower = key.toLowerCase();
  return Array.from(IMAGE_EXTENSIONS).some((ext) => lower.endsWith(ext));
}

/**
 * GET /api/images
 *
 * Query params:
 *   prefix   – folder path inside the bucket (default: "Fullpot/Product_Images/")
 *   maxKeys  – max number of objects to return, 1-1000 (default: 200)
 *   token    – continuation token for pagination (returned as nextToken in the response)
 *
 * Response:
 * {
 *   images: [{ key: string, url: string, size: number, lastModified: string }],
 *   count: number,
 *   prefix: string,
 *   nextToken: string | null   // pass as ?token=X to get the next page
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const prefix = searchParams.get("prefix") ?? DEFAULT_PREFIX;
    const maxKeys = Math.min(Math.max(parseInt(searchParams.get("maxKeys") ?? "200", 10), 1), 1000);
    const continuationToken = searchParams.get("token") ?? undefined;

    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    });

    const result = await s3.send(command);

    const images = (result.Contents ?? [])
      .filter((obj) => obj.Key && isImage(obj.Key))
      .map((obj) => ({
        key: obj.Key!,
        url: `${CDN}/${obj.Key}`,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? null,
      }));

    return NextResponse.json({
      images,
      count: images.length,
      prefix,
      nextToken: result.NextContinuationToken ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("GET /api/images error:", message);
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}

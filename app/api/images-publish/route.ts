import { createHmac, createHash } from 'crypto';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const KEY    = process.env.DO_SPACES_KEY    ?? '';
const SECRET = process.env.DO_SPACES_SECRET ?? '';
const BUCKET = process.env.DO_SPACES_BUCKET ?? '';
const REGION = process.env.DO_SPACES_REGION ?? '';
const HOST   = `${BUCKET}.${REGION}.digitaloceanspaces.com`;
const FOLDER = 'Fullpot/Product_Images/';

function sign(key: Buffer | string, msg: string) {
  return createHmac('sha256', key).update(msg).digest();
}
function hash(s: string) {
  return createHash('sha256').update(s).digest('hex');
}
function signingKey(secret: string, date: string, region: string) {
  return sign(sign(sign(sign(`AWS4${secret}`, date), region), 's3'), 'aws4_request');
}
function encodeS3URI(str: string) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// Canonical query string for ACL operations is "acl=" (key + empty value).
function buildAclHeaders(encodedPath: string): Record<string, string> {
  const now         = new Date();
  const amzdate     = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const datestamp   = amzdate.slice(0, 8);
  const payloadHash = hash('');
  const canonicalQS = 'acl=';

  const allHeaders: Record<string, string> = {
    host: HOST,
    'x-amz-acl': 'public-read',
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzdate,
  };

  const signedHeadersList = Object.keys(allHeaders).sort();
  const canonicalHeaders  = signedHeadersList.map(k => `${k}:${allHeaders[k]}\n`).join('');
  const signedHeaders     = signedHeadersList.join(';');
  const canonicalRequest  = ['PUT', encodedPath, canonicalQS, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope   = `${datestamp}/${REGION}/s3/aws4_request`;
  const stringToSign      = `AWS4-HMAC-SHA256\n${amzdate}\n${credentialScope}\n${hash(canonicalRequest)}`;
  const signature         = sign(signingKey(SECRET, datestamp, REGION), stringToSign).toString('hex');
  const authorization     = `AWS4-HMAC-SHA256 Credential=${KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { ...allHeaders, Authorization: authorization };
}

// Uses the public (unauthenticated) bucket listing — same approach as /api/images,
// which avoids SigV4 signing issues on Vercel while the bucket allows public reads.
async function listMatchingKeys(prefix: string): Promise<string[]> {
  const all: string[] = [];
  let token: string | undefined;

  do {
    const params = new URLSearchParams({ 'list-type': '2', 'max-keys': '1000', prefix });
    if (token) params.set('continuation-token', token);

    const res  = await fetch(`https://${HOST}/?${params}`);
    const body = await res.text();

    const keys  = [...body.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
    const sizes = [...body.matchAll(/<Size>(\d+)<\/Size>/g)].map(m => parseInt(m[1]));
    keys.forEach((k, i) => { if (sizes[i] > 15) all.push(k); });

    token = body.includes('<IsTruncated>true</IsTruncated>')
      ? (body.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) ?? [])[1]
      : undefined;
  } while (token);

  return all;
}

async function setPublic(objectKey: string): Promise<{ status: number; detail: string }> {
  const encodedPath = '/' + objectKey.split('/').map(p => encodeS3URI(p)).join('/');
  const headers = buildAclHeaders(encodedPath);
  const res = await fetch(`https://${HOST}${encodedPath}?acl`, { method: 'PUT', headers });
  const detail = await res.text();
  if (res.status !== 200) console.error(`[images-publish] ACL PUT ${res.status} for ${objectKey}:`, detail);
  return { status: res.status, detail };
}

/**
 * POST /api/images/make-public
 *
 * Sets all DO Spaces objects matching a product ID prefix to public-read ACL.
 * Searches under Fullpot/Product_Images/<productId>*.
 *
 * Headers:
 *   x-api-key  string  required  Must match INTERNAL_API_KEY env var
 *
 * Body (JSON):
 *   productId  string  required  Product ID prefix to search (e.g. "0281D1B1")
 *
 * Response:
 *   { success, productId, count, updated: string[], failed: string[] }
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let productId: string;
  try {
    const body = await request.json();
    productId = (body?.productId ?? body?.filename ?? '').toString().trim();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!productId) {
    return Response.json({ error: '"productId" is required' }, { status: 400 });
  }
  if (!KEY || !SECRET || !BUCKET || !REGION) {
    return Response.json({ error: 'Storage not configured' }, { status: 503 });
  }

  const safeId = productId.replace(/[/\\]/g, '');
  const prefix = `${FOLDER}${safeId}`;

  try {
    const keys = await listMatchingKeys(prefix);

    if (keys.length === 0) {
      return Response.json({ success: false, productId: safeId, count: 0, updated: [], failed: [], error: 'No files found with that product ID' }, { status: 404 });
    }

    const results: { key: string; ok: boolean; status: number; detail: string }[] = [];
    for (const key of keys) {
      const { status, detail } = await setPublic(key);
      results.push({ key, ok: status === 200, status, detail });
    }

    const failed = results.filter(r => !r.ok);
    return Response.json({
      success:   failed.length === 0,
      productId: safeId,
      count:     results.length,
      updated:   results.filter(r => r.ok).map(r => r.key.replace(FOLDER, '')),
      failed:    failed.map(r => ({ file: r.key.replace(FOLDER, ''), status: r.status, detail: r.detail })),
    });
  } catch (error) {
    console.error('[POST /api/images-publish]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

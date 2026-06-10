import { Badge } from "@/components/ui/badge";
import { Monitor } from "lucide-react";
import Link from "next/link";

const BASE_URL = "https://full-pot-flexy-add-ons.vercel.app";

type Param = {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
};

type Endpoint = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  sp?: string;
  queryParams?: Param[];
  bodyParams?: Param[];
  response: string;
  example?: { request?: string; response: string };
};

const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/health",
    description: "System health check. Returns DB connectivity status and application uptime.",
    response: `{ status, timestamp, app, version, db: { connected, latencyMs }, uptime, modules[] }`,
    example: {
      response: `{
  "status": "ok",
  "timestamp": "2026-05-29T12:00:00.000Z",
  "app": "FullPot FlexyAddOns",
  "version": "1.0.0",
  "db": { "connected": true, "latencyMs": 12 },
  "uptime": "5m 32s"
}`,
    },
  },
  {
    method: "POST",
    path: "/api/bams/payment",
    description: "Charges a credit card via Authorize.Net. Reads card details from DB using the request UQ, processes the charge, and writes the result back to the DB.",
    sp: "sp_flower_invoice_credit_cards_request_uq_to_WS / sp_flower_invoice_credit_cards_request_update_from_WS",
    queryParams: [
      { name: "request_uq", type: "string(8)", required: true, description: "Payment request unique ID", example: "A1B2C3D4" },
    ],
    response: `{ unico: string, message: string, error: boolean }`,
    example: {
      response: `{ "unico": "A1B2C3D4", "message": "This transaction has been approved.", "error": false }`,
    },
  },
  {
    method: "POST",
    path: "/api/bams/refund",
    description: "Voids or refunds a prior Authorize.Net transaction. Reads transaction details from DB, calls the refund API, and updates the result.",
    sp: "sp_flower_invoice_credit_cards_refund_call_WS / sp_flower_invoice_credit_cards_refund_update_from_WS",
    queryParams: [
      { name: "request_uq", type: "string(8)", required: true, description: "Refund request unique ID", example: "A1B2C3D4" },
    ],
    response: `{ unico: string, message: string, error: boolean }`,
    example: {
      response: `{ "unico": "A1B2C3D4", "message": "This transaction has been approved.", "error": false }`,
    },
  },
  {
    method: "GET",
    path: "/api/images",
    description: "Lists product images stored in Digital Ocean Spaces (public bucket). Supports pagination via continuation token.",
    queryParams: [
      { name: "prefix",   type: "string",  required: false, description: "Folder path inside the bucket", example: "Fullpot/Product_Images/" },
      { name: "maxKeys",  type: "number",  required: false, description: "Max results per page (1–1000, default 200)", example: "50" },
      { name: "token",    type: "string",  required: false, description: "Continuation token from previous response for next page", example: "Fullpot/Product_Images/0281D1B1-1.png" },
    ],
    response: `{ images: [{ key, url, size, lastModified }], count, prefix, nextToken }`,
    example: {
      response: `{
  "images": [
    {
      "key": "Fullpot/Product_Images/0016B613-1.jpg",
      "url": "https://flexymax.nyc3.digitaloceanspaces.com/Fullpot/Product_Images/0016B613-1.jpg",
      "size": 84684,
      "lastModified": "2025-08-03T06:02:33.268Z"
    }
  ],
  "count": 1,
  "prefix": "Fullpot/Product_Images/",
  "nextToken": "Fullpot/Product_Images/0281D1B1-1.png"
}`,
    },
  },
  {
    method: "POST",
    path: "/api/purchase-orders",
    description: "Creates a purchase order line against a prebook detail. Sends the PO to the vendor with all pricing, logistics, and product details.",
    sp: "sp_flower_prebook_box_porder_insert_pc",
    bodyParams: [
      { name: "pbook_d_uq",          type: "string(8)",   required: true,  description: "Prebook line ID" },
      { name: "pbook_uq",            type: "string(8)",   required: true,  description: "Prebook ID" },
      { name: "grower_uq",           type: "string(8)",   required: true,  description: "Grower ID" },
      { name: "product_uq",          type: "string(8)",   required: true,  description: "Product ID" },
      { name: "case_uq",             type: "string(8)",   required: true,  description: "Case ID" },
      { name: "qty_porder",          type: "integer",     required: true,  description: "Qty boxes PO" },
      { name: "bunches_case",        type: "integer",     required: true,  description: "Bunches per case" },
      { name: "up_x_pack",           type: "integer",     required: true,  description: "Units per bunch" },
      { name: "po_price",            type: "decimal",     required: true,  description: "PO price" },
      { name: "charges",             type: "decimal",     required: true,  description: "Other charges per case" },
      { name: "broker",              type: "decimal",     required: true,  description: "Broker charges per case" },
      { name: "handling",            type: "decimal",     required: true,  description: "Handling charges per case" },
      { name: "freight",             type: "decimal",     required: true,  description: "Freight charges per case" },
      { name: "duties",              type: "decimal",     required: true,  description: "Duties charges per case" },
      { name: "ship_date",           type: "date",        required: true,  description: "Farm shipping date (YYYY-MM-DD)" },
      { name: "food",                type: "boolean",     required: true,  description: "Flower food included" },
      { name: "pccode",              type: "string(20)",  required: true,  description: "Vendor item code" },
      { name: "details",             type: "string(250)", required: true,  description: "PO instructions to farm" },
      { name: "buyer_uq",            type: "string(8)",   required: true,  description: "Buyer ID" },
      { name: "salesman",            type: "string(50)",  required: true,  description: "Vendor salesman name" },
      { name: "active",              type: "boolean",     required: false, description: "Active PO — default true" },
      { name: "purchase_type",       type: "string(1)",   required: false, description: "Purchase type — default 'S'" },
      { name: "wphysical_uq",        type: "string(8)",   required: true,  description: "Physical warehouse ID" },
      { name: "seasonprice",         type: "decimal",     required: false, description: "Season price — default 0" },
      { name: "farm_item",           type: "string(15)",  required: false, description: "Farm item code — can be blank" },
      { name: "pickup_order",        type: "boolean",     required: false, description: "Pickup order flag — default false" },
      { name: "cargo_uq",            type: "string(8)",   required: false, description: "Cargo agency ID — optional" },
      { name: "inventory_notes",     type: "string(250)", required: false, description: "Inventory notes — optional" },
      { name: "pickup_date",         type: "date",        required: false, description: "Pickup date (YYYY-MM-DD) — optional" },
      { name: "Porder_stems_uq",     type: "string(8)",   required: false, description: "Related prebook box UQ — optional" },
      { name: "pickup_value",        type: "decimal",     required: false, description: "Pickup value — default 0" },
      { name: "handling_grower_uq",  type: "string(8)",   required: false, description: "Handling grower ID — optional" },
      { name: "po_invoice",          type: "string(20)",  required: false, description: "PO invoice reference — optional" },
    ],
    response: `{ unico: string, message: string, error: boolean }`,
    example: {
      request: `{
  "pbook_d_uq": "A1B2C3D4",
  "pbook_uq":   "E5F6G7H8",
  "grower_uq":  "I9J0K1L2",
  "product_uq": "M3N4O5P6",
  "case_uq":    "Q7R8S9T0",
  "qty_porder": 10,
  "bunches_case": 25,
  "up_x_pack": 10,
  "po_price": 12.5000,
  "charges": 0.50,
  "broker": 0.00,
  "handling": 0.25,
  "freight": 1.00,
  "duties": 0.00,
  "ship_date": "2026-06-15",
  "food": false,
  "pccode": "ROSE-RED-60",
  "details": "Handle with care. Keep refrigerated.",
  "buyer_uq": "U1V2W3X4",
  "salesman": "John Smith",
  "purchase_type": "S",
  "wphysical_uq": "Y5Z6A7B8",
  "seasonprice": 0,
  "farm_item": "",
  "pickup_order": false
}`,
      response: `{ "unico": "C9D0E1F2", "message": "Purchase order created successfully", "error": false }`,
    },
  },
];

const methodColors: Record<string, string> = {
  GET:    "bg-zinc-200 text-zinc-700",
  POST:   "bg-blue-100 text-blue-700",
  PUT:    "bg-yellow-100 text-yellow-700",
  DELETE: "bg-red-100 text-red-700",
};

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-zinc-900 p-2.5 rounded-xl">
              <Monitor className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">FullPot FlexyAddOns</h1>
              <p className="text-xs text-zinc-400 font-medium">API Reference</p>
            </div>
          </div>
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900 font-semibold transition-colors">
            ← Back to Home
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-4">
        {/* Intro */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-8">
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-2">Base URL</h2>
          <code className="text-sm font-mono text-zinc-800">{BASE_URL}</code>
          <p className="text-sm text-zinc-500 mt-3">
            All endpoints return JSON. Error responses always include{" "}
            <code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">{"{ error: true, message: string }"}</code>.
            Dates must be in <code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">YYYY-MM-DD</code> format.
          </p>
        </div>

        {/* Endpoint Cards */}
        {endpoints.map((ep) => (
          <div key={ep.path} className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100">
              <span className={`text-[11px] font-black px-2.5 py-1 rounded-md ${methodColors[ep.method]}`}>
                {ep.method}
              </span>
              <code className="text-sm font-mono font-semibold text-zinc-800">{ep.path}</code>
              {ep.sp && (
                <span className="ml-auto text-[10px] text-zinc-400 font-mono hidden md:block truncate max-w-xs">
                  SP: {ep.sp}
                </span>
              )}
            </div>

            <div className="px-6 py-5 space-y-5">
              <p className="text-sm text-zinc-600">{ep.description}</p>

              {/* Query params */}
              {ep.queryParams && ep.queryParams.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
                    Query Parameters
                  </h3>
                  <div className="rounded-xl border border-zinc-100 overflow-hidden text-xs">
                    <table className="w-full">
                      <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase tracking-wider">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold w-40">Parameter</th>
                          <th className="text-left px-4 py-2 font-semibold w-24">Type</th>
                          <th className="text-left px-4 py-2 font-semibold w-20">Required</th>
                          <th className="text-left px-4 py-2 font-semibold">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {ep.queryParams.map((p) => (
                          <tr key={p.name} className="text-zinc-700">
                            <td className="px-4 py-2.5 font-mono font-semibold text-zinc-800">{p.name}</td>
                            <td className="px-4 py-2.5 text-zinc-500">{p.type}</td>
                            <td className="px-4 py-2.5">
                              {p.required
                                ? <Badge className="text-[9px] bg-red-100 text-red-600 hover:bg-red-100">required</Badge>
                                : <Badge variant="secondary" className="text-[9px]">optional</Badge>}
                            </td>
                            <td className="px-4 py-2.5 text-zinc-500">
                              {p.description}
                              {p.example && <span className="ml-1 text-zinc-400">— e.g. <code>{p.example}</code></span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Body params */}
              {ep.bodyParams && ep.bodyParams.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
                    Request Body (JSON)
                  </h3>
                  <div className="rounded-xl border border-zinc-100 overflow-hidden text-xs">
                    <table className="w-full">
                      <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase tracking-wider">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold w-48">Field</th>
                          <th className="text-left px-4 py-2 font-semibold w-24">Type</th>
                          <th className="text-left px-4 py-2 font-semibold w-20">Required</th>
                          <th className="text-left px-4 py-2 font-semibold">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {ep.bodyParams.map((p) => (
                          <tr key={p.name} className="text-zinc-700">
                            <td className="px-4 py-2.5 font-mono font-semibold text-zinc-800">{p.name}</td>
                            <td className="px-4 py-2.5 text-zinc-500">{p.type}</td>
                            <td className="px-4 py-2.5">
                              {p.required
                                ? <Badge className="text-[9px] bg-red-100 text-red-600 hover:bg-red-100">required</Badge>
                                : <Badge variant="secondary" className="text-[9px]">optional</Badge>}
                            </td>
                            <td className="px-4 py-2.5 text-zinc-500">{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Response + Example */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Response</h3>
                  <pre className="bg-zinc-950 text-zinc-300 rounded-xl p-4 text-xs overflow-x-auto">
                    {ep.response}
                  </pre>
                </div>
                {ep.example && (
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
                      {ep.example.request ? "Example Request Body" : "Example Response"}
                    </h3>
                    <pre className="bg-zinc-950 text-green-400 rounded-xl p-4 text-xs overflow-x-auto">
                      {ep.example.request ?? ep.example.response}
                    </pre>
                  </div>
                )}
              </div>

              {ep.example?.request && (
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
                    Example Response
                  </h3>
                  <pre className="bg-zinc-950 text-green-400 rounded-xl p-4 text-xs overflow-x-auto">
                    {ep.example.response}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ))}

        <footer className="mt-10 text-center text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">
          FullPot FlexyAddOns Engine • v1.0.0
        </footer>
      </div>
    </main>
  );
}

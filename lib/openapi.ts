// OpenAPI 3.0 spec for the FullPot FlexyAddOns API.
// Paths/operations marked `x-restricted: true` are stripped out by
// stripRestricted() unless the caller supplies the correct docs password.

type OpenApiOperation = Record<string, unknown> & { "x-restricted"?: boolean };
type OpenApiPathItem = Record<string, OpenApiOperation>;
type OpenApiSpec = {
  openapi: string;
  info: Record<string, unknown>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, OpenApiPathItem>;
  components: Record<string, unknown>;
};

export function buildOpenApiSpec(): OpenApiSpec {
  return {
    openapi: "3.0.3",
    info: {
      title: "FullPot FlexyAddOns API",
      version: "1.0.0",
      description:
        "Micro-services powering the FullPot Appsmith iFrame integrations. " +
        "Endpoints tagged **BAMS / Financial** require the documentation password to view in this UI " +
        "(the underlying endpoints themselves are not yet auth-protected at runtime).",
    },
    tags: [
      { name: "System", description: "Health and status checks" },
      { name: "BAMS / Financial", description: "Credit card processing via Authorize.Net — restricted docs" },
      { name: "Images", description: "Digital Ocean Spaces product image listing" },
      { name: "Purchase Orders", description: "Create and update vendor purchase orders" },
      { name: "Prebooks", description: "Prebook lookups" },
      { name: "Growers", description: "Grower master data" },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["System"],
          summary: "System health check",
          description: "Returns DB connectivity status and application uptime.",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      timestamp: { type: "string", format: "date-time" },
                      app: { type: "string", example: "FullPot FlexyAddOns" },
                      version: { type: "string", example: "1.0.0" },
                      db: {
                        type: "object",
                        properties: {
                          connected: { type: "boolean" },
                          latencyMs: { type: "number" },
                        },
                      },
                      uptime: { type: "string", example: "5m 32s" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/bams/payment": {
        post: {
          "x-restricted": true,
          tags: ["BAMS / Financial"],
          summary: "Charge a credit card via Authorize.Net",
          description:
            "Reads card details from the DB using the request UQ, charges via Authorize.Net, and writes the result back to the DB.\n\n" +
            "SPs: `sp_flower_invoice_credit_cards_request_uq_to_WS` / `sp_flower_invoice_credit_cards_request_update_from_WS`",
          parameters: [
            {
              name: "request_uq",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 8, maxLength: 8 },
              example: "A1B2C3D4",
              description: "Payment request unique ID",
            },
          ],
          responses: {
            "200": {
              description: "Payment processed (check `error` field for outcome)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      unico: { type: "string" },
                      message: { type: "string" },
                      error: { type: "boolean" },
                    },
                  },
                  example: { unico: "A1B2C3D4", message: "This transaction has been approved.", error: false },
                },
              },
            },
          },
        },
      },

      "/api/bams/refund": {
        post: {
          "x-restricted": true,
          tags: ["BAMS / Financial"],
          summary: "Refund or void a prior Authorize.Net transaction",
          description:
            "Reads transaction details from the DB, calls the Authorize.Net refund API, and updates the result.\n\n" +
            "SPs: `sp_flower_invoice_credit_cards_refund_call_WS` / `sp_flower_invoice_credit_cards_refund_update_from_WS`",
          parameters: [
            {
              name: "request_uq",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 8, maxLength: 8 },
              example: "A1B2C3D4",
              description: "Refund request unique ID",
            },
          ],
          responses: {
            "200": {
              description: "Refund processed (check `error` field for outcome)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      unico: { type: "string" },
                      message: { type: "string" },
                      error: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/images/make-public": {
        post: {
          tags: ["Images"],
          summary: "Set product images to public-read",
          description:
            "Finds all objects under `Fullpot/Product_Images/<productId>*` in DO Spaces " +
            "and sets each one's ACL to `public-read`.\n\n" +
            "Requires the `x-api-key` header matching `INTERNAL_API_KEY`.",
          parameters: [
            {
              name: "x-api-key",
              in: "header",
              required: true,
              schema: { type: "string" },
              description: "Internal API key — must match INTERNAL_API_KEY env var",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["productId"],
                  properties: {
                    productId: {
                      type: "string",
                      description: "Product ID prefix to match (e.g. '0281D1B1')",
                      example: "0281D1B1",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Files updated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success:   { type: "boolean" },
                      productId: { type: "string" },
                      count:     { type: "integer" },
                      updated:   { type: "array", items: { type: "string" } },
                      failed:    { type: "array", items: { type: "string" } },
                    },
                  },
                  example: { success: true, productId: "0281D1B1", count: 3, updated: ["0281D1B1-1.png", "0281D1B1-2.png", "0281D1B1-3.png"], failed: [] },
                },
              },
            },
            "404": { description: "No files found for that product ID" },
            "401": { description: "Unauthorized — invalid or missing x-api-key" },
          },
        },
      },

      "/api/images": {
        get: {
          tags: ["Images"],
          summary: "List product images",
          description: "Lists images from the public Digital Ocean Spaces bucket. Supports pagination via continuation token.",
          parameters: [
            { name: "prefix", in: "query", required: false, schema: { type: "string", default: "Fullpot/Product_Images/" }, description: "Folder path inside the bucket" },
            { name: "maxKeys", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 1000, default: 200 }, description: "Max results per page" },
            { name: "token", in: "query", required: false, schema: { type: "string" }, description: "Continuation token from a previous response" },
          ],
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      images: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            key: { type: "string" },
                            url: { type: "string" },
                            size: { type: "number" },
                            lastModified: { type: "string" },
                          },
                        },
                      },
                      count: { type: "integer" },
                      prefix: { type: "string" },
                      nextToken: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/purchase-orders": {
        get: {
          tags: ["Purchase Orders"],
          summary: "List purchase order lines",
          description:
            "Lists PO lines filtered by ship date, with optional grower and product filters.\n\n" +
            "SP: `sp_flower_prebook_box_porder_dates_growers_boxes_pc`",
          parameters: [
            {
              name: "ship_date",
              in: "query",
              required: true,
              schema: { type: "string" },
              example: "2026-07-05",
              description: "Farm shipping date — YYYY-MM-DD or YYYYMMDD",
            },
            {
              name: "grower_uq",
              in: "query",
              required: false,
              schema: { type: "string" },
              example: "%",
              description: "Grower ID — omit or use '%' for all growers",
            },
            {
              name: "product_uq",
              in: "query",
              required: false,
              schema: { type: "string" },
              example: "%",
              description: "Product ID — omit or use '%' for all products",
            },
          ],
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { type: "object" } },
                      count: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Purchase Orders"],
          summary: "Create a purchase order line",
          description: "Creates a purchase order line against a prebook detail.\n\nSP: `sp_flower_prebook_box_porder_insert_pc`",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "pbook_d_uq", "pbook_uq", "grower_uq", "product_uq", "case_uq",
                    "qty_porder", "bunches_case", "up_x_pack", "po_price",
                    "charges", "broker", "handling", "freight", "duties",
                    "ship_date", "pccode", "details", "buyer_uq", "salesman",
                    "purchase_type", "wphysical_uq", "seasonprice", "farm_item",
                  ],
                  properties: {
                    pbook_d_uq: { type: "string", maxLength: 8, description: "Prebook line ID" },
                    pbook_uq: { type: "string", maxLength: 8, description: "Prebook ID" },
                    grower_uq: { type: "string", maxLength: 8, description: "Grower ID" },
                    product_uq: { type: "string", maxLength: 8, description: "Product ID" },
                    case_uq: { type: "string", maxLength: 8, description: "Case ID" },
                    qty_porder: { type: "integer", description: "Qty boxes PO" },
                    bunches_case: { type: "integer", description: "Bunches per case" },
                    up_x_pack: { type: "integer", description: "Units per bunch" },
                    po_price: { type: "number", description: "PO price" },
                    charges: { type: "number" },
                    broker: { type: "number" },
                    handling: { type: "number" },
                    freight: { type: "number" },
                    duties: { type: "number" },
                    ship_date: { type: "string", description: "Farm shipping date — YYYY-MM-DD or YYYYMMDD", example: "2026-06-15" },
                    food: { type: "boolean" },
                    pccode: { type: "string", maxLength: 20, description: "Vendor item code" },
                    details: { type: "string", maxLength: 250, description: "PO instructions to farm" },
                    buyer_uq: { type: "string", maxLength: 8 },
                    salesman: { type: "string", maxLength: 50 },
                    active: { type: "boolean", default: true },
                    purchase_type: { type: "string", maxLength: 1, default: "S" },
                    wphysical_uq: { type: "string", maxLength: 8, description: "Physical warehouse ID" },
                    seasonprice: { type: "number" },
                    farm_item: { type: "string", maxLength: 15 },
                    pickup_order: { type: "boolean" },
                    cargo_uq: { type: "string", maxLength: 8, nullable: true },
                    inventory_notes: { type: "string", maxLength: 250 },
                    pickup_date: { type: "string", nullable: true, description: "YYYY-MM-DD or YYYYMMDD" },
                    Porder_stems_uq: { type: "string", maxLength: 8, nullable: true },
                    pickup_value: { type: "number" },
                    handling_grower_uq: { type: "string", maxLength: 8, nullable: true },
                    po_invoice: { type: "string", maxLength: 20 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { unico: { type: "string" }, message: { type: "string" }, error: { type: "boolean" } },
                  },
                },
              },
            },
          },
        },
      },

      "/api/purchase-orders/{unico}": {
        put: {
          tags: ["Purchase Orders"],
          summary: "Update a purchase order line",
          description: "Updates an existing purchase order line by its unico ID.\n\nSP: `sp_flower_prebook_box_porder_update_pc`",
          parameters: [
            { name: "unico", in: "path", required: true, schema: { type: "string", maxLength: 8 }, description: "Purchase order ID" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "grower_uq", "product_uq", "case_uq",
                    "qty_porder", "qty_confirm", "bunches_case", "up_x_pack",
                    "po_price", "charges", "broker", "handling", "freight", "duties",
                    "ship_date", "pccode", "details", "salesman",
                    "wphysical_uq", "buyer_uq", "farm_item",
                  ],
                  properties: {
                    grower_uq: { type: "string", maxLength: 8 },
                    product_uq: { type: "string", maxLength: 8 },
                    case_uq: { type: "string", maxLength: 8 },
                    qty_porder: { type: "integer" },
                    qty_confirm: { type: "integer" },
                    bunches_case: { type: "integer" },
                    up_x_pack: { type: "integer" },
                    po_price: { type: "number" },
                    charges: { type: "number" },
                    broker: { type: "number" },
                    handling: { type: "number" },
                    freight: { type: "number" },
                    duties: { type: "number" },
                    ship_date: { type: "string", description: "YYYY-MM-DD or YYYYMMDD" },
                    food: { type: "boolean" },
                    pccode: { type: "string", maxLength: 20 },
                    details: { type: "string", maxLength: 250 },
                    salesman: { type: "string", maxLength: 50 },
                    active: { type: "boolean", default: true },
                    wphysical_uq: { type: "string", maxLength: 8 },
                    buyer_uq: { type: "string", maxLength: 8 },
                    pickup_order: { type: "boolean" },
                    farm_item: { type: "string", maxLength: 15 },
                    cargo_uq: { type: "string", maxLength: 8, nullable: true },
                    inventory_notes: { type: "string", maxLength: 250 },
                    pickup_date: { type: "string", nullable: true, description: "YYYY-MM-DD or YYYYMMDD" },
                    pickup_value: { type: "number" },
                    handling_grower_uq: { type: "string", maxLength: 8, nullable: true },
                    po_invoice: { type: "string", maxLength: 20 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Updated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { unico: { type: "string" }, message: { type: "string" }, error: { type: "boolean" } },
                  },
                },
              },
            },
          },
        },
      },

      "/api/prebooks-without-po": {
        get: {
          tags: ["Prebooks"],
          summary: "List prebook lines with no purchase order yet",
          description: "SP: `sp_NC_prebook_box_without_po`",
          parameters: [
            { name: "date", in: "query", required: true, schema: { type: "string" }, example: "2026-06-15", description: "Prebook date — YYYY-MM-DD or YYYYMMDD" },
            { name: "product_type", in: "query", required: true, schema: { type: "string", enum: ["FLOWERS", "HARDGOODS"] }, example: "FLOWERS" },
            { name: "search", in: "query", required: false, schema: { type: "string" }, example: "ANTHURIUM", description: "Product name filter — blank returns all" },
          ],
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { type: "object" } },
                      count: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/growers": {
        get: {
          tags: ["Growers"],
          summary: "List all growers",
          description: "SP: `sp_NC_growers_list` (no parameters)",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { type: "object" } },
                      count: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {},
  };
}

/** Returns a copy of the spec with all `x-restricted` operations removed. */
export function stripRestricted(spec: OpenApiSpec): OpenApiSpec {
  const paths: Record<string, OpenApiPathItem> = {};

  for (const [path, methods] of Object.entries(spec.paths)) {
    const kept: OpenApiPathItem = {};
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation["x-restricted"]) kept[method] = operation;
    }
    if (Object.keys(kept).length > 0) paths[path] = kept;
  }

  return { ...spec, paths };
}

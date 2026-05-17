import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type ProductRelationRow = {
  internal_sku: string;
  title?: string | null;
  status: string | null;
};

type OrderRow = {
  id: string;
  provider_order_id: string;
  sold_at: string;
  status: string;
  gross_amount: number | string;
  marketplace_fee_amount: number | string;
  shipping_cost_amount: number | string;
  discounts_amount: number | string;
  taxes_amount: number | string;
};

type OrderRelationRow = {
  provider_order_id: string;
  sold_at: string;
  status: string;
  gross_amount: number | string;
  taxes_amount: number | string;
};

type OrderItemRow = {
  order_id: string;
  seller_sku: string | null;
  title: string;
  quantity: number | string;
  gross_amount: number | string;
  marketplace_fee_amount: number | string;
  shipping_cost_amount: number | string;
  discount_amount: number | string;
  orders?: OrderRelationRow | OrderRelationRow[] | null;
};

type CostRow = {
  cost_category:
    | "product"
    | "packaging"
    | "inbound_freight"
    | "tax"
    | "marketplace_fixed"
    | "other";
  allocation_method: "per_unit" | "percentage" | "per_order";
  amount: number | string;
  valid_from: string;
  valid_to: string | null;
  products: ProductRelationRow | ProductRelationRow[] | null;
};

type AdvertisingMetricRow = {
  impressions: number | string;
  clicks: number | string;
  ad_spend_amount: number | string;
  attributed_revenue_amount: number | string;
  attributed_orders: number | string;
  metric_date: string;
  products?: ProductRelationRow | ProductRelationRow[] | null;
};

type InventorySnapshotRow = {
  seller_sku: string | null;
  fulfillment_channel: string;
  available_quantity: number | string;
  reserved_quantity: number | string;
  not_available_quantity: number | string;
  captured_at: string;
  products?: ProductRelationRow | ProductRelationRow[] | null;
};

type MarketplaceAccountRow = {
  id: string;
  account_name: string;
  external_seller_id: string;
  last_sync_at: string | null;
};

type MarketplaceCredentialsRow = {
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
};

type MercadoLivreOrder = {
  id: number | string;
  date_created?: string;
  status?: string;
  total_amount?: number;
  paid_amount?: number;
  fulfilled?: boolean;
  order_items?: Array<{
    item?: {
      id?: string;
      seller_sku?: string;
      title?: string;
    };
    quantity?: number;
    unit_price?: number;
  }>;
};

type PeriodArgs = {
  dateFrom?: string;
  dateTo?: string;
  organizationId?: string;
  period?: "today" | "yesterday" | "last_7_days" | "last_30_days" | "this_month";
};

type PeriodRange = {
  dateFrom: string;
  dateTo: string;
  endExclusive: string;
  label: string;
  startIso: string;
  endIsoExclusive: string;
};

type SkuCostTotals = {
  costAmount: number;
  taxAmount: number;
};

type SkuMarginRow = {
  sku: string;
  title: string;
  units: number;
  orders: number;
  grossRevenue: number;
  discounts: number;
  marketplaceFees: number;
  shippingCosts: number;
  taxes: number;
  skuCosts: number;
  advertisingCosts: number;
  contributionMargin: number;
  contributionMarginRate: number;
  tacos: number;
};

const periodShape = {
  organizationId: z.string().optional(),
  period: z
    .enum(["today", "yesterday", "last_7_days", "last_30_days", "this_month"])
    .optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
};

const organizationShape = {
  organizationId: z.string().optional()
};

function loadProjectEnv() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentDir, "../../.env.local"),
    resolve(currentDir, "../.env.local"),
    resolve(process.cwd(), "../.env.local"),
    resolve(process.cwd(), ".env.local")
  ];
  const envPath = candidates.find((candidate) => existsSync(candidate));

  if (!envPath) return;

  const content = readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function envValue(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return null;
}

function requireEnv(keys: string[]) {
  const value = envValue(keys);
  if (!value) throw new Error(`Configure ${keys.join(" ou ")}.`);
  return value;
}

function getSupabase() {
  const supabaseUrl = requireEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceRoleKey = requireEnv(["SUPABASE_SERVICE_ROLE_KEY"]);

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

function numberFromDb(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric"
  }).format(new Date());
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + days);

  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric"
  }).format(date);
}

function monthStart(dateValue: string) {
  return `${dateValue.slice(0, 7)}-01`;
}

function resolvePeriod(args: PeriodArgs): PeriodRange {
  const today = todayDate();
  const period = args.period ?? "this_month";
  let dateFrom = args.dateFrom;
  let dateTo = args.dateTo;
  let label = "custom";

  if (!dateFrom || !dateTo) {
    if (period === "today") {
      dateFrom = today;
      dateTo = today;
      label = "today";
    } else if (period === "yesterday") {
      dateFrom = addDays(today, -1);
      dateTo = dateFrom;
      label = "yesterday";
    } else if (period === "last_7_days") {
      dateFrom = addDays(today, -6);
      dateTo = today;
      label = "last_7_days";
    } else if (period === "last_30_days") {
      dateFrom = addDays(today, -29);
      dateTo = today;
      label = "last_30_days";
    } else {
      dateFrom = monthStart(today);
      dateTo = today;
      label = "this_month";
    }
  }

  const endExclusive = addDays(dateTo, 1);

  return {
    dateFrom,
    dateTo,
    endExclusive,
    label,
    startIso: new Date(`${dateFrom}T00:00:00-03:00`).toISOString(),
    endIsoExclusive: new Date(`${endExclusive}T00:00:00-03:00`).toISOString()
  };
}

function getRelatedProduct(row: CostRow | AdvertisingMetricRow | InventorySnapshotRow) {
  if (Array.isArray(row.products)) return row.products[0] ?? null;
  return row.products ?? null;
}

function getRelatedOrder(row: OrderItemRow) {
  if (Array.isArray(row.orders)) return row.orders[0] ?? null;
  return row.orders ?? null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isRevenueOrder(status: string) {
  const normalized = normalizeText(status);
  return !normalized.includes("cancel") && !normalized.includes("invalid");
}

function isFullChannel(channel: string) {
  const normalized = channel.trim().toLowerCase();
  return normalized === "full" || normalized === "fulfillment";
}

function costAppliesToDate(cost: CostRow, dateValue: string) {
  return cost.valid_from <= dateValue && (!cost.valid_to || cost.valid_to > dateValue);
}

function calculateCostAmount(cost: CostRow, item: OrderItemRow) {
  const amount = numberFromDb(cost.amount);

  if (cost.allocation_method === "percentage") {
    return numberFromDb(item.gross_amount) * (amount / 100);
  }

  if (cost.allocation_method === "per_order") {
    return amount;
  }

  return numberFromDb(item.quantity) * amount;
}

async function resolveOrganizationId(
  supabase: SupabaseClient,
  organizationId?: string
) {
  if (organizationId) return organizationId;

  const envOrganizationId = envValue(["DASHMARKET_ORGANIZATION_ID"]);
  if (envOrganizationId) return envOrganizationId;

  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("Nenhuma empresa DASHMARKET encontrada.");

  return data.id as string;
}

async function fetchOrders(
  supabase: SupabaseClient,
  organizationId: string,
  period: PeriodRange
) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, provider_order_id, sold_at, status, gross_amount, marketplace_fee_amount, shipping_cost_amount, discounts_amount, taxes_amount"
    )
    .eq("organization_id", organizationId)
    .gte("sold_at", period.startIso)
    .lt("sold_at", period.endIsoExclusive)
    .order("sold_at", { ascending: false })
    .limit(10000);

  if (error) throw error;

  return ((data ?? []) as OrderRow[]).filter((order) =>
    isRevenueOrder(order.status)
  );
}

async function fetchOrderItems(
  supabase: SupabaseClient,
  organizationId: string,
  orderIds: string[]
) {
  if (orderIds.length === 0) return [];

  const { data, error } = await supabase
    .from("order_items")
    .select(
      "order_id, seller_sku, title, quantity, gross_amount, marketplace_fee_amount, shipping_cost_amount, discount_amount, orders(provider_order_id, sold_at, status, gross_amount, taxes_amount)"
    )
    .eq("organization_id", organizationId)
    .in("order_id", orderIds)
    .limit(20000);

  if (error) throw error;

  return (data ?? []) as OrderItemRow[];
}

async function fetchCostsBySku(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("sku_costs")
    .select(
      "cost_category, allocation_method, amount, valid_from, valid_to, products(internal_sku, title, status)"
    )
    .eq("organization_id", organizationId)
    .limit(20000);

  if (error) throw error;

  const costsBySku = new Map<string, CostRow[]>();

  for (const cost of (data ?? []) as CostRow[]) {
    const product = getRelatedProduct(cost);
    if (!product || product.status === "archived") continue;

    const current = costsBySku.get(product.internal_sku) ?? [];
    current.push(cost);
    costsBySku.set(product.internal_sku, current);
  }

  return costsBySku;
}

async function fetchAdvertisingBySku(
  supabase: SupabaseClient,
  organizationId: string,
  period: PeriodRange
) {
  const { data, error } = await supabase
    .from("advertising_metrics")
    .select(
      "impressions, clicks, ad_spend_amount, attributed_revenue_amount, attributed_orders, metric_date, products(internal_sku, title, status)"
    )
    .eq("organization_id", organizationId)
    .gte("metric_date", period.dateFrom)
    .lt("metric_date", period.endExclusive)
    .limit(20000);

  if (error) throw error;

  const adsBySku = new Map<
    string,
    {
      sku: string;
      title: string;
      impressions: number;
      clicks: number;
      adSpend: number;
      attributedRevenue: number;
      attributedOrders: number;
    }
  >();

  for (const metric of (data ?? []) as AdvertisingMetricRow[]) {
    const product = getRelatedProduct(metric);
    const sku = product?.internal_sku ?? "Geral";
    const current =
      adsBySku.get(sku) ??
      ({
        sku,
        title: product?.title ?? "Campanhas gerais",
        impressions: 0,
        clicks: 0,
        adSpend: 0,
        attributedRevenue: 0,
        attributedOrders: 0
      } satisfies {
        sku: string;
        title: string;
        impressions: number;
        clicks: number;
        adSpend: number;
        attributedRevenue: number;
        attributedOrders: number;
      });

    current.impressions += numberFromDb(metric.impressions);
    current.clicks += numberFromDb(metric.clicks);
    current.adSpend += numberFromDb(metric.ad_spend_amount);
    current.attributedRevenue += numberFromDb(metric.attributed_revenue_amount);
    current.attributedOrders += numberFromDb(metric.attributed_orders);
    adsBySku.set(sku, current);
  }

  return adsBySku;
}

function buildSkuMargins(
  items: OrderItemRow[],
  costsBySku: Map<string, CostRow[]>,
  adsBySku: Map<string, { adSpend: number }>
) {
  const marginsBySku = new Map<string, SkuMarginRow>();

  for (const item of items) {
    const order = getRelatedOrder(item);
    const sku = item.seller_sku ?? "SKU sem codigo";
    const current =
      marginsBySku.get(sku) ??
      ({
        sku,
        title: item.title,
        units: 0,
        orders: 0,
        grossRevenue: 0,
        discounts: 0,
        marketplaceFees: 0,
        shippingCosts: 0,
        taxes: 0,
        skuCosts: 0,
        advertisingCosts: 0,
        contributionMargin: 0,
        contributionMarginRate: 0,
        tacos: 0
      } satisfies SkuMarginRow);
    const grossAmount = numberFromDb(item.gross_amount);
    const orderGrossAmount = numberFromDb(order?.gross_amount);
    const orderTaxAmount = numberFromDb(order?.taxes_amount);
    const allocatedOrderTax =
      orderGrossAmount > 0 ? orderTaxAmount * (grossAmount / orderGrossAmount) : 0;
    const itemDate = order?.sold_at?.slice(0, 10) ?? todayDate();
    const costTotals = (costsBySku.get(sku) ?? []).reduce<SkuCostTotals>(
      (totals, cost) => {
        if (!costAppliesToDate(cost, itemDate)) return totals;

        const amount = calculateCostAmount(cost, item);
        if (cost.cost_category === "tax") {
          return { ...totals, taxAmount: totals.taxAmount + amount };
        }

        return { ...totals, costAmount: totals.costAmount + amount };
      },
      { costAmount: 0, taxAmount: 0 }
    );

    current.units += numberFromDb(item.quantity);
    current.orders += 1;
    current.grossRevenue += grossAmount;
    current.discounts += numberFromDb(item.discount_amount);
    current.marketplaceFees += numberFromDb(item.marketplace_fee_amount);
    current.shippingCosts += numberFromDb(item.shipping_cost_amount);
    current.taxes += allocatedOrderTax + costTotals.taxAmount;
    current.skuCosts += costTotals.costAmount;
    marginsBySku.set(sku, current);
  }

  for (const margin of marginsBySku.values()) {
    margin.advertisingCosts = adsBySku.get(margin.sku)?.adSpend ?? 0;
    margin.contributionMargin =
      margin.grossRevenue -
      margin.discounts -
      margin.marketplaceFees -
      margin.shippingCosts -
      margin.taxes -
      margin.skuCosts -
      margin.advertisingCosts;
    margin.contributionMarginRate =
      margin.grossRevenue > 0 ? margin.contributionMargin / margin.grossRevenue : 0;
    margin.tacos =
      margin.grossRevenue > 0 ? margin.advertisingCosts / margin.grossRevenue : 0;
  }

  return Array.from(marginsBySku.values()).sort(
    (current, next) => next.grossRevenue - current.grossRevenue
  );
}

function result(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data as Record<string, unknown>
  };
}

async function getSalesSummary(args: PeriodArgs) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const period = resolvePeriod(args);
  const orders = await fetchOrders(supabase, organizationId, period);
  const orderIds = orders.map((order) => order.id);
  const items = await fetchOrderItems(supabase, organizationId, orderIds);
  const costsBySku = await fetchCostsBySku(supabase, organizationId);
  const adsBySku = await fetchAdvertisingBySku(supabase, organizationId, period);
  const skuMargins = buildSkuMargins(items, costsBySku, adsBySku);
  const totals = skuMargins.reduce(
    (acc, row) => ({
      units: acc.units + row.units,
      orders: acc.orders + row.orders,
      grossRevenue: acc.grossRevenue + row.grossRevenue,
      discounts: acc.discounts + row.discounts,
      marketplaceFees: acc.marketplaceFees + row.marketplaceFees,
      shippingCosts: acc.shippingCosts + row.shippingCosts,
      taxes: acc.taxes + row.taxes,
      skuCosts: acc.skuCosts + row.skuCosts,
      advertisingCosts: acc.advertisingCosts + row.advertisingCosts,
      contributionMargin: acc.contributionMargin + row.contributionMargin
    }),
    {
      units: 0,
      orders: orders.length,
      grossRevenue: 0,
      discounts: 0,
      marketplaceFees: 0,
      shippingCosts: 0,
      taxes: 0,
      skuCosts: 0,
      advertisingCosts: 0,
      contributionMargin: 0
    }
  );

  return {
    organizationId,
    period,
    totals: {
      ...totals,
      netRevenue: totals.grossRevenue - totals.discounts,
      contributionMarginRate:
        totals.grossRevenue > 0
          ? totals.contributionMargin / totals.grossRevenue
          : 0,
      tacos:
        totals.grossRevenue > 0 ? totals.advertisingCosts / totals.grossRevenue : 0
    },
    topSkus: skuMargins.slice(0, 10)
  };
}

async function getFullInventory(args: { organizationId?: string }) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const { data, error } = await supabase
    .from("inventory_snapshots")
    .select(
      "seller_sku, fulfillment_channel, available_quantity, reserved_quantity, not_available_quantity, captured_at, products(internal_sku, title, status)"
    )
    .eq("organization_id", organizationId)
    .in("fulfillment_channel", ["full", "fulfillment"])
    .order("captured_at", { ascending: false })
    .limit(20000);

  if (error) throw error;

  const latestBySku = new Map<string, InventorySnapshotRow>();

  for (const snapshot of (data ?? []) as InventorySnapshotRow[]) {
    if (!isFullChannel(snapshot.fulfillment_channel)) continue;

    const sku = snapshot.seller_sku ?? getRelatedProduct(snapshot)?.internal_sku;
    if (!sku || latestBySku.has(sku)) continue;

    const product = getRelatedProduct(snapshot);
    if (product?.status === "archived") continue;

    latestBySku.set(sku, snapshot);
  }

  const skus = Array.from(latestBySku.keys());
  const { data: salesData, error: salesError } =
    skus.length > 0
      ? await supabase
          .from("order_items")
          .select(
            "seller_sku, title, quantity, gross_amount, marketplace_fee_amount, orders(provider_order_id, sold_at, status, gross_amount, taxes_amount)"
          )
          .eq("organization_id", organizationId)
          .in("seller_sku", skus)
          .gte(
            "created_at",
            new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
          )
          .limit(20000)
      : { data: [], error: null };

  if (salesError) throw salesError;

  const pricingBySku = new Map<
    string,
    {
      grossRevenue: number;
      marketplaceFees: number;
      units: number;
    }
  >();

  for (const sale of (salesData ?? []) as OrderItemRow[]) {
    const order = getRelatedOrder(sale);
    if (order && !isRevenueOrder(order.status)) continue;

    const sku = sale.seller_sku;
    if (!sku) continue;

    const current =
      pricingBySku.get(sku) ??
      ({
        grossRevenue: 0,
        marketplaceFees: 0,
        units: 0
      } satisfies {
        grossRevenue: number;
        marketplaceFees: number;
        units: number;
      });

    current.grossRevenue += numberFromDb(sale.gross_amount);
    current.marketplaceFees += numberFromDb(sale.marketplace_fee_amount);
    current.units += numberFromDb(sale.quantity);
    pricingBySku.set(sku, current);
  }

  const rows = Array.from(latestBySku.entries()).map(([sku, snapshot]) => {
    const product = getRelatedProduct(snapshot);
    const available = numberFromDb(snapshot.available_quantity);
    const reserved = numberFromDb(snapshot.reserved_quantity);
    const notAvailable = numberFromDb(snapshot.not_available_quantity);
    const totalQuantity = available + reserved + notAvailable;
    const pricing = pricingBySku.get(sku);
    const unitSalePrice =
      pricing && pricing.units > 0 ? pricing.grossRevenue / pricing.units : 0;
    const unitMarketplaceFee =
      pricing && pricing.units > 0 ? pricing.marketplaceFees / pricing.units : 0;
    const unitNetValue = unitSalePrice - unitMarketplaceFee;

    return {
      sku,
      title: product?.title ?? "Produto sem titulo",
      available,
      reserved,
      notAvailable,
      totalQuantity,
      unitSalePrice,
      unitMarketplaceFee,
      unitNetValue,
      investedValue: totalQuantity * unitNetValue,
      hasPricing: Boolean(pricing && pricing.units > 0),
      capturedAt: snapshot.captured_at
    };
  });

  return {
    organizationId,
    totals: {
      skus: rows.length,
      available: rows.reduce((sum, row) => sum + row.available, 0),
      reserved: rows.reduce((sum, row) => sum + row.reserved, 0),
      notAvailable: rows.reduce((sum, row) => sum + row.notAvailable, 0),
      totalQuantity: rows.reduce((sum, row) => sum + row.totalQuantity, 0),
      investedValue: rows.reduce((sum, row) => sum + row.investedValue, 0)
    },
    rows: rows.sort((current, next) => next.totalQuantity - current.totalQuantity)
  };
}

async function getAdsSummary(args: PeriodArgs) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const period = resolvePeriod(args);
  const adsBySku = await fetchAdvertisingBySku(supabase, organizationId, period);
  const rows = Array.from(adsBySku.values()).map((row) => ({
    ...row,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    acos: row.attributedRevenue > 0 ? row.adSpend / row.attributedRevenue : 0
  }));
  const totals = rows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      adSpend: acc.adSpend + row.adSpend,
      attributedRevenue: acc.attributedRevenue + row.attributedRevenue,
      attributedOrders: acc.attributedOrders + row.attributedOrders
    }),
    {
      impressions: 0,
      clicks: 0,
      adSpend: 0,
      attributedRevenue: 0,
      attributedOrders: 0
    }
  );

  return {
    organizationId,
    period,
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      acos:
        totals.attributedRevenue > 0
          ? totals.adSpend / totals.attributedRevenue
          : 0
    },
    rows: rows.sort((current, next) => next.adSpend - current.adSpend).slice(0, 30)
  };
}

async function getSkuMargin(args: PeriodArgs & { limit?: number; sku?: string }) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const period = resolvePeriod(args);
  const orders = await fetchOrders(supabase, organizationId, period);
  const items = await fetchOrderItems(
    supabase,
    organizationId,
    orders.map((order) => order.id)
  );
  const costsBySku = await fetchCostsBySku(supabase, organizationId);
  const adsBySku = await fetchAdvertisingBySku(supabase, organizationId, period);
  const query = args.sku?.trim().toLowerCase();
  const rows = buildSkuMargins(items, costsBySku, adsBySku)
    .filter((row) => !query || row.sku.toLowerCase().includes(query))
    .slice(0, args.limit ?? 30);

  return {
    organizationId,
    period,
    rows
  };
}

async function getConnectedMercadoLivreAccount(
  supabase: SupabaseClient,
  organizationId: string
) {
  const { data: account, error: accountError } = await supabase
    .from("marketplace_accounts")
    .select("id, account_name, external_seller_id, last_sync_at")
    .eq("organization_id", organizationId)
    .eq("provider", "mercadolivre")
    .eq("status", "connected")
    .order("last_sync_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account) throw new Error("Nenhuma conta Mercado Livre conectada.");

  const currentAccount = account as MarketplaceAccountRow;
  const { data: credentials, error: credentialsError } = await supabase
    .from("marketplace_account_credentials")
    .select("access_token, refresh_token, token_expires_at, scopes")
    .eq("account_id", currentAccount.id)
    .maybeSingle();

  if (credentialsError) throw credentialsError;
  if (!credentials) throw new Error("Credenciais do Mercado Livre nao encontradas.");

  return {
    account: currentAccount,
    credentials: credentials as MarketplaceCredentialsRow
  };
}

function isTokenExpiring(credentials: MarketplaceCredentialsRow) {
  if (!credentials.token_expires_at) return false;
  const expiresAt = new Date(credentials.token_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now() + 5 * 60 * 1000;
}

async function getMercadoLivreAccessToken(
  supabase: SupabaseClient,
  accountId: string,
  credentials: MarketplaceCredentialsRow
) {
  if (!credentials.refresh_token || !isTokenExpiring(credentials)) {
    return credentials.access_token;
  }

  const clientId = envValue(["MERCADOLIVRE_CLIENT_ID", "ML_CLIENT_ID"]);
  const clientSecret = envValue(["MERCADOLIVRE_CLIENT_SECRET", "ML_CLIENT_SECRET"]);

  if (!clientId || !clientSecret) return credentials.access_token;

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token
    }),
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok) return credentials.access_token;

  const payload = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };
  const tokenExpiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
    : credentials.token_expires_at;

  await supabase.from("marketplace_account_credentials").upsert({
    account_id: accountId,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? credentials.refresh_token,
    token_expires_at: tokenExpiresAt,
    scopes: payload.scope ? payload.scope.split(" ") : credentials.scopes ?? []
  });

  return payload.access_token;
}

async function fetchMercadoLivreOrder(orderId: string, accessToken: string) {
  const response = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    return {
      error: `Mercado Livre respondeu ${response.status}`,
      order: null
    };
  }

  return {
    error: null,
    order: (await response.json()) as MercadoLivreOrder
  };
}

async function auditOrders(args: { orderIds: string[]; organizationId?: string }) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const orderIds = args.orderIds
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (orderIds.length === 0) throw new Error("Informe ao menos uma venda.");

  const { account, credentials } = await getConnectedMercadoLivreAccount(
    supabase,
    organizationId
  );
  const accessToken = await getMercadoLivreAccessToken(
    supabase,
    account.id,
    credentials
  );
  const { data: localOrders, error: localOrdersError } = await supabase
    .from("orders")
    .select("id, provider_order_id, sold_at, status, gross_amount, net_amount")
    .eq("organization_id", organizationId)
    .in("provider_order_id", orderIds);

  if (localOrdersError) throw localOrdersError;

  const localByProviderId = new Map(
    ((localOrders ?? []) as Array<OrderRow & { net_amount?: number | string }>).map(
      (order) => [order.provider_order_id, order]
    )
  );
  const rows = [];

  for (const orderId of orderIds) {
    const localOrder = localByProviderId.get(orderId) ?? null;
    const remote = await fetchMercadoLivreOrder(orderId, accessToken);
    const remoteOrder = remote.order;
    const localRevenue = localOrder ? isRevenueOrder(localOrder.status) : false;
    const remoteRevenue = remoteOrder?.status
      ? isRevenueOrder(remoteOrder.status)
      : false;

    rows.push({
      orderId,
      local: localOrder
        ? {
            status: localOrder.status,
            soldAt: localOrder.sold_at,
            grossAmount: numberFromDb(localOrder.gross_amount),
            netAmount: numberFromDb(localOrder.net_amount)
          }
        : null,
      mercadoLivre: remoteOrder
        ? {
            status: remoteOrder.status ?? "unknown",
            totalAmount: remoteOrder.total_amount ?? 0,
            paidAmount: remoteOrder.paid_amount ?? 0,
            fulfilled: remoteOrder.fulfilled ?? null,
            itemCount: remoteOrder.order_items?.length ?? 0
          }
        : null,
      apiError: remote.error,
      revenueRisk: Boolean(localRevenue && !remoteRevenue),
      recommendation:
        localRevenue && !remoteRevenue
          ? "Venda local ainda parece faturada, mas o Mercado Livre indica status sem receita. Conferir conciliacao."
          : "Sem risco automatico de faturamento nesta leitura."
    });
  }

  return {
    organizationId,
    account: {
      name: account.account_name,
      sellerId: account.external_seller_id,
      lastSyncAt: account.last_sync_at
    },
    checkedAt: new Date().toISOString(),
    rows
  };
}

loadProjectEnv();

const server = new McpServer(
  {
    name: "dashmarket",
    version: "0.1.0"
  }
);

server.registerTool(
  "dashmarket_get_sales_summary",
  {
    title: "Resumo de vendas DASHMARKET",
    description: "Consulta faturamento, custos, ADS e margem de contribuicao.",
    inputSchema: periodShape,
    annotations: {
      readOnlyHint: true
    }
  },
  async (args) => result(await getSalesSummary(args))
);

server.registerTool(
  "dashmarket_get_full_inventory",
  {
    title: "Estoque Full DASHMARKET",
    description: "Consulta somente estoque Full, sem deposito proprio.",
    inputSchema: organizationShape,
    annotations: {
      readOnlyHint: true
    }
  },
  async (args) => result(await getFullInventory(args))
);

server.registerTool(
  "dashmarket_get_ads_summary",
  {
    title: "Resumo de ADS DASHMARKET",
    description: "Consulta investimento, receita atribuida, ACOS e dados de ADS.",
    inputSchema: periodShape,
    annotations: {
      readOnlyHint: true
    }
  },
  async (args) => result(await getAdsSummary(args))
);

server.registerTool(
  "dashmarket_get_sku_margin",
  {
    title: "Margem por SKU DASHMARKET",
    description: "Consulta margem de contribuicao por SKU.",
    inputSchema: {
      ...periodShape,
      sku: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional()
    },
    annotations: {
      readOnlyHint: true
    }
  },
  async (args) => result(await getSkuMargin(args))
);

server.registerTool(
  "dashmarket_audit_orders",
  {
    title: "Auditoria de vendas Mercado Livre",
    description:
      "Compara vendas locais com a API do Mercado Livre sem alterar a conta.",
    inputSchema: {
      organizationId: z.string().optional(),
      orderIds: z.array(z.string()).min(1).max(20)
    },
    annotations: {
      readOnlyHint: true
    }
  },
  async (args) => result(await auditOrders(args))
);

const transport = new StdioServerTransport();
await server.connect(transport);

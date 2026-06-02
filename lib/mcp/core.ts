/**
 * Lógica compartilhada do MCP DASHMARKET
 * Usada tanto pela rota HTTP (app/mcp/[secret]/route.ts)
 * quanto pelo processo stdio local (mcp/src/index.ts)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ─── Types ───────────────────────────────────────────────────────────────────

type ProductRelationRow = { internal_sku: string; title?: string | null; status: string | null };
type OrderRow = {
  id: string; provider_order_id: string; sold_at: string; status: string;
  gross_amount: number | string; marketplace_fee_amount: number | string;
  shipping_cost_amount: number | string; discounts_amount: number | string;
  taxes_amount: number | string;
};
type OrderItemRow = {
  order_id: string; seller_sku: string | null; title: string;
  quantity: number | string; gross_amount: number | string;
  marketplace_fee_amount: number | string; shipping_cost_amount: number | string;
  discount_amount: number | string;
  orders?: { provider_order_id: string; sold_at: string; status: string; gross_amount: number | string; taxes_amount: number | string } | Array<{ provider_order_id: string; sold_at: string; status: string; gross_amount: number | string; taxes_amount: number | string }> | null;
};
type CostRow = {
  cost_category: "product" | "packaging" | "inbound_freight" | "tax" | "marketplace_fixed" | "other";
  allocation_method: "per_unit" | "percentage" | "per_order";
  amount: number | string; valid_from: string; valid_to: string | null;
  products: ProductRelationRow | ProductRelationRow[] | null;
};
type AdvertisingMetricRow = {
  impressions: number | string; clicks: number | string; ad_spend_amount: number | string;
  attributed_revenue_amount: number | string; attributed_orders: number | string;
  metric_date: string; products?: ProductRelationRow | ProductRelationRow[] | null;
};
type InventorySnapshotRow = {
  seller_sku: string | null; fulfillment_channel: string;
  available_quantity: number | string; reserved_quantity: number | string;
  not_available_quantity: number | string; captured_at: string;
  products?: ProductRelationRow | ProductRelationRow[] | null;
};
type MarketplaceAccountRow = { id: string; account_name: string; external_seller_id: string; last_sync_at: string | null };
type MarketplaceCredentialsRow = { access_token: string; refresh_token: string | null; token_expires_at: string | null; scopes: string[] | null };
type PeriodArgs = { dateFrom?: string; dateTo?: string; organizationId?: string; period?: "today" | "yesterday" | "last_7_days" | "last_30_days" | "this_month" };
type PeriodRange = { dateFrom: string; dateTo: string; endExclusive: string; label: string; startIso: string; endIsoExclusive: string };
type SkuMarginRow = { sku: string; title: string; units: number; orders: number; grossRevenue: number; discounts: number; marketplaceFees: number; shippingCosts: number; taxes: number; skuCosts: number; advertisingCosts: number; contributionMargin: number; contributionMarginRate: number; tacos: number };

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const periodShape = {
  organizationId: z.string().optional(),
  period: z.enum(["today", "yesterday", "last_7_days", "last_30_days", "this_month"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
};
export const organizationShape = { organizationId: z.string().optional() };

// ─── Utils ────────────────────────────────────────────────────────────────────

function numberFromDb(value: number | string | null | undefined) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date());
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo", year: "numeric" }).format(date);
}

function monthStart(dateValue: string) { return `${dateValue.slice(0, 7)}-01`; }

export function appUrl(path = "") {
  const configured = process.env.DASHMARKET_PUBLIC_URL?.trim() ?? process.env.NEXT_PUBLIC_APP_URL?.trim() ?? process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ?? "https://dashmarketml.vercel.app";
  const base = configured.startsWith("http") ? configured : `https://${configured}`;
  return `${base.replace(/\/$/, "")}${path}`;
}

function resultUrl(id: string) { return `${appUrl("/")}#mcp-${encodeURIComponent(id)}`; }

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}
export function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}
export function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, style: "percent" }).format(value);
}

function periodTitle(period: PeriodArgs["period"]) {
  if (period === "today") return "hoje";
  if (period === "yesterday") return "ontem";
  if (period === "last_7_days") return "ultimos 7 dias";
  if (period === "last_30_days") return "ultimos 30 dias";
  return "este mes";
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function isRevenueOrder(status: string) {
  const n = normalizeText(status);
  return !n.includes("cancel") && !n.includes("invalid");
}

function isFullChannel(channel: string) {
  const n = channel.trim().toLowerCase();
  return n === "full" || n === "fulfillment";
}

function costAppliesToDate(cost: CostRow, dateValue: string) {
  return cost.valid_from <= dateValue && (!cost.valid_to || cost.valid_to > dateValue);
}

function calculateCostAmount(cost: CostRow, item: OrderItemRow) {
  const amount = numberFromDb(cost.amount);
  if (cost.allocation_method === "percentage") return numberFromDb(item.gross_amount) * (amount / 100);
  if (cost.allocation_method === "per_order") return amount;
  return numberFromDb(item.quantity) * amount;
}

function getRelatedProduct(row: CostRow | AdvertisingMetricRow | InventorySnapshotRow) {
  if (Array.isArray(row.products)) return row.products[0] ?? null;
  return row.products ?? null;
}

function getRelatedOrder(row: OrderItemRow) {
  if (Array.isArray(row.orders)) return row.orders[0] ?? null;
  return row.orders ?? null;
}

export function resolvePeriod(args: PeriodArgs): PeriodRange {
  const today = todayDate();
  const period = args.period ?? "this_month";
  let dateFrom = args.dateFrom;
  let dateTo = args.dateTo;
  let label = "custom";

  if (!dateFrom || !dateTo) {
    if (period === "today") { dateFrom = today; dateTo = today; label = "today"; }
    else if (period === "yesterday") { dateFrom = addDays(today, -1); dateTo = dateFrom; label = "yesterday"; }
    else if (period === "last_7_days") { dateFrom = addDays(today, -6); dateTo = today; label = "last_7_days"; }
    else if (period === "last_30_days") { dateFrom = addDays(today, -29); dateTo = today; label = "last_30_days"; }
    else { dateFrom = monthStart(today); dateTo = today; label = "this_month"; }
  }

  const endExclusive = addDays(dateTo!, 1);
  return {
    dateFrom: dateFrom!,
    dateTo: dateTo!,
    endExclusive,
    label,
    startIso: new Date(`${dateFrom}T00:00:00-03:00`).toISOString(),
    endIsoExclusive: new Date(`${endExclusive}T00:00:00-03:00`).toISOString()
  };
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

export function getSupabase() {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function resolveOrganizationId(supabase: SupabaseClient, organizationId?: string) {
  if (organizationId) return organizationId;
  const envId = process.env.DASHMARKET_ORGANIZATION_ID?.trim();
  if (envId) return envId;
  const { data, error } = await supabase.from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Nenhuma empresa DASHMARKET encontrada.");
  return data.id as string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function fetchOrders(supabase: SupabaseClient, organizationId: string, period: PeriodRange) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, provider_order_id, sold_at, status, gross_amount, marketplace_fee_amount, shipping_cost_amount, discounts_amount, taxes_amount")
    .eq("organization_id", organizationId)
    .gte("sold_at", period.startIso)
    .lt("sold_at", period.endIsoExclusive)
    .order("sold_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  return ((data ?? []) as OrderRow[]).filter(o => isRevenueOrder(o.status));
}

async function fetchOrderItems(supabase: SupabaseClient, organizationId: string, orderIds: string[]) {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from("order_items")
    .select("order_id, seller_sku, title, quantity, gross_amount, marketplace_fee_amount, shipping_cost_amount, discount_amount, orders(provider_order_id, sold_at, status, gross_amount, taxes_amount)")
    .eq("organization_id", organizationId)
    .in("order_id", orderIds)
    .limit(20000);
  if (error) throw error;
  return (data ?? []) as OrderItemRow[];
}

async function fetchCostsBySku(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("sku_costs")
    .select("cost_category, allocation_method, amount, valid_from, valid_to, products(internal_sku, title, status)")
    .eq("organization_id", organizationId)
    .limit(20000);
  if (error) throw error;
  const map = new Map<string, CostRow[]>();
  for (const cost of (data ?? []) as CostRow[]) {
    const product = getRelatedProduct(cost);
    if (!product || product.status === "archived") continue;
    const current = map.get(product.internal_sku) ?? [];
    current.push(cost);
    map.set(product.internal_sku, current);
  }
  return map;
}

async function fetchAdvertisingBySku(supabase: SupabaseClient, organizationId: string, period: PeriodRange) {
  const { data, error } = await supabase
    .from("advertising_metrics")
    .select("impressions, clicks, ad_spend_amount, attributed_revenue_amount, attributed_orders, metric_date, products(internal_sku, title, status)")
    .eq("organization_id", organizationId)
    .gte("metric_date", period.dateFrom)
    .lt("metric_date", period.endExclusive)
    .limit(20000);
  if (error) throw error;
  const map = new Map<string, { sku: string; title: string; impressions: number; clicks: number; adSpend: number; attributedRevenue: number; attributedOrders: number }>();
  for (const metric of (data ?? []) as AdvertisingMetricRow[]) {
    const product = getRelatedProduct(metric);
    const sku = product?.internal_sku ?? "Geral";
    const current = map.get(sku) ?? { sku, title: product?.title ?? "Campanhas gerais", impressions: 0, clicks: 0, adSpend: 0, attributedRevenue: 0, attributedOrders: 0 };
    current.impressions += numberFromDb(metric.impressions);
    current.clicks += numberFromDb(metric.clicks);
    current.adSpend += numberFromDb(metric.ad_spend_amount);
    current.attributedRevenue += numberFromDb(metric.attributed_revenue_amount);
    current.attributedOrders += numberFromDb(metric.attributed_orders);
    map.set(sku, current);
  }
  return map;
}

function buildSkuMargins(items: OrderItemRow[], costsBySku: Map<string, CostRow[]>, adsBySku: Map<string, { adSpend: number }>) {
  const map = new Map<string, SkuMarginRow>();
  for (const item of items) {
    const order = getRelatedOrder(item);
    const sku = item.seller_sku ?? "SKU sem codigo";
    const current = map.get(sku) ?? { sku, title: item.title, units: 0, orders: 0, grossRevenue: 0, discounts: 0, marketplaceFees: 0, shippingCosts: 0, taxes: 0, skuCosts: 0, advertisingCosts: 0, contributionMargin: 0, contributionMarginRate: 0, tacos: 0 };
    const grossAmount = numberFromDb(item.gross_amount);
    const orderGrossAmount = numberFromDb((order as OrderItemRow["orders"] & { gross_amount?: number | string })?.gross_amount);
    const orderTaxAmount = numberFromDb((order as OrderItemRow["orders"] & { taxes_amount?: number | string })?.taxes_amount);
    const allocatedOrderTax = orderGrossAmount > 0 ? orderTaxAmount * (grossAmount / orderGrossAmount) : 0;
    const itemDate = (order as { sold_at?: string } | null)?.sold_at?.slice(0, 10) ?? todayDate();
    const costTotals = (costsBySku.get(sku) ?? []).reduce<{ costAmount: number; taxAmount: number }>(
      (acc, cost) => {
        if (!costAppliesToDate(cost, itemDate)) return acc;
        const amount = calculateCostAmount(cost, item);
        if (cost.cost_category === "tax") return { ...acc, taxAmount: acc.taxAmount + amount };
        return { ...acc, costAmount: acc.costAmount + amount };
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
    map.set(sku, current);
  }
  for (const margin of map.values()) {
    margin.advertisingCosts = adsBySku.get(margin.sku)?.adSpend ?? 0;
    margin.contributionMargin = margin.grossRevenue - margin.discounts - margin.marketplaceFees - margin.shippingCosts - margin.taxes - margin.skuCosts - margin.advertisingCosts;
    margin.contributionMarginRate = margin.grossRevenue > 0 ? margin.contributionMargin / margin.grossRevenue : 0;
    margin.tacos = margin.grossRevenue > 0 ? margin.advertisingCosts / margin.grossRevenue : 0;
  }
  return Array.from(map.values()).sort((a, b) => b.grossRevenue - a.grossRevenue);
}

// ─── Business logic ────────────────────────────────────────────────────────────

export async function getSalesSummary(args: PeriodArgs) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const period = resolvePeriod(args);
  const orders = await fetchOrders(supabase, organizationId, period);
  const items = await fetchOrderItems(supabase, organizationId, orders.map(o => o.id));
  const costsBySku = await fetchCostsBySku(supabase, organizationId);
  const adsBySku = await fetchAdvertisingBySku(supabase, organizationId, period);
  const skuMargins = buildSkuMargins(items, costsBySku, adsBySku);
  const totals = skuMargins.reduce((acc, row) => ({
    units: acc.units + row.units, orders: acc.orders + row.orders,
    grossRevenue: acc.grossRevenue + row.grossRevenue, discounts: acc.discounts + row.discounts,
    marketplaceFees: acc.marketplaceFees + row.marketplaceFees, shippingCosts: acc.shippingCosts + row.shippingCosts,
    taxes: acc.taxes + row.taxes, skuCosts: acc.skuCosts + row.skuCosts,
    advertisingCosts: acc.advertisingCosts + row.advertisingCosts,
    contributionMargin: acc.contributionMargin + row.contributionMargin
  }), { units: 0, orders: orders.length, grossRevenue: 0, discounts: 0, marketplaceFees: 0, shippingCosts: 0, taxes: 0, skuCosts: 0, advertisingCosts: 0, contributionMargin: 0 });
  return {
    organizationId, period,
    totals: { ...totals, netRevenue: totals.grossRevenue - totals.discounts, contributionMarginRate: totals.grossRevenue > 0 ? totals.contributionMargin / totals.grossRevenue : 0, tacos: totals.grossRevenue > 0 ? totals.advertisingCosts / totals.grossRevenue : 0 },
    topSkus: skuMargins.slice(0, 10)
  };
}

export async function getFullInventory(args: { organizationId?: string }) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const { data, error } = await supabase
    .from("inventory_snapshots")
    .select("seller_sku, fulfillment_channel, available_quantity, reserved_quantity, not_available_quantity, captured_at, products(internal_sku, title, status)")
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
    if (getRelatedProduct(snapshot)?.status === "archived") continue;
    latestBySku.set(sku, snapshot);
  }
  const skus = Array.from(latestBySku.keys());
  const { data: salesData, error: salesError } = skus.length > 0
    ? await supabase.from("order_items").select("seller_sku, title, quantity, gross_amount, marketplace_fee_amount, orders(provider_order_id, sold_at, status, gross_amount, taxes_amount)").eq("organization_id", organizationId).in("seller_sku", skus).gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()).limit(20000)
    : { data: [], error: null };
  if (salesError) throw salesError;
  const pricingBySku = new Map<string, { grossRevenue: number; marketplaceFees: number; units: number }>();
  for (const sale of (salesData ?? []) as OrderItemRow[]) {
    const order = getRelatedOrder(sale);
    if (order && !isRevenueOrder((order as { status: string }).status)) continue;
    const sku = sale.seller_sku;
    if (!sku) continue;
    const current = pricingBySku.get(sku) ?? { grossRevenue: 0, marketplaceFees: 0, units: 0 };
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
    const unitSalePrice = pricing && pricing.units > 0 ? pricing.grossRevenue / pricing.units : 0;
    const unitMarketplaceFee = pricing && pricing.units > 0 ? pricing.marketplaceFees / pricing.units : 0;
    const unitNetValue = unitSalePrice - unitMarketplaceFee;
    return { sku, title: product?.title ?? "Produto sem titulo", available, reserved, notAvailable, totalQuantity, unitSalePrice, unitMarketplaceFee, unitNetValue, investedValue: totalQuantity * unitNetValue, hasPricing: Boolean(pricing && pricing.units > 0), capturedAt: snapshot.captured_at };
  });
  return {
    organizationId,
    totals: { skus: rows.length, available: rows.reduce((s, r) => s + r.available, 0), reserved: rows.reduce((s, r) => s + r.reserved, 0), notAvailable: rows.reduce((s, r) => s + r.notAvailable, 0), totalQuantity: rows.reduce((s, r) => s + r.totalQuantity, 0), investedValue: rows.reduce((s, r) => s + r.investedValue, 0) },
    rows: rows.sort((a, b) => b.totalQuantity - a.totalQuantity)
  };
}

export async function getAdsSummary(args: PeriodArgs) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const period = resolvePeriod(args);
  const adsBySku = await fetchAdvertisingBySku(supabase, organizationId, period);
  const rows = Array.from(adsBySku.values()).map(row => ({ ...row, ctr: row.impressions > 0 ? row.clicks / row.impressions : 0, acos: row.attributedRevenue > 0 ? row.adSpend / row.attributedRevenue : 0 }));
  const totals = rows.reduce((acc, row) => ({ impressions: acc.impressions + row.impressions, clicks: acc.clicks + row.clicks, adSpend: acc.adSpend + row.adSpend, attributedRevenue: acc.attributedRevenue + row.attributedRevenue, attributedOrders: acc.attributedOrders + row.attributedOrders }), { impressions: 0, clicks: 0, adSpend: 0, attributedRevenue: 0, attributedOrders: 0 });
  return { organizationId, period, totals: { ...totals, ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0, acos: totals.attributedRevenue > 0 ? totals.adSpend / totals.attributedRevenue : 0 }, rows: rows.sort((a, b) => b.adSpend - a.adSpend).slice(0, 30) };
}

export async function getSkuMargin(args: PeriodArgs & { limit?: number; sku?: string }) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const period = resolvePeriod(args);
  const orders = await fetchOrders(supabase, organizationId, period);
  const items = await fetchOrderItems(supabase, organizationId, orders.map(o => o.id));
  const costsBySku = await fetchCostsBySku(supabase, organizationId);
  const adsBySku = await fetchAdvertisingBySku(supabase, organizationId, period);
  const query = args.sku?.trim().toLowerCase();
  const rows = buildSkuMargins(items, costsBySku, adsBySku).filter(row => !query || row.sku.toLowerCase().includes(query)).slice(0, args.limit ?? 30);
  return { organizationId, period, rows };
}

export async function auditOrders(args: { orderIds: string[]; organizationId?: string }) {
  const supabase = getSupabase();
  const organizationId = await resolveOrganizationId(supabase, args.organizationId);
  const orderIds = args.orderIds.map(id => id.trim()).filter(Boolean).slice(0, 20);
  if (orderIds.length === 0) throw new Error("Informe ao menos uma venda.");

  const { data: account, error: accountError } = await supabase
    .from("marketplace_accounts").select("id, account_name, external_seller_id, last_sync_at")
    .eq("organization_id", organizationId).eq("provider", "mercadolivre").eq("status", "connected")
    .order("last_sync_at", { ascending: false }).limit(1).maybeSingle();
  if (accountError) throw accountError;
  if (!account) throw new Error("Nenhuma conta Mercado Livre conectada.");

  const { data: credentials, error: credError } = await supabase
    .from("marketplace_account_credentials").select("access_token, refresh_token, token_expires_at, scopes")
    .eq("account_id", (account as MarketplaceAccountRow).id).maybeSingle();
  if (credError) throw credError;
  if (!credentials) throw new Error("Credenciais do Mercado Livre nao encontradas.");

  const creds = credentials as MarketplaceCredentialsRow;
  let accessToken = creds.access_token;

  // Refresh token se necessário
  if (creds.refresh_token && creds.token_expires_at) {
    const expiresAt = new Date(creds.token_expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now() + 5 * 60 * 1000) {
      const clientId = process.env.MERCADOLIVRE_CLIENT_ID?.trim() ?? process.env.ML_CLIENT_ID?.trim();
      const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET?.trim() ?? process.env.ML_CLIENT_SECRET?.trim();
      if (clientId && clientSecret) {
        const refreshRes = await fetch("https://api.mercadolibre.com/oauth/token", {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: creds.refresh_token })
        });
        if (refreshRes.ok) {
          const refreshPayload = (await refreshRes.json()) as { access_token: string; expires_in?: number; refresh_token?: string; scope?: string };
          accessToken = refreshPayload.access_token;
          await supabase.from("marketplace_account_credentials").upsert({
            account_id: (account as MarketplaceAccountRow).id,
            access_token: refreshPayload.access_token,
            refresh_token: refreshPayload.refresh_token ?? creds.refresh_token,
            token_expires_at: refreshPayload.expires_in ? new Date(Date.now() + refreshPayload.expires_in * 1000).toISOString() : creds.token_expires_at,
            scopes: refreshPayload.scope ? refreshPayload.scope.split(" ") : creds.scopes ?? []
          });
        }
      }
    }
  }

  const { data: localOrders, error: localOrdersError } = await supabase
    .from("orders").select("id, provider_order_id, sold_at, status, gross_amount, net_amount")
    .eq("organization_id", organizationId).in("provider_order_id", orderIds);
  if (localOrdersError) throw localOrdersError;

  const localByProviderId = new Map(((localOrders ?? []) as Array<OrderRow & { net_amount?: number | string }>).map(o => [o.provider_order_id, o]));
  const rows = [];
  for (const orderId of orderIds) {
    const localOrder = localByProviderId.get(orderId) ?? null;
    const remoteRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers: { authorization: `Bearer ${accessToken}` } });
    const remoteOrder = remoteRes.ok ? (await remoteRes.json()) as { id: number | string; status?: string; total_amount?: number; paid_amount?: number; fulfilled?: boolean; order_items?: unknown[] } : null;
    const remoteError = remoteRes.ok ? null : `ML respondeu ${remoteRes.status}`;
    const localRevenue = localOrder ? isRevenueOrder(localOrder.status) : false;
    const remoteRevenue = remoteOrder?.status ? isRevenueOrder(remoteOrder.status) : false;
    rows.push({ orderId, local: localOrder ? { status: localOrder.status, soldAt: localOrder.sold_at, grossAmount: numberFromDb(localOrder.gross_amount) } : null, mercadoLivre: remoteOrder ? { status: remoteOrder.status ?? "unknown", totalAmount: remoteOrder.total_amount ?? 0, paidAmount: remoteOrder.paid_amount ?? 0, itemCount: (remoteOrder.order_items?.length ?? 0) } : null, apiError: remoteError, revenueRisk: Boolean(localRevenue && !remoteRevenue), recommendation: localRevenue && !remoteRevenue ? "Venda local ainda parece faturada mas o ML indica status sem receita. Conferir conciliacao." : "Sem risco de faturamento nesta leitura." });
  }
  return { organizationId, account: { name: (account as MarketplaceAccountRow).account_name, sellerId: (account as MarketplaceAccountRow).external_seller_id, lastSyncAt: (account as MarketplaceAccountRow).last_sync_at }, checkedAt: new Date().toISOString(), rows };
}

// ─── Text formatters ──────────────────────────────────────────────────────────

export function salesSummaryText(data: Awaited<ReturnType<typeof getSalesSummary>>) {
  const t = data.totals;
  return [
    `Periodo: ${data.period.dateFrom} a ${data.period.dateTo}.`,
    `Faturamento bruto: ${formatCurrency(t.grossRevenue)}.`,
    `Receita liquida: ${formatCurrency(t.netRevenue)}.`,
    `Pedidos: ${formatNumber(t.orders)}.`, `Unidades: ${formatNumber(t.units)}.`,
    `Taxas ML: ${formatCurrency(t.marketplaceFees)}.`, `Frete: ${formatCurrency(t.shippingCosts)}.`,
    `Impostos: ${formatCurrency(t.taxes)}.`, `Custos SKU: ${formatCurrency(t.skuCosts)}.`,
    `ADS: ${formatCurrency(t.advertisingCosts)}.`,
    `Margem: ${formatCurrency(t.contributionMargin)} (${formatPercent(t.contributionMarginRate)}).`,
    `TACOS: ${formatPercent(t.tacos)}.`, "",
    "Top SKUs:", ...data.topSkus.map((r, i) => `${i + 1}. ${r.sku} - ${r.title}: ${formatCurrency(r.grossRevenue)}, margem ${formatCurrency(r.contributionMargin)} (${formatPercent(r.contributionMarginRate)}), TACOS ${formatPercent(r.tacos)}.`)
  ].join("\n");
}

export function inventoryText(data: Awaited<ReturnType<typeof getFullInventory>>) {
  return [
    "Estoque Full DASHMARKET.", `SKUs: ${formatNumber(data.totals.skus)}.`,
    `Disponivel: ${formatNumber(data.totals.available)}.`, `Reservado: ${formatNumber(data.totals.reserved)}.`,
    `Total: ${formatNumber(data.totals.totalQuantity)}.`, `Valor investido: ${formatCurrency(data.totals.investedValue)}.`, "",
    "Maiores posicoes:", ...data.rows.slice(0, 20).map((r, i) => `${i + 1}. ${r.sku} - ${r.title}: ${formatNumber(r.totalQuantity)} un., valor ${formatCurrency(r.investedValue)}.`)
  ].join("\n");
}

export function adsText(data: Awaited<ReturnType<typeof getAdsSummary>>) {
  return [
    `ADS ${data.period.dateFrom} a ${data.period.dateTo}.`,
    `Investimento: ${formatCurrency(data.totals.adSpend)}.`, `Receita atribuida: ${formatCurrency(data.totals.attributedRevenue)}.`,
    `Pedidos atribuidos: ${formatNumber(data.totals.attributedOrders)}.`, `CTR: ${formatPercent(data.totals.ctr)}.`, `ACOS: ${formatPercent(data.totals.acos)}.`, "",
    "Top campanhas:", ...data.rows.slice(0, 20).map((r, i) => `${i + 1}. ${r.sku}: investimento ${formatCurrency(r.adSpend)}, receita ${formatCurrency(r.attributedRevenue)}, ACOS ${formatPercent(r.acos)}.`)
  ].join("\n");
}

export function skuMarginText(data: Awaited<ReturnType<typeof getSkuMargin>>) {
  return [
    `Margem por SKU ${data.period.dateFrom} a ${data.period.dateTo}.`,
    ...data.rows.map((r, i) => `${i + 1}. ${r.sku} - ${r.title}: ${formatCurrency(r.grossRevenue)}, ${formatNumber(r.units)} un., margem ${formatCurrency(r.contributionMargin)} (${formatPercent(r.contributionMarginRate)}), TACOS ${formatPercent(r.tacos)}.`)
  ].join("\n");
}

// ─── Search / Fetch ────────────────────────────────────────────────────────────

function searchResult(id: string, title: string) {
  return { id, title, url: resultUrl(id) };
}

function resolveSearchPeriod(query: string): PeriodArgs["period"] {
  const n = normalizeText(query);
  if (n.includes("ontem")) return "yesterday";
  if (n.includes("hoje")) return "today";
  if (n.includes("7 dias") || n.includes("semana")) return "last_7_days";
  if (n.includes("30 dias") || n.includes("mes passado")) return "last_30_days";
  return "this_month";
}

export async function searchDashmarket(args: { query: string }) {
  const normalized = normalizeText(args.query);
  const period = resolveSearchPeriod(args.query);
  const results: { id: string; title: string; url: string }[] = [];
  if (normalized.includes("estoque") || normalized.includes("full") || normalized.includes("inventario")) results.push(searchResult("inventory:full", "Estoque Full atual do DASHMARKET"));
  if (normalized.includes("ads") || normalized.includes("publicidade") || normalized.includes("tacos") || normalized.includes("acos")) results.push(searchResult(`ads:${period}`, `Publicidade e ADS do DASHMARKET - ${periodTitle(period)}`));
  if (normalized.includes("sku") || normalized.includes("produto") || normalized.includes("margem")) results.push(searchResult(`sku_margin:${period}`, `Margem por SKU do DASHMARKET - ${periodTitle(period)}`));
  if (results.length === 0 || normalized.includes("venda") || normalized.includes("lucro") || normalized.includes("faturamento")) results.unshift(searchResult(`sales:${period}`, `Resumo de vendas e margem do DASHMARKET - ${periodTitle(period)}`));
  return { results: results.slice(0, 5) };
}

export async function fetchDashmarket(args: { id: string }) {
  const [kind, rawPeriod] = args.id.split(":");
  const period = (["today", "yesterday", "last_7_days", "last_30_days", "this_month"].includes(rawPeriod) ? rawPeriod : "this_month") as PeriodArgs["period"];
  const url = resultUrl(args.id);

  if (kind === "inventory") {
    const data = await getFullInventory({});
    return { id: args.id, metadata: { kind }, text: inventoryText(data), title: "Estoque Full atual do DASHMARKET", url };
  }
  if (kind === "ads") {
    const data = await getAdsSummary({ period });
    return { id: args.id, metadata: { kind, period }, text: adsText(data), title: `Publicidade e ADS do DASHMARKET - ${periodTitle(period)}`, url };
  }
  if (kind === "sku_margin") {
    const data = await getSkuMargin({ limit: 30, period });
    return { id: args.id, metadata: { kind, period }, text: skuMarginText(data), title: `Margem por SKU do DASHMARKET - ${periodTitle(period)}`, url };
  }
  const data = await getSalesSummary({ period });
  return { id: args.id, metadata: { kind: "sales", period }, text: salesSummaryText(data), title: `Resumo de vendas e margem do DASHMARKET - ${periodTitle(period)}`, url };
}

// ─── MCP Server factory ────────────────────────────────────────────────────────

function mcpResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
}

export function createDashmarketMcpServer() {
  const server = new McpServer({ name: "dashmarket", version: "0.2.0" });

  server.registerTool("search", {
    title: "Pesquisar DASHMARKET",
    description: "Pesquisa respostas do DASHMARKET sobre vendas, lucro, margem, ADS, TACOS, estoque Full e SKUs.",
    inputSchema: { query: z.string() },
    annotations: { readOnlyHint: true }
  }, async (args) => mcpResult(await searchDashmarket(args)));

  server.registerTool("fetch", {
    title: "Consultar resultado DASHMARKET",
    description: "Busca o conteudo completo de um resultado encontrado no DASHMARKET.",
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true }
  }, async (args) => mcpResult(await fetchDashmarket(args)));

  server.registerTool("dashmarket_get_sales_summary", {
    title: "Resumo de vendas DASHMARKET",
    description: "Consulta faturamento, custos, ADS e margem de contribuicao.",
    inputSchema: periodShape,
    annotations: { readOnlyHint: true }
  }, async (args) => mcpResult(await getSalesSummary(args)));

  server.registerTool("dashmarket_get_full_inventory", {
    title: "Estoque Full DASHMARKET",
    description: "Consulta somente estoque Full, sem deposito proprio.",
    inputSchema: organizationShape,
    annotations: { readOnlyHint: true }
  }, async (args) => mcpResult(await getFullInventory(args)));

  server.registerTool("dashmarket_get_ads_summary", {
    title: "Resumo de ADS DASHMARKET",
    description: "Consulta investimento, receita atribuida, ACOS e dados de ADS.",
    inputSchema: periodShape,
    annotations: { readOnlyHint: true }
  }, async (args) => mcpResult(await getAdsSummary(args)));

  server.registerTool("dashmarket_get_sku_margin", {
    title: "Margem por SKU DASHMARKET",
    description: "Consulta margem de contribuicao por SKU.",
    inputSchema: { ...periodShape, sku: z.string().optional(), limit: z.number().int().min(1).max(100).optional() },
    annotations: { readOnlyHint: true }
  }, async (args) => mcpResult(await getSkuMargin(args)));

  server.registerTool("dashmarket_audit_orders", {
    title: "Auditoria de vendas Mercado Livre",
    description: "Compara vendas locais com a API do Mercado Livre sem alterar a conta.",
    inputSchema: { organizationId: z.string().optional(), orderIds: z.array(z.string()).min(1).max(20) },
    annotations: { readOnlyHint: true }
  }, async (args) => mcpResult(await auditOrders(args)));

  return server;
}

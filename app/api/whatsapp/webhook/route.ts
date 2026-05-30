import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WhatsAppTextMessage = {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: {
    body?: string;
  };
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppTextMessage[];
      };
    }>;
  }>;
};

type EvolutionMessageKey = {
  participant?: string;
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
};

type EvolutionMessageContent = {
  conversation?: string;
  extendedTextMessage?: {
    text?: string;
  };
  message?: EvolutionMessageContent;
  imageMessage?: {
    caption?: string;
  };
  videoMessage?: {
    caption?: string;
  };
  documentMessage?: {
    caption?: string;
  };
};

type EvolutionWebhookData = {
  key?: EvolutionMessageKey;
  message?: EvolutionMessageContent;
  messageType?: string;
  phone?: string;
  pushName?: string;
  from?: string;
  fromMe?: boolean | string | number;
  owner?: string;
  sender?: string;
  source?: string;
};

type EvolutionWebhookPayload = {
  event?: string;
  instance?: string;
  data?: EvolutionWebhookData | EvolutionWebhookData[];
  server_url?: string;
};

type InboundWhatsAppMessage = {
  from: string;
  id: string;
  provider: "meta" | "evolution";
  question: string;
  rawPayload: unknown;
  evolution?: {
    instance?: string;
    serverUrl?: string;
  };
};

type WhatsAppContactRow = {
  organization_id: string;
  user_id: string | null;
  phone_number: string;
  display_name: string | null;
  is_active: boolean;
};

type AuthorizedContact = {
  organizationId: string;
  phoneNumber: string;
  displayName?: string | null;
};

type PeriodRange = {
  label: string;
  startDate: string;
  endDateExclusive: string;
  startIso: string;
  endIsoExclusive: string;
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

type OrderItemRow = {
  order_id: string;
  seller_sku: string | null;
  title: string;
  quantity: number | string;
  gross_amount: number | string;
  marketplace_fee_amount: number | string;
  shipping_cost_amount: number | string;
  discount_amount: number | string;
};

type ProductRelationRow = {
  internal_sku: string;
  status: string;
  title?: string | null;
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
  ad_spend_amount: number | string;
  attributed_revenue_amount: number | string;
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

type InventorySummary = {
  rows: Array<{
    available: number;
    investedValue: number;
    reserved: number;
    sku: string;
    title: string;
    totalQuantity: number;
    unitNetValue: number;
  }>;
  totals: {
    available: number;
    investedValue: number;
    reserved: number;
    skus: number;
    totalQuantity: number;
  };
};

type BusinessMetrics = {
  period: PeriodRange;
  orders: number;
  units: number;
  grossRevenue: number;
  netRevenue: number;
  discounts: number;
  marketplaceFees: number;
  shippingCosts: number;
  taxes: number;
  skuCosts: number;
  advertisingCosts: number;
  contributionMargin: number;
  contributionMarginRate: number;
  ticketAverage: number;
  attributedRevenue: number;
};

const DEFAULT_GRAPH_VERSION = "v25.0";
const DEFAULT_TIMEZONE_OFFSET = "-03:00";
const DASHMARKET_REPLY_PREFIXES = [
  "dashmarket no whatsapp",
  "nao consegui consultar o dashmarket",
  "este numero ainda nao esta autorizado",
  "resumo de ",
  "faturamento:",
  "estoque full"
];

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const evolutionApiKey = process.env.EVOLUTION_API_KEY;
  const evolutionApiUrl = process.env.EVOLUTION_API_URL;
  const evolutionInstanceName = process.env.EVOLUTION_INSTANCE_NAME;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase nao configurado no ambiente.");
  }

  return {
    accessToken,
    allowedPhones: (process.env.DASHMARKET_WHATSAPP_ALLOWED_PHONES ?? "")
      .split(",")
      .map(normalizePhone)
      .filter(Boolean),
    appSecret: process.env.WHATSAPP_APP_SECRET,
    evolutionApiKey,
    evolutionApiUrl,
    evolutionInstanceName,
    evolutionWebhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET,
    fallbackOrganizationId: process.env.DASHMARKET_WHATSAPP_ORGANIZATION_ID,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION,
    phoneNumberId,
    serviceRoleKey,
    supabaseUrl,
    verifyToken
  };
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function numberFromDb(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  })}%`;
}

function localDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00${DEFAULT_TIMEZONE_OFFSET}`);
  date.setUTCDate(date.getUTCDate() + days);
  return localDateString(date);
}

function monthStart(dateValue: string) {
  return `${dateValue.slice(0, 7)}-01`;
}

function previousMonthRange(today: string) {
  const currentStart = monthStart(today);
  const previousDate = shiftDate(currentStart, -1);
  return {
    endDateExclusive: currentStart,
    startDate: monthStart(previousDate)
  };
}

function makePeriod(startDate: string, endDateExclusive: string, label: string) {
  return {
    label,
    startDate,
    endDateExclusive,
    startIso: new Date(
      `${startDate}T00:00:00${DEFAULT_TIMEZONE_OFFSET}`
    ).toISOString(),
    endIsoExclusive: new Date(
      `${endDateExclusive}T00:00:00${DEFAULT_TIMEZONE_OFFSET}`
    ).toISOString()
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function parsePeriod(question: string) {
  const normalized = normalizeText(question);
  const today = localDateString(new Date());

  if (normalized.includes("ontem")) {
    const yesterday = shiftDate(today, -1);
    return makePeriod(yesterday, today, "ontem");
  }

  if (normalized.includes("hoje")) {
    return makePeriod(today, shiftDate(today, 1), "hoje");
  }

  if (normalized.includes("mes passado")) {
    const range = previousMonthRange(today);
    return makePeriod(
      range.startDate,
      range.endDateExclusive,
      "mes passado"
    );
  }

  const daysMatch = normalized.match(/ultim[oa]s?\s+(\d{1,3})\s+dias?/);
  if (daysMatch) {
    const days = Math.min(Math.max(Number(daysMatch[1]), 1), 365);
    return makePeriod(shiftDate(today, -days + 1), shiftDate(today, 1), `ultimos ${days} dias`);
  }

  if (
    normalized.includes("semana") ||
    normalized.includes("7 dias") ||
    normalized.includes("sete dias")
  ) {
    return makePeriod(shiftDate(today, -6), shiftDate(today, 1), "ultimos 7 dias");
  }

  return makePeriod(monthStart(today), shiftDate(today, 1), "este mes");
}

function parseIntent(question: string) {
  const normalized = normalizeText(question);

  if (
    normalized.includes("ajuda") ||
    normalized.includes("comandos") ||
    normalized === "menu"
  ) {
    return "help";
  }

  if (
    normalized.includes("lucro") ||
    normalized.includes("margem") ||
    normalized.includes("resultado")
  ) {
    return "profit";
  }

  if (
    normalized.includes("ads") ||
    normalized.includes("publicidade") ||
    normalized.includes("tacos")
  ) {
    return "ads";
  }

  if (
    normalized.includes("estoque") ||
    normalized.includes("full") ||
    normalized.includes("inventario")
  ) {
    return "inventory";
  }

  if (
    normalized.includes("pedido") ||
    normalized.includes("quantas vendas") ||
    normalized.includes("qtd vendas")
  ) {
    return "orders";
  }

  if (
    normalized.includes("vendi") ||
    normalized.includes("vendas") ||
    normalized.includes("faturei") ||
    normalized.includes("faturamento")
  ) {
    return "sales";
  }

  return "summary";
}

function getRelatedProduct(row: CostRow) {
  if (Array.isArray(row.products)) return row.products[0] ?? null;
  return row.products;
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  const message = candidate.message?.toLowerCase() ?? "";
  return candidate.code === "42P01" || message.includes("does not exist");
}

function isUniqueViolationError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { code?: string }).code === "23505"
  );
}

function isRevenueOrder(status: string) {
  const normalized = normalizeText(status);
  return !normalized.includes("cancel") && !normalized.includes("invalid");
}

function costAppliesToDate(cost: CostRow, dateValue: string) {
  return (
    cost.valid_from <= dateValue &&
    (!cost.valid_to || cost.valid_to > dateValue)
  );
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

async function logMessage(
  supabase: SupabaseClient,
  payload: {
    body: string;
    direction: "inbound" | "outbound";
    messageId?: string;
    organizationId?: string | null;
    phoneNumber: string;
    rawPayload?: unknown;
    responseBody?: string | null;
  }
) {
  try {
    const { error } = await supabase.from("whatsapp_message_logs").insert({
      body: payload.body,
      direction: payload.direction,
      message_id: payload.messageId ?? null,
      organization_id: payload.organizationId ?? null,
      phone_number: payload.phoneNumber,
      raw_payload: payload.rawPayload ?? {},
      response_body: payload.responseBody ?? null
    });

    if (error) throw error;
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return false;
    }

    if (!isMissingRelationError(error)) {
      console.error("Nao foi possivel registrar mensagem WhatsApp.", error);
    }
  }

  return true;
}

async function resolveAuthorizedContact(
  supabase: SupabaseClient,
  phoneNumber: string,
  env: ReturnType<typeof getEnv>
): Promise<AuthorizedContact | null> {
  const allowedByEnv = env.allowedPhones.includes(phoneNumber);

  if (allowedByEnv && env.fallbackOrganizationId) {
    return {
      organizationId: env.fallbackOrganizationId,
      phoneNumber
    };
  }

  try {
    const { data, error } = await supabase
      .from("whatsapp_contacts")
      .select("organization_id, user_id, phone_number, display_name, is_active")
      .eq("phone_number", phoneNumber)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const contact = data as WhatsAppContactRow;
      return {
        displayName: contact.display_name,
        organizationId: contact.organization_id,
        phoneNumber: contact.phone_number
      };
    }
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.error("Nao foi possivel consultar whatsapp_contacts.", error);
    }
  }

  if (!allowedByEnv) {
    return null;
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (organizationError) {
    console.error("Nao foi possivel localizar organizacao padrao.", organizationError);
    return null;
  }

  if (!organization?.id) return null;

  return {
    organizationId: organization.id as string,
    phoneNumber
  };
}

async function getBusinessMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  period: PeriodRange
): Promise<BusinessMetrics> {
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select(
      "id, provider_order_id, sold_at, status, gross_amount, marketplace_fee_amount, shipping_cost_amount, discounts_amount, taxes_amount"
    )
    .eq("organization_id", organizationId)
    .gte("sold_at", period.startIso)
    .lt("sold_at", period.endIsoExclusive);

  if (ordersError) throw ordersError;

  const orders = ((ordersData ?? []) as OrderRow[]).filter((order) =>
    isRevenueOrder(order.status)
  );
  const orderIds = orders.map((order) => order.id);
  const ordersById = new Map(orders.map((order) => [order.id, order]));

  const { data: itemsData, error: itemsError } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select(
            "order_id, seller_sku, title, quantity, gross_amount, marketplace_fee_amount, shipping_cost_amount, discount_amount"
          )
          .in("order_id", orderIds)
      : { data: [], error: null };

  if (itemsError) throw itemsError;

  const { data: costsData, error: costsError } = await supabase
    .from("sku_costs")
    .select(
      "cost_category, allocation_method, amount, valid_from, valid_to, products(internal_sku, status)"
    )
    .eq("organization_id", organizationId)
    .lte("valid_from", period.endDateExclusive);

  if (costsError) throw costsError;

  const costsBySku = new Map<string, CostRow[]>();

  for (const cost of (costsData ?? []) as CostRow[]) {
    const product = getRelatedProduct(cost);
    if (!product || product.status === "archived") continue;

    const current = costsBySku.get(product.internal_sku) ?? [];
    current.push(cost);
    costsBySku.set(product.internal_sku, current);
  }

  const { data: adsData, error: adsError } = await supabase
    .from("advertising_metrics")
    .select("ad_spend_amount, attributed_revenue_amount")
    .eq("organization_id", organizationId)
    .gte("metric_date", period.startDate)
    .lt("metric_date", period.endDateExclusive);

  if (adsError) throw adsError;

  const advertisingCosts = ((adsData ?? []) as AdvertisingMetricRow[]).reduce(
    (total, row) => total + numberFromDb(row.ad_spend_amount),
    0
  );
  const attributedRevenue = ((adsData ?? []) as AdvertisingMetricRow[]).reduce(
    (total, row) => total + numberFromDb(row.attributed_revenue_amount),
    0
  );

  let units = 0;
  let grossRevenue = 0;
  let marketplaceFees = 0;
  let shippingCosts = 0;
  let discounts = 0;
  let skuCosts = 0;
  let taxesFromCosts = 0;

  for (const item of (itemsData ?? []) as OrderItemRow[]) {
    const order = ordersById.get(item.order_id);
    const sku = item.seller_sku ?? "SKU sem codigo";
    const soldAtDate = order?.sold_at ? order.sold_at.slice(0, 10) : period.startDate;
    const itemCosts = costsBySku.get(sku) ?? [];

    units += numberFromDb(item.quantity);
    grossRevenue += numberFromDb(item.gross_amount);
    marketplaceFees += numberFromDb(item.marketplace_fee_amount);
    shippingCosts += numberFromDb(item.shipping_cost_amount);
    discounts += numberFromDb(item.discount_amount);

    for (const cost of itemCosts) {
      if (!costAppliesToDate(cost, soldAtDate)) continue;

      const costAmount = calculateCostAmount(cost, item);
      if (cost.cost_category === "tax") {
        taxesFromCosts += costAmount;
      } else {
        skuCosts += costAmount;
      }
    }
  }

  if (grossRevenue === 0) {
    grossRevenue = orders.reduce(
      (total, order) => total + numberFromDb(order.gross_amount),
      0
    );
    marketplaceFees = orders.reduce(
      (total, order) => total + numberFromDb(order.marketplace_fee_amount),
      0
    );
    shippingCosts = orders.reduce(
      (total, order) => total + numberFromDb(order.shipping_cost_amount),
      0
    );
    discounts = orders.reduce(
      (total, order) => total + numberFromDb(order.discounts_amount),
      0
    );
  }

  const taxesFromOrders = orders.reduce(
    (total, order) => total + numberFromDb(order.taxes_amount),
    0
  );
  const taxes = taxesFromCosts + taxesFromOrders;
  const netRevenue = grossRevenue - discounts;
  const contributionMargin =
    netRevenue -
    marketplaceFees -
    shippingCosts -
    taxes -
    skuCosts -
    advertisingCosts;

  return {
    advertisingCosts,
    attributedRevenue,
    contributionMargin,
    contributionMarginRate: netRevenue > 0 ? contributionMargin / netRevenue : 0,
    discounts,
    grossRevenue,
    marketplaceFees,
    netRevenue,
    orders: orders.length,
    period,
    shippingCosts,
    skuCosts,
    taxes,
    ticketAverage: orders.length > 0 ? grossRevenue / orders.length : 0,
    units
  };
}

function isFullChannel(channel: string) {
  const normalized = channel.trim().toLowerCase();
  return normalized === "full" || normalized === "fulfillment";
}

function getRelatedSnapshotProduct(row: InventorySnapshotRow) {
  if (Array.isArray(row.products)) return row.products[0] ?? null;
  return row.products ?? null;
}

async function getInventorySummary(
  supabase: SupabaseClient,
  organizationId: string
): Promise<InventorySummary> {
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

    const product = getRelatedSnapshotProduct(snapshot);
    const sku = snapshot.seller_sku ?? product?.internal_sku;
    if (!sku || latestBySku.has(sku)) continue;
    if (product?.status === "archived") continue;

    latestBySku.set(sku, snapshot);
  }

  const skus = Array.from(latestBySku.keys());
  const { data: salesData, error: salesError } =
    skus.length > 0
      ? await supabase
          .from("order_items")
          .select(
            "seller_sku, quantity, gross_amount, marketplace_fee_amount, orders(status)"
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

  for (const sale of (salesData ?? []) as Array<
    OrderItemRow & { orders?: { status?: string } | Array<{ status?: string }> }
  >) {
    const relation = Array.isArray(sale.orders) ? sale.orders[0] : sale.orders;
    if (relation?.status && !isRevenueOrder(relation.status)) continue;

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
    const product = getRelatedSnapshotProduct(snapshot);
    const available = numberFromDb(snapshot.available_quantity);
    const reserved = numberFromDb(snapshot.reserved_quantity);
    const totalQuantity =
      available +
      reserved +
      numberFromDb(snapshot.not_available_quantity);
    const pricing = pricingBySku.get(sku);
    const unitNetValue =
      pricing && pricing.units > 0
        ? (pricing.grossRevenue - pricing.marketplaceFees) / pricing.units
        : 0;

    return {
      available,
      investedValue: totalQuantity * unitNetValue,
      reserved,
      sku,
      title: product?.title ?? "Produto sem titulo",
      totalQuantity,
      unitNetValue
    };
  });

  return {
    rows: rows.sort((current, next) => next.totalQuantity - current.totalQuantity),
    totals: {
      available: rows.reduce((sum, row) => sum + row.available, 0),
      investedValue: rows.reduce((sum, row) => sum + row.investedValue, 0),
      reserved: rows.reduce((sum, row) => sum + row.reserved, 0),
      skus: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + row.totalQuantity, 0)
    }
  };
}

function buildHelpMessage() {
  return [
    "DASHMARKET no WhatsApp",
    "",
    "Voce pode perguntar:",
    "• qual e meu lucro deste mes?",
    "• quanto vendi ontem?",
    "• quantos pedidos tive hoje?",
    "• como esta o ADS deste mes?",
    "• como esta meu estoque Full?",
    "• resumo dos ultimos 7 dias"
  ].join("\n");
}

function buildInventoryResponse(inventory: InventorySummary) {
  return [
    "Estoque Full",
    "",
    `SKUs: ${formatNumber(inventory.totals.skus)}`,
    `Disponivel: ${formatNumber(inventory.totals.available)}`,
    `Reservado: ${formatNumber(inventory.totals.reserved)}`,
    `Total: ${formatNumber(inventory.totals.totalQuantity)}`,
    `Valor estimado: ${formatCurrency(inventory.totals.investedValue)}`,
    "",
    "Maiores estoques:",
    ...inventory.rows.slice(0, 5).map(
      (row, index) =>
        `${index + 1}. ${row.sku}: ${formatNumber(
          row.totalQuantity
        )} un. (${formatCurrency(row.investedValue)})`
    )
  ].join("\n");
}

function buildMetricsResponse(question: string, metrics: BusinessMetrics) {
  const intent = parseIntent(question);
  const periodLabel = metrics.period.label;
  const tacos =
    metrics.grossRevenue > 0 ? metrics.advertisingCosts / metrics.grossRevenue : 0;

  if (intent === "help") {
    return buildHelpMessage();
  }

  if (intent === "profit") {
    return [
      `Lucro de ${periodLabel}`,
      "",
      `Margem de contribuicao: ${formatCurrency(metrics.contributionMargin)}`,
      `MC%: ${formatPercent(metrics.contributionMarginRate)}`,
      `Faturamento: ${formatCurrency(metrics.grossRevenue)}`,
      `Custos + taxas + frete + ADS: ${formatCurrency(
        metrics.skuCosts +
          metrics.taxes +
          metrics.marketplaceFees +
          metrics.shippingCosts +
          metrics.advertisingCosts
      )}`,
      `Pedidos: ${formatNumber(metrics.orders)}`
    ].join("\n");
  }

  if (intent === "sales") {
    return [
      `Vendas de ${periodLabel}`,
      "",
      `Faturamento: ${formatCurrency(metrics.grossRevenue)}`,
      `Receita liquida: ${formatCurrency(metrics.netRevenue)}`,
      `Pedidos: ${formatNumber(metrics.orders)}`,
      `Unidades: ${formatNumber(metrics.units)}`,
      `Ticket medio: ${formatCurrency(metrics.ticketAverage)}`
    ].join("\n");
  }

  if (intent === "orders") {
    return [
      `Pedidos de ${periodLabel}`,
      "",
      `Pedidos: ${formatNumber(metrics.orders)}`,
      `Unidades: ${formatNumber(metrics.units)}`,
      `Faturamento: ${formatCurrency(metrics.grossRevenue)}`,
      `Ticket medio: ${formatCurrency(metrics.ticketAverage)}`
    ].join("\n");
  }

  if (intent === "ads") {
    return [
      `Publicidade de ${periodLabel}`,
      "",
      `Investimento ADS: ${formatCurrency(metrics.advertisingCosts)}`,
      `TACOS: ${formatPercent(tacos)}`,
      `Receita atribuida: ${formatCurrency(metrics.attributedRevenue)}`,
      `ACOS: ${formatPercent(
        metrics.attributedRevenue > 0
          ? metrics.advertisingCosts / metrics.attributedRevenue
          : 0
      )}`
    ].join("\n");
  }

  return [
    `Resumo de ${periodLabel}`,
    "",
    `Faturamento: ${formatCurrency(metrics.grossRevenue)}`,
    `Lucro / MC: ${formatCurrency(metrics.contributionMargin)}`,
    `MC%: ${formatPercent(metrics.contributionMarginRate)}`,
    `Pedidos: ${formatNumber(metrics.orders)}`,
    `ADS: ${formatCurrency(metrics.advertisingCosts)} (${formatPercent(tacos)} TACOS)`
  ].join("\n");
}

async function sendWhatsAppMessage(
  message: InboundWhatsAppMessage,
  body: string,
  env: ReturnType<typeof getEnv>
) {
  if (message.provider === "evolution") {
    await sendEvolutionMessage(message, body, env);
    return;
  }

  if (!env.accessToken || !env.phoneNumberId) {
    throw new Error("WhatsApp nao configurado para envio.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.graphVersion}/${env.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: message.from,
        type: "text",
        text: {
          body,
          preview_url: false
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp recusou envio: ${response.status} ${errorText}`);
  }
}

async function sendEvolutionMessage(
  message: InboundWhatsAppMessage,
  body: string,
  env: ReturnType<typeof getEnv>
) {
  const baseUrl =
    env.evolutionApiUrl?.replace(/\/+$/, "") ??
    message.evolution?.serverUrl?.replace(/\/+$/, "");
  const instanceName = message.evolution?.instance ?? env.evolutionInstanceName;

  if (!baseUrl || !env.evolutionApiKey || !instanceName) {
    throw new Error("Evolution API nao configurada para envio.");
  }

  const response = await fetch(
    `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      headers: {
        apikey: env.evolutionApiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        linkPreview: false,
        number: message.from,
        text: body
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Evolution API recusou envio: ${response.status} ${errorText}`
    );
  }
}

function verifySignature(rawBody: string, signature: string | null, appSecret?: string) {
  if (!appSecret) return true;
  if (!signature?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const received = signature.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function verifyEvolutionWebhook(request: Request, env: ReturnType<typeof getEnv>) {
  if (!env.evolutionWebhookSecret) return true;

  const url = new URL(request.url);
  const headerToken =
    request.headers.get("x-dashmarket-webhook-secret") ??
    request.headers.get("x-evolution-webhook-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const queryToken = url.searchParams.get("token");

  return (
    headerToken === env.evolutionWebhookSecret ||
    queryToken === env.evolutionWebhookSecret
  );
}

function evolutionDataItems(payload: EvolutionWebhookPayload) {
  if (payload.data) {
    return Array.isArray(payload.data) ? payload.data : [payload.data];
  }

  const directPayload = payload as EvolutionWebhookPayload & EvolutionWebhookData;
  if (
    directPayload.key ||
    directPayload.message ||
    directPayload.sender ||
    directPayload.from ||
    directPayload.phone
  ) {
    return [directPayload];
  }

  return [];
}

function extractMetaMessages(
  payload: WhatsAppWebhookPayload
): InboundWhatsAppMessage[] {
  const messages =
    payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) => change.value?.messages ?? []) ?? []
    ) ?? [];

  return messages
    .map((message) => ({
      from: normalizePhone(message.from),
      id: message.id,
      provider: "meta" as const,
      question: message.text?.body?.trim() ?? "",
      rawPayload: message
    }))
    .filter((message) => Boolean(message.from && message.id));
}

function extractEvolutionText(message?: EvolutionMessageContent): string {
  return (
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.imageMessage?.caption ??
    message?.videoMessage?.caption ??
    message?.documentMessage?.caption ??
    (message?.message ? extractEvolutionText(message.message) : undefined) ??
    ""
  ).trim();
}

function isEvolutionMessageEvent(payload: EvolutionWebhookPayload) {
  const event = payload.event?.toLowerCase().replace(/[_-]/g, ".");
  return (
    event === "messages.upsert" ||
    evolutionDataItems(payload).some((item) => Boolean(item.key?.remoteJid))
  );
}

function booleanLike(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function truthyString(value: unknown) {
  return typeof value === "string" && ["true", "1", "yes", "sim"].includes(value.toLowerCase());
}

function nestedValue(source: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function isEvolutionOutgoingMessage(data: EvolutionWebhookData) {
  return [
    data.key?.fromMe,
    data.fromMe,
    nestedValue(data, ["message", "key", "fromMe"]),
    nestedValue(data, ["message", "fromMe"])
  ].some(booleanLike);
}

function isDashmarketReplyText(text: string) {
  const normalized = normalizeText(text);
  return DASHMARKET_REPLY_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix)
  );
}

function payloadContainsDashmarketReply(value: unknown): boolean {
  if (typeof value === "string") {
    return isDashmarketReplyText(value);
  }

  if (Array.isArray(value)) {
    return value.some(payloadContainsDashmarketReply);
  }

  if (value && typeof value === "object") {
    return Object.values(value).some(payloadContainsDashmarketReply);
  }

  return false;
}

function payloadContainsOutgoingMarker(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(payloadContainsOutgoingMarker);
  }

  if (!value || typeof value !== "object") return false;

  return Object.entries(value).some(([key, entry]) => {
    if (key.toLowerCase() === "fromme") {
      return booleanLike(entry) || truthyString(entry);
    }

    return payloadContainsOutgoingMarker(entry);
  });
}

function rawBodyContainsDashmarketReply(rawBody: string) {
  const normalized = normalizeText(rawBody);
  return DASHMARKET_REPLY_PREFIXES.some((prefix) =>
    normalized.includes(prefix)
  );
}

function shouldIgnoreEvolutionPayload(
  rawBody: string,
  payload: WhatsAppWebhookPayload | EvolutionWebhookPayload
) {
  return (
    payloadContainsOutgoingMarker(payload) ||
    payloadContainsDashmarketReply(payload) ||
    rawBodyContainsDashmarketReply(rawBody)
  );
}

function buildPayloadDiagnostics(
  payload: WhatsAppWebhookPayload | EvolutionWebhookPayload
) {
  const evolutionPayload = payload as EvolutionWebhookPayload;
  const dataItems = evolutionDataItems(evolutionPayload);

  return {
    dataItems: dataItems.length,
    event: evolutionPayload.event ?? null,
    hasEvolutionKey: dataItems.some((item) => Boolean(item.key?.remoteJid)),
    hasEvolutionMessage: dataItems.some((item) => Boolean(item.message)),
    hasMetaMessages: hasMetaPayload(payload),
    ignoredDashmarketReplies: dataItems.filter((item) =>
      isDashmarketReplyText(extractEvolutionText(item.message))
    ).length,
    ignoredOutgoingMessages: dataItems.filter(isEvolutionOutgoingMessage).length
  };
}

function extractEvolutionPhone(data: EvolutionWebhookData) {
  const candidates = [
    data.key?.participant,
    data.key?.remoteJid,
    data.sender,
    data.from,
    data.phone,
    data.owner
  ];

  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate ?? "");
    if (normalized) return normalized;
  }

  return "";
}

function isEvolutionGroupMessage(data: EvolutionWebhookData) {
  return [data.key?.remoteJid, data.key?.participant, data.sender, data.from].some(
    (candidate) => candidate?.endsWith("@g.us")
  );
}

function extractEvolutionMessages(payload: EvolutionWebhookPayload): InboundWhatsAppMessage[] {
  if (!isEvolutionMessageEvent(payload)) return [];

  return evolutionDataItems(payload).flatMap((data) => {
    if (isEvolutionOutgoingMessage(data)) return [];
    if (isEvolutionGroupMessage(data)) return [];

    const from = extractEvolutionPhone(data);
    const id = data.key?.id ?? "";
    const question = extractEvolutionText(data.message);

    if (!from || !id) return [];
    if (!question || isDashmarketReplyText(question)) return [];

    return {
      evolution: {
        instance: payload.instance,
        serverUrl: payload.server_url
      },
      from,
      id,
      provider: "evolution",
      question,
      rawPayload: {
        ...payload,
        data
      }
    };
  });
}

function extractInboundMessages(
  payload: WhatsAppWebhookPayload | EvolutionWebhookPayload
) {
  return [
    ...extractEvolutionMessages(payload as EvolutionWebhookPayload),
    ...extractMetaMessages(payload as WhatsAppWebhookPayload)
  ];
}

function looksLikeEvolutionPayload(payload: WhatsAppWebhookPayload | EvolutionWebhookPayload) {
  const evolutionPayload = payload as EvolutionWebhookPayload;
  const event = evolutionPayload.event?.toLowerCase().replace(/[_-]/g, ".");

  return (
    event === "messages.upsert" ||
    evolutionDataItems(evolutionPayload).some((item) => Boolean(item.key?.remoteJid))
  );
}

function hasMetaPayload(payload: WhatsAppWebhookPayload | EvolutionWebhookPayload) {
  return extractMetaMessages(payload as WhatsAppWebhookPayload).length > 0;
}

function parseWebhookPayload(rawBody: string) {
  try {
    return JSON.parse(rawBody) as WhatsAppWebhookPayload | EvolutionWebhookPayload;
  } catch {
    return null;
  }
}

function webhookSignatureIsValid(
  request: Request,
  rawBody: string,
  payload: WhatsAppWebhookPayload | EvolutionWebhookPayload,
  env: ReturnType<typeof getEnv>
) {
  if (looksLikeEvolutionPayload(payload)) {
    return verifyEvolutionWebhook(request, env);
  }

  if (hasMetaPayload(payload)) {
    return verifySignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      env.appSecret
    );
  }

  return true;
}

export async function GET(request: Request) {
  const env = getEnv();
  const url = new URL(request.url);

  if (url.searchParams.get("health") === "1") {
    if (!verifyEvolutionWebhook(request, env)) {
      return NextResponse.json({ error: "Token invalido." }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      route: "whatsapp-webhook",
      supabase: {
        serviceRoleKey: Boolean(env.serviceRoleKey),
        url: Boolean(env.supabaseUrl)
      },
      evolution: {
        apiKey: Boolean(env.evolutionApiKey),
        apiUrl: Boolean(env.evolutionApiUrl),
        instanceName: Boolean(env.evolutionInstanceName),
        webhookSecret: Boolean(env.evolutionWebhookSecret)
      },
      authorization: {
        allowedPhones: env.allowedPhones.length,
        fallbackOrganizationId: Boolean(env.fallbackOrganizationId)
      }
    });
  }

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  if (mode === "subscribe" && token && token === env.verifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" }
    });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const env = getEnv();
  const rawBody = await request.text();
  const payload = parseWebhookPayload(rawBody);

  if (!payload) {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }

  if (!webhookSignatureIsValid(request, rawBody, payload, env)) {
    return NextResponse.json({ error: "Assinatura invalida." }, { status: 403 });
  }

  if (shouldIgnoreEvolutionPayload(rawBody, payload)) {
    return NextResponse.json({
      diagnostics: {
        ...buildPayloadDiagnostics(payload),
        ignoredByLoopGuard: true
      },
      received: true
    });
  }

  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false }
  });
  const messages = extractInboundMessages(payload);
  let processedMessages = 0;
  let answeredMessages = 0;
  let failedMessages = 0;

  for (const message of messages) {
    if (!message.from || !message.id) continue;

    let stage = "inicio";

    try {
      stage = "autorizar telefone";
      const contact = await resolveAuthorizedContact(supabase, message.from, env);

      stage = "registrar pergunta";
      const shouldProcess = await logMessage(supabase, {
        body: message.question,
        direction: "inbound",
        messageId: message.id,
        organizationId: contact?.organizationId,
        phoneNumber: message.from,
        rawPayload: message.rawPayload
      });

      if (!shouldProcess) continue;
      processedMessages += 1;

      if (!contact) {
        stage = "enviar aviso de telefone nao autorizado";
        await sendWhatsAppMessage(
          message,
          "Este numero ainda nao esta autorizado no DASHMARKET. Cadastre seu telefone em whatsapp_contacts ou configure DASHMARKET_WHATSAPP_ALLOWED_PHONES.",
          env
        );
        answeredMessages += 1;
        continue;
      }

      stage = "consultar dados";
      const intent = parseIntent(message.question);
      const responseBody =
        !message.question || intent === "help"
          ? buildHelpMessage()
          : intent === "inventory"
            ? buildInventoryResponse(
                await getInventorySummary(supabase, contact.organizationId)
              )
            : buildMetricsResponse(
                message.question,
                await getBusinessMetrics(
                  supabase,
                  contact.organizationId,
                  parsePeriod(message.question)
                )
              );

      stage = "enviar resposta";
      await sendWhatsAppMessage(message, responseBody, env);
      answeredMessages += 1;

      stage = "registrar resposta";
      await logMessage(supabase, {
        body: responseBody,
        direction: "outbound",
        organizationId: contact.organizationId,
        phoneNumber: message.from,
        responseBody
      });
    } catch (error) {
      failedMessages += 1;
      console.error("Erro ao processar mensagem WhatsApp.", {
        error,
        messageId: message.id,
        phoneSuffix: message.from.slice(-4),
        stage
      });

      if (isDashmarketReplyText(message.question)) continue;
      if (stage === "enviar resposta") continue;

      try {
        await sendWhatsAppMessage(
          message,
          `Nao consegui consultar o DASHMARKET agora. A falha ocorreu em: ${stage}.`,
          env
        );
        answeredMessages += 1;
      } catch (sendError) {
        console.error("Erro ao enviar falha pelo WhatsApp.", sendError);
      }
    }
  }

  return NextResponse.json({
    answeredMessages,
    diagnostics: buildPayloadDiagnostics(payload),
    extractedMessages: messages.length,
    failedMessages,
    processedMessages,
    received: true
  });
}

"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  BrainCircuit,
  Cable,
  CircleDollarSign,
  ClipboardList,
  HelpCircle,
  Lightbulb,
  LineChart,
  LogOut,
  Megaphone,
  PackageCheck,
  PackagePlus,
  Pencil,
  Percent,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tags,
  Target,
  TrendingDown,
  TrendingUp,
  Trash2,
  WalletCards
} from "lucide-react";
import {
  calculateContributionMargins,
  type AdvertisingSpend,
  type SaleRecord,
  type SkuCost
} from "@/lib/metrics/contribution-margin";
import { getMarketplaceAdapter, listMarketplaceAdapters } from "@/lib/marketplaces/registry";
import type { MarketplaceProvider } from "@/lib/marketplaces/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { Sidebar, type ViewKey } from "@/components/dashboard/Sidebar";
import { KpiCard, KpiSection } from "@/components/dashboard/KpiSection";
import { InventoryTable } from "@/components/dashboard/InventoryTable";
import { ReconciliationView } from "@/components/dashboard/ReconciliationView";
import { AdsGestaoView } from "@/components/dashboard/AdsGestaoView";

type SupabaseStatus = "checking" | "demo" | "connected" | "error";
type FinanceEntryType = "income" | "expense";
type FinanceEntryStatus = "pending" | "paid" | "overdue";
type PersonalFinanceTab = "movements" | "loans";
type LoanDirection = "lent" | "borrowed";
type LoanStatus = "active" | "settled" | "late";
type SalesStatusFilter = "all" | "approved" | "cancelled" | "other";
type SalesStatusGroup = Exclude<SalesStatusFilter, "all">;

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type ProductStatus = "active" | "paused" | "archived";

type ProductRow = {
  id: string;
  internal_sku: string;
  title: string;
  status: ProductStatus;
  reference_price?: number | string | null;
  reference_net_profit?: number | string | null;
  reference_profit_margin?: number | string | null;
};

type MarketplaceListingStatusRow = {
  seller_sku: string;
  status: string | null;
};

type MarketplaceAccountRow = {
  id: string;
  provider: MarketplaceProvider;
  external_seller_id: string;
  account_name: string;
  site_id: string | null;
  status: "pending" | "connected" | "expired" | "disabled";
  last_sync_at: string | null;
};

type SyncRunStatus = "running" | "success" | "failed";

type SyncRunRow = {
  id: string;
  resource: string;
  status: SyncRunStatus;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  records_processed: number | null;
};

type SyncListingsSummary = {
  accountName: string;
  fetchedItems: number;
  remoteTotal: number;
  syncedListings: number;
  syncedProducts: number;
  syncedAt: string;
};

type SyncOrdersSummary = {
  accountName: string;
  daysBack: number;
  dateFrom?: string;
  dateTo?: string;
  remoteTotal: number;
  syncedOrders: number;
  syncedItems: number;
  grossAmount: number;
  syncedAt: string;
};

type SyncInventorySummary = {
  accountName: string;
  listingsChecked: number;
  skuSources: number;
  snapshots: number;
  fullSnapshots: number;
  availableQuantity: number;
  syncedAt: string;
};

type SyncAdvertisingSummary = {
  accountName: string;
  advertiserId: string | number;
  advertiserSiteId?: string;
  daysBack: number;
  campaigns: number;
  ads: number;
  metrics: number;
  adSpend: number;
  attributedRevenue: number;
  warnings?: string[];
  syncedAt: string;
};

type SyncPromotionsSummary = {
  accountName: string;
  promotions: number;
  inserted: number;
  updated: number;
  activePromotions: number;
  syncedAt: string;
};

type AuditedOrderItem = {
  sku: string | null;
  title: string | null;
  itemId?: string | null;
  quantity: number;
  unitPrice?: number;
  grossAmount: number;
  marketplaceFeeAmount?: number;
  saleFee?: number;
  sellerShippingAmount?: number;
  buyerShippingAmount?: number;
  discountAmount?: number;
};

type AuditedPayment = {
  id: string | number | null;
  status: string | null;
  statusDetail: string | null;
  transactionAmount: number;
  totalPaidAmount: number;
  shippingCost: number;
  couponAmount: number;
  dateCreated: string | null;
  dateApproved: string | null;
};

type AuditedOrderResult = {
  orderId: string;
  local: {
    status: string;
    rawStatus: string | null;
    soldAt: string;
    grossAmount: number;
    marketplaceFeeAmount: number;
    sellerShippingAmount: number;
    discountsAmount: number;
    taxesAmount: number;
    netAmount: number;
    countsInRevenue: boolean;
    items: AuditedOrderItem[];
  } | null;
  remote: {
    status: string;
    statusDetail: string | null;
    shouldCountInRevenue: boolean;
    fulfilled: boolean | null;
    dateCreated: string | null;
    dateClosed: string | null;
    lastUpdated: string | null;
    totalAmount: number;
    paidAmount: number;
    itemGrossAmount: number;
    marketplaceFeeAmount: number;
    sellerShippingAmount: number;
    buyerShippingAmount: number;
    shippingId: string | number | null;
    shippingStatus: string | null;
    shippingSubstatus: string | null;
    taxesAmount: number;
    tags: string[];
    cancelDetail: unknown;
    payments: AuditedPayment[];
    items: AuditedOrderItem[];
  } | null;
  remoteError: { status: number; message: string } | null;
  shipmentError: { status: number; message: string } | null;
  comparison: {
    revenueRisk: boolean;
    statusMismatch: boolean;
    localMissing: boolean;
    remoteMissing: boolean;
    grossMismatch: boolean;
    feeMismatch: boolean;
    sellerShippingMismatch: boolean;
    taxMismatch: boolean;
  };
};

type AuditOrdersResponse = {
  checkedAt: string;
  accountName: string;
  sellerId: string;
  lastSyncAt: string | null;
  orders: AuditedOrderResult[];
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
  details?: string;
  hint?: string;
  path?: string;
  status?: number;
};

type MercadoLivreDiagnosticCheck = {
  label: string;
  status: "ok" | "warning" | "error";
  message: string;
};

type MercadoLivreDiagnosticsResponse = {
  appUrl?: string;
  checks: MercadoLivreDiagnosticCheck[];
  redirectUri?: string;
  status: "ok" | "warning" | "error";
  summary: string;
};

type CostCenterRow = {
  id: string;
  cost_name: string;
  cost_category: SkuCost["category"];
  allocation_method: SkuCost["allocation"];
  amount: number | string;
  valid_from: string;
  valid_to: string | null;
  products: ProductRow | ProductRow[] | null;
};

type OrderItemRow = {
  id?: string;
  external_item_id?: string | null;
  seller_sku: string | null;
  title: string;
  quantity: number | string;
  unit_price?: number | string;
  gross_amount: number | string;
  marketplace_fee_amount: number | string;
  shipping_cost_amount: number | string;
  discount_amount: number | string;
  raw_payload?: OrderItemRawPayload | null;
  orders?: OrderRelationRow | OrderRelationRow[] | null;
};

type OrderRelationRow = {
  provider_order_id: string;
  sold_at: string;
  status: string;
  gross_amount: number | string;
  taxes_amount: number | string;
};

type SalesDetailSourceRow = {
  id: string;
  orderId: string;
  externalItemId: string;
  title: string;
  sku: string;
  soldAt: string;
  status: string;
  unitPrice: number;
  quantity: number;
  grossAmount: number;
  marketplaceFee: number;
  shippingBuyer: number;
  shippingSeller: number;
  discountAmount: number;
  orderTaxAmount: number;
};

type OrderItemRawPayload = {
  dashmarket_shipping?: {
    buyer_cost_amount?: number | string | null;
    seller_cost_amount?: number | string | null;
  } | null;
};

type SalesDetailRow = SalesDetailSourceRow & {
  costAmount: number;
  taxAmount: number;
  contributionMargin: number;
  marginRate: number;
};

type CostCalculatorMode = "margin" | "price" | "fixedProfit";

type MarketplacePresetId =
  | "mercado-livre"
  | "shopee-ate80" | "shopee-80-200" | "shopee-200-500"
  | "amazon" | "magalu" | "americanas" | "custom";

type MarketplacePreset = {
  id: MarketplacePresetId;
  label: string;
  commission: number;
  fixedFee: number;
  hint?: string;
};

const MARKETPLACE_PRESETS: MarketplacePreset[] = [
  { id: "mercado-livre",    label: "Mercado Livre",        commission: 16, fixedFee: 0 },
  { id: "shopee-ate80",     label: "Shopee (até R$79)",    commission: 20, fixedFee: 4 },
  { id: "shopee-80-200",    label: "Shopee (R$80–R$199)",  commission: 14, fixedFee: 16 },
  { id: "shopee-200-500",   label: "Shopee (R$200–R$499)", commission: 14, fixedFee: 26 },
  { id: "amazon",           label: "Amazon",               commission: 15, fixedFee: 0 },
  { id: "magalu",           label: "Magalu",               commission: 16, fixedFee: 0 },
  { id: "americanas",       label: "Americanas",           commission: 14, fixedFee: 0 },
  { id: "custom",           label: "Personalizado",        commission: 0,  fixedFee: 0 }
];

function getShopeePreset(price: number): MarketplacePresetId {
  if (price < 80) return "shopee-ate80";
  if (price < 200) return "shopee-80-200";
  return "shopee-200-500";
}

const MARKETPLACE_GROUPS: Record<MarketplacePresetId, string> = {
  "mercado-livre": "Mercado Livre",
  "shopee-ate80": "Shopee",
  "shopee-80-200": "Shopee",
  "shopee-200-500": "Shopee",
  amazon: "Amazon",
  magalu: "Magalu",
  americanas: "Americanas",
  custom: "Outro"
};

const MARKETPLACE_TAGS = [
  "Mercado Livre",
  "Shopee",
  "Amazon",
  "Magalu",
  "Americanas",
  "Outro"
] as const;

const PRODUCT_MARKETPLACES_STORAGE_KEY = "dashmarket:product-marketplaces";

function readStoredProductMarketplaces(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(PRODUCT_MARKETPLACES_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<
      Record<string, string>
    >((acc, [sku, value]) => {
      if (sku && typeof value === "string") {
        acc[sku] = value;
      }

      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeStoredProductMarketplaces(marketplaces: Record<string, string>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      PRODUCT_MARKETPLACES_STORAGE_KEY,
      JSON.stringify(marketplaces)
    );
  } catch {
    // O mapeamento continua valendo na sessao atual se o storage estiver bloqueado.
  }
}

// ─── Resultados da Calculadora de Custos ──────────────────────────────────────
// Espelha a abordagem do dashmarket-pro: o produto calculado guarda o PROPRIO
// resultado (preco, lucro liquido e margem) e a tabela do Centro de Custos exibe
// esse valor diretamente, sem recalcular a partir das vendas. Persistido em
// localStorage para nao depender de migracao/colunas novas no Supabase.
const CALCULATOR_RESULTS_STORAGE_KEY = "dashmarket:calculator-results";

type StoredCalculatorResult = {
  sellingPrice: number;
  netProfit: number;
  profitMargin: number; // razao 0-1
};

function readStoredCalculatorResults(): Record<string, StoredCalculatorResult> {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(CALCULATOR_RESULTS_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<
      Record<string, StoredCalculatorResult>
    >((acc, [sku, value]) => {
      if (
        sku &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        const record = value as Record<string, unknown>;
        acc[sku] = {
          sellingPrice: Number(record.sellingPrice ?? 0) || 0,
          netProfit: Number(record.netProfit ?? 0) || 0,
          profitMargin: Number(record.profitMargin ?? 0) || 0
        };
      }

      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeStoredCalculatorResults(
  results: Record<string, StoredCalculatorResult>
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      CALCULATOR_RESULTS_STORAGE_KEY,
      JSON.stringify(results)
    );
  } catch {
    // Mantem os resultados em memoria se o storage estiver bloqueado.
  }
}

type CostCalculatorFormState = {
  sku: string;
  name: string;
  productCost: string;
  sellingPrice: string;
  commissionPercentage: string;
  fixedFee: string;
  shippingCost: string;
  packagingCost: string;
  collectionCost: string;
  storageCost: string;
  operationalCost: string;
  taxPercentage: string;
  adTacosPercentage: string;
  affiliateCommissionPercentage: string;
  promotionCredit: string;
  desiredProfitMargin: string;
  desiredFixedProfit: string;
  validFrom: string;
};

type CostCalculatorResult = {
  sellingPrice: number;
  productCost: number;
  commission: number;
  fixedFee: number;
  shippingCost: number;
  packagingCost: number;
  collectionCost: number;
  storageCost: number;
  operationalCost: number;
  taxes: number;
  advertisingInvestment: number;
  affiliateCommission: number;
  promotionCredit: number;
  totalCosts: number;
  netProfit: number;
  profitMargin: number;
  markup: number;
};

type CalculatorCostEntry = {
  label: string;
  category: SkuCost["category"];
  allocation: SkuCost["allocation"];
  amount: number;
};

const CALCULATOR_AD_TACOS_LABEL = "Investimento ADS - TACOS";
const CALCULATOR_COST_LABELS = [
  "Fornecedor",
  "Embalagem",
  "Coleta",
  "Armazenagem",
  "Operacional",
  "Imposto",
  CALCULATOR_AD_TACOS_LABEL
] as const;

type CostCenterProductRow = {
  sku: string;
  title: string;
  units: number;
  orders: number;
  grossRevenue: number;
  averagePrice: number;
  productCost: number;
  packagingCost: number;
  operationalCost: number;
  taxPercentage: number;
  advertisingCost: number;
  advertisingTacosPercentage: number;
  contributionMargin: number;
  contributionMarginRate: number;
};

type ProductUnitRow = {
  sku: string;
  title: string;
  units: number;
  orders: number;
  grossRevenue: number;
  averagePrice: number;
  discountUnit: number;
  productCostUnit: number;
  packagingCostUnit: number;
  inboundFreightUnit: number;
  marketplaceFixedUnit: number;
  otherCostUnit: number;
  taxUnit: number;
  marketplaceFeeUnit: number;
  shippingSellerUnit: number;
  advertisingAmount: number;
  advertisingUnit: number;
  manualAdvertisingUnit: number;
  manualTacosRate: number;
  attributedRevenue: number;
  acosRate: number;
  tacosRate: number;
  totalCostUnit: number;
  contributionMarginUnit: number;
  contributionMarginRate: number;
  hasSales: boolean;
};

type InventorySnapshotRow = {
  seller_sku: string | null;
  fulfillment_channel: string;
  available_quantity: number | string;
  reserved_quantity: number | string;
  not_available_quantity: number | string;
  captured_at: string;
};

type InventoryDisplayRow = {
  sku: string;
  channel: string;
  available: number;
  reserved: number;
  notAvailable: number;
  status: "Saudavel" | "Atencao" | "Critico";
  capturedAt?: string;
};

type InventoryValuationRow = InventoryDisplayRow & {
  title: string;
  totalQuantity: number;
  unitSalePrice: number;
  unitMarketplaceFee: number;
  unitSellerShippingCost: number;
  unitNetValue: number;
  investedValue: number;
  hasPricing: boolean;
};

type PhysicalInventoryRow = {
  sku: string;
  title: string;
  quantity: number;
  unitSalePrice: number;
  unitMarketplaceFee: number;
  unitSellerShippingCost: number;
  unitNetValue: number;
  grossValue: number;
  marketplaceFeeValue: number;
  sellerShippingValue: number;
  netValue: number;
  hasPricing: boolean;
};

type AiInsightSeverity = "critical" | "warning" | "positive" | "info";

type AiInsight = {
  id: string;
  title: string;
  summary: string;
  recommendation: string;
  severity: AiInsightSeverity;
  metricLabel: string;
  metricValue: string;
};

type AiSkuPriority = {
  sku: string;
  title: string;
  issue: string;
  recommendation: string;
  metric: string;
  severity: AiInsightSeverity;
  grossRevenue: number;
};

type AiSalesWindow = {
  grossAmount: number;
  contributionMargin: number;
  marginRate: number;
  orders: number;
  quantity: number;
};

type OpenAiBusinessAnalysisItem = {
  title: string;
  severity: AiInsightSeverity;
  summary: string;
  evidence: string;
  recommendation: string;
};

type OpenAiRecommendedAction = {
  priority: string;
  action: string;
  expectedImpact: string;
  reason: string;
};

type OpenAiSkuHighlight = {
  sku: string;
  title: string;
  severity: AiInsightSeverity;
  issue: string;
  evidence: string;
  action: string;
};

type OpenAiBusinessAnalysis = {
  score: number;
  status: AiInsightSeverity;
  executiveSummary: string;
  diagnosis: OpenAiBusinessAnalysisItem[];
  opportunities: OpenAiBusinessAnalysisItem[];
  risks: OpenAiBusinessAnalysisItem[];
  recommendedActions: OpenAiRecommendedAction[];
  adsAnalysis: {
    verdict: string;
    tacosRead: string;
    investmentRead: string;
    recommendation: string;
  };
  profitabilityAnalysis: {
    verdict: string;
    marginRead: string;
    trendRead: string;
    recommendation: string;
  };
  stockAnalysis: {
    verdict: string;
    capitalRead: string;
    riskRead: string;
    recommendation: string;
  };
  skuHighlights: OpenAiSkuHighlight[];
  questionsToInvestigate: string[];
};

type OpenAiBusinessAnalysisResponse = {
  analysis: OpenAiBusinessAnalysis;
  generatedAt: string;
  model: string;
};

type AdvertisingMetricRow = {
  impressions: number | string;
  clicks: number | string;
  ad_spend_amount: number | string;
  attributed_revenue_amount: number | string;
  attributed_orders: number | string;
  products: ProductRow | ProductRow[] | null;
};

type ListingDailyAnalyticsDbRow = {
  id: string;
  external_item_id: string;
  seller_sku: string | null;
  title: string;
  category_id: string | null;
  category_name: string | null;
  captured_date: string;
  visits: number | string;
  previous_visits: number | string;
  visit_change_percent: number | string | null;
  listing_position: number | string | null;
  previous_position: number | string | null;
  competitor_count: number | string;
  estimated_sold_quantity: number | string;
  status: string | null;
  permalink: string | null;
};

type ListingExposureAlertDbRow = {
  id: string;
  external_item_id: string;
  seller_sku: string | null;
  title: string;
  alert_date: string;
  alert_type: string;
  severity: AiInsightSeverity;
  message: string;
  current_value: number | string | null;
  previous_value: number | string | null;
};

type ProductOpportunityDbRow = {
  id: string;
  category_id: string;
  category_name: string | null;
  query: string | null;
  captured_at: string;
  external_item_id: string;
  title: string;
  price_amount: number | string;
  sold_quantity: number | string;
  previous_sold_quantity: number | string;
  estimated_daily_sales: number | string;
  available_quantity: number | string;
  seller_id: string | null;
  seller_name: string | null;
  competitor_count: number | string;
  listing_position: number | string | null;
  permalink: string | null;
  thumbnail: string | null;
};

type ListingDailyAnalyticsRow = {
  id: string;
  externalItemId: string;
  sku: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  capturedDate: string;
  visits: number;
  previousVisits: number;
  visitChangeRate: number | null;
  listingPosition: number | null;
  previousPosition: number | null;
  competitorCount: number;
  estimatedSoldQuantity: number;
  status: string | null;
  permalink: string | null;
};

type ListingExposureAlert = {
  id: string;
  externalItemId: string;
  sku: string;
  title: string;
  alertDate: string;
  alertType: string;
  severity: AiInsightSeverity;
  message: string;
  currentValue: number | null;
  previousValue: number | null;
};

type ProductOpportunity = {
  id: string;
  categoryId: string;
  categoryName: string | null;
  query: string | null;
  capturedAt: string;
  externalItemId: string;
  title: string;
  priceAmount: number;
  soldQuantity: number;
  previousSoldQuantity: number;
  estimatedDailySales: number;
  availableQuantity: number;
  sellerId: string | null;
  sellerName: string | null;
  competitorCount: number;
  listingPosition: number | null;
  permalink: string | null;
  thumbnail: string | null;
};

type AdAnalysisSyncSummary = {
  accountName: string;
  alerts: number;
  analytics: number;
  capturedDate: string;
  checkedListings: number;
  syncedAt: string;
  warnings?: string[];
};

// Pós-venda types
type ReputationLevel = "1_red" | "2_orange" | "3_yellow" | "4_light_green" | "5_green";

type SellerReputationResponse = {
  accountName: string;
  sellerId: string;
  nickname: string;
  levelId: ReputationLevel | null;
  levelLabel: string;
  powerSellerStatus: string | null;
  metrics: {
    sales: { period: string; completed: number };
    claims: { period: string; rate: number; value: number };
    delayed_handling_time: { period: string; rate: number; value: number };
    cancellations: { period: string; rate: number; value: number };
  } | null;
  transactions: {
    period: string;
    total: number;
    completed: number;
    canceled: { total: number; rate: number };
    ratings: { positive: number; negative: number; neutral: number };
  } | null;
  fetchedAt: string;
};

type QuestionsResponse = {
  accountName: string;
  total: number;
  fetched: number;
  oldestUnansweredAt: string | null;
  topItems: Array<{ itemId: string; count: number; oldest: string }>;
  questions: Array<{
    id: number;
    date_created: string;
    item_id: string;
    text: string;
    status: string;
  }>;
  fetchedAt: string;
};

type ClaimItem = {
  id: string;
  orderId: string;
  status: string;
  stage: string;
  stageLabel: string;
  type: string;
  reasonId: string | null;
  reasonLabel: string | null;
  dateCreated: string;
  lastUpdated: string;
  expirationDate: string | null;
  hoursLeft: number | null;
  isExpired: boolean;
  isUrgent: boolean;
  sellerActions: string[];
  needsAction: boolean;
  resolution: { reason: string | null; benefited: string | null } | null;
};

type ClaimsResponse = {
  accountName: string;
  status: string;
  total: number;
  fetched: number;
  summary: {
    expired: number;
    urgent: number;
    needsAction: number;
    inMediation: number;
    byStage: Record<string, number>;
  };
  claims: ClaimItem[];
  fetchedAt: string;
};

type ProductOpportunitySearchResponse = {
  accountName: string;
  categoryId: string;
  categoryName: string | null;
  competitorCount: number;
  query: string;
  results: Array<{
    id?: string;
    external_item_id: string;
    title: string;
    price_amount: number;
    sold_quantity: number;
    previous_sold_quantity: number;
    estimated_daily_sales: number;
    available_quantity: number;
    seller_id: string | null;
    seller_name: string | null;
    competitor_count: number;
    listing_position: number | null;
    permalink: string | null;
    thumbnail: string | null;
    category_id: string;
    category_name: string | null;
    query: string | null;
    captured_at: string;
  }>;
  syncedAt: string;
  total: number;
};

type PromotionDbRow = {
  provider_promotion_id: string;
  name: string;
  promotion_type: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  discount_amount: number | string | null;
  discount_percent: number | string | null;
  products: ProductRow | ProductRow[] | null;
};

type PromotionDisplayRow = {
  sku: string;
  name: string;
  discount: string;
  period: string;
  impact: string;
  type?: string;
  status?: string | null;
};

type FinanceEntry = {
  id: string;
  title: string;
  category: string;
  type: FinanceEntryType;
  amount: number;
  dueDate: string;
  paidAt?: string | null;
  status: FinanceEntryStatus;
  paymentMethod: string;
  notes?: string | null;
};

type FinanceEntryDbRow = {
  id: string;
  description: string;
  category: string;
  entry_type: FinanceEntryType;
  amount: number | string;
  due_date: string;
  paid_at: string | null;
  status: FinanceEntryStatus;
  payment_method: string | null;
  notes: string | null;
};

type LoanEntry = {
  id: string;
  direction: LoanDirection;
  personName: string;
  description: string;
  principalAmount: number;
  paidAmount: number;
  interestRate: number;
  startDate: string;
  dueDate: string;
  status: LoanStatus;
  notes?: string | null;
};

type LoanEntryDbRow = {
  id: string;
  loan_direction: LoanDirection;
  person_name: string;
  description: string;
  principal_amount: number | string;
  paid_amount: number | string;
  interest_rate: number | string;
  start_date: string;
  due_date: string;
  status: LoanStatus;
  notes: string | null;
};

const salesSeed: SaleRecord[] = [
  {
    sku: "MLB-CABO-USB-C-1M",
    title: "Cabo USB-C turbo 1m",
    units: 184,
    orders: 129,
    grossRevenue: 10120,
    marketplaceFees: 1540,
    shippingCosts: 680,
    discounts: 320,
    taxes: 0
  },
  {
    sku: "MLB-CAPA-AIR-13",
    title: "Capa notebook Air 13",
    units: 76,
    orders: 61,
    grossRevenue: 11856,
    marketplaceFees: 1864,
    shippingCosts: 510,
    discounts: 420,
    taxes: 0
  },
  {
    sku: "MLB-SUPORTE-MESA-PRO",
    title: "Suporte articulado de mesa",
    units: 43,
    orders: 39,
    grossRevenue: 16770,
    marketplaceFees: 2732,
    shippingCosts: 940,
    discounts: 680,
    taxes: 0
  },
  {
    sku: "MLB-FONE-BT-COMPACT",
    title: "Fone bluetooth compacto",
    units: 112,
    orders: 97,
    grossRevenue: 14224,
    marketplaceFees: 2218,
    shippingCosts: 795,
    discounts: 530,
    taxes: 0
  }
];

const costsSeed: SkuCost[] = [
  {
    id: "cost-1",
    sku: "MLB-CABO-USB-C-1M",
    label: "Fornecedor",
    category: "product",
    amount: 18.9,
    allocation: "per_unit",
    validFrom: "2026-05-01"
  },
  {
    id: "cost-2",
    sku: "MLB-CABO-USB-C-1M",
    label: "Embalagem",
    category: "packaging",
    amount: 1.25,
    allocation: "per_unit",
    validFrom: "2026-05-01"
  },
  {
    id: "cost-3",
    sku: "MLB-CAPA-AIR-13",
    label: "Fornecedor",
    category: "product",
    amount: 72.4,
    allocation: "per_unit",
    validFrom: "2026-05-01"
  },
  {
    id: "cost-4",
    sku: "MLB-SUPORTE-MESA-PRO",
    label: "Fornecedor",
    category: "product",
    amount: 184,
    allocation: "per_unit",
    validFrom: "2026-05-01"
  },
  {
    id: "cost-5",
    sku: "MLB-FONE-BT-COMPACT",
    label: "Fornecedor",
    category: "product",
    amount: 48.7,
    allocation: "per_unit",
    validFrom: "2026-05-01"
  }
];

const adSpendSeed: AdvertisingSpend[] = [
  {
    sku: "MLB-CABO-USB-C-1M",
    amount: 870,
    clicks: 2480,
    impressions: 81400,
    attributedRevenue: 4480
  },
  {
    sku: "MLB-CAPA-AIR-13",
    amount: 420,
    clicks: 1114,
    impressions: 35600,
    attributedRevenue: 2910
  },
  {
    sku: "MLB-SUPORTE-MESA-PRO",
    amount: 980,
    clicks: 1560,
    impressions: 42200,
    attributedRevenue: 6200
  },
  {
    sku: "MLB-FONE-BT-COMPACT",
    amount: 740,
    clicks: 2030,
    impressions: 61500,
    attributedRevenue: 3890
  }
];

const inventoryRows: InventoryDisplayRow[] = [
  {
    sku: "MLB-CABO-USB-C-1M",
    channel: "Full",
    available: 420,
    reserved: 36,
    notAvailable: 280,
    status: "Saudavel"
  },
  {
    sku: "MLB-CAPA-AIR-13",
    channel: "Full",
    available: 96,
    reserved: 12,
    notAvailable: 40,
    status: "Atencao"
  },
  {
    sku: "MLB-SUPORTE-MESA-PRO",
    channel: "Full",
    available: 31,
    reserved: 8,
    notAvailable: 20,
    status: "Critico"
  },
  {
    sku: "MLB-FONE-BT-COMPACT",
    channel: "Flex",
    available: 188,
    reserved: 19,
    notAvailable: 0,
    status: "Saudavel"
  }
];

const promotionRows: PromotionDisplayRow[] = [
  {
    sku: "MLB-CABO-USB-C-1M",
    name: "Oferta relampago",
    discount: "8%",
    period: "12 a 14 mai",
    impact: "Boa margem"
  },
  {
    sku: "MLB-SUPORTE-MESA-PRO",
    name: "Campanha marketplace",
    discount: "R$ 24,00",
    period: "10 a 18 mai",
    impact: "Revisar custo"
  }
];

const companyFinanceSeed: FinanceEntry[] = [
  {
    id: "company-finance-1",
    title: "Repasse Mercado Livre",
    category: "Vendas marketplace",
    type: "income",
    amount: 18450,
    dueDate: "2026-05-17",
    paidAt: null,
    status: "pending",
    paymentMethod: "Conta empresa",
    notes: "Previsao de repasse semanal"
  },
  {
    id: "company-finance-2",
    title: "Fornecedor de produtos",
    category: "Compras",
    type: "expense",
    amount: 7200,
    dueDate: "2026-05-20",
    paidAt: null,
    status: "pending",
    paymentMethod: "PIX",
    notes: "Reposicao de estoque"
  },
  {
    id: "company-finance-3",
    title: "Publicidade Mercado Livre",
    category: "Marketing",
    type: "expense",
    amount: 1380,
    dueDate: "2026-05-12",
    paidAt: "2026-05-12",
    status: "paid",
    paymentMethod: "Cartao empresa",
    notes: "Campanhas Product Ads"
  }
];

const personalFinanceSeed: FinanceEntry[] = [
  {
    id: "personal-finance-1",
    title: "Pro-labore",
    category: "Renda",
    type: "income",
    amount: 6500,
    dueDate: "2026-05-05",
    paidAt: "2026-05-05",
    status: "paid",
    paymentMethod: "Banco",
    notes: "Retirada mensal"
  },
  {
    id: "personal-finance-2",
    title: "Cartao de credito",
    category: "Cartao",
    type: "expense",
    amount: 2180,
    dueDate: "2026-05-18",
    paidAt: null,
    status: "pending",
    paymentMethod: "Banco",
    notes: "Fatura aberta"
  },
  {
    id: "personal-finance-3",
    title: "Internet residencial",
    category: "Casa",
    type: "expense",
    amount: 129.9,
    dueDate: "2026-05-10",
    paidAt: "2026-05-10",
    status: "paid",
    paymentMethod: "Debito automatico",
    notes: ""
  }
];

const personalLoanSeed: LoanEntry[] = [
  {
    id: "personal-loan-1",
    direction: "lent",
    personName: "Cliente parceiro",
    description: "Adiantamento combinado",
    principalAmount: 2500,
    paidAmount: 900,
    interestRate: 0,
    startDate: "2026-04-15",
    dueDate: "2026-06-15",
    status: "active",
    notes: "Receber em duas parcelas"
  },
  {
    id: "personal-loan-2",
    direction: "borrowed",
    personName: "Banco",
    description: "Capital de giro pessoal",
    principalAmount: 8000,
    paidAmount: 2200,
    interestRate: 2.1,
    startDate: "2026-03-01",
    dueDate: "2026-08-01",
    status: "active",
    notes: "Acompanhar saldo devedor"
  }
];

const financeTypeLabel: Record<FinanceEntryType, string> = {
  income: "Receita",
  expense: "Despesa"
};

const financeStatusLabel: Record<FinanceEntryStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido"
};

const COMPANY_FINANCE_STORAGE_KEY = "dashmarket:company-finance-local";
const PERSONAL_FINANCE_STORAGE_KEY = "dashmarket:personal-finance-local";
const PHYSICAL_INVENTORY_STORAGE_KEY = "dashmarket:physical-inventory-local";

const loanDirectionLabel: Record<LoanDirection, string> = {
  lent: "Emprestei",
  borrowed: "Peguei"
};

const loanStatusLabel: Record<LoanStatus, string> = {
  active: "Em aberto",
  settled: "Quitado",
  late: "Atrasado"
};

const formatCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const formatNumber = new Intl.NumberFormat("pt-BR");
const reconciliationDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const SALES_DETAIL_LIMIT = 50000;
const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const saoPauloIsoDate = new Intl.DateTimeFormat("sv", { timeZone: SAO_PAULO_TIME_ZONE });
const saoPauloDateParts = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: SAO_PAULO_TIME_ZONE,
  year: "numeric"
});
const saoPauloDateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  timeZone: SAO_PAULO_TIME_ZONE,
  year: "numeric"
});

function formatPercent(value: number) {
  return `${(value * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  })}%`;
}

function statusClass(status: string) {
  if (status === "Critico") return "bg-rose-50 text-berry ring-rose-200";
  if (status === "Atencao") return "bg-amber-50 text-clay ring-amber-200";
  return "bg-emerald-50 text-sea ring-emerald-200";
}

function aiSeverityClass(severity: AiInsightSeverity) {
  if (severity === "critical") return "bg-rose-50 text-berry ring-rose-200";
  if (severity === "warning") return "bg-amber-50 text-clay ring-amber-200";
  if (severity === "positive") return "bg-emerald-50 text-sea ring-emerald-200";
  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function aiSeverityLabel(severity: AiInsightSeverity) {
  if (severity === "critical") return "Crítico";
  if (severity === "warning") return "Atenção";
  if (severity === "positive") return "Bom sinal";
  return "Informação";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRelatedProduct(row: CostCenterRow) {
  if (Array.isArray(row.products)) return row.products[0] ?? null;
  return row.products;
}

function getRelatedOrder(row: OrderItemRow) {
  if (Array.isArray(row.orders)) return row.orders[0] ?? null;
  return row.orders ?? null;
}

function getOrderItemShippingAmounts(row: OrderItemRow) {
  const shippingPayload = row.raw_payload?.dashmarket_shipping;

  if (shippingPayload) {
    return {
      buyer: numberFromDb(shippingPayload.buyer_cost_amount),
      seller: numberFromDb(shippingPayload.seller_cost_amount)
    };
  }

  return {
    buyer: 0,
    seller: numberFromDb(row.shipping_cost_amount)
  };
}

function isCalculatorManagedCostLabel(label: string) {
  return CALCULATOR_COST_LABELS.some((managedLabel) => managedLabel === label);
}

function isCalculatorManagedCost(cost: Pick<SkuCost, "label">) {
  return isCalculatorManagedCostLabel(cost.label);
}

function dedupeCalculatorCostRows(rows: CostCenterRow[]) {
  const seenCalculatorCosts = new Set<string>();

  return rows.filter((row) => {
    if (!isCalculatorManagedCostLabel(row.cost_name)) return true;

    const product = getRelatedProduct(row);
    const productKey = product?.id ?? product?.internal_sku ?? "sem-produto";
    const costKey = [
      productKey,
      row.cost_name,
      row.cost_category,
      row.allocation_method
    ].join(":");

    if (seenCalculatorCosts.has(costKey)) return false;
    seenCalculatorCosts.add(costKey);
    return true;
  });
}

function inventoryUnitValuesFromSale(sale?: SaleRecord) {
  const soldUnits = sale?.units ?? 0;

  if (!sale || soldUnits <= 0) {
    return {
      hasPricing: false,
      unitSalePrice: 0,
      unitMarketplaceFee: 0,
      unitSellerShippingCost: 0,
      unitNetValue: 0
    };
  }

  const unitSalePrice = sale.grossRevenue / soldUnits;
  const unitMarketplaceFee = Math.max(0, sale.marketplaceFees) / soldUnits;
  const unitSellerShippingCost = Math.max(0, sale.shippingCosts) / soldUnits;

  return {
    hasPricing: true,
    unitSalePrice,
    unitMarketplaceFee,
    unitSellerShippingCost,
    unitNetValue: unitSalePrice - unitMarketplaceFee - unitSellerShippingCost
  };
}

function mapCostCenterRow(row: CostCenterRow): SkuCost | null {
  const product = getRelatedProduct(row);
  if (!product || product.status === "archived") return null;

  return {
    id: row.id,
    sku: product.internal_sku,
    label: row.cost_name,
    category: row.cost_category,
    amount: Number(row.amount),
    allocation: row.allocation_method,
    validFrom: row.valid_from,
    validTo: row.valid_to ?? undefined
  };
}

function mapListingAnalyticsRow(
  row: ListingDailyAnalyticsDbRow
): ListingDailyAnalyticsRow {
  return {
    id: row.id,
    externalItemId: row.external_item_id,
    sku: row.seller_sku ?? row.external_item_id,
    title: row.title,
    categoryId: row.category_id,
    categoryName: row.category_name,
    capturedDate: row.captured_date,
    visits: numberFromDb(row.visits),
    previousVisits: numberFromDb(row.previous_visits),
    visitChangeRate:
      row.visit_change_percent === null
        ? null
        : numberFromDb(row.visit_change_percent),
    listingPosition:
      row.listing_position === null ? null : numberFromDb(row.listing_position),
    previousPosition:
      row.previous_position === null ? null : numberFromDb(row.previous_position),
    competitorCount: numberFromDb(row.competitor_count),
    estimatedSoldQuantity: numberFromDb(row.estimated_sold_quantity),
    status: row.status,
    permalink: row.permalink
  };
}

function mapListingExposureAlertRow(
  row: ListingExposureAlertDbRow
): ListingExposureAlert {
  return {
    id: row.id,
    externalItemId: row.external_item_id,
    sku: row.seller_sku ?? row.external_item_id,
    title: row.title,
    alertDate: row.alert_date,
    alertType: row.alert_type,
    severity: row.severity,
    message: row.message,
    currentValue:
      row.current_value === null ? null : numberFromDb(row.current_value),
    previousValue:
      row.previous_value === null ? null : numberFromDb(row.previous_value)
  };
}

function mapProductOpportunityRow(
  row: ProductOpportunityDbRow
): ProductOpportunity {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    query: row.query,
    capturedAt: row.captured_at,
    externalItemId: row.external_item_id,
    title: row.title,
    priceAmount: numberFromDb(row.price_amount),
    soldQuantity: numberFromDb(row.sold_quantity),
    previousSoldQuantity: numberFromDb(row.previous_sold_quantity),
    estimatedDailySales: numberFromDb(row.estimated_daily_sales),
    availableQuantity: numberFromDb(row.available_quantity),
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    competitorCount: numberFromDb(row.competitor_count),
    listingPosition:
      row.listing_position === null ? null : numberFromDb(row.listing_position),
    permalink: row.permalink,
    thumbnail: row.thumbnail
  };
}

function numberFromDb(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function numberFromInput(value: string) {
  const numeric = Number(value.replace(",", ".") || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function inputNumber(value: number) {
  return value > 0 ? value.toFixed(2) : "";
}

function addDays(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return dateOnly(value);
}

function makeLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}`;
}

function defaultOrganizationSlug(userId: string) {
  return `dashmarket-${userId.replace(/-/g, "").slice(0, 12)}`;
}

type DatabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function databaseErrorInfo(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: undefined, text: "" };
  }

  const databaseError = error as DatabaseErrorLike;
  return {
    code: databaseError.code,
    text: [databaseError.message, databaseError.details, databaseError.hint]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  };
}

function isMissingRelationError(error: unknown) {
  const { code, text } = databaseErrorInfo(error);

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    text.includes("does not exist") ||
    text.includes("could not find the table") ||
    text.includes("schema cache")
  );
}

function isMissingStorageSchemaError(error: unknown) {
  const { code, text } = databaseErrorInfo(error);

  return (
    isMissingRelationError(error) ||
    code === "42703" ||
    code === "PGRST204" ||
    text.includes("could not find the column")
  );
}

function resolveFinanceStatus(
  status: FinanceEntryStatus,
  dueDate: string,
  paidAt?: string | null
): FinanceEntryStatus {
  if (status === "paid" || paidAt) return "paid";
  if (dueDate && dueDate < dateOnly(new Date())) return "overdue";
  return "pending";
}

function mapFinanceEntryRow(row: FinanceEntryDbRow): FinanceEntry {
  return {
    id: row.id,
    title: row.description,
    category: row.category,
    type: row.entry_type,
    amount: numberFromDb(row.amount),
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: resolveFinanceStatus(row.status, row.due_date, row.paid_at),
    paymentMethod: row.payment_method ?? "",
    notes: row.notes
  };
}

function isFinanceEntry(value: unknown): value is FinanceEntry {
  if (!value || typeof value !== "object") return false;

  const entry = value as Partial<FinanceEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.category === "string" &&
    (entry.type === "income" || entry.type === "expense") &&
    typeof entry.amount === "number" &&
    typeof entry.dueDate === "string" &&
    (entry.status === "pending" ||
      entry.status === "paid" ||
      entry.status === "overdue") &&
    typeof entry.paymentMethod === "string"
  );
}

function readStoredFinanceEntries(key: string, fallback: FinanceEntry[]) {
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;

    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return fallback;

    return parsed.filter(isFinanceEntry);
  } catch {
    return fallback;
  }
}

function writeStoredFinanceEntries(key: string, entries: FinanceEntry[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // Local fallback still works for the current session if storage is blocked.
  }
}

function readStoredPhysicalInventoryQuantities(): Record<string, number> {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(PHYSICAL_INVENTORY_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<
      Record<string, number>
    >((quantities, [sku, value]) => {
      const quantity = Math.max(0, Math.floor(Number(value)));
      if (sku && Number.isFinite(quantity) && quantity > 0) {
        quantities[sku] = quantity;
      }

      return quantities;
    }, {});
  } catch {
    return {};
  }
}

function writeStoredPhysicalInventoryQuantities(
  quantities: Record<string, number>
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      PHYSICAL_INVENTORY_STORAGE_KEY,
      JSON.stringify(quantities)
    );
  } catch {
    // The page still keeps edited quantities in memory if storage is blocked.
  }
}

function mapLoanEntryRow(row: LoanEntryDbRow): LoanEntry {
  return {
    id: row.id,
    direction: row.loan_direction,
    personName: row.person_name,
    description: row.description,
    principalAmount: numberFromDb(row.principal_amount),
    paidAmount: numberFromDb(row.paid_amount),
    interestRate: numberFromDb(row.interest_rate),
    startDate: row.start_date,
    dueDate: row.due_date,
    status: resolveLoanStatus(
      row.status,
      row.due_date,
      numberFromDb(row.principal_amount),
      numberFromDb(row.paid_amount)
    ),
    notes: row.notes
  };
}

function resolveLoanStatus(
  status: LoanStatus,
  dueDate: string,
  principalAmount: number,
  paidAmount: number
): LoanStatus {
  if (status === "settled" || paidAmount >= principalAmount) return "settled";
  if (dueDate && dueDate < dateOnly(new Date())) return "late";
  return "active";
}

function financeStatusClass(status: FinanceEntryStatus) {
  if (status === "paid") return "bg-emerald-50 text-sea ring-emerald-100";
  if (status === "overdue") return "bg-rose-50 text-berry ring-rose-200";
  return "bg-amber-50 text-clay ring-amber-100";
}

function loanStatusClass(status: LoanStatus) {
  if (status === "settled") return "bg-emerald-50 text-sea ring-emerald-100";
  if (status === "late") return "bg-rose-50 text-berry ring-rose-200";
  return "bg-amber-50 text-clay ring-amber-100";
}

function channelLabel(channel: string) {
  const labels: Record<string, string> = {
    full: "Full",
    fulfillment: "Full",
    selling_address: "Estoque local",
    seller_warehouse: "Deposito proprio",
    flex: "Flex",
    cross_docking: "Coleta",
    drop_off: "Agencia",
    marketplace: "Marketplace"
  };

  return labels[channel] ?? channel;
}

function isFullInventoryChannel(channel: string) {
  const normalized = channel.trim().toLowerCase();
  return normalized === "full" || normalized === "fulfillment";
}

function inventoryStatus(available: number): InventoryDisplayRow["status"] {
  if (available <= 5) return "Critico";
  if (available <= 20) return "Atencao";
  return "Saudavel";
}

function formatPromotionPeriod(startsAt: string | null, endsAt: string | null) {
  const start = startsAt ? new Date(startsAt).toLocaleDateString("pt-BR") : null;
  const end = endsAt ? new Date(endsAt).toLocaleDateString("pt-BR") : null;

  if (start && end) return `${start} a ${end}`;
  if (start) return `Desde ${start}`;
  if (end) return `Ate ${end}`;
  return "Periodo nao informado";
}

function promotionImpact(status: string | null) {
  const normalized = status?.toLowerCase();
  if (normalized === "started" || normalized === "active") return "Ativa";
  if (normalized === "pending" || normalized === "candidate") return "Pendente";
  if (normalized === "finished" || normalized === "closed") return "Encerrada";
  return status ?? "Status aberto";
}

function isApprovedOrderStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  return normalized === "paid" || normalized === "partially_refunded";
}

function isCancelledOrderStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  return normalized === "cancelled" || normalized === "canceled" || normalized === "invalid";
}

function orderStatusGroup(status?: string | null): SalesStatusGroup {
  if (isApprovedOrderStatus(status)) return "approved";
  if (isCancelledOrderStatus(status)) return "cancelled";
  return "other";
}

function orderStatusLabel(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  const labels: Record<string, string> = {
    cancelled: "Cancelada",
    canceled: "Cancelada",
    confirmed: "Confirmada",
    invalid: "Invalidada",
    paid: "Efetivada",
    partially_paid: "Parcialmente paga",
    partially_refunded: "Parcialmente devolvida",
    payment_in_process: "Pagamento em analise",
    payment_required: "Aguardando pagamento"
  };

  return normalized ? labels[normalized] ?? status ?? "Status aberto" : "Status aberto";
}

function orderStatusClass(status?: string | null) {
  const group = orderStatusGroup(status);
  if (group === "approved") return "bg-emerald-50 text-sea ring-emerald-100";
  if (group === "cancelled") return "bg-rose-50 text-berry ring-rose-200";
  return "bg-amber-50 text-clay ring-amber-100";
}

function dateKeyInSaoPaulo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  const parts = saoPauloDateParts.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";

  return `${year}-${month}-${day}`;
}

function formatDateTimeInSaoPaulo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return saoPauloDateTime.format(date);
}

function dateOnly(value: Date) {
  return saoPauloIsoDate.format(value);
}

function daysAgo(days: number) {
  return dateOnly(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

function daysBackFromDate(dateValue: string) {
  if (!dateValue) return 365;

  const selectedDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime())) return 365;

  const today = new Date(`${dateOnly(new Date())}T00:00:00`);
  const diffInDays = Math.ceil(
    (today.getTime() - selectedDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  return Math.min(Math.max(diffInDays + 1, 1), 365);
}

function calculateCostsFromCalculator(
  form: CostCalculatorFormState,
  mode: CostCalculatorMode
): CostCalculatorResult | null {
  const productCost = numberFromInput(form.productCost);
  let sellingPrice = numberFromInput(form.sellingPrice);
  const commissionPercentage = numberFromInput(form.commissionPercentage);
  const fixedFee = numberFromInput(form.fixedFee);
  const shippingCost = numberFromInput(form.shippingCost);
  const packagingCost = numberFromInput(form.packagingCost);
  const collectionCost = numberFromInput(form.collectionCost);
  const storageCost = numberFromInput(form.storageCost);
  const operationalCost = numberFromInput(form.operationalCost);
  const taxPercentage = numberFromInput(form.taxPercentage);
  const adTacosPercentage = numberFromInput(form.adTacosPercentage);
  const affiliateCommissionPercentage = numberFromInput(form.affiliateCommissionPercentage);
  const promotionCredit = numberFromInput(form.promotionCredit);
  const totalVariablePercentage = commissionPercentage + taxPercentage + adTacosPercentage + affiliateCommissionPercentage;

  const fixedCosts =
    productCost +
    fixedFee +
    shippingCost +
    packagingCost +
    collectionCost +
    storageCost +
    operationalCost -
    promotionCredit;

  if (mode === "price") {
    const desiredProfitMargin = numberFromInput(form.desiredProfitMargin);
    const variablePercentage = desiredProfitMargin + totalVariablePercentage;
    if (desiredProfitMargin <= 0 || variablePercentage >= 100) return null;
    sellingPrice = fixedCosts / (1 - variablePercentage / 100);
  }

  if (mode === "fixedProfit") {
    const desiredFixedProfit = numberFromInput(form.desiredFixedProfit);
    if (desiredFixedProfit <= 0 || totalVariablePercentage >= 100) return null;
    sellingPrice = (fixedCosts + desiredFixedProfit) / (1 - totalVariablePercentage / 100);
  }

  if (sellingPrice <= 0) return null;

  const commission = sellingPrice * (commissionPercentage / 100);
  const taxes = sellingPrice * (taxPercentage / 100);
  const advertisingInvestment = sellingPrice * (adTacosPercentage / 100);
  const affiliateCommission = sellingPrice * (affiliateCommissionPercentage / 100);
  const totalCosts =
    productCost +
    commission +
    fixedFee +
    shippingCost +
    packagingCost +
    collectionCost +
    storageCost +
    operationalCost +
    advertisingInvestment +
    affiliateCommission +
    taxes;
  const netProfit = sellingPrice - totalCosts + promotionCredit;
  const profitMargin = sellingPrice > 0 ? netProfit / sellingPrice : 0;
  const markup = productCost > 0 ? (netProfit / productCost) * 100 : 0;

  return {
    sellingPrice,
    productCost,
    commission,
    fixedFee,
    shippingCost,
    packagingCost,
    collectionCost,
    storageCost,
    operationalCost,
    taxes,
    advertisingInvestment,
    affiliateCommission,
    promotionCredit,
    totalCosts,
    netProfit,
    profitMargin,
    markup
  };
}

function buildCalculatorCostEntries(
  form: CostCalculatorFormState
): CalculatorCostEntry[] {
  const entries: CalculatorCostEntry[] = [
    {
      label: "Fornecedor",
      category: "product",
      allocation: "per_unit",
      amount: numberFromInput(form.productCost)
    },
    {
      label: "Embalagem",
      category: "packaging",
      allocation: "per_unit",
      amount: numberFromInput(form.packagingCost)
    },
    {
      label: "Coleta",
      category: "inbound_freight",
      allocation: "per_unit",
      amount: numberFromInput(form.collectionCost)
    },
    {
      label: "Armazenagem",
      category: "other",
      allocation: "per_unit",
      amount: numberFromInput(form.storageCost)
    },
    {
      label: "Operacional",
      category: "other",
      allocation: "per_unit",
      amount: numberFromInput(form.operationalCost)
    },
    {
      label: "Imposto",
      category: "tax",
      allocation: "percentage",
      amount: numberFromInput(form.taxPercentage)
    },
    {
      label: CALCULATOR_AD_TACOS_LABEL,
      category: "other",
      allocation: "percentage",
      amount: numberFromInput(form.adTacosPercentage)
    }
  ];

  return entries.filter((entry) => entry.amount > 0);
}

function calculateCostForDetail(cost: SkuCost, sale: SalesDetailSourceRow) {
  if (cost.allocation === "percentage") {
    return sale.grossAmount * (cost.amount / 100);
  }

  if (cost.allocation === "per_order") {
    return cost.amount;
  }

  return sale.quantity * cost.amount;
}

function calculateDetailCostBreakdown(
  sale: SalesDetailSourceRow,
  costs: SkuCost[]
) {
  return costs
    .filter((cost) => cost.sku === sale.sku)
    .reduce(
      (totals, cost) => {
        const amount = calculateCostForDetail(cost, sale);

        if (cost.category === "tax") {
          return { ...totals, taxAmount: totals.taxAmount + amount };
        }

        return { ...totals, costAmount: totals.costAmount + amount };
      },
      { costAmount: 0, taxAmount: 0 }
    );
}

async function readApiPayload<T>(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as T | ApiErrorPayload;
  }

  const text = await response.text();
  return {
    error: text || `Resposta HTTP ${response.status}.`
  } satisfies ApiErrorPayload;
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const errorPayload = payload as ApiErrorPayload;
    const mainMessage = errorPayload.error ?? errorPayload.message ?? fallback;
    const details = [errorPayload.details, errorPayload.hint]
      .filter(Boolean)
      .join(" ");

    return details ? `${mainMessage} ${details}` : mainMessage;
  }

  return fallback;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object") {
    const databaseError = error as DatabaseErrorLike;
    const mainMessage = databaseError.message ?? fallback;
    const details = [databaseError.details, databaseError.hint]
      .filter(Boolean)
      .join(" ");

    return details ? `${mainMessage} ${details}` : mainMessage;
  }

  return fallback;
}

export function DashmarketDashboard() {
  const [supabaseClient] = useState(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  });
  const [selectedProvider, setSelectedProvider] =
    useState<MarketplaceProvider>("mercadolivre");
  const [activeView, setActiveView] = useState<ViewKey>("principal");
  const [skuFilter, setSkuFilter] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [physicalInventorySearch, setPhysicalInventorySearch] = useState("");
  const [physicalInventoryQuantities, setPhysicalInventoryQuantities] =
    useState<Record<string, number>>(() =>
      readStoredPhysicalInventoryQuantities()
    );
  const [costs, setCosts] = useState<SkuCost[]>(costsSeed);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] =
    useState<SupabaseStatus>("checking");
  const [realProducts, setRealProducts] = useState<ProductRow[]>([]);
  const [realSales, setRealSales] = useState<SaleRecord[]>([]);
  const [realSaleDetails, setRealSaleDetails] = useState<SalesDetailSourceRow[]>(
    []
  );
  const [realInventory, setRealInventory] = useState<InventoryDisplayRow[]>([]);
  const [realAdvertising, setRealAdvertising] =
    useState<AdvertisingSpend[]>([]);
  const [listingAnalytics, setListingAnalytics] = useState<
    ListingDailyAnalyticsRow[]
  >([]);
  const [listingAlerts, setListingAlerts] = useState<ListingExposureAlert[]>([]);
  const [productOpportunities, setProductOpportunities] = useState<
    ProductOpportunity[]
  >([]);
  const [realPromotions, setRealPromotions] = useState<PromotionDisplayRow[]>([]);
  const [companyFinanceEntries, setCompanyFinanceEntries] =
    useState<FinanceEntry[]>(() =>
      readStoredFinanceEntries(COMPANY_FINANCE_STORAGE_KEY, companyFinanceSeed)
    );
  const [personalFinanceEntries, setPersonalFinanceEntries] =
    useState<FinanceEntry[]>(() =>
      readStoredFinanceEntries(PERSONAL_FINANCE_STORAGE_KEY, personalFinanceSeed)
    );
  const [personalLoans, setPersonalLoans] =
    useState<LoanEntry[]>(personalLoanSeed);
  const [marketplaceAccounts, setMarketplaceAccounts] = useState<
    MarketplaceAccountRow[]
  >([]);
  const [syncRuns, setSyncRuns] = useState<SyncRunRow[]>([]);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [openAiAnalysis, setOpenAiAnalysis] =
    useState<OpenAiBusinessAnalysis | null>(null);
  const [isGeneratingAiAnalysis, setIsGeneratingAiAnalysis] = useState(false);
  const [isConnectingMarketplace, setIsConnectingMarketplace] = useState(false);
  const [isDiagnosingMarketplace, setIsDiagnosingMarketplace] = useState(false);
  const [isSyncingListings, setIsSyncingListings] = useState(false);
  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [isSyncingInventory, setIsSyncingInventory] = useState(false);
  const [isSyncingAdvertising, setIsSyncingAdvertising] = useState(false);
  const [isSyncingAdAnalysis, setIsSyncingAdAnalysis] = useState(false);
  const [isSearchingOpportunities, setIsSearchingOpportunities] =
    useState(false);
  const [isSyncingPromotions, setIsSyncingPromotions] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncListingsSummary | null>(
    null
  );
  const [ordersSyncSummary, setOrdersSyncSummary] =
    useState<SyncOrdersSummary | null>(null);
  const [inventorySyncSummary, setInventorySyncSummary] =
    useState<SyncInventorySummary | null>(null);
  const [advertisingSyncSummary, setAdvertisingSyncSummary] =
    useState<SyncAdvertisingSummary | null>(null);
  const [adAnalysisSyncSummary, setAdAnalysisSyncSummary] =
    useState<AdAnalysisSyncSummary | null>(null);
  const [promotionsSyncSummary, setPromotionsSyncSummary] =
    useState<SyncPromotionsSummary | null>(null);

  // Pós-venda states
  const [isLoadingReputation, setIsLoadingReputation] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isLoadingClaims, setIsLoadingClaims] = useState(false);
  const [reputation, setReputation] = useState<SellerReputationResponse | null>(null);
  const [questionsData, setQuestionsData] = useState<QuestionsResponse | null>(null);
  const [claimsData, setClaimsData] = useState<ClaimsResponse | null>(null);
  const [posVendaError, setPosVendaError] = useState<string | null>(null);

  // Mapa orderId → status de conciliação MP (carregado ao entrar em "Vendas")
  type ReconciliationStatus = {
    matchStatus: "matched" | "amount_mismatch" | "unmatched";
    amountDifference: number;
    shippingDifference: number;
  };
  const [reconciliationMap, setReconciliationMap] = useState<Map<string, ReconciliationStatus>>(new Map());

  const [marketplaceDiagnostics, setMarketplaceDiagnostics] =
    useState<MercadoLivreDiagnosticsResponse | null>(null);
  const [calculatorMode, setCalculatorMode] =
    useState<CostCalculatorMode>("margin");
  const [selectedPreset, setSelectedPreset] = useState<MarketplacePresetId>("mercado-livre");
  const [calculatorTab, setCalculatorTab] = useState<"calc" | "alerts" | "simulator" | "promo" | "pareto">("calc");
  const [calculatorForm, setCalculatorForm] = useState<CostCalculatorFormState>({
    sku: salesSeed[0].sku,
    name: salesSeed[0].title,
    productCost: "",
    sellingPrice: inputNumber(salesSeed[0].grossRevenue / salesSeed[0].units),
    commissionPercentage: "16",
    fixedFee: "",
    shippingCost: "",
    packagingCost: "",
    collectionCost: "",
    storageCost: "",
    operationalCost: "",
    taxPercentage: "",
    adTacosPercentage: "",
    affiliateCommissionPercentage: "",
    promotionCredit: "",
    desiredProfitMargin: "15",
    desiredFixedProfit: "10",
    validFrom: dateOnly(new Date())
  });
  const [alertThreshold, setAlertThreshold] = useState(15);
  const [promoDiscount, setPromoDiscount] = useState({ type: "percent" as "percent" | "fixed", value: "" });
  const [whatIfSku, setWhatIfSku] = useState("");
  const [whatIfSliders, setWhatIfSliders] = useState({ price: 0, commission: 0, shipping: 0, tax: 0 });
  const [costProductSearch, setCostProductSearch] = useState("");
  const [adAnalysisSearch, setAdAnalysisSearch] = useState("");
  const [adAnalysisTarget, setAdAnalysisTarget] = useState("");
  const [opportunityForm, setOpportunityForm] = useState({
    categoryId: "",
    query: ""
  });
  const [companyFinanceSearch, setCompanyFinanceSearch] = useState("");
  const [personalFinanceSearch, setPersonalFinanceSearch] = useState("");
  const [personalLoanSearch, setPersonalLoanSearch] = useState("");
  const [editingProductSku, setEditingProductSku] = useState<string | null>(
    null
  );
  const [productEditForm, setProductEditForm] = useState({
    sku: "",
    title: ""
  });
  const [hiddenSkus, setHiddenSkus] = useState<string[]>([]);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProductDraft, setNewProductDraft] = useState({ sku: "", name: "" });
  const [productMarketplaces, setProductMarketplaces] = useState<Record<string, string>>(() =>
    readStoredProductMarketplaces()
  );
  const [calculatorResults, setCalculatorResults] = useState<
    Record<string, StoredCalculatorResult>
  >(() => readStoredCalculatorResults());
  const [costMarketplaceFilter, setCostMarketplaceFilter] = useState("all");
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSavingCalculatorCosts, setIsSavingCalculatorCosts] = useState(false);
  const [isResettingCalculatorCosts, setIsResettingCalculatorCosts] =
    useState(false);
  const [salesFilters, setSalesFilters] = useState({
    dateFrom: daysAgo(30),
    dateTo: dateOnly(new Date()),
    sku: "",
    status: "all" as SalesStatusFilter
  });
  const [auditOrderIds, setAuditOrderIds] = useState(
    "2000016368899132\n2000016311935754\n2000016307367738"
  );
  const [auditResults, setAuditResults] = useState<AuditOrdersResponse | null>(
    null
  );
  const [isAuditingOrders, setIsAuditingOrders] = useState(false);
  const [personalFinanceTab, setPersonalFinanceTab] =
    useState<PersonalFinanceTab>("movements");
  const [isSavingCompanyFinance, setIsSavingCompanyFinance] = useState(false);
  const [isSavingPersonalFinance, setIsSavingPersonalFinance] = useState(false);
  const [isSavingLoan, setIsSavingLoan] = useState(false);
  const [editingCompanyFinanceId, setEditingCompanyFinanceId] =
    useState<string | null>(null);
  const [editingPersonalFinanceId, setEditingPersonalFinanceId] =
    useState<string | null>(null);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [companyFinanceForm, setCompanyFinanceForm] = useState({
    title: "",
    category: "Operacional",
    type: "expense" as FinanceEntryType,
    amount: "",
    dueDate: dateOnly(new Date()),
    paidAt: "",
    status: "pending" as FinanceEntryStatus,
    paymentMethod: "PIX",
    notes: ""
  });
  const [personalFinanceForm, setPersonalFinanceForm] = useState({
    title: "",
    category: "Casa",
    type: "expense" as FinanceEntryType,
    amount: "",
    dueDate: dateOnly(new Date()),
    paidAt: "",
    status: "pending" as FinanceEntryStatus,
    paymentMethod: "Banco",
    notes: ""
  });
  const [personalLoanForm, setPersonalLoanForm] = useState({
    direction: "lent" as LoanDirection,
    personName: "",
    description: "",
    principalAmount: "",
    paidAmount: "",
    interestRate: "",
    startDate: dateOnly(new Date()),
    dueDate: addDays(30),
    status: "active" as LoanStatus,
    notes: ""
  });

  const shouldUseDemoData = supabaseStatus !== "connected";
  const activeSales = shouldUseDemoData ? salesSeed : realSales;
  const activeAdvertising =
    shouldUseDemoData ? adSpendSeed : realAdvertising;
  const activeProductSkus = useMemo(
    () =>
      new Set(
        [
          ...realProducts
            .filter((product) => product.status === "active")
            .map((product) => product.internal_sku),
          ...activeSales.map((sale) => sale.sku)
        ].filter(Boolean)
      ),
    [activeSales, realProducts]
  );
  const displayInventoryRows =
    shouldUseDemoData
      ? inventoryRows
      : realInventory.filter(
          (row) =>
            activeProductSkus.has(row.sku) && isFullInventoryChannel(row.channel)
        );
  const displayPromotionRows =
    shouldUseDemoData ? promotionRows : realPromotions;
  const filteredListingAnalytics = useMemo(() => {
    const query = normalizeSearchText(adAnalysisSearch);

    if (!query) return listingAnalytics;

    return listingAnalytics.filter((row) =>
      [
        row.title,
        row.sku,
        row.externalItemId,
        row.categoryName ?? "",
        row.categoryId ?? ""
      ].some((value) => normalizeSearchText(value).includes(query))
    );
  }, [adAnalysisSearch, listingAnalytics]);
  const filteredProductOpportunities = useMemo(() => {
    const query = normalizeSearchText(opportunityForm.query);

    if (!query) return productOpportunities;

    return productOpportunities.filter((row) =>
      [row.title, row.categoryName ?? "", row.sellerName ?? ""].some((value) =>
        normalizeSearchText(value).includes(query)
      )
    );
  }, [opportunityForm.query, productOpportunities]);
  const adAnalysisTotals = useMemo(
    () =>
      listingAnalytics.reduce(
        (totals, row) => ({
          alerts: listingAlerts.length,
          competitors: totals.competitors + row.competitorCount,
          indexed: totals.indexed + (row.listingPosition ? 1 : 0),
          listings: totals.listings + 1,
          visits: totals.visits + row.visits,
          previousVisits: totals.previousVisits + row.previousVisits
        }),
        {
          alerts: listingAlerts.length,
          competitors: 0,
          indexed: 0,
          listings: 0,
          visits: 0,
          previousVisits: 0
        }
      ),
    [listingAlerts.length, listingAnalytics]
  );
  const adVisitChangeRate =
    adAnalysisTotals.previousVisits > 0
      ? (adAnalysisTotals.visits - adAnalysisTotals.previousVisits) /
        adAnalysisTotals.previousVisits
      : adAnalysisTotals.visits > 0
        ? 1
        : 0;

  // Funil de Visitas → Conversão: cruza listingAnalytics (visits + estimatedSoldQuantity)
  // com activeSales (vendas reais confirmadas por SKU) para comparar taxa estimada vs real.
  const conversionFunnel = useMemo(() => {
    const salesBySku = new Map<string, number>();
    for (const sale of activeSales) {
      if (!sale.sku) continue;
      salesBySku.set(sale.sku, (salesBySku.get(sale.sku) ?? 0) + sale.units);
    }

    // Agrupar por SKU / externalItemId para consolidar múltiplas datas de captura
    const byItem = new Map<string, {
      sku: string;
      externalItemId: string;
      title: string;
      visits: number;
      estimatedSold: number;
      realSold: number;
      permalink: string | null | undefined;
    }>();

    for (const row of listingAnalytics) {
      const key = row.sku || row.externalItemId;
      const existing = byItem.get(key);
      if (existing) {
        existing.visits += row.visits;
        existing.estimatedSold += row.estimatedSoldQuantity;
      } else {
        byItem.set(key, {
          sku: row.sku,
          externalItemId: row.externalItemId,
          title: row.title,
          visits: row.visits,
          estimatedSold: row.estimatedSoldQuantity,
          realSold: salesBySku.get(row.sku) ?? 0,
          permalink: row.permalink
        });
      }
    }

    return Array.from(byItem.values())
      .map((item) => ({
        ...item,
        realConversionRate: item.visits > 0 ? item.realSold / item.visits : 0,
        estimatedConversionRate: item.visits > 0 ? item.estimatedSold / item.visits : 0
      }))
      .sort((a, b) => b.visits - a.visits);
  }, [listingAnalytics, activeSales]);
  const productOptions = useMemo(
    () => {
      const optionsBySku = new Map<string, { sku: string; title: string }>();

      for (const sale of activeSales) {
        if (!sale.sku) continue;
        optionsBySku.set(sale.sku, {
          sku: sale.sku,
          title: sale.title || sale.sku
        });
      }

      for (const product of realProducts) {
        // Inclui produtos com anuncio pausado no ML (status "paused"): a
        // Calculadora de Custos serve para qualquer SKU do vendedor, nao so os
        // com anuncio ativo. Apenas arquivados ficam de fora.
        if (product.status === "archived" || !product.internal_sku) continue;
        optionsBySku.set(product.internal_sku, {
          sku: product.internal_sku,
          title: product.title || product.internal_sku
        });
      }

      return Array.from(optionsBySku.values())
        .filter((product) => !hiddenSkus.includes(product.sku))
        .sort((current, next) => current.title.localeCompare(next.title, "pt-BR"));
    },
    [activeSales, hiddenSkus, realProducts]
  );
  const calculatorManagedSkuSet = useMemo(
    () =>
      new Set(
        costs.filter(isCalculatorManagedCost).map((cost) => cost.sku)
      ),
    [costs]
  );
  const hasCalculatorManagedCosts = calculatorManagedSkuSet.size > 0;
  const calculatedProductOptions = useMemo(() => {
    return productOptions.filter((product) =>
      calculatorManagedSkuSet.has(product.sku)
    );
  }, [calculatorManagedSkuSet, productOptions]);

  useEffect(() => {
    if (selectedProvider !== "mercadolivre") {
      setSelectedProvider("mercadolivre");
    }
  }, [selectedProvider]);

  useEffect(() => {
    if (productOptions.length === 0) return;

    setCalculatorForm((current) => {
      // Só inicializa automaticamente se não há SKU algum no form.
      // Nunca sobrescreve um SKU já definido (ex: importado de uma venda),
      // mesmo que ele ainda não apareça em productOptions.
      if (current.sku) return current;

      return {
        ...current,
        sku: productOptions[0].sku,
        name: productOptions[0].title
      };
    });
  }, [productOptions]);

  useEffect(() => {
    writeStoredPhysicalInventoryQuantities(physicalInventoryQuantities);
  }, [physicalInventoryQuantities]);

  useEffect(() => {
    writeStoredProductMarketplaces(productMarketplaces);
  }, [productMarketplaces]);

  useEffect(() => {
    writeStoredCalculatorResults(calculatorResults);
  }, [calculatorResults]);

  const selectedAdapter = getMarketplaceAdapter(selectedProvider);
  const mercadoLivreAccount = marketplaceAccounts.find(
    (account) =>
      account.provider === "mercadolivre" &&
      (account.status === "connected" || account.status === "expired")
  );
  const mercadoLivreConnected = mercadoLivreAccount?.status === "connected";
  const isMarketplaceWorkspaceReady =
    supabaseStatus === "connected" && Boolean(organization);
  const isSyncingMarketplace =
    isSyncingListings ||
    isSyncingOrders ||
    isSyncingInventory ||
    isSyncingAdvertising ||
    isSyncingAdAnalysis ||
    isSearchingOpportunities ||
    isSyncingPromotions;
  const isMarketplaceActionDisabled =
    !isMarketplaceWorkspaceReady || isSyncingMarketplace;
  const isMarketplaceConnectDisabled =
    !isMarketplaceWorkspaceReady ||
    isConnectingMarketplace ||
    Boolean(mercadoLivreAccount && isSyncingMarketplace);
  const marketplaceConnectionHint =
    supabaseStatus === "checking"
      ? "Aguarde a sessao carregar para conectar o Mercado Livre."
      : supabaseStatus !== "connected"
        ? "Entre no DASHMARKET para conectar o Mercado Livre."
        : !organization
          ? "Usuario autenticado, mas sem empresa vinculada."
          : null;
  const marketplaceSkuActionLabel = isConnectingMarketplace
    ? "Conectando"
    : isSyncingListings
      ? "Sincronizando"
      : mercadoLivreConnected
        ? "Sincronizar SKUs"
        : "Conectar Mercado Livre";
  const marginRows = useMemo(
    () => calculateContributionMargins(activeSales, costs, activeAdvertising),
    [activeAdvertising, activeSales, costs]
  );
  const inventoryValuationRows = useMemo<InventoryValuationRow[]>(() => {
    const salesBySku = new Map(activeSales.map((sale) => [sale.sku, sale]));
    const productsBySku = new Map(
      productOptions.map((product) => [product.sku, product.title])
    );

    return displayInventoryRows.map((row) => {
      const sale = salesBySku.get(row.sku);
      const totalQuantity = row.available + row.reserved + row.notAvailable;
      const {
        hasPricing,
        unitSalePrice,
        unitMarketplaceFee,
        unitSellerShippingCost,
        unitNetValue
      } = inventoryUnitValuesFromSale(sale);

      return {
        ...row,
        title: sale?.title ?? productsBySku.get(row.sku) ?? "Produto sem venda recente",
        totalQuantity,
        unitSalePrice,
        unitMarketplaceFee,
        unitSellerShippingCost,
        unitNetValue,
        investedValue: totalQuantity * unitNetValue,
        hasPricing
      };
    });
  }, [activeSales, displayInventoryRows, productOptions]);
  const inventoryValuationTotals = useMemo(() => {
    const fullRows = inventoryValuationRows.filter(
      (row) => row.channel.toLowerCase() === "full"
    );

    return {
      skuCount: inventoryValuationRows.length,
      fullSkuCount: fullRows.length,
      totalQuantity: inventoryValuationRows.reduce(
        (total, row) => total + row.totalQuantity,
        0
      ),
      availableQuantity: inventoryValuationRows.reduce(
        (total, row) => total + row.available,
        0
      ),
      fullInvestedValue: fullRows.reduce(
        (total, row) => total + row.investedValue,
        0
      ),
      investedValue: inventoryValuationRows.reduce(
        (total, row) => total + row.investedValue,
        0
      )
    };
  }, [inventoryValuationRows]);
  const physicalInventoryRows = useMemo<PhysicalInventoryRow[]>(() => {
    const salesBySku = new Map(activeSales.map((sale) => [sale.sku, sale]));

    return productOptions.map((product) => {
      const sale = salesBySku.get(product.sku);
      const {
        hasPricing,
        unitSalePrice,
        unitMarketplaceFee,
        unitSellerShippingCost,
        unitNetValue
      } = inventoryUnitValuesFromSale(sale);
      const quantity = physicalInventoryQuantities[product.sku] ?? 0;

      return {
        sku: product.sku,
        title: product.title,
        quantity,
        unitSalePrice,
        unitMarketplaceFee,
        unitSellerShippingCost,
        unitNetValue,
        grossValue: quantity * unitSalePrice,
        marketplaceFeeValue: quantity * unitMarketplaceFee,
        sellerShippingValue: quantity * unitSellerShippingCost,
        netValue: quantity * unitNetValue,
        hasPricing
      };
    });
  }, [activeSales, physicalInventoryQuantities, productOptions]);
  const filteredPhysicalInventoryRows = useMemo(() => {
    const query = normalizeSearchText(physicalInventorySearch);
    if (!query) return physicalInventoryRows;

    return physicalInventoryRows.filter((row) =>
      [row.sku, row.title].some((value) =>
        normalizeSearchText(value).includes(query)
      )
    );
  }, [physicalInventoryRows, physicalInventorySearch]);
  const physicalInventoryTotals = useMemo(
    () =>
      physicalInventoryRows.reduce(
        (totals, row) => ({
          skuCount: totals.skuCount + (row.quantity > 0 ? 1 : 0),
          pricedSkuCount:
            totals.pricedSkuCount + (row.quantity > 0 && row.hasPricing ? 1 : 0),
          totalQuantity: totals.totalQuantity + row.quantity,
          grossValue: totals.grossValue + row.grossValue,
          marketplaceFeeValue:
            totals.marketplaceFeeValue + row.marketplaceFeeValue,
          sellerShippingValue:
            totals.sellerShippingValue + row.sellerShippingValue,
          netValue: totals.netValue + row.netValue
        }),
        {
          skuCount: 0,
          pricedSkuCount: 0,
          totalQuantity: 0,
          grossValue: 0,
          marketplaceFeeValue: 0,
          sellerShippingValue: 0,
          netValue: 0
        }
      ),
    [physicalInventoryRows]
  );
  const salesDetailSources = useMemo(
    () =>
      !shouldUseDemoData
        ? realSaleDetails
        : salesSeed.map((sale, index) => ({
            id: `demo-sale-${sale.sku}`,
            orderId: `DEMO-${index + 1}`,
            externalItemId: sale.sku,
            title: sale.title,
            sku: sale.sku,
            soldAt: new Date().toISOString(),
            status: "paid",
            unitPrice: sale.units > 0 ? sale.grossRevenue / sale.units : 0,
            quantity: sale.units,
            grossAmount: sale.grossRevenue,
            marketplaceFee: sale.marketplaceFees,
            shippingBuyer: 0,
            shippingSeller: sale.shippingCosts,
            discountAmount: sale.discounts,
            orderTaxAmount: sale.taxes
          })),
    [realSaleDetails, shouldUseDemoData]
  );
  const salesDetailRows = useMemo<SalesDetailRow[]>(
    () =>
      salesDetailSources
        .map((sale) => {
          const { costAmount, taxAmount } = calculateDetailCostBreakdown(
            sale,
            costs
          );
          const totalTaxAmount = sale.orderTaxAmount + taxAmount;
          const contributionMargin =
            sale.grossAmount -
          sale.discountAmount -
          sale.marketplaceFee -
          sale.shippingSeller -
          costAmount -
          totalTaxAmount;

          return {
            ...sale,
            costAmount,
            taxAmount: totalTaxAmount,
            contributionMargin,
            marginRate:
              sale.grossAmount > 0 ? contributionMargin / sale.grossAmount : 0
          };
        })
        .sort(
          (current, next) =>
            new Date(next.soldAt).getTime() - new Date(current.soldAt).getTime()
        ),
    [costs, salesDetailSources]
  );
  const salesDateAndSearchRows = useMemo(() => {
    const query = salesFilters.sku.trim().toLowerCase();

    return salesDetailRows.filter((sale) => {
      const soldDate = dateKeyInSaoPaulo(sale.soldAt);
      const matchesDate =
        (!salesFilters.dateFrom || soldDate >= salesFilters.dateFrom) &&
        (!salesFilters.dateTo || soldDate <= salesFilters.dateTo);
      const matchesSku =
        !query ||
        sale.sku.toLowerCase().includes(query) ||
        sale.title.toLowerCase().includes(query) ||
        sale.externalItemId.toLowerCase().includes(query) ||
        sale.orderId.toLowerCase().includes(query);

      return matchesDate && matchesSku;
    });
  }, [salesDetailRows, salesFilters.dateFrom, salesFilters.dateTo, salesFilters.sku]);
  const filteredSalesDetailRows = useMemo(() => {
    if (salesFilters.status === "all") return salesDateAndSearchRows;

    return salesDateAndSearchRows.filter(
      (sale) => orderStatusGroup(sale.status) === salesFilters.status
    );
  }, [salesDateAndSearchRows, salesFilters.status]);
  const salesStatusTotals = useMemo(() => {
    const totals = {
      approved: {
        amount: 0,
        orders: new Set<string>(),
        quantity: 0
      },
      cancelled: {
        amount: 0,
        orders: new Set<string>(),
        quantity: 0
      },
      other: {
        amount: 0,
        orders: new Set<string>(),
        quantity: 0
      }
    } satisfies Record<
      SalesStatusGroup,
      { amount: number; orders: Set<string>; quantity: number }
    >;

    for (const sale of salesDateAndSearchRows) {
      const group = orderStatusGroup(sale.status);
      // Subtrai desconto (cupons ML, promoções) para alinhar com o
      // "Faturamento" exibido no painel do Mercado Livre (= total_amount)
      totals[group].amount += sale.grossAmount - sale.discountAmount;
      totals[group].orders.add(sale.orderId);
      totals[group].quantity += sale.quantity;
    }

    return {
      approved: {
        amount: totals.approved.amount,
        orders: totals.approved.orders.size,
        quantity: totals.approved.quantity
      },
      cancelled: {
        amount: totals.cancelled.amount,
        orders: totals.cancelled.orders.size,
        quantity: totals.cancelled.quantity
      },
      other: {
        amount: totals.other.amount,
        orders: totals.other.orders.size,
        quantity: totals.other.quantity
      }
    };
  }, [salesDateAndSearchRows]);
  const salesDetailTotals = useMemo(
    () =>
      filteredSalesDetailRows.reduce(
        (totals, sale) =>
          isApprovedOrderStatus(sale.status)
            ? {
                grossAmount: totals.grossAmount + (sale.grossAmount - sale.discountAmount),
                costAmount: totals.costAmount + sale.costAmount,
                taxAmount: totals.taxAmount + sale.taxAmount,
                marketplaceFee: totals.marketplaceFee + sale.marketplaceFee,
                shippingBuyer: totals.shippingBuyer + sale.shippingBuyer,
                shippingSeller: totals.shippingSeller + sale.shippingSeller,
                contributionMargin:
                  totals.contributionMargin + sale.contributionMargin,
                quantity: totals.quantity + sale.quantity,
                orders: totals.orders + 1
              }
            : totals,
        {
          grossAmount: 0,
          costAmount: 0,
          taxAmount: 0,
          marketplaceFee: 0,
          shippingBuyer: 0,
          shippingSeller: 0,
          contributionMargin: 0,
          quantity: 0,
          orders: 0
        }
      ),
    [filteredSalesDetailRows]
  );

  const totals = marginRows.reduce(
    (acc, row) => ({
      grossRevenue: acc.grossRevenue + row.grossRevenue,
      netRevenue: acc.netRevenue + row.netRevenue,
      marketplaceFees: acc.marketplaceFees + row.marketplaceFees,
      shippingCosts: acc.shippingCosts + row.shippingCosts,
      discounts: acc.discounts + row.discounts,
      skuCosts: acc.skuCosts + row.skuCosts,
      advertisingCosts: acc.advertisingCosts + row.advertisingCosts,
      contributionMargin: acc.contributionMargin + row.contributionMargin,
      units: acc.units + row.units
    }),
    {
      grossRevenue: 0,
      netRevenue: 0,
      marketplaceFees: 0,
      shippingCosts: 0,
      discounts: 0,
      skuCosts: 0,
      advertisingCosts: 0,
      contributionMargin: 0,
      units: 0
    }
  );

  const marginRate =
    totals.netRevenue > 0 ? totals.contributionMargin / totals.netRevenue : 0;

  const productUnitRows = useMemo<ProductUnitRow[]>(
    () =>
      calculatedProductOptions
        .map((product) => {
          const sale = activeSales.find((record) => record.sku === product.sku);
          const productCosts = costs.filter((cost) => cost.sku === product.sku);
          const units = sale?.units ?? 0;
          const orders = sale?.orders ?? 0;
          const grossRevenue = sale?.grossRevenue ?? 0;
          const averagePrice = units > 0 ? grossRevenue / units : 0;
          const unitsPerOrder = units > 0 && orders > 0 ? units / orders : 1;
          const costUnitAmount = (cost: SkuCost) => {
            if (cost.allocation === "percentage") {
              return averagePrice * (cost.amount / 100);
            }

            if (cost.allocation === "per_order") {
              return unitsPerOrder > 0 ? cost.amount / unitsPerOrder : cost.amount;
            }

            return cost.amount;
          };
          const sumCosts = (predicate: (cost: SkuCost) => boolean) =>
            productCosts
              .filter(predicate)
              .reduce((total, cost) => total + costUnitAmount(cost), 0);
          const productCostUnit = sumCosts((cost) => cost.category === "product");
          const packagingCostUnit = sumCosts(
            (cost) => cost.category === "packaging"
          );
          const inboundFreightUnit = sumCosts(
            (cost) => cost.category === "inbound_freight"
          );
          const marketplaceFixedUnit = sumCosts(
            (cost) => cost.category === "marketplace_fixed"
          );
          const manualAdvertisingUnit = sumCosts(
            (cost) => cost.label === CALCULATOR_AD_TACOS_LABEL
          );
          const otherCostUnit = sumCosts(
            (cost) =>
              cost.category === "other" &&
              cost.label !== CALCULATOR_AD_TACOS_LABEL
          );
          const registeredTaxUnit = sumCosts((cost) => cost.category === "tax");
          const saleTaxUnit = units > 0 ? (sale?.taxes ?? 0) / units : 0;
          const taxUnit = registeredTaxUnit + saleTaxUnit;
          const discountUnit = units > 0 ? (sale?.discounts ?? 0) / units : 0;
          const marketplaceFeeUnit =
            units > 0 ? (sale?.marketplaceFees ?? 0) / units : 0;
          const shippingSellerUnit =
            units > 0 ? (sale?.shippingCosts ?? 0) / units : 0;
          const advertisingRecords = activeAdvertising.filter(
            (record) => record.sku === product.sku
          );
          const advertisingAmount = advertisingRecords.reduce(
            (total, record) => total + record.amount,
            0
          );
          const attributedRevenue = advertisingRecords.reduce(
            (total, record) => total + record.attributedRevenue,
            0
          );
          const advertisingUnit = units > 0 ? advertisingAmount / units : 0;
          const tacosRate =
            grossRevenue > 0 ? advertisingAmount / grossRevenue : 0;
          const acosRate =
            attributedRevenue > 0 ? advertisingAmount / attributedRevenue : 0;
          const manualTacosRate =
            averagePrice > 0 ? manualAdvertisingUnit / averagePrice : 0;
          const totalCostUnit =
            discountUnit +
            productCostUnit +
            packagingCostUnit +
            inboundFreightUnit +
            marketplaceFixedUnit +
            otherCostUnit +
            taxUnit +
            marketplaceFeeUnit +
            shippingSellerUnit +
            manualAdvertisingUnit;
          const hasSales = units > 0 && averagePrice > 0;
          const contributionMarginUnit = hasSales
            ? averagePrice - totalCostUnit
            : 0;

          return {
            sku: product.sku,
            title: product.title,
            units,
            orders,
            grossRevenue,
            averagePrice,
            discountUnit,
            productCostUnit,
            packagingCostUnit,
            inboundFreightUnit,
            marketplaceFixedUnit,
            otherCostUnit,
            taxUnit,
            marketplaceFeeUnit,
            shippingSellerUnit,
            advertisingAmount,
            advertisingUnit,
            manualAdvertisingUnit,
            manualTacosRate,
            attributedRevenue,
            acosRate,
            tacosRate,
            totalCostUnit,
            contributionMarginUnit,
            contributionMarginRate:
              averagePrice > 0 ? contributionMarginUnit / averagePrice : 0,
            hasSales
          };
        })
        .sort(
          (current, next) =>
            next.contributionMarginUnit - current.contributionMarginUnit
        ),
    [activeAdvertising, activeSales, calculatedProductOptions, costs]
  );

  const filteredProductUnitRows = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    return productUnitRows.filter(
      (product) =>
        !query ||
        product.sku.toLowerCase().includes(query) ||
        product.title.toLowerCase().includes(query)
    );
  }, [productSearch, productUnitRows]);

  const productUnitTotals = useMemo(
    () =>
      productUnitRows.reduce(
        (totals, product) => ({
          products: totals.products + 1,
          productsWithSales: totals.productsWithSales + (product.hasSales ? 1 : 0),
          productsWithCosts:
            totals.productsWithCosts + (product.totalCostUnit > 0 ? 1 : 0),
          units: totals.units + product.units,
          grossRevenue: totals.grossRevenue + product.grossRevenue,
          averagePriceTotal:
            totals.averagePriceTotal + (product.hasSales ? product.averagePrice : 0),
          advertisingAmount: totals.advertisingAmount + product.advertisingAmount,
          attributedRevenue:
            totals.attributedRevenue + product.attributedRevenue,
          totalCosts: totals.totalCosts + product.totalCostUnit,
          contributionMargin:
            totals.contributionMargin +
            (product.hasSales ? product.contributionMarginUnit : 0)
        }),
        {
          products: 0,
          productsWithSales: 0,
          productsWithCosts: 0,
          units: 0,
          grossRevenue: 0,
          averagePriceTotal: 0,
          advertisingAmount: 0,
          attributedRevenue: 0,
          totalCosts: 0,
          contributionMargin: 0
        }
      ),
    [productUnitRows]
  );

  const aiSalesTrend = useMemo(() => {
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - 30);
    const previousStart = new Date(now);
    previousStart.setDate(now.getDate() - 60);

    const summarize = (rows: SalesDetailRow[]): AiSalesWindow =>
      rows.reduce(
        (totals, sale) => ({
          grossAmount: totals.grossAmount + sale.grossAmount,
          contributionMargin:
            totals.contributionMargin + sale.contributionMargin,
          marginRate: 0,
          orders: totals.orders + 1,
          quantity: totals.quantity + sale.quantity
        }),
        {
          grossAmount: 0,
          contributionMargin: 0,
          marginRate: 0,
          orders: 0,
          quantity: 0
        }
      );

    const currentRows = salesDetailRows.filter(
      (sale) => new Date(sale.soldAt).getTime() >= currentStart.getTime()
    );
    const previousRows = salesDetailRows.filter((sale) => {
      const soldAt = new Date(sale.soldAt).getTime();
      return soldAt >= previousStart.getTime() && soldAt < currentStart.getTime();
    });
    const current = summarize(currentRows);
    const previous = summarize(previousRows);
    current.marginRate =
      current.grossAmount > 0 ? current.contributionMargin / current.grossAmount : 0;
    previous.marginRate =
      previous.grossAmount > 0
        ? previous.contributionMargin / previous.grossAmount
        : 0;

    return {
      current,
      previous,
      marginDelta:
        previous.grossAmount > 0 ? current.marginRate - previous.marginRate : null,
      revenueDelta:
        previous.grossAmount > 0
          ? current.grossAmount / previous.grossAmount - 1
          : null
    };
  }, [salesDetailRows]);

  const aiAdsMetrics = useMemo(() => {
    const adSpend = productUnitTotals.advertisingAmount;
    const attributedRevenue = productUnitTotals.attributedRevenue;
    const tacos = totals.grossRevenue > 0 ? adSpend / totals.grossRevenue : 0;
    const acos = attributedRevenue > 0 ? adSpend / attributedRevenue : 0;
    const payback = adSpend > 0 ? attributedRevenue / adSpend : 0;

    if (adSpend <= 0) {
      return {
        adSpend,
        attributedRevenue,
        tacos,
        acos,
        payback,
        verdict: "Sem investimento em ADS",
        recommendation:
          "Comece com testes pequenos nos SKUs com boa margem e estoque saudavel.",
        severity: "info" as AiInsightSeverity
      };
    }

    if (attributedRevenue <= 0) {
      return {
        adSpend,
        attributedRevenue,
        tacos,
        acos,
        payback,
        verdict: "ADS sem retorno atribuido",
        recommendation:
          "Revise campanhas, palavras e SKUs antes de aumentar orçamento.",
        severity: "critical" as AiInsightSeverity
      };
    }

    if (tacos > marginRate) {
      return {
        adSpend,
        attributedRevenue,
        tacos,
        acos,
        payback,
        verdict: "ADS pode estar consumindo margem",
        recommendation:
          "Reduza verba nos SKUs com TACOS alto e proteja campanhas dos produtos rentaveis.",
        severity: "critical" as AiInsightSeverity
      };
    }

    if (tacos > marginRate * 0.55) {
      return {
        adSpend,
        attributedRevenue,
        tacos,
        acos,
        payback,
        verdict: "ADS exige controle de orçamento",
        recommendation:
          "Mantenha o investimento, mas acompanhe TACOS por SKU antes de escalar.",
        severity: "warning" as AiInsightSeverity
      };
    }

    return {
      adSpend,
      attributedRevenue,
      tacos,
      acos,
      payback,
      verdict: "ADS saudavel para a margem atual",
      recommendation:
        "Considere aumentar gradualmente nos SKUs com margem positiva e estoque disponivel.",
      severity: "positive" as AiInsightSeverity
    };
  }, [
    marginRate,
    productUnitTotals.advertisingAmount,
    productUnitTotals.attributedRevenue,
    totals.grossRevenue
  ]);

  const aiSkuPriorities = useMemo<AiSkuPriority[]>(() => {
    const severityRank: Record<AiInsightSeverity, number> = {
      critical: 3,
      warning: 2,
      info: 1,
      positive: 0
    };

    return productUnitRows
      .filter((product) => product.hasSales)
      .map((product) => {
        if (product.contributionMarginUnit < 0) {
          return {
            sku: product.sku,
            title: product.title,
            issue: "Margem negativa",
            recommendation:
              "Recalcule preço, taxa, frete e custo antes de investir mais.",
            metric: formatCurrency.format(product.contributionMarginUnit),
            severity: "critical" as AiInsightSeverity,
            grossRevenue: product.grossRevenue
          };
        }

        if (product.advertisingAmount > 0 && product.attributedRevenue <= 0) {
          return {
            sku: product.sku,
            title: product.title,
            issue: "ADS sem receita atribuida",
            recommendation:
              "Pausar ou revisar campanha ate recuperar atribuição de receita.",
            metric: formatCurrency.format(product.advertisingAmount),
            severity: "warning" as AiInsightSeverity,
            grossRevenue: product.grossRevenue
          };
        }

        if (product.tacosRate > marginRate && product.advertisingAmount > 0) {
          return {
            sku: product.sku,
            title: product.title,
            issue: "TACOS acima da margem média",
            recommendation:
              "Baixe a verba ou ajuste lances enquanto testa preço e conversão.",
            metric: formatPercent(product.tacosRate),
            severity: "warning" as AiInsightSeverity,
            grossRevenue: product.grossRevenue
          };
        }

        if (product.contributionMarginRate < 0.12) {
          return {
            sku: product.sku,
            title: product.title,
            issue: "Margem baixa",
            recommendation:
              "Priorize revisão de custo, imposto e taxa antes de ganhar volume.",
            metric: formatPercent(product.contributionMarginRate),
            severity: "warning" as AiInsightSeverity,
            grossRevenue: product.grossRevenue
          };
        }

        return {
          sku: product.sku,
          title: product.title,
          issue: "SKU saudável",
          recommendation:
            "Pode receber mais atenção comercial se houver estoque suficiente.",
          metric: formatPercent(product.contributionMarginRate),
          severity: "positive" as AiInsightSeverity,
          grossRevenue: product.grossRevenue
        };
      })
      .sort(
        (current, next) =>
          severityRank[next.severity] - severityRank[current.severity] ||
          next.grossRevenue - current.grossRevenue
      )
      .slice(0, 6);
  }, [marginRate, productUnitRows]);

  const aiBusinessScore = useMemo(() => {
    let score = 100;

    if (totals.contributionMargin < 0) score -= 32;
    else if (marginRate < 0.12) score -= 24;
    else if (marginRate < 0.22) score -= 12;

    if (aiAdsMetrics.severity === "critical") score -= 18;
    if (aiAdsMetrics.severity === "warning") score -= 9;

    if (aiSalesTrend.marginDelta !== null && aiSalesTrend.marginDelta < -0.03) {
      score -= 14;
    }

    if (
      totals.netRevenue > 0 &&
      inventoryValuationTotals.fullInvestedValue > totals.netRevenue * 0.8
    ) {
      score -= 8;
    }

    const riskySkus = aiSkuPriorities.filter(
      (priority) =>
        priority.severity === "critical" || priority.severity === "warning"
    ).length;
    score -= Math.min(riskySkus * 4, 16);

    return clampNumber(Math.round(score), 0, 100);
  }, [
    aiAdsMetrics.severity,
    aiSalesTrend.marginDelta,
    aiSkuPriorities,
    inventoryValuationTotals.fullInvestedValue,
    marginRate,
    totals.contributionMargin,
    totals.netRevenue
  ]);

  const aiInsights = useMemo<AiInsight[]>(() => {
    const insights: AiInsight[] = [];

    insights.push({
      id: "margin",
      title:
        marginRate < 0.12
          ? "Lucratividade em zona de risco"
          : marginRate < 0.22
            ? "Margem pede acompanhamento"
            : "Margem geral saudavel",
      summary:
        marginRate < 0.12
          ? "A margem de contribuição está baixa para absorver variações de frete, imposto e ADS."
          : marginRate < 0.22
            ? "A operação está positiva, mas ainda sensível a aumento de custos e mídia."
            : "A operação tem espaço para crescer sem perder controle de margem.",
      recommendation:
        marginRate < 0.12
          ? "Comece pelos SKUs com maior receita e menor margem antes de escalar vendas."
          : marginRate < 0.22
            ? "Monitore os SKUs com TACOS alto e mantenha custo unitario atualizado."
            : "Use a margem atual para testar crescimento nos produtos com estoque."
,
      severity:
        marginRate < 0.12
          ? "critical"
          : marginRate < 0.22
            ? "warning"
            : "positive",
      metricLabel: "Margem",
      metricValue: formatPercent(marginRate)
    });

    insights.push({
      id: "ads",
      title: aiAdsMetrics.verdict,
      summary: `Investimento de ${formatCurrency.format(
        aiAdsMetrics.adSpend
      )} com receita atribuida de ${formatCurrency.format(
        aiAdsMetrics.attributedRevenue
      )}.`,
      recommendation: aiAdsMetrics.recommendation,
      severity: aiAdsMetrics.severity,
      metricLabel: "TACOS",
      metricValue: formatPercent(aiAdsMetrics.tacos)
    });

    insights.push({
      id: "trend",
      title:
        aiSalesTrend.marginDelta === null
          ? "Historico ainda insuficiente"
          : aiSalesTrend.marginDelta < -0.03
            ? "Lucratividade em queda"
            : aiSalesTrend.marginDelta > 0.03
              ? "Lucratividade em alta"
              : "Lucratividade estavel",
      summary:
        aiSalesTrend.marginDelta === null
          ? "Ainda não há base anterior suficiente para comparar os ultimos 30 dias."
          : `A margem dos ultimos 30 dias variou ${formatPercent(
              aiSalesTrend.marginDelta
            )} contra os 30 dias anteriores.`,
      recommendation:
        aiSalesTrend.marginDelta === null
          ? "Depois de novas sincronizacoes, esta leitura passa a indicar queda ou melhora."
          : aiSalesTrend.marginDelta < -0.03
            ? "Compare taxas, frete, descontos e ADS dos SKUs de maior faturamento."
            : aiSalesTrend.marginDelta > 0.03
              ? "Identifique os SKUs que puxaram a melhora e replique a estratégia."
              : "Mantenha rotina de conferência semanal para detectar queda cedo.",
      severity:
        aiSalesTrend.marginDelta === null
          ? "info"
          : aiSalesTrend.marginDelta < -0.03
            ? "warning"
            : aiSalesTrend.marginDelta > 0.03
              ? "positive"
              : "info",
      metricLabel: "Tendência",
      metricValue:
        aiSalesTrend.marginDelta === null
          ? "Sem base"
          : formatPercent(aiSalesTrend.marginDelta)
    });

    insights.push({
      id: "stock",
      title: "Capital parado no Full",
      summary: `O estoque Full representa ${formatCurrency.format(
        inventoryValuationTotals.fullInvestedValue
      )} em valor liquido estimado.`,
      recommendation:
        inventoryValuationTotals.fullInvestedValue > totals.netRevenue * 0.8
          ? "Revise giro por SKU antes de recompor estoque ou subir verba de ADS."
          : "Use o estoque Full como base para priorizar campanhas dos SKUs rentaveis.",
      severity:
        inventoryValuationTotals.fullInvestedValue > totals.netRevenue * 0.8
          ? "warning"
          : "info",
      metricLabel: "Full",
      metricValue: formatCurrency.format(inventoryValuationTotals.fullInvestedValue)
    });

    return insights;
  }, [
    aiAdsMetrics,
    aiSalesTrend.marginDelta,
    inventoryValuationTotals.fullInvestedValue,
    marginRate,
    totals.netRevenue
  ]);

  const costCenterProductRows = useMemo<CostCenterProductRow[]>(
    () =>
      calculatedProductOptions
        .map((product) => {
          const sale = activeSales.find((record) => record.sku === product.sku);
          const unitMetrics = productUnitRows.find(
            (row) => row.sku === product.sku
          );
          const productCosts = costs.filter((cost) => cost.sku === product.sku);
          const productCost = productCosts
            .filter(
              (cost) =>
                cost.category === "product" && cost.allocation === "per_unit"
            )
            .reduce((total, cost) => total + cost.amount, 0);
          const packagingCost = productCosts
            .filter(
              (cost) =>
                cost.category === "packaging" && cost.allocation === "per_unit"
            )
            .reduce((total, cost) => total + cost.amount, 0);
          const operationalCost = productCosts
            .filter(
              (cost) =>
                cost.category !== "product" &&
                cost.category !== "packaging" &&
                cost.category !== "tax" &&
                cost.label !== CALCULATOR_AD_TACOS_LABEL &&
                cost.allocation === "per_unit"
            )
            .reduce((total, cost) => total + cost.amount, 0);
          const taxPercentage = productCosts
            .filter(
              (cost) => cost.category === "tax" && cost.allocation === "percentage"
            )
            .reduce((total, cost) => total + cost.amount, 0);
          const advertisingTacosPercentage = productCosts
            .filter(
              (cost) =>
                cost.label === CALCULATOR_AD_TACOS_LABEL &&
                cost.allocation === "percentage"
            )
            .reduce((total, cost) => total + cost.amount, 0);
          const units = sale?.units ?? 0;
          const grossRevenue = sale?.grossRevenue ?? 0;
          const realProduct = realProducts.find(
            (current) => current.internal_sku === product.sku
          );
          const hasUnitSales = units > 0;

          // Resultado exato salvo pela calculadora (localStorage) ou colunas do
          // banco — espelha a abordagem do dashmarket-pro: a tabela mostra o que
          // a calculadora calculou, sem reconstruir a partir das vendas.
          const cachedResult = calculatorResults[product.sku];
          const referencePrice =
            cachedResult?.sellingPrice ?? numberFromDb(realProduct?.reference_price);
          const referenceNetProfit =
            cachedResult?.netProfit ??
            (realProduct?.reference_net_profit != null
              ? numberFromDb(realProduct.reference_net_profit)
              : null);
          const referenceProfitMargin =
            cachedResult?.profitMargin ??
            (realProduct?.reference_profit_margin != null
              ? numberFromDb(realProduct.reference_profit_margin)
              : null);

          // Sem vendas registradas, usa o preco de venda salvo na calculadora
          // para que a margem nao fique zerada.
          const averagePrice = hasUnitSales
            ? unitMetrics?.averagePrice ?? grossRevenue / units
            : referencePrice;

          let contributionMargin = unitMetrics?.contributionMarginUnit ?? 0;
          let contributionMarginRate = unitMetrics?.contributionMarginRate ?? 0;

          if (!hasUnitSales) {
            // Prioridade: resultado completo da calculadora (que ja considera
            // comissao, frete, tarifa fixa e comissao de afiliado), garantindo
            // que a margem exibida bata exatamente com o "Resultado".
            if (referenceNetProfit != null && referenceProfitMargin != null) {
              contributionMargin = referenceNetProfit;
              contributionMarginRate = referenceProfitMargin;
            } else if (averagePrice > 0) {
              // Fallback parcial (apenas custos cadastrados) quando nao ha
              // resultado salvo — pode divergir da calculadora.
              contributionMargin =
                averagePrice -
                productCost -
                packagingCost -
                operationalCost -
                averagePrice * (taxPercentage / 100) -
                averagePrice * (advertisingTacosPercentage / 100);
              contributionMarginRate = contributionMargin / averagePrice;
            }
          }

          return {
            sku: product.sku,
            title: product.title,
            units,
            orders: sale?.orders ?? 0,
            grossRevenue,
            averagePrice,
            productCost,
            packagingCost,
            operationalCost,
            taxPercentage,
            // Sem vendas, o investimento em ADS/TACOS por unidade e estimado a
            // partir do preco de referencia (preco x %TACOS), igual a calculadora.
            advertisingCost: hasUnitSales
              ? unitMetrics?.manualAdvertisingUnit ?? 0
              : averagePrice * (advertisingTacosPercentage / 100),
            advertisingTacosPercentage,
            contributionMargin,
            contributionMarginRate
          };
        })
        .sort((current, next) => current.title.localeCompare(next.title, "pt-BR")),
    [
      activeSales,
      calculatedProductOptions,
      calculatorResults,
      costs,
      productUnitRows,
      realProducts
    ]
  );

  const filteredCostCenterProductRows = useMemo(() => {
    const query = costProductSearch.trim().toLowerCase();

    return costCenterProductRows.filter((product) => {
      const matchesQuery =
        !query ||
        product.sku.toLowerCase().includes(query) ||
        product.title.toLowerCase().includes(query);

      const matchesMarketplace =
        costMarketplaceFilter === "all" ||
        (productMarketplaces[product.sku] ?? "Mercado Livre") === costMarketplaceFilter;

      return matchesQuery && matchesMarketplace;
    });
  }, [costCenterProductRows, costProductSearch, costMarketplaceFilter, productMarketplaces]);

  const calculatorResult = useMemo(
    () => calculateCostsFromCalculator(calculatorForm, calculatorMode),
    [calculatorForm, calculatorMode]
  );

  const filteredCompanyFinanceEntries = useMemo(() => {
    const query = normalizeSearchText(companyFinanceSearch);
    if (!query) return companyFinanceEntries;

    return companyFinanceEntries.filter((entry) =>
      [
        entry.title,
        entry.category,
        entry.paymentMethod,
        entry.notes ?? "",
        financeTypeLabel[entry.type],
        financeStatusLabel[
          resolveFinanceStatus(entry.status, entry.dueDate, entry.paidAt)
        ]
      ].some((value) => normalizeSearchText(value).includes(query))
    );
  }, [companyFinanceEntries, companyFinanceSearch]);

  const companyFinanceTotals = useMemo(
    () =>
      companyFinanceEntries.reduce(
        (totals, entry) => {
          const status = resolveFinanceStatus(
            entry.status,
            entry.dueDate,
            entry.paidAt
          );
          const signedAmount = entry.type === "income" ? entry.amount : -entry.amount;

          return {
            income:
              totals.income + (entry.type === "income" ? entry.amount : 0),
            expenses:
              totals.expenses + (entry.type === "expense" ? entry.amount : 0),
            paidIncome:
              totals.paidIncome +
              (entry.type === "income" && status === "paid" ? entry.amount : 0),
            paidExpenses:
              totals.paidExpenses +
              (entry.type === "expense" && status === "paid" ? entry.amount : 0),
            openReceivables:
              totals.openReceivables +
              (entry.type === "income" && status !== "paid" ? entry.amount : 0),
            openPayables:
              totals.openPayables +
              (entry.type === "expense" && status !== "paid" ? entry.amount : 0),
            overdue:
              totals.overdue + (status === "overdue" ? Math.abs(entry.amount) : 0),
            projectedBalance: totals.projectedBalance + signedAmount
          };
        },
        {
          income: 0,
          expenses: 0,
          paidIncome: 0,
          paidExpenses: 0,
          openReceivables: 0,
          openPayables: 0,
          overdue: 0,
          projectedBalance: 0
        }
      ),
    [companyFinanceEntries]
  );

  const companyFinanceByCategory = useMemo(() => {
    const categories = new Map<string, { income: number; expenses: number }>();

    for (const entry of companyFinanceEntries) {
      const current = categories.get(entry.category) ?? { income: 0, expenses: 0 };

      if (entry.type === "income") {
        current.income += entry.amount;
      } else {
        current.expenses += entry.amount;
      }

      categories.set(entry.category, current);
    }

    return Array.from(categories.entries())
      .map(([category, values]) => ({ category, ...values }))
      .sort((a, b) => b.income + b.expenses - (a.income + a.expenses));
  }, [companyFinanceEntries]);

  const filteredPersonalFinanceEntries = useMemo(() => {
    const query = normalizeSearchText(personalFinanceSearch);
    if (!query) return personalFinanceEntries;

    return personalFinanceEntries.filter((entry) =>
      [
        entry.title,
        entry.category,
        entry.paymentMethod,
        entry.notes ?? "",
        financeTypeLabel[entry.type],
        financeStatusLabel[
          resolveFinanceStatus(entry.status, entry.dueDate, entry.paidAt)
        ]
      ].some((value) => normalizeSearchText(value).includes(query))
    );
  }, [personalFinanceEntries, personalFinanceSearch]);

  const personalFinanceTotals = useMemo(
    () =>
      personalFinanceEntries.reduce(
        (totals, entry) => {
          const status = resolveFinanceStatus(
            entry.status,
            entry.dueDate,
            entry.paidAt
          );
          const signedAmount = entry.type === "income" ? entry.amount : -entry.amount;

          return {
            income:
              totals.income + (entry.type === "income" ? entry.amount : 0),
            expenses:
              totals.expenses + (entry.type === "expense" ? entry.amount : 0),
            paidBalance:
              totals.paidBalance + (status === "paid" ? signedAmount : 0),
            openAmount:
              totals.openAmount + (status !== "paid" ? Math.abs(entry.amount) : 0),
            overdue:
              totals.overdue + (status === "overdue" ? Math.abs(entry.amount) : 0),
            projectedBalance: totals.projectedBalance + signedAmount
          };
        },
        {
          income: 0,
          expenses: 0,
          paidBalance: 0,
          openAmount: 0,
          overdue: 0,
          projectedBalance: 0
        }
      ),
    [personalFinanceEntries]
  );

  const filteredPersonalLoans = useMemo(() => {
    const query = normalizeSearchText(personalLoanSearch);
    if (!query) return personalLoans;

    return personalLoans.filter((loan) =>
      [
        loan.personName,
        loan.description,
        loan.notes ?? "",
        loanDirectionLabel[loan.direction],
        loanStatusLabel[
          resolveLoanStatus(
            loan.status,
            loan.dueDate,
            loan.principalAmount,
            loan.paidAmount
          )
        ]
      ].some((value) => normalizeSearchText(value).includes(query))
    );
  }, [personalLoanSearch, personalLoans]);

  const personalLoanTotals = useMemo(
    () =>
      personalLoans.reduce(
        (totals, loan) => {
          const openAmount = Math.max(loan.principalAmount - loan.paidAmount, 0);

          return {
            lent:
              totals.lent + (loan.direction === "lent" ? loan.principalAmount : 0),
            borrowed:
              totals.borrowed +
              (loan.direction === "borrowed" ? loan.principalAmount : 0),
            receivable:
              totals.receivable + (loan.direction === "lent" ? openAmount : 0),
            payable:
              totals.payable + (loan.direction === "borrowed" ? openAmount : 0),
            late:
              totals.late +
              (resolveLoanStatus(
                loan.status,
                loan.dueDate,
                loan.principalAmount,
                loan.paidAmount
              ) === "late"
                ? openAmount
                : 0)
          };
        },
        { lent: 0, borrowed: 0, receivable: 0, payable: 0, late: 0 }
      ),
    [personalLoans]
  );

  const loadCostCenter = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const { data: productsData, error: productsError } = await supabaseClient
      .from("products")
      .select("id, internal_sku, title, status")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("internal_sku", { ascending: true });

    if (productsError) throw productsError;

    const products = (productsData ?? []) as ProductRow[];

    const { data: listingStatuses, error: listingStatusesError } =
      await supabaseClient
        .from("marketplace_listings")
        .select("seller_sku, status")
        .eq("organization_id", organizationId)
        .eq("provider", "mercadolivre")
        .limit(10000);

    if (listingStatusesError) throw listingStatusesError;

    const listingRows = (listingStatuses ?? []) as MarketplaceListingStatusRow[];
    const listedSkus = new Set(listingRows.map((listing) => listing.seller_sku));
    const activeListingSkus = new Set(
      listingRows
        .filter((listing) => listing.status === "active")
        .map((listing) => listing.seller_sku)
    );

    // So sobrescreve o status de produtos que possuem anuncio no Mercado Livre.
    // Produtos criados manualmente na Calculadora (sem anuncio) mantem o status
    // gravado no banco, evitando que sumam da lista apos recarregar a pagina.
    const mappedProducts = products.map((product) =>
      listedSkus.has(product.internal_sku)
        ? {
            ...product,
            status: (
              activeListingSkus.has(product.internal_sku) ? "active" : "paused"
            ) as ProductStatus
          }
        : product
    );
    setRealProducts(mappedProducts);

    const { data: costsData, error: costsError } = await supabaseClient
      .from("sku_costs")
      .select(
        "id, cost_name, cost_category, allocation_method, amount, valid_from, valid_to, products(id, internal_sku, title, status)"
      )
      .eq("organization_id", organizationId)
      .order("valid_from", { ascending: false })
      .order("updated_at", { ascending: false });

    if (costsError) throw costsError;

    const mappedCosts = dedupeCalculatorCostRows(
      (costsData ?? []) as CostCenterRow[]
    )
      .map(mapCostCenterRow)
      .filter((cost): cost is SkuCost => Boolean(cost));

    setCosts(mappedCosts);
  }, [supabaseClient]);

  const loadSales = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from("order_items")
      .select(
        "id, external_item_id, seller_sku, title, quantity, unit_price, gross_amount, marketplace_fee_amount, shipping_cost_amount, discount_amount, raw_payload, orders(provider_order_id, sold_at, status, gross_amount, taxes_amount)"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(SALES_DETAIL_LIMIT);

    if (error) throw error;

    const salesBySku = new Map<string, SaleRecord>();
    const detailRows: SalesDetailSourceRow[] = [];

    for (const row of (data ?? []) as OrderItemRow[]) {
      const sku = row.seller_sku ?? "SKU sem codigo";
      const order = getRelatedOrder(row);
      const orderStatus = order?.status ?? "paid";
      const grossAmount = numberFromDb(row.gross_amount);
      const orderGrossAmount = numberFromDb(order?.gross_amount);
      const orderTaxAmount = numberFromDb(order?.taxes_amount);
      const shippingAmounts = getOrderItemShippingAmounts(row);
      const allocatedTaxAmount =
        orderGrossAmount > 0 ? orderTaxAmount * (grossAmount / orderGrossAmount) : 0;

      if (isApprovedOrderStatus(orderStatus)) {
        const discountAmount = numberFromDb(row.discount_amount);
        const current =
          salesBySku.get(sku) ??
          ({
            sku,
            title: row.title,
            units: 0,
            orders: 0,
            grossRevenue: 0,
            marketplaceFees: 0,
            shippingCosts: 0,
            discounts: 0,
            taxes: 0
          } satisfies SaleRecord);

        current.units += numberFromDb(row.quantity);
        current.orders += 1;
        // Usa gross_amount - discount_amount para alinhar com o painel ML (= total_amount)
        current.grossRevenue += grossAmount - discountAmount;
        current.marketplaceFees += numberFromDb(row.marketplace_fee_amount);
        current.shippingCosts += shippingAmounts.seller;
        current.discounts += discountAmount;
        current.taxes += allocatedTaxAmount;
        salesBySku.set(sku, current);
      }

      detailRows.push({
        id: row.id ?? `${order?.provider_order_id ?? "order"}-${sku}`,
        orderId: order?.provider_order_id ?? "Pedido sem codigo",
        externalItemId: row.external_item_id ?? sku,
        title: row.title,
        sku,
        soldAt: order?.sold_at ?? new Date().toISOString(),
        status: orderStatus,
        unitPrice: numberFromDb(row.unit_price),
        quantity: numberFromDb(row.quantity),
        grossAmount,
        marketplaceFee: numberFromDb(row.marketplace_fee_amount),
        shippingBuyer: shippingAmounts.buyer,
        shippingSeller: shippingAmounts.seller,
        discountAmount: numberFromDb(row.discount_amount),
        orderTaxAmount: allocatedTaxAmount
      });
    }

    setRealSales(Array.from(salesBySku.values()));
    setRealSaleDetails(detailRows);
  }, [supabaseClient]);

  const loadInventory = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from("inventory_snapshots")
      .select(
        "seller_sku, fulfillment_channel, available_quantity, reserved_quantity, not_available_quantity, captured_at"
      )
      .eq("organization_id", organizationId)
      .in("fulfillment_channel", ["full", "fulfillment"])
      .order("captured_at", { ascending: false })
      .limit(10000);

    if (error) throw error;

    const latestBySkuAndChannel = new Map<string, InventoryDisplayRow>();

    for (const row of (data ?? []) as InventorySnapshotRow[]) {
      const sku = row.seller_sku ?? "SKU sem codigo";
      const channel = row.fulfillment_channel;
      if (!isFullInventoryChannel(channel)) continue;

      const key = `${sku}:${channel}`;

      if (latestBySkuAndChannel.has(key)) continue;

      const available = numberFromDb(row.available_quantity);

      latestBySkuAndChannel.set(key, {
        sku,
        channel: channelLabel(channel),
        available,
        reserved: numberFromDb(row.reserved_quantity),
        notAvailable: numberFromDb(row.not_available_quantity),
        status: inventoryStatus(available),
        capturedAt: row.captured_at
      });
    }

    setRealInventory(Array.from(latestBySkuAndChannel.values()));
  }, [supabaseClient]);

  const loadAdvertising = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from("advertising_metrics")
      .select(
        "impressions, clicks, ad_spend_amount, attributed_revenue_amount, attributed_orders, products(id, internal_sku, title, status)"
      )
      .eq("organization_id", organizationId)
      .limit(2000);

    if (error) throw error;

    const adsBySku = new Map<string, AdvertisingSpend>();

    for (const row of (data ?? []) as AdvertisingMetricRow[]) {
      const product = getRelatedProduct({
        products: row.products
      } as CostCenterRow);
      const sku = product?.internal_sku ?? "SKU sem codigo";
      const current =
        adsBySku.get(sku) ??
        ({
          sku,
          amount: 0,
          clicks: 0,
          impressions: 0,
          attributedRevenue: 0
        } satisfies AdvertisingSpend);

      current.amount += numberFromDb(row.ad_spend_amount);
      current.clicks += numberFromDb(row.clicks);
      current.impressions += numberFromDb(row.impressions);
      current.attributedRevenue += numberFromDb(row.attributed_revenue_amount);
      adsBySku.set(sku, current);
    }

    setRealAdvertising(Array.from(adsBySku.values()));
  }, [supabaseClient]);

  const loadAdAnalysis = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const [{ data: analyticsData, error: analyticsError }, { data: alertsData, error: alertsError }, { data: opportunitiesData, error: opportunitiesError }] =
      await Promise.all([
        supabaseClient
          .from("listing_daily_analytics")
          .select(
            "id, external_item_id, seller_sku, title, category_id, category_name, captured_date, visits, previous_visits, visit_change_percent, listing_position, previous_position, competitor_count, estimated_sold_quantity, status, permalink"
          )
          .eq("organization_id", organizationId)
          .order("captured_date", { ascending: false })
          .order("visits", { ascending: false })
          .limit(200),
        supabaseClient
          .from("listing_exposure_alerts")
          .select(
            "id, external_item_id, seller_sku, title, alert_date, alert_type, severity, message, current_value, previous_value"
          )
          .eq("organization_id", organizationId)
          .order("alert_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseClient
          .from("marketplace_product_opportunities")
          .select(
            "id, category_id, category_name, query, captured_at, external_item_id, title, price_amount, sold_quantity, previous_sold_quantity, estimated_daily_sales, available_quantity, seller_id, seller_name, competitor_count, listing_position, permalink, thumbnail"
          )
          .eq("organization_id", organizationId)
          .order("captured_at", { ascending: false })
          .order("estimated_daily_sales", { ascending: false })
          .limit(80)
      ]);

    if (analyticsError) {
      if (isMissingRelationError(analyticsError)) {
        setListingAnalytics([]);
        setListingAlerts([]);
        setProductOpportunities([]);
        setDataMessage(
          "Analise de Anuncios pronta, mas as tabelas ainda nao existem no Supabase. Aplique a migracao 20260529000000_ad_listing_analysis.sql."
        );
        return;
      }

      throw analyticsError;
    }

    if (alertsError) throw alertsError;
    if (opportunitiesError) throw opportunitiesError;

    setListingAnalytics(
      ((analyticsData ?? []) as ListingDailyAnalyticsDbRow[]).map(
        mapListingAnalyticsRow
      )
    );
    setListingAlerts(
      ((alertsData ?? []) as ListingExposureAlertDbRow[]).map(
        mapListingExposureAlertRow
      )
    );
    setProductOpportunities(
      ((opportunitiesData ?? []) as ProductOpportunityDbRow[]).map(
        mapProductOpportunityRow
      )
    );
  }, [supabaseClient]);

  const loadPromotions = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from("promotions")
      .select(
        "provider_promotion_id, name, promotion_type, status, starts_at, ends_at, discount_amount, discount_percent, products(id, internal_sku, title, status)"
      )
      .eq("organization_id", organizationId)
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(100);

    if (error) throw error;

    setRealPromotions(
      ((data ?? []) as PromotionDbRow[]).map((row) => {
        const product = getRelatedProduct({
          products: row.products
        } as CostCenterRow);
        const discountPercent = numberFromDb(row.discount_percent);
        const discountAmount = numberFromDb(row.discount_amount);

        return {
          sku: product?.internal_sku ?? "Geral",
          name: row.name,
          discount:
            discountPercent > 0
              ? `${discountPercent.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1
                })}%`
              : discountAmount > 0
                ? formatCurrency.format(discountAmount)
                : row.promotion_type ?? "Oferta",
          period: formatPromotionPeriod(row.starts_at, row.ends_at),
          impact: promotionImpact(row.status),
          type: row.promotion_type ?? undefined,
          status: row.status
        };
      })
    );
  }, [supabaseClient]);

  const loadPosVenda = useCallback(async (organizationId: string, userToken: string) => {
    setPosVendaError(null);
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${userToken}`
    };
    const body = JSON.stringify({ organizationId });

    const [repRes, questRes, claimsRes] = await Promise.allSettled([
      fetch("/api/marketplaces/mercadolivre/seller-reputation", {
        method: "POST", headers, body
      }),
      fetch("/api/marketplaces/mercadolivre/questions", {
        method: "POST", headers, body
      }),
      fetch("/api/marketplaces/mercadolivre/claims", {
        method: "POST", headers, body
      })
    ]);

    if (repRes.status === "fulfilled" && repRes.value.ok) {
      setReputation((await repRes.value.json()) as SellerReputationResponse);
    }
    if (questRes.status === "fulfilled" && questRes.value.ok) {
      setQuestionsData((await questRes.value.json()) as QuestionsResponse);
    }
    if (claimsRes.status === "fulfilled" && claimsRes.value.ok) {
      setClaimsData((await claimsRes.value.json()) as ClaimsResponse);
    }

    const errors = [repRes, questRes, claimsRes]
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason);
    if (errors.length > 0) {
      setPosVendaError("Alguns dados de pós-venda não puderam ser carregados.");
    }
  }, []);

  const loadCompanyFinance = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from("company_financial_entries")
      .select(
        "id, description, category, entry_type, amount, due_date, paid_at, status, payment_method, notes"
      )
      .eq("organization_id", organizationId)
      .order("due_date", { ascending: true })
      .limit(1000);

    if (error) {
      if (isMissingStorageSchemaError(error)) {
        setCompanyFinanceEntries(
          readStoredFinanceEntries(COMPANY_FINANCE_STORAGE_KEY, companyFinanceSeed)
        );
        return;
      }

      throw error;
    }

    setCompanyFinanceEntries(
      ((data ?? []) as FinanceEntryDbRow[]).map(mapFinanceEntryRow)
    );
  }, [supabaseClient]);

  const loadPersonalFinance = useCallback(async (currentUserId: string) => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from("personal_financial_entries")
      .select(
        "id, description, category, entry_type, amount, due_date, paid_at, status, payment_method, notes"
      )
      .eq("user_id", currentUserId)
      .order("due_date", { ascending: true })
      .limit(1000);

    if (error) {
      if (isMissingStorageSchemaError(error)) {
        setPersonalFinanceEntries(
          readStoredFinanceEntries(
            PERSONAL_FINANCE_STORAGE_KEY,
            personalFinanceSeed
          )
        );
        return;
      }

      throw error;
    }

    setPersonalFinanceEntries(
      ((data ?? []) as FinanceEntryDbRow[]).map(mapFinanceEntryRow)
    );
  }, [supabaseClient]);

  const loadPersonalLoans = useCallback(async (currentUserId: string) => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from("personal_loans")
      .select(
        "id, loan_direction, person_name, description, principal_amount, paid_amount, interest_rate, start_date, due_date, status, notes"
      )
      .eq("user_id", currentUserId)
      .order("due_date", { ascending: true })
      .limit(1000);

    if (error) {
      if (isMissingStorageSchemaError(error)) {
        setPersonalLoans(personalLoanSeed);
        return;
      }

      throw error;
    }

    setPersonalLoans(((data ?? []) as LoanEntryDbRow[]).map(mapLoanEntryRow));
  }, [supabaseClient]);

  const loadSyncRuns = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from("sync_runs")
      .select("id, resource, status, started_at, finished_at, error_message, records_processed")
      .eq("organization_id", organizationId)
      .order("started_at", { ascending: false })
      .limit(10);

    if (error) {
      if (isMissingRelationError(error)) {
        setSyncRuns([]);
        return;
      }
      throw error;
    }

    setSyncRuns((data ?? []) as SyncRunRow[]);
  }, [supabaseClient]);

  const loadMarketplaceAccounts = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from("marketplace_accounts")
      .select(
        "id, provider, external_seller_id, account_name, site_id, status, last_sync_at"
      )
      .eq("organization_id", organizationId)
      .order("last_sync_at", { ascending: false });

    if (error) {
      if (isMissingRelationError(error)) {
        setMarketplaceAccounts([]);
        setDataMessage(
          "Conector do Mercado Livre pronto, mas a tabela de marketplaces ainda nao existe no Supabase."
        );
        return;
      }

      throw error;
    }

    setMarketplaceAccounts((data ?? []) as MarketplaceAccountRow[]);
  }, [supabaseClient]);

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspace() {
      if (!supabaseClient) {
        setSupabaseStatus("demo");
        setUserId(null);
        setRealSales([]);
        setRealSaleDetails([]);
        setRealInventory([]);
        setRealAdvertising([]);
        setListingAnalytics([]);
        setListingAlerts([]);
        setProductOpportunities([]);
        setRealPromotions([]);
        setCompanyFinanceEntries(
          readStoredFinanceEntries(COMPANY_FINANCE_STORAGE_KEY, companyFinanceSeed)
        );
        setPersonalFinanceEntries(
          readStoredFinanceEntries(
            PERSONAL_FINANCE_STORAGE_KEY,
            personalFinanceSeed
          )
        );
        setPersonalLoans(personalLoanSeed);
        setCosts(costsSeed);
        setHiddenSkus([]);
        return;
      }

      const loadErrors: string[] = [];
      const loadPanelSection = async (
        label: string,
        task: () => Promise<void>
      ) => {
        try {
          await task();
        } catch (error) {
          loadErrors.push(`${label}: ${errorMessage(error, "falha ao carregar")}`);
        }
      };

      try {
        const { data: sessionData, error: sessionError } =
          await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          if (!isMounted) return;
          setSupabaseStatus("demo");
          setUserId(null);
          setOrganization(null);
          setRealProducts([]);
          setRealSales([]);
          setRealSaleDetails([]);
          setRealInventory([]);
          setRealAdvertising([]);
          setListingAnalytics([]);
          setListingAlerts([]);
          setProductOpportunities([]);
          setRealPromotions([]);
          setCompanyFinanceEntries(
            readStoredFinanceEntries(
              COMPANY_FINANCE_STORAGE_KEY,
              companyFinanceSeed
            )
          );
          setPersonalFinanceEntries(
            readStoredFinanceEntries(
              PERSONAL_FINANCE_STORAGE_KEY,
              personalFinanceSeed
            )
          );
          setPersonalLoans(personalLoanSeed);
          setCosts(costsSeed);
          setHiddenSkus([]);
          return;
        }

        const { data: organizationsData, error: organizationsError } =
          await supabaseClient
            .from("organizations")
            .select("id, name, slug")
            .order("created_at", { ascending: true })
            .limit(1);

        if (organizationsError) throw organizationsError;

        let currentOrganization =
          ((organizationsData ?? [])[0] as Organization | undefined) ?? null;

        if (!currentOrganization) {
          const { data: createdOrganization, error: createOrganizationError } =
            await supabaseClient
              .from("organizations")
              .insert({
                created_by: session.user.id,
                name: "DASHMARKET",
                slug: defaultOrganizationSlug(session.user.id)
              })
              .select("id, name, slug")
              .single();

          if (createOrganizationError) throw createOrganizationError;

          currentOrganization = createdOrganization as Organization;
        }

        if (!isMounted) return;

        setUserId(session.user.id);
        setOrganization(currentOrganization);
        setSupabaseStatus("connected");

        if (currentOrganization) {
          await loadPanelSection("Centro de custos", () =>
            loadCostCenter(currentOrganization.id)
          );
          await loadPanelSection("Vendas", () => loadSales(currentOrganization.id));
          await loadPanelSection("Estoque", () =>
            loadInventory(currentOrganization.id)
          );
          await loadPanelSection("Publicidade", () =>
            loadAdvertising(currentOrganization.id)
          );
          await loadPanelSection("Analise de anuncios", () =>
            loadAdAnalysis(currentOrganization.id)
          );
          await loadPanelSection("Promocoes", () =>
            loadPromotions(currentOrganization.id)
          );
          await loadPanelSection("Financeiro empresa", () =>
            loadCompanyFinance(currentOrganization.id)
          );
          await loadPanelSection("Financeiro pessoal", () =>
            loadPersonalFinance(session.user.id)
          );
          await loadPanelSection("Emprestimos", () =>
            loadPersonalLoans(session.user.id)
          );
          await loadPanelSection("Conta Mercado Livre", () =>
            loadMarketplaceAccounts(currentOrganization.id)
          );
          await loadPanelSection("Logs de Sincronização", () =>
            loadSyncRuns(currentOrganization.id)
          );

          if (isMounted && loadErrors.length > 0) {
            setDataMessage(
              `Conectado como ${session.user.email ?? "usuario"}, mas algumas areas nao carregaram: ${loadErrors
                .slice(0, 3)
                .join(" | ")}${loadErrors.length > 3 ? " ..." : ""}`
            );
          }
        } else {
          setCosts([]);
          setRealSales([]);
          setRealSaleDetails([]);
          setRealInventory([]);
          setRealAdvertising([]);
          setListingAnalytics([]);
          setListingAlerts([]);
          setProductOpportunities([]);
          setRealPromotions([]);
          setCompanyFinanceEntries([]);
          setPersonalFinanceEntries(
            readStoredFinanceEntries(
              PERSONAL_FINANCE_STORAGE_KEY,
              personalFinanceSeed
            )
          );
          setPersonalLoans(personalLoanSeed);
          setMarketplaceAccounts([]);
          setDataMessage("Usuario autenticado. Criando empresa DASHMARKET.");
        }
      } catch (error) {
        if (!isMounted) return;
        setSupabaseStatus("error");
        setUserId(null);
        setOrganization(null);
        setRealSales([]);
        setRealSaleDetails([]);
        setRealInventory([]);
        setRealAdvertising([]);
        setListingAnalytics([]);
        setListingAlerts([]);
        setProductOpportunities([]);
        setRealPromotions([]);
        setCompanyFinanceEntries(
          readStoredFinanceEntries(COMPANY_FINANCE_STORAGE_KEY, companyFinanceSeed)
        );
        setPersonalFinanceEntries(
          readStoredFinanceEntries(
            PERSONAL_FINANCE_STORAGE_KEY,
            personalFinanceSeed
          )
        );
        setPersonalLoans(personalLoanSeed);
        setCosts(costsSeed);
        setHiddenSkus([]);
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar os dados do Supabase."
        );
      }
    }

    loadWorkspace();

    const authSubscription = supabaseClient?.auth.onAuthStateChange(() => {
      if (!isMounted) return;
      void loadWorkspace();
    });

    return () => {
      isMounted = false;
      authSubscription?.data.subscription.unsubscribe();
    };
  }, [
    loadCostCenter,
    loadAdAnalysis,
    loadAdvertising,
    loadCompanyFinance,
    loadInventory,
    loadMarketplaceAccounts,
    loadSyncRuns,
    loadPersonalFinance,
    loadPersonalLoans,
    loadPromotions,
    loadSales,
    supabaseClient
  ]);

  function updateLocalCompanyFinanceEntries(
    updater: (entries: FinanceEntry[]) => FinanceEntry[]
  ) {
    setCompanyFinanceEntries((current) => {
      const next = updater(current);
      writeStoredFinanceEntries(COMPANY_FINANCE_STORAGE_KEY, next);
      return next;
    });
  }

  function updateLocalPersonalFinanceEntries(
    updater: (entries: FinanceEntry[]) => FinanceEntry[]
  ) {
    setPersonalFinanceEntries((current) => {
      const next = updater(current);
      writeStoredFinanceEntries(PERSONAL_FINANCE_STORAGE_KEY, next);
      return next;
    });
  }

  function replaceLocalCalculatorCostsForSku(
    sku: string,
    entries: CalculatorCostEntry[],
    validFrom: string
  ) {
    setCosts((current) => [
      ...current.filter(
        (cost) => cost.sku !== sku || !isCalculatorManagedCost(cost)
      ),
      ...entries.map((entry) => ({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `cost-${Date.now()}-${sku}-${entry.label}`,
        sku,
        label: entry.label,
        category: entry.category,
        amount: entry.amount,
        allocation: entry.allocation,
        validFrom
      }))
    ]);
  }

  function updatePhysicalInventoryQuantity(sku: string, value: string) {
    const quantity = Math.max(0, Math.floor(Number(value)));

    setPhysicalInventoryQuantities((current) => {
      const next = { ...current };

      if (!value || !Number.isFinite(quantity) || quantity <= 0) {
        delete next[sku];
      } else {
        next[sku] = quantity;
      }

      return next;
    });
  }

  function resetCompanyFinanceForm() {
    setCompanyFinanceForm({
      title: "",
      category: "Operacional",
      type: "expense",
      amount: "",
      dueDate: dateOnly(new Date()),
      paidAt: "",
      status: "pending",
      paymentMethod: "PIX",
      notes: ""
    });
    setEditingCompanyFinanceId(null);
  }

  function resetPersonalFinanceForm() {
    setPersonalFinanceForm({
      title: "",
      category: "Casa",
      type: "expense",
      amount: "",
      dueDate: dateOnly(new Date()),
      paidAt: "",
      status: "pending",
      paymentMethod: "Banco",
      notes: ""
    });
    setEditingPersonalFinanceId(null);
  }

  function resetPersonalLoanForm() {
    setPersonalLoanForm({
      direction: "lent",
      personName: "",
      description: "",
      principalAmount: "",
      paidAmount: "",
      interestRate: "",
      startDate: dateOnly(new Date()),
      dueDate: addDays(30),
      status: "active",
      notes: ""
    });
    setEditingLoanId(null);
  }

  function financeEntryFromCompanyForm(): FinanceEntry {
    const paidAt =
      companyFinanceForm.status === "paid"
        ? companyFinanceForm.paidAt || dateOnly(new Date())
        : "";

    return {
      id: editingCompanyFinanceId ?? makeLocalId("company-finance"),
      title: companyFinanceForm.title.trim(),
      category: companyFinanceForm.category.trim() || "Operacional",
      type: companyFinanceForm.type,
      amount: numberFromInput(companyFinanceForm.amount),
      dueDate: companyFinanceForm.dueDate || dateOnly(new Date()),
      paidAt: paidAt || null,
      status: resolveFinanceStatus(
        companyFinanceForm.status,
        companyFinanceForm.dueDate,
        paidAt
      ),
      paymentMethod: companyFinanceForm.paymentMethod.trim(),
      notes: companyFinanceForm.notes.trim()
    };
  }

  function financeEntryFromPersonalForm(): FinanceEntry {
    const paidAt =
      personalFinanceForm.status === "paid"
        ? personalFinanceForm.paidAt || dateOnly(new Date())
        : "";

    return {
      id: editingPersonalFinanceId ?? makeLocalId("personal-finance"),
      title: personalFinanceForm.title.trim(),
      category: personalFinanceForm.category.trim() || "Pessoal",
      type: personalFinanceForm.type,
      amount: numberFromInput(personalFinanceForm.amount),
      dueDate: personalFinanceForm.dueDate || dateOnly(new Date()),
      paidAt: paidAt || null,
      status: resolveFinanceStatus(
        personalFinanceForm.status,
        personalFinanceForm.dueDate,
        paidAt
      ),
      paymentMethod: personalFinanceForm.paymentMethod.trim(),
      notes: personalFinanceForm.notes.trim()
    };
  }

  function loanFromForm(): LoanEntry {
    const principalAmount = numberFromInput(personalLoanForm.principalAmount);
    const paidAmount = numberFromInput(personalLoanForm.paidAmount);

    return {
      id: editingLoanId ?? makeLocalId("personal-loan"),
      direction: personalLoanForm.direction,
      personName: personalLoanForm.personName.trim(),
      description: personalLoanForm.description.trim(),
      principalAmount,
      paidAmount,
      interestRate: numberFromInput(personalLoanForm.interestRate),
      startDate: personalLoanForm.startDate || dateOnly(new Date()),
      dueDate: personalLoanForm.dueDate || addDays(30),
      status: resolveLoanStatus(
        personalLoanForm.status,
        personalLoanForm.dueDate,
        principalAmount,
        paidAmount
      ),
      notes: personalLoanForm.notes.trim()
    };
  }

  function startEditingCompanyFinance(entry: FinanceEntry) {
    setEditingCompanyFinanceId(entry.id);
    setCompanyFinanceForm({
      title: entry.title,
      category: entry.category,
      type: entry.type,
      amount: inputNumber(entry.amount),
      dueDate: entry.dueDate,
      paidAt: entry.paidAt ?? "",
      status: entry.status,
      paymentMethod: entry.paymentMethod,
      notes: entry.notes ?? ""
    });
    setDataMessage(`Editando lancamento da empresa: ${entry.title}.`);
  }

  function startEditingPersonalFinance(entry: FinanceEntry) {
    setEditingPersonalFinanceId(entry.id);
    setPersonalFinanceForm({
      title: entry.title,
      category: entry.category,
      type: entry.type,
      amount: inputNumber(entry.amount),
      dueDate: entry.dueDate,
      paidAt: entry.paidAt ?? "",
      status: entry.status,
      paymentMethod: entry.paymentMethod,
      notes: entry.notes ?? ""
    });
    setDataMessage(`Editando lancamento pessoal: ${entry.title}.`);
  }

  function startEditingLoan(loan: LoanEntry) {
    setEditingLoanId(loan.id);
    setPersonalLoanForm({
      direction: loan.direction,
      personName: loan.personName,
      description: loan.description,
      principalAmount: inputNumber(loan.principalAmount),
      paidAmount: inputNumber(loan.paidAmount),
      interestRate: inputNumber(loan.interestRate),
      startDate: loan.startDate,
      dueDate: loan.dueDate,
      status: loan.status,
      notes: loan.notes ?? ""
    });
    setPersonalFinanceTab("loans");
    setDataMessage(`Editando emprestimo: ${loan.description}.`);
  }

  async function saveCompanyFinanceEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const entry = financeEntryFromCompanyForm();
    if (!entry.title || entry.amount <= 0) return;

    if (supabaseClient && organization) {
      setIsSavingCompanyFinance(true);
      setDataMessage(null);

      try {
        const payload = {
          organization_id: organization.id,
          description: entry.title,
          category: entry.category,
          entry_type: entry.type,
          amount: entry.amount,
          due_date: entry.dueDate,
          paid_at: entry.paidAt || null,
          status: entry.status,
          payment_method: entry.paymentMethod || null,
          notes: entry.notes || null
        };
        const { error } = editingCompanyFinanceId
          ? await supabaseClient
              .from("company_financial_entries")
              .update(payload)
              .eq("id", editingCompanyFinanceId)
          : await supabaseClient.from("company_financial_entries").insert(payload);

        if (error) throw error;

        await loadCompanyFinance(organization.id);
        resetCompanyFinanceForm();
        setDataMessage(
          editingCompanyFinanceId
            ? "Lancamento financeiro da empresa atualizado."
            : "Lancamento financeiro da empresa salvo."
        );
      } catch (error) {
        setDataMessage(
          isMissingStorageSchemaError(error)
            ? "Financeiro ainda nao existe no Supabase. O lancamento foi salvo localmente neste navegador."
            : errorMessage(error, "Nao foi possivel salvar o financeiro da empresa.")
        );
        if (isMissingStorageSchemaError(error)) {
          updateLocalCompanyFinanceEntries((current) =>
            editingCompanyFinanceId
              ? current.map((item) =>
                  item.id === editingCompanyFinanceId ? entry : item
                )
              : [...current, entry]
          );
          resetCompanyFinanceForm();
        }
      } finally {
        setIsSavingCompanyFinance(false);
      }

      return;
    }

    updateLocalCompanyFinanceEntries((current) =>
      editingCompanyFinanceId
        ? current.map((item) => (item.id === editingCompanyFinanceId ? entry : item))
        : [...current, entry]
    );
    resetCompanyFinanceForm();
    setDataMessage("Lancamento da empresa salvo em modo demonstracao.");
  }

  async function savePersonalFinanceEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const entry = financeEntryFromPersonalForm();
    if (!entry.title || entry.amount <= 0) return;

    if (supabaseClient && userId) {
      setIsSavingPersonalFinance(true);
      setDataMessage(null);

      try {
        const payload = {
          user_id: userId,
          description: entry.title,
          category: entry.category,
          entry_type: entry.type,
          amount: entry.amount,
          due_date: entry.dueDate,
          paid_at: entry.paidAt || null,
          status: entry.status,
          payment_method: entry.paymentMethod || null,
          notes: entry.notes || null
        };
        const { error } = editingPersonalFinanceId
          ? await supabaseClient
              .from("personal_financial_entries")
              .update(payload)
              .eq("id", editingPersonalFinanceId)
          : await supabaseClient.from("personal_financial_entries").insert(payload);

        if (error) throw error;

        await loadPersonalFinance(userId);
        resetPersonalFinanceForm();
        setDataMessage(
          editingPersonalFinanceId
            ? "Lancamento financeiro pessoal atualizado."
            : "Lancamento financeiro pessoal salvo."
        );
      } catch (error) {
        setDataMessage(
          isMissingStorageSchemaError(error)
            ? "Financeiro pessoal ainda nao existe no Supabase. O lancamento foi salvo localmente neste navegador."
            : errorMessage(error, "Nao foi possivel salvar o financeiro pessoal.")
        );
        if (isMissingStorageSchemaError(error)) {
          updateLocalPersonalFinanceEntries((current) =>
            editingPersonalFinanceId
              ? current.map((item) =>
                  item.id === editingPersonalFinanceId ? entry : item
                )
              : [...current, entry]
          );
          resetPersonalFinanceForm();
        }
      } finally {
        setIsSavingPersonalFinance(false);
      }

      return;
    }

    updateLocalPersonalFinanceEntries((current) =>
      editingPersonalFinanceId
        ? current.map((item) => (item.id === editingPersonalFinanceId ? entry : item))
        : [...current, entry]
    );
    resetPersonalFinanceForm();
    setDataMessage("Lancamento pessoal salvo em modo demonstracao.");
  }

  async function savePersonalLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const loan = loanFromForm();
    if (!loan.personName || !loan.description || loan.principalAmount <= 0) return;

    if (supabaseClient && userId) {
      setIsSavingLoan(true);
      setDataMessage(null);

      try {
        const payload = {
          user_id: userId,
          loan_direction: loan.direction,
          person_name: loan.personName,
          description: loan.description,
          principal_amount: loan.principalAmount,
          paid_amount: loan.paidAmount,
          interest_rate: loan.interestRate,
          start_date: loan.startDate,
          due_date: loan.dueDate,
          status: loan.status,
          notes: loan.notes || null
        };
        const { error } = editingLoanId
          ? await supabaseClient
              .from("personal_loans")
              .update(payload)
              .eq("id", editingLoanId)
          : await supabaseClient.from("personal_loans").insert(payload);

        if (error) throw error;

        await loadPersonalLoans(userId);
        resetPersonalLoanForm();
        setDataMessage(
          editingLoanId ? "Emprestimo atualizado." : "Emprestimo salvo."
        );
      } catch (error) {
        setDataMessage(
          isMissingStorageSchemaError(error)
            ? "A aba de emprestimos ainda nao existe no Supabase. Execute a migration de financeiro e tente novamente."
            : errorMessage(error, "Nao foi possivel salvar o emprestimo.")
        );
      } finally {
        setIsSavingLoan(false);
      }

      return;
    }

    setPersonalLoans((current) =>
      editingLoanId
        ? current.map((item) => (item.id === editingLoanId ? loan : item))
        : [...current, loan]
    );
    resetPersonalLoanForm();
    setDataMessage("Emprestimo salvo em modo demonstracao.");
  }

  async function deleteCompanyFinanceEntry(entry: FinanceEntry) {
    if (!window.confirm(`Excluir o lancamento "${entry.title}"?`)) return;

    const removeLocalEntry = () => {
      updateLocalCompanyFinanceEntries((current) =>
        current.filter((item) => item.id !== entry.id)
      );
      if (editingCompanyFinanceId === entry.id) {
        resetCompanyFinanceForm();
      }
    };

    if (!isUuid(entry.id)) {
      removeLocalEntry();
      setDataMessage("Lancamento da empresa removido da lista.");
      return;
    }

    if (supabaseClient && organization) {
      setIsSavingCompanyFinance(true);

      try {
        const { data: deletedEntry, error } = await supabaseClient
          .from("company_financial_entries")
          .delete()
          .eq("id", entry.id)
          .eq("organization_id", organization.id)
          .select("id")
          .maybeSingle();

        if (error) throw error;

        if (!deletedEntry) {
          const { data: existingEntry, error: verifyError } = await supabaseClient
            .from("company_financial_entries")
            .select("id")
            .eq("id", entry.id)
            .eq("organization_id", organization.id)
            .maybeSingle();

          if (verifyError) throw verifyError;

          if (existingEntry) {
            await loadCompanyFinance(organization.id);
            setDataMessage(
              "Nao foi possivel excluir este lancamento da empresa no Supabase. Confira as permissoes da tabela de financeiro."
            );
            return;
          }

          removeLocalEntry();
          await loadCompanyFinance(organization.id);
          setDataMessage("Lancamento da empresa excluido.");
          return;
        }

        await loadCompanyFinance(organization.id);
        if (editingCompanyFinanceId === entry.id) {
          resetCompanyFinanceForm();
        }
        setDataMessage("Lancamento da empresa excluido.");
      } catch (error) {
        if (isMissingStorageSchemaError(error)) {
          removeLocalEntry();
          setDataMessage(
            "Lancamento removido localmente. Execute a migration do financeiro para salvar exclusoes no Supabase."
          );
          return;
        }

        setDataMessage(
          errorMessage(error, "Nao foi possivel excluir o lancamento da empresa.")
        );
      } finally {
        setIsSavingCompanyFinance(false);
      }

      return;
    }

    removeLocalEntry();
    setDataMessage("Lancamento da empresa removido em modo demonstracao.");
  }

  async function deletePersonalFinanceEntry(entry: FinanceEntry) {
    if (!window.confirm(`Excluir o lancamento "${entry.title}"?`)) return;

    const removeLocalEntry = () => {
      updateLocalPersonalFinanceEntries((current) =>
        current.filter((item) => item.id !== entry.id)
      );
      if (editingPersonalFinanceId === entry.id) {
        resetPersonalFinanceForm();
      }
    };

    if (!isUuid(entry.id)) {
      removeLocalEntry();
      setDataMessage("Lancamento pessoal removido da lista.");
      return;
    }

    if (supabaseClient && userId) {
      setIsSavingPersonalFinance(true);

      try {
        const { data: deletedEntry, error } = await supabaseClient
          .from("personal_financial_entries")
          .delete()
          .eq("id", entry.id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle();

        if (error) throw error;

        if (!deletedEntry) {
          const { data: existingEntry, error: verifyError } = await supabaseClient
            .from("personal_financial_entries")
            .select("id")
            .eq("id", entry.id)
            .eq("user_id", userId)
            .maybeSingle();

          if (verifyError) throw verifyError;

          if (existingEntry) {
            await loadPersonalFinance(userId);
            setDataMessage(
              "Nao foi possivel excluir este lancamento pessoal no Supabase. Confira as permissoes da tabela de financeiro pessoal."
            );
            return;
          }

          removeLocalEntry();
          await loadPersonalFinance(userId);
          setDataMessage("Lancamento pessoal excluido.");
          return;
        }

        await loadPersonalFinance(userId);
        if (editingPersonalFinanceId === entry.id) {
          resetPersonalFinanceForm();
        }
        setDataMessage("Lancamento pessoal excluido.");
      } catch (error) {
        if (isMissingStorageSchemaError(error)) {
          removeLocalEntry();
          setDataMessage(
            "Lancamento removido localmente. Execute a migration do financeiro para salvar exclusoes no Supabase."
          );
          return;
        }

        setDataMessage(
          errorMessage(error, "Nao foi possivel excluir o lancamento pessoal.")
        );
      } finally {
        setIsSavingPersonalFinance(false);
      }

      return;
    }

    removeLocalEntry();
    setDataMessage("Lancamento pessoal removido em modo demonstracao.");
  }

  async function deletePersonalLoan(loan: LoanEntry) {
    if (!window.confirm(`Excluir o emprestimo "${loan.description}"?`)) return;

    if (supabaseClient && userId) {
      setIsSavingLoan(true);

      try {
        const { error } = await supabaseClient
          .from("personal_loans")
          .delete()
          .eq("id", loan.id);

        if (error) throw error;
        await loadPersonalLoans(userId);
        setDataMessage("Emprestimo excluido.");
      } catch (error) {
        if (isMissingStorageSchemaError(error)) {
          setPersonalLoans((current) => current.filter((item) => item.id !== loan.id));
          setDataMessage(
            "Emprestimo removido da lista. Execute a migration do financeiro para salvar exclusoes no Supabase."
          );
          return;
        }

        setDataMessage(
          errorMessage(error, "Nao foi possivel excluir o emprestimo.")
        );
      } finally {
        setIsSavingLoan(false);
      }

      return;
    }

    setPersonalLoans((current) => current.filter((item) => item.id !== loan.id));
    setDataMessage("Emprestimo removido em modo demonstracao.");
  }

  // Resolve a empresa do usuario mesmo que o estado `organization` ainda nao
  // tenha sido populado (ex.: race no carregamento ou refresh de token). Evita
  // que gravacoes caiam silenciosamente no modo local quando o usuario esta
  // autenticado mas o estado da empresa esta temporariamente nulo.
  async function resolveOrganization(): Promise<Organization | null> {
    if (organization) return organization;
    if (!supabaseClient) return null;

    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (!sessionData.session) return null;

      const { data, error } = await supabaseClient
        .from("organizations")
        .select("id, name, slug")
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) throw error;

      const org = ((data ?? [])[0] as Organization | undefined) ?? null;
      if (org) setOrganization(org);
      return org;
    } catch {
      return null;
    }
  }

  async function ensureProductForSku(
    sku: string,
    title: string,
    orgOverride?: Organization
  ) {
    const org = orgOverride ?? organization;
    if (!supabaseClient || !org) {
      throw new Error("Entre no DASHMARKET antes de salvar SKUs.");
    }

    const localProduct = realProducts.find(
      (currentProduct) => currentProduct.internal_sku === sku
    );

    if (localProduct) return localProduct;

    const { data: existingProduct, error: existingProductError } =
      await supabaseClient
        .from("products")
        .select("id, internal_sku, title, status")
        .eq("organization_id", org.id)
        .eq("internal_sku", sku)
        .maybeSingle();

    if (existingProductError) throw existingProductError;

    if (existingProduct) {
      const product = existingProduct as ProductRow;

      if (product.status !== "archived") return product;

      const { data: restoredProduct, error: restoredProductError } =
        await supabaseClient
          .from("products")
          .update({ status: "active", title: title || product.title || sku })
          .eq("id", product.id)
          .select("id, internal_sku, title, status")
          .single();

      if (restoredProductError) throw restoredProductError;
      return restoredProduct as ProductRow;
    }

    const { data: insertedProduct, error: productError } = await supabaseClient
      .from("products")
      .insert({
        organization_id: org.id,
        internal_sku: sku,
        title: title || sku,
        status: "active"
      })
      .select("id, internal_sku, title, status")
      .single();

    if (productError) throw productError;
    return insertedProduct as ProductRow;
  }

  function selectProductForCalculator(product: CostCenterProductRow) {
    const productCosts = costs.filter((cost) => cost.sku === product.sku);
    const sale = activeSales.find((saleRecord) => saleRecord.sku === product.sku);
    const collectionCost = productCosts
      .filter(
        (cost) =>
          cost.category === "inbound_freight" && cost.allocation === "per_unit"
      )
      .reduce((total, cost) => total + cost.amount, 0);
    const storageCost = productCosts
      .filter(
        (cost) =>
          cost.category === "other" &&
          cost.label.toLowerCase().includes("armazen") &&
          cost.allocation === "per_unit"
      )
      .reduce((total, cost) => total + cost.amount, 0);
    const operationalCost = Math.max(
      0,
      product.operationalCost - collectionCost - storageCost
    );
    const adTacosPercentage = productCosts
      .filter(
        (cost) =>
          cost.label === CALCULATOR_AD_TACOS_LABEL &&
          cost.allocation === "percentage"
      )
      .reduce((total, cost) => total + cost.amount, 0);
    const averageMarketplaceFeeRate =
      product.grossRevenue > 0
        ? (sale?.marketplaceFees ?? 0) / product.grossRevenue
        : 0;
    setCalculatorForm((current) => ({
      ...current,
      sku: product.sku,
      name: product.title,
      productCost: inputNumber(product.productCost),
      sellingPrice:
        product.averagePrice > 0
          ? inputNumber(product.averagePrice)
          : current.sellingPrice,
      commissionPercentage:
        averageMarketplaceFeeRate > 0
          ? (averageMarketplaceFeeRate * 100).toFixed(2)
          : current.commissionPercentage,
      fixedFee: "",
      shippingCost:
        product.units > 0
          ? inputNumber((sale?.shippingCosts ?? 0) / product.units)
          : current.shippingCost,
      packagingCost: inputNumber(product.packagingCost),
      collectionCost: inputNumber(collectionCost),
      storageCost: inputNumber(storageCost),
      operationalCost: inputNumber(operationalCost),
      taxPercentage: inputNumber(product.taxPercentage),
      adTacosPercentage: inputNumber(adTacosPercentage)
    }));
  }

  function selectSalesProductForCalculator(product: { sku: string; title: string }) {
    const sale = activeSales.find((saleRecord) => saleRecord.sku === product.sku);
    const units = sale?.units ?? 0;
    const grossRevenue = sale?.grossRevenue ?? 0;
    const averagePrice = units > 0 ? grossRevenue / units : 0;
    const averageMarketplaceFeeRate =
      grossRevenue > 0 ? (sale?.marketplaceFees ?? 0) / grossRevenue : 0;
    const shippingCost = units > 0 ? (sale?.shippingCosts ?? 0) / units : 0;

    setCalculatorForm((current) => ({
      ...current,
      sku: product.sku,
      name: product.title,
      productCost: "",
      sellingPrice:
        averagePrice > 0 ? inputNumber(averagePrice) : current.sellingPrice,
      commissionPercentage:
        averageMarketplaceFeeRate > 0
          ? (averageMarketplaceFeeRate * 100).toFixed(2)
          : current.commissionPercentage,
      fixedFee: "",
      shippingCost: shippingCost > 0 ? inputNumber(shippingCost) : "",
      packagingCost: "",
      collectionCost: "",
      storageCost: "",
      operationalCost: "",
      taxPercentage: "",
      adTacosPercentage: ""
    }));
  }

  async function createNewCalculatorProduct() {
    const sku = newProductDraft.sku.trim();
    const name = newProductDraft.name.trim();

    if (!sku) {
      setDataMessage("Informe o SKU do novo produto.");
      return;
    }

    const skuExists =
      productOptions.some((product) => product.sku === sku) ||
      realProducts.some((product) => product.internal_sku === sku) ||
      activeSales.some((sale) => sale.sku === sku);

    if (skuExists) {
      setDataMessage(`O SKU ${sku} ja existe. Selecione-o na lista para editar.`);
      return;
    }

    setHiddenSkus((current) => current.filter((hiddenSku) => hiddenSku !== sku));
    setSelectedPreset("custom");
    setCalculatorMode("price");
    setCalculatorForm((current) => ({
      ...current,
      sku,
      name: name || sku,
      productCost: "",
      sellingPrice: "",
      commissionPercentage: "16",
      fixedFee: "",
      shippingCost: "",
      packagingCost: "",
      collectionCost: "",
      storageCost: "",
      operationalCost: "",
      taxPercentage: "",
      adTacosPercentage: "",
      affiliateCommissionPercentage: "",
      promotionCredit: "",
      desiredProfitMargin: "15",
      desiredFixedProfit: "10",
      validFrom: dateOnly(new Date())
    }));
    setNewProductDraft({ sku: "", name: "" });
    setShowNewProductForm(false);

    // Persiste o produto imediatamente no banco para que fique gravado assim que
    // criado (aparecendo na lista de SKUs), mesmo antes de aplicar os custos.
    // Usa a empresa do estado (carregada quando logado); se nao houver, tenta
    // resolver via Supabase (que valida a sessao). So cai no modo local quando
    // realmente nao ha empresa/sessao.
    const org = organization ?? (await resolveOrganization());

    if (supabaseClient && org) {
      setIsSavingProduct(true);
      try {
        const product = await ensureProductForSku(sku, name || sku, org);
        setRealProducts((current) =>
          current.some(
            (currentProduct) =>
              currentProduct.internal_sku === product.internal_sku
          )
            ? current
            : [...current, product]
        );
        setDataMessage(
          `Novo produto ${sku} criado e gravado. Preencha os custos e clique em "Aplicar custos internos".`
        );
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel gravar o novo produto."
        );
      } finally {
        setIsSavingProduct(false);
      }
      return;
    }

    setDataMessage(
      `Novo produto ${sku} pronto para calculo (modo demo). Preencha os custos e salve.`
    );
  }

  function importSaleToCalculator(sale: SalesDetailRow) {
    if (calculatorManagedSkuSet.has(sale.sku)) {
      setDataMessage(
        `O SKU ${sale.sku} ja foi calculado. Exclua os produtos calculados se quiser recomecar.`
      );
      return;
    }

    // Remove o SKU de hiddenSkus (caso tenha sido arquivado anteriormente),
    // garantindo que ele apareça em productOptions e não seja resetado pelo useEffect.
    setHiddenSkus((current) => current.filter((hiddenSku) => hiddenSku !== sale.sku));

    const unitPrice =
      sale.unitPrice > 0
        ? sale.unitPrice
        : sale.quantity > 0
          ? sale.grossAmount / sale.quantity
          : 0;
    const commissionPercentage =
      sale.grossAmount > 0 ? (sale.marketplaceFee / sale.grossAmount) * 100 : 0;
    const sellerShippingUnit =
      sale.quantity > 0 ? sale.shippingSeller / sale.quantity : 0;

    setCalculatorForm((current) => ({
      ...current,
      sku: sale.sku,
      name: sale.title,
      productCost: "",
      sellingPrice:
        unitPrice > 0 ? inputNumber(unitPrice) : current.sellingPrice,
      commissionPercentage:
        commissionPercentage > 0
          ? commissionPercentage.toFixed(2)
          : current.commissionPercentage,
      fixedFee: "",
      shippingCost:
        sellerShippingUnit > 0 ? inputNumber(sellerShippingUnit) : "",
      packagingCost: "",
      collectionCost: "",
      storageCost: "",
      operationalCost: "",
      taxPercentage: "",
      adTacosPercentage: ""
    }));
    setActiveView("custos");
    setDataMessage(
      `Venda ${sale.orderId} importada para a Calculadora no SKU ${sale.sku}.`
    );
  }

  function startEditingProduct(product: CostCenterProductRow) {
    setEditingProductSku(product.sku);
    setProductEditForm({
      sku: product.sku,
      title: product.title
    });
    setDataMessage(`Editando cadastro do SKU ${product.sku}.`);
  }

  function cancelProductEditing() {
    setEditingProductSku(null);
    setProductEditForm({ sku: "", title: "" });
    setDataMessage(null);
  }

  async function saveProductEdit(originalSku: string) {
    const nextSku = productEditForm.sku.trim();
    const nextTitle = productEditForm.title.trim();

    if (!nextSku || !nextTitle) {
      setDataMessage("Preencha SKU e produto antes de salvar.");
      return;
    }

    if (supabaseClient && organization) {
      setIsSavingProduct(true);
      setDataMessage(null);

      try {
        const currentProduct =
          realProducts.find((product) => product.internal_sku === originalSku) ??
          (await ensureProductForSku(originalSku, nextTitle));

        const { error } = await supabaseClient
          .from("products")
          .update({
            internal_sku: nextSku,
            title: nextTitle,
            status: "active"
          })
          .eq("id", currentProduct.id);

        if (error) throw error;

        await loadCostCenter(organization.id);
        setCosts((current) =>
          current.map((cost) =>
            cost.sku === originalSku ? { ...cost, sku: nextSku } : cost
          )
        );
        setHiddenSkus((current) =>
          current.filter(
            (hiddenSku) => hiddenSku !== originalSku && hiddenSku !== nextSku
          )
        );
        cancelProductEditing();
        setDataMessage(`SKU ${nextSku} atualizado.`);
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel atualizar o SKU."
        );
      } finally {
        setIsSavingProduct(false);
      }

      return;
    }

    setCosts((current) =>
      current.map((cost) =>
        cost.sku === originalSku ? { ...cost, sku: nextSku } : cost
      )
    );
    setCalculatorForm((current) => ({
      ...current,
      sku: current.sku === originalSku ? nextSku : current.sku,
      name: current.sku === originalSku ? nextTitle : current.name
    }));
    setHiddenSkus((current) =>
      current.filter(
        (hiddenSku) => hiddenSku !== originalSku && hiddenSku !== nextSku
      )
    );
    cancelProductEditing();
    setDataMessage("SKU atualizado em modo demonstracao.");
  }

  async function archiveProduct(product: CostCenterProductRow) {
    const confirmed = window.confirm(
      `Excluir o SKU ${product.sku} do Centro de Custos? As vendas ja sincronizadas serao preservadas.`
    );

    if (!confirmed) return;

    if (supabaseClient && organization) {
      setIsSavingProduct(true);
      setDataMessage(null);

      try {
        const currentProduct =
          realProducts.find(
            (productRecord) => productRecord.internal_sku === product.sku
          ) ?? (await ensureProductForSku(product.sku, product.title));

        // Exclui TODOS os sku_costs do produto antes de arquivar,
        // para evitar que custos antigos (inclusive customizados) reapareçam
        // quando o produto for reativado no futuro.
        const { error: deleteCostsError } = await supabaseClient
          .from("sku_costs")
          .delete()
          .eq("organization_id", organization.id)
          .eq("product_id", currentProduct.id);

        if (deleteCostsError) throw deleteCostsError;

        const { error } = await supabaseClient
          .from("products")
          .update({ status: "archived" })
          .eq("id", currentProduct.id);

        if (error) throw error;

        await loadCostCenter(organization.id);
        setHiddenSkus((current) =>
          current.includes(product.sku) ? current : [...current, product.sku]
        );
        setCosts((current) =>
          current.filter((cost) => cost.sku !== product.sku)
        );
        setCalculatorResults((current) => {
          if (!(product.sku in current)) return current;
          const next = { ...current };
          delete next[product.sku];
          return next;
        });

        if (editingProductSku === product.sku) {
          cancelProductEditing();
        }

        if (calculatorForm.sku === product.sku) {
          const nextProduct = productOptions.find(
            (option) => option.sku !== product.sku
          );

          if (nextProduct) {
            setCalculatorForm((current) => ({
              ...current,
              sku: nextProduct.sku,
              name: nextProduct.title
            }));
          }
        }

        setDataMessage(`SKU ${product.sku} excluido do Centro de Custos.`);
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel excluir o SKU."
        );
      } finally {
        setIsSavingProduct(false);
      }

      return;
    }

    setHiddenSkus((current) =>
      current.includes(product.sku) ? current : [...current, product.sku]
    );
    setCosts((current) => current.filter((cost) => cost.sku !== product.sku));
    setCalculatorResults((current) => {
      if (!(product.sku in current)) return current;
      const next = { ...current };
      delete next[product.sku];
      return next;
    });

    if (editingProductSku === product.sku) {
      cancelProductEditing();
    }

    setDataMessage("SKU removido em modo demonstracao.");
  }

  async function saveCalculatorCosts() {
    const entries = buildCalculatorCostEntries(calculatorForm);

    if (!calculatorForm.sku) {
      setDataMessage("Selecione um SKU para salvar os custos internos.");
      return;
    }

    // Guarda o resultado exato da calculadora (preco, lucro e margem) para que o
    // Centro de Custos exiba o mesmo valor, sem recalcular a partir das vendas.
    // Funciona em ambos os fluxos (Supabase e demo) e nao depende de migracao.
    const storedResult: StoredCalculatorResult = {
      sellingPrice:
        calculatorResult?.sellingPrice ??
        numberFromInput(calculatorForm.sellingPrice),
      netProfit: calculatorResult?.netProfit ?? 0,
      profitMargin: calculatorResult?.profitMargin ?? 0
    };
    setCalculatorResults((current) => {
      if (calculatorResult) {
        return { ...current, [calculatorForm.sku]: storedResult };
      }
      // Sem resultado valido (campos incompletos): remove qualquer cache antigo.
      const next = { ...current };
      delete next[calculatorForm.sku];
      return next;
    });

    // Usa a empresa do estado (carregada quando logado); se nao houver, tenta
    // resolver via Supabase (que valida a sessao). So cai no modo local quando
    // realmente nao ha empresa/sessao.
    const org = organization ?? (await resolveOrganization());

    if (supabaseClient && org) {
      setIsSavingCalculatorCosts(true);
      setDataMessage(null);

      try {
        const product = await ensureProductForSku(
          calculatorForm.sku,
          calculatorForm.name || calculatorForm.sku,
          org
        );

        // O resultado da calculadora (preco, lucro e margem) ja foi gravado em
        // localStorage (calculatorResults), que e a fonte usada pelo Centro de
        // Custos. Nao gravamos colunas reference_* no banco para nao depender de
        // migracao e nao quebrar o save caso as colunas nao existam.

        // Remove TODOS os custos do produto (não só os gerenciados pela calculadora)
        // para garantir limpeza completa antes de reinserir, inclusive custos customizados
        // que poderiam causar cálculos incorretos ao reutilizar um produto reativado.
        const { error: deleteCostError } = await supabaseClient
          .from("sku_costs")
          .delete()
          .eq("organization_id", org.id)
          .eq("product_id", product.id);

        if (deleteCostError) throw deleteCostError;

        if (entries.length > 0) {
          const { error: costError } = await supabaseClient.from("sku_costs").insert(
            entries.map((entry) => ({
              organization_id: org.id,
              product_id: product.id,
              cost_name: entry.label,
              cost_category: entry.category,
              allocation_method: entry.allocation,
              amount: entry.amount,
              valid_from: calculatorForm.validFrom
            }))
          );

          if (costError) throw costError;
        }

        await loadCostCenter(org.id);
        replaceLocalCalculatorCostsForSku(
          calculatorForm.sku,
          entries,
          calculatorForm.validFrom
        );
        setRealProducts((current) => {
          const nextProduct = {
            id: product.id,
            internal_sku: product.internal_sku,
            title: calculatorForm.name || product.title || product.internal_sku,
            status: "active" as ProductStatus
          };

          if (
            current.some(
              (currentProduct) =>
                currentProduct.internal_sku === product.internal_sku
            )
          ) {
            return current.map((currentProduct) =>
              currentProduct.internal_sku === product.internal_sku
                ? nextProduct
                : currentProduct
            );
          }

          return [...current, nextProduct];
        });
        setHiddenSkus((current) =>
          current.filter((hiddenSku) => hiddenSku !== calculatorForm.sku)
        );
        setProductMarketplaces((current) => ({
          ...current,
          [calculatorForm.sku]: MARKETPLACE_GROUPS[selectedPreset]
        }));
        setDataMessage(
          entries.length > 0
            ? `Custos da calculadora atualizados no SKU ${calculatorForm.sku}.`
            : `Custos da calculadora removidos do SKU ${calculatorForm.sku}.`
        );
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel salvar os custos da calculadora."
        );
      } finally {
        setIsSavingCalculatorCosts(false);
      }

      return;
    }

    replaceLocalCalculatorCostsForSku(
      calculatorForm.sku,
      entries,
      calculatorForm.validFrom
    );
    setDataMessage(
      entries.length > 0
        ? `Custos simulados atualizados no SKU ${calculatorForm.sku}.`
        : `Custos simulados removidos do SKU ${calculatorForm.sku}.`
    );
  }

  async function resetCalculatedProducts() {
    const confirmed = window.confirm(
      "Excluir todos os produtos calculados pela Calculadora de Custos? As vendas, SKUs sincronizados e dados do Mercado Livre serao preservados."
    );

    if (!confirmed) return;

    if (supabaseClient && organization) {
      setIsResettingCalculatorCosts(true);
      setDataMessage(null);

      try {
        const { error } = await supabaseClient
          .from("sku_costs")
          .delete()
          .eq("organization_id", organization.id)
          .in("cost_name", [...CALCULATOR_COST_LABELS]);

        if (error) throw error;

        setCosts((current) =>
          current.filter((cost) => !isCalculatorManagedCost(cost))
        );
        setCalculatorResults({});
        await loadCostCenter(organization.id);
        setDataMessage(
          "Produtos calculados antigos excluidos. A partir de agora, somente SKUs recalculados pela Calculadora aparecerao nas analises unitarias."
        );
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel excluir os produtos calculados."
        );
      } finally {
        setIsResettingCalculatorCosts(false);
      }

      return;
    }

    setCosts((current) =>
      current.filter((cost) => !isCalculatorManagedCost(cost))
    );
    setCalculatorResults({});
    setDataMessage(
      "Produtos calculados simulados excluidos. Recalcule os SKUs que deseja acompanhar."
    );
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    setSupabaseStatus("demo");
    setOrganization(null);
    setRealProducts([]);
    setRealSales([]);
    setRealSaleDetails([]);
    setRealInventory([]);
    setRealAdvertising([]);
    setRealPromotions([]);
    setMarketplaceAccounts([]);
    setSyncSummary(null);
    setOrdersSyncSummary(null);
    setInventorySyncSummary(null);
    setAdvertisingSyncSummary(null);
    setPromotionsSyncSummary(null);
    setAuditResults(null);
    setCosts(costsSeed);
    setHiddenSkus([]);
    setEditingProductSku(null);
    setDataMessage("Sessao encerrada.");
  }

  async function diagnoseMercadoLivreConnection(prefix?: string) {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de diagnosticar o Mercado Livre.");
      return null;
    }

    setIsDiagnosingMarketplace(true);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const response = await fetch(
        "/api/marketplaces/mercadolivre/diagnostics",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({ organizationId: organization.id })
        }
      );
      const payload = await readApiPayload<MercadoLivreDiagnosticsResponse>(
        response
      );

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Nao foi possivel diagnosticar o conector.")
        );
      }

      const diagnostics = payload as MercadoLivreDiagnosticsResponse;
      setMarketplaceDiagnostics(diagnostics);
      setDataMessage(
        prefix ? `${prefix} Diagnostico: ${diagnostics.summary}` : diagnostics.summary
      );

      return diagnostics;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel diagnosticar o conector Mercado Livre.";
      setDataMessage(prefix ? `${prefix} Diagnostico: ${message}` : message);
      return null;
    } finally {
      setIsDiagnosingMarketplace(false);
    }
  }

  async function generateOpenAiBusinessAnalysis() {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de gerar a analise com IA.");
      return;
    }

    setIsGeneratingAiAnalysis(true);
    setDataMessage(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const topProducts = productUnitRows
        .filter((product) => product.hasSales)
        .sort((current, next) => next.grossRevenue - current.grossRevenue)
        .slice(0, 15)
        .map((product) => ({
          sku: product.sku,
          title: product.title,
          units: product.units,
          orders: product.orders,
          grossRevenue: product.grossRevenue,
          averagePrice: product.averagePrice,
          totalCostUnit: product.totalCostUnit,
          contributionMarginUnit: product.contributionMarginUnit,
          contributionMarginRate: product.contributionMarginRate,
          advertisingAmount: product.advertisingAmount,
          advertisingUnit: product.advertisingUnit,
          tacosRate: product.tacosRate,
          attributedRevenue: product.attributedRevenue
        }));

      const recentSales = salesDetailRows.slice(0, 15).map((sale) => ({
        orderId: sale.orderId,
        sku: sale.sku,
        title: sale.title,
        soldAt: sale.soldAt,
        status: sale.status,
        quantity: sale.quantity,
        grossAmount: sale.grossAmount,
        marketplaceFee: sale.marketplaceFee,
        shippingBuyer: sale.shippingBuyer,
        shippingSeller: sale.shippingSeller,
        costAmount: sale.costAmount,
        taxAmount: sale.taxAmount,
        contributionMargin: sale.contributionMargin,
        marginRate: sale.marginRate
      }));

      const response = await fetch("/api/ai/business-analysis", {
        body: JSON.stringify({
          organizationId: organization.id,
          generatedAt: new Date().toISOString(),
          source: {
            demoData: shouldUseDemoData,
            connectedAccount: mercadoLivreAccount?.account_name ?? null,
            connectedSellerId: mercadoLivreAccount?.external_seller_id ?? null,
            products: productOptions.length,
            costs: costs.length,
            salesRows: salesDetailRows.length
          },
          overview: {
            aiBusinessScore,
            marginRate,
            totals,
            salesDetailTotals,
            productUnitTotals
          },
          trend: aiSalesTrend,
          ads: aiAdsMetrics,
          inventory: inventoryValuationTotals,
          finance: {
            company: companyFinanceTotals,
            companyByCategory: companyFinanceByCategory.slice(0, 10),
            personal: personalFinanceTotals,
            loans: personalLoanTotals
          },
          localInsights: aiInsights,
          prioritySkus: aiSkuPriorities,
          topProducts,
          recentSales
        }),
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        method: "POST"
      });
      const payload = await readApiPayload<OpenAiBusinessAnalysisResponse>(
        response
      );

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Nao foi possivel gerar a analise com IA.")
        );
      }

      const result = payload as OpenAiBusinessAnalysisResponse;
      setOpenAiAnalysis(result.analysis);
      setDataMessage(`Analise OpenAI gerada com ${result.model}.`);
    } catch (error) {
      setDataMessage(errorMessage(error, "Nao foi possivel gerar a analise com IA."));
    } finally {
      setIsGeneratingAiAnalysis(false);
    }
  }

  async function connectMercadoLivre() {
    if (supabaseStatus !== "connected") {
      setDataMessage("Entre no DASHMARKET antes de conectar o Mercado Livre.");
      return;
    }

    if (!organization) {
      setDataMessage("Usuario autenticado, mas sem empresa vinculada.");
      return;
    }

    setIsConnectingMarketplace(true);
    setDataMessage(null);
    setMarketplaceDiagnostics(null);

    try {
      const response = await fetch(
        `/api/marketplaces/mercadolivre/auth-url?organizationId=${organization.id}&siteId=MLB`
      );
      const payload = await readApiPayload<{ url?: string }>(response);
      const authPayload = payload as { url?: string } & ApiErrorPayload;

      if (!response.ok || !authPayload.url) {
        throw new Error(
          apiErrorMessage(payload, "Nao foi possivel iniciar a conexao.")
        );
      }

      window.location.href = authPayload.url;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel conectar o Mercado Livre.";
      setDataMessage(message);
      await diagnoseMercadoLivreConnection(message);
      setIsConnectingMarketplace(false);
    }
  }

  async function syncMercadoLivreListings() {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de sincronizar anuncios.");
      return;
    }

    setIsSyncingListings(true);
    setDataMessage(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const response = await fetch("/api/marketplaces/mercadolivre/sync-listings", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ organizationId: organization.id })
      });

      const payload = (await response.json()) as
        | SyncListingsSummary
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Nao foi possivel sincronizar anuncios."
        );
      }

      setSyncSummary(payload as SyncListingsSummary);
      setDataMessage(
        `Sincronizacao concluida: ${(payload as SyncListingsSummary).syncedListings} anuncios e ${(payload as SyncListingsSummary).syncedProducts} SKUs.`
      );
      await loadCostCenter(organization.id);
      await loadMarketplaceAccounts(organization.id);
      await loadSyncRuns(organization.id);
    } catch (error) {
      setDataMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel sincronizar anuncios."
      );
    } finally {
      setIsSyncingListings(false);
    }
  }

  async function syncMercadoLivreOrders() {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de sincronizar vendas.");
      return;
    }

    setIsSyncingOrders(true);
    setDataMessage(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const response = await fetch("/api/marketplaces/mercadolivre/sync-orders", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          organizationId: organization.id,
          daysBack: daysBackFromDate(salesFilters.dateFrom),
          dateFrom: salesFilters.dateFrom,
          // Sempre sincroniza até hoje, independente do filtro de exibição
          dateTo: dateOnly(new Date())
        })
      });

      const payload = (await response.json()) as
        | SyncOrdersSummary
        | { background?: boolean; syncRunId?: string; accountName?: string; dateFrom?: string; dateTo?: string; daysBack?: number }
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Nao foi possivel sincronizar vendas."
        );
      }

      // 202 = sync iniciado em background
      if (response.status === 202 && "background" in payload && payload.background) {
        const bg = payload as { accountName?: string; dateFrom?: string; dateTo?: string; daysBack?: number };
        const periodo = bg.dateFrom && bg.dateTo
          ? `de ${new Date(`${bg.dateFrom}T00:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${bg.dateTo}T00:00:00`).toLocaleDateString("pt-BR")}`
          : `dos últimos ${bg.daysBack ?? 7} dias`;
        setDataMessage(`Sincronização iniciada em background (${periodo}). Atualizando em 20 segundos...`);
        await loadSyncRuns(organization.id);

        // Aguarda 20 segundos e recarrega as vendas automaticamente
        await new Promise((resolve) => setTimeout(resolve, 20000));
        await loadSales(organization.id);
        await loadCostCenter(organization.id);
        await loadMarketplaceAccounts(organization.id);
        await loadSyncRuns(organization.id);
        setDataMessage(`Vendas atualizadas (${periodo}). Confira o Histórico de Sincronização para detalhes.`);
        return;
      }

      // 200 legacy (caso o endpoint ainda retorne síncrono)
      const summary = payload as SyncOrdersSummary;
      setOrdersSyncSummary(summary);
      const syncedPeriod =
        summary.dateFrom && summary.dateTo
          ? `no periodo de ${new Date(`${summary.dateFrom}T00:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${summary.dateTo}T00:00:00`).toLocaleDateString("pt-BR")}`
          : `dos ultimos ${summary.daysBack} dias`;
      setDataMessage(
        `Vendas sincronizadas: ${summary.syncedOrders} pedidos e ${summary.syncedItems} itens ${syncedPeriod}.`
      );
      await loadCostCenter(organization.id);
      await loadSales(organization.id);
      await loadMarketplaceAccounts(organization.id);
      await loadSyncRuns(organization.id);
    } catch (error) {
      setDataMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel sincronizar vendas."
      );
    } finally {
      setIsSyncingOrders(false);
    }
  }

  async function auditMercadoLivreOrders() {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de auditar vendas.");
      return;
    }

    const orderIds = Array.from(
      new Set(
        auditOrderIds
          .split(/[\s,;]+/)
          .map((orderId) => orderId.trim())
          .filter(Boolean)
      )
    );

    if (orderIds.length === 0) {
      setDataMessage("Informe ao menos um numero de venda para auditar.");
      return;
    }

    setIsAuditingOrders(true);
    setDataMessage(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const response = await fetch("/api/marketplaces/mercadolivre/audit-orders", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          organizationId: organization.id,
          orderIds
        })
      });
      const payload = await readApiPayload<AuditOrdersResponse>(response);

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Nao foi possivel auditar as vendas.")
        );
      }

      const auditPayload = payload as AuditOrdersResponse;
      const riskyOrders = auditPayload.orders.filter(
        (order) => order.comparison.revenueRisk
      );

      setAuditResults(auditPayload);
      setDataMessage(
        riskyOrders.length > 0
          ? `${riskyOrders.length} venda(s) precisam de ajuste no faturamento.`
          : "Auditoria concluida sem risco de faturamento nesses pedidos."
      );
    } catch (error) {
      setDataMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel auditar as vendas."
      );
    } finally {
      setIsAuditingOrders(false);
    }
  }

  async function syncMercadoLivreInventory() {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de sincronizar estoque.");
      return;
    }

    setIsSyncingInventory(true);
    setDataMessage(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const response = await fetch("/api/marketplaces/mercadolivre/sync-inventory", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ organizationId: organization.id })
      });

      const payload = (await response.json()) as
        | SyncInventorySummary
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Nao foi possivel sincronizar estoque."
        );
      }

      const summary = payload as SyncInventorySummary;
      setInventorySyncSummary(summary);
      setDataMessage(
        `Estoque Full sincronizado: ${summary.fullSnapshots} snapshots do Full.`
      );
      await loadCostCenter(organization.id);
      await loadInventory(organization.id);
      await loadMarketplaceAccounts(organization.id);
      await loadSyncRuns(organization.id);
    } catch (error) {
      setDataMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel sincronizar estoque."
      );
    } finally {
      setIsSyncingInventory(false);
    }
  }

  async function syncMercadoLivreAdvertising() {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de sincronizar publicidade.");
      return;
    }

    setIsSyncingAdvertising(true);
    setDataMessage(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const response = await fetch("/api/marketplaces/mercadolivre/sync-advertising", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ organizationId: organization.id, daysBack: 30 })
      });

      const payload = await readApiPayload<SyncAdvertisingSummary>(response);

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Nao foi possivel sincronizar publicidade.")
        );
      }

      const summary = payload as SyncAdvertisingSummary;
      setAdvertisingSyncSummary(summary);
      setDataMessage(
        `Publicidade sincronizada: ${summary.metrics} metricas e ${summary.campaigns} campanhas.${
          summary.warnings?.length ? ` Aviso: ${summary.warnings[0]}` : ""
        }`
      );
      await loadAdvertising(organization.id);
      await loadMarketplaceAccounts(organization.id);
    } catch (error) {
      setDataMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel sincronizar publicidade."
      );
    } finally {
      setIsSyncingAdvertising(false);
    }
  }

  async function syncMercadoLivreAdAnalysis() {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de analisar anuncios.");
      return;
    }

    setIsSyncingAdAnalysis(true);
    setDataMessage(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const response = await fetch(
        "/api/marketplaces/mercadolivre/ad-analysis/sync",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            listingInput: adAnalysisTarget.trim(),
            limit: adAnalysisTarget.trim() ? 5 : 50,
            organizationId: organization.id
          })
        }
      );
      const payload = await readApiPayload<AdAnalysisSyncSummary>(response);

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Nao foi possivel analisar anuncios.")
        );
      }

      const summary = payload as AdAnalysisSyncSummary;
      setAdAnalysisSyncSummary(summary);
      setDataMessage(
        `Analise de anuncios concluida: ${summary.analytics} anuncios e ${summary.alerts} alertas.${
          summary.warnings?.length ? ` Aviso: ${summary.warnings[0]}` : ""
        }`
      );
      await loadAdAnalysis(organization.id);
      await loadSyncRuns(organization.id);
    } catch (error) {
      setDataMessage(errorMessage(error, "Nao foi possivel analisar anuncios."));
    } finally {
      setIsSyncingAdAnalysis(false);
    }
  }

  async function searchMercadoLivreProductOpportunities() {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de buscar oportunidades.");
      return;
    }

    const categoryId = opportunityForm.categoryId.trim();
    const query = opportunityForm.query.trim();

    if (!categoryId && !query) {
      setDataMessage("Informe uma categoria ou um termo de busca.");
      return;
    }

    setIsSearchingOpportunities(true);
    setDataMessage(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const response = await fetch(
        "/api/marketplaces/mercadolivre/product-opportunities",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            categoryId,
            limit: 40,
            organizationId: organization.id,
            query
          })
        }
      );
      const payload =
        await readApiPayload<ProductOpportunitySearchResponse>(response);

      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Nao foi possivel buscar oportunidades.")
        );
      }

      const result = payload as ProductOpportunitySearchResponse;
      setOpportunityForm((current) => ({
        ...current,
        categoryId: current.categoryId || result.categoryId
      }));
      setDataMessage(
        `Oportunidades atualizadas: ${result.results.length} produtos em ${result.categoryName ?? result.categoryId}.`
      );
      await loadAdAnalysis(organization.id);
    } catch (error) {
      setDataMessage(errorMessage(error, "Nao foi possivel buscar oportunidades."));
    } finally {
      setIsSearchingOpportunities(false);
    }
  }

  async function syncMercadoLivrePromotions() {
    if (!supabaseClient || !organization) {
      setDataMessage("Entre no DASHMARKET antes de sincronizar promocoes.");
      return;
    }

    setIsSyncingPromotions(true);
    setDataMessage(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const response = await fetch("/api/marketplaces/mercadolivre/sync-promotions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ organizationId: organization.id })
      });

      const payload = (await response.json()) as
        | SyncPromotionsSummary
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Nao foi possivel sincronizar promocoes."
        );
      }

      const summary = payload as SyncPromotionsSummary;
      setPromotionsSyncSummary(summary);
      setDataMessage(
        `Promocoes sincronizadas: ${summary.promotions} campanhas, ${summary.activePromotions} ativas.`
      );
      await loadPromotions(organization.id);
      await loadMarketplaceAccounts(organization.id);
    } catch (error) {
      setDataMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel sincronizar promocoes."
      );
    } finally {
      setIsSyncingPromotions(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("ml_status");
    const detail = params.get("ml_detail");

    if (!status) return;

    const messages: Record<string, string> = {
      connected: "Mercado Livre conectado com sucesso.",
      invalid_callback: "Retorno do Mercado Livre invalido.",
      missing_env: "Variaveis do Mercado Livre nao configuradas no ambiente.",
      connection_error: "Nao foi possivel concluir a conexao com o Mercado Livre.",
      token_error: "Mercado Livre recusou a troca do codigo. Confira Client ID, Client Secret e URL de callback.",
      user_error: "Conexao autorizada, mas nao foi possivel ler o vendedor no Mercado Livre.",
      save_error: "Conexao autorizada, mas nao foi possivel salvar a conta no Supabase."
    };

    const message = messages[status] ?? "Retorno do Mercado Livre recebido.";
    setDataMessage(detail ? `${message} Detalhe: ${detail}` : message);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Atualiza dateTo para hoje toda vez que o usuário entra na view de vendas
  // Evita que o filtro fique travado na data em que a página foi carregada
  useEffect(() => {
    if (activeView === "vendas") {
      const hoje = dateOnly(new Date());
      setSalesFilters((current) => {
        if (current.dateTo === hoje) return current;
        return { ...current, dateTo: hoje };
      });
    }
  }, [activeView]);

  // Carrega status de conciliação MP para exibir badges nas vendas
  useEffect(() => {
    if (activeView !== "vendas" || !supabaseClient || !organization) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabaseClient
          .from("mp_payment_imports")
          .select("ml_order_id, match_status, amount_difference, shipping_difference")
          .eq("organization_id", organization.id)
          .in("match_status", ["matched", "amount_mismatch"]);
        if (cancelled || !data) return;
        const map = new Map<string, ReconciliationStatus>();
        for (const row of data as Array<{
          ml_order_id: string | null;
          match_status: string;
          amount_difference: number | null;
          shipping_difference: number | null;
        }>) {
          if (!row.ml_order_id) continue;
          // Em caso de múltiplas importações pro mesmo pedido, manter a pior divergência
          const existing = map.get(row.ml_order_id);
          const status = row.match_status as ReconciliationStatus["matchStatus"];
          if (!existing || (status === "amount_mismatch" && existing.matchStatus === "matched")) {
            map.set(row.ml_order_id, {
              matchStatus: status,
              amountDifference: Number(row.amount_difference ?? 0),
              shippingDifference: Number(row.shipping_difference ?? 0)
            });
          }
        }
        setReconciliationMap(map);
      } catch {
        // silencioso — badge de conciliação é informativo, não crítico
      }
    })();
    return () => { cancelled = true; };
  }, [activeView, supabaseClient, organization]);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        activeView={activeView}
        badges={{ pos_venda: claimsData ? (claimsData.summary.urgent + claimsData.summary.expired + (questionsData?.total ?? 0)) : undefined }}
        onViewChange={async (view) => {
          setActiveView(view);
          if (view === "pos_venda" && organization && supabaseClient && !reputation && !questionsData && !claimsData) {
            setIsLoadingReputation(true);
            setIsLoadingQuestions(true);
            setIsLoadingClaims(true);
            try {
              const { data: sessionData } = await supabaseClient.auth.getSession();
              const accessToken = sessionData.session?.access_token;
              if (accessToken) {
                await loadPosVenda(organization.id, accessToken);
              }
            } finally {
              setIsLoadingReputation(false);
              setIsLoadingQuestions(false);
              setIsLoadingClaims(false);
            }
          }
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <ThemeToggle />
            {supabaseStatus === "connected" ? (
              <button
                aria-label="Sair"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                onClick={signOut}
                title="Sair"
                type="button"
              >
                <LogOut aria-hidden className="h-4 w-4 shrink-0" />
                <span>Sair</span>
              </button>
            ) : (
              <Link
                aria-label="Entrar"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 shadow-sm"
                href="/login"
                title="Entrar"
              >
                <ShieldCheck aria-hidden className="h-4 w-4 shrink-0" />
                <span>Entrar</span>
              </Link>
            )}
          </div>
        </header>

        <section className="min-w-0 px-4 py-8 sm:px-6 lg:px-8">
        {activeView === "principal" && (
          <div className="space-y-8">
            <header className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Visão Operacional
                </p>
                <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
                  Margem, estoque e crescimento
                </h1>
              </div>

              <div className="relative block w-full xl:w-96">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-medium outline-none transition focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400"
                  onChange={(event) => setSkuFilter(event.target.value)}
                  placeholder="Buscar SKU ou produto"
                  value={skuFilter}
                />
              </div>
            </header>

            <KpiSection cols={5}>
              <KpiCard
                detail={`${formatNumber.format(salesDetailTotals.quantity)} unidades vendidas`}
                icon={CircleDollarSign}
                title="Receita do período"
                value={formatCurrency.format(salesDetailTotals.grossAmount)}
              />
              <KpiCard
                detail={`${formatPercent(marginRate)} sobre receita líquida`}
                icon={Percent}
                title="Margem de Contribuição"
                tone={marginRate < 0.18 ? "clay" : "moss"}
                value={formatCurrency.format(totals.contributionMargin)}
              />
              <KpiCard
                detail="Custo produto + embalagem"
                icon={WalletCards}
                title="Custos Totais"
                tone="clay"
                value={formatCurrency.format(totals.skuCosts)}
              />
              <KpiCard
                detail="Investimento em anúncios"
                icon={Megaphone}
                title="Publicidade"
                tone="berry"
                value={formatCurrency.format(totals.advertisingCosts)}
              />
              <KpiCard
                detail={`${formatNumber.format(inventoryValuationTotals.fullSkuCount)} SKUs no Full`}
                icon={Boxes}
                title="Valor Estoque Full"
                tone={inventoryValuationTotals.fullInvestedValue < 0 ? "berry" : "moss"}
                trend={inventoryValuationTotals.fullInvestedValue < 0 ? "down" : "up"}
                value={formatCurrency.format(inventoryValuationTotals.fullInvestedValue)}
              />
            </KpiSection>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pedidos aprovados</p>
                    <p className="font-data mt-1 text-2xl font-bold tracking-tight text-ink">{formatNumber.format(salesDetailTotals.orders)}</p>
                  </div>
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-100 text-slate-600">
                    <ClipboardList aria-hidden className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-4 text-xs font-medium text-slate-500/80">
                  {salesDetailTotals.orders > 0
                    ? `Ticket médio ${formatCurrency.format(salesDetailTotals.grossAmount / salesDetailTotals.orders)}`
                    : "Sem pedidos no período"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Taxa de Marketplace</p>
                    <p className="font-data mt-1 text-2xl font-bold tracking-tight text-ink">{formatCurrency.format(salesDetailTotals.marketplaceFee)}</p>
                  </div>
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-100 text-rose-600">
                    <Tags aria-hidden className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-4 text-xs font-medium text-slate-500/80">
                  {salesDetailTotals.grossAmount > 0
                    ? `${formatPercent(salesDetailTotals.marketplaceFee / salesDetailTotals.grossAmount)} da receita bruta`
                    : "Comissões e taxas do ML"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Frete vendedor</p>
                    <p className="font-data mt-1 text-2xl font-bold tracking-tight text-ink">{formatCurrency.format(salesDetailTotals.shippingSeller)}</p>
                  </div>
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-100 text-amber-600">
                    <PackageCheck aria-hidden className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-4 text-xs font-medium text-slate-500/80">
                  Frete comprador: {formatCurrency.format(salesDetailTotals.shippingBuyer)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estoque total (todos canais)</p>
                    <p className="font-data mt-1 text-2xl font-bold tracking-tight text-ink">{formatNumber.format(inventoryValuationTotals.totalQuantity)} un.</p>
                  </div>
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-teal-50 ring-1 ring-inset ring-teal-100 text-teal-600">
                    <PackagePlus aria-hidden className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-4 text-xs font-medium text-slate-500/80">
                  {formatNumber.format(inventoryValuationTotals.skuCount)} SKUs · Valor líquido total {formatCurrency.format(inventoryValuationTotals.investedValue)}
                </p>
              </div>
            </div>

          {(dataMessage || supabaseStatus === "connected") && (
            <section className="mt-4 rounded-lg border border-black/10 bg-white px-4 py-3 text-sm shadow-sm">
              <p className="font-semibold text-ink">
                {supabaseStatus === "connected"
                  ? `Supabase conectado${organization ? `: ${organization.name}` : ""}`
                  : "Modo demonstrativo"}
              </p>
              <p className="mt-1 text-black/60">
                {dataMessage ??
                  (realSales.length > 0
                    ? "A margem ja esta usando vendas reais sincronizadas do Mercado Livre."
                    : "Custos cadastrados nesta tela ja sao salvos no banco. Vendas, estoque e publicidade seguem demonstrativos ate sincronizarmos o Mercado Livre.")}
              </p>
              {marketplaceDiagnostics && (
                <div className="mt-3 grid gap-2">
                  <div className="flex flex-col gap-1 rounded-lg bg-paper px-3 py-2 ring-1 ring-black/10">
                    <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                      Diagnostico Mercado Livre
                    </p>
                    <p className="font-semibold text-ink">
                      {marketplaceDiagnostics.summary}
                    </p>
                    {marketplaceDiagnostics.redirectUri && (
                      <p className="text-xs text-black/55">
                        Callback: {marketplaceDiagnostics.redirectUri}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {marketplaceDiagnostics.checks.map((check) => (
                      <div
                        className={`rounded-lg px-3 py-2 ring-1 ${
                          check.status === "ok"
                            ? "bg-emerald-50 ring-emerald-100"
                            : check.status === "warning"
                              ? "bg-amber-50 ring-amber-100"
                              : "bg-rose-50 ring-rose-100"
                        }`}
                        key={`${check.label}-${check.message}`}
                      >
                        <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                          {check.label}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-ink">
                          {check.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {syncSummary && (
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {[
                    ["Conta", syncSummary.accountName],
                    ["Anuncios", formatNumber.format(syncSummary.syncedListings)],
                    ["SKUs", formatNumber.format(syncSummary.syncedProducts)],
                    [
                      "Atualizado",
                      new Date(syncSummary.syncedAt).toLocaleString("pt-BR")
                    ]
                  ].map(([label, value]) => (
                    <div
                      className="rounded-lg bg-paper px-3 py-2 ring-1 ring-black/10"
                      key={label}
                    >
                      <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                        {label}
                      </p>
                      <p className="mt-1 font-semibold text-ink">{value}</p>
                    </div>
                  ))}
                </div>
              )}
              {ordersSyncSummary && (
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {[
                    ["Pedidos", formatNumber.format(ordersSyncSummary.syncedOrders)],
                    ["Itens", formatNumber.format(ordersSyncSummary.syncedItems)],
                    ["Receita", formatCurrency.format(ordersSyncSummary.grossAmount)],
                    [
                      "Periodo",
                      ordersSyncSummary.dateFrom && ordersSyncSummary.dateTo
                        ? `${new Date(`${ordersSyncSummary.dateFrom}T00:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${ordersSyncSummary.dateTo}T00:00:00`).toLocaleDateString("pt-BR")}`
                        : `${formatNumber.format(ordersSyncSummary.daysBack)} dias`
                    ]
                  ].map(([label, value]) => (
                    <div
                      className="rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-100"
                      key={label}
                    >
                      <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                        {label}
                      </p>
                      <p className="mt-1 font-semibold text-ink">{value}</p>
                    </div>
                  ))}
                </div>
              )}
              {inventorySyncSummary && (
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {[
                    [
                      "SKUs lidos",
                      formatNumber.format(inventorySyncSummary.skuSources)
                    ],
                    [
                      "Snapshots",
                      formatNumber.format(inventorySyncSummary.snapshots)
                    ],
                    [
                      "Full",
                      formatNumber.format(inventorySyncSummary.fullSnapshots)
                    ],
                    [
                      "Disponivel",
                      formatNumber.format(inventorySyncSummary.availableQuantity)
                    ]
                  ].map(([label, value]) => (
                    <div
                      className="rounded-lg bg-teal-50 px-3 py-2 ring-1 ring-teal-100"
                      key={label}
                    >
                      <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                        {label}
                      </p>
                      <p className="mt-1 font-semibold text-ink">{value}</p>
                    </div>
                  ))}
                </div>
              )}
              {advertisingSyncSummary && (
                <div className="mt-3 grid gap-2">
                  <div className="grid gap-2 sm:grid-cols-4">
                    {[
                      [
                        "Campanhas",
                        formatNumber.format(advertisingSyncSummary.campaigns)
                      ],
                      ["Anuncios", formatNumber.format(advertisingSyncSummary.ads)],
                      [
                        "Investimento",
                        formatCurrency.format(advertisingSyncSummary.adSpend)
                      ],
                      [
                        "Receita ads",
                        formatCurrency.format(advertisingSyncSummary.attributedRevenue)
                      ]
                    ].map(([label, value]) => (
                      <div
                        className="rounded-lg bg-rose-50 px-3 py-2 ring-1 ring-rose-100"
                        key={label}
                      >
                        <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                          {label}
                        </p>
                        <p className="mt-1 font-semibold text-ink">{value}</p>
                      </div>
                    ))}
                  </div>
                  {advertisingSyncSummary.warnings?.map((warning) => (
                    <p
                      className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-clay ring-1 ring-amber-100"
                      key={warning}
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              )}
              {promotionsSyncSummary && (
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {[
                    [
                      "Promocoes",
                      formatNumber.format(promotionsSyncSummary.promotions)
                    ],
                    [
                      "Ativas",
                      formatNumber.format(promotionsSyncSummary.activePromotions)
                    ],
                    [
                      "Novas",
                      formatNumber.format(promotionsSyncSummary.inserted)
                    ],
                    [
                      "Atualizadas",
                      formatNumber.format(promotionsSyncSummary.updated)
                    ]
                  ].map(([label, value]) => (
                    <div
                      className="rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-100"
                      key={label}
                    >
                      <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                        {label}
                      </p>
                      <p className="mt-1 font-semibold text-ink">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          </div>
        )}

          {activeView === "pos_venda" && (
            <div className="space-y-8">
              <header className="flex flex-col gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Mercado Livre</p>
                <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Pós-venda</h1>
                <p className="text-sm font-medium text-slate-500">Reputação, perguntas sem resposta e reclamações em aberto.</p>
              </header>

              {posVendaError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                  {posVendaError}
                </div>
              )}

              {/* Reputação */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 ring-1 ring-amber-100 text-amber-600">
                      <Star aria-hidden className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Reputação da Conta</h2>
                      <p className="text-xs font-medium text-slate-500">Nível, métricas e histórico de transações.</p>
                    </div>
                  </div>
                  {isLoadingReputation && (
                    <span className="text-xs font-semibold text-slate-400 animate-pulse">Carregando...</span>
                  )}
                </div>
                {reputation ? (
                  <div className="p-5 space-y-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nível</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ring-1 ${
                            reputation.levelId === "5_green" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                            reputation.levelId === "4_light_green" ? "bg-teal-50 text-teal-700 ring-teal-200" :
                            reputation.levelId === "3_yellow" ? "bg-amber-50 text-amber-700 ring-amber-200" :
                            reputation.levelId === "2_orange" ? "bg-orange-50 text-orange-700 ring-orange-200" :
                            "bg-rose-50 text-rose-700 ring-rose-200"
                          }`}>
                            {reputation.levelLabel}
                          </span>
                          {reputation.powerSellerStatus && (
                            <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                              {reputation.powerSellerStatus}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-slate-500">
                        <span className="font-semibold text-slate-700">{reputation.nickname}</span>
                        {" · "}Vendedor ID {reputation.sellerId}
                      </div>
                    </div>

                    {reputation.metrics && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {[
                          {
                            label: "Reclamações",
                            rate: reputation.metrics.claims.rate,
                            value: reputation.metrics.claims.value,
                            threshold: 0.02
                          },
                          {
                            label: "Atrasos no envio",
                            rate: reputation.metrics.delayed_handling_time.rate,
                            value: reputation.metrics.delayed_handling_time.value,
                            threshold: 0.05
                          },
                          {
                            label: "Cancelamentos",
                            rate: reputation.metrics.cancellations.rate,
                            value: reputation.metrics.cancellations.value,
                            threshold: 0.03
                          }
                        ].map((metric) => (
                          <div key={metric.label} className={`rounded-xl p-4 ring-1 ${metric.rate > metric.threshold ? "bg-rose-50 ring-rose-200" : "bg-slate-50 ring-slate-200"}`}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{metric.label}</p>
                            <p className={`mt-1 text-xl font-bold ${metric.rate > metric.threshold ? "text-rose-600" : "text-slate-900"}`}>
                              {(metric.rate * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-slate-500">{metric.value} ocorrências</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {reputation.transactions && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          ["Total vendas", formatNumber.format(reputation.transactions.total)],
                          ["Concluídas", formatNumber.format(reputation.transactions.completed)],
                          ["Canceladas", formatNumber.format(reputation.transactions.canceled.total)],
                          ["Avaliações +", formatNumber.format(reputation.transactions.ratings.positive)]
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                            <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : !isLoadingReputation ? (
                  <p className="px-5 py-8 text-center text-sm font-medium text-slate-500">
                    Clique no botão "Pós-venda" para carregar os dados.
                  </p>
                ) : null}
              </div>

              {/* Perguntas sem resposta */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 ring-1 ring-sky-100 text-sky-600">
                      <HelpCircle aria-hidden className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Perguntas sem Resposta</h2>
                      <p className="text-xs font-medium text-slate-500">
                        {questionsData ? `${questionsData.total} pergunta${questionsData.total !== 1 ? "s" : ""} aguardando resposta` : "Perguntas dos compradores."}
                      </p>
                    </div>
                  </div>
                  {questionsData && questionsData.total > 0 && (
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-sky-600 px-2 text-xs font-bold text-white">
                      {questionsData.total > 99 ? "99+" : questionsData.total}
                    </span>
                  )}
                </div>
                {questionsData ? (
                  <div className="divide-y divide-slate-100">
                    {questionsData.questions.length === 0 ? (
                      <p className="px-5 py-8 text-center text-sm font-medium text-emerald-600">
                        Nenhuma pergunta sem resposta.
                      </p>
                    ) : (
                      questionsData.questions.slice(0, 20).map((q) => {
                        const daysOld = Math.floor((Date.now() - new Date(q.date_created).getTime()) / 86400000);
                        return (
                          <div key={q.id} className="px-5 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium text-slate-800 line-clamp-2">{q.text}</p>
                              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${daysOld >= 3 ? "bg-rose-50 text-rose-600 ring-rose-200" : daysOld >= 1 ? "bg-amber-50 text-amber-600 ring-amber-200" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
                                {daysOld === 0 ? "Hoje" : `${daysOld}d`}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs font-medium text-slate-400">Anúncio {q.item_id}</p>
                          </div>
                        );
                      })
                    )}
                    {questionsData.total > 20 && (
                      <p className="px-5 py-3 text-center text-xs font-medium text-slate-400">
                        + {questionsData.total - 20} perguntas adicionais — responda no painel do Mercado Livre.
                      </p>
                    )}
                  </div>
                ) : !isLoadingQuestions ? null : (
                  <div className="px-5 py-8 text-center text-sm font-medium text-slate-400 animate-pulse">Carregando perguntas...</div>
                )}
              </div>

              {/* Reclamações */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 ring-1 ring-rose-100 text-rose-600">
                      <ShieldAlert aria-hidden className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Reclamações & Mediações</h2>
                      <p className="text-xs font-medium text-slate-500">
                        {claimsData ? `${claimsData.total} em aberto` : "Reclamações abertas no Mercado Livre."}
                      </p>
                    </div>
                  </div>
                  {claimsData && (claimsData.summary.expired > 0 || claimsData.summary.urgent > 0) && (
                    <div className="flex gap-2">
                      {claimsData.summary.expired > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white">
                          <AlertTriangle className="h-3 w-3" /> {claimsData.summary.expired} vencidas
                        </span>
                      )}
                      {claimsData.summary.urgent > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white">
                          {claimsData.summary.urgent} urgentes
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {claimsData ? (
                  <div className="space-y-0">
                    {claimsData.total > 0 && (
                      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
                        {[
                          { label: "Em mediação", value: claimsData.summary.inMediation, tone: "rose" },
                          { label: "Precisam de ação", value: claimsData.summary.needsAction, tone: "amber" },
                          { label: "Urgentes (< 24h)", value: claimsData.summary.urgent, tone: "amber" },
                          { label: "Vencidas", value: claimsData.summary.expired, tone: "rose" }
                        ].map(({ label, value, tone }) => (
                          <div key={label} className={`rounded-xl p-4 ring-1 ${value > 0 ? (tone === "rose" ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200") : "bg-slate-50 ring-slate-200"}`}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                            <p className={`mt-1 text-2xl font-bold ${value > 0 ? (tone === "rose" ? "text-rose-600" : "text-amber-600") : "text-slate-400"}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-y border-slate-200 bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-500">
                            <th className="px-5 py-3">Pedido</th>
                            <th className="px-5 py-3">Fase</th>
                            <th className="px-5 py-3">Motivo</th>
                            <th className="px-5 py-3 text-right">Prazo</th>
                            <th className="px-5 py-3">Ações disponíveis</th>
                            <th className="px-5 py-3">Aberta em</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {claimsData.claims.length === 0 ? (
                            <tr>
                              <td className="px-5 py-10 text-center font-medium text-emerald-600" colSpan={6}>
                                Nenhuma reclamação em aberto.
                              </td>
                            </tr>
                          ) : (
                            claimsData.claims.map((claim) => (
                              <tr key={claim.id} className={`transition hover:bg-slate-50 ${claim.isExpired ? "bg-rose-50/40" : claim.isUrgent ? "bg-amber-50/40" : ""}`}>
                                <td className="px-5 py-3">
                                  <p className="font-bold text-slate-900 text-xs">{claim.orderId}</p>
                                  <p className="text-[10px] text-slate-400">{claim.id}</p>
                                </td>
                                <td className="px-5 py-3">
                                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ring-1 ${
                                    claim.stage === "MEDIATION" ? "bg-rose-50 text-rose-700 ring-rose-200" :
                                    claim.stage === "DISPUTE" ? "bg-amber-50 text-amber-700 ring-amber-200" :
                                    "bg-slate-50 text-slate-600 ring-slate-200"
                                  }`}>
                                    {claim.stageLabel}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-xs font-medium text-slate-600">
                                  {claim.reasonLabel ?? claim.reasonId ?? "—"}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  {claim.hoursLeft != null ? (
                                    <span className={`text-xs font-bold ${claim.isExpired ? "text-rose-600" : claim.isUrgent ? "text-amber-600" : "text-slate-600"}`}>
                                      {claim.isExpired ? "Vencida" : `${claim.hoursLeft}h`}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-5 py-3">
                                  {claim.sellerActions.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {claim.sellerActions.map((action) => (
                                        <span key={action} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                          {action}
                                        </span>
                                      ))}
                                    </div>
                                  ) : <span className="text-xs text-slate-400">—</span>}
                                </td>
                                <td className="px-5 py-3 text-xs text-slate-400">
                                  {new Date(claim.dateCreated).toLocaleDateString("pt-BR")}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : !isLoadingClaims ? null : (
                  <div className="px-5 py-8 text-center text-sm font-medium text-slate-400 animate-pulse">Carregando reclamações...</div>
                )}
              </div>

              {/* Refresh */}
              {(reputation || questionsData || claimsData) && organization && (
                <div className="flex justify-end">
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    disabled={isLoadingReputation || isLoadingQuestions || isLoadingClaims}
                    onClick={async () => {
                      if (!supabaseClient) return;
                      setIsLoadingReputation(true);
                      setIsLoadingQuestions(true);
                      setIsLoadingClaims(true);
                      try {
                        const { data: sessionData } = await supabaseClient.auth.getSession();
                        const accessToken = sessionData.session?.access_token;
                        if (accessToken) await loadPosVenda(organization.id, accessToken);
                      } finally {
                        setIsLoadingReputation(false);
                        setIsLoadingQuestions(false);
                        setIsLoadingClaims(false);
                      }
                    }}
                    type="button"
                  >
                    <RefreshCw aria-hidden className={`h-4 w-4 ${isLoadingReputation ? "animate-spin" : ""}`} />
                    Atualizar dados
                  </button>
                </div>
              )}
            </div>
          )}

          {activeView === "conector" && (
            <section className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="flex flex-col gap-5">
                <section className="rounded-xl border border-black/10 bg-ink p-6 text-white shadow-soft">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-300">
                    <Cable aria-hidden className="h-4 w-4" />
                    Conector ativo
                  </div>
                  <p className="mt-3 text-3xl font-bold tracking-tight">
                    {selectedAdapter.displayName}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    Sincronização multicanal centralizada. Mercado Livre ativo; Amazon e Shopee em breve.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {listMarketplaceAdapters().slice(0, 3).map((adapter) => (
                      <button
                        className={`h-9 rounded-lg px-3 text-xs font-bold transition ring-1 ${
                          selectedProvider === adapter.provider
                            ? "bg-white text-ink ring-white shadow-sm"
                            : adapter.provider === "mercadolivre"
                              ? "bg-white/5 text-white/70 ring-white/10 hover:bg-white/10 hover:text-white"
                              : "cursor-not-allowed bg-white/5 text-white/30 ring-transparent"
                        }`}
                        disabled={adapter.provider !== "mercadolivre"}
                        key={adapter.provider}
                        onClick={() => setSelectedProvider(adapter.provider)}
                        type="button"
                      >
                        {adapter.displayName}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 rounded-xl bg-white/5 p-4 text-sm text-white/80 ring-1 ring-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-white">
                        {mercadoLivreAccount?.account_name ?? "Modo demonstrativo"}
                      </p>
                      {mercadoLivreAccount && (() => {
                        const expiresAt = mercadoLivreAccount.last_sync_at
                          ? null
                          : null;
                        const isExpired = mercadoLivreAccount.status === "expired";
                        return isExpired ? (
                          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400 ring-1 ring-rose-500/30">
                            Token expirado
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/30">
                            {mercadoLivreAccount.status === "connected" ? "Ativo" : mercadoLivreAccount.status}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="mt-1 text-xs text-white/50">
                      {mercadoLivreAccount
                        ? `ID: ${mercadoLivreAccount.external_seller_id}${mercadoLivreAccount.last_sync_at ? ` · Último sync: ${new Date(mercadoLivreAccount.last_sync_at).toLocaleDateString("pt-BR")}` : ""}`
                        : "Conecte sua conta para começar"}
                    </p>
                    {mercadoLivreAccount?.status === "expired" && (
                      <p className="mt-2 text-xs text-rose-400">
                        Token expirado. Clique em Reconectar para renovar o acesso.
                      </p>
                    )}
                  </div>
                </section>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">Capabilities</h3>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {selectedAdapter.capabilities.map((capability) => (
                      <span
                        className="rounded-lg bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 ring-1 ring-slate-100"
                        key={capability}
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-1 border-b border-slate-100 pb-5">
                    <h2 className="text-lg font-bold text-ink">Ações do Conector</h2>
                    <p className="text-sm text-slate-500">
                      Gerencie a sincronização de dados e diagnostique a conexão.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Conectar / Sincronizar anúncios */}
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                      disabled={isMarketplaceConnectDisabled}
                      onClick={mercadoLivreConnected ? syncMercadoLivreListings : connectMercadoLivre}
                      type="button"
                    >
                      <Cable aria-hidden className="h-4 w-4" />
                      {marketplaceSkuActionLabel}
                    </button>
                    {/* Vendas */}
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-sea px-4 text-sm font-bold text-white transition hover:bg-sea/90 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                      disabled={!mercadoLivreConnected || isMarketplaceActionDisabled}
                      onClick={syncMercadoLivreOrders}
                      type="button"
                    >
                      <ClipboardList aria-hidden className="h-4 w-4" />
                      {isSyncingOrders ? "Sincronizando..." : "Vendas"}
                    </button>
                    {/* Estoque */}
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-moss px-4 text-sm font-bold text-white transition hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                      disabled={!mercadoLivreConnected || isMarketplaceActionDisabled}
                      onClick={syncMercadoLivreInventory}
                      type="button"
                    >
                      <Boxes aria-hidden className="h-4 w-4" />
                      {isSyncingInventory ? "Sincronizando..." : "Estoque"}
                    </button>
                    {/* Diagnóstico */}
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-ink ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!isMarketplaceWorkspaceReady || isDiagnosingMarketplace}
                      onClick={() => void diagnoseMercadoLivreConnection()}
                      type="button"
                    >
                      <Search aria-hidden className="h-4 w-4 text-slate-400" />
                      {isDiagnosingMarketplace ? "Testando..." : "Diagnóstico"}
                    </button>
                    {/* Reconectar — aparece sempre que há conta (connected ou expired) */}
                    {mercadoLivreAccount && (
                      <button
                        className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          mercadoLivreAccount.status === "expired"
                            ? "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100"
                            : "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100"
                        }`}
                        disabled={isMarketplaceConnectDisabled}
                        onClick={connectMercadoLivre}
                        title="Refaz o fluxo OAuth para renovar o token de acesso"
                        type="button"
                      >
                        <RefreshCw aria-hidden className="h-4 w-4" />
                        {mercadoLivreAccount.status === "expired" ? "Reconectar (token expirado)" : "Reconectar"}
                      </button>
                    )}
                    {/* Ads */}
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-ink ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!mercadoLivreConnected || isMarketplaceActionDisabled}
                      onClick={syncMercadoLivreAdvertising}
                      type="button"
                    >
                      <Megaphone aria-hidden className="h-4 w-4 text-slate-400" />
                      {isSyncingAdvertising ? "Sincronizando..." : "Ads"}
                    </button>
                    {/* Promoções */}
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-ink ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!mercadoLivreConnected || isMarketplaceActionDisabled}
                      onClick={syncMercadoLivrePromotions}
                      type="button"
                    >
                      <Tags aria-hidden className="h-4 w-4 text-slate-400" />
                      {isSyncingPromotions ? "Sincronizando..." : "Promoções"}
                    </button>
                  </div>

                  {/* Feedback de ações — dataMessage e diagnóstico mostrados diretamente no Conector */}
                  {(dataMessage || marketplaceConnectionHint) && (
                    <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200/50">
                      <p className="text-sm font-medium text-amber-900/80 leading-relaxed">
                        {dataMessage ?? marketplaceConnectionHint}
                      </p>
                    </div>
                  )}

                  {marketplaceDiagnostics && (
                    <div className="mt-4 grid gap-2">
                      <div className={`rounded-lg px-4 py-3 ring-1 ${
                        marketplaceDiagnostics.status === "ok"
                          ? "bg-emerald-50 ring-emerald-200"
                          : marketplaceDiagnostics.status === "warning"
                            ? "bg-amber-50 ring-amber-200"
                            : "bg-rose-50 ring-rose-200"
                      }`}>
                        <p className="text-xs font-bold uppercase tracking-wider text-black/40">Resultado do diagnóstico</p>
                        <p className="mt-1 font-semibold text-ink">{marketplaceDiagnostics.summary}</p>
                        {marketplaceDiagnostics.redirectUri && (
                          <p className="mt-1 text-xs text-black/50">Callback: {marketplaceDiagnostics.redirectUri}</p>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {marketplaceDiagnostics.checks.map((check) => (
                          <div
                            key={`${check.label}-${check.message}`}
                            className={`rounded-lg px-3 py-2 ring-1 ${
                              check.status === "ok"
                                ? "bg-emerald-50 ring-emerald-100"
                                : check.status === "warning"
                                  ? "bg-amber-50 ring-amber-100"
                                  : "bg-rose-50 ring-rose-100"
                            }`}
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">{check.label}</p>
                            <p className="mt-0.5 text-sm font-semibold text-ink">{check.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Histórico de Sincronização</h3>
                      <p className="mt-1 text-xs text-slate-500">Últimas 10 execuções do conector</p>
                    </div>
                    <button
                      className="rounded-lg bg-slate-50 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                      onClick={() => organization && loadSyncRuns(organization.id)}
                      title="Recarregar logs"
                      type="button"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        <tr>
                          <th className="pb-3 pr-4">Recurso</th>
                          <th className="pb-3 pr-4">Status</th>
                          <th className="pb-3 pr-4">Início</th>
                          <th className="pb-3 text-right">Registros</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {syncRuns.length > 0 ? (
                          syncRuns.map((run) => (
                            <tr className="hover:bg-slate-50/50 transition-colors" key={run.id}>
                              <td className="py-3 pr-4 font-bold text-slate-700">
                                {run.resource === "listings" ? "Anúncios" : 
                                 run.resource === "orders" ? "Vendas" : 
                                 run.resource === "advertising" ? "Ads" :
                                 run.resource === "promotions" ? "Promoções" :
                                 run.resource === "inventory" ? "Estoque" :
                                 run.resource}
                              </td>
                              <td className="py-3 pr-4">
                                {run.status === "success" ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-600 ring-1 ring-emerald-200">
                                    Sucesso
                                  </span>
                                ) : run.status === "failed" ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-600 ring-1 ring-rose-200" title={run.error_message ?? "Erro desconhecido"}>
                                    Falha
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 font-bold text-blue-600 ring-1 ring-blue-200">
                                    Processando
                                  </span>
                                )}
                              </td>
                              <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">
                                {new Date(run.started_at).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </td>
                              <td className="py-3 text-right font-bold text-slate-700">
                                {run.records_processed ?? "-"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="py-8 text-center text-slate-400" colSpan={4}>
                              Nenhum log de sincronização encontrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </section>
          )}

          {activeView === "conciliacao" && (
            <ReconciliationView
              organizationId={organization?.id ?? null}
              supabaseClient={supabaseClient}
              formatCurrency={formatCurrency}
              formatDate={reconciliationDateFormatter}
            />
          )}

          {activeView === "ia" && (
            <section className="mt-5 grid gap-5">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  detail={`Margem ${formatPercent(marginRate)} | Receita ${formatCurrency.format(totals.netRevenue)}`}
                  icon={BrainCircuit}
                  title="Score IA"
                  tone={
                    aiBusinessScore >= 75
                      ? "moss"
                      : aiBusinessScore >= 50
                        ? "clay"
                        : "berry"
                  }
                  value={`${aiBusinessScore}/100`}
                />
                <KpiCard
                  detail={aiAdsMetrics.verdict}
                  icon={Target}
                  title="TACOS ADS"
                  tone={
                    aiAdsMetrics.severity === "positive"
                      ? "moss"
                      : aiAdsMetrics.severity === "critical"
                        ? "berry"
                        : "clay"
                  }
                  value={formatPercent(aiAdsMetrics.tacos)}
                />
                <KpiCard
                  detail={`Atual ${formatPercent(aiSalesTrend.current.marginRate)} | Anterior ${
                    aiSalesTrend.previous.grossAmount > 0
                      ? formatPercent(aiSalesTrend.previous.marginRate)
                      : "sem base"
                  }`}
                  icon={
                    aiSalesTrend.marginDelta !== null &&
                    aiSalesTrend.marginDelta < -0.03
                      ? TrendingDown
                      : TrendingUp
                  }
                  title="Tendência margem"
                  tone={
                    aiSalesTrend.marginDelta !== null &&
                    aiSalesTrend.marginDelta < -0.03
                      ? "berry"
                      : aiSalesTrend.marginDelta !== null &&
                          aiSalesTrend.marginDelta > 0.03
                        ? "moss"
                        : "clay"
                  }
                  value={
                    aiSalesTrend.marginDelta === null
                      ? "Sem base"
                      : formatPercent(aiSalesTrend.marginDelta)
                  }
                />
                <KpiCard
                  detail="SKUs que pedem acao primeiro"
                  icon={AlertTriangle}
                  title="Prioridades"
                  tone={
                    aiSkuPriorities.some(
                      (priority) => priority.severity === "critical"
                    )
                      ? "berry"
                      : aiSkuPriorities.some(
                            (priority) => priority.severity === "warning"
                          )
                        ? "clay"
                        : "moss"
                  }
                  value={formatNumber.format(
                    aiSkuPriorities.filter(
                      (priority) => priority.severity !== "positive"
                    ).length
                  )}
                />
              </section>

              <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <BrainCircuit aria-hidden className="h-5 w-5 text-sea" />
                        <h2 className="text-lg font-bold">Leitura IA do negócio</h2>
                      </div>
                      <p className="mt-1 text-sm text-black/60">
                        Diagnóstico consolidado de margem, vendas, ADS e estoque.
                      </p>
                    </div>
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        !organization || !supabaseClient || isGeneratingAiAnalysis
                      }
                      onClick={() => void generateOpenAiBusinessAnalysis()}
                      type="button"
                    >
                      {isGeneratingAiAnalysis ? (
                        <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />
                      ) : (
                        <BrainCircuit aria-hidden className="h-4 w-4" />
                      )}
                      {isGeneratingAiAnalysis
                        ? "Analisando"
                        : "Analisar com OpenAI"}
                    </button>
                  </div>
                  <div className="grid gap-3 p-4">
                    {openAiAnalysis && (
                      <article className="rounded-lg border border-teal-200 bg-teal-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <span
                              className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1 ${aiSeverityClass(openAiAnalysis.status)}`}
                            >
                              OpenAI - {aiSeverityLabel(openAiAnalysis.status)}
                            </span>
                            <h3 className="mt-3 text-lg font-black">
                              Score {Math.round(openAiAnalysis.score)}/100
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-black/70">
                              {openAiAnalysis.executiveSummary}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                          {[
                            [
                              "ADS",
                              openAiAnalysis.adsAnalysis.verdict,
                              openAiAnalysis.adsAnalysis.recommendation
                            ],
                            [
                              "Margem",
                              openAiAnalysis.profitabilityAnalysis.verdict,
                              openAiAnalysis.profitabilityAnalysis.recommendation
                            ],
                            [
                              "Estoque",
                              openAiAnalysis.stockAnalysis.verdict,
                              openAiAnalysis.stockAnalysis.recommendation
                            ]
                          ].map(([label, title, detail]) => (
                            <div
                              className="rounded-lg border border-black/10 bg-white p-3"
                              key={label}
                            >
                              <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                                {label}
                              </p>
                              <p className="mt-1 font-bold">{title}</p>
                              <p className="mt-1 text-xs leading-relaxed text-black/60">
                                {detail}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-3">
                          {openAiAnalysis.recommendedActions
                            .slice(0, 4)
                            .map((action) => (
                              <div
                                className="rounded-lg border border-black/10 bg-white p-3"
                                key={`${action.priority}-${action.action}`}
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                                      Prioridade {action.priority}
                                    </p>
                                    <p className="mt-1 font-bold">{action.action}</p>
                                  </div>
                                  <span className="rounded-lg bg-teal-50 px-2 py-1 text-xs font-bold text-sea ring-1 ring-teal-100">
                                    {action.expectedImpact}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-black/65">
                                  {action.reason}
                                </p>
                              </div>
                            ))}
                        </div>
                      </article>
                    )}
                    {aiInsights.map((insight) => (
                      <article
                        className="rounded-lg border border-black/10 bg-paper p-4"
                        key={insight.id}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <span
                              className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1 ${aiSeverityClass(insight.severity)}`}
                            >
                              {aiSeverityLabel(insight.severity)}
                            </span>
                            <h3 className="mt-3 text-base font-bold">
                              {insight.title}
                            </h3>
                            <p className="mt-1 text-sm text-black/60">
                              {insight.summary}
                            </p>
                          </div>
                          <div className="min-w-32 rounded-lg border border-black/10 bg-white px-3 py-2 text-right">
                            <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                              {insight.metricLabel}
                            </p>
                            <p className="mt-1 text-lg font-black">
                              {insight.metricValue}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-ink">
                          {insight.recommendation}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                  <div className="border-b border-black/10 p-4">
                    <div className="flex items-center gap-2">
                      <Lightbulb aria-hidden className="h-5 w-5 text-clay" />
                      <h2 className="text-lg font-bold">Prioridades por SKU</h2>
                    </div>
                    <p className="mt-1 text-sm text-black/60">
                      Produtos ordenados por risco e impacto no faturamento.
                    </p>
                  </div>
                  <div className="table-scroll overflow-x-auto">
                    <table className="min-w-[760px] w-full text-left text-sm">
                      <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                        <tr>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Diagnóstico</th>
                          <th className="px-4 py-3">Métrica</th>
                          <th className="px-4 py-3">Ação sugerida</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/10">
                        {aiSkuPriorities.map((priority) => (
                          <tr key={`${priority.sku}-${priority.issue}`}>
                            <td className="px-4 py-3">
                              <p className="font-bold">{priority.sku}</p>
                              <p className="text-xs text-black/50">
                                {priority.title}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1 ${aiSeverityClass(priority.severity)}`}
                              >
                                {priority.issue}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold">{priority.metric}</td>
                            <td className="px-4 py-3 text-black/65">
                              {priority.recommendation}
                            </td>
                          </tr>
                        ))}
                        {aiSkuPriorities.length === 0 && (
                          <tr>
                            <td
                              className="px-4 py-8 text-center text-black/55"
                              colSpan={4}
                            >
                              Sincronize vendas e custos para gerar prioridades.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>

              <section className="grid gap-5 xl:grid-cols-3">
                <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Megaphone aria-hidden className="h-5 w-5 text-berry" />
                    <h2 className="text-lg font-bold">ADS: vale o investimento?</h2>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {[
                      ["Investimento", formatCurrency.format(aiAdsMetrics.adSpend)],
                      [
                        "Receita atribuida",
                        formatCurrency.format(aiAdsMetrics.attributedRevenue)
                      ],
                      ["ACOS", formatPercent(aiAdsMetrics.acos)],
                      ["Payback", `${aiAdsMetrics.payback.toFixed(2)}x`]
                    ].map(([label, value]) => (
                      <div
                        className="flex items-center justify-between rounded-lg border border-black/10 bg-paper px-3 py-2"
                        key={label}
                      >
                        <span className="text-sm font-semibold text-black/60">
                          {label}
                        </span>
                        <span className="font-bold">{value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-ink">
                    {aiAdsMetrics.recommendation}
                  </p>
                </section>

                <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <LineChart aria-hidden className="h-5 w-5 text-sea" />
                    <h2 className="text-lg font-bold">Últimos 30 dias</h2>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {[
                      [
                        "Faturamento",
                        formatCurrency.format(aiSalesTrend.current.grossAmount)
                      ],
                      [
                        "Margem contrib.",
                        formatCurrency.format(
                          aiSalesTrend.current.contributionMargin
                        )
                      ],
                      ["Pedidos", formatNumber.format(aiSalesTrend.current.orders)],
                      ["Unidades", formatNumber.format(aiSalesTrend.current.quantity)]
                    ].map(([label, value]) => (
                      <div
                        className="flex items-center justify-between rounded-lg border border-black/10 bg-paper px-3 py-2"
                        key={label}
                      >
                        <span className="text-sm font-semibold text-black/60">
                          {label}
                        </span>
                        <span className="font-bold">{value}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Boxes aria-hidden className="h-5 w-5 text-clay" />
                    <h2 className="text-lg font-bold">Estoque e capital</h2>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {[
                      [
                        "Valor Full",
                        formatCurrency.format(
                          inventoryValuationTotals.fullInvestedValue
                        )
                      ],
                      [
                        "Valor total",
                        formatCurrency.format(inventoryValuationTotals.investedValue)
                      ],
                      [
                        "Unidades totais",
                        formatNumber.format(inventoryValuationTotals.totalQuantity)
                      ],
                      [
                        "Disponiveis",
                        formatNumber.format(
                          inventoryValuationTotals.availableQuantity
                        )
                      ]
                    ].map(([label, value]) => (
                      <div
                        className="flex items-center justify-between rounded-lg border border-black/10 bg-paper px-3 py-2"
                        key={label}
                      >
                        <span className="text-sm font-semibold text-black/60">
                          {label}
                        </span>
                        <span className="font-bold">{value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </section>
            </section>
          )}

          {activeView === "produtos" && (
            <section className="mt-5 grid gap-5">
              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Filtrar produtos</h2>
                    <p className="text-sm text-black/60">
                      Busque por nome do produto, SKU ou parte do codigo.
                    </p>
                  </div>
                  <label className="relative block w-full lg:w-[28rem]">
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                    />
                    <input
                      className="h-10 w-full rounded-lg border border-black/10 bg-paper pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder="Buscar produto ou SKU"
                      value={productSearch}
                    />
                  </label>
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <KpiCard
                  detail={`${formatNumber.format(productUnitTotals.productsWithCosts)} com custo cadastrado`}
                  icon={PackageCheck}
                  title="Produtos"
                  value={formatNumber.format(productUnitTotals.products)}
                />
                <KpiCard
                  detail={`${formatNumber.format(productUnitTotals.productsWithSales)} com preço de venda`}
                  icon={CircleDollarSign}
                  title="Preco medio unit."
                  value={formatCurrency.format(
                    productUnitTotals.productsWithSales > 0
                      ? productUnitTotals.averagePriceTotal /
                          productUnitTotals.productsWithSales
                      : 0
                  )}
                />
                <KpiCard
                  detail="Média dos custos unitários"
                  icon={WalletCards}
                  title="Custo medio unit."
                  tone="clay"
                  value={formatCurrency.format(
                    productUnitTotals.productsWithCosts > 0
                      ? productUnitTotals.totalCosts /
                          productUnitTotals.productsWithCosts
                      : 0
                  )}
                />
                <KpiCard
                  detail={`${formatPercent(
                    productUnitTotals.averagePriceTotal > 0
                      ? productUnitTotals.contributionMargin /
                          productUnitTotals.averagePriceTotal
                      : 0
                  )} sobre o preço médio unitário`}
                  icon={LineChart}
                  title="MC media unit."
                  tone="moss"
                  value={formatCurrency.format(
                    productUnitTotals.productsWithSales > 0
                      ? productUnitTotals.contributionMargin /
                          productUnitTotals.productsWithSales
                      : 0
                  )}
                />
                <KpiCard
                  detail={`ADS ${formatCurrency.format(
                    productUnitTotals.advertisingAmount
                  )} | ${formatCurrency.format(
                    productUnitTotals.units > 0
                      ? productUnitTotals.advertisingAmount /
                          productUnitTotals.units
                      : 0
                  )} por un.`}
                  icon={Megaphone}
                  title="TACOS medio"
                  tone="berry"
                  value={formatPercent(
                    productUnitTotals.grossRevenue > 0
                      ? productUnitTotals.advertisingAmount /
                          productUnitTotals.grossRevenue
                      : 0
                  )}
                />
              </section>

              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">TACOS por produto</h2>
                    <p className="text-sm text-black/60">
                      Investimento em ADS dividido pelo faturamento total de cada SKU.
                    </p>
                  </div>
                  <span className="inline-flex h-8 items-center gap-2 rounded-lg bg-rose-50 px-3 text-sm font-semibold text-berry ring-1 ring-rose-100">
                    <Megaphone aria-hidden className="h-4 w-4" />
                    Custo publicitário por SKU
                  </span>
                </div>

                <div className="table-scroll overflow-x-auto">
                  <table className="min-w-[1180px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Faturamento</th>
                        <th className="px-4 py-3 text-berry">Invest. ADS</th>
                        <th className="px-4 py-3 text-berry">TACOS</th>
                        <th className="px-4 py-3">ADS por un.</th>
                        <th className="px-4 py-3">Receita atribuida</th>
                        <th className="px-4 py-3">ACoS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {filteredProductUnitRows.map((product) => {
                        const tacosTone =
                          product.tacosRate > 0.15
                            ? "text-berry"
                            : product.tacosRate > 0.08
                              ? "text-clay"
                              : "text-sea";

                        return (
                          <tr className="hover:bg-black/[0.018]" key={product.sku}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-ink">
                                {product.title}
                              </p>
                            </td>
                            <td className="px-4 py-3 font-bold">{product.sku}</td>
                            <td className="px-4 py-3">
                              {product.hasSales
                                ? formatCurrency.format(product.grossRevenue)
                                : "-"}
                            </td>
                            <td className="px-4 py-3 font-semibold text-berry">
                              {formatCurrency.format(product.advertisingAmount)}
                            </td>
                            <td className={`px-4 py-3 font-bold ${tacosTone}`}>
                              {product.hasSales
                                ? formatPercent(product.tacosRate)
                                : "-"}
                            </td>
                            <td className="px-4 py-3">
                              {product.units > 0
                                ? formatCurrency.format(product.advertisingUnit)
                                : "-"}
                            </td>
                            <td className="px-4 py-3">
                              {product.attributedRevenue > 0
                                ? formatCurrency.format(product.attributedRevenue)
                                : "-"}
                            </td>
                            <td className="px-4 py-3">
                              {product.acosRate > 0
                                ? formatPercent(product.acosRate)
                                : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">
                      Produtos - margem unitária
                    </h2>
                    <p className="text-sm text-black/60">
                      Custos detalhados por unidade, separados da margem total por vendas.
                    </p>
                  </div>
                  <span className="inline-flex h-8 items-center gap-2 rounded-lg bg-emerald-50 px-3 text-sm font-semibold text-sea ring-1 ring-emerald-100">
                    <PackageCheck aria-hidden className="h-4 w-4" />
                    Analise por SKU e unidade
                  </span>
                </div>

                <div className="table-scroll overflow-x-auto">
                  <table className="min-w-[1700px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Preco unit.</th>
                        <th className="px-4 py-3 text-clay">Desconto</th>
                        <th className="px-4 py-3 text-clay">Produto</th>
                        <th className="px-4 py-3 text-clay">Embalagem</th>
                        <th className="px-4 py-3 text-clay">Frete entrada</th>
                        <th className="px-4 py-3 text-clay">Outros</th>
                        <th className="px-4 py-3 text-berry">Imposto</th>
                        <th className="px-4 py-3 text-clay">Tarifa ML</th>
                        <th className="px-4 py-3 text-sky-700">Frete vendedor</th>
                        <th className="px-4 py-3 text-berry">ADS/TACOS</th>
                        <th className="px-4 py-3">Custo total unit.</th>
                        <th className="px-4 py-3 text-sea">MC unit.</th>
                        <th className="px-4 py-3 text-sea">MC %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {filteredProductUnitRows.map((product) => (
                        <tr className="hover:bg-black/[0.018]" key={product.sku}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-ink">
                              {product.title}
                            </p>
                          </td>
                          <td className="px-4 py-3 font-bold">{product.sku}</td>
                          <td className="px-4 py-3 font-semibold">
                            {product.hasSales
                              ? formatCurrency.format(product.averagePrice)
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-clay">
                            {formatCurrency.format(product.discountUnit)}
                          </td>
                          <td className="px-4 py-3 text-clay">
                            {formatCurrency.format(product.productCostUnit)}
                          </td>
                          <td className="px-4 py-3 text-clay">
                            {formatCurrency.format(product.packagingCostUnit)}
                          </td>
                          <td className="px-4 py-3 text-clay">
                            {formatCurrency.format(product.inboundFreightUnit)}
                          </td>
                          <td className="px-4 py-3 text-clay">
                            {formatCurrency.format(
                              product.otherCostUnit + product.marketplaceFixedUnit
                            )}
                          </td>
                          <td className="px-4 py-3 text-berry">
                            {formatCurrency.format(product.taxUnit)}
                          </td>
                          <td className="px-4 py-3 text-clay">
                            {formatCurrency.format(product.marketplaceFeeUnit)}
                          </td>
                          <td className="px-4 py-3 text-sky-700">
                            {formatCurrency.format(product.shippingSellerUnit)}
                          </td>
                          <td className="px-4 py-3 text-berry">
                            {formatCurrency.format(product.manualAdvertisingUnit)}
                            {product.manualTacosRate > 0 && (
                              <p className="text-xs text-black/45">
                                {formatPercent(product.manualTacosRate)} TACOS
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {formatCurrency.format(product.totalCostUnit)}
                          </td>
                          <td
                            className={`px-4 py-3 font-bold ${
                              product.contributionMarginUnit >= 0
                                ? "text-sea"
                                : "text-berry"
                            }`}
                          >
                            {product.hasSales
                              ? formatCurrency.format(
                                  product.contributionMarginUnit
                                )
                              : "-"}
                          </td>
                          <td
                            className={`px-4 py-3 font-bold ${
                              product.contributionMarginRate >= 0
                                ? "text-sea"
                                : "text-berry"
                            }`}
                          >
                            {product.hasSales
                              ? formatPercent(product.contributionMarginRate)
                              : "-"}
                          </td>
                        </tr>
                      ))}
                      {filteredProductUnitRows.length === 0 && (
                        <tr>
                          <td
                            className="px-4 py-8 text-center text-black/55"
                            colSpan={15}
                          >
                            Nenhum produto encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          )}

          {activeView === "vendas" && (
            <section className="mt-5 grid gap-5">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <KpiCard
                  detail={`${formatNumber.format(salesDetailTotals.orders)} vendas aprovadas`}
                  icon={CircleDollarSign}
                  title="Faturamento ML"
                  value={formatCurrency.format(salesDetailTotals.grossAmount)}
                />
                <KpiCard
                  detail={`Custo ${formatCurrency.format(salesDetailTotals.costAmount)} | Imposto ${formatCurrency.format(salesDetailTotals.taxAmount)}`}
                  icon={WalletCards}
                  title="Custo e imposto"
                  tone="clay"
                  value={formatCurrency.format(
                    salesDetailTotals.costAmount + salesDetailTotals.taxAmount
                  )}
                />
                <KpiCard
                  detail="Tarifas de venda do marketplace"
                  icon={Percent}
                  title="Tarifa de venda"
                  tone="berry"
                  value={formatCurrency.format(salesDetailTotals.marketplaceFee)}
                />
                <KpiCard
                  detail={`Comprador ${formatCurrency.format(salesDetailTotals.shippingBuyer)} | Vendedor ${formatCurrency.format(salesDetailTotals.shippingSeller)}`}
                  icon={Boxes}
                  title="Frete total"
                  value={formatCurrency.format(
                    salesDetailTotals.shippingBuyer +
                      salesDetailTotals.shippingSeller
                  )}
                />
                <KpiCard
                  detail={`${formatPercent(
                    salesDetailTotals.grossAmount > 0
                      ? salesDetailTotals.contributionMargin /
                          salesDetailTotals.grossAmount
                      : 0
                  )} sobre o faturamento`}
                  icon={PackageCheck}
                  title="Margem contribuicao"
                  tone="moss"
                  value={formatCurrency.format(
                    salesDetailTotals.contributionMargin
                  )}
                />
              </section>

              <section className="grid gap-3 md:grid-cols-3">
                <button
                  className={`rounded-lg border p-4 text-left shadow-sm transition ${
                    salesFilters.status === "approved"
                      ? "border-sea bg-emerald-50 ring-2 ring-sea/20"
                      : "border-black/10 bg-white hover:bg-emerald-50/40"
                  }`}
                  onClick={() =>
                    setSalesFilters((current) => ({
                      ...current,
                      status:
                        current.status === "approved" ? "all" : "approved"
                    }))
                  }
                  type="button"
                >
                  <p className="text-xs font-bold uppercase text-black/45">
                    Vendas efetivadas
                  </p>
                  <p className="mt-1 text-2xl font-black text-sea">
                    {formatNumber.format(salesStatusTotals.approved.orders)}
                  </p>
                  <p className="text-sm text-black/60">
                    {formatCurrency.format(salesStatusTotals.approved.amount)} |{" "}
                    {formatNumber.format(salesStatusTotals.approved.quantity)} un.
                  </p>
                </button>
                <button
                  className={`rounded-lg border p-4 text-left shadow-sm transition ${
                    salesFilters.status === "cancelled"
                      ? "border-berry bg-rose-50 ring-2 ring-berry/20"
                      : "border-black/10 bg-white hover:bg-rose-50/40"
                  }`}
                  onClick={() =>
                    setSalesFilters((current) => ({
                      ...current,
                      status:
                        current.status === "cancelled" ? "all" : "cancelled"
                    }))
                  }
                  type="button"
                >
                  <p className="text-xs font-bold uppercase text-black/45">
                    Vendas canceladas
                  </p>
                  <p className="mt-1 text-2xl font-black text-berry">
                    {formatNumber.format(salesStatusTotals.cancelled.orders)}
                  </p>
                  <p className="text-sm text-black/60">
                    {formatCurrency.format(salesStatusTotals.cancelled.amount)} |{" "}
                    {formatNumber.format(salesStatusTotals.cancelled.quantity)} un.
                  </p>
                </button>
                <button
                  className={`rounded-lg border p-4 text-left shadow-sm transition ${
                    salesFilters.status === "other"
                      ? "border-clay bg-amber-50 ring-2 ring-clay/20"
                      : "border-black/10 bg-white hover:bg-amber-50/40"
                  }`}
                  onClick={() =>
                    setSalesFilters((current) => ({
                      ...current,
                      status: current.status === "other" ? "all" : "other"
                    }))
                  }
                  type="button"
                >
                  <p className="text-xs font-bold uppercase text-black/45">
                    Outros status
                  </p>
                  <p className="mt-1 text-2xl font-black text-clay">
                    {formatNumber.format(salesStatusTotals.other.orders)}
                  </p>
                  <p className="text-sm text-black/60">
                    {formatCurrency.format(salesStatusTotals.other.amount)} |{" "}
                    {formatNumber.format(salesStatusTotals.other.quantity)} un.
                  </p>
                </button>
              </section>

              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Filtrar vendas</h2>
                    <p className="text-sm text-black/60">
                      Consulte por periodo, SKU, titulo, numero da venda ou MLB.
                    </p>
                  </div>
                  {mercadoLivreAccount && (
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black"
                      disabled={
                        supabaseStatus !== "connected" || isSyncingMarketplace
                      }
                      onClick={syncMercadoLivreOrders}
                      type="button"
                    >
                      <RefreshCw aria-hidden className="h-4 w-4" />
                      {isSyncingOrders ? "Sincronizando" : "Sincronizar Vendas"}
                    </button>
                  )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1 text-sm font-semibold">
                    Data inicio
                    <input
                      className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(event) =>
                        setSalesFilters((current) => ({
                          ...current,
                          dateFrom: event.target.value
                        }))
                      }
                      type="date"
                      value={salesFilters.dateFrom}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    Data fim
                    <input
                      className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(event) =>
                        setSalesFilters((current) => ({
                          ...current,
                          dateTo: event.target.value
                        }))
                      }
                      type="date"
                      value={salesFilters.dateTo}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    Status
                    <select
                      className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(event) =>
                        setSalesFilters((current) => ({
                          ...current,
                          status: event.target.value as SalesStatusFilter
                        }))
                      }
                      value={salesFilters.status}
                    >
                      <option value="all">Todos</option>
                      <option value="approved">Efetivadas</option>
                      <option value="cancelled">Canceladas</option>
                      <option value="other">Outros status</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    SKU, titulo ou numero da venda
                    <span className="relative">
                      <Search
                        aria-hidden
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                      />
                      <input
                        className="h-10 w-full rounded-lg border border-black/10 bg-paper pl-9 pr-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) =>
                          setSalesFilters((current) => ({
                            ...current,
                            sku: event.target.value
                          }))
                        }
                        placeholder="Buscar SKU, titulo, MLB ou numero da venda"
                        value={salesFilters.sku}
                      />
                    </span>
                  </label>
                </div>
              </section>

              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">
                      Auditoria Mercado Livre
                    </h2>
                    <p className="text-sm text-black/60">
                      Compare vendas canceladas na API com o faturamento salvo no DASHMARKET.
                    </p>
                  </div>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-black/35"
                    disabled={
                      supabaseStatus !== "connected" ||
                      !mercadoLivreAccount ||
                      isAuditingOrders
                    }
                    onClick={auditMercadoLivreOrders}
                    type="button"
                  >
                    <Search aria-hidden className="h-4 w-4" />
                    {isAuditingOrders ? "Auditando" : "Auditar vendas"}
                  </button>
                </div>

                <label className="mt-4 grid gap-1 text-sm font-semibold">
                  Numeros das vendas
                  <textarea
                    className="min-h-24 rounded-lg border border-black/10 bg-paper px-3 py-2 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                    onChange={(event) => setAuditOrderIds(event.target.value)}
                    placeholder="Cole um numero por linha"
                    value={auditOrderIds}
                  />
                </label>

                {auditResults && (
                  <div className="mt-4 grid gap-3">
                    <div className="grid gap-2 text-sm md:grid-cols-3">
                      <div className="rounded-lg bg-paper p-3 ring-1 ring-black/10">
                        <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                          Conta auditada
                        </p>
                        <p className="mt-1 font-semibold text-ink">
                          {auditResults.accountName}
                        </p>
                      </div>
                      <div className="rounded-lg bg-paper p-3 ring-1 ring-black/10">
                        <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                          Ultima sincronizacao
                        </p>
                        <p className="mt-1 font-semibold text-ink">
                          {auditResults.lastSyncAt
                            ? new Date(auditResults.lastSyncAt).toLocaleString(
                                "pt-BR"
                              )
                            : "Sem registro"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-paper p-3 ring-1 ring-black/10">
                        <p className="text-xs font-bold uppercase tracking-normal text-black/45">
                          Verificacao
                        </p>
                        <p className="mt-1 font-semibold text-ink">
                          {new Date(auditResults.checkedAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>

                    <div className="table-scroll overflow-x-auto">
                      <table className="min-w-[1180px] w-full text-left text-sm">
                        <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                          <tr>
                            <th className="px-4 py-3">Venda</th>
                            <th className="px-4 py-3">Status ML</th>
                            <th className="px-4 py-3">Status DASH</th>
                            <th className="px-4 py-3">Faturamento DASH</th>
                            <th className="px-4 py-3">Total ML</th>
                            <th className="px-4 py-3">Tarifa ML</th>
                            <th className="px-4 py-3">Frete vendedor ML</th>
                            <th className="px-4 py-3">Situacao</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/10">
                          {auditResults.orders.map((order) => {
                            const revenueRisk = order.comparison.revenueRisk;
                            const mismatchCount = [
                              order.comparison.statusMismatch,
                              order.comparison.grossMismatch,
                              order.comparison.feeMismatch,
                              order.comparison.sellerShippingMismatch,
                              order.comparison.taxMismatch
                            ].filter(Boolean).length;

                            return (
                              <tr
                                className={
                                  revenueRisk ? "bg-rose-50/60" : undefined
                                }
                                key={order.orderId}
                              >
                                <td className="px-4 py-3 font-bold">
                                  {order.orderId}
                                  {order.remote?.lastUpdated && (
                                    <p className="mt-1 text-xs font-normal text-black/45">
                                      Atualizado ML{" "}
                                      {new Date(
                                        order.remote.lastUpdated
                                      ).toLocaleString("pt-BR")}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {order.remote?.status ??
                                    `Erro ${order.remoteError?.status ?? ""}`}
                                  {order.remote?.payments.length ? (
                                    <p className="mt-1 text-xs text-black/45">
                                      Pagamento{" "}
                                      {order.remote.payments
                                        .map((payment) => payment.status)
                                        .filter(Boolean)
                                        .join(", ")}
                                    </p>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3">
                                  {order.local?.status ?? "Nao salvo"}
                                  {order.local?.rawStatus &&
                                    order.local.rawStatus !==
                                      order.local.status && (
                                      <p className="mt-1 text-xs text-black/45">
                                        Raw {order.local.rawStatus}
                                      </p>
                                    )}
                                </td>
                                <td className="px-4 py-3 font-semibold">
                                  {order.local
                                    ? formatCurrency.format(order.local.grossAmount)
                                    : "-"}
                                </td>
                                <td className="px-4 py-3">
                                  {order.remote
                                    ? formatCurrency.format(
                                        order.remote.itemGrossAmount
                                      )
                                    : "-"}
                                </td>
                                <td className="px-4 py-3">
                                  {order.remote
                                    ? formatCurrency.format(
                                        order.remote.marketplaceFeeAmount
                                      )
                                    : "-"}
                                </td>
                                <td className="px-4 py-3">
                                  {order.remote
                                    ? formatCurrency.format(
                                        order.remote.sellerShippingAmount
                                      )
                                    : "-"}
                                  {order.shipmentError && (
                                    <p className="mt-1 text-xs text-berry">
                                      Frete ML indisponivel
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1 ${
                                      revenueRisk
                                        ? "bg-rose-100 text-berry ring-rose-200"
                                        : mismatchCount > 0
                                          ? "bg-amber-100 text-clay ring-amber-200"
                                          : "bg-emerald-50 text-sea ring-emerald-100"
                                    }`}
                                  >
                                    {revenueRisk
                                      ? "Revisar faturamento"
                                      : mismatchCount > 0
                                        ? "Diferenca encontrada"
                                        : "Conferido"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="border-b border-black/10 p-4">
                  <h2 className="text-lg font-bold">Vendas detalhadas</h2>
                  <p className="text-sm text-black/60">
                    Custos e impostos sao calculados com base no Centro de Custos.
                  </p>
                </div>
                <div className="grid gap-3 p-3">
                  {filteredSalesDetailRows.map((sale) => {
                    const commissionRate =
                      sale.grossAmount > 0
                        ? sale.marketplaceFee / sale.grossAmount
                        : 0;
                    const marketplaceTotal =
                      sale.marketplaceFee + sale.shippingSeller;
                    const marketplaceBalance =
                      sale.grossAmount - marketplaceTotal;
                    const costAndTax = sale.costAmount + sale.taxAmount;
                    const isSkuCalculated = calculatorManagedSkuSet.has(sale.sku);

                    return (
                      <article
                        className="grid overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm xl:grid-cols-[1.35fr_0.65fr_1.35fr_1fr]"
                        key={sale.id}
                      >
                        <div className="border-b border-black/10 p-4 xl:border-b-0 xl:border-r">
                          <h3 className="text-base font-bold leading-snug text-ink">
                            {sale.title}
                          </h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-black/50">
                            <span className="rounded-lg bg-blue-50 px-2 py-1 text-sea ring-1 ring-black/10">
                              {sale.sku}
                            </span>
                            <span
                              className={`rounded-lg px-2 py-1 font-bold ring-1 ${orderStatusClass(
                                sale.status
                              )}`}
                            >
                              {orderStatusLabel(sale.status)}
                            </span>
                            {isSkuCalculated ? (
                              <button
                                className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-lg bg-emerald-50 px-2 text-xs font-bold text-sea ring-1 ring-emerald-100"
                                disabled
                                type="button"
                              >
                                <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
                                SKU calculado
                              </button>
                            ) : (
                              <button
                                className="inline-flex h-7 items-center gap-1 rounded-lg bg-ink px-2 text-xs font-bold text-white hover:bg-black"
                                onClick={() => importSaleToCalculator(sale)}
                                type="button"
                              >
                                <PackagePlus aria-hidden className="h-3.5 w-3.5" />
                                Importar
                              </button>
                            )}
                            <span>{formatDateTimeInSaoPaulo(sale.soldAt)}</span>
                            <span>{formatNumber.format(sale.quantity)} un.</span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <p className="font-mono text-xs font-semibold text-black/45">
                              {sale.orderId}
                            </p>
                            {(() => {
                              const rec = reconciliationMap.get(sale.orderId);
                              if (!rec) return null;
                              if (rec.matchStatus === "matched") {
                                const hasShippingDiff = Math.abs(rec.shippingDifference) >= 0.05;
                                return (
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${
                                      hasShippingDiff
                                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                                        : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                    }`}
                                    title={
                                      hasShippingDiff
                                        ? `Conciliado — diferença de frete: ${formatCurrency.format(rec.shippingDifference)}`
                                        : "Conciliado com o Mercado Pago"
                                    }
                                  >
                                    {hasShippingDiff ? "⚠" : "✓"} MP {hasShippingDiff ? `frete ${formatCurrency.format(rec.shippingDifference)}` : "Conciliado"}
                                  </span>
                                );
                              }
                              if (rec.matchStatus === "amount_mismatch") {
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200"
                                    title={`Divergência de valor: ${formatCurrency.format(rec.amountDifference)}`}
                                  >
                                    ✕ MP Divergência {formatCurrency.format(rec.amountDifference)}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>

                        <div className="border-b border-black/10 p-4 xl:border-b-0 xl:border-r">
                          <p className="text-2xl font-black text-ink">
                            {formatCurrency.format(sale.unitPrice)}
                          </p>
                          <p className="mt-1 text-xs font-bold uppercase text-black/45">
                            por unidade
                          </p>
                          <p className="mt-3 text-base font-bold text-ink">
                            {formatCurrency.format(sale.grossAmount)}
                          </p>
                          <p className="text-xs text-black/45">receita bruta</p>
                        </div>

                        <div className="grid gap-0 border-b border-black/10 bg-rose-50/35 sm:grid-cols-2 xl:border-b-0 xl:border-r">
                          <div className="border-b border-black/10 p-4 sm:border-r">
                            <p className="text-xs font-bold uppercase text-black/45">
                              Comissao
                            </p>
                            <p className="mt-1 font-bold text-berry">
                              {formatCurrency.format(sale.marketplaceFee)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-berry">
                              {formatPercent(commissionRate)}
                            </p>
                          </div>
                          <div className="border-b border-black/10 p-4">
                            <p className="text-xs font-bold uppercase text-black/45">
                              Fr. comprador
                            </p>
                            <p className="mt-1 text-sm font-semibold italic text-black/50">
                              {sale.shippingBuyer > 0
                                ? formatCurrency.format(sale.shippingBuyer)
                                : "Incluso"}
                            </p>
                          </div>
                          <div className="p-4 sm:border-r">
                            <p className="text-xs font-bold uppercase text-black/45">
                              Fr. vendedor
                            </p>
                            <p className="mt-1 font-semibold text-black/55">
                              {sale.shippingSeller > 0
                                ? formatCurrency.format(sale.shippingSeller)
                                : "-"}
                            </p>
                          </div>
                          <div className="p-4">
                            <p className="text-xs font-bold uppercase text-black/45">
                              Total ML
                            </p>
                            <p className="mt-1 font-bold text-berry">
                              {formatCurrency.format(marketplaceTotal)}
                            </p>
                          </div>
                        </div>

                        <div className="grid bg-emerald-50/45 sm:grid-cols-2 xl:grid-cols-1">
                          <div className="border-b border-black/10 p-4">
                            <p className="text-xs font-bold uppercase text-black/45">
                              Saldo ML
                            </p>
                            <p className="mt-1 font-bold text-sea">
                              {formatCurrency.format(marketplaceBalance)}
                            </p>
                          </div>
                          <div className="border-b border-black/10 p-4">
                            <p className="text-xs font-bold uppercase text-black/45">
                              Custo/imposto
                            </p>
                            <p className="mt-1 font-semibold text-black/55">
                              {costAndTax > 0
                                ? formatCurrency.format(costAndTax)
                                : "-"}
                            </p>
                          </div>
                          <div className="p-4 sm:col-span-2 xl:col-span-1">
                            <p className="text-xs font-bold uppercase text-black/45">
                              Margem contrib.
                            </p>
                            <p
                              className={`mt-1 font-bold ${
                                sale.contributionMargin >= 0
                                  ? "text-sea"
                                  : "text-berry"
                              }`}
                            >
                              {formatCurrency.format(sale.contributionMargin)}
                              <span className="ml-2 text-xs">
                                {formatPercent(sale.marginRate)}
                              </span>
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {filteredSalesDetailRows.length === 0 && (
                    <div className="rounded-lg border border-black/10 bg-paper px-4 py-8 text-center text-black/55">
                      Nenhuma venda encontrada para este filtro.
                    </div>
                  )}
                </div>
              </section>
            </section>
          )}

          {activeView === "financeiro_empresa" && (
            <section className="mt-5 grid gap-5">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  detail={`A receber ${formatCurrency.format(
                    companyFinanceTotals.openReceivables
                  )}`}
                  icon={CircleDollarSign}
                  title="Receitas"
                  value={formatCurrency.format(companyFinanceTotals.income)}
                />
                <KpiCard
                  detail={`A pagar ${formatCurrency.format(
                    companyFinanceTotals.openPayables
                  )}`}
                  icon={WalletCards}
                  title="Despesas"
                  tone="clay"
                  value={formatCurrency.format(companyFinanceTotals.expenses)}
                />
                <KpiCard
                  detail={`Realizado ${formatCurrency.format(
                    companyFinanceTotals.paidIncome -
                      companyFinanceTotals.paidExpenses
                  )}`}
                  icon={LineChart}
                  title="Saldo previsto"
                  tone={
                    companyFinanceTotals.projectedBalance >= 0 ? "moss" : "berry"
                  }
                  value={formatCurrency.format(
                    companyFinanceTotals.projectedBalance
                  )}
                />
                <KpiCard
                  detail="Contas pendentes fora do prazo"
                  icon={RefreshCw}
                  title="Vencidos"
                  tone={companyFinanceTotals.overdue > 0 ? "berry" : "moss"}
                  value={formatCurrency.format(companyFinanceTotals.overdue)}
                />
              </section>

              <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
                <form
                  className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
                  onSubmit={saveCompanyFinanceEntry}
                >
                  <div className="flex items-center gap-2">
                    <CircleDollarSign aria-hidden className="h-5 w-5 text-sea" />
                    <h2 className="text-lg font-bold">
                      {editingCompanyFinanceId
                        ? "Editar lancamento"
                        : "Novo lancamento"}
                    </h2>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <label className="grid gap-1 text-sm font-semibold">
                      Tipo
                      <select
                        className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) =>
                          setCompanyFinanceForm((current) => ({
                            ...current,
                            type: event.target.value as FinanceEntryType
                          }))
                        }
                        value={companyFinanceForm.type}
                      >
                        <option value="income">Receita</option>
                        <option value="expense">Despesa</option>
                      </select>
                    </label>

                    <label className="grid gap-1 text-sm font-semibold">
                      Descricao
                      <input
                        className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) =>
                          setCompanyFinanceForm((current) => ({
                            ...current,
                            title: event.target.value
                          }))
                        }
                        placeholder="Fornecedor, repasse, imposto"
                        value={companyFinanceForm.title}
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1 text-sm font-semibold">
                        Categoria
                        <input
                          className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) =>
                            setCompanyFinanceForm((current) => ({
                              ...current,
                              category: event.target.value
                            }))
                          }
                          value={companyFinanceForm.category}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Valor
                        <input
                          className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          min="0"
                          onChange={(event) =>
                            setCompanyFinanceForm((current) => ({
                              ...current,
                              amount: event.target.value
                            }))
                          }
                          placeholder="0,00"
                          step="0.01"
                          type="number"
                          value={companyFinanceForm.amount}
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1 text-sm font-semibold">
                        Vencimento
                        <input
                          className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) =>
                            setCompanyFinanceForm((current) => ({
                              ...current,
                              dueDate: event.target.value
                            }))
                          }
                          type="date"
                          value={companyFinanceForm.dueDate}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Status
                        <select
                          className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) =>
                            setCompanyFinanceForm((current) => ({
                              ...current,
                              status: event.target.value as FinanceEntryStatus,
                              paidAt:
                                event.target.value === "paid"
                                  ? current.paidAt || dateOnly(new Date())
                                  : ""
                            }))
                          }
                          value={companyFinanceForm.status}
                        >
                          <option value="pending">Pendente</option>
                          <option value="paid">Pago</option>
                          <option value="overdue">Vencido</option>
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1 text-sm font-semibold">
                        Pagamento
                        <input
                          className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) =>
                            setCompanyFinanceForm((current) => ({
                              ...current,
                              paidAt: event.target.value,
                              status: event.target.value ? "paid" : current.status
                            }))
                          }
                          type="date"
                          value={companyFinanceForm.paidAt}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Forma
                        <input
                          className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) =>
                            setCompanyFinanceForm((current) => ({
                              ...current,
                              paymentMethod: event.target.value
                            }))
                          }
                          value={companyFinanceForm.paymentMethod}
                        />
                      </label>
                    </div>

                    <label className="grid gap-1 text-sm font-semibold">
                      Observacoes
                      <textarea
                        className="min-h-20 rounded-lg border border-black/10 bg-paper px-3 py-2 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) =>
                          setCompanyFinanceForm((current) => ({
                            ...current,
                            notes: event.target.value
                          }))
                        }
                        value={companyFinanceForm.notes}
                      />
                    </label>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black"
                        disabled={isSavingCompanyFinance}
                        type="submit"
                      >
                        <Save aria-hidden className="h-4 w-4" />
                        {isSavingCompanyFinance
                          ? "Salvando"
                          : editingCompanyFinanceId
                            ? "Salvar"
                            : "Adicionar"}
                      </button>
                      {editingCompanyFinanceId && (
                        <button
                          className="inline-flex h-11 items-center justify-center rounded-lg bg-paper px-4 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                          onClick={resetCompanyFinanceForm}
                          type="button"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </form>

                <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-lg font-bold">
                        Contas da empresa
                      </h2>
                      <p className="text-sm text-black/60">
                        Controle simples de contas a pagar, a receber e realizado.
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <label className="relative block min-w-0 sm:w-80">
                        <Search
                          aria-hidden
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                        />
                        <input
                          className="h-10 w-full rounded-lg border border-black/10 bg-paper pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) =>
                            setCompanyFinanceSearch(event.target.value)
                          }
                          placeholder="Buscar fornecedor, descricao ou categoria"
                          value={companyFinanceSearch}
                        />
                      </label>
                      <span className="inline-flex h-8 items-center gap-2 rounded-lg bg-emerald-50 px-3 text-sm font-semibold text-sea ring-1 ring-emerald-100">
                        <CircleDollarSign aria-hidden className="h-4 w-4" />
                        Fluxo de caixa
                      </span>
                    </div>
                  </div>
                  <div className="table-scroll overflow-x-auto">
                    <table className="min-w-[1060px] w-full text-left text-sm">
                      <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                        <tr>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Vencimento</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3">Descricao</th>
                          <th className="px-4 py-3">Categoria</th>
                          <th className="px-4 py-3">Valor</th>
                          <th className="px-4 py-3">Forma</th>
                          <th className="px-4 py-3">Acoes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/10">
                        {filteredCompanyFinanceEntries.map((entry) => {
                          const status = resolveFinanceStatus(
                            entry.status,
                            entry.dueDate,
                            entry.paidAt
                          );

                          return (
                            <tr className="hover:bg-black/[0.018]" key={entry.id}>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1 ${financeStatusClass(status)}`}
                                >
                                  {financeStatusLabel[status]}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {new Date(`${entry.dueDate}T00:00:00`).toLocaleDateString(
                                  "pt-BR"
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {financeTypeLabel[entry.type]}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-ink">
                                  {entry.title}
                                </p>
                                {entry.notes && (
                                  <p className="text-xs text-black/45">
                                    {entry.notes}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3">{entry.category}</td>
                              <td
                                className={`px-4 py-3 font-bold ${
                                  entry.type === "income"
                                    ? "text-sea"
                                    : "text-berry"
                                }`}
                              >
                                {formatCurrency.format(entry.amount)}
                              </td>
                              <td className="px-4 py-3">
                                {entry.paymentMethod || "-"}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-paper px-3 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                                    disabled={isSavingCompanyFinance}
                                    onClick={() => startEditingCompanyFinance(entry)}
                                    type="button"
                                  >
                                    <Pencil aria-hidden className="h-4 w-4" />
                                    Editar
                                  </button>
                                  <button
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-berry/10 px-3 text-sm font-bold text-berry ring-1 ring-berry/20 hover:bg-berry/15"
                                    disabled={isSavingCompanyFinance}
                                    onClick={() => deleteCompanyFinanceEntry(entry)}
                                    type="button"
                                  >
                                    <Trash2 aria-hidden className="h-4 w-4" />
                                    Excluir
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredCompanyFinanceEntries.length === 0 && (
                          <tr>
                            <td
                              className="px-4 py-8 text-center text-black/55"
                              colSpan={8}
                            >
                              Nenhum lancamento financeiro encontrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>

              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-bold">Resumo por categoria</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {companyFinanceByCategory.map((category) => (
                    <div
                      className="rounded-lg bg-paper p-3 ring-1 ring-black/10"
                      key={category.category}
                    >
                      <p className="font-bold text-ink">{category.category}</p>
                      <p className="mt-2 text-sm text-sea">
                        Receitas {formatCurrency.format(category.income)}
                      </p>
                      <p className="text-sm text-berry">
                        Despesas {formatCurrency.format(category.expenses)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          )}

          {activeView === "financeiro_pessoal" && (
            <section className="mt-5 grid gap-5">
              <section className="rounded-lg border border-black/10 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  {[
                    ["movements", "Movimentacoes"],
                    ["loans", "Emprestimos"]
                  ].map(([tab, label]) => (
                    <button
                      className={`h-10 rounded-lg px-3 text-sm font-bold ring-1 ${
                        personalFinanceTab === tab
                          ? "bg-ink text-white ring-ink"
                          : "bg-paper text-ink ring-black/10 hover:bg-black/[0.03]"
                      }`}
                      key={tab}
                      onClick={() => setPersonalFinanceTab(tab as PersonalFinanceTab)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {personalFinanceTab === "movements" && (
                <>
                  <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                      detail="Entradas pessoais cadastradas"
                      icon={CircleDollarSign}
                      title="Receitas"
                      value={formatCurrency.format(personalFinanceTotals.income)}
                    />
                    <KpiCard
                      detail="Saidas pessoais cadastradas"
                      icon={WalletCards}
                      title="Despesas"
                      tone="clay"
                      value={formatCurrency.format(personalFinanceTotals.expenses)}
                    />
                    <KpiCard
                      detail={`Realizado ${formatCurrency.format(
                        personalFinanceTotals.paidBalance
                      )}`}
                      icon={LineChart}
                      title="Saldo previsto"
                      tone={
                        personalFinanceTotals.projectedBalance >= 0
                          ? "moss"
                          : "berry"
                      }
                      value={formatCurrency.format(
                        personalFinanceTotals.projectedBalance
                      )}
                    />
                    <KpiCard
                      detail={`Em aberto ${formatCurrency.format(
                        personalFinanceTotals.openAmount
                      )}`}
                      icon={RefreshCw}
                      title="Vencidos"
                      tone={personalFinanceTotals.overdue > 0 ? "berry" : "moss"}
                      value={formatCurrency.format(personalFinanceTotals.overdue)}
                    />
                  </section>

                  <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
                    <form
                      className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
                      onSubmit={savePersonalFinanceEntry}
                    >
                      <div className="flex items-center gap-2">
                        <WalletCards aria-hidden className="h-5 w-5 text-sea" />
                        <h2 className="text-lg font-bold">
                          {editingPersonalFinanceId
                            ? "Editar pessoal"
                            : "Novo lancamento pessoal"}
                        </h2>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <label className="grid gap-1 text-sm font-semibold">
                          Tipo
                          <select
                            className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            onChange={(event) =>
                              setPersonalFinanceForm((current) => ({
                                ...current,
                                type: event.target.value as FinanceEntryType
                              }))
                            }
                            value={personalFinanceForm.type}
                          >
                            <option value="income">Receita</option>
                            <option value="expense">Despesa</option>
                          </select>
                        </label>

                        <label className="grid gap-1 text-sm font-semibold">
                          Descricao
                          <input
                            className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            onChange={(event) =>
                              setPersonalFinanceForm((current) => ({
                                ...current,
                                title: event.target.value
                              }))
                            }
                            placeholder="Salario, cartao, aluguel"
                            value={personalFinanceForm.title}
                          />
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="grid gap-1 text-sm font-semibold">
                            Categoria
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(event) =>
                                setPersonalFinanceForm((current) => ({
                                  ...current,
                                  category: event.target.value
                                }))
                              }
                              value={personalFinanceForm.category}
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-semibold">
                            Valor
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              min="0"
                              onChange={(event) =>
                                setPersonalFinanceForm((current) => ({
                                  ...current,
                                  amount: event.target.value
                                }))
                              }
                              placeholder="0,00"
                              step="0.01"
                              type="number"
                              value={personalFinanceForm.amount}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="grid gap-1 text-sm font-semibold">
                            Vencimento
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(event) =>
                                setPersonalFinanceForm((current) => ({
                                  ...current,
                                  dueDate: event.target.value
                                }))
                              }
                              type="date"
                              value={personalFinanceForm.dueDate}
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-semibold">
                            Status
                            <select
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(event) =>
                                setPersonalFinanceForm((current) => ({
                                  ...current,
                                  status: event.target.value as FinanceEntryStatus,
                                  paidAt:
                                    event.target.value === "paid"
                                      ? current.paidAt || dateOnly(new Date())
                                      : ""
                                }))
                              }
                              value={personalFinanceForm.status}
                            >
                              <option value="pending">Pendente</option>
                              <option value="paid">Pago</option>
                              <option value="overdue">Vencido</option>
                            </select>
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="grid gap-1 text-sm font-semibold">
                            Pagamento
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(event) =>
                                setPersonalFinanceForm((current) => ({
                                  ...current,
                                  paidAt: event.target.value,
                                  status: event.target.value ? "paid" : current.status
                                }))
                              }
                              type="date"
                              value={personalFinanceForm.paidAt}
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-semibold">
                            Forma
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(event) =>
                                setPersonalFinanceForm((current) => ({
                                  ...current,
                                  paymentMethod: event.target.value
                                }))
                              }
                              value={personalFinanceForm.paymentMethod}
                            />
                          </label>
                        </div>

                        <label className="grid gap-1 text-sm font-semibold">
                          Observacoes
                          <textarea
                            className="min-h-20 rounded-lg border border-black/10 bg-paper px-3 py-2 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            onChange={(event) =>
                              setPersonalFinanceForm((current) => ({
                                ...current,
                                notes: event.target.value
                              }))
                            }
                            value={personalFinanceForm.notes}
                          />
                        </label>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black"
                            disabled={isSavingPersonalFinance}
                            type="submit"
                          >
                            <Save aria-hidden className="h-4 w-4" />
                            {isSavingPersonalFinance
                              ? "Salvando"
                              : editingPersonalFinanceId
                                ? "Salvar"
                                : "Adicionar"}
                          </button>
                          {editingPersonalFinanceId && (
                            <button
                              className="inline-flex h-11 items-center justify-center rounded-lg bg-paper px-4 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                              onClick={resetPersonalFinanceForm}
                              type="button"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    </form>

                    <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                      <div className="flex flex-col gap-3 border-b border-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h2 className="text-lg font-bold">Financeiro pessoal</h2>
                          <p className="text-sm text-black/60">
                            Entradas e saidas pessoais separadas do caixa da empresa.
                          </p>
                        </div>
                        <label className="relative block min-w-0 lg:w-80">
                          <Search
                            aria-hidden
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                          />
                          <input
                            className="h-10 w-full rounded-lg border border-black/10 bg-paper pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-sea/20"
                            onChange={(event) =>
                              setPersonalFinanceSearch(event.target.value)
                            }
                            placeholder="Buscar nome, descricao ou categoria"
                            value={personalFinanceSearch}
                          />
                        </label>
                      </div>
                      <div className="table-scroll overflow-x-auto">
                        <table className="min-w-[980px] w-full text-left text-sm">
                          <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                            <tr>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Vencimento</th>
                              <th className="px-4 py-3">Tipo</th>
                              <th className="px-4 py-3">Descricao</th>
                              <th className="px-4 py-3">Categoria</th>
                              <th className="px-4 py-3">Valor</th>
                              <th className="px-4 py-3">Acoes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/10">
                            {filteredPersonalFinanceEntries.map((entry) => {
                              const status = resolveFinanceStatus(
                                entry.status,
                                entry.dueDate,
                                entry.paidAt
                              );

                              return (
                                <tr
                                  className="hover:bg-black/[0.018]"
                                  key={entry.id}
                                >
                                  <td className="px-4 py-3">
                                    <span
                                      className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1 ${financeStatusClass(status)}`}
                                    >
                                      {financeStatusLabel[status]}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    {new Date(
                                      `${entry.dueDate}T00:00:00`
                                    ).toLocaleDateString("pt-BR")}
                                  </td>
                                  <td className="px-4 py-3">
                                    {financeTypeLabel[entry.type]}
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-semibold text-ink">
                                      {entry.title}
                                    </p>
                                    {entry.notes && (
                                      <p className="text-xs text-black/45">
                                        {entry.notes}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">{entry.category}</td>
                                  <td
                                    className={`px-4 py-3 font-bold ${
                                      entry.type === "income"
                                        ? "text-sea"
                                        : "text-berry"
                                    }`}
                                  >
                                    {formatCurrency.format(entry.amount)}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-paper px-3 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                                        disabled={isSavingPersonalFinance}
                                        onClick={() =>
                                          startEditingPersonalFinance(entry)
                                        }
                                        type="button"
                                      >
                                        <Pencil aria-hidden className="h-4 w-4" />
                                        Editar
                                      </button>
                                      <button
                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-berry/10 px-3 text-sm font-bold text-berry ring-1 ring-berry/20 hover:bg-berry/15"
                                        disabled={isSavingPersonalFinance}
                                        onClick={() =>
                                          deletePersonalFinanceEntry(entry)
                                        }
                                        type="button"
                                      >
                                        <Trash2 aria-hidden className="h-4 w-4" />
                                        Excluir
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {filteredPersonalFinanceEntries.length === 0 && (
                              <tr>
                                <td
                                  className="px-4 py-8 text-center text-black/55"
                                  colSpan={7}
                                >
                                  Nenhum lancamento pessoal encontrado.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </section>
                </>
              )}

              {personalFinanceTab === "loans" && (
                <>
                  <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                      detail={`Em aberto ${formatCurrency.format(
                        personalLoanTotals.receivable
                      )}`}
                      icon={CircleDollarSign}
                      title="Emprestei"
                      value={formatCurrency.format(personalLoanTotals.lent)}
                    />
                    <KpiCard
                      detail={`Saldo devedor ${formatCurrency.format(
                        personalLoanTotals.payable
                      )}`}
                      icon={WalletCards}
                      title="Peguei"
                      tone="clay"
                      value={formatCurrency.format(personalLoanTotals.borrowed)}
                    />
                    <KpiCard
                      detail="Receber menos pagar"
                      icon={LineChart}
                      title="Saldo liquido"
                      tone={
                        personalLoanTotals.receivable - personalLoanTotals.payable >=
                        0
                          ? "moss"
                          : "berry"
                      }
                      value={formatCurrency.format(
                        personalLoanTotals.receivable - personalLoanTotals.payable
                      )}
                    />
                    <KpiCard
                      detail="Parcelas em atraso"
                      icon={RefreshCw}
                      title="Atrasados"
                      tone={personalLoanTotals.late > 0 ? "berry" : "moss"}
                      value={formatCurrency.format(personalLoanTotals.late)}
                    />
                  </section>

                  <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
                    <form
                      className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
                      onSubmit={savePersonalLoan}
                    >
                      <div className="flex items-center gap-2">
                        <CircleDollarSign aria-hidden className="h-5 w-5 text-sea" />
                        <h2 className="text-lg font-bold">
                          {editingLoanId ? "Editar emprestimo" : "Novo emprestimo"}
                        </h2>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <label className="grid gap-1 text-sm font-semibold">
                          Direcao
                          <select
                            className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            onChange={(event) =>
                              setPersonalLoanForm((current) => ({
                                ...current,
                                direction: event.target.value as LoanDirection
                              }))
                            }
                            value={personalLoanForm.direction}
                          >
                            <option value="lent">Emprestei</option>
                            <option value="borrowed">Peguei</option>
                          </select>
                        </label>

                        <label className="grid gap-1 text-sm font-semibold">
                          Pessoa ou instituicao
                          <input
                            className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            onChange={(event) =>
                              setPersonalLoanForm((current) => ({
                                ...current,
                                personName: event.target.value
                              }))
                            }
                            value={personalLoanForm.personName}
                          />
                        </label>

                        <label className="grid gap-1 text-sm font-semibold">
                          Descricao
                          <input
                            className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            onChange={(event) =>
                              setPersonalLoanForm((current) => ({
                                ...current,
                                description: event.target.value
                              }))
                            }
                            placeholder="Contrato, combinado, parcela"
                            value={personalLoanForm.description}
                          />
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="grid gap-1 text-sm font-semibold">
                            Valor principal
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              min="0"
                              onChange={(event) =>
                                setPersonalLoanForm((current) => ({
                                  ...current,
                                  principalAmount: event.target.value
                                }))
                              }
                              step="0.01"
                              type="number"
                              value={personalLoanForm.principalAmount}
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-semibold">
                            Valor pago
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              min="0"
                              onChange={(event) =>
                                setPersonalLoanForm((current) => ({
                                  ...current,
                                  paidAmount: event.target.value
                                }))
                              }
                              step="0.01"
                              type="number"
                              value={personalLoanForm.paidAmount}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="grid gap-1 text-sm font-semibold">
                            Inicio
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(event) =>
                                setPersonalLoanForm((current) => ({
                                  ...current,
                                  startDate: event.target.value
                                }))
                              }
                              type="date"
                              value={personalLoanForm.startDate}
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-semibold">
                            Vencimento
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(event) =>
                                setPersonalLoanForm((current) => ({
                                  ...current,
                                  dueDate: event.target.value
                                }))
                              }
                              type="date"
                              value={personalLoanForm.dueDate}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="grid gap-1 text-sm font-semibold">
                            Juros (% a.m.)
                            <input
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              min="0"
                              onChange={(event) =>
                                setPersonalLoanForm((current) => ({
                                  ...current,
                                  interestRate: event.target.value
                                }))
                              }
                              step="0.01"
                              type="number"
                              value={personalLoanForm.interestRate}
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-semibold">
                            Status
                            <select
                              className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(event) =>
                                setPersonalLoanForm((current) => ({
                                  ...current,
                                  status: event.target.value as LoanStatus
                                }))
                              }
                              value={personalLoanForm.status}
                            >
                              <option value="active">Em aberto</option>
                              <option value="settled">Quitado</option>
                              <option value="late">Atrasado</option>
                            </select>
                          </label>
                        </div>

                        <label className="grid gap-1 text-sm font-semibold">
                          Observacoes
                          <textarea
                            className="min-h-20 rounded-lg border border-black/10 bg-paper px-3 py-2 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            onChange={(event) =>
                              setPersonalLoanForm((current) => ({
                                ...current,
                                notes: event.target.value
                              }))
                            }
                            value={personalLoanForm.notes}
                          />
                        </label>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black"
                            disabled={isSavingLoan}
                            type="submit"
                          >
                            <Save aria-hidden className="h-4 w-4" />
                            {isSavingLoan
                              ? "Salvando"
                              : editingLoanId
                                ? "Salvar"
                                : "Adicionar"}
                          </button>
                          {editingLoanId && (
                            <button
                              className="inline-flex h-11 items-center justify-center rounded-lg bg-paper px-4 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                              onClick={resetPersonalLoanForm}
                              type="button"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    </form>

                    <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                      <div className="flex flex-col gap-3 border-b border-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h2 className="text-lg font-bold">Emprestimos pessoais</h2>
                          <p className="text-sm text-black/60">
                            Acompanhe o que voce emprestou e o que pegou emprestado.
                          </p>
                        </div>
                        <label className="relative block min-w-0 lg:w-80">
                          <Search
                            aria-hidden
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                          />
                          <input
                            className="h-10 w-full rounded-lg border border-black/10 bg-paper pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-sea/20"
                            onChange={(event) =>
                              setPersonalLoanSearch(event.target.value)
                            }
                            placeholder="Buscar pessoa, instituicao ou descricao"
                            value={personalLoanSearch}
                          />
                        </label>
                      </div>
                      <div className="table-scroll overflow-x-auto">
                        <table className="min-w-[1080px] w-full text-left text-sm">
                          <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                            <tr>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Direcao</th>
                              <th className="px-4 py-3">Pessoa</th>
                              <th className="px-4 py-3">Descricao</th>
                              <th className="px-4 py-3">Principal</th>
                              <th className="px-4 py-3">Pago</th>
                              <th className="px-4 py-3">Saldo</th>
                              <th className="px-4 py-3">Vencimento</th>
                              <th className="px-4 py-3">Acoes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/10">
                            {filteredPersonalLoans.map((loan) => {
                              const status = resolveLoanStatus(
                                loan.status,
                                loan.dueDate,
                                loan.principalAmount,
                                loan.paidAmount
                              );
                              const openAmount = Math.max(
                                loan.principalAmount - loan.paidAmount,
                                0
                              );

                              return (
                                <tr
                                  className="hover:bg-black/[0.018]"
                                  key={loan.id}
                                >
                                  <td className="px-4 py-3">
                                    <span
                                      className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1 ${loanStatusClass(status)}`}
                                    >
                                      {loanStatusLabel[status]}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    {loanDirectionLabel[loan.direction]}
                                  </td>
                                  <td className="px-4 py-3 font-semibold">
                                    {loan.personName}
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-semibold text-ink">
                                      {loan.description}
                                    </p>
                                    {loan.interestRate > 0 && (
                                      <p className="text-xs text-black/45">
                                        Juros {loan.interestRate.toLocaleString("pt-BR", {
                                          maximumFractionDigits: 2
                                        })}
                                        % a.m.
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    {formatCurrency.format(loan.principalAmount)}
                                  </td>
                                  <td className="px-4 py-3">
                                    {formatCurrency.format(loan.paidAmount)}
                                  </td>
                                  <td
                                    className={`px-4 py-3 font-bold ${
                                      loan.direction === "lent"
                                        ? "text-sea"
                                        : "text-berry"
                                    }`}
                                  >
                                    {formatCurrency.format(openAmount)}
                                  </td>
                                  <td className="px-4 py-3">
                                    {new Date(
                                      `${loan.dueDate}T00:00:00`
                                    ).toLocaleDateString("pt-BR")}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-paper px-3 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                                        disabled={isSavingLoan}
                                        onClick={() => startEditingLoan(loan)}
                                        type="button"
                                      >
                                        <Pencil aria-hidden className="h-4 w-4" />
                                        Editar
                                      </button>
                                      <button
                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-berry/10 px-3 text-sm font-bold text-berry ring-1 ring-berry/20 hover:bg-berry/15"
                                        disabled={isSavingLoan}
                                        onClick={() => deletePersonalLoan(loan)}
                                        type="button"
                                      >
                                        <Trash2 aria-hidden className="h-4 w-4" />
                                        Excluir
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {filteredPersonalLoans.length === 0 && (
                              <tr>
                                <td
                                  className="px-4 py-8 text-center text-black/55"
                                  colSpan={9}
                                >
                                  Nenhum emprestimo encontrado.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </section>
                </>
              )}
            </section>
          )}

          {activeView === "custos" && (
            <section className="mt-5 grid gap-5">
              {/* ── Sub-tabs ── */}
              <div className="flex flex-wrap gap-2">
                {([
                  ["calc",      "Calculadora"],
                  ["alerts",    "Alertas de Margem"],
                  ["simulator", "Simulador"],
                  ["promo",     "Promoção"],
                  ["pareto",    "Ranking Pareto"]
                ] as const).map(([tab, label]) => (
                  <button
                    className={`h-9 rounded-xl px-4 text-sm font-bold ring-1 transition ${
                      calculatorTab === tab
                        ? "bg-slate-900 text-white ring-slate-900 shadow-sm"
                        : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                    }`}
                    key={tab}
                    onClick={() => setCalculatorTab(tab)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Calculadora ── */}
              {calculatorTab === "calc" && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <CircleDollarSign aria-hidden className="h-5 w-5 text-sea" />
                    <h2 className="text-lg font-bold text-slate-900">Calculadora de Custos</h2>
                  </div>
                  <p className="text-sm text-slate-500">
                    Simule preço, custo e margem por SKU. Selecione um marketplace para preencher a comissão automaticamente.
                  </p>
                </div>

                <div className="grid gap-6 p-5 xl:grid-cols-[1fr_340px]">
                  <div className="grid gap-5">

                    {/* SKU + Produto */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                        SKU
                        <select
                          className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm font-normal text-slate-900 outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) => {
                            const product = costCenterProductRows.find(p => p.sku === event.target.value);
                            const option = productOptions.find(p => p.sku === event.target.value);
                            if (product) { selectProductForCalculator(product); return; }
                            if (option) { selectSalesProductForCalculator(option); }
                          }}
                          value={calculatorForm.sku}
                        >
                          {/* Garante que o SKU importado aparece como opção válida,
                              mesmo que ainda não esteja em productOptions */}
                          {calculatorForm.sku &&
                            !productOptions.some(p => p.sku === calculatorForm.sku) && (
                              <option value={calculatorForm.sku}>{calculatorForm.sku} (novo)</option>
                          )}
                          {productOptions.map((product) => (
                            <option key={product.sku} value={product.sku}>{product.sku}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">
                        Produto
                        <input
                          className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(e) => setCalculatorForm(c => ({ ...c, name: e.target.value }))}
                          placeholder="Título do produto"
                          value={calculatorForm.name}
                        />
                      </label>
                    </div>

                    {/* Criar novo produto */}
                    <div>
                      {!showNewProductForm ? (
                        <button
                          className="h-9 rounded-lg border border-dashed border-slate-300 px-3 text-xs font-bold text-slate-600 transition hover:border-sea hover:text-sea"
                          onClick={() => setShowNewProductForm(true)}
                          type="button"
                        >
                          + Novo produto
                        </button>
                      ) : (
                        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-[1fr_2fr_auto_auto]">
                          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                            Novo SKU
                            <input
                              className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(e) => setNewProductDraft((d) => ({ ...d, sku: e.target.value }))}
                              placeholder="Ex: NOVO-PROD-01"
                              value={newProductDraft.sku}
                            />
                          </label>
                          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                            Nome do produto
                            <input
                              className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm font-normal outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(e) => setNewProductDraft((d) => ({ ...d, name: e.target.value }))}
                              placeholder="Título do produto"
                              value={newProductDraft.name}
                            />
                          </label>
                          <button
                            className="h-10 self-end rounded-lg bg-sea px-4 text-sm font-bold text-white transition hover:bg-sea/90 disabled:opacity-50"
                            disabled={isSavingProduct}
                            onClick={createNewCalculatorProduct}
                            type="button"
                          >
                            {isSavingProduct ? "Criando..." : "Criar"}
                          </button>
                          <button
                            className="h-10 self-end rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
                            onClick={() => {
                              setShowNewProductForm(false);
                              setNewProductDraft({ sku: "", name: "" });
                            }}
                            type="button"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Marketplace preset */}
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Marketplace</p>
                      <select
                        className="h-10 w-full max-w-xs rounded-lg border border-slate-200 bg-paper px-3 text-sm font-normal text-slate-900 outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) => {
                          const presetId = event.target.value as MarketplacePresetId;
                          const preset = MARKETPLACE_PRESETS.find(p => p.id === presetId);
                          if (!preset) return;

                          setSelectedPreset(preset.id);
                          if (preset.id !== "custom") {
                            setCalculatorForm(c => ({
                              ...c,
                              commissionPercentage: String(preset.commission),
                              fixedFee: String(preset.fixedFee)
                            }));
                          }
                        }}
                        value={selectedPreset}
                      >
                        {MARKETPLACE_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                      </select>
                      {MARKETPLACE_PRESETS.find(p => p.id === selectedPreset)?.hint && (
                        <p className="mt-1.5 text-xs text-amber-600">
                          💡 {MARKETPLACE_PRESETS.find(p => p.id === selectedPreset)?.hint}
                        </p>
                      )}
                    </div>

                    {/* Modo de cálculo */}
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["margin",      "Calcular margem"],
                        ["price",       "Preço por margem"],
                        ["fixedProfit", "Preço por lucro"]
                      ] as const).map(([mode, label]) => (
                        <button
                          className={`h-9 rounded-lg px-3 text-sm font-bold ring-1 transition ${
                            calculatorMode === mode
                              ? "bg-sea text-white ring-sea"
                              : "bg-paper text-ink ring-black/10 hover:bg-black/[0.03]"
                          }`}
                          key={mode}
                          onClick={() => setCalculatorMode(mode)}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Campos do formulário */}
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {([
                        ["productCost",                  "Custo produto (R$)",      "0,00",  "number"],
                        ["sellingPrice",                 "Preço de venda (R$)",     "0,00",  "number"],
                        ["commissionPercentage",         "Comissão (%)",            "16,00", "number"],
                        ["fixedFee",                     "Tarifa fixa (R$)",        "0,00",  "number"],
                        ["shippingCost",                 "Frete vendedor (R$)",     "0,00",  "number"],
                        ["packagingCost",                "Embalagem (R$)",          "0,00",  "number"],
                        ["collectionCost",               "Coleta (R$)",             "0,00",  "number"],
                        ["storageCost",                  "Armazenagem (R$)",        "0,00",  "number"],
                        ["operationalCost",              "Operacional (R$)",        "0,00",  "number"],
                        ["taxPercentage",                "Imposto (%)",             "0,00",  "number"],
                        ["adTacosPercentage",            "TACOS / ADS (%)",         "8,00",  "number"],
                        ["affiliateCommissionPercentage","Comissão afiliado (%)",   "0,00",  "number"],
                        ["promotionCredit",              "Crédito promoção (R$)",   "0,00",  "number"],
                        ["validFrom",                    "Vigência",                "",      "date"]
                      ] as const).map(([field, label, placeholder, type]) => (
                        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500" key={field}>
                          {label}
                          <input
                            className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm font-normal text-slate-900 outline-none focus:ring-4 focus:ring-sea/20"
                            min="0"
                            onChange={(e) => {
                              setCalculatorForm(c => ({ ...c, [field]: e.target.value }));
                              // Auto-seleção Shopee por preço
                              if (field === "sellingPrice" && selectedPreset.startsWith("shopee")) {
                                const price = parseFloat(e.target.value.replace(",", ".")) || 0;
                                const shopeePreset = getShopeePreset(price);
                                const preset = MARKETPLACE_PRESETS.find(p => p.id === shopeePreset)!;
                                setSelectedPreset(shopeePreset);
                                setCalculatorForm(c => ({
                                  ...c,
                                  sellingPrice: e.target.value,
                                  commissionPercentage: String(preset.commission),
                                  fixedFee: String(preset.fixedFee)
                                }));
                              }
                            }}
                            placeholder={placeholder}
                            step="0.01"
                            type={type}
                            value={calculatorForm[field as keyof CostCalculatorFormState]}
                          />
                        </label>
                      ))}

                      {calculatorMode === "price" && (
                        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                          Margem desejada (%)
                          <input
                            className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            min="0" step="0.01" type="number"
                            onChange={(e) => setCalculatorForm(c => ({ ...c, desiredProfitMargin: e.target.value }))}
                            placeholder="15,00"
                            value={calculatorForm.desiredProfitMargin}
                          />
                        </label>
                      )}

                      {calculatorMode === "fixedProfit" && (
                        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                          Lucro desejado (R$)
                          <input
                            className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            min="0" step="0.01" type="number"
                            onChange={(e) => setCalculatorForm(c => ({ ...c, desiredFixedProfit: e.target.value }))}
                            placeholder="10,00"
                            value={calculatorForm.desiredFixedProfit}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* ── Painel de resultado ── */}
                  <aside className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Resultado</h3>
                    {calculatorResult ? (
                      <div className="mt-4 space-y-2 text-sm">
                        {([
                          ["Preço de venda",     calculatorResult.sellingPrice,           false],
                          ["Custo produto",      -calculatorResult.productCost,           true],
                          ["Comissão ML",        -calculatorResult.commission,            true],
                          ["Tarifa fixa",        -calculatorResult.fixedFee,              true],
                          ["Frete vendedor",     -calculatorResult.shippingCost,          true],
                          ["Embalagem",          -calculatorResult.packagingCost,         true],
                          ["Coleta",             -calculatorResult.collectionCost,        true],
                          ["Armazenagem",        -calculatorResult.storageCost,           true],
                          ["Operacional",        -calculatorResult.operationalCost,       true],
                          ["Impostos",           -calculatorResult.taxes,                 true],
                          ["TACOS / ADS",        -calculatorResult.advertisingInvestment, true],
                          ["Com. afiliado",      -calculatorResult.affiliateCommission,   true],
                          ["Crédito promoção",   calculatorResult.promotionCredit,        false],
                        ] as [string, number, boolean][])
                          .filter(([, value]) => value !== 0)
                          .map(([label, value]) => (
                            <div className="flex justify-between gap-2" key={label}>
                              <span className="text-slate-500">{label}</span>
                              <span className={`font-semibold tabular-nums ${value < 0 ? "text-rose-600" : "text-slate-900"}`}>
                                {formatCurrency.format(value)}
                              </span>
                            </div>
                          ))}

                        <div className="mt-3 border-t border-slate-200 pt-3 space-y-2">
                          <div className="flex justify-between gap-2 font-semibold text-slate-700">
                            <span>Total custos</span>
                            <span className="tabular-nums text-rose-600">{formatCurrency.format(-calculatorResult.totalCosts)}</span>
                          </div>
                          <div className={`flex justify-between gap-2 text-base font-bold ${calculatorResult.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            <span>Lucro líquido</span>
                            <span className="tabular-nums">{formatCurrency.format(calculatorResult.netProfit)}</span>
                          </div>
                          <div className={`flex justify-between gap-2 font-bold ${calculatorResult.profitMargin >= 0.15 ? "text-emerald-600" : calculatorResult.profitMargin >= 0 ? "text-amber-600" : "text-rose-600"}`}>
                            <span>Margem</span>
                            <span className="tabular-nums">{formatPercent(calculatorResult.profitMargin)}</span>
                          </div>
                          <div className="flex justify-between gap-2 text-xs font-medium text-slate-500">
                            <span>Markup</span>
                            <span className="tabular-nums">{calculatorResult.markup.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-400">Informe custos e preço ou uma meta válida.</p>
                    )}

                    <div className="mt-5 space-y-2">
                      <button
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-black disabled:opacity-50"
                        disabled={isSavingCalculatorCosts || isResettingCalculatorCosts}
                        onClick={saveCalculatorCosts}
                        type="button"
                      >
                        <PackagePlus aria-hidden className="h-4 w-4" />
                        {isSavingCalculatorCosts ? "Salvando..." : "Aplicar custos internos"}
                      </button>
                      <button
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSavingCalculatorCosts || isResettingCalculatorCosts || !hasCalculatorManagedCosts}
                        onClick={resetCalculatedProducts}
                        type="button"
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                        {isResettingCalculatorCosts ? "Limpando..." : "Excluir produtos calculados"}
                      </button>
                    </div>
                    <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                      SKUs das vendas sincronizadas. Preço, comissão e frete usam médias reais. TACOS permanece manual.
                    </p>
                  </aside>
                </div>
              </section>
              )}

              {/* ── Alertas de Margem ── */}
              {calculatorTab === "alerts" && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Alertas de Margem</h2>
                    <p className="text-xs text-slate-500">Produtos abaixo do threshold mínimo com preço sugerido para recuperar a margem.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    Threshold mínimo
                    <input
                      className="h-8 w-20 rounded-lg border border-slate-200 bg-paper px-2 text-sm outline-none focus:ring-2 focus:ring-sea/20"
                      max="50" min="0" step="1" type="number"
                      onChange={(e) => setAlertThreshold(Number(e.target.value))}
                      value={alertThreshold}
                    />
                    <span>%</span>
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3">SKU / Produto</th>
                        <th className="px-5 py-3 text-right">Preço médio</th>
                        <th className="px-5 py-3 text-right">Custo</th>
                        <th className="px-5 py-3 text-right">Margem atual</th>
                        <th className="px-5 py-3 text-right">Preço sugerido</th>
                        <th className="px-5 py-3 text-right">Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {costCenterProductRows.length === 0 ? (
                        <tr><td className="px-5 py-8 text-center text-slate-400" colSpan={6}>Nenhum produto calculado. Use a Calculadora e aplique os custos internos primeiro.</td></tr>
                      ) : costCenterProductRows
                          .filter(p => p.contributionMarginRate * 100 < alertThreshold)
                          .sort((a, b) => a.contributionMarginRate - b.contributionMarginRate)
                          .map(p => {
                            const varPct = (p.advertisingTacosPercentage || 8) / 100;
                            const fixedCost = p.productCost + p.packagingCost + p.operationalCost;
                            const commPct = 0.16;
                            const suggestedPrice = fixedCost / (1 - commPct - varPct - (alertThreshold / 100));
                            const delta = suggestedPrice - p.averagePrice;
                            return (
                              <tr className="hover:bg-rose-50/40" key={p.sku}>
                                <td className="px-5 py-3">
                                  <p className="font-bold text-slate-900">{p.sku}</p>
                                  <p className="text-xs text-slate-400 line-clamp-1">{p.title}</p>
                                </td>
                                <td className="px-5 py-3 text-right tabular-nums">{formatCurrency.format(p.averagePrice)}</td>
                                <td className="px-5 py-3 text-right tabular-nums">{formatCurrency.format(fixedCost)}</td>
                                <td className="px-5 py-3 text-right font-bold tabular-nums text-rose-600">{formatPercent(p.contributionMarginRate)}</td>
                                <td className="px-5 py-3 text-right font-bold tabular-nums text-emerald-700">{suggestedPrice > 0 ? formatCurrency.format(suggestedPrice) : "—"}</td>
                                <td className="px-5 py-3 text-right tabular-nums text-amber-600">+{suggestedPrice > 0 ? formatCurrency.format(delta) : "—"}</td>
                              </tr>
                            );
                          })}
                      {costCenterProductRows.length > 0 && costCenterProductRows.filter(p => p.contributionMarginRate * 100 >= alertThreshold).length > 0 && (
                        <>
                          <tr className="bg-emerald-50/60">
                            <td className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600" colSpan={6}>✓ Acima do threshold ({costCenterProductRows.filter(p => p.contributionMarginRate * 100 >= alertThreshold).length} SKUs)</td>
                          </tr>
                          {costCenterProductRows.filter(p => p.contributionMarginRate * 100 >= alertThreshold).map(p => (
                            <tr className="hover:bg-emerald-50/30" key={p.sku}>
                              <td className="px-5 py-3"><p className="font-semibold text-slate-700">{p.sku}</p></td>
                              <td className="px-5 py-3 text-right tabular-nums text-slate-600">{formatCurrency.format(p.averagePrice)}</td>
                              <td className="px-5 py-3 text-right tabular-nums text-slate-600">{formatCurrency.format(p.productCost + p.packagingCost + p.operationalCost)}</td>
                              <td className="px-5 py-3 text-right font-bold tabular-nums text-emerald-600">{formatPercent(p.contributionMarginRate)}</td>
                              <td className="px-5 py-3 text-right text-slate-400">—</td>
                              <td className="px-5 py-3 text-right text-slate-400">—</td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              )}

              {/* ── Simulador What-if ── */}
              {calculatorTab === "simulator" && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                  <h2 className="text-base font-bold text-slate-900">Simulador de Cenários</h2>
                  <p className="text-xs text-slate-500">Ajuste variáveis e veja o impacto na margem em tempo real.</p>
                </div>
                <div className="p-5 space-y-5">
                  <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 max-w-xs">
                    Produto
                    <select
                      className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(e) => setWhatIfSku(e.target.value)}
                      value={whatIfSku}
                    >
                      <option value="">Selecione um produto...</option>
                      {costCenterProductRows.map(p => (
                        <option key={p.sku} value={p.sku}>{p.sku} — {p.title}</option>
                      ))}
                    </select>
                  </label>
                  {whatIfSku && (() => {
                    const base = costCenterProductRows.find(p => p.sku === whatIfSku);
                    if (!base) return null;
                    const simPrice = base.averagePrice * (1 + whatIfSliders.price / 100);
                    const simCommPct = 0.16 + whatIfSliders.commission / 100;
                    const simShipping = base.productCost * 0.1 + whatIfSliders.shipping;
                    const simTaxPct = (base.taxPercentage || 0) / 100 + whatIfSliders.tax / 100;
                    const simCosts = base.productCost + base.packagingCost + base.operationalCost + simShipping + simPrice * simCommPct + simPrice * simTaxPct + simPrice * (base.advertisingTacosPercentage / 100);
                    const simMargin = simPrice > 0 ? (simPrice - simCosts) / simPrice : 0;
                    const origMargin = base.contributionMarginRate;
                    const deltaMargin = simMargin - origMargin;
                    return (
                      <div className="grid gap-6 xl:grid-cols-2">
                        <div className="space-y-4">
                          {([
                            ["price",      "Preço",      -50, 50,  0, "%"],
                            ["commission", "Comissão",   -10, 10,  0, "pp"],
                            ["shipping",   "Frete",      -20, 20,  0, "R$"],
                            ["tax",        "Imposto",    -10, 10,  0, "pp"]
                          ] as const).map(([key, label, min, max, , unit]) => (
                            <div key={key}>
                              <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
                                <span>{label}</span>
                                <span className={whatIfSliders[key] > 0 ? "text-emerald-600" : whatIfSliders[key] < 0 ? "text-rose-600" : "text-slate-400"}>
                                  {whatIfSliders[key] > 0 ? "+" : ""}{whatIfSliders[key].toFixed(1)} {unit}
                                </span>
                              </div>
                              <input
                                className="w-full accent-slate-800"
                                max={max} min={min} step="0.5" type="range"
                                onChange={(e) => setWhatIfSliders(s => ({ ...s, [key]: Number(e.target.value) }))}
                                value={whatIfSliders[key]}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Comparativo</p>
                          <div className="space-y-3">
                            {([
                              ["Preço",   base.averagePrice, simPrice,  "currency"],
                              ["Margem",  origMargin,        simMargin, "percent"],
                              ["Lucro",   base.averagePrice * origMargin, simPrice * simMargin, "currency"]
                            ] as [string, number, number, string][]).map(([label, orig, sim, fmt]) => (
                              <div key={label} className="flex items-center justify-between gap-4">
                                <span className="text-sm text-slate-500">{label}</span>
                                <div className="flex items-center gap-3 text-sm font-semibold tabular-nums">
                                  <span className="text-slate-400">{fmt === "currency" ? formatCurrency.format(orig) : formatPercent(orig)}</span>
                                  <span className="text-slate-300">→</span>
                                  <span className={sim > orig ? "text-emerald-600" : sim < orig ? "text-rose-600" : "text-slate-700"}>{fmt === "currency" ? formatCurrency.format(sim) : formatPercent(sim)}</span>
                                </div>
                              </div>
                            ))}
                            <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-bold text-center ${deltaMargin >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                              {deltaMargin >= 0 ? "▲" : "▼"} {Math.abs(deltaMargin * 100).toFixed(1)}pp na margem
                            </div>
                          </div>
                          <button className="mt-4 w-full text-xs text-slate-400 hover:text-slate-600" onClick={() => setWhatIfSliders({ price: 0, commission: 0, shipping: 0, tax: 0 })} type="button">
                            Resetar sliders
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                  {!whatIfSku && <p className="text-sm text-slate-400">Selecione um produto para começar a simulação.</p>}
                </div>
              </section>
              )}

              {/* ── Simulador de Promoção ── */}
              {calculatorTab === "promo" && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                  <h2 className="text-base font-bold text-slate-900">Simulador de Promoção</h2>
                  <p className="text-xs text-slate-500">Veja o impacto de um desconto na margem antes de aplicar.</p>
                </div>
                <div className="p-5 space-y-5">
                  <div className="flex flex-wrap gap-4 items-end">
                    <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Produto
                      <select className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm outline-none focus:ring-4 focus:ring-sea/20 min-w-[200px]"
                        onChange={(e) => setWhatIfSku(e.target.value)} value={whatIfSku}>
                        <option value="">Selecione...</option>
                        {costCenterProductRows.map(p => <option key={p.sku} value={p.sku}>{p.sku}</option>)}
                      </select>
                    </label>
                    <div className="flex gap-2 items-end">
                      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Tipo
                        <select className="h-10 rounded-lg border border-slate-200 bg-paper px-3 text-sm outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(e) => setPromoDiscount(d => ({ ...d, type: e.target.value as "percent" | "fixed" }))} value={promoDiscount.type}>
                          <option value="percent">Percentual (%)</option>
                          <option value="fixed">Valor fixo (R$)</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Desconto
                        <input className="h-10 w-28 rounded-lg border border-slate-200 bg-paper px-3 text-sm outline-none focus:ring-4 focus:ring-sea/20"
                          min="0" step="0.01" type="number"
                          onChange={(e) => setPromoDiscount(d => ({ ...d, value: e.target.value }))}
                          placeholder="10" value={promoDiscount.value} />
                      </label>
                    </div>
                  </div>
                  {whatIfSku && promoDiscount.value && (() => {
                    const base = costCenterProductRows.find(p => p.sku === whatIfSku);
                    if (!base) return null;
                    const discountValue = parseFloat(promoDiscount.value.replace(",", ".")) || 0;
                    const promoPrice = promoDiscount.type === "percent"
                      ? base.averagePrice * (1 - discountValue / 100)
                      : base.averagePrice - discountValue;
                    const fixedCosts = base.productCost + base.packagingCost + base.operationalCost;
                    const origCosts = fixedCosts + base.averagePrice * 0.16 + base.averagePrice * (base.advertisingTacosPercentage / 100);
                    const promoCosts = fixedCosts + promoPrice * 0.16 + promoPrice * (base.advertisingTacosPercentage / 100);
                    const origProfit = base.averagePrice - origCosts;
                    const promoProfit = promoPrice - promoCosts;
                    const origMargin = base.averagePrice > 0 ? origProfit / base.averagePrice : 0;
                    const promoMargin = promoPrice > 0 ? promoProfit / promoPrice : 0;
                    return (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {([
                          ["Preço",     base.averagePrice, promoPrice,  "currency"],
                          ["Lucro",     origProfit,        promoProfit, "currency"],
                          ["Margem",    origMargin,        promoMargin, "percent"],
                          ["Desconto",  0,                 discountValue * (promoDiscount.type === "percent" ? base.averagePrice / 100 : 1), "currency"]
                        ] as [string, number, number, string][]).map(([label, orig, sim, fmt]) => {
                          const isNeg = sim < orig;
                          return (
                            <div key={label} className={`rounded-xl p-4 ring-1 ${isNeg ? "bg-rose-50 ring-rose-200" : "bg-emerald-50 ring-emerald-200"}`}>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                              <p className={`mt-1 text-xl font-bold tabular-nums ${isNeg ? "text-rose-700" : "text-emerald-700"}`}>
                                {fmt === "currency" ? formatCurrency.format(sim) : formatPercent(sim)}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {isNeg ? "▼" : "▲"} vs {fmt === "currency" ? formatCurrency.format(Math.abs(sim - orig)) : `${Math.abs((sim - orig) * 100).toFixed(1)}pp`}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </section>
              )}

              {/* ── Ranking Pareto ── */}
              {calculatorTab === "pareto" && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                  <h2 className="text-base font-bold text-slate-900">Ranking Pareto</h2>
                  <p className="text-xs text-slate-500">Produtos ordenados por contribuição de lucro. Os 20% do topo geralmente representam 80% do resultado.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3">#</th>
                        <th className="px-5 py-3">SKU / Produto</th>
                        <th className="px-5 py-3 text-right">Receita total</th>
                        <th className="px-5 py-3 text-right">Margem</th>
                        <th className="px-5 py-3 text-right">Lucro estimado</th>
                        <th className="px-5 py-3 text-right">Contribuição acum.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {costCenterProductRows.length === 0 ? (
                        <tr><td className="px-5 py-8 text-center text-slate-400" colSpan={6}>Nenhum produto calculado ainda.</td></tr>
                      ) : (() => {
                        const ranked = [...costCenterProductRows]
                          .map(p => ({ ...p, estimatedProfit: p.grossRevenue * p.contributionMarginRate }))
                          .sort((a, b) => b.estimatedProfit - a.estimatedProfit);
                        const totalProfit = ranked.reduce((s, p) => s + p.estimatedProfit, 0);
                        let cumulative = 0;
                        return ranked.map((p, i) => {
                          cumulative += p.estimatedProfit;
                          const cumulativePct = totalProfit > 0 ? cumulative / totalProfit : 0;
                          const isTop20 = i < Math.ceil(ranked.length * 0.2);
                          return (
                            <tr className={`hover:bg-slate-50 ${isTop20 ? "border-l-2 border-l-emerald-400" : ""}`} key={p.sku}>
                              <td className="px-5 py-3 font-bold text-slate-400">#{i + 1}</td>
                              <td className="px-5 py-3">
                                <p className="font-bold text-slate-900">{p.sku}</p>
                                <p className="text-xs text-slate-400 line-clamp-1">{p.title}</p>
                              </td>
                              <td className="px-5 py-3 text-right tabular-nums">{formatCurrency.format(p.grossRevenue)}</td>
                              <td className={`px-5 py-3 text-right font-bold tabular-nums ${p.contributionMarginRate >= 0.15 ? "text-emerald-600" : p.contributionMarginRate >= 0 ? "text-amber-600" : "text-rose-600"}`}>
                                {formatPercent(p.contributionMarginRate)}
                              </td>
                              <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatCurrency.format(p.estimatedProfit)}</td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${cumulativePct * 100}%` }} />
                                  </div>
                                  <span className="text-xs font-semibold tabular-nums text-slate-600">{formatPercent(cumulativePct)}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                    {costCenterProductRows.length > 0 && (
                      <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                        <tr>
                          <td colSpan={2} className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Total portfólio</td>
                          <td className="px-5 py-3 text-right font-bold tabular-nums">{formatCurrency.format(costCenterProductRows.reduce((s, p) => s + p.grossRevenue, 0))}</td>
                          <td className="px-5 py-3 text-right font-bold tabular-nums">{formatPercent(costCenterProductRows.reduce((s, p) => s + p.contributionMarginRate, 0) / costCenterProductRows.length)}</td>
                          <td className="px-5 py-3 text-right font-bold tabular-nums">{formatCurrency.format(costCenterProductRows.reduce((s, p) => s + p.grossRevenue * p.contributionMarginRate, 0))}</td>
                          <td className="px-5 py-3 text-right font-bold text-emerald-600">100%</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </section>
              )}

              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Produtos do Centro de Custos</h2>
                    <p className="text-sm text-black/60">
                      Somente SKUs calculados pela Calculadora de Custos aparecem aqui.
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                    <select
                      className="h-10 rounded-lg border border-black/10 bg-paper px-3 text-sm outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(event) => setCostMarketplaceFilter(event.target.value)}
                      value={costMarketplaceFilter}
                    >
                      <option value="all">Todos os marketplaces</option>
                      {MARKETPLACE_TAGS.map((tag) => (
                        <option key={tag} value={tag}>{tag}</option>
                      ))}
                    </select>
                    <span className="relative w-full lg:w-80">
                      <Search
                        aria-hidden
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                      />
                      <input
                        className="h-10 w-full rounded-lg border border-black/10 bg-paper pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) => setCostProductSearch(event.target.value)}
                        placeholder="Buscar SKU ou produto"
                        value={costProductSearch}
                      />
                    </span>
                  </div>
                </div>
                <div className="table-scroll overflow-x-auto">
                  <table className="min-w-[1380px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Marketplace</th>
                        <th className="px-4 py-3">Preco medio</th>
                        <th className="px-4 py-3">Custo produto</th>
                        <th className="px-4 py-3">Embalagem</th>
                        <th className="px-4 py-3">Operacional</th>
                        <th className="px-4 py-3">Imposto</th>
                        <th className="px-4 py-3">ADS/TACOS</th>
                        <th className="px-4 py-3">Margem unitária</th>
                        <th className="px-4 py-3">Acoes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {filteredCostCenterProductRows.map((product) => {
                        const isEditingProduct = editingProductSku === product.sku;

                        return (
                          <tr className="hover:bg-black/[0.018]" key={product.sku}>
                          <td className="px-4 py-3">
                            {isEditingProduct ? (
                              <input
                                className="h-10 w-full min-w-60 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                                onChange={(event) =>
                                  setProductEditForm((current) => ({
                                    ...current,
                                    title: event.target.value
                                  }))
                                }
                                value={productEditForm.title}
                              />
                            ) : (
                              <p className="font-semibold text-ink">
                                {product.title}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-bold">
                            {isEditingProduct ? (
                              <input
                                className="h-10 w-44 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                                onChange={(event) =>
                                  setProductEditForm((current) => ({
                                    ...current,
                                    sku: event.target.value
                                  }))
                                }
                                value={productEditForm.sku}
                              />
                            ) : (
                              product.sku
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              className="h-9 rounded-lg border border-black/10 bg-paper px-2 text-xs outline-none focus:ring-4 focus:ring-sea/20"
                              onChange={(event) =>
                                setProductMarketplaces((current) => ({
                                  ...current,
                                  [product.sku]: event.target.value
                                }))
                              }
                              value={productMarketplaces[product.sku] ?? "Mercado Livre"}
                            >
                              {MARKETPLACE_TAGS.map((tag) => (
                                <option key={tag} value={tag}>{tag}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            {formatCurrency.format(product.averagePrice)}
                          </td>
                          <td className="px-4 py-3">
                            {formatCurrency.format(product.productCost)}
                          </td>
                          <td className="px-4 py-3">
                            {formatCurrency.format(product.packagingCost)}
                          </td>
                          <td className="px-4 py-3">
                            {formatCurrency.format(product.operationalCost)}
                          </td>
                          <td className="px-4 py-3">
                            {product.taxPercentage.toLocaleString("pt-BR", {
                              maximumFractionDigits: 2
                            })}
                            %
                          </td>
                          <td className="px-4 py-3">
                            {formatCurrency.format(product.advertisingCost)}
                            {product.advertisingTacosPercentage > 0 && (
                              <p className="text-xs text-black/45">
                                {product.advertisingTacosPercentage.toLocaleString(
                                  "pt-BR",
                                  { maximumFractionDigits: 2 }
                                )}
                                %
                              </p>
                            )}
                          </td>
                          <td
                            className={`px-4 py-3 font-bold ${
                              product.contributionMargin >= 0
                                ? "text-sea"
                                : "text-berry"
                            }`}
                          >
                            {formatCurrency.format(product.contributionMargin)}
                            <span className="ml-2 text-xs">
                              {formatPercent(product.contributionMarginRate)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {isEditingProduct ? (
                                <>
                                  <button
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-3 text-sm font-bold text-white hover:bg-black"
                                    disabled={isSavingProduct}
                                    onClick={() => saveProductEdit(product.sku)}
                                    type="button"
                                  >
                                    <Save aria-hidden className="h-4 w-4" />
                                    Salvar
                                  </button>
                                  <button
                                    className="inline-flex h-9 items-center justify-center rounded-lg bg-paper px-3 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                                    disabled={isSavingProduct}
                                    onClick={cancelProductEditing}
                                    type="button"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-paper px-3 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                                    onClick={() =>
                                      selectProductForCalculator(product)
                                    }
                                    type="button"
                                  >
                                    <CircleDollarSign
                                      aria-hidden
                                      className="h-4 w-4"
                                    />
                                    Calcular
                                  </button>
                                  <button
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-paper px-3 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                                    disabled={isSavingProduct}
                                    onClick={() => startEditingProduct(product)}
                                    type="button"
                                  >
                                    <Pencil aria-hidden className="h-4 w-4" />
                                    Editar
                                  </button>
                                  <button
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-berry/10 px-3 text-sm font-bold text-berry ring-1 ring-berry/20 hover:bg-berry/15"
                                    disabled={isSavingProduct}
                                    onClick={() => archiveProduct(product)}
                                    type="button"
                                  >
                                    <Trash2 aria-hidden className="h-4 w-4" />
                                    Excluir SKU
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          </tr>
                        );
                      })}
                      {filteredCostCenterProductRows.length === 0 && (
                        <tr>
                          <td
                            className="px-4 py-8 text-center text-black/55"
                            colSpan={11}
                          >
                            Nenhum produto encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          )}

          {activeView === "estoque" && (
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_360px]">
              <InventoryTable
                formatCurrency={formatCurrency}
                formatNumber={formatNumber}
                isSyncing={isSyncingInventory}
                onSync={syncMercadoLivreInventory}
                rows={inventoryValuationRows}
                statusClass={statusClass}
                supabaseConnected={supabaseStatus === "connected"}
              />

              <aside className="space-y-6">
                <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 ring-1 ring-slate-200">
                      <ClipboardList aria-hidden className="h-5 w-5 text-slate-600" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">Fila de Sincronização</h2>
                  </div>
                  <div className="mt-6 space-y-3">
                    {["Pedidos", "Estoque Full", "Anúncios", "Promoções"].map((item, index) => (
                      <div
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
                        key={item}
                      >
                        <span className="text-sm font-bold text-slate-700">{item}</span>
                        <span className="text-xs font-bold text-slate-400">
                          {index === 0 ? "A cada 15 min" : "A cada 1 h"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          )}

          {activeView === "estoque_fisico" && (
            <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Estoque Físico</h2>
                    <p className="text-sm text-black/60">
                      Quantidades próprias com valor estimado caso tudo seja vendido.
                    </p>
                  </div>
                  <label className="relative w-full lg:w-96">
                    <Search
                      aria-hidden
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35"
                    />
                    <input
                      className="h-10 w-full rounded-lg border border-black/10 bg-paper pl-10 pr-3 text-sm outline-none transition focus:border-ink"
                      onChange={(event) =>
                        setPhysicalInventorySearch(event.target.value)
                      }
                      placeholder="Buscar SKU ou produto"
                      type="search"
                      value={physicalInventorySearch}
                    />
                  </label>
                </div>
                <div className="grid gap-3 border-b border-black/10 p-4 md:grid-cols-4">
                  <div className="rounded-lg border border-black/10 bg-paper p-3">
                    <p className="text-xs font-semibold uppercase tracking-normal text-black/50">
                      SKUs com quantidade
                    </p>
                    <p className="mt-1 text-2xl font-black">
                      {formatNumber.format(physicalInventoryTotals.skuCount)}
                    </p>
                    <p className="text-xs text-black/50">
                      Produtos ativos: {formatNumber.format(productOptions.length)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-black/10 bg-paper p-3">
                    <p className="text-xs font-semibold uppercase tracking-normal text-black/50">
                      Unidades físicas
                    </p>
                    <p className="mt-1 text-2xl font-black">
                      {formatNumber.format(physicalInventoryTotals.totalQuantity)}
                    </p>
                    <p className="text-xs text-black/50">
                      Quantidade editável
                    </p>
                  </div>
                  <div className="rounded-lg border border-black/10 bg-paper p-3">
                    <p className="text-xs font-semibold uppercase tracking-normal text-black/50">
                      Venda bruta estimada
                    </p>
                    <p className="mt-1 text-2xl font-black">
                      {formatCurrency.format(physicalInventoryTotals.grossValue)}
                    </p>
                    <p className="text-xs text-black/50">
                      Antes das taxas do ML
                    </p>
                  </div>
                  <div className="rounded-lg border border-black/10 bg-paper p-3">
                    <p className="text-xs font-semibold uppercase tracking-normal text-black/50">
                      Valor líquido estimado
                    </p>
                    <p className="mt-1 text-2xl font-black text-sea">
                      {formatCurrency.format(physicalInventoryTotals.netValue)}
                    </p>
                    <p className="text-xs text-black/50">
                      Taxas ML:{" "}
                      {formatCurrency.format(
                        physicalInventoryTotals.marketplaceFeeValue
                      )}{" "}
                      | Frete vendedor:{" "}
                      {formatCurrency.format(
                        physicalInventoryTotals.sellerShippingValue
                      )}
                    </p>
                  </div>
                </div>
                <div className="table-scroll overflow-x-auto">
                  <table className="min-w-[1460px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">SKU / Produto</th>
                        <th className="px-4 py-3">Quantidade</th>
                        <th className="px-4 py-3">Venda un.</th>
                        <th className="px-4 py-3">Taxa ML un.</th>
                        <th className="px-4 py-3">Frete vendedor un.</th>
                        <th className="px-4 py-3">Líquido un.</th>
                        <th className="px-4 py-3">Venda bruta</th>
                        <th className="px-4 py-3">Taxa ML est.</th>
                        <th className="px-4 py-3">Frete vendedor est.</th>
                        <th className="px-4 py-3">Líquido estimado</th>
                        <th className="px-4 py-3">Base</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {filteredPhysicalInventoryRows.map((row) => (
                        <tr key={row.sku}>
                          <td className="px-4 py-3">
                            <p className="font-bold">{row.sku}</p>
                            <p className="text-xs text-black/50">{row.title}</p>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              aria-label={`Quantidade física do SKU ${row.sku}`}
                              className="h-10 w-28 rounded-lg border border-black/10 bg-white px-3 text-right text-sm font-bold outline-none transition focus:border-ink"
                              min="0"
                              onChange={(event) =>
                                updatePhysicalInventoryQuantity(
                                  row.sku,
                                  event.target.value
                                )
                              }
                              placeholder="0"
                              step="1"
                              type="number"
                              value={row.quantity > 0 ? String(row.quantity) : ""}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {row.hasPricing
                              ? formatCurrency.format(row.unitSalePrice)
                              : "Sem venda"}
                          </td>
                          <td className="px-4 py-3">
                            {row.hasPricing
                              ? formatCurrency.format(row.unitMarketplaceFee)
                              : "Sem venda"}
                          </td>
                          <td className="px-4 py-3">
                            {row.hasPricing
                              ? formatCurrency.format(row.unitSellerShippingCost)
                              : "Sem venda"}
                          </td>
                          <td className="px-4 py-3 font-bold">
                            {row.hasPricing
                              ? formatCurrency.format(row.unitNetValue)
                              : "Sem venda"}
                          </td>
                          <td className="px-4 py-3">
                            {row.hasPricing
                              ? formatCurrency.format(row.grossValue)
                              : "Sem venda"}
                          </td>
                          <td className="px-4 py-3">
                            {row.hasPricing
                              ? formatCurrency.format(row.marketplaceFeeValue)
                              : "Sem venda"}
                          </td>
                          <td className="px-4 py-3">
                            {row.hasPricing
                              ? formatCurrency.format(row.sellerShippingValue)
                              : "Sem venda"}
                          </td>
                          <td
                            className={`px-4 py-3 font-bold ${
                              row.netValue < 0 ? "text-berry" : "text-sea"
                            }`}
                          >
                            {row.hasPricing
                              ? formatCurrency.format(row.netValue)
                              : "Sem venda"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1 ${
                                row.hasPricing
                                  ? "bg-emerald-50 text-sea ring-emerald-200"
                                  : "bg-amber-50 text-clay ring-amber-200"
                              }`}
                            >
                              {row.hasPricing ? "Precificado" : "Sem venda"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredPhysicalInventoryRows.length === 0 && (
                        <tr>
                          <td
                            className="px-4 py-8 text-center text-black/55"
                            colSpan={11}
                          >
                            Nenhum produto encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <PackagePlus aria-hidden className="h-5 w-5 text-sea" />
                  <h2 className="text-lg font-bold">Resumo físico</h2>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-lg border border-black/10 bg-paper px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-normal text-black/50">
                      SKUs precificados
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {formatNumber.format(
                        physicalInventoryTotals.pricedSkuCount
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg border border-black/10 bg-paper px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-normal text-black/50">
                      SKUs sem venda recente
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {formatNumber.format(
                        Math.max(
                          0,
                          physicalInventoryTotals.skuCount -
                            physicalInventoryTotals.pricedSkuCount
                        )
                      )}
                    </p>
                  </div>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-4 text-sm font-bold text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={physicalInventoryTotals.totalQuantity === 0}
                    onClick={() => setPhysicalInventoryQuantities({})}
                    type="button"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                    Zerar quantidades
                  </button>
                </div>
              </section>
            </section>
          )}

          {activeView === "ads_analysis" && (
            <section className="mt-5 grid gap-5">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  detail={`${formatNumber.format(adAnalysisTotals.listings)} anúncios monitorados`}
                  icon={Target}
                  title="Visitas analisadas"
                  value={formatNumber.format(adAnalysisTotals.visits)}
                />
                <KpiCard
                  detail={`Anterior ${formatNumber.format(adAnalysisTotals.previousVisits)}`}
                  icon={adVisitChangeRate >= 0 ? TrendingUp : TrendingDown}
                  title="Variação de visitas"
                  tone={adVisitChangeRate >= 0 ? "moss" : "berry"}
                  value={formatPercent(adVisitChangeRate)}
                />
                <KpiCard
                  detail={`${formatNumber.format(adAnalysisTotals.indexed)} anúncios encontrados na busca`}
                  icon={Search}
                  title="Posição orgânica"
                  value={`${formatNumber.format(adAnalysisTotals.indexed)}/${formatNumber.format(adAnalysisTotals.listings)}`}
                />
                <KpiCard
                  detail="Quedas, recuperações e perda de posição"
                  icon={AlertTriangle}
                  title="Alertas ativos"
                  tone={listingAlerts.length > 0 ? "berry" : "moss"}
                  value={formatNumber.format(listingAlerts.length)}
                />
              </section>

              <section className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
                <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <h2 className="text-lg font-bold">Análise de Anúncios</h2>
                      <p className="text-sm text-black/60">
                        Acompanhamento diário de visitas, posição na busca e exposição por anúncio.
                      </p>
                    </div>
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-black/35"
                      disabled={
                        supabaseStatus !== "connected" ||
                        !mercadoLivreAccount ||
                        isSyncingMarketplace
                      }
                      onClick={syncMercadoLivreAdAnalysis}
                      type="button"
                    >
                      <RefreshCw aria-hidden className="h-4 w-4" />
                      {isSyncingAdAnalysis ? "Verificando" : "Verificar agora"}
                    </button>
                  </div>

                  {adAnalysisSyncSummary && (
                    <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-sea ring-1 ring-emerald-100">
                      Última análise: {formatNumber.format(adAnalysisSyncSummary.analytics)} anúncios,
                      {" "}
                      {formatNumber.format(adAnalysisSyncSummary.alerts)} alertas em{" "}
                      {new Date(`${adAnalysisSyncSummary.capturedDate}T00:00:00`).toLocaleDateString("pt-BR")}.
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-semibold">
                      Link ou ID do anúncio
                      <input
                        className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) => setAdAnalysisTarget(event.target.value)}
                        placeholder="Cole o link, MLB..., MLBU... ou SKU"
                        value={adAnalysisTarget}
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      Filtrar análises salvas
                      <span className="relative">
                        <Search
                          aria-hidden
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                        />
                        <input
                          className="h-10 w-full rounded-lg border border-black/10 bg-paper pl-9 pr-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) => setAdAnalysisSearch(event.target.value)}
                          placeholder="Buscar SKU, título, MLB ou categoria"
                          value={adAnalysisSearch}
                        />
                      </span>
                    </label>
                  </div>

                  <div className="table-scroll mt-4 overflow-x-auto">
                    <table className="min-w-[980px] w-full text-left text-sm">
                      <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                        <tr>
                          <th className="px-4 py-3">Anúncio</th>
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Visitas</th>
                          <th className="px-4 py-3">Variação</th>
                          <th className="px-4 py-3">Posição</th>
                          <th className="px-4 py-3">Concorrentes</th>
                          <th className="px-4 py-3">Vendidos ML</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/10">
                        {filteredListingAnalytics.map((row) => (
                          <tr className="hover:bg-black/[0.018]" key={row.id}>
                            <td className="px-4 py-3">
                              <p className="font-bold text-ink">{row.title}</p>
                              <p className="mt-1 text-xs font-semibold text-black/45">
                                {row.sku} | {row.externalItemId}
                              </p>
                              {row.categoryName && (
                                <p className="mt-1 text-xs text-black/45">
                                  {row.categoryName}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {new Date(`${row.capturedDate}T00:00:00`).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-3 font-bold">
                              {formatNumber.format(row.visits)}
                              <p className="text-xs font-normal text-black/45">
                                antes {formatNumber.format(row.previousVisits)}
                              </p>
                            </td>
                            <td
                              className={`px-4 py-3 font-bold ${
                                (row.visitChangeRate ?? 0) >= 0
                                  ? "text-sea"
                                  : "text-berry"
                              }`}
                            >
                              {row.visitChangeRate === null
                                ? "-"
                                : formatPercent(row.visitChangeRate)}
                            </td>
                            <td className="px-4 py-3 font-bold">
                              {row.listingPosition
                                ? `#${formatNumber.format(row.listingPosition)}`
                                : "Fora do top 50"}
                              {row.previousPosition && (
                                <p className="text-xs font-normal text-black/45">
                                  antes #{formatNumber.format(row.previousPosition)}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {formatNumber.format(row.competitorCount)}
                            </td>
                            <td className="px-4 py-3">
                              {formatNumber.format(row.estimatedSoldQuantity)}
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded-lg bg-paper px-2 py-1 text-xs font-bold ring-1 ring-black/10">
                                {row.status ?? "Sem status"}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {filteredListingAnalytics.length === 0 && (
                          <tr>
                            <td
                              className="px-4 py-8 text-center text-black/55"
                              colSpan={8}
                            >
                              Nenhum anúncio analisado ainda.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <AlertTriangle aria-hidden className="h-5 w-5 text-berry" />
                    <h2 className="text-lg font-bold">Alertas de exposição</h2>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {listingAlerts.map((alert) => (
                      <div
                        className={`rounded-lg p-3 ring-1 ${aiSeverityClass(
                          alert.severity
                        )}`}
                        key={alert.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{alert.message}</p>
                            <p className="mt-1 text-xs font-semibold opacity-80">
                              {alert.sku} | {new Date(`${alert.alertDate}T00:00:00`).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                          <span className="rounded-lg bg-white/65 px-2 py-1 text-xs font-bold">
                            {aiSeverityLabel(alert.severity)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {listingAlerts.length === 0 && (
                      <div className="rounded-lg border border-black/10 bg-paper p-4 text-sm text-black/60">
                        Nenhum alerta gerado. Faça a primeira verificação para iniciar o histórico.
                      </div>
                    )}
                  </div>
                </section>
              </section>

              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Busca de novos produtos</h2>
                    <p className="text-sm text-black/60">
                      Pesquise categorias do Mercado Livre e acompanhe concorrência, preço e evolução de vendas.
                    </p>
                  </div>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sea px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-black/35"
                    disabled={
                      supabaseStatus !== "connected" ||
                      !mercadoLivreAccount ||
                      isSearchingOpportunities
                    }
                    onClick={searchMercadoLivreProductOpportunities}
                    type="button"
                  >
                    <Search aria-hidden className="h-4 w-4" />
                    {isSearchingOpportunities ? "Buscando" : "Buscar oportunidades"}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold">
                    Categoria Mercado Livre
                    <input
                      className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(event) =>
                        setOpportunityForm((current) => ({
                          ...current,
                          categoryId: event.target.value
                        }))
                      }
                      placeholder="Ex.: MLB1743"
                      value={opportunityForm.categoryId}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    Produto ou termo
                    <input
                      className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(event) =>
                        setOpportunityForm((current) => ({
                          ...current,
                          query: event.target.value
                        }))
                      }
                      placeholder="Ex.: cabide madeira ou link MLBU/MLB"
                      value={opportunityForm.query}
                    />
                  </label>
                </div>

                <div className="table-scroll mt-4 overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3">Preço</th>
                        <th className="px-4 py-3">Vendas ML</th>
                        <th className="px-4 py-3">Venda diária estimada</th>
                        <th className="px-4 py-3">Concorrentes</th>
                        <th className="px-4 py-3">Posição</th>
                        <th className="px-4 py-3">Vendedor</th>
                        <th className="px-4 py-3">Categoria</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {filteredProductOpportunities.map((row) => (
                        <tr className="hover:bg-black/[0.018]" key={row.id}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {row.thumbnail && (
                                <div
                                  aria-hidden
                                  className="h-12 w-12 rounded-lg bg-cover bg-center ring-1 ring-black/10"
                                  style={{
                                    backgroundImage: `url(${row.thumbnail})`
                                  }}
                                />
                              )}
                              <div>
                                <p className="font-bold text-ink">{row.title}</p>
                                <p className="mt-1 text-xs text-black/45">
                                  {row.externalItemId}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold">
                            {formatCurrency.format(row.priceAmount)}
                          </td>
                          <td className="px-4 py-3">
                            {formatNumber.format(row.soldQuantity)}
                          </td>
                          <td className="px-4 py-3 font-bold text-sea">
                            {formatNumber.format(row.estimatedDailySales)}
                          </td>
                          <td className="px-4 py-3">
                            {formatNumber.format(row.competitorCount)}
                          </td>
                          <td className="px-4 py-3">
                            {row.listingPosition
                              ? `#${formatNumber.format(row.listingPosition)}`
                              : "-"}
                          </td>
                          <td className="px-4 py-3">
                            {row.sellerName ?? row.sellerId ?? "-"}
                          </td>
                          <td className="px-4 py-3">
                            {row.categoryName ?? row.categoryId}
                          </td>
                        </tr>
                      ))}
                      {filteredProductOpportunities.length === 0 && (
                        <tr>
                          <td
                            className="px-4 py-8 text-center text-black/55"
                            colSpan={8}
                          >
                            Nenhuma oportunidade pesquisada ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── Funil de Visitas → Conversão ── */}
              {conversionFunnel.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <LineChart aria-hidden className="h-4 w-4 text-sea" />
                      <p className="text-sm font-bold text-slate-900">Funil de Visitas → Conversão</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Visitas capturadas pelo ML × vendas reais do sistema × estimativa do ML — por anúncio.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Anúncios</p>
                        <p className="mt-0.5 text-xl font-extrabold text-slate-900">{formatNumber.format(conversionFunnel.length)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total visitas</p>
                        <p className="mt-0.5 text-xl font-extrabold text-slate-900">
                          {formatNumber.format(conversionFunnel.reduce((s, r) => s + r.visits, 0))}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Conversão real</p>
                        <p className="mt-0.5 text-xl font-extrabold text-sea">
                          {formatPercent(
                            (() => {
                              const totalVisits = conversionFunnel.reduce((s, r) => s + r.visits, 0);
                              const totalSold = conversionFunnel.reduce((s, r) => s + r.realSold, 0);
                              return totalVisits > 0 ? totalSold / totalVisits : 0;
                            })()
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Conversão ML (est.)</p>
                        <p className="mt-0.5 text-xl font-extrabold text-black/60">
                          {formatPercent(
                            (() => {
                              const totalVisits = conversionFunnel.reduce((s, r) => s + r.visits, 0);
                              const totalEst = conversionFunnel.reduce((s, r) => s + r.estimatedSold, 0);
                              return totalVisits > 0 ? totalEst / totalVisits : 0;
                            })()
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Anúncio / SKU</th>
                          <th className="px-4 py-3 text-right">Visitas</th>
                          <th className="px-4 py-3 text-right">Vendas reais</th>
                          <th className="px-4 py-3 text-right">Estimativa ML</th>
                          <th className="px-4 py-3 text-right">Conv. real</th>
                          <th className="px-4 py-3 text-right">Conv. est. ML</th>
                          <th className="px-4 py-3 text-right">Dif. conv.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {conversionFunnel.map((item) => {
                          const convDiff = item.realConversionRate - item.estimatedConversionRate;
                          return (
                            <tr className="hover:bg-slate-50/60" key={item.externalItemId}>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-800 leading-tight">{item.title}</p>
                                <p className="mt-0.5 text-xs text-slate-400">
                                  {item.sku}{item.sku !== item.externalItemId ? ` · ${item.externalItemId}` : ""}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-700">
                                {formatNumber.format(item.visits)}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-sea">
                                {formatNumber.format(item.realSold)}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-500">
                                {formatNumber.format(item.estimatedSold)}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-sea">
                                {item.visits > 0 ? formatPercent(item.realConversionRate) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-500">
                                {item.visits > 0 ? formatPercent(item.estimatedConversionRate) : "—"}
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold ${
                                Math.abs(convDiff) < 0.0005
                                  ? "text-slate-400"
                                  : convDiff > 0
                                    ? "text-emerald-600"
                                    : "text-rose-600"
                              }`}>
                                {Math.abs(convDiff) < 0.0005 ? "—" : (convDiff > 0 ? "+" : "") + formatPercent(convDiff)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </section>
          )}

          {activeView === "ads" && (
            <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-black/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Publicidade por SKU</h2>
                    <p className="text-sm text-black/60">
                      {realAdvertising.length > 0
                        ? "Metricas reais de Product Ads em uso na margem."
                        : "Investimento e receita atribuida entram na mesma conta de margem."}
                    </p>
                  </div>
                  {mercadoLivreAccount && (
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black"
                      disabled={
                        supabaseStatus !== "connected" || isSyncingMarketplace
                      }
                      onClick={syncMercadoLivreAdvertising}
                      type="button"
                    >
                      <Megaphone aria-hidden className="h-4 w-4" />
                      {isSyncingAdvertising ? "Sincronizando" : "Sincronizar Ads"}
                    </button>
                  )}
                </div>
                <div className="table-scroll overflow-x-auto">
                  <table className="min-w-[820px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Investimento</th>
                        <th className="px-4 py-3">Cliques</th>
                        <th className="px-4 py-3">Impressões</th>
                        <th className="px-4 py-3">Receita atribuida</th>
                        <th className="px-4 py-3">ACOS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {activeAdvertising.map((row) => (
                        <tr key={row.sku}>
                          <td className="px-4 py-3 font-bold">{row.sku}</td>
                          <td className="px-4 py-3">
                            {formatCurrency.format(row.amount)}
                          </td>
                          <td className="px-4 py-3">{formatNumber.format(row.clicks)}</td>
                          <td className="px-4 py-3">
                            {formatNumber.format(row.impressions)}
                          </td>
                          <td className="px-4 py-3">
                            {formatCurrency.format(row.attributedRevenue)}
                          </td>
                          <td className="px-4 py-3 font-bold">
                            {row.attributedRevenue > 0
                              ? formatPercent(row.amount / row.attributedRevenue)
                              : "0,0%"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Tags aria-hidden className="h-5 w-5 text-clay" />
                    <h2 className="text-lg font-bold">Promoções ativas</h2>
                  </div>
                  {mercadoLivreAccount && (
                    <button
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-clay px-3 text-sm font-bold text-white hover:bg-amber-700"
                      disabled={
                        supabaseStatus !== "connected" || isSyncingMarketplace
                      }
                      onClick={syncMercadoLivrePromotions}
                      type="button"
                    >
                      <Tags aria-hidden className="h-4 w-4" />
                      {isSyncingPromotions ? "Atualizando" : "Atualizar"}
                    </button>
                  )}
                </div>
                <div className="mt-4 grid gap-3">
                  {displayPromotionRows.map((row) => (
                    <div
                      className="rounded-lg border border-black/10 bg-paper p-3"
                      key={`${row.sku}-${row.name}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{row.name}</p>
                          <p className="text-sm text-black/60">{row.sku}</p>
                        </div>
                        <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-clay ring-1 ring-amber-100">
                          {row.discount}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span>{row.period}</span>
                        <span className="font-semibold text-black/60">{row.impact}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          )}

          {activeView === "ads_gestao" && organization && supabaseClient && (
            <section className="mt-5">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-slate-900">Gestão de ADS por Fase</h2>
                <p className="text-sm text-slate-500">
                  Classifique seus produtos anunciados por fase de maturidade e receba recomendações de ação.
                </p>
              </div>
              <AdsGestaoView
                organization={organization}
                supabaseClient={supabaseClient}
                activeSales={activeSales}
                realAdvertising={activeAdvertising}
              />
            </section>
          )}

          <footer className="mt-6 flex flex-col gap-2 pb-4 text-sm text-black/50 sm:flex-row sm:items-center sm:justify-between">
            <span>Dados demonstrativos enquanto o Supabase e Mercado Livre sao conectados.</span>
            <span className="inline-flex items-center gap-2">
              <LineChart aria-hidden className="h-4 w-4" />
              Preparado para historico e conciliacao por periodo
            </span>
          </footer>
        </section>
      </main>
    </div>
  );
}

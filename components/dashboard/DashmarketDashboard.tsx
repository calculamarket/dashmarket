"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Boxes,
  Cable,
  CircleDollarSign,
  ClipboardList,
  LineChart,
  LogOut,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  PackageCheck,
  PackagePlus,
  Pencil,
  Percent,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  WalletCards
} from "lucide-react";
import {
  calculateContributionMargins,
  type AdvertisingSpend,
  type ContributionMarginRow,
  type SaleRecord,
  type SkuCost
} from "@/lib/metrics/contribution-margin";
import { getMarketplaceAdapter, listMarketplaceAdapters } from "@/lib/marketplaces/registry";
import type { MarketplaceProvider } from "@/lib/marketplaces/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type ViewKey =
  | "margem"
  | "produtos"
  | "vendas"
  | "custos"
  | "estoque"
  | "ads"
  | "financeiro_empresa"
  | "financeiro_pessoal";
type SupabaseStatus = "checking" | "demo" | "connected" | "error";
type FinanceEntryType = "income" | "expense";
type FinanceEntryStatus = "pending" | "paid" | "overdue";
type PersonalFinanceTab = "movements" | "loans";
type LoanDirection = "lent" | "borrowed";
type LoanStatus = "active" | "settled" | "late";

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
  promotionCredit: number;
  totalCosts: number;
  netProfit: number;
  profitMargin: number;
};

type CalculatorCostEntry = {
  label: string;
  category: SkuCost["category"];
  allocation: SkuCost["allocation"];
  amount: number;
};

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

type AdvertisingMetricRow = {
  impressions: number | string;
  clicks: number | string;
  ad_spend_amount: number | string;
  attributed_revenue_amount: number | string;
  attributed_orders: number | string;
  products: ProductRow | ProductRow[] | null;
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

const costCategoryLabel: Record<SkuCost["category"], string> = {
  product: "Produto",
  packaging: "Embalagem",
  inbound_freight: "Frete entrada",
  tax: "Tributo",
  marketplace_fixed: "Taxa fixa",
  other: "Outro"
};

const allocationLabel: Record<SkuCost["allocation"], string> = {
  per_unit: "Por unidade",
  percentage: "Percentual",
  per_order: "Por pedido"
};

const financeTypeLabel: Record<FinanceEntryType, string> = {
  income: "Receita",
  expense: "Despesa"
};

const financeStatusLabel: Record<FinanceEntryStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido"
};

const loanDirectionLabel: Record<LoanDirection, string> = {
  lent: "Emprestei",
  borrowed: "Peguei"
};

const loanStatusLabel: Record<LoanStatus, string> = {
  active: "Em aberto",
  settled: "Quitado",
  late: "Atrasado"
};

const views: Array<{ key: ViewKey; label: string; icon: typeof BarChart3 }> = [
  { key: "margem", label: "Margem", icon: BarChart3 },
  { key: "produtos", label: "Produtos", icon: PackageCheck },
  { key: "vendas", label: "Vendas", icon: ClipboardList },
  { key: "financeiro_empresa", label: "Financeiro Empresa", icon: CircleDollarSign },
  { key: "financeiro_pessoal", label: "Financeiro Pessoal", icon: WalletCards },
  { key: "custos", label: "Centro de custos", icon: WalletCards },
  { key: "estoque", label: "Estoque Full", icon: Boxes },
  { key: "ads", label: "Publicidade", icon: Megaphone }
];

const SALES_DETAIL_LIMIT = 10000;

const formatCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const formatNumber = new Intl.NumberFormat("pt-BR");

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

function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "sea"
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof BarChart3;
  tone?: "sea" | "moss" | "clay" | "berry";
}) {
  const toneClass = {
    sea: "bg-teal-50 text-sea ring-teal-100",
    moss: "bg-lime-50 text-moss ring-lime-100",
    clay: "bg-amber-50 text-clay ring-amber-100",
    berry: "bg-rose-50 text-berry ring-rose-100"
  }[tone];

  return (
    <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-black/50">
            {title}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-normal text-ink">{value}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-lg ring-1 ${toneClass}`}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-sm text-black/60">{detail}</p>
    </section>
  );
}

function ModuleButton({
  view,
  activeView,
  onClick
}: {
  view: (typeof views)[number];
  activeView: ViewKey;
  onClick: (view: ViewKey) => void;
}) {
  const Icon = view.icon;

  return (
    <button
      className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ring-1 transition ${
        activeView === view.key
          ? "bg-ink text-white ring-ink"
          : "bg-white text-ink ring-black/10 hover:bg-black/[0.03]"
      }`}
      onClick={() => onClick(view.key)}
      type="button"
    >
      <Icon aria-hidden className="h-4 w-4" />
      <span>{view.label}</span>
    </button>
  );
}

function marginTone(row: ContributionMarginRow) {
  if (row.contributionMarginRate < 0.12) return "text-berry";
  if (row.contributionMarginRate < 0.22) return "text-clay";
  return "text-sea";
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

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message?.toLowerCase() ?? "";

  return maybeError.code === "42P01" || message.includes("does not exist");
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

function dateOnly(value: Date) {
  const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return dateOnly(value);
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
  const promotionCredit = numberFromInput(form.promotionCredit);
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
    const variablePercentage =
      desiredProfitMargin +
      commissionPercentage +
      taxPercentage +
      adTacosPercentage;

    if (desiredProfitMargin <= 0 || variablePercentage >= 100) return null;
    sellingPrice = fixedCosts / (1 - variablePercentage / 100);
  }

  if (mode === "fixedProfit") {
    const desiredFixedProfit = numberFromInput(form.desiredFixedProfit);
    const variablePercentage =
      commissionPercentage + taxPercentage + adTacosPercentage;

    if (desiredFixedProfit <= 0 || variablePercentage >= 100) return null;
    sellingPrice = (fixedCosts + desiredFixedProfit) / (1 - variablePercentage / 100);
  }

  if (sellingPrice <= 0) return null;

  const commission = sellingPrice * (commissionPercentage / 100);
  const taxes = sellingPrice * (taxPercentage / 100);
  const advertisingInvestment = sellingPrice * (adTacosPercentage / 100);
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
    taxes;
  const netProfit = sellingPrice - totalCosts + promotionCredit;
  const profitMargin = sellingPrice > 0 ? netProfit / sellingPrice : 0;

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
    promotionCredit,
    totalCosts,
    netProfit,
    profitMargin
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
  const [activeView, setActiveView] = useState<ViewKey>("margem");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [skuFilter, setSkuFilter] = useState("");
  const [costs, setCosts] = useState<SkuCost[]>(costsSeed);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
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
  const [realPromotions, setRealPromotions] = useState<PromotionDisplayRow[]>([]);
  const [companyFinanceEntries, setCompanyFinanceEntries] =
    useState<FinanceEntry[]>(companyFinanceSeed);
  const [personalFinanceEntries, setPersonalFinanceEntries] =
    useState<FinanceEntry[]>(personalFinanceSeed);
  const [personalLoans, setPersonalLoans] =
    useState<LoanEntry[]>(personalLoanSeed);
  const [marketplaceAccounts, setMarketplaceAccounts] = useState<
    MarketplaceAccountRow[]
  >([]);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [isSavingCost, setIsSavingCost] = useState(false);
  const [isConnectingMarketplace, setIsConnectingMarketplace] = useState(false);
  const [isSyncingListings, setIsSyncingListings] = useState(false);
  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [isSyncingInventory, setIsSyncingInventory] = useState(false);
  const [isSyncingAdvertising, setIsSyncingAdvertising] = useState(false);
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
  const [promotionsSyncSummary, setPromotionsSyncSummary] =
    useState<SyncPromotionsSummary | null>(null);
  const [costForm, setCostForm] = useState({
    sku: salesSeed[0].sku,
    label: "",
    category: "product" as SkuCost["category"],
    amount: "",
    allocation: "per_unit" as SkuCost["allocation"],
    taxPercent: "",
    validFrom: "2026-05-01"
  });
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [calculatorMode, setCalculatorMode] =
    useState<CostCalculatorMode>("margin");
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
    promotionCredit: "",
    desiredProfitMargin: "15",
    desiredFixedProfit: "",
    validFrom: dateOnly(new Date())
  });
  const [costProductSearch, setCostProductSearch] = useState("");
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
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSavingCalculatorCosts, setIsSavingCalculatorCosts] = useState(false);
  const [salesFilters, setSalesFilters] = useState({
    dateFrom: daysAgo(30),
    dateTo: dateOnly(new Date()),
    sku: ""
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

  const activeSales = realSales.length > 0 ? realSales : salesSeed;
  const activeAdvertising =
    realAdvertising.length > 0 ? realAdvertising : adSpendSeed;
  const displayInventoryRows =
    realInventory.length > 0 ? realInventory : inventoryRows;
  const displayPromotionRows =
    realPromotions.length > 0 ? realPromotions : promotionRows;
  const productOptions = useMemo(
    () => {
      const options =
        realProducts.length > 0
          ? realProducts.map((product) => ({
              sku: product.internal_sku,
              title: product.title
            }))
          : activeSales.map((sale) => ({ sku: sale.sku, title: sale.title }));

      return options.filter((product) => !hiddenSkus.includes(product.sku));
    },
    [activeSales, hiddenSkus, realProducts]
  );

  useEffect(() => {
    const savedPreference = window.localStorage.getItem(
      "dashmarket:sidebar-collapsed"
    );

    if (savedPreference === "true") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "dashmarket:sidebar-collapsed",
      String(isSidebarCollapsed)
    );
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (productOptions.length === 0) return;

    setCostForm((current) =>
      productOptions.some((product) => product.sku === current.sku)
        ? current
        : { ...current, sku: productOptions[0].sku }
    );
    setCalculatorForm((current) => {
      if (productOptions.some((product) => product.sku === current.sku)) {
        return current;
      }

      return {
        ...current,
        sku: productOptions[0].sku,
        name: productOptions[0].title
      };
    });
  }, [productOptions]);

  const selectedAdapter = getMarketplaceAdapter(selectedProvider);
  const mercadoLivreAccount = marketplaceAccounts.find(
    (account) => account.provider === "mercadolivre" && account.status === "connected"
  );
  const isSyncingMarketplace =
    isSyncingListings ||
    isSyncingOrders ||
    isSyncingInventory ||
    isSyncingAdvertising ||
    isSyncingPromotions;
  const isMarketplaceActionDisabled =
    selectedProvider !== "mercadolivre" ||
    supabaseStatus !== "connected" ||
    isSyncingMarketplace;
  const isMarketplaceConnectDisabled =
    isMarketplaceActionDisabled || isConnectingMarketplace;
  const marketplaceSkuActionLabel = isConnectingMarketplace
    ? "Conectando"
    : isSyncingListings
      ? "Sincronizando"
      : mercadoLivreAccount
        ? "Sincronizar SKUs"
        : "Conectar Mercado Livre";
  const marginRows = useMemo(
    () => calculateContributionMargins(activeSales, costs, activeAdvertising),
    [activeAdvertising, activeSales, costs]
  );
  const salesDetailSources = useMemo(
    () =>
      realSaleDetails.length > 0
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
    [realSaleDetails]
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
  const filteredSalesDetailRows = useMemo(() => {
    const query = salesFilters.sku.trim().toLowerCase();

    return salesDetailRows.filter((sale) => {
      const soldDate = sale.soldAt.slice(0, 10);
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
  }, [salesDetailRows, salesFilters]);
  const salesDetailTotals = useMemo(
    () =>
      filteredSalesDetailRows.reduce(
        (totals, sale) => ({
          grossAmount: totals.grossAmount + sale.grossAmount,
          costAmount: totals.costAmount + sale.costAmount,
          taxAmount: totals.taxAmount + sale.taxAmount,
          marketplaceFee: totals.marketplaceFee + sale.marketplaceFee,
          shippingBuyer: totals.shippingBuyer + sale.shippingBuyer,
          shippingSeller: totals.shippingSeller + sale.shippingSeller,
          contributionMargin:
            totals.contributionMargin + sale.contributionMargin,
          quantity: totals.quantity + sale.quantity,
          orders: totals.orders + 1
        }),
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

  const filteredMargins = marginRows.filter((row) => {
    const query = skuFilter.trim().toLowerCase();
    return (
      !query ||
      row.sku.toLowerCase().includes(query) ||
      row.title.toLowerCase().includes(query)
    );
  });

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
      productOptions
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
          const otherCostUnit = sumCosts((cost) => cost.category === "other");
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
            advertisingUnit;
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
    [activeAdvertising, activeSales, costs, productOptions]
  );

  const filteredProductUnitRows = useMemo(() => {
    const query = skuFilter.trim().toLowerCase();

    return productUnitRows.filter(
      (product) =>
        !query ||
        product.sku.toLowerCase().includes(query) ||
        product.title.toLowerCase().includes(query)
    );
  }, [productUnitRows, skuFilter]);

  const productUnitTotals = useMemo(
    () =>
      productUnitRows.reduce(
        (totals, product) => ({
          products: totals.products + 1,
          productsWithSales: totals.productsWithSales + (product.hasSales ? 1 : 0),
          units: totals.units + product.units,
          grossRevenue: totals.grossRevenue + product.grossRevenue,
          advertisingAmount: totals.advertisingAmount + product.advertisingAmount,
          attributedRevenue:
            totals.attributedRevenue + product.attributedRevenue,
          totalCosts: totals.totalCosts + product.totalCostUnit * product.units,
          contributionMargin:
            totals.contributionMargin +
            product.contributionMarginUnit * product.units
        }),
        {
          products: 0,
          productsWithSales: 0,
          units: 0,
          grossRevenue: 0,
          advertisingAmount: 0,
          attributedRevenue: 0,
          totalCosts: 0,
          contributionMargin: 0
        }
      ),
    [productUnitRows]
  );

  const costCenterProductRows = useMemo<CostCenterProductRow[]>(
    () =>
      productOptions
        .map((product) => {
          const sale = activeSales.find((record) => record.sku === product.sku);
          const margin = marginRows.find((row) => row.sku === product.sku);
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
                cost.allocation === "per_unit"
            )
            .reduce((total, cost) => total + cost.amount, 0);
          const taxPercentage = productCosts
            .filter(
              (cost) => cost.category === "tax" && cost.allocation === "percentage"
            )
            .reduce((total, cost) => total + cost.amount, 0);
          const units = sale?.units ?? 0;
          const grossRevenue = sale?.grossRevenue ?? 0;

          return {
            sku: product.sku,
            title: product.title,
            units,
            orders: sale?.orders ?? 0,
            grossRevenue,
            averagePrice: units > 0 ? grossRevenue / units : 0,
            productCost,
            packagingCost,
            operationalCost,
            taxPercentage,
            contributionMargin: margin?.contributionMargin ?? 0,
            contributionMarginRate: margin?.contributionMarginRate ?? 0
          };
        })
        .sort((current, next) => next.grossRevenue - current.grossRevenue),
    [activeSales, costs, marginRows, productOptions]
  );

  const filteredCostCenterProductRows = useMemo(() => {
    const query = costProductSearch.trim().toLowerCase();

    return costCenterProductRows.filter(
      (product) =>
        !query ||
        product.sku.toLowerCase().includes(query) ||
        product.title.toLowerCase().includes(query)
    );
  }, [costCenterProductRows, costProductSearch]);

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
    setRealProducts(products);

    const { data: costsData, error: costsError } = await supabaseClient
      .from("sku_costs")
      .select(
        "id, cost_name, cost_category, allocation_method, amount, valid_from, valid_to, products(id, internal_sku, title, status)"
      )
      .eq("organization_id", organizationId)
      .order("valid_from", { ascending: false });

    if (costsError) throw costsError;

    const mappedCosts = ((costsData ?? []) as CostCenterRow[])
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
      .limit(SALES_DETAIL_LIMIT);

    if (error) throw error;

    const salesBySku = new Map<string, SaleRecord>();
    const detailRows: SalesDetailSourceRow[] = [];

    for (const row of (data ?? []) as OrderItemRow[]) {
      const sku = row.seller_sku ?? "SKU sem codigo";
      const order = getRelatedOrder(row);
      const grossAmount = numberFromDb(row.gross_amount);
      const orderGrossAmount = numberFromDb(order?.gross_amount);
      const orderTaxAmount = numberFromDb(order?.taxes_amount);
      const shippingAmounts = getOrderItemShippingAmounts(row);
      const allocatedTaxAmount =
        orderGrossAmount > 0 ? orderTaxAmount * (grossAmount / orderGrossAmount) : 0;
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
      current.grossRevenue += grossAmount;
      current.marketplaceFees += numberFromDb(row.marketplace_fee_amount);
      current.shippingCosts += shippingAmounts.seller;
      current.discounts += numberFromDb(row.discount_amount);
      current.taxes += allocatedTaxAmount;
      salesBySku.set(sku, current);

      detailRows.push({
        id: row.id ?? `${order?.provider_order_id ?? "order"}-${sku}`,
        orderId: order?.provider_order_id ?? "Pedido sem codigo",
        externalItemId: row.external_item_id ?? sku,
        title: row.title,
        sku,
        soldAt: order?.sold_at ?? new Date().toISOString(),
        status: order?.status ?? "paid",
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
      .order("captured_at", { ascending: false })
      .limit(2000);

    if (error) throw error;

    const latestBySkuAndChannel = new Map<string, InventoryDisplayRow>();

    for (const row of (data ?? []) as InventorySnapshotRow[]) {
      const sku = row.seller_sku ?? "SKU sem codigo";
      const channel = row.fulfillment_channel;
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
      if (isMissingRelationError(error)) {
        setCompanyFinanceEntries(companyFinanceSeed);
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
      if (isMissingRelationError(error)) {
        setPersonalFinanceEntries(personalFinanceSeed);
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
      if (isMissingRelationError(error)) {
        setPersonalLoans(personalLoanSeed);
        return;
      }

      throw error;
    }

    setPersonalLoans(((data ?? []) as LoanEntryDbRow[]).map(mapLoanEntryRow));
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

    if (error) throw error;

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
        setRealPromotions([]);
        setCompanyFinanceEntries(companyFinanceSeed);
        setPersonalFinanceEntries(personalFinanceSeed);
        setPersonalLoans(personalLoanSeed);
        setCosts(costsSeed);
        setHiddenSkus([]);
        return;
      }

      try {
        const { data: sessionData, error: sessionError } =
          await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          if (!isMounted) return;
          setSupabaseStatus("demo");
          setUserId(null);
          setUserEmail(null);
          setOrganization(null);
          setRealProducts([]);
          setRealSales([]);
          setRealSaleDetails([]);
          setRealInventory([]);
          setRealAdvertising([]);
          setRealPromotions([]);
          setCompanyFinanceEntries(companyFinanceSeed);
          setPersonalFinanceEntries(personalFinanceSeed);
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

        const currentOrganization =
          ((organizationsData ?? [])[0] as Organization | undefined) ?? null;

        if (!isMounted) return;

        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
        setOrganization(currentOrganization);
        setSupabaseStatus("connected");

        if (currentOrganization) {
          await loadCostCenter(currentOrganization.id);
          await loadSales(currentOrganization.id);
          await loadInventory(currentOrganization.id);
          await loadAdvertising(currentOrganization.id);
          await loadPromotions(currentOrganization.id);
          await loadCompanyFinance(currentOrganization.id);
          await loadPersonalFinance(session.user.id);
          await loadPersonalLoans(session.user.id);
          await loadMarketplaceAccounts(currentOrganization.id);
        } else {
          setCosts([]);
          setRealSales([]);
          setRealSaleDetails([]);
          setRealInventory([]);
          setRealAdvertising([]);
          setRealPromotions([]);
          setCompanyFinanceEntries([]);
          setPersonalFinanceEntries(personalFinanceSeed);
          setPersonalLoans(personalLoanSeed);
          setMarketplaceAccounts([]);
          setDataMessage("Usuario autenticado, mas sem empresa vinculada.");
        }
      } catch (error) {
        if (!isMounted) return;
        setSupabaseStatus("error");
        setUserId(null);
        setRealSales([]);
        setRealSaleDetails([]);
        setRealInventory([]);
        setRealAdvertising([]);
        setRealPromotions([]);
        setCompanyFinanceEntries(companyFinanceSeed);
        setPersonalFinanceEntries(personalFinanceSeed);
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

    return () => {
      isMounted = false;
    };
  }, [
    loadCostCenter,
    loadAdvertising,
    loadCompanyFinance,
    loadInventory,
    loadMarketplaceAccounts,
    loadPersonalFinance,
    loadPersonalLoans,
    loadPromotions,
    loadSales,
    supabaseClient
  ]);

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
          isMissingRelationError(error)
            ? "Financeiro ainda nao existe no Supabase. Execute a migration de financeiro e tente novamente."
            : error instanceof Error
              ? error.message
              : "Nao foi possivel salvar o financeiro da empresa."
        );
      } finally {
        setIsSavingCompanyFinance(false);
      }

      return;
    }

    setCompanyFinanceEntries((current) =>
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
          isMissingRelationError(error)
            ? "Financeiro pessoal ainda nao existe no Supabase. Execute a migration de financeiro e tente novamente."
            : error instanceof Error
              ? error.message
              : "Nao foi possivel salvar o financeiro pessoal."
        );
      } finally {
        setIsSavingPersonalFinance(false);
      }

      return;
    }

    setPersonalFinanceEntries((current) =>
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
          isMissingRelationError(error)
            ? "A aba de emprestimos ainda nao existe no Supabase. Execute a migration de financeiro e tente novamente."
            : error instanceof Error
              ? error.message
              : "Nao foi possivel salvar o emprestimo."
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

    if (supabaseClient && organization) {
      setIsSavingCompanyFinance(true);

      try {
        const { error } = await supabaseClient
          .from("company_financial_entries")
          .delete()
          .eq("id", entry.id);

        if (error) throw error;
        await loadCompanyFinance(organization.id);
        setDataMessage("Lancamento da empresa excluido.");
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel excluir o lancamento da empresa."
        );
      } finally {
        setIsSavingCompanyFinance(false);
      }

      return;
    }

    setCompanyFinanceEntries((current) =>
      current.filter((item) => item.id !== entry.id)
    );
    setDataMessage("Lancamento da empresa removido em modo demonstracao.");
  }

  async function deletePersonalFinanceEntry(entry: FinanceEntry) {
    if (!window.confirm(`Excluir o lancamento "${entry.title}"?`)) return;

    if (supabaseClient && userId) {
      setIsSavingPersonalFinance(true);

      try {
        const { error } = await supabaseClient
          .from("personal_financial_entries")
          .delete()
          .eq("id", entry.id);

        if (error) throw error;
        await loadPersonalFinance(userId);
        setDataMessage("Lancamento pessoal excluido.");
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel excluir o lancamento pessoal."
        );
      } finally {
        setIsSavingPersonalFinance(false);
      }

      return;
    }

    setPersonalFinanceEntries((current) =>
      current.filter((item) => item.id !== entry.id)
    );
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
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel excluir o emprestimo."
        );
      } finally {
        setIsSavingLoan(false);
      }

      return;
    }

    setPersonalLoans((current) => current.filter((item) => item.id !== loan.id));
    setDataMessage("Emprestimo removido em modo demonstracao.");
  }

  function resetCostFormFields() {
    setCostForm((current) => ({
      ...current,
      label: "",
      amount: "",
      taxPercent: ""
    }));
    setEditingCostId(null);
  }

  async function ensureProductForSku(sku: string, title: string) {
    if (!supabaseClient || !organization) {
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
        .eq("organization_id", organization.id)
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
        organization_id: organization.id,
        internal_sku: sku,
        title: title || sku,
        status: "active"
      })
      .select("id, internal_sku, title, status")
      .single();

    if (productError) throw productError;
    return insertedProduct as ProductRow;
  }

  async function addCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const costLabel =
      costForm.label.trim() ||
      (costForm.category === "tax" && costForm.allocation === "percentage"
        ? "Imposto"
        : "");

    if (!costLabel || !costForm.amount) return;

    if (supabaseClient && organization) {
      setIsSavingCost(true);
      setDataMessage(null);

      try {
        const saleProduct = activeSales.find((sale) => sale.sku === costForm.sku);
        const product = await ensureProductForSku(
          costForm.sku,
          saleProduct?.title ?? costForm.sku
        );
        const costPayload = {
          organization_id: organization.id,
          product_id: product.id,
          cost_name: costLabel,
          cost_category: costForm.category,
          allocation_method: costForm.allocation,
          amount: Number(costForm.amount),
          valid_from: costForm.validFrom
        };
        const { error: costError } = editingCostId
          ? await supabaseClient
              .from("sku_costs")
              .update(costPayload)
              .eq("id", editingCostId)
          : await supabaseClient.from("sku_costs").insert(costPayload);

        if (costError) throw costError;

        await loadCostCenter(organization.id);
        setHiddenSkus((current) =>
          current.filter((hiddenSku) => hiddenSku !== costForm.sku)
        );
        resetCostFormFields();
        setDataMessage(
          editingCostId
            ? "Custo atualizado no Supabase."
            : "Custo salvo no Supabase."
        );
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : editingCostId
              ? "Nao foi possivel atualizar o custo."
              : "Nao foi possivel salvar o custo."
        );
      } finally {
        setIsSavingCost(false);
      }

      return;
    }

    const localCost = {
      id:
        editingCostId ??
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `cost-${Date.now()}`),
      sku: costForm.sku,
      label: costLabel,
      category: costForm.category,
      amount: Number(costForm.amount),
      allocation: costForm.allocation,
      validFrom: costForm.validFrom
    };

    setCosts((current) =>
      editingCostId
        ? current.map((cost) => (cost.id === editingCostId ? localCost : cost))
        : [...current, localCost]
    );
    setHiddenSkus((current) =>
      current.filter((hiddenSku) => hiddenSku !== costForm.sku)
    );
    resetCostFormFields();
    setDataMessage(
      editingCostId ? "Custo atualizado." : "Custo adicionado em modo demonstracao."
    );
  }

  function startEditingCost(cost: SkuCost) {
    setEditingCostId(cost.id);
    setCostForm({
      sku: cost.sku,
      label: cost.label,
      category: cost.category,
      amount: String(cost.amount),
      allocation: cost.allocation,
      taxPercent:
        cost.category === "tax" && cost.allocation === "percentage"
          ? String(cost.amount)
          : "",
      validFrom: cost.validFrom
    });
    setDataMessage(`Editando custo ${cost.label} do SKU ${cost.sku}.`);
  }

  function cancelCostEditing() {
    resetCostFormFields();
    setDataMessage(null);
  }

  async function deleteCost(cost: SkuCost) {
    const confirmed = window.confirm(
      `Excluir o custo "${cost.label}" do SKU ${cost.sku}?`
    );

    if (!confirmed) return;

    if (supabaseClient && organization) {
      setIsSavingCost(true);
      setDataMessage(null);

      try {
        const { error } = await supabaseClient
          .from("sku_costs")
          .delete()
          .eq("id", cost.id);

        if (error) throw error;

        await loadCostCenter(organization.id);

        if (editingCostId === cost.id) {
          resetCostFormFields();
        }

        setDataMessage("Custo excluido do Centro de Custos.");
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel excluir o custo."
        );
      } finally {
        setIsSavingCost(false);
      }

      return;
    }

    setCosts((current) =>
      current.filter((currentCost) => currentCost.id !== cost.id)
    );

    if (editingCostId === cost.id) {
      resetCostFormFields();
    }

    setDataMessage("Custo removido em modo demonstracao.");
  }

  function selectProductForCalculator(product: CostCenterProductRow) {
    const productCosts = costs.filter((cost) => cost.sku === product.sku);
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
    const averageMarketplaceFeeRate =
      product.grossRevenue > 0
        ? (activeSales.find((sale) => sale.sku === product.sku)?.marketplaceFees ??
            0) / product.grossRevenue
        : 0;
    const productAdvertisingAmount = activeAdvertising
      .filter((record) => record.sku === product.sku)
      .reduce((total, record) => total + record.amount, 0);
    const adTacosPercentage =
      product.grossRevenue > 0
        ? (productAdvertisingAmount / product.grossRevenue) * 100
        : 0;

    setCostForm((current) => ({ ...current, sku: product.sku }));
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
      shippingCost:
        product.units > 0
          ? inputNumber(
              (activeSales.find((sale) => sale.sku === product.sku)
                ?.shippingCosts ?? 0) / product.units
            )
          : current.shippingCost,
      packagingCost: inputNumber(product.packagingCost),
      collectionCost: inputNumber(collectionCost),
      storageCost: inputNumber(storageCost),
      operationalCost: inputNumber(operationalCost),
      taxPercentage: inputNumber(product.taxPercentage),
      adTacosPercentage:
        adTacosPercentage > 0
          ? adTacosPercentage.toFixed(2)
          : current.adTacosPercentage
    }));
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
    setCostForm((current) => ({
      ...current,
      sku: current.sku === originalSku ? nextSku : current.sku
    }));
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

        if (editingProductSku === product.sku) {
          cancelProductEditing();
        }

        if (costForm.sku === product.sku || calculatorForm.sku === product.sku) {
          const nextProduct = productOptions.find(
            (option) => option.sku !== product.sku
          );

          if (nextProduct) {
            setCostForm((current) => ({ ...current, sku: nextProduct.sku }));
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

    if (editingProductSku === product.sku) {
      cancelProductEditing();
    }

    setDataMessage("SKU removido em modo demonstracao.");
  }

  async function saveCalculatorCosts() {
    const entries = buildCalculatorCostEntries(calculatorForm);

    if (!calculatorForm.sku || entries.length === 0) {
      setDataMessage("Preencha ao menos um custo interno para salvar no SKU.");
      return;
    }

    if (supabaseClient && organization) {
      setIsSavingCalculatorCosts(true);
      setDataMessage(null);

      try {
        const product = await ensureProductForSku(
          calculatorForm.sku,
          calculatorForm.name || calculatorForm.sku
        );

        const { error: costError } = await supabaseClient.from("sku_costs").insert(
          entries.map((entry) => ({
            organization_id: organization.id,
            product_id: product.id,
            cost_name: entry.label,
            cost_category: entry.category,
            allocation_method: entry.allocation,
            amount: entry.amount,
            valid_from: calculatorForm.validFrom
          }))
        );

        if (costError) throw costError;

        await loadCostCenter(organization.id);
        setHiddenSkus((current) =>
          current.filter((hiddenSku) => hiddenSku !== calculatorForm.sku)
        );
        setDataMessage(
          `Custos da calculadora aplicados ao SKU ${calculatorForm.sku}.`
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

    setCosts((current) => [
      ...current,
      ...entries.map((entry) => ({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `cost-${Date.now()}-${entry.label}`,
        sku: calculatorForm.sku,
        label: entry.label,
        category: entry.category,
        amount: entry.amount,
        allocation: entry.allocation,
        validFrom: calculatorForm.validFrom
      }))
    ]);
    setDataMessage(`Custos simulados aplicados ao SKU ${calculatorForm.sku}.`);
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    setSupabaseStatus("demo");
    setUserEmail(null);
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
    setEditingCostId(null);
    setEditingProductSku(null);
    setDataMessage("Sessao encerrada.");
  }

  async function connectMercadoLivre() {
    if (!organization) {
      setDataMessage("Entre no DASHMARKET antes de conectar o Mercado Livre.");
      return;
    }

    setIsConnectingMarketplace(true);
    setDataMessage(null);

    try {
      const response = await fetch(
        `/api/marketplaces/mercadolivre/auth-url?organizationId=${organization.id}&siteId=MLB`
      );
      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Nao foi possivel iniciar a conexao.");
      }

      window.location.href = payload.url;
    } catch (error) {
      setDataMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel conectar o Mercado Livre."
      );
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
          daysBack: daysBackFromDate(salesFilters.dateFrom)
        })
      });

      const payload = (await response.json()) as
        | SyncOrdersSummary
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Nao foi possivel sincronizar vendas."
        );
      }

      const summary = payload as SyncOrdersSummary;
      setOrdersSyncSummary(summary);
      setDataMessage(
        `Vendas sincronizadas: ${summary.syncedOrders} pedidos e ${summary.syncedItems} itens dos ultimos ${summary.daysBack} dias.`
      );
      await loadCostCenter(organization.id);
      await loadSales(organization.id);
      await loadMarketplaceAccounts(organization.id);
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
        `Estoque sincronizado: ${summary.snapshots} snapshots, ${summary.fullSnapshots} do Full.`
      );
      await loadCostCenter(organization.id);
      await loadInventory(organization.id);
      await loadMarketplaceAccounts(organization.id);
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

    setDataMessage(messages[status] ?? "Retorno do Mercado Livre recebido.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside
          className={`border-b border-black/10 bg-ink px-4 py-4 text-white transition-[width,padding] duration-200 lg:min-h-screen lg:shrink-0 lg:border-b-0 lg:border-r ${
            isSidebarCollapsed ? "lg:w-20 lg:px-3" : "lg:w-72 lg:px-4"
          }`}
        >
          <div
            className={`flex items-center justify-between gap-3 ${
              isSidebarCollapsed ? "lg:flex-col" : ""
            }`}
          >
            <div
              className={`flex items-center gap-3 ${
                isSidebarCollapsed ? "lg:justify-center" : ""
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-sm font-black text-ink">
                DM
              </span>
              <div className={isSidebarCollapsed ? "lg:hidden" : ""}>
                <p className="text-lg font-black tracking-normal">DASHMARKET</p>
                <p className="text-xs text-white/60">Marketplace intelligence</p>
              </div>
            </div>

            <div
              className={`flex items-center gap-2 ${
                isSidebarCollapsed ? "lg:flex-col" : ""
              }`}
            >
              <button
                aria-label={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
                aria-pressed={isSidebarCollapsed}
                className="hidden h-9 w-9 place-items-center rounded-lg bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 lg:grid"
                onClick={() => setIsSidebarCollapsed((current) => !current)}
                title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
                type="button"
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen aria-hidden className="h-4 w-4" />
                ) : (
                  <PanelLeftClose aria-hidden className="h-4 w-4" />
                )}
              </button>

              {supabaseStatus === "connected" ? (
                <button
                  aria-label="Sair"
                  className={`inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/20 ${
                    isSidebarCollapsed ? "lg:w-9 lg:justify-center lg:px-0" : ""
                  }`}
                  onClick={signOut}
                  title="Sair"
                  type="button"
                >
                  <LogOut aria-hidden className="h-4 w-4 shrink-0" />
                  <span className={isSidebarCollapsed ? "lg:hidden" : ""}>Sair</span>
                </button>
              ) : (
                <Link
                  aria-label="Entrar"
                  className={`inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/20 ${
                    isSidebarCollapsed ? "lg:w-9 lg:justify-center lg:px-0" : ""
                  }`}
                  href="/login"
                  title="Entrar"
                >
                  <ShieldCheck aria-hidden className="h-4 w-4 shrink-0" />
                  <span className={isSidebarCollapsed ? "lg:hidden" : ""}>
                    Entrar
                  </span>
                </Link>
              )}
            </div>
          </div>

          <nav
            className={`mt-5 grid grid-cols-2 gap-2 lg:grid-cols-1 ${
              isSidebarCollapsed ? "lg:justify-items-center" : ""
            }`}
          >
            {views.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  aria-label={view.label}
                  className={`flex h-10 items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold transition ${
                    activeView === view.key
                      ? "bg-white text-ink"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  } ${
                    isSidebarCollapsed
                      ? "lg:w-10 lg:justify-center lg:gap-0 lg:px-0"
                      : ""
                  }`}
                  key={view.key}
                  onClick={() => setActiveView(view.key)}
                  title={view.label}
                  type="button"
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0" />
                  <span className={isSidebarCollapsed ? "lg:hidden" : ""}>
                    {view.label}
                  </span>
                </button>
              );
            })}
          </nav>

          <section
            className={`mt-6 rounded-lg border border-white/10 bg-white/10 ${
              isSidebarCollapsed ? "p-4 lg:p-2" : "p-4"
            }`}
          >
            <div className={isSidebarCollapsed ? "lg:hidden" : ""}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cable aria-hidden className="h-4 w-4 text-teal-200" />
              Conector ativo
            </div>
            <p className="mt-3 text-2xl font-semibold">{selectedAdapter.displayName}</p>
            <p className="mt-1 text-sm text-white/60">
              Estrutura pronta para multiplos marketplaces.
            </p>
            <div className="mt-4 rounded-lg bg-black/15 p-3 text-xs text-white/72">
              <p className="font-bold text-white">
                {mercadoLivreAccount?.account_name ??
                  organization?.name ??
                  "Modo demonstrativo"}
              </p>
              <p className="mt-1">
                {mercadoLivreAccount
                  ? `Seller ${mercadoLivreAccount.external_seller_id}`
                  : userEmail ??
                    (supabaseStatus === "checking"
                      ? "Verificando sessao"
                      : "Entre para gravar custos reais")}
              </p>
              {mercadoLivreAccount?.last_sync_at && (
                <p className="mt-1">
                  Ultima sync{" "}
                  {new Date(mercadoLivreAccount.last_sync_at).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedAdapter.capabilities.map((capability) => (
                <span
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-white/80"
                  key={capability}
                >
                  {capability}
                </span>
              ))}
            </div>
            <button
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-bold text-ink hover:bg-paper"
              disabled={isMarketplaceConnectDisabled}
              onClick={
                mercadoLivreAccount ? syncMercadoLivreListings : connectMercadoLivre
              }
              type="button"
            >
              <Cable aria-hidden className="h-4 w-4" />
              {marketplaceSkuActionLabel}
            </button>
            {mercadoLivreAccount && (
              <button
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-teal-200 px-3 text-sm font-bold text-ink hover:bg-teal-100"
                disabled={isMarketplaceActionDisabled}
                onClick={syncMercadoLivreOrders}
                type="button"
              >
                <ClipboardList aria-hidden className="h-4 w-4" />
                {isSyncingOrders ? "Sincronizando" : "Sincronizar Vendas"}
              </button>
            )}
            {mercadoLivreAccount && (
              <button
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/20"
                disabled={isMarketplaceActionDisabled}
                onClick={syncMercadoLivreInventory}
                type="button"
              >
                <Boxes aria-hidden className="h-4 w-4" />
                {isSyncingInventory ? "Sincronizando" : "Sincronizar Estoque"}
              </button>
            )}
            {mercadoLivreAccount && (
              <button
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/20"
                disabled={isMarketplaceActionDisabled}
                onClick={syncMercadoLivreAdvertising}
                type="button"
              >
                <Megaphone aria-hidden className="h-4 w-4" />
                {isSyncingAdvertising ? "Sincronizando" : "Sincronizar Ads"}
              </button>
            )}
            {mercadoLivreAccount && (
              <button
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/20"
                disabled={isMarketplaceActionDisabled}
                onClick={syncMercadoLivrePromotions}
                type="button"
              >
                <Tags aria-hidden className="h-4 w-4" />
                {isSyncingPromotions ? "Sincronizando" : "Sincronizar Promoções"}
              </button>
            )}
            </div>

            <div className={`hidden gap-2 ${isSidebarCollapsed ? "lg:grid" : ""}`}>
              <button
                aria-label={marketplaceSkuActionLabel}
                className="grid h-10 w-10 place-items-center rounded-lg bg-white text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isMarketplaceConnectDisabled}
                onClick={
                  mercadoLivreAccount ? syncMercadoLivreListings : connectMercadoLivre
                }
                title={marketplaceSkuActionLabel}
                type="button"
              >
                <Cable aria-hidden className="h-4 w-4" />
              </button>
              {mercadoLivreAccount && (
                <button
                  aria-label={
                    isSyncingOrders ? "Sincronizando vendas" : "Sincronizar Vendas"
                  }
                  className="grid h-10 w-10 place-items-center rounded-lg bg-teal-200 text-ink hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isMarketplaceActionDisabled}
                  onClick={syncMercadoLivreOrders}
                  title={
                    isSyncingOrders ? "Sincronizando vendas" : "Sincronizar Vendas"
                  }
                  type="button"
                >
                  <ClipboardList aria-hidden className="h-4 w-4" />
                </button>
              )}
              {mercadoLivreAccount && (
                <button
                  aria-label={
                    isSyncingInventory
                      ? "Sincronizando estoque"
                      : "Sincronizar Estoque"
                  }
                  className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isMarketplaceActionDisabled}
                  onClick={syncMercadoLivreInventory}
                  title={
                    isSyncingInventory
                      ? "Sincronizando estoque"
                      : "Sincronizar Estoque"
                  }
                  type="button"
                >
                  <Boxes aria-hidden className="h-4 w-4" />
                </button>
              )}
              {mercadoLivreAccount && (
                <button
                  aria-label={
                    isSyncingAdvertising ? "Sincronizando Ads" : "Sincronizar Ads"
                  }
                  className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isMarketplaceActionDisabled}
                  onClick={syncMercadoLivreAdvertising}
                  title={
                    isSyncingAdvertising ? "Sincronizando Ads" : "Sincronizar Ads"
                  }
                  type="button"
                >
                  <Megaphone aria-hidden className="h-4 w-4" />
                </button>
              )}
              {mercadoLivreAccount && (
                <button
                  aria-label={
                    isSyncingPromotions
                      ? "Sincronizando promocoes"
                      : "Sincronizar Promoções"
                  }
                  className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isMarketplaceActionDisabled}
                  onClick={syncMercadoLivrePromotions}
                  title={
                    isSyncingPromotions
                      ? "Sincronizando promocoes"
                      : "Sincronizar Promoções"
                  }
                  type="button"
                >
                  <Tags aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
          </section>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 border-b border-black/10 pb-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-normal text-black/50">
                Visao operacional
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-normal text-ink sm:text-4xl">
                Margem, estoque e crescimento por SKU
              </h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex rounded-lg bg-white p-1 ring-1 ring-black/10">
                {listMarketplaceAdapters().slice(0, 3).map((adapter) => (
                  <button
                    className={`h-9 rounded-md px-3 text-sm font-semibold ${
                      selectedProvider === adapter.provider
                        ? "bg-ink text-white"
                        : "text-black/60 hover:bg-black/[0.04]"
                    }`}
                    key={adapter.provider}
                    onClick={() => setSelectedProvider(adapter.provider)}
                    type="button"
                  >
                    {adapter.displayName}
                  </button>
                ))}
              </div>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-sea px-4 text-sm font-bold text-white shadow-sm hover:bg-teal-800"
                onClick={
                  selectedProvider === "mercadolivre"
                    ? mercadoLivreAccount
                      ? syncMercadoLivreListings
                      : connectMercadoLivre
                    : undefined
                }
                disabled={
                  selectedProvider !== "mercadolivre" ||
                  supabaseStatus !== "connected" ||
                  isConnectingMarketplace ||
                  isSyncingMarketplace
                }
                type="button"
              >
                <RefreshCw aria-hidden className="h-4 w-4" />
                {selectedProvider === "mercadolivre" && mercadoLivreAccount
                  ? isSyncingListings
                    ? "Sincronizando"
                    : "Sincronizar SKUs"
                  : selectedProvider === "mercadolivre"
                    ? "Conectar ML"
                    : "Sincronizar"}
              </button>
              {mercadoLivreAccount && selectedProvider === "mercadolivre" && (
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white shadow-sm hover:bg-black"
                  disabled={
                    supabaseStatus !== "connected" ||
                    isSyncingMarketplace
                  }
                  onClick={syncMercadoLivreOrders}
                  type="button"
                >
                  <ClipboardList aria-hidden className="h-4 w-4" />
                  {isSyncingOrders ? "Sincronizando" : "Sincronizar Vendas"}
                </button>
              )}
            </div>
          </header>

          <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              detail={`${formatNumber.format(totals.units)} unidades vendidas no periodo`}
              icon={CircleDollarSign}
              title="Receita liquida"
              value={formatCurrency.format(totals.netRevenue)}
            />
            <KpiCard
              detail={`${formatPercent(marginRate)} sobre a receita liquida`}
              icon={Percent}
              title="Margem contribuicao"
              tone={marginRate < 0.18 ? "clay" : "moss"}
              value={formatCurrency.format(totals.contributionMargin)}
            />
            <KpiCard
              detail="Inclui produto, embalagem e custos por SKU"
              icon={WalletCards}
              title="Custos cadastrados"
              tone="clay"
              value={formatCurrency.format(totals.skuCosts)}
            />
            <KpiCard
              detail="Investimento atribuido aos SKUs vendidos"
              icon={Megaphone}
              title="Publicidade"
              tone="berry"
              value={formatCurrency.format(totals.advertisingCosts)}
            />
          </section>

          <section className="mt-5 rounded-lg border border-black/10 bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {views.map((view) => (
                  <ModuleButton
                    activeView={activeView}
                    key={view.key}
                    onClick={setActiveView}
                    view={view}
                  />
                ))}
              </div>
              <label className="relative block min-w-0 sm:w-80">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                />
                <input
                  className="h-10 w-full rounded-lg border border-black/10 bg-paper pl-9 pr-3 text-sm outline-none ring-sea/25 placeholder:text-black/40 focus:ring-4"
                  onChange={(event) => setSkuFilter(event.target.value)}
                  placeholder="Buscar SKU ou produto"
                  value={skuFilter}
                />
              </label>
            </div>
          </section>

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
                      `${formatNumber.format(ordersSyncSummary.daysBack)} dias`
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

          {activeView === "produtos" && (
            <section className="mt-5 grid gap-5">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <KpiCard
                  detail={`${formatNumber.format(productUnitTotals.productsWithSales)} com vendas no periodo`}
                  icon={PackageCheck}
                  title="Produtos"
                  value={formatNumber.format(productUnitTotals.products)}
                />
                <KpiCard
                  detail={`${formatNumber.format(productUnitTotals.units)} unidades vendidas`}
                  icon={CircleDollarSign}
                  title="Preco medio unit."
                  value={formatCurrency.format(
                    productUnitTotals.units > 0
                      ? productUnitTotals.grossRevenue / productUnitTotals.units
                      : 0
                  )}
                />
                <KpiCard
                  detail="Custos e descontos por unidade"
                  icon={WalletCards}
                  title="Custo medio unit."
                  tone="clay"
                  value={formatCurrency.format(
                    productUnitTotals.units > 0
                      ? productUnitTotals.totalCosts / productUnitTotals.units
                      : 0
                  )}
                />
                <KpiCard
                  detail={`${formatPercent(
                    productUnitTotals.grossRevenue > 0
                      ? productUnitTotals.contributionMargin /
                          productUnitTotals.grossRevenue
                      : 0
                  )} sobre o preco medio`}
                  icon={LineChart}
                  title="MC media unit."
                  tone="moss"
                  value={formatCurrency.format(
                    productUnitTotals.units > 0
                      ? productUnitTotals.contributionMargin /
                          productUnitTotals.units
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
                  <table className="min-w-[1840px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Vendas</th>
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
                          <td className="px-4 py-3">
                            {product.hasSales ? (
                              <>
                                <p>
                                  {formatNumber.format(product.units)} un.
                                </p>
                                <p className="text-xs text-black/45">
                                  {formatNumber.format(product.orders)} pedidos
                                </p>
                              </>
                            ) : (
                              <span className="text-black/45">Sem vendas</span>
                            )}
                          </td>
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
                            {formatCurrency.format(product.advertisingUnit)}
                            {product.tacosRate > 0 && (
                              <p className="text-xs text-black/45">
                                {formatPercent(product.tacosRate)} TACOS
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
                            colSpan={16}
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

                <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                <div className="table-scroll overflow-x-auto">
                  <table className="min-w-[1440px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">Anuncio</th>
                        <th className="px-4 py-3">Numero da venda</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Valor unit.</th>
                        <th className="px-4 py-3">Qtd.</th>
                        <th className="px-4 py-3">Faturamento ML</th>
                        <th className="px-4 py-3 text-clay">Custo (-)</th>
                        <th className="px-4 py-3 text-berry">Imposto (-)</th>
                        <th className="px-4 py-3 text-clay">Tarifa venda (-)</th>
                        <th className="px-4 py-3">Frete comprador</th>
                        <th className="px-4 py-3 text-sky-700">Frete vendedor (-)</th>
                        <th className="px-4 py-3 text-sea">Margem contrib.</th>
                        <th className="px-4 py-3 text-sea">MC em %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {filteredSalesDetailRows.map((sale) => (
                        <tr className="hover:bg-black/[0.018]" key={sale.id}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-ink">{sale.title}</p>
                            <p className="text-xs text-black/45">
                              {sale.externalItemId}
                            </p>
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {sale.orderId}
                          </td>
                          <td className="px-4 py-3 font-bold">{sale.sku}</td>
                          <td className="px-4 py-3">
                            {new Date(sale.soldAt).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="px-4 py-3">
                            {formatCurrency.format(sale.unitPrice)}
                          </td>
                          <td className="px-4 py-3">
                            {formatNumber.format(sale.quantity)}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {formatCurrency.format(sale.grossAmount)}
                          </td>
                          <td className="px-4 py-3 text-clay">
                            {formatCurrency.format(sale.costAmount)}
                          </td>
                          <td className="px-4 py-3 text-berry">
                            {formatCurrency.format(sale.taxAmount)}
                          </td>
                          <td className="px-4 py-3 text-clay">
                            {formatCurrency.format(sale.marketplaceFee)}
                          </td>
                          <td className="px-4 py-3 text-black/50">
                            {formatCurrency.format(sale.shippingBuyer)}
                          </td>
                          <td className="px-4 py-3 text-sky-700">
                            {formatCurrency.format(sale.shippingSeller)}
                          </td>
                          <td
                            className={`px-4 py-3 font-bold ${
                              sale.contributionMargin >= 0
                                ? "text-sea"
                                : "text-berry"
                            }`}
                          >
                            {formatCurrency.format(sale.contributionMargin)}
                          </td>
                          <td
                            className={`px-4 py-3 font-bold ${
                              sale.marginRate >= 0 ? "text-sea" : "text-berry"
                            }`}
                          >
                            {formatPercent(sale.marginRate)}
                          </td>
                        </tr>
                      ))}
                      {filteredSalesDetailRows.length === 0 && (
                        <tr>
                          <td
                            className="px-4 py-8 text-center text-black/55"
                            colSpan={14}
                          >
                            Nenhuma venda encontrada para este filtro.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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

          {activeView === "margem" && (
            <section className="mt-5 rounded-lg border border-black/10 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-black/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">Conciliação da margem por SKU</h2>
                  <p className="text-sm text-black/60">
                    Receita, taxas, frete, custos internos e publicidade no mesmo lugar.
                  </p>
                </div>
                <span className="inline-flex h-8 items-center gap-2 rounded-lg bg-emerald-50 px-3 text-sm font-semibold text-sea ring-1 ring-emerald-100">
                  <PackageCheck aria-hidden className="h-4 w-4" />
                  {realSales.length > 0
                    ? "Vendas reais em uso"
                    : "Base preparada para conciliar pedidos"}
                </span>
              </div>
              <div className="table-scroll overflow-x-auto">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Receita liquida</th>
                      <th className="px-4 py-3">Taxas</th>
                      <th className="px-4 py-3">Frete</th>
                      <th className="px-4 py-3">Custo SKU</th>
                      <th className="px-4 py-3">Ads</th>
                      <th className="px-4 py-3">Margem</th>
                      <th className="px-4 py-3">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10">
                    {filteredMargins.map((row) => (
                      <tr className="hover:bg-black/[0.018]" key={row.sku}>
                        <td className="px-4 py-3">
                          <p className="font-bold text-ink">{row.sku}</p>
                          <p className="text-xs text-black/50">{row.title}</p>
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {formatCurrency.format(row.netRevenue)}
                        </td>
                        <td className="px-4 py-3 text-black/60">
                          {formatCurrency.format(row.marketplaceFees)}
                        </td>
                        <td className="px-4 py-3 text-black/60">
                          {formatCurrency.format(row.shippingCosts)}
                        </td>
                        <td className="px-4 py-3 text-black/60">
                          {formatCurrency.format(row.skuCosts)}
                        </td>
                        <td className="px-4 py-3 text-black/60">
                          {formatCurrency.format(row.advertisingCosts)}
                        </td>
                        <td className={`px-4 py-3 font-bold ${marginTone(row)}`}>
                          {formatCurrency.format(row.contributionMargin)}
                        </td>
                        <td className={`px-4 py-3 font-bold ${marginTone(row)}`}>
                          {formatPercent(row.contributionMarginRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === "custos" && (
            <section className="mt-5 grid gap-5">
              <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
              <form
                className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
                onSubmit={addCost}
              >
                <div className="flex items-center gap-2">
                  <PackagePlus aria-hidden className="h-5 w-5 text-sea" />
                  <h2 className="text-lg font-bold">
                    {editingCostId ? "Editar custo do SKU" : "Cadastrar custo do SKU"}
                  </h2>
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1 text-sm font-semibold">
                    SKU
                    <select
                      className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(event) =>
                        setCostForm((current) => ({
                          ...current,
                          sku: event.target.value
                        }))
                      }
                      value={costForm.sku}
                    >
                      {productOptions.map((product) => (
                        <option key={product.sku} value={product.sku}>
                          {product.sku}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs font-normal text-black/50">
                      {supabaseStatus === "connected"
                        ? "Se o SKU ainda nao existir, ele sera criado no Supabase."
                        : "Entre para salvar este cadastro no banco."}
                    </span>
                  </label>

                  <label className="grid gap-1 text-sm font-semibold">
                    Nome do custo
                    <input
                      className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                      onChange={(event) =>
                        setCostForm((current) => ({
                          ...current,
                          label: event.target.value
                        }))
                      }
                      placeholder="Fornecedor, embalagem, imposto"
                      value={costForm.label}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-sm font-semibold">
                      Categoria
                      <select
                        className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) =>
                          setCostForm((current) => ({
                            ...current,
                            category: event.target.value as SkuCost["category"],
                            allocation:
                              event.target.value === "tax"
                                ? "percentage"
                                : current.allocation,
                            label:
                              event.target.value === "tax" && !current.label
                                ? "Imposto"
                                : current.label,
                            taxPercent:
                              event.target.value === "tax"
                                ? current.amount
                                : current.taxPercent
                          }))
                        }
                        value={costForm.category}
                      >
                        {Object.entries(costCategoryLabel).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1 text-sm font-semibold">
                      Alocação
                      <select
                        className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) =>
                          setCostForm((current) => ({
                            ...current,
                            allocation: event.target.value as SkuCost["allocation"],
                            taxPercent:
                              current.category === "tax" &&
                              event.target.value === "percentage"
                                ? current.amount
                                : current.taxPercent
                          }))
                        }
                        value={costForm.allocation}
                      >
                        {Object.entries(allocationLabel).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-sm font-semibold">
                      {costForm.category === "tax" &&
                      costForm.allocation === "percentage"
                        ? "Imposto (%)"
                        : "Valor"}
                      <input
                        className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                        min="0"
                        onChange={(event) =>
                          setCostForm((current) => ({
                            ...current,
                            amount: event.target.value,
                            taxPercent:
                              current.category === "tax" &&
                              current.allocation === "percentage"
                                ? event.target.value
                                : current.taxPercent
                          }))
                        }
                        placeholder={
                          costForm.category === "tax" &&
                          costForm.allocation === "percentage"
                            ? "12,00"
                            : "0,00"
                        }
                        step="0.01"
                        type="number"
                        value={costForm.amount}
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                      Vigencia
                      <input
                        className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                        onChange={(event) =>
                          setCostForm((current) => ({
                            ...current,
                            validFrom: event.target.value
                          }))
                        }
                        type="date"
                        value={costForm.validFrom}
                      />
                    </label>
                  </div>

                  <label className="grid gap-1 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-ink ring-1 ring-amber-100">
                    Imposto (%) do SKU
                    <input
                      className="h-10 rounded-lg border border-amber-200 bg-white px-3 font-normal outline-none focus:ring-4 focus:ring-amber-200"
                      min="0"
                      onChange={(event) =>
                        setCostForm((current) => ({
                          ...current,
                          category: "tax",
                          allocation: "percentage",
                          label: current.label || "Imposto",
                          amount: event.target.value,
                          taxPercent: event.target.value
                        }))
                      }
                      placeholder="Ex.: 12,00"
                      step="0.01"
                      type="number"
                      value={costForm.taxPercent}
                    />
                    <span className="text-xs font-normal text-black/55">
                      Ao preencher este campo, o custo sera salvo como Tributo
                      percentual e entrara na coluna Imposto das vendas.
                    </span>
                  </label>

                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black"
                      disabled={isSavingCost}
                      type="submit"
                    >
                      {editingCostId ? (
                        <Save aria-hidden className="h-4 w-4" />
                      ) : (
                        <PackagePlus aria-hidden className="h-4 w-4" />
                      )}
                      {isSavingCost
                        ? "Salvando"
                        : editingCostId
                          ? "Salvar alteracoes"
                          : "Adicionar custo"}
                    </button>
                    {editingCostId && (
                      <button
                        className="inline-flex h-11 items-center justify-center rounded-lg bg-paper px-4 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                        onClick={cancelCostEditing}
                        type="button"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </form>

              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="border-b border-black/10 p-4">
                  <h2 className="text-lg font-bold">Custos ativos</h2>
                  <p className="text-sm text-black/60">
                    Cada lançamento entra no cálculo de margem respeitando SKU e vigência.
                  </p>
                </div>
                <div className="table-scroll overflow-x-auto">
                  <table className="min-w-[940px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Custo</th>
                        <th className="px-4 py-3">Categoria</th>
                        <th className="px-4 py-3">Alocação</th>
                        <th className="px-4 py-3">Valor</th>
                        <th className="px-4 py-3">Desde</th>
                        <th className="px-4 py-3">Acoes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {costs.map((cost) => (
                        <tr
                          className={
                            editingCostId === cost.id ? "bg-sea/5" : undefined
                          }
                          key={cost.id}
                        >
                          <td className="px-4 py-3 font-bold">{cost.sku}</td>
                          <td className="px-4 py-3">{cost.label}</td>
                          <td className="px-4 py-3">
                            {costCategoryLabel[cost.category]}
                          </td>
                          <td className="px-4 py-3">{allocationLabel[cost.allocation]}</td>
                          <td className="px-4 py-3 font-semibold">
                            {cost.allocation === "percentage"
                              ? `${cost.amount}%`
                              : formatCurrency.format(cost.amount)}
                          </td>
                          <td className="px-4 py-3">{cost.validFrom}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-paper px-3 text-sm font-bold text-ink ring-1 ring-black/10 hover:bg-black/[0.03]"
                                disabled={isSavingCost}
                                onClick={() => startEditingCost(cost)}
                                type="button"
                              >
                                <Pencil aria-hidden className="h-4 w-4" />
                                Editar
                              </button>
                              <button
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-berry/10 px-3 text-sm font-bold text-berry ring-1 ring-berry/20 hover:bg-berry/15"
                                disabled={isSavingCost}
                                onClick={() => deleteCost(cost)}
                                type="button"
                              >
                                <Trash2 aria-hidden className="h-4 w-4" />
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              </section>

              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="border-b border-black/10 p-4">
                  <div className="flex items-center gap-2">
                    <CircleDollarSign aria-hidden className="h-5 w-5 text-sea" />
                    <h2 className="text-lg font-bold">Calculadora de custos</h2>
                  </div>
                  <p className="text-sm text-black/60">
                    Simule preco, custo e margem por SKU antes de aplicar no Centro de Custos.
                  </p>
                </div>

                <div className="grid gap-5 p-4 xl:grid-cols-[1.25fr_0.75fr]">
                  <div className="grid gap-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="grid gap-1 text-sm font-semibold">
                        SKU
                        <select
                          className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) => {
                            const product = costCenterProductRows.find(
                              (currentProduct) =>
                                currentProduct.sku === event.target.value
                            );

                            if (product) {
                              selectProductForCalculator(product);
                              return;
                            }

                            setCalculatorForm((current) => ({
                              ...current,
                              sku: event.target.value
                            }));
                          }}
                          value={calculatorForm.sku}
                        >
                          {productOptions.map((product) => (
                            <option key={product.sku} value={product.sku}>
                              {product.sku}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1 text-sm font-semibold md:col-span-2">
                        Produto
                        <input
                          className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                          onChange={(event) =>
                            setCalculatorForm((current) => ({
                              ...current,
                              name: event.target.value
                            }))
                          }
                          placeholder="Titulo do produto"
                          value={calculatorForm.name}
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {[
                        ["margin", "Calcular margem"],
                        ["price", "Preco por margem"],
                        ["fixedProfit", "Preco por lucro"]
                      ].map(([mode, label]) => (
                        <button
                          className={`h-9 rounded-lg px-3 text-sm font-bold ring-1 ${
                            calculatorMode === mode
                              ? "bg-ink text-white ring-ink"
                              : "bg-paper text-ink ring-black/10 hover:bg-black/[0.03]"
                          }`}
                          key={mode}
                          onClick={() => setCalculatorMode(mode as CostCalculatorMode)}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      {[
                        ["productCost", "Custo produto", "0,00"],
                        ["sellingPrice", "Preco venda", "0,00"],
                        ["commissionPercentage", "Comissao (%)", "16,00"],
                        ["fixedFee", "Tarifa fixa", "0,00"],
                        ["shippingCost", "Frete vendedor", "0,00"],
                        ["packagingCost", "Embalagem", "0,00"],
                        ["collectionCost", "Coleta", "0,00"],
                        ["storageCost", "Armazenagem", "0,00"],
                        ["operationalCost", "Operacional", "0,00"],
                        ["taxPercentage", "Imposto (%)", "0,00"],
                        ["adTacosPercentage", "Investimento ADS - TACOS (%)", "8,00"],
                        ["promotionCredit", "Credito promocao", "0,00"],
                        ["validFrom", "Vigencia", ""]
                      ].map(([field, label, placeholder]) => (
                        <label className="grid gap-1 text-sm font-semibold" key={field}>
                          {label}
                          <input
                            className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            min="0"
                            onChange={(event) =>
                              setCalculatorForm((current) => ({
                                ...current,
                                [field]: event.target.value
                              }))
                            }
                            placeholder={placeholder}
                            step="0.01"
                            type={field === "validFrom" ? "date" : "number"}
                            value={
                              calculatorForm[
                                field as keyof CostCalculatorFormState
                              ]
                            }
                          />
                        </label>
                      ))}

                      {calculatorMode === "price" && (
                        <label className="grid gap-1 text-sm font-semibold">
                          Margem desejada (%)
                          <input
                            className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            min="0"
                            onChange={(event) =>
                              setCalculatorForm((current) => ({
                                ...current,
                                desiredProfitMargin: event.target.value
                              }))
                            }
                            placeholder="15,00"
                            step="0.01"
                            type="number"
                            value={calculatorForm.desiredProfitMargin}
                          />
                        </label>
                      )}

                      {calculatorMode === "fixedProfit" && (
                        <label className="grid gap-1 text-sm font-semibold">
                          Lucro desejado
                          <input
                            className="h-10 rounded-lg border border-black/10 bg-paper px-3 font-normal outline-none focus:ring-4 focus:ring-sea/20"
                            min="0"
                            onChange={(event) =>
                              setCalculatorForm((current) => ({
                                ...current,
                                desiredFixedProfit: event.target.value
                              }))
                            }
                            placeholder="10,00"
                            step="0.01"
                            type="number"
                            value={calculatorForm.desiredFixedProfit}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <section className="rounded-lg border border-black/10 bg-paper p-4">
                    <h3 className="text-base font-bold">Resumo da calculadora</h3>
                    {calculatorResult ? (
                      <div className="mt-4 grid gap-2 text-sm">
                        {[
                          ["Preco de venda", calculatorResult.sellingPrice],
                          ["Custo produto", -calculatorResult.productCost],
                          ["Comissao", -calculatorResult.commission],
                          ["Tarifa fixa", -calculatorResult.fixedFee],
                          ["Frete vendedor", -calculatorResult.shippingCost],
                          ["Embalagem", -calculatorResult.packagingCost],
                          ["Coleta", -calculatorResult.collectionCost],
                          ["Armazenagem", -calculatorResult.storageCost],
                          ["Operacional", -calculatorResult.operationalCost],
                          ["Impostos", -calculatorResult.taxes],
                          [
                            "Investimento ADS - TACOS",
                            -calculatorResult.advertisingInvestment
                          ],
                          ["Credito promocao", calculatorResult.promotionCredit]
                        ]
                          .filter(([, value]) => Number(value) !== 0)
                          .map(([label, value]) => (
                            <div className="flex justify-between gap-3" key={label}>
                              <span className="text-black/60">{label}</span>
                              <span className="font-semibold text-ink">
                                {formatCurrency.format(Number(value))}
                              </span>
                            </div>
                          ))}

                        <div className="mt-2 border-t border-black/10 pt-3">
                          <div className="flex justify-between gap-3 font-bold">
                            <span>Total de custos</span>
                            <span>{formatCurrency.format(calculatorResult.totalCosts)}</span>
                          </div>
                          <div
                            className={`mt-2 flex justify-between gap-3 text-base font-bold ${
                              calculatorResult.netProfit >= 0
                                ? "text-sea"
                                : "text-berry"
                            }`}
                          >
                            <span>Lucro liquido</span>
                            <span>{formatCurrency.format(calculatorResult.netProfit)}</span>
                          </div>
                          <div
                            className={`mt-1 flex justify-between gap-3 font-bold ${
                              calculatorResult.profitMargin >= 0
                                ? "text-sea"
                                : "text-berry"
                            }`}
                          >
                            <span>Margem</span>
                            <span>{formatPercent(calculatorResult.profitMargin)}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-black/55">
                        Informe custos e preço ou uma meta valida.
                      </p>
                    )}

                    <button
                      className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black"
                      disabled={isSavingCalculatorCosts}
                      onClick={saveCalculatorCosts}
                      type="button"
                    >
                      <PackagePlus aria-hidden className="h-4 w-4" />
                      {isSavingCalculatorCosts
                        ? "Salvando"
                        : "Aplicar custos internos"}
                    </button>
                    <p className="mt-2 text-xs text-black/55">
                      Comissao, tarifa, frete e ADS/TACOS ficam como simulacao; o Mercado Livre ja traz esses valores nas vendas.
                    </p>
                  </section>
                </div>
              </section>

              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Produtos do Centro de Custos</h2>
                    <p className="text-sm text-black/60">
                      SKUs sincronizados e custos cadastrados para conciliar as vendas.
                    </p>
                  </div>
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
                <div className="table-scroll overflow-x-auto">
                  <table className="min-w-[1380px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Vendas</th>
                        <th className="px-4 py-3">Preco medio</th>
                        <th className="px-4 py-3">Custo produto</th>
                        <th className="px-4 py-3">Embalagem</th>
                        <th className="px-4 py-3">Operacional</th>
                        <th className="px-4 py-3">Imposto</th>
                        <th className="px-4 py-3">Margem atual</th>
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
                            {formatNumber.format(product.orders)} pedidos
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
                            colSpan={10}
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
            <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
              <section className="rounded-lg border border-black/10 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-black/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Estoque por canal de envio</h2>
                    <p className="text-sm text-black/60">
                      {realInventory.length > 0
                        ? "Ultimo snapshot salvo no Supabase por SKU e canal."
                        : "Pronto para receber snapshots do Full e demais modalidades."}
                    </p>
                  </div>
                  {mercadoLivreAccount && (
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black"
                      disabled={
                        supabaseStatus !== "connected" ||
                        isSyncingListings ||
                        isSyncingOrders ||
                        isSyncingInventory
                      }
                      onClick={syncMercadoLivreInventory}
                      type="button"
                    >
                      <Boxes aria-hidden className="h-4 w-4" />
                      {isSyncingInventory ? "Sincronizando" : "Sincronizar Estoque"}
                    </button>
                  )}
                </div>
                <div className="table-scroll overflow-x-auto">
                  <table className="min-w-[780px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Canal</th>
                        <th className="px-4 py-3">Disponivel</th>
                        <th className="px-4 py-3">Reservado</th>
                        <th className="px-4 py-3">Indisponivel</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Atualizado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {displayInventoryRows.map((row) => (
                        <tr key={`${row.sku}:${row.channel}`}>
                          <td className="px-4 py-3 font-bold">{row.sku}</td>
                          <td className="px-4 py-3">{row.channel}</td>
                          <td className="px-4 py-3">{formatNumber.format(row.available)}</td>
                          <td className="px-4 py-3">{formatNumber.format(row.reserved)}</td>
                          <td className="px-4 py-3">
                            {formatNumber.format(row.notAvailable)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1 ${statusClass(row.status)}`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-black/50">
                            {row.capturedAt
                              ? new Date(row.capturedAt).toLocaleString("pt-BR")
                              : "Demo"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <ClipboardList aria-hidden className="h-5 w-5 text-sea" />
                  <h2 className="text-lg font-bold">Fila de sincronização</h2>
                </div>
                <div className="mt-4 grid gap-3">
                  {["orders", "inventory", "listings", "promotions"].map((item, index) => (
                    <div
                      className="flex items-center justify-between rounded-lg border border-black/10 bg-paper px-3 py-3"
                      key={item}
                    >
                      <span className="text-sm font-semibold">{item}</span>
                      <span className="text-xs font-bold text-black/50">
                        {index === 0 ? "15 min" : "1 h"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
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

          <footer className="mt-6 flex flex-col gap-2 pb-4 text-sm text-black/50 sm:flex-row sm:items-center sm:justify-between">
            <span>Dados demonstrativos enquanto o Supabase e Mercado Livre sao conectados.</span>
            <span className="inline-flex items-center gap-2">
              <LineChart aria-hidden className="h-4 w-4" />
              Preparado para historico e conciliacao por periodo
            </span>
          </footer>
        </section>
      </div>
    </main>
  );
}

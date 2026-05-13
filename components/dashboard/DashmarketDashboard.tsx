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
  PackageCheck,
  PackagePlus,
  Percent,
  RefreshCw,
  Search,
  ShieldCheck,
  Tags,
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

type ViewKey = "margem" | "vendas" | "custos" | "estoque" | "ads";
type SupabaseStatus = "checking" | "demo" | "connected" | "error";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type ProductRow = {
  id: string;
  internal_sku: string;
  title: string;
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
  daysBack: number;
  campaigns: number;
  ads: number;
  metrics: number;
  adSpend: number;
  attributedRevenue: number;
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

type SalesDetailRow = SalesDetailSourceRow & {
  costAmount: number;
  taxAmount: number;
  contributionMargin: number;
  marginRate: number;
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

const views: Array<{ key: ViewKey; label: string; icon: typeof BarChart3 }> = [
  { key: "margem", label: "Margem", icon: BarChart3 },
  { key: "vendas", label: "Vendas", icon: ClipboardList },
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

function mapCostCenterRow(row: CostCenterRow): SkuCost | null {
  const product = getRelatedProduct(row);
  if (!product) return null;

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
  const [skuFilter, setSkuFilter] = useState("");
  const [costs, setCosts] = useState<SkuCost[]>(costsSeed);
  const [organization, setOrganization] = useState<Organization | null>(null);
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
  const [salesFilters, setSalesFilters] = useState({
    dateFrom: daysAgo(30),
    dateTo: dateOnly(new Date()),
    sku: ""
  });

  const activeSales = realSales.length > 0 ? realSales : salesSeed;
  const activeAdvertising =
    realAdvertising.length > 0 ? realAdvertising : adSpendSeed;
  const displayInventoryRows =
    realInventory.length > 0 ? realInventory : inventoryRows;
  const displayPromotionRows =
    realPromotions.length > 0 ? realPromotions : promotionRows;
  const productOptions = useMemo(
    () =>
      realProducts.length > 0
        ? realProducts.map((product) => ({
            sku: product.internal_sku,
            title: product.title
          }))
        : activeSales.map((sale) => ({ sku: sale.sku, title: sale.title })),
    [activeSales, realProducts]
  );

  useEffect(() => {
    if (productOptions.length === 0) return;

    setCostForm((current) =>
      productOptions.some((product) => product.sku === current.sku)
        ? current
        : { ...current, sku: productOptions[0].sku }
    );
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
            sale.shippingBuyer -
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

  const loadCostCenter = useCallback(async (organizationId: string) => {
    if (!supabaseClient) return;

    const { data: productsData, error: productsError } = await supabaseClient
      .from("products")
      .select("id, internal_sku, title")
      .eq("organization_id", organizationId)
      .order("internal_sku", { ascending: true });

    if (productsError) throw productsError;

    const products = (productsData ?? []) as ProductRow[];
    setRealProducts(products);

    const { data: costsData, error: costsError } = await supabaseClient
      .from("sku_costs")
      .select(
        "id, cost_name, cost_category, allocation_method, amount, valid_from, valid_to, products(id, internal_sku, title)"
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
        "id, external_item_id, seller_sku, title, quantity, unit_price, gross_amount, marketplace_fee_amount, shipping_cost_amount, discount_amount, orders(provider_order_id, sold_at, status, gross_amount, taxes_amount)"
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
      current.shippingCosts += numberFromDb(row.shipping_cost_amount);
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
        shippingBuyer: 0,
        shippingSeller: numberFromDb(row.shipping_cost_amount),
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
        "impressions, clicks, ad_spend_amount, attributed_revenue_amount, attributed_orders, products(id, internal_sku, title)"
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
        "provider_promotion_id, name, promotion_type, status, starts_at, ends_at, discount_amount, discount_percent, products(id, internal_sku, title)"
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
        setRealSales([]);
        setRealSaleDetails([]);
        setRealInventory([]);
        setRealAdvertising([]);
        setRealPromotions([]);
        setCosts(costsSeed);
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
          setUserEmail(null);
          setOrganization(null);
          setRealProducts([]);
          setRealSales([]);
          setRealSaleDetails([]);
          setRealInventory([]);
          setRealAdvertising([]);
          setRealPromotions([]);
          setCosts(costsSeed);
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

        setUserEmail(session.user.email ?? null);
        setOrganization(currentOrganization);
        setSupabaseStatus("connected");

        if (currentOrganization) {
          await loadCostCenter(currentOrganization.id);
          await loadSales(currentOrganization.id);
          await loadInventory(currentOrganization.id);
          await loadAdvertising(currentOrganization.id);
          await loadPromotions(currentOrganization.id);
          await loadMarketplaceAccounts(currentOrganization.id);
        } else {
          setCosts([]);
          setRealSales([]);
          setRealSaleDetails([]);
          setRealInventory([]);
          setRealAdvertising([]);
          setRealPromotions([]);
          setMarketplaceAccounts([]);
          setDataMessage("Usuario autenticado, mas sem empresa vinculada.");
        }
      } catch (error) {
        if (!isMounted) return;
        setSupabaseStatus("error");
        setRealSales([]);
        setRealSaleDetails([]);
        setRealInventory([]);
        setRealAdvertising([]);
        setRealPromotions([]);
        setCosts(costsSeed);
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
    loadInventory,
    loadMarketplaceAccounts,
    loadPromotions,
    loadSales,
    supabaseClient
  ]);

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
        let product = realProducts.find(
          (currentProduct) => currentProduct.internal_sku === costForm.sku
        );

        if (!product) {
          const saleProduct = activeSales.find((sale) => sale.sku === costForm.sku);
          const { data: insertedProduct, error: productError } =
            await supabaseClient
              .from("products")
              .insert({
                organization_id: organization.id,
                internal_sku: costForm.sku,
                title: saleProduct?.title ?? costForm.sku
              })
              .select("id, internal_sku, title")
              .single();

          if (productError) throw productError;
          product = insertedProduct as ProductRow;
        }

        const { error: costError } = await supabaseClient.from("sku_costs").insert({
          organization_id: organization.id,
          product_id: product.id,
          cost_name: costLabel,
          cost_category: costForm.category,
          allocation_method: costForm.allocation,
          amount: Number(costForm.amount),
          valid_from: costForm.validFrom
        });

        if (costError) throw costError;

        await loadCostCenter(organization.id);
        setCostForm((current) => ({
          ...current,
          label: "",
          amount: "",
          taxPercent: ""
        }));
        setDataMessage("Custo salvo no Supabase.");
      } catch (error) {
        setDataMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel salvar o custo."
        );
      } finally {
        setIsSavingCost(false);
      }

      return;
    }

    setCosts((current) => [
      ...current,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `cost-${Date.now()}`,
        sku: costForm.sku,
        label: costLabel,
        category: costForm.category,
        amount: Number(costForm.amount),
        allocation: costForm.allocation,
        validFrom: costForm.validFrom
      }
    ]);

    setCostForm((current) => ({
      ...current,
      label: "",
      amount: "",
      taxPercent: ""
    }));
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
    setCosts(costsSeed);
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
        `Publicidade sincronizada: ${summary.metrics} metricas e ${summary.campaigns} campanhas.`
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
        <aside className="border-b border-black/10 bg-ink px-4 py-4 text-white lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-sm font-black text-ink">
                  DM
                </span>
                <div>
                  <p className="text-lg font-black tracking-normal">DASHMARKET</p>
                  <p className="text-xs text-white/60">Marketplace intelligence</p>
                </div>
              </div>
            </div>
            {supabaseStatus === "connected" ? (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/20 lg:mt-6"
                onClick={signOut}
                type="button"
              >
                <LogOut aria-hidden className="h-4 w-4" />
                Sair
              </button>
            ) : (
              <Link
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/20 lg:mt-6"
                href="/login"
              >
                <ShieldCheck aria-hidden className="h-4 w-4" />
                Entrar
              </Link>
            )}
          </div>

          <nav className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-1">
            {views.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  className={`flex h-10 items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold transition ${
                    activeView === view.key
                      ? "bg-white text-ink"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                  key={view.key}
                  onClick={() => setActiveView(view.key)}
                  type="button"
                >
                  <Icon aria-hidden className="h-4 w-4" />
                  {view.label}
                </button>
              );
            })}
          </nav>

          <section className="mt-6 rounded-lg border border-white/10 bg-white/10 p-4">
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
              disabled={
                selectedProvider !== "mercadolivre" ||
                supabaseStatus !== "connected" ||
                isConnectingMarketplace ||
                isSyncingMarketplace
              }
              onClick={
                mercadoLivreAccount ? syncMercadoLivreListings : connectMercadoLivre
              }
              type="button"
            >
              <Cable aria-hidden className="h-4 w-4" />
              {isConnectingMarketplace
                ? "Conectando"
                : isSyncingListings
                  ? "Sincronizando"
                  : mercadoLivreAccount
                    ? "Sincronizar SKUs"
                    : "Conectar Mercado Livre"}
            </button>
            {mercadoLivreAccount && (
              <button
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-teal-200 px-3 text-sm font-bold text-ink hover:bg-teal-100"
                disabled={
                  selectedProvider !== "mercadolivre" ||
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
            {mercadoLivreAccount && (
              <button
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/20"
                disabled={
                  selectedProvider !== "mercadolivre" ||
                  supabaseStatus !== "connected" ||
                  isSyncingMarketplace
                }
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
                disabled={
                  selectedProvider !== "mercadolivre" ||
                  supabaseStatus !== "connected" ||
                  isSyncingMarketplace
                }
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
                disabled={
                  selectedProvider !== "mercadolivre" ||
                  supabaseStatus !== "connected" ||
                  isSyncingMarketplace
                }
                onClick={syncMercadoLivrePromotions}
                type="button"
              >
                <Tags aria-hidden className="h-4 w-4" />
                {isSyncingPromotions ? "Sincronizando" : "Sincronizar Promoções"}
              </button>
            )}
          </section>
        </aside>

        <section className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
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
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
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
                        <th className="px-4 py-3">Frete comprador (-)</th>
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
            <section className="mt-5 grid gap-5 xl:grid-cols-[380px_1fr]">
              <form
                className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
                onSubmit={addCost}
              >
                <div className="flex items-center gap-2">
                  <PackagePlus aria-hidden className="h-5 w-5 text-sea" />
                  <h2 className="text-lg font-bold">Cadastrar custo do SKU</h2>
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

                  <button
                    className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-black"
                    disabled={isSavingCost}
                    type="submit"
                  >
                    <PackagePlus aria-hidden className="h-4 w-4" />
                    {isSavingCost ? "Salvando" : "Adicionar custo"}
                  </button>
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
                  <table className="min-w-[780px] w-full text-left text-sm">
                    <thead className="bg-black/[0.025] text-xs uppercase tracking-normal text-black/50">
                      <tr>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Custo</th>
                        <th className="px-4 py-3">Categoria</th>
                        <th className="px-4 py-3">Alocação</th>
                        <th className="px-4 py-3">Valor</th>
                        <th className="px-4 py-3">Desde</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {costs.map((cost) => (
                        <tr key={cost.id}>
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
                        </tr>
                      ))}
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

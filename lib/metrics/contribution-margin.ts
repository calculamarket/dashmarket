export type CostAllocation = "per_unit" | "percentage" | "per_order";

export type SaleRecord = {
  sku: string;
  title: string;
  units: number;
  orders: number;
  grossRevenue: number;
  marketplaceFees: number;
  shippingCosts: number;
  discounts: number;
  taxes: number;
};

export type SkuCost = {
  id: string;
  sku: string;
  label: string;
  category:
    | "product"
    | "packaging"
    | "inbound_freight"
    | "tax"
    | "marketplace_fixed"
    | "other";
  amount: number;
  allocation: CostAllocation;
  validFrom: string;
  validTo?: string;
};

export type AdvertisingSpend = {
  sku: string;
  amount: number;
  clicks: number;
  impressions: number;
  attributedRevenue: number;
};

export type ContributionMarginRow = {
  sku: string;
  title: string;
  units: number;
  orders: number;
  grossRevenue: number;
  netRevenue: number;
  marketplaceFees: number;
  shippingCosts: number;
  discounts: number;
  taxes: number;
  skuCosts: number;
  advertisingCosts: number;
  contributionMargin: number;
  contributionMarginRate: number;
};

function calculateAllocatedCost(cost: SkuCost, sale: SaleRecord) {
  if (cost.allocation === "percentage") {
    return sale.grossRevenue * (cost.amount / 100);
  }

  if (cost.allocation === "per_order") {
    return sale.orders * cost.amount;
  }

  return sale.units * cost.amount;
}

export function calculateContributionMargins(
  sales: SaleRecord[],
  costs: SkuCost[],
  advertising: AdvertisingSpend[]
): ContributionMarginRow[] {
  return sales.map((sale) => {
    const skuCosts = costs
      .filter((cost) => cost.sku === sale.sku)
      .reduce((total, cost) => total + calculateAllocatedCost(cost, sale), 0);

    const advertisingCosts = advertising
      .filter((record) => record.sku === sale.sku)
      .reduce((total, record) => total + record.amount, 0);

    const netRevenue = sale.grossRevenue - sale.discounts;
    const contributionMargin =
      netRevenue -
      sale.marketplaceFees -
      sale.shippingCosts -
      sale.taxes -
      skuCosts -
      advertisingCosts;

    return {
      sku: sale.sku,
      title: sale.title,
      units: sale.units,
      orders: sale.orders,
      grossRevenue: sale.grossRevenue,
      netRevenue,
      marketplaceFees: sale.marketplaceFees,
      shippingCosts: sale.shippingCosts,
      discounts: sale.discounts,
      taxes: sale.taxes,
      skuCosts,
      advertisingCosts,
      contributionMargin,
      contributionMarginRate: netRevenue > 0 ? contributionMargin / netRevenue : 0
    };
  });
}

"use client";

import { PackageCheck } from "lucide-react";

interface ProductUnitRow {
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
}

interface ProductAnalysisTableProps {
  products: ProductUnitRow[];
  formatCurrency: Intl.NumberFormat;
  formatPercent: (value: number) => string;
}

export function ProductAnalysisTable({
  products,
  formatCurrency,
  formatPercent
}: ProductAnalysisTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Produtos - Margem Unitária</h2>
          <p className="text-sm font-medium text-slate-500">
            Custos detalhados por unidade, separados da margem total por vendas.
          </p>
        </div>
        <span className="inline-flex h-8 items-center gap-2 rounded-lg bg-emerald-50 px-3 text-sm font-bold text-emerald-600 ring-1 ring-emerald-100">
          <PackageCheck aria-hidden className="h-4 w-4" />
          Análise por SKU e unidade
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <th className="px-6 py-4 sticky left-0 bg-slate-50 z-10">Produto / SKU</th>
              <th className="px-6 py-4 text-right">Preço un.</th>
              <th className="px-6 py-4 text-right text-amber-600">Desc.</th>
              <th className="px-6 py-4 text-right text-amber-600">Prod.</th>
              <th className="px-6 py-4 text-right text-amber-600">Emb.</th>
              <th className="px-6 py-4 text-right text-amber-600">Frete In</th>
              <th className="px-6 py-4 text-right text-rose-600">Imposto</th>
              <th className="px-6 py-4 text-right text-amber-600">Tarifa ML</th>
              <th className="px-6 py-4 text-right text-sky-600">Frete Out</th>
              <th className="px-6 py-4 text-right text-rose-600">ADS/TACOS</th>
              <th className="px-6 py-4 text-right font-bold text-slate-900">Custo Total</th>
              <th className="px-6 py-4 text-right text-emerald-600">MC un.</th>
              <th className="px-6 py-4 text-right text-emerald-600">MC %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {products.map((product) => (
              <tr className="group transition hover:bg-slate-50" key={product.sku}>
                <td className="px-6 py-4 sticky left-0 bg-white group-hover:bg-slate-50 transition z-10 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  <p className="font-bold text-slate-900">{product.sku}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 line-clamp-1 max-w-[180px]">{product.title}</p>
                </td>
                <td className="px-6 py-4 text-right font-bold">
                  {product.hasSales ? formatCurrency.format(product.averagePrice) : "—"}
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-500">
                  {formatCurrency.format(product.discountUnit)}
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-500">
                  {formatCurrency.format(product.productCostUnit)}
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-500">
                  {formatCurrency.format(product.packagingCostUnit)}
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-500">
                  {formatCurrency.format(product.inboundFreightUnit)}
                </td>
                <td className="px-6 py-4 text-right font-medium text-rose-500">
                  {formatCurrency.format(product.taxUnit)}
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-500">
                  {formatCurrency.format(product.marketplaceFeeUnit)}
                </td>
                <td className="px-6 py-4 text-right font-medium text-sky-500">
                  {formatCurrency.format(product.shippingSellerUnit)}
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="font-medium text-rose-500">{formatCurrency.format(product.manualAdvertisingUnit)}</p>
                  {product.manualTacosRate > 0 && (
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      {formatPercent(product.manualTacosRate)} TACOS
                    </p>
                  )}
                </td>
                <td className="px-6 py-4 text-right font-bold text-slate-900">
                  {formatCurrency.format(product.totalCostUnit)}
                </td>
                <td className={`px-6 py-4 text-right font-bold ${product.contributionMarginUnit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {product.hasSales ? formatCurrency.format(product.contributionMarginUnit) : "—"}
                </td>
                <td className={`px-6 py-4 text-right font-black ${product.contributionMarginRate >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {product.hasSales ? formatPercent(product.contributionMarginRate) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

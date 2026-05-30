"use client";

import { Boxes } from "lucide-react";

interface InventoryRow {
  sku: string;
  title: string;
  channel: string;
  available: number;
  reserved: number;
  notAvailable: number;
  totalQuantity: number;
  hasPricing: boolean;
  unitSalePrice: number;
  unitMarketplaceFee: number;
  unitSellerShippingCost: number;
  unitNetValue: number;
  investedValue: number;
  status: string;
  capturedAt?: string | null;
}

interface InventoryTableProps {
  rows: InventoryRow[];
  isSyncing: boolean;
  onSync: () => void;
  supabaseConnected: boolean;
  formatCurrency: Intl.NumberFormat;
  formatNumber: Intl.NumberFormat;
  statusClass: (status: string) => string;
}

export function InventoryTable({
  rows,
  isSyncing,
  onSync,
  supabaseConnected,
  formatCurrency,
  formatNumber,
  statusClass
}: InventoryTableProps) {
  const totalInvestedValue = rows
    .filter((r) => r.hasPricing)
    .reduce((sum, r) => sum + r.investedValue, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Estoque Full</h2>
          <p className="text-sm font-medium text-slate-500">
            {rows.length > 0
              ? "Último snapshot Full salvo com valor líquido por SKU."
              : "Pronto para receber snapshots do Full."}
          </p>
          {rows.length > 0 && (
            <p className="mt-1 text-sm font-medium text-slate-600">
              Valor total em estoque:{" "}
              <span className={`font-bold ${totalInvestedValue < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {formatCurrency.format(totalInvestedValue)}
              </span>
            </p>
          )}
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 shadow-sm"
          disabled={!supabaseConnected || isSyncing}
          onClick={onSync}
          type="button"
        >
          <Boxes aria-hidden className="h-4 w-4" />
          {isSyncing ? "Sincronizando..." : "Sincronizar Estoque"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <th className="px-6 py-4">SKU / Produto</th>
              <th className="px-6 py-4">Canal</th>
              <th className="px-6 py-4 text-right">Disp.</th>
              <th className="px-6 py-4 text-right">Total</th>
              <th className="px-6 py-4 text-right">Venda un.</th>
              <th className="px-6 py-4 text-right text-slate-900">Líquido un.</th>
              <th className="px-6 py-4 text-right">Valor Est.</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Atualizado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => (
              <tr className="group transition hover:bg-slate-50" key={`${row.sku}:${row.channel}`}>
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-900">{row.sku}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 line-clamp-1 max-w-[200px]">{row.title}</p>
                </td>
                <td className="px-6 py-4 font-medium text-slate-600">{row.channel}</td>
                <td className="px-6 py-4 text-right font-medium">{formatNumber.format(row.available)}</td>
                <td className="px-6 py-4 text-right font-bold text-slate-900">{formatNumber.format(row.totalQuantity)}</td>
                <td className="px-6 py-4 text-right font-medium">
                  {row.hasPricing ? formatCurrency.format(row.unitSalePrice) : "—"}
                </td>
                <td className="px-6 py-4 text-right font-bold text-slate-900">
                  {row.hasPricing ? formatCurrency.format(row.unitNetValue) : "—"}
                </td>
                <td className={`px-6 py-4 text-right font-bold ${row.investedValue < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {row.hasPricing ? formatCurrency.format(row.investedValue) : "—"}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${statusClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs font-medium text-slate-400">
                  {row.capturedAt ? new Date(row.capturedAt).toLocaleString("pt-BR", { dateStyle: 'short', timeStyle: 'short' }) : "Demo"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-6 py-12 text-center text-slate-500 font-medium" colSpan={9}>
                  Nenhum dado de estoque disponível. Sincronize para começar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  RefreshCw,
  Scale,
  Trash2,
  UploadCloud,
  XCircle
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

function buildMercadoLivreOrderUrl(orderId: string) {
  return `https://www.mercadolivre.com.br/vendas/${encodeURIComponent(orderId)}/detalhe`;
}

type MatchStatus = "matched" | "amount_mismatch" | "unmatched";

type BatchSummary = {
  id: string;
  fileName: string;
  periodFrom: string | null;
  periodTo: string | null;
  totalRows: number;
  matchedRows: number;
  mismatchedRows: number;
  unmatchedRows: number;
  totalGrossAmount: number;
  totalNetReceivedAmount: number;
  createdAt?: string;
};

type ImportRow = {
  id: string;
  mlOrderId: string | null;
  mpOperationId: string | null;
  description: string | null;
  sellerSku: string | null;
  status: string | null;
  purchaseDate: string | null;
  releasedDate: string | null;
  grossAmount: number;
  netReceivedAmount: number;
  matchStatus: MatchStatus;
  amountDifference: number;
};

type RowFilter = "all" | MatchStatus;

interface ReconciliationViewProps {
  organizationId: string | null;
  supabaseClient: SupabaseClient | null;
  formatCurrency: Intl.NumberFormat;
  formatDate: Intl.DateTimeFormat;
}

const MATCH_LABELS: Record<MatchStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  matched: { label: "Conciliado", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  amount_mismatch: { label: "Divergência de valor", className: "bg-amber-50 text-amber-700 ring-amber-200", Icon: AlertTriangle },
  unmatched: { label: "Sem correspondência", className: "bg-rose-50 text-rose-700 ring-rose-200", Icon: XCircle }
};

export function ReconciliationView({
  organizationId,
  supabaseClient,
  formatCurrency,
  formatDate
}: ReconciliationViewProps) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<BatchSummary | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getAccessToken = useCallback(async () => {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabaseClient]);

  const loadHistory = useCallback(async () => {
    if (!organizationId || !supabaseClient) return;
    setIsLoadingHistory(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      const response = await fetch(
        `/api/marketplaces/mercadopago/reconciliation/import?organizationId=${encodeURIComponent(organizationId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const payload = (await response.json()) as { batches?: BatchSummary[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar o histórico.");
      setBatches(payload.batches ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o histórico.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [organizationId, supabaseClient, getAccessToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleFileSelected = useCallback(
    async (file: File) => {
      if (!organizationId || !supabaseClient) {
        setError("Conecte-se a uma empresa para importar o extrato.");
        return;
      }
      setIsUploading(true);
      setError(null);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Sessão expirada. Faça login novamente.");

        const formData = new FormData();
        formData.append("organizationId", organizationId);
        formData.append("file", file);

        const response = await fetch("/api/marketplaces/mercadopago/reconciliation/import", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData
        });
        const payload = (await response.json()) as {
          batch?: BatchSummary;
          rows?: ImportRow[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível importar o extrato.");

        setLastBatch(payload.batch ?? null);
        setRows(payload.rows ?? []);
        setFilter("all");
        await loadHistory();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Não foi possível importar o extrato.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [organizationId, supabaseClient, getAccessToken, loadHistory]
  );

  const handleDeleteBatch = useCallback(
    async (batch: BatchSummary) => {
      if (!organizationId || !supabaseClient) return;
      const confirmed = window.confirm(
        `Excluir a importação "${batch.fileName}"? Essa ação remove o lote e todas as linhas conciliadas associadas a ele.`
      );
      if (!confirmed) return;

      setDeletingBatchId(batch.id);
      setError(null);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Sessão expirada. Faça login novamente.");

        const response = await fetch(
          `/api/marketplaces/mercadopago/reconciliation/import?organizationId=${encodeURIComponent(
            organizationId
          )}&batchId=${encodeURIComponent(batch.id)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        const payload = (await response.json()) as { deleted?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível excluir a importação.");

        setBatches((prev) => prev.filter((item) => item.id !== batch.id));
        if (lastBatch?.id === batch.id) {
          setLastBatch(null);
          setRows([]);
          setFilter("all");
        }
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir a importação.");
      } finally {
        setDeletingBatchId(null);
      }
    },
    [organizationId, supabaseClient, getAccessToken, lastBatch]
  );

  const visibleRows = filter === "all" ? rows : rows.filter((row) => row.matchStatus === filter);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          <Scale aria-hidden className="h-4 w-4" />
          Conciliação
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Vendas (Mercado Livre) × Recebimentos (Mercado Pago)
        </h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Envie o extrato de &quot;Vendas e recebimentos&quot; exportado do Mercado Pago (CSV ou XLSX). Cada
          linha é cruzada pelo número da venda no Mercado Livre com os pedidos já sincronizados, sinalizando
          o que foi recebido corretamente, o que tem divergência de valor e o que ainda não tem correspondência.
        </p>
      </header>

      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500">
            <UploadCloud aria-hidden className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">Importar extrato do Mercado Pago</p>
            <p className="text-xs text-slate-500">Formatos aceitos: .csv, .xlsx</p>
          </div>
          <input
            ref={fileInputRef}
            accept=".csv,.xlsx,.xls"
            className="hidden"
            id="mp-reconciliation-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFileSelected(file);
            }}
            type="file"
          />
          <label
            className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition ${
              isUploading || !organizationId ? "bg-slate-300" : "bg-slate-900 hover:bg-slate-800"
            }`}
            htmlFor="mp-reconciliation-file"
          >
            {isUploading ? (
              <RefreshCw aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet aria-hidden className="h-4 w-4" />
            )}
            <span>{isUploading ? "Processando..." : "Selecionar arquivo"}</span>
          </label>
          {!organizationId && (
            <p className="text-xs font-semibold text-amber-600">Conecte-se a uma empresa para importar extratos.</p>
          )}
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {lastBatch && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Linhas conciliadas"
            value={`${lastBatch.matchedRows} / ${lastBatch.totalRows}`}
            tone="emerald"
            Icon={CheckCircle2}
          />
          <SummaryCard
            label="Divergências de valor"
            value={String(lastBatch.mismatchedRows)}
            tone="amber"
            Icon={AlertTriangle}
          />
          <SummaryCard
            label="Sem correspondência"
            value={String(lastBatch.unmatchedRows)}
            tone="rose"
            Icon={XCircle}
          />
          <SummaryCard
            label="Valor líquido recebido"
            value={formatCurrency.format(lastBatch.totalNetReceivedAmount)}
            tone="slate"
            Icon={Scale}
          />
        </section>
      )}

      {rows.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
            <div>
              <p className="text-sm font-bold text-slate-900">{lastBatch?.fileName}</p>
              <p className="text-xs text-slate-500">
                {lastBatch?.periodFrom && lastBatch?.periodTo
                  ? `Período: ${lastBatch.periodFrom} a ${lastBatch.periodTo}`
                  : "Período não identificado"}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "matched", "amount_mismatch", "unmatched"] as RowFilter[]).map((option) => (
                <button
                  key={option}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ring-1 transition ${
                    filter === option
                      ? "bg-slate-900 text-white ring-slate-900"
                      : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-100"
                  }`}
                  onClick={() => setFilter(option)}
                  type="button"
                >
                  {option === "all" ? "Todas" : MATCH_LABELS[option].label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Venda ML</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Liberação</th>
                  <th className="px-4 py-3 text-right">Valor bruto</th>
                  <th className="px-4 py-3 text-right">Valor líquido</th>
                  <th className="px-4 py-3 text-right">Diferença</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => {
                  const match = MATCH_LABELS[row.matchStatus];
                  const MatchIcon = match.Icon;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {row.mlOrderId ? (
                          <a
                            className="inline-flex items-center gap-1.5 text-sea hover:underline"
                            href={buildMercadoLivreOrderUrl(row.mlOrderId)}
                            rel="noreferrer"
                            target="_blank"
                            title="Abrir venda no Mercado Livre"
                          >
                            {row.mlOrderId}
                            <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-slate-600" title={row.description ?? undefined}>
                        {row.description ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{row.sellerSku ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {row.releasedDate ? formatDate.format(new Date(row.releasedDate)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatCurrency.format(row.grossAmount)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCurrency.format(row.netReceivedAmount)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          Math.abs(row.amountDifference) < 0.05
                            ? "text-slate-400"
                            : row.amountDifference > 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                        }`}
                      >
                        {row.amountDifference === 0 ? "—" : formatCurrency.format(row.amountDifference)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${match.className}`}>
                          <MatchIcon aria-hidden className="h-3.5 w-3.5" />
                          {match.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
          <div>
            <p className="text-sm font-bold text-slate-900">Histórico de importações</p>
            <p className="text-xs text-slate-500">Últimos extratos conciliados nesta empresa</p>
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            disabled={isLoadingHistory}
            onClick={() => void loadHistory()}
            type="button"
          >
            <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${isLoadingHistory ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
        {batches.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Nenhuma importação realizada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Arquivo</th>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3 text-right">Linhas</th>
                  <th className="px-4 py-3 text-right">Conciliadas</th>
                  <th className="px-4 py-3 text-right">Divergentes</th>
                  <th className="px-4 py-3 text-right">Sem correspondência</th>
                  <th className="px-4 py-3 text-right">Valor líquido</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-700">{batch.fileName}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {batch.periodFrom && batch.periodTo ? `${batch.periodFrom} a ${batch.periodTo}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{batch.totalRows}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{batch.matchedRows}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-600">{batch.mismatchedRows}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-600">{batch.unmatchedRows}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency.format(batch.totalNetReceivedAmount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        aria-label={`Excluir importação ${batch.fileName}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:opacity-50"
                        disabled={deletingBatchId === batch.id}
                        onClick={() => void handleDeleteBatch(batch)}
                        title="Excluir importação"
                        type="button"
                      >
                        {deletingBatchId === batch.id ? (
                          <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        )}
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  Icon
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "rose" | "slate";
  Icon: typeof CheckCircle2;
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    rose: "bg-rose-50 text-rose-600 ring-rose-100",
    slate: "bg-slate-100 text-slate-600 ring-slate-200"
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${toneClass}`}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Settings,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyAdsPhase,
  type AdsPhase,
  type AdsClassification,
} from "@/lib/ads/classifyAdsPhase";
import type { AdvertisingSpend, SaleRecord } from "@/lib/metrics/contribution-margin";

// ────────────────────────────────────────────────────────────
// Tipos locais
// ────────────────────────────────────────────────────────────

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface AdsProductSettingsRow {
  id: string;
  organization_id: string;
  item_id: string;      // = seller_sku no contexto deste app
  title: string | null;
  breakeven_acos: number;
  meta_vendas_diaria: number;
  meta_tacos: number;
  ativo: boolean;
}

interface ComputedProduct {
  settings: AdsProductSettingsRow;
  sale: SaleRecord | null;
  adSpend: AdvertisingSpend | null;
  vendas_ads: number;
  // métricas derivadas
  gasto_ads: number;
  receita_ads: number;
  receita_total: number;
  vendas_total: number;
  impressoes: number;
  cliques: number;
  acos: number | null;
  tacos: number | null;
  taxa_organica: number | null;
  velocidade_vendas: number | null;
  classification: AdsClassification;
}

interface DailyMetricPoint {
  date: string;
  acos: number | null;
  tacos: number | null;
  taxa_organica: number | null;
}

// ────────────────────────────────────────────────────────────
// Helpers visuais
// ────────────────────────────────────────────────────────────

const FASE_LABEL: Record<AdsPhase, string> = {
  alerta: "Alerta",
  lancamento: "Lançamento",
  crescimento: "Crescimento",
  maturidade: "Maturidade",
  consolidado: "Consolidado",
  sem_dados: "Sem dados",
};

const FASE_CLASSES: Record<AdsPhase, string> = {
  alerta:      "bg-red-50 text-red-700 ring-red-200",
  lancamento:  "bg-orange-50 text-orange-700 ring-orange-200",
  crescimento: "bg-amber-50 text-amber-700 ring-amber-200",
  maturidade:  "bg-teal-50 text-teal-700 ring-teal-200",
  consolidado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sem_dados:   "bg-slate-100 text-slate-500 ring-slate-200",
};

function PhaseBadge({ fase }: { fase: AdsPhase }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${FASE_CLASSES[fase]}`}>
      {FASE_LABEL[fase]}
    </span>
  );
}

const fmtPct = (v: number | null) =>
  v === null ? "—" : `${v.toFixed(1)}%`;

const fmtNum = (v: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(v));

const fmtCur = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ────────────────────────────────────────────────────────────
// SVG mini-chart (sem dependências externas)
// ────────────────────────────────────────────────────────────

function MiniLineChart({ points }: { points: DailyMetricPoint[] }) {
  const W = 600;
  const H = 140;
  const PAD = { top: 12, right: 12, bottom: 24, left: 36 };
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

  type Series = { key: keyof DailyMetricPoint; color: string; label: string };
  const series: Series[] = [
    { key: "acos",        color: "#ef4444", label: "ACOS" },
    { key: "tacos",       color: "#f59e0b", label: "TACOS" },
    { key: "taxa_organica", color: "#10b981", label: "Org." },
  ];

  if (points.length < 2) {
    return (
      <div className="flex h-[140px] items-center justify-center text-xs text-slate-400">
        Dados insuficientes para o gráfico
      </div>
    );
  }

  // Normalise values
  const allVals = points.flatMap((p) =>
    series.map((s) => p[s.key] as number | null).filter((v): v is number => v !== null)
  );
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(100, ...allVals);
  const range = maxV - minV || 1;

  const scaleX = (i: number) => PAD.left + (i / (points.length - 1)) * inner.w;
  const scaleY = (v: number) => PAD.top + inner.h - ((v - minV) / range) * inner.h;

  function buildPath(key: keyof DailyMetricPoint) {
    const pts = points
      .map((p, i) => ({ x: scaleX(i), y: p[key] as number | null }))
      .filter((p): p is { x: number; y: number } => p.y !== null);
    if (pts.length < 2) return null;
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${scaleY(p.y)}`).join(" ");
  }

  // Tick labels (every ~7 days)
  const step = Math.max(1, Math.floor(points.length / 5));
  const ticks = points
    .map((p, i) => ({ i, label: p.date.slice(5) })) // MM-DD
    .filter((_, i) => i % step === 0 || i === points.length - 1);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-2xl"
        style={{ minWidth: 300, height: H }}
        aria-label="Gráfico de evolução ACOS/TACOS/Orgânico"
      >
        {/* grid lines */}
        {[0, 25, 50, 75, 100].map((pct) => {
          const y = scaleY(pct);
          if (y < PAD.top || y > PAD.top + inner.h) return null;
          return (
            <g key={pct}>
              <line x1={PAD.left} y1={y} x2={PAD.left + inner.w} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={PAD.left - 4} y={y + 4} fontSize="8" textAnchor="end" fill="#94a3b8">
                {pct}%
              </text>
            </g>
          );
        })}

        {/* series */}
        {series.map((s) => {
          const d = buildPath(s.key);
          return d ? (
            <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          ) : null;
        })}

        {/* x-axis ticks */}
        {ticks.map(({ i, label }) => (
          <text key={i} x={scaleX(i)} y={H - 4} fontSize="8" textAnchor="middle" fill="#94a3b8">
            {label}
          </text>
        ))}
      </svg>

      {/* legend */}
      <div className="mt-1 flex gap-4">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="inline-block h-1.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Modal de configuração
// ────────────────────────────────────────────────────────────

interface ConfigModalProps {
  initial: Partial<AdsProductSettingsRow> & { item_id: string; title?: string | null };
  organizationId: string;
  supabaseClient: SupabaseClient;
  onSaved: (row: AdsProductSettingsRow) => void;
  onClose: () => void;
}

function ConfigModal({ initial, organizationId, supabaseClient, onSaved, onClose }: ConfigModalProps) {
  const [form, setForm] = useState({
    breakeven_acos: String(initial.breakeven_acos ?? 30),
    meta_vendas_diaria: String(initial.meta_vendas_diaria ?? 1),
    meta_tacos: String(initial.meta_tacos ?? 10),
    ativo: initial.ativo ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = {
      organization_id: organizationId,
      item_id: initial.item_id,
      title: initial.title ?? initial.item_id,
      breakeven_acos: parseFloat(form.breakeven_acos) || 30,
      meta_vendas_diaria: parseFloat(form.meta_vendas_diaria) || 1,
      meta_tacos: parseFloat(form.meta_tacos) || 10,
      ativo: form.ativo,
      updated_at: new Date().toISOString(),
    };
    const { data, error: dbErr } = await supabaseClient
      .from("ads_product_settings")
      .upsert(payload, { onConflict: "organization_id,item_id" })
      .select()
      .maybeSingle();
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    if (data) onSaved(data as AdsProductSettingsRow);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <p className="text-xs text-slate-400 font-mono">{initial.item_id}</p>
            <h3 className="font-bold text-slate-900 leading-tight">{initial.title ?? initial.item_id}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Breakeven ACOS (%)
            <span className="text-[10px] font-normal normal-case text-slate-400">
              Igual à sua margem de contribuição líquida. Se a margem é 28%, coloque 28.
            </span>
            <input
              type="number" min="0" max="100" step="0.1"
              className="mt-1 h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-slate-900/20"
              value={form.breakeven_acos}
              onChange={(e) => setForm((f) => ({ ...f, breakeven_acos: e.target.value }))}
            />
          </label>

          <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Meta de vendas (unid./dia)
            <span className="text-[10px] font-normal normal-case text-slate-400">
              Quantas unidades por dia é o seu objetivo para este produto.
            </span>
            <input
              type="number" min="0" step="0.1"
              className="mt-1 h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-slate-900/20"
              value={form.meta_vendas_diaria}
              onChange={(e) => setForm((f) => ({ ...f, meta_vendas_diaria: e.target.value }))}
            />
          </label>

          <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Meta de TACOS (%)
            <span className="text-[10px] font-normal normal-case text-slate-400">
              Percentual máximo do faturamento total que você aceita gastar em ADS.
            </span>
            <input
              type="number" min="0" max="100" step="0.1"
              className="mt-1 h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-slate-900/20"
              value={form.meta_tacos}
              onChange={(e) => setForm((f) => ({ ...f, meta_tacos: e.target.value }))}
            />
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={form.ativo}
                onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
              />
              <div className={`h-6 w-10 rounded-full transition ${form.ativo ? "bg-slate-900" : "bg-slate-300"}`}>
                <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${form.ativo ? "left-5" : "left-1"}`} />
              </div>
            </div>
            <span className="text-sm font-semibold text-slate-700">Produto ativo para monitoramento</span>
          </label>
        </div>

        {error && (
          <p className="mx-4 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button
            onClick={onClose}
            className="h-9 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 rounded-lg bg-slate-900 px-5 text-sm font-bold text-white hover:bg-black disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Linha expansível da tabela
// ────────────────────────────────────────────────────────────

interface TableRowProps {
  product: ComputedProduct;
  expanded: boolean;
  onToggle: () => void;
  onConfig: () => void;
  supabaseClient: SupabaseClient;
  periodDays: number;
}

function AdsTableRow({ product, expanded, onToggle, onConfig, supabaseClient, periodDays }: TableRowProps) {
  const { settings, classification } = product;
  const [chartPoints, setChartPoints] = useState<DailyMetricPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);

  useEffect(() => {
    if (!expanded || chartPoints.length > 0) return;

    async function fetchHistory() {
      setLoadingChart(true);
      // Busca últimos 30 dias de advertising_metrics para este SKU
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceStr = since.toISOString().slice(0, 10);

      // Junta advertising_metrics → products por internal_sku = item_id
      const { data } = await supabaseClient
        .from("advertising_metrics")
        .select("metric_date, ad_spend_amount, attributed_revenue_amount, attributed_orders, products!inner(internal_sku)")
        .eq("products.internal_sku", settings.item_id)
        .gte("metric_date", sinceStr)
        .order("metric_date", { ascending: true });

      if (data) {
        // Agrupa por dia (pode ter múltiplas campanhas no mesmo dia)
        const byDate = new Map<string, { spend: number; revAds: number; ordersAds: number }>();
        for (const row of data as Array<{
          metric_date: string;
          ad_spend_amount: number;
          attributed_revenue_amount: number;
          attributed_orders: number;
        }>) {
          const cur = byDate.get(row.metric_date) ?? { spend: 0, revAds: 0, ordersAds: 0 };
          cur.spend += Number(row.ad_spend_amount ?? 0);
          cur.revAds += Number(row.attributed_revenue_amount ?? 0);
          cur.ordersAds += Number(row.attributed_orders ?? 0);
          byDate.set(row.metric_date, cur);
        }

        // Precisamos do total por dia para calcular TACOS e taxa_organica
        // sem dados de receita_total diária, TACOS = gasto / receita_ads (proxy)
        const points: DailyMetricPoint[] = Array.from(byDate.entries()).map(([date, v]) => ({
          date,
          acos: v.revAds > 0 ? (v.spend / v.revAds) * 100 : null,
          tacos: v.revAds > 0 ? (v.spend / v.revAds) * 100 : null, // proxy sem total
          taxa_organica: v.ordersAds > 0 ? Math.max(0, 100 - (v.ordersAds / Math.max(1, v.ordersAds + 1)) * 100) : null,
        }));

        setChartPoints(points);
      }
      setLoadingChart(false);
    }

    fetchHistory();
  }, [expanded, supabaseClient, settings.item_id, chartPoints.length]);

  const acosAlert = product.acos !== null && product.acos > settings.breakeven_acos;
  const velocidade = product.velocidade_vendas;
  const metaV = settings.meta_vendas_diaria;

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${
          classification.fase === "alerta" ? "bg-red-50/40" : ""
        }`}
        onClick={onToggle}
      >
        {/* Produto */}
        <td className="px-4 py-3">
          <p className="font-semibold text-slate-900 text-sm leading-tight">{settings.title ?? settings.item_id}</p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">{settings.item_id}</p>
        </td>

        {/* Fase */}
        <td className="px-4 py-3">
          <PhaseBadge fase={classification.fase} />
        </td>

        {/* ACOS */}
        <td className="px-4 py-3">
          <span className={`font-mono text-sm font-bold ${acosAlert ? "text-red-600" : "text-slate-700"}`}>
            {fmtPct(product.acos)}
          </span>
          {acosAlert && <AlertTriangle className="ml-1 inline h-3 w-3 text-red-500" />}
        </td>

        {/* Breakeven */}
        <td className="px-4 py-3 font-mono text-sm text-slate-500">{settings.breakeven_acos.toFixed(1)}%</td>

        {/* TACOS */}
        <td className="px-4 py-3 font-mono text-sm text-slate-700">{fmtPct(product.tacos)}</td>

        {/* Taxa orgânica */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-slate-700">{fmtPct(product.taxa_organica)}</span>
            {product.taxa_organica !== null && (
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, product.taxa_organica)}%` }}
                />
              </div>
            )}
          </div>
        </td>

        {/* Velocidade */}
        <td className="px-4 py-3">
          {velocidade !== null ? (
            <span className={`font-mono text-sm font-semibold ${velocidade >= metaV ? "text-emerald-600" : "text-amber-600"}`}>
              {velocidade.toFixed(2)}{" "}
              <span className="text-[10px] font-normal text-slate-400">/ {metaV.toFixed(1)} meta</span>
            </span>
          ) : (
            <span className="text-sm text-slate-400">—</span>
          )}
        </td>

        {/* Recomendação */}
        <td className="max-w-[200px] px-4 py-3">
          <p className="line-clamp-2 text-xs text-slate-600 leading-relaxed">{classification.recomendacao}</p>
        </td>

        {/* Ações */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onConfig(); }}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Configurar"
            >
              <Settings className="h-4 w-4" />
            </button>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </td>
      </tr>

      {/* Linha expandida */}
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50">
          <td colSpan={9} className="px-6 py-4">
            <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
              {/* KPIs rápidos */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Gasto ADS", value: fmtCur(product.gasto_ads) },
                  { label: "Receita ADS", value: fmtCur(product.receita_ads) },
                  { label: "Receita Total", value: fmtCur(product.receita_total) },
                  { label: "Unidades Vendidas", value: fmtNum(product.vendas_total) },
                  { label: "Vendas via ADS", value: fmtNum(product.vendas_ads) },
                  { label: "Impressões", value: fmtNum(product.impressoes) },
                  { label: "Cliques", value: fmtNum(product.cliques) },
                  { label: "Período", value: `${periodDays} dias` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{label}</p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {/* Gráfico de evolução */}
              <div className="min-w-[280px]">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Evolução 30 dias
                </p>
                {loadingChart ? (
                  <div className="flex h-[140px] items-center justify-center text-xs text-slate-400">
                    <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                    Carregando…
                  </div>
                ) : (
                  <MiniLineChart points={chartPoints} />
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Componente principal — AdsGestaoView
// ────────────────────────────────────────────────────────────

interface AdsGestaoViewProps {
  organization: Organization;
  supabaseClient: SupabaseClient;
  activeSales: SaleRecord[];
  realAdvertising: AdvertisingSpend[];
}

export function AdsGestaoView({
  organization,
  supabaseClient,
  activeSales,
  realAdvertising,
}: AdsGestaoViewProps) {
  // ── Estado ──
  const [settings, setSettings] = useState<AdsProductSettingsRow[]>([]);
  const [attributedOrdersBySku, setAttributedOrdersBySku] = useState<Map<string, number>>(new Map());
  const [periodDays, setPeriodDays] = useState(30);
  const [filterFase, setFilterFase] = useState<AdsPhase | "all">("all");
  const [search, setSearch] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [configModal, setConfigModal] = useState<{
    item_id: string;
    title?: string | null;
    existing?: AdsProductSettingsRow;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Carregar configurações do DB ──
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: dbErr } = await supabaseClient
      .from("ads_product_settings")
      .select("*")
      .eq("organization_id", organization.id)
      .order("item_id");
    if (dbErr) {
      setError(dbErr.message);
    } else {
      setSettings((data ?? []) as AdsProductSettingsRow[]);
    }
    setIsLoading(false);
    setLastUpdated(new Date());
  }, [supabaseClient, organization.id]);

  // ── Carregar vendas atribuídas ao ADS (attributed_orders) ──
  const loadAttributedOrders = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data } = await supabaseClient
      .from("advertising_metrics")
      .select("attributed_orders, products!inner(internal_sku)")
      .eq("organization_id", organization.id)
      .gte("metric_date", sinceStr);

    if (data) {
      const map = new Map<string, number>();
      type AdMetricJoinRow = {
        attributed_orders: number;
        products: Array<{ internal_sku: string }>;
      };
      for (const row of (data as unknown) as AdMetricJoinRow[]) {
        const sku = Array.isArray(row.products) ? row.products[0]?.internal_sku : null;
        if (!sku) continue;
        map.set(sku, (map.get(sku) ?? 0) + Number(row.attributed_orders ?? 0));
      }
      setAttributedOrdersBySku(map);
    }
  }, [supabaseClient, organization.id, periodDays]);

  useEffect(() => {
    loadSettings();
    loadAttributedOrders();
  }, [loadSettings, loadAttributedOrders]);

  // ── Computed products ──
  const computedProducts = useMemo<ComputedProduct[]>(() => {
    const salesBySku = new Map(activeSales.map((s) => [s.sku, s]));
    const adsBySku = new Map(realAdvertising.map((a) => [a.sku, a]));

    return settings
      .filter((s) => s.ativo)
      .map((s) => {
        const sale = salesBySku.get(s.item_id) ?? null;
        const adSpend = adsBySku.get(s.item_id) ?? null;
        const vendas_ads = attributedOrdersBySku.get(s.item_id) ?? 0;

        const gasto_ads = adSpend?.amount ?? 0;
        const receita_ads = adSpend?.attributedRevenue ?? 0;
        const receita_total = sale?.grossRevenue ?? 0;
        const vendas_total = sale?.units ?? 0;
        const impressoes = adSpend?.impressions ?? 0;
        const cliques = adSpend?.clicks ?? 0;

        const acos = receita_ads > 0 ? (gasto_ads / receita_ads) * 100 : null;
        const tacos = receita_total > 0 ? (gasto_ads / receita_total) * 100 : null;
        const taxa_organica =
          vendas_total > 0
            ? Math.max(0, ((vendas_total - vendas_ads) / vendas_total) * 100)
            : null;
        const velocidade_vendas = periodDays > 0 ? vendas_total / periodDays : null;

        const classification = classifyAdsPhase(
          { acos, tacos, taxa_organica, velocidade_vendas },
          {
            breakeven_acos: s.breakeven_acos,
            meta_vendas_diaria: s.meta_vendas_diaria,
            meta_tacos: s.meta_tacos,
          }
        );

        return {
          settings: s,
          sale,
          adSpend,
          vendas_ads,
          gasto_ads,
          receita_ads,
          receita_total,
          vendas_total,
          impressoes,
          cliques,
          acos,
          tacos,
          taxa_organica,
          velocidade_vendas,
          classification,
        };
      })
      .sort((a, b) => a.classification.urgencia - b.classification.urgencia);
  }, [settings, activeSales, realAdvertising, attributedOrdersBySku, periodDays]);

  // ── KPI cards ──
  const kpis = useMemo(() => {
    const totalGasto = computedProducts.reduce((s, p) => s + p.gasto_ads, 0);
    const totalReceita = computedProducts.reduce((s, p) => s + p.receita_total, 0);
    const tacosGeral = totalReceita > 0 ? (totalGasto / totalReceita) * 100 : null;
    const emAlerta = computedProducts.filter((p) => p.classification.fase === "alerta").length;
    const maduros = computedProducts.filter(
      (p) => p.classification.fase === "maturidade" || p.classification.fase === "consolidado"
    ).length;
    return { totalGasto, tacosGeral, emAlerta, maduros };
  }, [computedProducts]);

  // ── Filtro + busca ──
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return computedProducts.filter((p) => {
      if (filterFase !== "all" && p.classification.fase !== filterFase) return false;
      if (q) {
        const haystack = `${p.settings.item_id} ${p.settings.title ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [computedProducts, filterFase, search]);

  // ── Importar produtos com campanha ativa ──
  async function importActiveProducts() {
    setIsImporting(true);
    setError(null);
    try {
      // Busca SKUs que têm dados de advertising_metrics na org
      const { data, error: dbErr } = await supabaseClient
        .from("advertising_metrics")
        .select("products!inner(internal_sku, title)")
        .eq("organization_id", organization.id);

      if (dbErr) throw new Error(dbErr.message);

      type ImportJoinRow = {
        products: Array<{ internal_sku: string; title: string }>;
      };
      const skuSet = new Map<string, string>();
      for (const row of (data ?? []) as unknown as ImportJoinRow[]) {
        const prod = Array.isArray(row.products) ? row.products[0] : null;
        if (prod?.internal_sku) {
          skuSet.set(prod.internal_sku, prod.title ?? prod.internal_sku);
        }
      }

      if (skuSet.size === 0) {
        setError("Nenhum produto com campanha ativa encontrado. Sincronize a publicidade primeiro.");
        return;
      }

      const existingSkus = new Set(settings.map((s) => s.item_id));
      const toInsert = Array.from(skuSet.entries())
        .filter(([sku]) => !existingSkus.has(sku))
        .map(([sku, title]) => ({
          organization_id: organization.id,
          item_id: sku,
          title,
          breakeven_acos: 30,
          meta_vendas_diaria: 1,
          meta_tacos: 10,
          ativo: true,
        }));

      if (toInsert.length === 0) {
        setError("Todos os produtos com campanha já estão configurados.");
        return;
      }

      const { error: insErr } = await supabaseClient
        .from("ads_product_settings")
        .insert(toInsert);

      if (insErr) throw new Error(insErr.message);

      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar produtos.");
    } finally {
      setIsImporting(false);
    }
  }

  // ── Helpers de tempo ──
  const lastUpdatedLabel = lastUpdated
    ? (() => {
        const mins = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
        if (mins < 1) return "agora";
        if (mins < 60) return `há ${mins} min`;
        return `há ${Math.floor(mins / 60)}h`;
      })()
    : null;

  const PHASES: Array<AdsPhase | "all"> = ["all", "alerta", "lancamento", "crescimento", "maturidade", "consolidado", "sem_dados"];
  const PHASE_FILTER_LABEL: Record<AdsPhase | "all", string> = {
    all: "Todas",
    alerta: "Alerta",
    lancamento: "Lançamento",
    crescimento: "Crescimento",
    maturidade: "Maturidade",
    consolidado: "Consolidado",
    sem_dados: "Sem dados",
  };

  // ── Estado vazio (onboarding) ──
  if (!isLoading && settings.length === 0) {
    return (
      <section className="flex flex-col items-center justify-center gap-6 py-24 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-2xl bg-slate-100 text-slate-400">
          <BarChart3 className="h-10 w-10" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900">Nenhum produto configurado</h3>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Adicione seus produtos anunciados para começar a monitorar as fases de ADS e receber
            recomendações automáticas de ação.
          </p>
        </div>
        <button
          onClick={importActiveProducts}
          disabled={isImporting}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-6 text-sm font-bold text-white hover:bg-black disabled:opacity-50"
        >
          <Zap className="h-4 w-4" />
          {isImporting ? "Importando…" : "Importar produtos com campanha ativa"}
        </button>
        {error && (
          <p className="max-w-sm rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        )}
      </section>
    );
  }

  // ── Layout principal ──
  return (
    <div className="flex flex-col gap-5">
      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setPeriodDays(d)}
              className={`h-8 rounded-lg px-3 text-xs font-bold ring-1 transition ${
                periodDays === d
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {d} dias
            </button>
          ))}
          {lastUpdatedLabel && (
            <span className="text-[11px] text-slate-400">Atualizado {lastUpdatedLabel}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadSettings(); loadAttributedOrders(); }}
            disabled={isLoading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white hover:bg-black disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={importActiveProducts}
            disabled={isImporting}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            {isImporting ? "Importando…" : "Importar produtos"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gasto em ADS</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{fmtCur(kpis.totalGasto)}</p>
          <p className="mt-0.5 text-xs text-slate-400">{periodDays} dias</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TACOS médio geral</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {kpis.tacosGeral !== null ? `${kpis.tacosGeral.toFixed(1)}%` : "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">do portfólio</p>
        </div>

        <div className={`rounded-xl border p-4 shadow-sm ${kpis.emAlerta > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${kpis.emAlerta > 0 ? "text-red-400" : "text-slate-400"}`}>
            Produtos em Alerta
          </p>
          <p className={`mt-1 text-2xl font-black ${kpis.emAlerta > 0 ? "text-red-700" : "text-slate-900"}`}>
            {kpis.emAlerta}
          </p>
          <p className={`mt-0.5 text-xs ${kpis.emAlerta > 0 ? "text-red-400" : "text-slate-400"}`}>
            {kpis.emAlerta > 0 ? "ACOS acima do breakeven" : "Nenhum em alerta"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Maturidade + Consolidado</p>
          <p className="mt-1 text-2xl font-black text-emerald-700">{kpis.maduros}</p>
          <p className="mt-0.5 text-xs text-slate-400">produtos maduros</p>
        </div>
      </div>

      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por nome ou SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 rounded-lg border border-slate-200 bg-white pl-3 pr-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/20"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {PHASES.map((fase) => (
            <button
              key={fase}
              onClick={() => setFilterFase(fase)}
              className={`h-7 rounded-full px-3 text-xs font-semibold ring-1 transition ${
                filterFase === fase
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {PHASE_FILTER_LABEL[fase]}
              {fase !== "all" && (
                <span className="ml-1 opacity-60">
                  ({computedProducts.filter((p) => p.classification.fase === fase).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <TrendingUp className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500">Nenhum produto encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Fase</th>
                  <th className="px-4 py-3">ACOS</th>
                  <th className="px-4 py-3">Breakeven</th>
                  <th className="px-4 py-3">TACOS</th>
                  <th className="px-4 py-3">Taxa Org.</th>
                  <th className="px-4 py-3">Velocidade</th>
                  <th className="px-4 py-3">Recomendação</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <AdsTableRow
                    key={product.settings.item_id}
                    product={product}
                    expanded={expandedRows.has(product.settings.item_id)}
                    onToggle={() =>
                      setExpandedRows((prev) => {
                        const next = new Set(prev);
                        if (next.has(product.settings.item_id)) next.delete(product.settings.item_id);
                        else next.add(product.settings.item_id);
                        return next;
                      })
                    }
                    onConfig={() =>
                      setConfigModal({
                        item_id: product.settings.item_id,
                        title: product.settings.title,
                        existing: product.settings,
                      })
                    }
                    supabaseClient={supabaseClient}
                    periodDays={periodDays}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de configuração */}
      {configModal && (
        <ConfigModal
          initial={{
            item_id: configModal.item_id,
            title: configModal.title,
            ...(configModal.existing ?? {}),
          }}
          organizationId={organization.id}
          supabaseClient={supabaseClient}
          onSaved={(row) => {
            setSettings((prev) => {
              const idx = prev.findIndex((s) => s.item_id === row.item_id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = row;
                return next;
              }
              return [...prev, row];
            });
          }}
          onClose={() => setConfigModal(null)}
        />
      )}
    </div>
  );
}

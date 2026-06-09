"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  BrainCircuit,
  Cable,
  ChevronsLeft,
  ChevronsRight,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Megaphone,
  PackageCheck,
  PackagePlus,
  Scale,
  ShieldAlert,
  Target,
  WalletCards
} from "lucide-react";

export type ViewKey =
  | "principal"
  | "ia"
  | "produtos"
  | "vendas"
  | "custos"
  | "estoque"
  | "estoque_fisico"
  | "ads"
  | "ads_analysis"
  | "ads_gestao"
  | "pos_venda"
  | "conector"
  | "conciliacao"
  | "financeiro_empresa"
  | "financeiro_pessoal";

export const views: Array<{ key: ViewKey; label: string; icon: typeof BarChart3 }> = [
  { key: "principal", label: "Principal", icon: LayoutDashboard },
  { key: "ia", label: "Análise IA", icon: BrainCircuit },
  { key: "produtos", label: "Produtos", icon: PackageCheck },
  { key: "vendas", label: "Vendas", icon: ClipboardList },
  { key: "financeiro_empresa", label: "Financeiro Empresa", icon: CircleDollarSign },
  { key: "financeiro_pessoal", label: "Financeiro Pessoal", icon: WalletCards },
  { key: "custos", label: "Centro de custos", icon: WalletCards },
  { key: "estoque", label: "Estoque Full", icon: Boxes },
  { key: "estoque_fisico", label: "Estoque Físico", icon: PackagePlus },
  { key: "ads", label: "Publicidade", icon: Megaphone },
  { key: "ads_analysis", label: "Análise de Anúncios", icon: Target },
  { key: "ads_gestao", label: "Gestão de ADS", icon: BarChart3 },
  { key: "pos_venda", label: "Pós-venda", icon: ShieldAlert },
  { key: "conector", label: "Conector ativo", icon: Cable },
  { key: "conciliacao", label: "Conciliação", icon: Scale }
];

const groups: Array<{ label: string; keys: ViewKey[] }> = [
  { label: "Visão Geral", keys: ["principal", "ia"] },
  { label: "Operações", keys: ["produtos", "vendas", "custos", "estoque", "estoque_fisico"] },
  { label: "Marketing", keys: ["ads", "ads_analysis", "ads_gestao"] },
  { label: "Pós-venda", keys: ["pos_venda"] },
  { label: "Financeiro", keys: ["financeiro_empresa", "financeiro_pessoal", "conciliacao"] },
  { label: "Integrações", keys: ["conector"] }
];

const COLLAPSE_STORAGE_KEY = "dashmarket:sidebar-collapsed";

interface SidebarProps {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
  badges?: Partial<Record<ViewKey, number>>;
}

export function Sidebar({ activeView, onViewChange, badges }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (stored != null) {
      setCollapsed(stored === "true");
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  };

  const viewMap = Object.fromEntries(views.map((v) => [v.key, v])) as Record<
    ViewKey,
    (typeof views)[number]
  >;

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 ${
        collapsed ? "w-[72px]" : "w-[224px]"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-xs font-black text-white">
          DM
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-slate-900">DASHMARKET</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Intelligence & Growth
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <span className="block px-2 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400/70">
                {group.label}
              </span>
            )}
            <div className="flex flex-col gap-1">
              {group.keys.map((key) => {
                const view = viewMap[key];
                return (
                  <ModuleButton
                    key={key}
                    view={view}
                    activeView={activeView}
                    collapsed={collapsed}
                    onClick={onViewChange}
                    badge={badges?.[key]}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-2">
        <button
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-slate-500 ring-1 ring-transparent transition hover:bg-slate-100 hover:text-slate-900"
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          type="button"
        >
          {collapsed ? (
            <ChevronsRight aria-hidden className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronsLeft aria-hidden className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold">Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function ModuleButton({
  view,
  activeView,
  collapsed,
  onClick,
  badge
}: {
  view: (typeof views)[number];
  activeView: ViewKey;
  collapsed: boolean;
  onClick: (view: ViewKey) => void;
  badge?: number;
}) {
  const Icon = view.icon;
  const isActive = activeView === view.key;

  return (
    <button
      className={`relative flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold ring-1 transition-all duration-200 ${
        collapsed ? "justify-center" : ""
      } ${
        isActive
          ? "bg-slate-900 text-white ring-slate-900/10 shadow-card"
          : "bg-transparent text-slate-500 ring-transparent hover:bg-slate-100 hover:text-slate-900"
      }`}
      onClick={() => onClick(view.key)}
      title={collapsed ? view.label : undefined}
      type="button"
    >
      <Icon aria-hidden className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{view.label}</span>}
      {badge != null && badge > 0 && (
        <span
          className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-sea px-1 text-[10px] font-bold text-white ${
            collapsed ? "absolute -right-1 -top-1" : "ml-auto"
          }`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

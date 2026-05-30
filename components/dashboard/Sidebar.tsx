"use client";

import {
  BarChart3,
  Boxes,
  BrainCircuit,
  Cable,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Megaphone,
  PackageCheck,
  PackagePlus,
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
  | "conector"
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
  { key: "conector", label: "Conector ativo", icon: Cable }
];

const groups: Array<{ label: string; keys: ViewKey[] }> = [
  { label: "Visão Geral", keys: ["principal", "ia"] },
  { label: "Operações", keys: ["produtos", "vendas", "custos", "estoque", "estoque_fisico"] },
  { label: "Marketing", keys: ["ads", "ads_analysis"] },
  { label: "Financeiro", keys: ["financeiro_empresa", "financeiro_pessoal"] },
  { label: "Integrações", keys: ["conector"] }
];

interface SidebarProps {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
  badges?: Partial<Record<ViewKey, number>>;
}

export function Sidebar({ activeView, onViewChange, badges }: SidebarProps) {
  const viewMap = Object.fromEntries(views.map((v) => [v.key, v])) as Record<
    ViewKey,
    (typeof views)[number]
  >;

  return (
    <nav className="flex flex-wrap items-start gap-x-2 gap-y-3 pb-4">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-wrap items-center gap-1.5">
          <span className="w-full px-1 text-[9px] font-bold uppercase tracking-widest text-slate-400/70">
            {group.label}
          </span>
          {group.keys.map((key) => {
            const view = viewMap[key];
            return (
              <ModuleButton
                key={key}
                view={view}
                activeView={activeView}
                onClick={onViewChange}
                badge={badges?.[key]}
              />
            );
          })}
          <div className="mx-1 hidden h-6 w-px bg-slate-200/60 sm:block" />
        </div>
      ))}
    </nav>
  );
}

function ModuleButton({
  view,
  activeView,
  onClick,
  badge
}: {
  view: (typeof views)[number];
  activeView: ViewKey;
  onClick: (view: ViewKey) => void;
  badge?: number;
}) {
  const Icon = view.icon;
  const isActive = activeView === view.key;

  return (
    <button
      className={`relative flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold ring-1 transition-all duration-200 ${
        isActive
          ? "bg-white text-slate-900 ring-slate-300/50 shadow-card"
          : "bg-transparent text-slate-500 ring-transparent hover:bg-slate-200/50 hover:text-slate-900"
      }`}
      onClick={() => onClick(view.key)}
      type="button"
    >
      <Icon aria-hidden className="h-4 w-4 shrink-0" />
      <span>{view.label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-sea px-1 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

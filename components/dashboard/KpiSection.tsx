"use client";

import { LucideIcon, TrendingDown, TrendingUp, Minus } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "sea" | "moss" | "clay" | "berry" | "positive" | "neutral" | "warning" | "critical" | string;
  trend?: "up" | "down" | "neutral";
  delta?: string;
}

export function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "sea",
  trend,
  delta
}: KpiCardProps) {
  const toneMap: Record<string, string> = {
    sea: "bg-slate-50 text-slate-600 ring-slate-100",
    moss: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    clay: "bg-amber-50 text-amber-600 ring-amber-100",
    berry: "bg-rose-50 text-rose-600 ring-rose-100",
    positive: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    neutral: "bg-slate-50 text-slate-600 ring-slate-100",
    warning: "bg-amber-50 text-amber-600 ring-amber-100",
    critical: "bg-rose-50 text-rose-600 ring-rose-100"
  };
  const toneClass = toneMap[tone] ?? toneMap.sea;

  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const trendColor =
    trend === "up"
      ? "text-emerald-500"
      : trend === "down"
        ? "text-rose-500"
        : "text-slate-400";

  return (
    <section className="cursor-pointer rounded-xl border border-slate-200/60 bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {title}
          </p>
          <p className="font-data mt-1 text-2xl font-bold tracking-tight text-ink">
            {value}
          </p>
          {(trend || delta) && (
            <div className={`mt-1 flex items-center gap-1 ${trendColor}`}>
              <TrendIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              {delta && (
                <span className="font-data text-xs font-semibold">{delta}</span>
              )}
            </div>
          )}
        </div>
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${toneClass}`}
        >
          <Icon aria-hidden className="h-6 w-6" />
        </div>
      </div>
      <p className="mt-4 text-xs font-medium text-slate-500/80">{detail}</p>
    </section>
  );
}

interface KpiSectionProps {
  children: React.ReactNode;
}

export function KpiSection({ children }: KpiSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

export function SkeletonKpiCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200/60 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="h-2.5 w-20 rounded bg-slate-200" />
          <div className="mt-3 h-7 w-28 rounded bg-slate-200" />
          <div className="mt-2 h-2.5 w-12 rounded bg-slate-200" />
        </div>
        <div className="h-12 w-12 rounded-xl bg-slate-200" />
      </div>
      <div className="mt-4 h-2.5 w-32 rounded bg-slate-200" />
    </div>
  );
}

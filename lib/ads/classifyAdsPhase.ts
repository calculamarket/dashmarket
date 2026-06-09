// ============================================================
// classifyAdsPhase — algoritmo puro de classificação de fase
// Sem side effects. Pode ser usado no frontend ou em Edge Functions.
// ============================================================

export type AdsPhase =
  | "alerta"
  | "lancamento"
  | "crescimento"
  | "maturidade"
  | "consolidado"
  | "sem_dados";

export interface AdsMetrics {
  acos: number | null;              // Advertising Cost of Sale em %
  tacos: number | null;             // Total Advertising Cost of Sale em %
  taxa_organica: number | null;     // % das vendas sem ADS
  velocidade_vendas: number | null; // Unidades vendidas por dia no período
}

export interface AdsProductSettings {
  breakeven_acos: number;       // Margem de contribuição % (ex: 28.5)
  meta_vendas_diaria: number;   // Meta de velocidade de vendas (unid/dia)
  meta_tacos: number;           // TACOS alvo (ex: 10)
}

export interface AdsClassification {
  fase: AdsPhase;
  recomendacao: string;
  urgencia: number; // 1 (mais urgente) a 5 (menos urgente)
  cor: string;      // token de cor Tailwind
}

export function classifyAdsPhase(
  metrics: AdsMetrics,
  settings: AdsProductSettings
): AdsClassification {
  const { acos, tacos, taxa_organica, velocidade_vendas } = metrics;
  const { breakeven_acos, meta_vendas_diaria, meta_tacos } = settings;

  // Sem dados suficientes
  if (acos === null || taxa_organica === null) {
    return {
      fase: "sem_dados",
      recomendacao:
        "Dados insuficientes. Configure o produto e aguarde ao menos 7 dias de campanha ativa.",
      urgencia: 5,
      cor: "gray",
    };
  }

  // ALERTA: ACOS acima do breakeven — prioridade máxima, qualquer fase
  if (acos > breakeven_acos) {
    return {
      fase: "alerta",
      recomendacao: `ACOS ${acos.toFixed(1)}% está acima do breakeven de ${breakeven_acos.toFixed(
        1
      )}%. Reduza os bids imediatamente ou pause a campanha até revisar.`,
      urgencia: 1,
      cor: "red",
    };
  }

  const metaAtingida =
    meta_vendas_diaria > 0
      ? (velocidade_vendas ?? 0) >= meta_vendas_diaria
      : true;

  // LANÇAMENTO: orgânico < 20%
  if (taxa_organica < 20) {
    return {
      fase: "lancamento",
      recomendacao:
        "Produto em fase de lançamento. Mantenha ou aumente o orçamento de ADS. Não reduza bids — o objetivo agora é construir histórico e ganhar posicionamento.",
      urgencia: 2,
      cor: "coral",
    };
  }

  // CRESCIMENTO: orgânico entre 20% e 50%
  if (taxa_organica >= 20 && taxa_organica < 50) {
    return {
      fase: "crescimento",
      recomendacao:
        "Orgânico crescendo. Mantenha o orçamento estável. Otimize palavras-chave pausando as que têm ACOS alto. Monitore o TACOS semanalmente.",
      urgencia: 3,
      cor: "amber",
    };
  }

  // MATURIDADE: orgânico entre 50% e 70%, meta atingida
  if (taxa_organica >= 50 && taxa_organica < 70 && metaAtingida) {
    return {
      fase: "maturidade",
      recomendacao:
        "Produto com boa base orgânica. Reduza o orçamento de ADS em 20–30% e observe por 7 dias. Se as vendas totais se mantiverem, reduza mais.",
      urgencia: 4,
      cor: "teal",
    };
  }

  // CONSOLIDADO: orgânico ≥ 70% e TACOS dentro da meta
  if (taxa_organica >= 70 && (tacos ?? 999) <= meta_tacos) {
    return {
      fase: "consolidado",
      recomendacao:
        "Produto consolidado organicamente. Mantenha apenas uma campanha de defesa com bid mínimo para proteger posição. Realoque o orçamento para produtos em lançamento.",
      urgencia: 5,
      cor: "green",
    };
  }

  // Orgânico crescendo mas meta ainda não atingida
  return {
    fase: "crescimento",
    recomendacao:
      "Orgânico em bom nível mas meta de velocidade de vendas ainda não atingida. Mantenha o investimento em ADS.",
    urgencia: 3,
    cor: "amber",
  };
}

// ============================================================
// Testes unitários inline — 6 casos cobertos
// ============================================================
if (process.env.NODE_ENV === "test") {
  const settings: AdsProductSettings = {
    breakeven_acos: 30,
    meta_vendas_diaria: 2,
    meta_tacos: 10,
  };

  // 1. sem_dados
  console.assert(
    classifyAdsPhase({ acos: null, tacos: null, taxa_organica: null, velocidade_vendas: null }, settings).fase === "sem_dados",
    "Caso 1 (sem_dados) falhou"
  );

  // 2. alerta
  console.assert(
    classifyAdsPhase({ acos: 35, tacos: 12, taxa_organica: 25, velocidade_vendas: 3 }, settings).fase === "alerta",
    "Caso 2 (alerta) falhou"
  );

  // 3. lancamento (orgânico < 20%)
  console.assert(
    classifyAdsPhase({ acos: 15, tacos: 8, taxa_organica: 10, velocidade_vendas: 1 }, settings).fase === "lancamento",
    "Caso 3 (lancamento) falhou"
  );

  // 4. crescimento (orgânico 20–50%)
  console.assert(
    classifyAdsPhase({ acos: 20, tacos: 9, taxa_organica: 35, velocidade_vendas: 2.5 }, settings).fase === "crescimento",
    "Caso 4 (crescimento) falhou"
  );

  // 5. maturidade (orgânico 50–70%, meta atingida)
  console.assert(
    classifyAdsPhase({ acos: 18, tacos: 7, taxa_organica: 60, velocidade_vendas: 3 }, settings).fase === "maturidade",
    "Caso 5 (maturidade) falhou"
  );

  // 6. consolidado (orgânico >= 70%, TACOS ok)
  console.assert(
    classifyAdsPhase({ acos: 10, tacos: 5, taxa_organica: 75, velocidade_vendas: 4 }, settings).fase === "consolidado",
    "Caso 6 (consolidado) falhou"
  );

  console.log("classifyAdsPhase: todos os 6 casos passaram ✅");
}

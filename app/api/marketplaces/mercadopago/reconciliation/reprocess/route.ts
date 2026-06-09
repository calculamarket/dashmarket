import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function extractErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown };
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
    if (typeof candidate.details === "string" && candidate.details.trim()) return candidate.details;
  }
  return fallback;
}

type PaymentImportRow = {
  id: string;
  ml_order_id: string | null;
  gross_amount: number;
  shipping_cost_amount: number;
};

type OrderRow = {
  id: string;
  provider_order_id: string;
  gross_amount: number;
  shipping_cost_amount: number;
};

const AMOUNT_TOLERANCE = 0.05;

// Re-processa o cruzamento de todos os lotes de uma organização
// (ou de um lote específico via batchId) contra os pedidos já sincronizados.
// Útil quando os pedidos foram sincronizados APÓS a importação do extrato MP.
export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Configuração do Supabase ausente no servidor." },
        { status: 500 }
      );
    }

    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "Sessão é obrigatória." }, { status: 401 });
    }

    const body = (await request.json()) as {
      organizationId?: string;
      batchId?: string;
    };
    const organizationId = body.organizationId;
    const batchId = body.batchId ?? null; // null = re-processar todos os lotes

    if (!organizationId) {
      return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
    }

    // Busca todas as linhas de pagamento da organização (ou do lote específico)
    let importsQuery = supabase
      .from("mp_payment_imports")
      .select("id, ml_order_id, gross_amount, shipping_cost_amount")
      .eq("organization_id", organizationId);

    if (batchId) {
      importsQuery = importsQuery.eq("batch_id", batchId);
    }

    const { data: imports, error: importsError } = await importsQuery;
    if (importsError) throw importsError;
    if (!imports || imports.length === 0) {
      return NextResponse.json({ updated: 0, matched: 0, mismatched: 0, unmatched: 0 });
    }

    const paymentRows = imports as PaymentImportRow[];

    // Coleta os ml_order_ids únicos com valor
    const mlOrderIds = Array.from(
      new Set(
        paymentRows
          .map((row) => row.ml_order_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    // Busca os pedidos correspondentes no Supabase (em lotes de 200)
    const ordersByProviderId = new Map<string, OrderRow>();
    const chunkSize = 200;
    for (let offset = 0; offset < mlOrderIds.length; offset += chunkSize) {
      const chunk = mlOrderIds.slice(offset, offset + chunkSize);
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id, provider_order_id, gross_amount, shipping_cost_amount")
        .eq("organization_id", organizationId)
        .in("provider_order_id", chunk);
      if (ordersError) throw ordersError;
      for (const order of (orders ?? []) as OrderRow[]) {
        ordersByProviderId.set(order.provider_order_id, order);
      }
    }

    // Recalcula o match_status para cada linha e atualiza em lote
    let totalUpdated = 0;
    let matched = 0;
    let mismatched = 0;
    let unmatched = 0;

    const updateChunkSize = 50;
    for (let i = 0; i < paymentRows.length; i += updateChunkSize) {
      const chunk = paymentRows.slice(i, i + updateChunkSize);

      for (const row of chunk) {
        const order = row.ml_order_id
          ? ordersByProviderId.get(row.ml_order_id) ?? null
          : null;

        let matchStatus: "matched" | "amount_mismatch" | "unmatched";
        let amountDifference = 0;
        let orderShippingCost: number | null = null;
        let shippingDifference = 0;

        if (order) {
          amountDifference = Number((row.gross_amount - order.gross_amount).toFixed(2));
          orderShippingCost = Number((order.shipping_cost_amount ?? 0).toFixed(2));
          const mpShippingAbs = Math.abs(Number(row.shipping_cost_amount ?? 0));
          shippingDifference = Number((orderShippingCost - mpShippingAbs).toFixed(2));

          if (Math.abs(amountDifference) <= AMOUNT_TOLERANCE) {
            matchStatus = "matched";
            matched++;
          } else {
            matchStatus = "amount_mismatch";
            mismatched++;
          }
        } else {
          matchStatus = "unmatched";
          unmatched++;
        }

        const { error: updateError } = await supabase
          .from("mp_payment_imports")
          .update({
            matched_order_id: order?.id ?? null,
            match_status: matchStatus,
            amount_difference: amountDifference,
            order_shipping_cost: orderShippingCost,
            shipping_difference: shippingDifference
          })
          .eq("id", row.id);

        if (updateError) throw updateError;
        totalUpdated++;
      }
    }

    // Atualiza os totais nos lotes afetados
    const affectedBatchIds = batchId
      ? [batchId]
      : Array.from(
          new Set(
            (
              await supabase
                .from("mp_payment_imports")
                .select("batch_id")
                .eq("organization_id", organizationId)
            ).data?.map((r) => (r as { batch_id: string }).batch_id) ?? []
          )
        );

    for (const bid of affectedBatchIds) {
      const { data: batchRows } = await supabase
        .from("mp_payment_imports")
        .select("match_status, gross_amount, net_received_amount, shipping_difference")
        .eq("batch_id", bid);

      if (!batchRows) continue;

      const batchStats = (batchRows as Array<{
        match_status: string;
        gross_amount: number;
        net_received_amount: number;
        shipping_difference: number;
      }>).reduce(
        (acc, r) => ({
          matched: acc.matched + (r.match_status === "matched" ? 1 : 0),
          mismatched: acc.mismatched + (r.match_status === "amount_mismatch" ? 1 : 0),
          unmatched: acc.unmatched + (r.match_status === "unmatched" ? 1 : 0),
          totalGross: acc.totalGross + Number(r.gross_amount ?? 0),
          totalNet: acc.totalNet + Number(r.net_received_amount ?? 0),
          totalShippingDiff: acc.totalShippingDiff + Number(r.shipping_difference ?? 0)
        }),
        { matched: 0, mismatched: 0, unmatched: 0, totalGross: 0, totalNet: 0, totalShippingDiff: 0 }
      );

      await supabase
        .from("mp_reconciliation_batches")
        .update({
          matched_rows: batchStats.matched,
          mismatched_rows: batchStats.mismatched,
          unmatched_rows: batchStats.unmatched,
          total_gross_amount: Number(batchStats.totalGross.toFixed(2)),
          total_net_received_amount: Number(batchStats.totalNet.toFixed(2)),
          total_shipping_difference: Number(batchStats.totalShippingDiff.toFixed(2))
        })
        .eq("id", bid);
    }

    return NextResponse.json({ updated: totalUpdated, matched, mismatched, unmatched });
  } catch (error) {
    const message = extractErrorMessage(error, "Erro ao re-processar a conciliação.");
    console.error("[mercadopago/reconciliation/reprocess] POST falhou:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

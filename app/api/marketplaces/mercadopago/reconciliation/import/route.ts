import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

function extractErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error_description?: unknown; details?: unknown };
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error_description === "string" && candidate.error_description.trim()) {
      return candidate.error_description;
    }
    if (typeof candidate.details === "string" && candidate.details.trim()) return candidate.details;
  }
  return fallback;
}

type OrderRow = {
  id: string;
  provider_order_id: string;
  gross_amount: number;
  shipping_cost_amount: number;
};

type ParsedRow = {
  ml_order_id: string | null;
  mp_operation_id: string | null;
  external_reference: string | null;
  item_id: string | null;
  seller_sku: string | null;
  description: string | null;
  status: string | null;
  status_detail: string | null;
  operation_type: string | null;
  purchase_date: string | null;
  approved_date: string | null;
  released_date: string | null;
  gross_amount: number;
  mercadopago_fee_amount: number;
  marketplace_fee_amount: number;
  shipping_cost_amount: number;
  coupon_fee_amount: number;
  net_received_amount: number;
  refunded_amount: number;
  installments: number | null;
  payment_type: string | null;
  raw_payload: Record<string, unknown>;
};

const COLUMN_ALIASES: Record<keyof Omit<ParsedRow, "raw_payload">, string[]> = {
  ml_order_id: ["Número da venda no Mercado Livre", "order_id"],
  mp_operation_id: ["Número da transação do Mercado Pago", "operation_id"],
  external_reference: ["Código de referência", "external_reference"],
  item_id: ["Código do produto", "item_id"],
  seller_sku: ["SKU do produto", "seller_custom_field"],
  description: ["Descrição da operação", "reason"],
  status: ["Status da operação", "status"],
  status_detail: ["Detalhe do status da operação", "status_detail"],
  operation_type: ["Tipo de operação", "operation_type"],
  purchase_date: ["Data da compra", "date_created"],
  approved_date: ["Data de creditação", "date_approved"],
  released_date: ["Data de liberação do dinheiro", "date_released"],
  gross_amount: ["Valor do produto", "transaction_amount"],
  mercadopago_fee_amount: ["Tarifa do Mercado Pago", "mercadopago_fee"],
  marketplace_fee_amount: ["Tarifa pelo uso da plataforma de terceiros", "marketplace_fee"],
  shipping_cost_amount: ["Frete", "shipping_cost"],
  coupon_fee_amount: ["Desconto para a sua contraparte", "coupon_fee"],
  net_received_amount: ["Valor total recebido", "net_received_amount"],
  refunded_amount: ["Valor devolvido", "amount_refunded"],
  installments: ["Parcelas", "installments"],
  payment_type: ["Meio de pagamento", "payment_type"]
};

const AMOUNT_TOLERANCE = 0.05;

function findColumnKey(headerRow: string[], aliases: string[]) {
  const normalized = headerRow.map((header) => header.trim().toLowerCase());
  for (const alias of aliases) {
    const aliasNormalized = alias.trim().toLowerCase();
    const index = normalized.findIndex(
      (header) => header === aliasNormalized || header.startsWith(`${aliasNormalized} (`)
    );
    if (index >= 0) return index;
  }
  return -1;
}

function toNumber(value: unknown) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric;
  const fallback = Number(String(value).trim());
  return Number.isFinite(fallback) ? fallback : 0;
}

function toDateIso(value: unknown) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (brMatch) {
    const [, day, month, year, hour, minute, second] = brMatch;
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function parseWorkbook(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  if (rows.length < 2) return [];

  const headerRow = (rows[0] as unknown[]).map((cell) => String(cell ?? ""));
  const columnIndexes = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([field, aliases]) => [field, findColumnKey(headerRow, aliases)])
  ) as Record<keyof Omit<ParsedRow, "raw_payload">, number>;

  const parsed: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] as unknown[];
    if (!row || row.every((cell) => cell == null || cell === "")) continue;

    const record: Record<string, unknown> = {};
    headerRow.forEach((header, index) => {
      if (header) record[header] = row[index] ?? null;
    });

    const get = (field: keyof Omit<ParsedRow, "raw_payload">) => {
      const index = columnIndexes[field];
      return index >= 0 ? row[index] : null;
    };

    const entry: ParsedRow = {
      ml_order_id: toText(get("ml_order_id")),
      mp_operation_id: toText(get("mp_operation_id")),
      external_reference: toText(get("external_reference")),
      item_id: toText(get("item_id")),
      seller_sku: toText(get("seller_sku")),
      description: toText(get("description")),
      status: toText(get("status")),
      status_detail: toText(get("status_detail")),
      operation_type: toText(get("operation_type")),
      purchase_date: toDateIso(get("purchase_date")),
      approved_date: toDateIso(get("approved_date")),
      released_date: toDateIso(get("released_date")),
      gross_amount: toNumber(get("gross_amount")),
      mercadopago_fee_amount: toNumber(get("mercadopago_fee_amount")),
      marketplace_fee_amount: toNumber(get("marketplace_fee_amount")),
      shipping_cost_amount: toNumber(get("shipping_cost_amount")),
      coupon_fee_amount: toNumber(get("coupon_fee_amount")),
      net_received_amount: toNumber(get("net_received_amount")),
      refunded_amount: toNumber(get("refunded_amount")),
      installments: (() => {
        const raw = get("installments");
        const numeric = toNumber(raw);
        return raw == null ? null : Math.round(numeric);
      })(),
      payment_type: toText(get("payment_type")),
      raw_payload: record
    };

    if (!entry.ml_order_id && !entry.mp_operation_id) continue;
    parsed.push(entry);
  }

  return parsed;
}

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

    const formData = await request.formData();
    const organizationId = String(formData.get("organizationId") ?? "");
    const file = formData.get("file");

    if (!organizationId) {
      return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione um arquivo CSV ou XLSX." }, { status: 400 });
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

    const buffer = await file.arrayBuffer();
    let parsedRows: ParsedRow[];
    try {
      parsedRows = parseWorkbook(buffer);
    } catch {
      return NextResponse.json(
        { error: "Não foi possível ler o arquivo. Confirme se é um extrato de Vendas e Recebimentos do Mercado Pago em CSV ou XLSX." },
        { status: 422 }
      );
    }

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma linha reconhecida no arquivo enviado." },
        { status: 422 }
      );
    }

    const orderIds = Array.from(
      new Set(parsedRows.map((row) => row.ml_order_id).filter((value): value is string => Boolean(value)))
    );

    const ordersByProviderId = new Map<string, OrderRow>();
    const chunkSize = 200;
    for (let offset = 0; offset < orderIds.length; offset += chunkSize) {
      const chunk = orderIds.slice(offset, offset + chunkSize);
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

    let matchedRows = 0;
    let mismatchedRows = 0;
    let unmatchedRows = 0;
    let totalGrossAmount = 0;
    let totalNetReceivedAmount = 0;
    let totalShippingDifference = 0;

    const periodTimestamps = parsedRows
      .map((row) => row.purchase_date)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));
    const periodFrom = periodTimestamps.length ? new Date(Math.min(...periodTimestamps)) : null;
    const periodTo = periodTimestamps.length ? new Date(Math.max(...periodTimestamps)) : null;

    const { data: batch, error: batchError } = await supabase
      .from("mp_reconciliation_batches")
      .insert({
        organization_id: organizationId,
        file_name: file.name,
        period_from: periodFrom ? periodFrom.toISOString().slice(0, 10) : null,
        period_to: periodTo ? periodTo.toISOString().slice(0, 10) : null,
        total_rows: parsedRows.length,
        imported_by: userData.user.id
      })
      .select("id")
      .single();

    if (batchError) throw batchError;
    const batchId = (batch as { id: string }).id;

    const importRows = parsedRows.map((row) => {
      totalGrossAmount += row.gross_amount;
      totalNetReceivedAmount += row.net_received_amount;

      const order = row.ml_order_id ? ordersByProviderId.get(row.ml_order_id) ?? null : null;
      let matchStatus: "matched" | "amount_mismatch" | "unmatched" = "unmatched";
      let amountDifference = 0;

      // Frete/repasse: comparar frete registrado no pedido ML (order.shipping_cost_amount)
      // com o frete descontado no extrato MP (row.shipping_cost_amount, pode ser negativo).
      // shipping_difference = order_shipping_cost - ABS(mp_shipping_cost)
      //   > 0 → ML estimou frete maior que o MP cobrou (saldo a favor do vendedor)
      //   < 0 → MP cobrou mais frete do que o ML estimou (custo extra / subsídio ML)
      const orderShippingCost = order ? Number((order.shipping_cost_amount ?? 0).toFixed(2)) : null;
      const mpShippingAbs = Math.abs(row.shipping_cost_amount);
      const shippingDifference = orderShippingCost != null
        ? Number((orderShippingCost - mpShippingAbs).toFixed(2))
        : 0;
      totalShippingDifference += shippingDifference;

      if (order) {
        amountDifference = Number((row.gross_amount - order.gross_amount).toFixed(2));
        if (Math.abs(amountDifference) <= AMOUNT_TOLERANCE) {
          matchStatus = "matched";
          matchedRows += 1;
        } else {
          matchStatus = "amount_mismatch";
          mismatchedRows += 1;
        }
      } else {
        unmatchedRows += 1;
      }

      return {
        organization_id: organizationId,
        batch_id: batchId,
        ml_order_id: row.ml_order_id,
        mp_operation_id: row.mp_operation_id,
        external_reference: row.external_reference,
        item_id: row.item_id,
        seller_sku: row.seller_sku,
        description: row.description,
        status: row.status,
        status_detail: row.status_detail,
        operation_type: row.operation_type,
        purchase_date: row.purchase_date,
        approved_date: row.approved_date,
        released_date: row.released_date,
        gross_amount: row.gross_amount,
        mercadopago_fee_amount: row.mercadopago_fee_amount,
        marketplace_fee_amount: row.marketplace_fee_amount,
        shipping_cost_amount: row.shipping_cost_amount,
        coupon_fee_amount: row.coupon_fee_amount,
        net_received_amount: row.net_received_amount,
        refunded_amount: row.refunded_amount,
        installments: row.installments,
        payment_type: row.payment_type,
        matched_order_id: order?.id ?? null,
        match_status: matchStatus,
        amount_difference: amountDifference,
        order_shipping_cost: orderShippingCost,
        shipping_difference: shippingDifference,
        raw_payload: row.raw_payload
      };
    });

    const insertChunkSize = 300;
    for (let offset = 0; offset < importRows.length; offset += insertChunkSize) {
      const chunk = importRows.slice(offset, offset + insertChunkSize);
      const { error: insertError } = await supabase.from("mp_payment_imports").insert(chunk);
      if (insertError) throw insertError;
    }

    const { error: updateBatchError } = await supabase
      .from("mp_reconciliation_batches")
      .update({
        matched_rows: matchedRows,
        mismatched_rows: mismatchedRows,
        unmatched_rows: unmatchedRows,
        total_gross_amount: Number(totalGrossAmount.toFixed(2)),
        total_net_received_amount: Number(totalNetReceivedAmount.toFixed(2)),
        total_shipping_difference: Number(totalShippingDifference.toFixed(2))
      })
      .eq("id", batchId);

    if (updateBatchError) throw updateBatchError;

    return NextResponse.json({
      batch: {
        id: batchId,
        fileName: file.name,
        periodFrom: periodFrom ? periodFrom.toISOString().slice(0, 10) : null,
        periodTo: periodTo ? periodTo.toISOString().slice(0, 10) : null,
        totalRows: parsedRows.length,
        matchedRows,
        mismatchedRows,
        unmatchedRows,
        totalGrossAmount: Number(totalGrossAmount.toFixed(2)),
        totalNetReceivedAmount: Number(totalNetReceivedAmount.toFixed(2)),
        totalShippingDifference: Number(totalShippingDifference.toFixed(2))
      },
      rows: importRows.map((row, index) => ({
        id: `${batchId}-${index}`,
        mlOrderId: row.ml_order_id,
        mpOperationId: row.mp_operation_id,
        description: row.description,
        sellerSku: row.seller_sku,
        status: row.status,
        purchaseDate: row.purchase_date,
        releasedDate: row.released_date,
        grossAmount: row.gross_amount,
        mpShippingCost: Math.abs(row.shipping_cost_amount),
        orderShippingCost: row.order_shipping_cost,
        shippingDifference: row.shipping_difference,
        netReceivedAmount: row.net_received_amount,
        matchStatus: row.match_status,
        amountDifference: row.amount_difference
      }))
    });
  } catch (error) {
    const message = extractErrorMessage(error, "Erro ao importar o extrato.");
    console.error("[mercadopago/reconciliation/import] POST falhou:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
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
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!token || !organizationId) {
      return NextResponse.json({ error: "Sessão e empresa são obrigatórias." }, { status: 401 });
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

    const { data: batches, error: batchesError } = await supabase
      .from("mp_reconciliation_batches")
      .select(
        "id, file_name, period_from, period_to, total_rows, matched_rows, mismatched_rows, unmatched_rows, total_gross_amount, total_net_received_amount, total_shipping_difference, created_at"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (batchesError) throw batchesError;

    return NextResponse.json({
      batches: (batches ?? []).map((batch) => ({
        id: batch.id as string,
        fileName: batch.file_name as string,
        periodFrom: batch.period_from as string | null,
        periodTo: batch.period_to as string | null,
        totalRows: batch.total_rows as number,
        matchedRows: batch.matched_rows as number,
        mismatchedRows: batch.mismatched_rows as number,
        unmatchedRows: batch.unmatched_rows as number,
        totalGrossAmount: Number(batch.total_gross_amount ?? 0),
        totalNetReceivedAmount: Number(batch.total_net_received_amount ?? 0),
        totalShippingDifference: Number(batch.total_shipping_difference ?? 0),
        createdAt: batch.created_at as string
      }))
    });
  } catch (error) {
    const message = extractErrorMessage(error, "Erro ao carregar histórico de conciliações.");
    console.error("[mercadopago/reconciliation/import] GET falhou:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const batchId = searchParams.get("batchId");

    if (!token || !organizationId || !batchId) {
      return NextResponse.json(
        { error: "Sessão, empresa e lote são obrigatórios." },
        { status: 401 }
      );
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

    const { data: batch, error: batchError } = await supabase
      .from("mp_reconciliation_batches")
      .select("id")
      .eq("id", batchId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (batchError) throw batchError;
    if (!batch) {
      return NextResponse.json({ error: "Importação não encontrada." }, { status: 404 });
    }

    // mp_payment_imports possui ON DELETE CASCADE referenciando o lote, então
    // remover o lote já remove as linhas associadas.
    const { error: deleteError } = await supabase
      .from("mp_reconciliation_batches")
      .delete()
      .eq("id", batchId)
      .eq("organization_id", organizationId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ deleted: true, batchId });
  } catch (error) {
    const message = extractErrorMessage(error, "Erro ao excluir a importação.");
    console.error("[mercadopago/reconciliation/import] DELETE falhou:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

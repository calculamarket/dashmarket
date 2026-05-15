import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMercadoLivreServerConfig } from "@/lib/marketplaces/mercadolivre-server-config";

type MarketplaceAccount = {
  id: string;
  organization_id: string;
  external_seller_id: string;
  account_name: string;
  last_sync_at: string | null;
};

type MarketplaceCredentials = {
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
};

type MarketplaceCredentialsUpsert = {
  account_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
};

type TokenRefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type MercadoLivreOrderItem = {
  item?: {
    id?: string | null;
    title?: string | null;
    seller_sku?: string | null;
    seller_custom_field?: string | null;
  } | null;
  quantity?: number | null;
  unit_price?: number | null;
  full_unit_price?: number | null;
  sale_fee?: number | null;
};

type MercadoLivrePayment = {
  id?: number | string | null;
  status?: string | null;
  status_detail?: string | null;
  transaction_amount?: number | null;
  total_paid_amount?: number | null;
  shipping_cost?: number | null;
  coupon_amount?: number | null;
  date_created?: string | null;
  date_approved?: string | null;
};

type MercadoLivreOrder = {
  id: number | string;
  status?: string | null;
  status_detail?: string | null;
  date_created?: string | null;
  date_closed?: string | null;
  last_updated?: string | null;
  expiration_date?: string | null;
  fulfilled?: boolean | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  currency_id?: string | null;
  tags?: string[];
  cancel_detail?: unknown;
  order_items?: MercadoLivreOrderItem[];
  payments?: MercadoLivrePayment[];
  shipping_cost?: number | null;
  shipping?: {
    id?: number | string | null;
    status?: string | null;
    substatus?: string | null;
    cost?: number | null;
  } | null;
  taxes?: {
    amount?: number | null;
  } | null;
};

type MercadoLivreShipmentCosts = {
  gross_amount?: number | null;
  receiver?: {
    user_id?: number | string | null;
    cost?: number | null;
  } | null;
  senders?: Array<{
    user_id?: number | string | null;
    cost?: number | null;
  }> | null;
};

type LocalOrderItem = {
  id: string;
  external_item_id: string | null;
  seller_sku: string | null;
  title: string;
  quantity: number | string;
  unit_price: number | string;
  gross_amount: number | string;
  marketplace_fee_amount: number | string;
  shipping_cost_amount: number | string;
  discount_amount: number | string;
  raw_payload?: {
    dashmarket_shipping?: {
      buyer_cost_amount?: number | string | null;
      seller_cost_amount?: number | string | null;
      gross_amount?: number | string | null;
      source?: string | null;
    };
  } | null;
};

type LocalOrder = {
  id: string;
  provider_order_id: string;
  sold_at: string;
  status: string;
  gross_amount: number | string;
  marketplace_fee_amount: number | string;
  shipping_cost_amount: number | string;
  discounts_amount: number | string;
  taxes_amount: number | string;
  net_amount: number | string;
  raw_payload?: {
    status?: string | null;
    fulfilled?: boolean | null;
    tags?: string[];
    cancel_detail?: unknown;
  } | null;
  order_items?: LocalOrderItem[];
};

const REVENUE_STATUSES = new Set(["paid"]);

function getEnv(request: Request) {
  return getMercadoLivreServerConfig(new URL(request.url), {
    requireMercadoLivreCredentials: false
  });
}

function toNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : 0;
}

function isTokenExpiring(credentials: MarketplaceCredentials) {
  if (!credentials.token_expires_at) return false;
  const expiresAt = new Date(credentials.token_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now() + 5 * 60 * 1000;
}

async function refreshAccessToken(
  credentials: MarketplaceCredentials,
  accountId: string,
  saveCredentials: (payload: MarketplaceCredentialsUpsert) => Promise<void>,
  clientId: string | undefined,
  clientSecret: string | undefined
) {
  if (!credentials.refresh_token || !isTokenExpiring(credentials)) {
    return credentials.access_token;
  }

  if (!clientId || !clientSecret) {
    throw new Error("Variaveis do Mercado Livre incompletas para renovar token.");
  }

  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: credentials.refresh_token
  });

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`Mercado Livre recusou refresh do token: ${response.status}`);
  }

  const token = (await response.json()) as TokenRefreshResponse;
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : credentials.token_expires_at;

  await saveCredentials({
    account_id: accountId,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? credentials.refresh_token,
    token_expires_at: expiresAt,
    scopes: token.scope ? token.scope.split(" ") : credentials.scopes ?? []
  });

  return token.access_token;
}

async function mercadoLivreRequest<T>(path: string, accessToken: string) {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-format-new": "true"
    }
  });
  const body = await response.text();

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      error: body.slice(0, 1000)
    };
  }

  return {
    ok: true as const,
    status: response.status,
    data: body ? (JSON.parse(body) as T) : null
  };
}

function summarizeLocalOrder(order: LocalOrder | null) {
  if (!order) return null;

  return {
    status: order.status,
    rawStatus: order.raw_payload?.status ?? null,
    soldAt: order.sold_at,
    grossAmount: toNumber(order.gross_amount),
    marketplaceFeeAmount: toNumber(order.marketplace_fee_amount),
    sellerShippingAmount: toNumber(order.shipping_cost_amount),
    discountsAmount: toNumber(order.discounts_amount),
    taxesAmount: toNumber(order.taxes_amount),
    netAmount: toNumber(order.net_amount),
    countsInRevenue:
      REVENUE_STATUSES.has(order.status) && toNumber(order.gross_amount) > 0,
    items: (order.order_items ?? []).map((item) => ({
      sku: item.seller_sku,
      title: item.title,
      itemId: item.external_item_id,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unit_price),
      grossAmount: toNumber(item.gross_amount),
      marketplaceFeeAmount: toNumber(item.marketplace_fee_amount),
      sellerShippingAmount: toNumber(item.shipping_cost_amount),
      buyerShippingAmount: toNumber(
        item.raw_payload?.dashmarket_shipping?.buyer_cost_amount
      ),
      discountAmount: toNumber(item.discount_amount)
    }))
  };
}

function summarizeRemoteOrder(
  order: MercadoLivreOrder,
  shipmentCosts: MercadoLivreShipmentCosts | null,
  sellerId: string
) {
  const items = order.order_items ?? [];
  const payments = order.payments ?? [];
  const sellerShippingAmount = (shipmentCosts?.senders ?? [])
    .filter((sender) => String(sender.user_id ?? sellerId) === String(sellerId))
    .reduce((total, sender) => total + toNumber(sender.cost), 0);
  const buyerShippingAmount =
    toNumber(shipmentCosts?.receiver?.cost) ||
    toNumber(order.shipping_cost ?? order.shipping?.cost);
  const itemGrossAmount = items.reduce(
    (total, item) =>
      total +
      toNumber(item.quantity) *
        toNumber(item.unit_price ?? item.full_unit_price),
    0
  );
  const marketplaceFeeAmount = items.reduce(
    (total, item) => total + toNumber(item.sale_fee),
    0
  );
  const status = order.status ?? "sem_status";

  return {
    status,
    statusDetail: order.status_detail ?? null,
    shouldCountInRevenue: REVENUE_STATUSES.has(status),
    fulfilled: order.fulfilled ?? null,
    dateCreated: order.date_created ?? null,
    dateClosed: order.date_closed ?? null,
    lastUpdated: order.last_updated ?? null,
    expirationDate: order.expiration_date ?? null,
    totalAmount: toNumber(order.total_amount),
    paidAmount: toNumber(order.paid_amount),
    itemGrossAmount,
    marketplaceFeeAmount,
    sellerShippingAmount,
    buyerShippingAmount,
    shippingId: order.shipping?.id ?? null,
    shippingStatus: order.shipping?.status ?? null,
    shippingSubstatus: order.shipping?.substatus ?? null,
    taxesAmount: toNumber(order.taxes?.amount),
    tags: order.tags ?? [],
    cancelDetail: order.cancel_detail ?? null,
    payments: payments.map((payment) => ({
      id: payment.id ?? null,
      status: payment.status ?? null,
      statusDetail: payment.status_detail ?? null,
      transactionAmount: toNumber(payment.transaction_amount),
      totalPaidAmount: toNumber(payment.total_paid_amount),
      shippingCost: toNumber(payment.shipping_cost),
      couponAmount: toNumber(payment.coupon_amount),
      dateCreated: payment.date_created ?? null,
      dateApproved: payment.date_approved ?? null
    })),
    items: items.map((item) => ({
      sku: item.item?.seller_sku ?? item.item?.seller_custom_field ?? null,
      title: item.item?.title ?? null,
      itemId: item.item?.id ?? null,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unit_price ?? item.full_unit_price),
      grossAmount:
        toNumber(item.quantity) *
        toNumber(item.unit_price ?? item.full_unit_price),
      saleFee: toNumber(item.sale_fee)
    }))
  };
}

export async function POST(request: Request) {
  try {
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } = getEnv(request);
    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    const body = (await request.json()) as {
      organizationId?: string;
      orderIds?: string[];
    };
    const organizationId = body.organizationId;
    const orderIds = Array.from(
      new Set(
        (body.orderIds ?? [])
          .map((orderId) => orderId.trim())
          .filter((orderId) => /^\d{8,}$/.test(orderId))
      )
    ).slice(0, 20);

    if (!token || !organizationId) {
      return NextResponse.json(
        { error: "Sessao e organizacao sao obrigatorias." },
        { status: 401 }
      );
    }

    if (orderIds.length === 0) {
      return NextResponse.json(
        { error: "Informe ao menos um numero de venda valido." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json({ error: "Sessao invalida." }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return NextResponse.json({ error: "Sem acesso a empresa." }, { status: 403 });
    }

    const { data: account, error: accountError } = await supabase
      .from("marketplace_accounts")
      .select("id, organization_id, external_seller_id, account_name, last_sync_at")
      .eq("organization_id", organizationId)
      .eq("provider", "mercadolivre")
      .eq("status", "connected")
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) {
      return NextResponse.json(
        { error: "Nenhuma conta Mercado Livre conectada." },
        { status: 404 }
      );
    }

    const currentAccount = account as MarketplaceAccount;
    const { data: credentials, error: credentialsError } = await supabase
      .from("marketplace_account_credentials")
      .select("access_token, refresh_token, token_expires_at, scopes")
      .eq("account_id", currentAccount.id)
      .maybeSingle();

    if (credentialsError) throw credentialsError;
    if (!credentials) {
      return NextResponse.json(
        { error: "Credenciais do Mercado Livre nao encontradas." },
        { status: 404 }
      );
    }

    const accessToken = await refreshAccessToken(
      credentials as MarketplaceCredentials,
      currentAccount.id,
      async (payload) => {
        const { error } = await supabase
          .from("marketplace_account_credentials")
          .upsert(payload);

        if (error) throw error;
      },
      clientId,
      clientSecret
    );

    const { data: localOrdersData, error: localOrdersError } = await supabase
      .from("orders")
      .select(
        "id, provider_order_id, sold_at, status, gross_amount, marketplace_fee_amount, shipping_cost_amount, discounts_amount, taxes_amount, net_amount, raw_payload, order_items(id, external_item_id, seller_sku, title, quantity, unit_price, gross_amount, marketplace_fee_amount, shipping_cost_amount, discount_amount, raw_payload)"
      )
      .eq("marketplace_account_id", currentAccount.id)
      .in("provider_order_id", orderIds);

    if (localOrdersError) throw localOrdersError;

    const localOrdersById = new Map(
      ((localOrdersData ?? []) as LocalOrder[]).map((order) => [
        order.provider_order_id,
        order
      ])
    );
    const orders = [];

    for (const orderId of orderIds) {
      const remoteOrder = await mercadoLivreRequest<MercadoLivreOrder>(
        `/orders/${orderId}`,
        accessToken
      );
      let remote = null;
      let remoteError = null;
      let shipmentCosts: MercadoLivreShipmentCosts | null = null;
      let shipmentError = null;

      if (remoteOrder.ok && remoteOrder.data) {
        const shippingId = remoteOrder.data.shipping?.id;
        const shippingIdText =
          shippingId === null || shippingId === undefined ? null : String(shippingId);

        if (shippingIdText) {
          const shipmentResponse =
            await mercadoLivreRequest<MercadoLivreShipmentCosts>(
              `/shipments/${shippingIdText}/costs`,
              accessToken
            );

          if (shipmentResponse.ok) {
            shipmentCosts = shipmentResponse.data;
          } else {
            shipmentError = {
              status: shipmentResponse.status,
              message: shipmentResponse.error
            };
          }
        }

        remote = summarizeRemoteOrder(
          remoteOrder.data,
          shipmentCosts,
          currentAccount.external_seller_id
        );
      } else {
        remoteError = {
          status: remoteOrder.status,
          message: remoteOrder.error
        };
      }

      const local = summarizeLocalOrder(localOrdersById.get(orderId) ?? null);
      const revenueRisk = Boolean(
        local?.countsInRevenue && remote && !remote.shouldCountInRevenue
      );

      orders.push({
        orderId,
        local,
        remote,
        remoteError,
        shipmentError,
        comparison: {
          revenueRisk,
          statusMismatch: Boolean(local && remote && local.status !== remote.status),
          localMissing: !local,
          remoteMissing: !remote,
          grossMismatch: Boolean(
            local && remote && local.grossAmount !== remote.itemGrossAmount
          ),
          feeMismatch: Boolean(
            local &&
              remote &&
              local.marketplaceFeeAmount !== remote.marketplaceFeeAmount
          ),
          sellerShippingMismatch: Boolean(
            local &&
              remote &&
              local.sellerShippingAmount !== remote.sellerShippingAmount
          ),
          taxMismatch: Boolean(
            local && remote && local.taxesAmount !== remote.taxesAmount
          )
        }
      });
    }

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      accountName: currentAccount.account_name,
      sellerId: currentAccount.external_seller_id,
      lastSyncAt: currentAccount.last_sync_at,
      orders
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel auditar as vendas."
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type MarketplaceAccount = {
  id: string;
  organization_id: string;
  external_seller_id: string;
  account_name: string;
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

type PromotionBenefits = {
  type?: string | null;
  meli_percent?: number | null;
  seller_percent?: number | null;
  item_discount_percent?: number | null;
  name?: string | null;
};

type SellerPromotion = {
  id: string;
  type?: string | null;
  status?: string | null;
  start_date?: string | null;
  finish_date?: string | null;
  deadline_date?: string | null;
  name?: string | null;
  benefits?: PromotionBenefits | null;
};

type SellerPromotionsResponse = {
  results?: SellerPromotion[];
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
};

type PromotionRow = {
  id: string;
};

type SupabaseMutationClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          is: (column: string, value: unknown) => {
            maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
    update: (payload: unknown) => {
      eq: (column: string, value: unknown) => PromiseLike<{ error: unknown }>;
    };
    insert: (payload: unknown) => PromiseLike<{ error: unknown }>;
  };
};

const PAGE_SIZE = 50;

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
    throw new Error("Variaveis de ambiente incompletas.");
  }

  return { clientId, clientSecret, serviceRoleKey, supabaseUrl };
}

function isTokenExpiring(credentials: MarketplaceCredentials) {
  if (!credentials.token_expires_at) return false;
  const expiresAt = new Date(credentials.token_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now() + 5 * 60 * 1000;
}

function discountPercentFromPromotion(promotion: SellerPromotion) {
  const benefits = promotion.benefits;
  return (
    benefits?.item_discount_percent ??
    benefits?.seller_percent ??
    benefits?.meli_percent ??
    null
  );
}

async function refreshAccessToken(
  credentials: MarketplaceCredentials,
  accountId: string,
  saveCredentials: (payload: MarketplaceCredentialsUpsert) => Promise<void>,
  clientId: string,
  clientSecret: string
) {
  if (!credentials.refresh_token || !isTokenExpiring(credentials)) {
    return credentials.access_token;
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
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Mercado Livre API respondeu ${response.status} em ${path}.`);
  }

  return response.json() as Promise<T>;
}

async function fetchPromotions(sellerId: string, accessToken: string) {
  const promotions: SellerPromotion[] = [];
  let offset = 0;
  let total = 0;

  do {
    const params = new URLSearchParams({
      app_version: "v2",
      limit: String(PAGE_SIZE),
      offset: String(offset)
    });

    const payload = await mercadoLivreRequest<SellerPromotionsResponse>(
      `/seller-promotions/users/${sellerId}?${params.toString()}`,
      accessToken
    );

    const results = payload.results ?? [];
    promotions.push(...results);
    total = payload.paging?.total ?? total;
    offset += PAGE_SIZE;
  } while (promotions.length < total);

  return promotions;
}

async function savePromotion({
  currentAccount,
  organizationId,
  promotion,
  supabase
}: {
  currentAccount: MarketplaceAccount;
  organizationId: string;
  promotion: SellerPromotion;
  supabase: SupabaseMutationClient;
}) {
  const payload = {
    organization_id: organizationId,
    marketplace_account_id: currentAccount.id,
    product_id: null,
    provider_promotion_id: promotion.id,
    name: promotion.name ?? `${promotion.type ?? "Promocao"} ${promotion.id}`,
    promotion_type: promotion.type ?? null,
    status: promotion.status ?? null,
    starts_at: promotion.start_date ?? null,
    ends_at: promotion.finish_date ?? null,
    discount_amount: null,
    discount_percent: discountPercentFromPromotion(promotion),
    raw_payload: promotion
  };

  const { data: existing, error: existingError } = await supabase
    .from("promotions")
    .select("id")
    .eq("marketplace_account_id", currentAccount.id)
    .eq("provider_promotion_id", promotion.id)
    .is("product_id", null)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("promotions")
      .update(payload)
      .eq("id", (existing as PromotionRow).id);

    if (error) throw error;
    return "updated" as const;
  }

  const { error } = await supabase.from("promotions").insert(payload);
  if (error) throw error;
  return "inserted" as const;
}

export async function POST(request: Request) {
  try {
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } = getEnv();
    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    const body = (await request.json()) as { organizationId?: string };
    const organizationId = body.organizationId;

    if (!token || !organizationId) {
      return NextResponse.json(
        { error: "Sessao e organizacao sao obrigatorias." },
        { status: 401 }
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
      .select("id, organization_id, external_seller_id, account_name")
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

    const { data: credentials, error: credentialsError } = await supabase
      .from("marketplace_account_credentials")
      .select("access_token, refresh_token, token_expires_at, scopes")
      .eq("account_id", account.id)
      .maybeSingle();

    if (credentialsError) throw credentialsError;
    if (!credentials) {
      return NextResponse.json(
        { error: "Credenciais do Mercado Livre nao encontradas." },
        { status: 404 }
      );
    }

    const currentAccount = account as MarketplaceAccount;
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

    const { data: syncRun, error: syncRunError } = await supabase
      .from("sync_runs")
      .insert({
        organization_id: organizationId,
        marketplace_account_id: currentAccount.id,
        provider: "mercadolivre",
        resource: "promotions",
        status: "running",
        metadata: { source: "manual" }
      })
      .select("id")
      .single();

    if (syncRunError) throw syncRunError;

    try {
      const promotions = await fetchPromotions(
        currentAccount.external_seller_id,
        accessToken
      );
      let inserted = 0;
      let updated = 0;

      for (const promotion of promotions) {
        const result = await savePromotion({
          currentAccount,
          organizationId,
          promotion,
          supabase: supabase as unknown as SupabaseMutationClient
        });

        if (result === "inserted") inserted += 1;
        if (result === "updated") updated += 1;
      }

      const now = new Date().toISOString();

      await supabase
        .from("marketplace_accounts")
        .update({ last_sync_at: now })
        .eq("id", currentAccount.id);

      await supabase
        .from("sync_runs")
        .update({
          status: "success",
          finished_at: now,
          records_processed: promotions.length,
          metadata: {
            inserted,
            updated,
            active_promotions: promotions.filter((promotion) =>
              ["started", "active"].includes((promotion.status ?? "").toLowerCase())
            ).length
          }
        })
        .eq("id", syncRun.id);

      return NextResponse.json({
        accountName: currentAccount.account_name,
        promotions: promotions.length,
        inserted,
        updated,
        activePromotions: promotions.filter((promotion) =>
          ["started", "active"].includes((promotion.status ?? "").toLowerCase())
        ).length,
        syncedAt: now
      });
    } catch (error) {
      await supabase
        .from("sync_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message:
            error instanceof Error ? error.message : "Falha ao sincronizar promocoes."
        })
        .eq("id", syncRun.id);

      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel sincronizar promocoes."
      },
      { status: 500 }
    );
  }
}

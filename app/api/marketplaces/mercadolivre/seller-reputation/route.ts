import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMercadoLivreServerConfig } from "@/lib/marketplaces/mercadolivre-server-config";

type MarketplaceCredentials = {
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
};

type TokenRefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type ReputationLevel = "1_red" | "2_orange" | "3_yellow" | "4_light_green" | "5_green";

type MlSellerReputation = {
  level_id: ReputationLevel | null;
  power_seller_status: string | null;
  transactions?: {
    period: string;
    total: number;
    completed: number;
    canceled: { total: number; rate: number };
    ratings: { positive: number; negative: number; neutral: number };
  };
  metrics?: {
    sales: { period: string; completed: number };
    claims: { period: string; rate: number; value: number };
    delayed_handling_time: { period: string; rate: number; value: number };
    cancellations: { period: string; rate: number; value: number };
  };
};

type MlUserResponse = {
  id: number;
  nickname: string;
  seller_reputation?: MlSellerReputation;
};

function isTokenExpiring(credentials: MarketplaceCredentials) {
  if (!credentials.token_expires_at) return Boolean(credentials.refresh_token);
  const expiresAt = new Date(credentials.token_expires_at).getTime();
  return !Number.isFinite(expiresAt) || expiresAt < Date.now() + 5 * 60 * 1000;
}

async function refreshAccessToken(
  credentials: MarketplaceCredentials,
  accountId: string,
  saveCredentials: (payload: {
    account_id: string;
    access_token: string;
    refresh_token: string | null;
    token_expires_at: string | null;
    scopes: string[];
  }) => Promise<void>,
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
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: payload
  });

  if (!response.ok) throw new Error(`Refresh token falhou: ${response.status}`);

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

const LEVEL_LABEL: Record<string, string> = {
  "1_red": "Vermelho",
  "2_orange": "Laranja",
  "3_yellow": "Amarelo",
  "4_light_green": "Verde claro",
  "5_green": "Verde"
};

export async function POST(request: Request) {
  try {
    const config = getMercadoLivreServerConfig(new URL(request.url));
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } = config;

    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    const body = (await request.json()) as { organizationId?: string };
    const { organizationId } = body;

    if (!token || !organizationId) {
      return NextResponse.json({ error: "Sessao e organizacao obrigatorias." }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Sessao invalida." }, { status: 401 });
    }

    const { data: account, error: accountError } = await supabase
      .from("marketplace_accounts")
      .select("id, external_seller_id, account_name")
      .eq("organization_id", organizationId)
      .eq("provider", "mercadolivre")
      .eq("status", "connected")
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) {
      return NextResponse.json({ error: "Nenhuma conta ML conectada." }, { status: 404 });
    }

    const { data: credentials, error: credentialsError } = await supabase
      .from("marketplace_account_credentials")
      .select("access_token, refresh_token, token_expires_at, scopes")
      .eq("account_id", account.id)
      .maybeSingle();

    if (credentialsError) throw credentialsError;
    if (!credentials) {
      return NextResponse.json({ error: "Credenciais nao encontradas." }, { status: 404 });
    }

    const accessToken = await refreshAccessToken(
      credentials as MarketplaceCredentials,
      account.id,
      async (payload) => {
        const { error } = await supabase.from("marketplace_account_credentials").upsert(payload);
        if (error) throw error;
      },
      clientId!,
      clientSecret!
    );

    const response = await fetch(
      `https://api.mercadolibre.com/users/${account.external_seller_id}`,
      {
        cache: "no-store",
        headers: { accept: "application/json", authorization: `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ML API ${response.status}: ${body.slice(0, 200)}`);
    }

    const user = (await response.json()) as MlUserResponse;
    const rep = user.seller_reputation;
    const levelId = rep?.level_id ?? null;

    return NextResponse.json({
      accountName: account.account_name,
      sellerId: account.external_seller_id,
      nickname: user.nickname,
      levelId,
      levelLabel: levelId ? (LEVEL_LABEL[levelId] ?? levelId) : "Sem nivel",
      powerSellerStatus: rep?.power_seller_status ?? null,
      metrics: rep?.metrics ?? null,
      transactions: rep?.transactions ?? null,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar reputacao." },
      { status: 500 }
    );
  }
}

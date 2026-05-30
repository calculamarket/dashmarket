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

type ClaimStage = "CLAIM" | "DISPUTE" | "MEDIATION" | "RECONTACT" | "FULFILLED";
type ClaimStatus = "opened" | "closed";
type ClaimType = "mediations" | "claims" | "fulfillment";

type MlClaim = {
  id: string;
  resource_id: string; // order_id
  status: ClaimStatus;
  stage: ClaimStage;
  type: ClaimType;
  reason_id: string | null;
  players: Array<{
    role: "complainant" | "respondent" | "mediator";
    type: "buyer" | "seller" | "mercadolivre";
    user_id: number;
    available_actions: string[];
  }>;
  resolution: {
    reason: string | null;
    benefited: "complainant" | "respondent" | null;
  } | null;
  date_created: string;
  last_updated: string;
  expiration_date: string | null;
};

type MlClaimsResponse = {
  data: MlClaim[];
  paging: { total: number; limit: number; offset: number };
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

const PAGE_SIZE = 50;
const MAX_CLAIMS = 500;

const STAGE_LABEL: Record<string, string> = {
  CLAIM: "Reclamação",
  DISPUTE: "Disputa",
  MEDIATION: "Mediação",
  RECONTACT: "Recontato",
  FULFILLED: "Resolvida"
};

const REASON_LABEL: Record<string, string> = {
  "PDD": "Produto não chegou",
  "PNDA": "Produto diferente do anúncio",
  "PNW": "Produto com defeito",
  "PNER": "Produto não encontrado",
  "DP": "Problema na entrega"
};

export async function POST(request: Request) {
  try {
    const config = getMercadoLivreServerConfig(new URL(request.url));
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } = config;

    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    const body = (await request.json()) as {
      organizationId?: string;
      status?: ClaimStatus;
    };
    const { organizationId, status = "opened" } = body;

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

    const allClaims: MlClaim[] = [];
    let offset = 0;
    let total = 0;
    const now = Date.now();

    do {
      const params = new URLSearchParams({
        role: "respondent",
        status,
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sort_field: "date_created",
        sort_order: "DESC"
      });

      const response = await fetch(
        `https://api.mercadolibre.com/post-sale/v2/claims/search?${params.toString()}`,
        {
          cache: "no-store",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${accessToken}`,
            "x-caller-id": account.external_seller_id
          }
        }
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`ML API ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = (await response.json()) as MlClaimsResponse;
      allClaims.push(...(data.data ?? []));
      total = data.paging?.total ?? total;
      offset += PAGE_SIZE;

      if ((data.data ?? []).length === 0) break;
    } while (offset < total && allClaims.length < MAX_CLAIMS);

    // Enrich with computed fields
    const enriched = allClaims.map((claim) => {
      const expirationMs = claim.expiration_date ? new Date(claim.expiration_date).getTime() : null;
      const hoursLeft = expirationMs != null ? Math.floor((expirationMs - now) / 3600000) : null;
      const sellerActions =
        claim.players.find((p) => p.type === "seller")?.available_actions ?? [];

      return {
        id: claim.id,
        orderId: claim.resource_id,
        status: claim.status,
        stage: claim.stage,
        stageLabel: STAGE_LABEL[claim.stage] ?? claim.stage,
        type: claim.type,
        reasonId: claim.reason_id,
        reasonLabel: claim.reason_id ? (REASON_LABEL[claim.reason_id] ?? claim.reason_id) : null,
        dateCreated: claim.date_created,
        lastUpdated: claim.last_updated,
        expirationDate: claim.expiration_date,
        hoursLeft,
        isExpired: hoursLeft != null && hoursLeft <= 0,
        isUrgent: hoursLeft != null && hoursLeft > 0 && hoursLeft <= 24,
        sellerActions,
        needsAction: sellerActions.length > 0,
        resolution: claim.resolution ?? null
      };
    });

    // Summary by stage
    const byStage = enriched.reduce<Record<string, number>>((acc, c) => {
      acc[c.stage] = (acc[c.stage] ?? 0) + 1;
      return acc;
    }, {});

    const expired = enriched.filter((c) => c.isExpired).length;
    const urgent = enriched.filter((c) => c.isUrgent).length;
    const needsAction = enriched.filter((c) => c.needsAction).length;
    const inMediation = byStage["MEDIATION"] ?? 0;

    return NextResponse.json({
      accountName: account.account_name,
      status,
      total,
      fetched: enriched.length,
      summary: { expired, urgent, needsAction, inMediation, byStage },
      claims: enriched,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar reclamacoes." },
      { status: 500 }
    );
  }
}

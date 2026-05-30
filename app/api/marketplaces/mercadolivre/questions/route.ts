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

type MlQuestion = {
  id: number;
  date_created: string;
  item_id: string;
  seller_id: number;
  status: string;
  text: string;
  answer: { text: string; date_created: string } | null;
  from: { id: number } | null;
};

type MlQuestionsResponse = {
  questions: MlQuestion[];
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
const MAX_QUESTIONS = 200;

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

    // Fetch unanswered questions (paginated, up to MAX_QUESTIONS)
    const allQuestions: MlQuestion[] = [];
    let offset = 0;
    let total = 0;

    do {
      const params = new URLSearchParams({
        seller_id: account.external_seller_id,
        status: "UNANSWERED",
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sort_fields: "date_created",
        sort_types: "DESC"
      });

      const response = await fetch(
        `https://api.mercadolibre.com/questions/search?${params.toString()}`,
        {
          cache: "no-store",
          headers: { accept: "application/json", authorization: `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`ML API ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = (await response.json()) as MlQuestionsResponse;
      allQuestions.push(...(data.questions ?? []));
      total = data.paging?.total ?? total;
      offset += PAGE_SIZE;

      if ((data.questions ?? []).length === 0) break;
    } while (offset < total && allQuestions.length < MAX_QUESTIONS);

    // Group by item_id to show which listings have most questions
    const byItem = new Map<string, { itemId: string; count: number; oldest: string }>();
    for (const q of allQuestions) {
      const existing = byItem.get(q.item_id);
      if (!existing) {
        byItem.set(q.item_id, { itemId: q.item_id, count: 1, oldest: q.date_created });
      } else {
        existing.count++;
        if (q.date_created < existing.oldest) existing.oldest = q.date_created;
      }
    }

    const topItems = Array.from(byItem.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Find oldest unanswered question
    const oldestDate =
      allQuestions.length > 0
        ? allQuestions.reduce(
            (oldest, q) => (q.date_created < oldest ? q.date_created : oldest),
            allQuestions[0].date_created
          )
        : null;

    return NextResponse.json({
      accountName: account.account_name,
      total,
      fetched: allQuestions.length,
      oldestUnansweredAt: oldestDate,
      topItems,
      questions: allQuestions.slice(0, 50),
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar perguntas." },
      { status: 500 }
    );
  }
}

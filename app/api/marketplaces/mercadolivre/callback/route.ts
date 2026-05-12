import { NextResponse } from "next/server";

type OAuthState = {
  organizationId?: string;
};

function parseState(state: string | null): OAuthState {
  if (!state) return {};

  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as OAuthState;
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = parseState(requestUrl.searchParams.get("state"));
  const redirectUri = process.env.MERCADOLIVRE_REDIRECT_URI;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? requestUrl.origin;

  if (!code || !state.organizationId) {
    return NextResponse.redirect(`${appUrl}/?ml_status=invalid_callback`);
  }

  if (!redirectUri || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.redirect(`${appUrl}/?ml_status=missing_env`);
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/mercadolivre-oauth`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      code,
      organization_id: state.organizationId,
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    return NextResponse.redirect(`${appUrl}/?ml_status=connection_error`);
  }

  return NextResponse.redirect(`${appUrl}/?ml_status=connected`);
}

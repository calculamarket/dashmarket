import { NextResponse } from "next/server";
import {
  missingMercadoLivreConnectionVariables,
  resolveMercadoLivreRedirectUri
} from "@/lib/marketplaces/mercadolivre-oauth";
import { mercadoLivreAdapter } from "@/lib/marketplaces/mercadolivre";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const siteId = url.searchParams.get("siteId") ?? "MLB";
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID;
  const redirectUri = resolveMercadoLivreRedirectUri(url);
  const missingVariables = missingMercadoLivreConnectionVariables();

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId e obrigatorio." },
      { status: 400 }
    );
  }

  if (missingVariables.length > 0 || !clientId || !mercadoLivreAdapter.buildAuthorizationUrl) {
    return NextResponse.json(
      {
        error: "Mercado Livre ainda nao foi configurado no ambiente.",
        details: `Faltam variaveis: ${missingVariables.join(", ")}.`,
        hint: "Configure essas variaveis na Vercel e publique novamente o projeto."
      },
      { status: 500 }
    );
  }

  const state = Buffer.from(
    JSON.stringify({
      organizationId,
      nonce: crypto.randomUUID()
    })
  ).toString("base64url");

  return NextResponse.json({
    url: mercadoLivreAdapter.buildAuthorizationUrl({
      clientId,
      redirectUri,
      state,
      siteId
    }),
    redirectUri,
    state
  });
}

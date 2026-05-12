# DASHMARKET

Dashboard para acompanhar vendas, estoque, publicidade, anuncios, promocoes e margem de contribuicao por SKU. A primeira integracao prevista e Mercado Livre, com a arquitetura preparada para novos marketplaces.

## O que ja existe

- App Next.js com TypeScript e Tailwind.
- Primeira tela operacional do dashboard.
- Login preparado para Supabase Auth.
- Centro de custos por SKU funcionando na interface demonstrativa.
- Calculo de margem de contribuicao por SKU em `lib/metrics`.
- Registro de marketplace generico em `lib/marketplaces`.
- Adaptador inicial do Mercado Livre.
- Schema Supabase com organizacoes, usuarios, contas de marketplace, produtos, custos, pedidos, estoque, publicidade, promocoes, eventos e snapshots de margem.
- Edge Functions para OAuth e notificacoes do Mercado Livre.

## Rodando localmente

```bash
npm install
npm run dev
```

Depois acesse `http://localhost:3000`.

## Variaveis de ambiente

Use `.env.example` como base:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MERCADOLIVRE_CLIENT_ID=
MERCADOLIVRE_CLIENT_SECRET=
MERCADOLIVRE_REDIRECT_URI=http://localhost:3000/api/marketplaces/mercadolivre/callback
```

## Supabase

A migration principal esta em:

```bash
supabase/migrations/20260512000000_initial_dashmarket_schema.sql
```

Ela cria a base multiempresa e multi-marketplace. Tokens ficam separados em `marketplace_account_credentials`, sem politica publica de acesso, para serem manipulados somente por rotas/Edge Functions com chave de servico.

Edge Functions criadas:

- `supabase/functions/mercadolivre-oauth`
- `supabase/functions/mercadolivre-notifications`

## Mercado Livre

Rotas do app:

- `GET /api/marketplaces/mercadolivre/auth-url`
- `GET /api/marketplaces/mercadolivre/callback`

Fluxo planejado:

1. A tela solicita uma URL de autorizacao para uma organizacao.
2. O vendedor autoriza o aplicativo no Mercado Livre.
3. O callback recebe o `code`.
4. A Edge Function troca o `code` por tokens e consulta `/users/me`.
5. A conta e as credenciais sao salvas no Supabase.
6. As notificacoes do Mercado Livre entram pela Edge Function de eventos.

## Preparacao para outros marketplaces

Os dados usam `provider` e nao nomes fixos em tabelas principais. Para adicionar outro canal, o caminho previsto e:

1. Criar um adapter em `lib/marketplaces`.
2. Registrar o adapter em `lib/marketplaces/registry.ts`.
3. Criar a funcao de OAuth/webhook quando o marketplace exigir.
4. Mapear vendas, estoque, anuncios e promocoes para as tabelas genericas.

## Deploy

O projeto esta pronto para ir para GitHub e Vercel quando as credenciais existirem. Na Vercel, configure as mesmas variaveis de ambiente do `.env.example`. No Mercado Livre, a URL de callback precisa apontar para o dominio publicado.

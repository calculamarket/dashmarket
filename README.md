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
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MERCADOLIVRE_CLIENT_ID=
MERCADOLIVRE_CLIENT_SECRET=
MERCADOLIVRE_REDIRECT_URI=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_GRAPH_VERSION=v25.0
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE_NAME=
EVOLUTION_WEBHOOK_SECRET=
DASHMARKET_WHATSAPP_ALLOWED_PHONES=5511999999999
DASHMARKET_WHATSAPP_ORGANIZATION_ID=
```

Para o Supabase no navegador, use `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Se a Vercel estiver com
`SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEY` sem o prefixo `NEXT_PUBLIC_`,
o build tambem publica esse valor para o app.
Como fallback, o projeto ja traz a URL e a chave publishable publica do Supabase
do DASHMARKET para evitar que o login quebre quando a Vercel nao expor variaveis
publicas no bundle.

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
4. A rota de callback troca o `code` por tokens e consulta `/users/me`.
5. A conta e as credenciais sao salvas no Supabase.
6. As notificacoes do Mercado Livre entram pela Edge Function de eventos.

Em producao, deixe `NEXT_PUBLIC_APP_URL` e `MERCADOLIVRE_REDIRECT_URI`
vazias ou configure ambas com o dominio publicado. Se elas estiverem com
`localhost` na Vercel, o app ignora esse valor e usa o dominio atual para evitar
erro no OAuth. No aplicativo do Mercado Livre, cadastre a URL de callback:

```bash
https://dashmarketml.vercel.app/api/marketplaces/mercadolivre/callback
```

## WhatsApp

Rota do assistente:

- `GET /api/whatsapp/webhook` para verificacao do webhook da Meta.
- `POST /api/whatsapp/webhook` para receber perguntas e responder pelo WhatsApp via Meta Cloud API ou Evolution API.

Callback URL na Meta/Vercel:

```bash
https://SEU-DOMINIO.vercel.app/api/whatsapp/webhook
```

O assistente responde perguntas simples como:

- `qual e meu lucro deste mes?`
- `quanto vendi ontem?`
- `quantos pedidos tive hoje?`
- `como esta o ADS deste mes?`

Para autorizar seu telefone, execute a migration `20260515010000_whatsapp_assistant.sql` e cadastre o numero em `whatsapp_contacts` com DDI/DDD apenas em numeros, por exemplo `5511999999999`. Em projetos de uma empresa só, tambem e possivel usar `DASHMARKET_WHATSAPP_ALLOWED_PHONES` e `DASHMARKET_WHATSAPP_ORGANIZATION_ID`.

### Usando Evolution API

Configure estas variaveis na Vercel:

```bash
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_apikey
EVOLUTION_INSTANCE_NAME=nome_da_instancia
DASHMARKET_WHATSAPP_ALLOWED_PHONES=55DDDNUMERO
DASHMARKET_WHATSAPP_ORGANIZATION_ID=id_da_empresa_no_supabase
```

Na Evolution, configure o webhook da instancia para:

```bash
https://dashmarketml.vercel.app/api/whatsapp/webhook
```

Evento necessario:

```bash
MESSAGES_UPSERT
```

Para adicionar uma protecao extra, defina `EVOLUTION_WEBHOOK_SECRET` na Vercel e envie o mesmo valor no webhook como header `x-dashmarket-webhook-secret` ou como query string `?token=...`.

## Preparacao para outros marketplaces

Os dados usam `provider` e nao nomes fixos em tabelas principais. Para adicionar outro canal, o caminho previsto e:

1. Criar um adapter em `lib/marketplaces`.
2. Registrar o adapter em `lib/marketplaces/registry.ts`.
3. Criar a funcao de OAuth/webhook quando o marketplace exigir.
4. Mapear vendas, estoque, anuncios e promocoes para as tabelas genericas.

## Deploy

O projeto esta pronto para ir para GitHub e Vercel quando as credenciais existirem. Na Vercel, configure as mesmas variaveis de ambiente do `.env.example`. No Mercado Livre, a URL de callback precisa apontar para o dominio publicado.

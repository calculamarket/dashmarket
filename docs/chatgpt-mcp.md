# DASHMARKET MCP para ChatGPT

O ChatGPT nao acessa o MCP local do Claude/Codex. Para ele, o DASHMARKET
expoe um endpoint HTTP privado no proprio projeto da Vercel.

## Endpoint

```text
https://dashmarketml.vercel.app/mcp/SEU_SEGREDO
```

Troque `SEU_SEGREDO` pelo valor configurado na variavel
`DASHMARKET_MCP_CONNECTOR_SECRET`.

## Variaveis na Vercel

Configure estas variaveis em **Project Settings > Environment Variables**:

```env
DASHMARKET_MCP_CONNECTOR_SECRET=crie-um-texto-longo-e-dificil
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
MERCADOLIVRE_CLIENT_ID=...
MERCADOLIVRE_CLIENT_SECRET=...
```

O endpoint nao altera vendas, anuncios, campanhas, estoque ou precos. As
ferramentas continuam somente leitura.

## Ferramentas disponiveis

- `search`
- `fetch`
- `dashmarket_get_sales_summary`
- `dashmarket_get_full_inventory`
- `dashmarket_get_ads_summary`
- `dashmarket_get_sku_margin`
- `dashmarket_audit_orders`

O ChatGPT usa `search` e `fetch` para descobrir e carregar conteudo do
conector. As demais ferramentas continuam disponiveis para clientes MCP que
expoem chamadas diretas.

## Conexao no ChatGPT

1. Abra o ChatGPT.
2. Va em **Settings > Connectors**.
3. Escolha criar/adicionar conector em modo desenvolvedor.
4. Use a URL do endpoint com o segredo.
5. Teste com:

```text
Use o conector DASHMARKET e me diga quanto vendi neste mes.
```

Para publicar para outras pessoas, o caminho correto e trocar a URL secreta por
OAuth. Para uso pessoal, a URL secreta reduz o risco sem criar a complexidade de
um aplicativo publico.

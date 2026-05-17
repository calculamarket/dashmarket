# DASHMARKET MCP Server

Servidor MCP local para consultar dados do DASHMARKET com seguranca.

Esta primeira versao e somente leitura. Ela nao altera anuncios, precos, estoque,
campanhas, pedidos ou qualquer configuracao da conta Mercado Livre.

## Ferramentas

- `dashmarket_get_sales_summary`: resumo de vendas, custos, ADS e margem.
- `dashmarket_get_full_inventory`: estoque Full, quantidade e valor estimado.
- `dashmarket_get_ads_summary`: investimento, receita atribuida, TACOS e ACOS.
- `dashmarket_get_sku_margin`: margem por SKU.
- `dashmarket_audit_orders`: compara vendas locais com status atual na API do Mercado Livre.

## Variaveis

Use as mesmas chaves do DASHMARKET:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DASHMARKET_ORGANIZATION_ID=
MERCADOLIVRE_CLIENT_ID=
MERCADOLIVRE_CLIENT_SECRET=
```

`DASHMARKET_ORGANIZATION_ID` e opcional. Se nao for informado, o MCP usa a
primeira empresa encontrada no Supabase.

`MERCADOLIVRE_CLIENT_ID` e `MERCADOLIVRE_CLIENT_SECRET` so sao usados para
renovar token expirando durante consultas de auditoria. Nenhuma ferramenta muda
a conta do Mercado Livre.

## Rodar localmente

```powershell
cd mcp
npm install
npm run build
npm run start
```

Configuracao exemplo para um cliente MCP local:

```json
{
  "mcpServers": {
    "dashmarket": {
      "command": "node",
      "args": ["C:/caminho/para/dashmarket/mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://seu-projeto.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "sua-service-role",
        "DASHMARKET_ORGANIZATION_ID": "uuid-da-empresa"
      }
    }
  }
}
```

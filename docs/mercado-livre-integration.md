# Integracao Mercado Livre

Este documento registra a primeira direcao tecnica do conector Mercado Livre do DASHMARKET.

## Fontes oficiais consultadas

- Autenticacao e autorizacao: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao
- Recomendacoes de autenticacao e token: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao/desenvolvimento-seguro
- Notificacoes: https://developers.mercadolivre.com.br/pt_br/produto-receba-notificacoes
- Orders: https://developers.mercadolivre.com.br/devcenter/gerenciamento-de-vendas
- Estoque distribuido: https://developers.mercadolivre.com.br/pt_br/convivencia-me1-me2/estoque-distribuido
- Product Ads: https://developers.mercadolivre.com.br/pt_br/product-ads-leitura
- Brand Ads: https://developers.mercadolivre.com.br/pt_br/ads-brand-ads
- Promocoes: https://developers.mercadolivre.com.br/pt_br/usuarios-e-aplicativos/gerenciar-ofertas

## OAuth

O adapter em `lib/marketplaces/mercadolivre.ts` monta a URL de autorizacao por site. Para Brasil, usa `MLB` e o host `https://auth.mercadolivre.com.br`.

O callback do app chama a Edge Function `mercadolivre-oauth`, que:

1. troca o `code` por tokens em `https://api.mercadolibre.com/oauth/token`;
2. consulta `https://api.mercadolibre.com/users/me`;
3. cria ou atualiza `marketplace_accounts`;
4. salva tokens em `marketplace_account_credentials`.

## Notificacoes

A Edge Function `mercadolivre-notifications` recebe eventos e grava em `marketplace_events`. O processamento de cada evento deve ser feito em uma etapa seguinte, respeitando `topic` e `resource`.

Topicos prioritarios para o DASHMARKET:

- `orders_v2` para novas vendas e alteracoes;
- `items` ou recursos equivalentes para mudancas de anuncios;
- `stock_locations` para mudancas ligadas a estoque de User Products;
- topicos de promocoes quando habilitados na aplicacao.

## Dados a sincronizar

Primeiro ciclo recomendado:

1. Contas e dados do vendedor.
2. Anuncios e SKUs.
3. Pedidos e itens vendidos.
4. Custos de venda, taxas e fretes.
5. Estoque Full e outras modalidades.
6. Product Ads e metricas por SKU.
7. Promocoes ativas e historicas.
8. Snapshots de margem de contribuicao.

## Observacoes de modelagem

- O custo interno fica no DASHMARKET, por SKU e periodo.
- O que vem do Mercado Livre deve ser salvo com `raw_payload` para auditoria.
- Custos de publicidade devem entrar no calculo de margem no periodo em que ocorreram.
- Tokens ficam fora das tabelas consultadas pela interface.

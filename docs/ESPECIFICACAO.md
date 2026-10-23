# Especificação funcional (observada do Utmify, versão pública + conta gratuita)

Fonte: página de apresentação e painel de uma conta nova (sem dados). Nada foi copiado: isto descreve **o que** o produto faz.

## Telas do painel
| Tela | O que faz |
|---|---|
| Resumo | Filtros (período, conta, fonte, plataforma, produto) + cartões: faturamento líquido, gastos, ROAS, lucro, ROI, margem, vendas pendentes/reembolsadas, impostos, custos de produto, taxas; vendas por produto/pagamento/fonte; taxa de aprovação (cartão, Pix, boleto) |
| Meta / Google / Kwai / TikTok / Taboola | Abas Contas, Campanhas, Conjuntos, Anúncios com colunas: status, orçamento, vendas, CPA, gastos, faturamento, lucro, ROAS, margem, ROI, CPC, CTR, CPM, impressões, cliques |
| UTMs | Relatório agrupável por utm_campaign/medium/content/source/term, exportável |
| Integrações | Anúncios (conectar contas), Webhooks (plataformas de venda), UTMs, Pixel, WhatsApp, Testes |
| Regras | Regras automáticas por plataforma (ex.: pausar se CPA alto) |
| Taxas | Imposto sobre anúncios Meta, imposto adicional, taxas, custo por produto |
| Despesas | Despesas manuais por categoria (Tráfego, Ferramentas, Funcionários, Contabilidade, Outros) |
| Relatórios | Série por dia ou por hora |
| Eventos | Log de eventos do pixel (status, plataforma, evento, página) e funil |
| Notificações, Assinatura, Conta, Suporte | Fora do escopo |

## Fórmulas
- Lucro = faturamento líquido − gastos com anúncios − imposto Meta − imposto sobre vendas − custo de produtos − taxas − despesas
- ROAS = faturamento / gastos · ROI = lucro / gastos · Margem = lucro / faturamento · CPA = gastos / vendas

## Como funciona o rastreio (conceito)
1. Script (pixel) no site guarda os UTMs do visitante e os repassa ao checkout.
2. A plataforma de vendas avisa cada venda por webhook; a venda é ligada à campanha pelos UTMs.
3. Gastos vêm da API do anúncio (aqui: planilha CSV ou lançamento manual).
4. O painel cruza vendas × gastos por campanha.

---
# Mapeamento complementar (2ª passada)

## Integrações (abas)
- **Anúncios:** Meta Ads, Google Ads, Kwai Ads, TikTok Ads (e Taboola no menu). Meta: botão "Adicionar perfil" abre login do Facebook (OAuth). Kwai: precisa estar logado no Business Center; oferece "continuar neste navegador" ou "copiar link" para conectar em outro navegador/colaborador.
- **Webhooks:** escolhe a plataforma de venda, dá um nome e recebe uma URL; salvar/apagar pede confirmação 2FA. Há também "Credenciais de API" (nome → chave) para outras ferramentas.
  Plataformas (~200): Hotmart, Kiwify, Cartpanda, Vega, Kirvano, Shopify, PerfectPay, Yampi, Lastlink, Stripe, Payt, JVZoo, Logzz, Adoorei, TriboPay, Paradise, Clickbank, Ticto, Eduzz, Braip, Pepper, WooCommerce, BuyGoods, MundPay, Disrupty, Greenn, Monetizze, Guru, Digistore, Hubla, Doppus, Frendz, InvictusPay, Appmax, NitroPagamentos, GoatPay, Hebreus, IExperience, PagTrust, NuvemShop, FortPay, Systeme, IronPay, Cakto, Voomp, Xgrow, Lowify, Membriz… (lista completa vista no painel).
- **UTMs:** gera "código de UTMs" por fonte (Facebook, Google, Kwai, TikTok, Taboola) para colar nos anúncios; script de UTMs para páginas de venda; script de *back redirect* com UTMs; gerador de UTM orgânica (URL, source, medium, campaign, content, term, parâmetros personalizados como xcod/sck); suporte a Typebot.
- **Pixel:** lista de pixels ("Adicionar Pixel") + tutorial em vídeo.
- **WhatsApp:** cadastro de números.
- **Testes:** escolhe fonte (Meta/Google), plataforma (Hotmart/Cartpanda/Outra), se usa o pixel; gera um link de teste, o usuário percorre o funil até gerar um pagamento e o teste aparece em "Últimos testes" (com e-mail de confirmação).

## Regras (criar regra personalizada) — Meta, Google (beta), Kwai
Campos: nome · produto · contas de anúncio · aplicar a (ex.: campanhas ativas) · filtrar por nome · **ação** (ativar, pausar, …) · nível das condições (objeto campanha/conjunto/anúncio) · **condições** (lista, botão +) · período de cálculo (hoje, …) · **frequência** (a cada 15 min, …) · intervalo de execução · limite de execuções por dia. Tabela de regras: status, nome/produto, aplicada a, ação e condição, frequência/período. Há exportar/importar regras.

## Notificações
- **Venda:** envia no app venda pendente e/ou aprovada; escolhe mostrar valor (comissão/total/líquido/esconder), nome do produto, valor de utm_campaign, nome do dashboard; com prévia.
- **Relatório:** horários 08h, 12h, 18h, 23h; padrão (status de lucro, resumo detalhado, notificações criativas).

## Avançado / conta
- **Dashboards múltiplos:** cada um com tipo de faturamento (normal…), fuso (GMT-3), moeda (BRL), "contabilizar juros".
- **Integração MCP** e **Colaboradores:** só em plano pago.
- **Segurança:** 2FA por app autenticador; aviso de senha vazada; verificação de telefone (WhatsApp/SMS) obrigatória.
- **Outros:** Assinatura (cancelar com oferta de suporte VIP), Indique e Ganhe 10%, Suporte, Novidades (feed + opt-in de notificações), Aplicativo (Android/iOS), programa de prêmios por faturamento trackeado (meta R$ 1M), tema claro/escuro, idioma.

## Ideias para versões futuras do MeuTrack (derivadas do mapeamento)
1. Webhooks com formatos específicos por plataforma (Hotmart, Kiwify, Cartpanda primeiro).
2. Gerador de UTMs pronto para colar nos anúncios + gerador de UTM orgânica.
3. Teste guiado de integração (link de teste → venda → confirmação).
4. Regras completas (condições múltiplas, frequência, limite diário) + execução real via API do Meta.
5. Notificações de venda e resumos por horário (e-mail ou Telegram).
6. Vários dashboards (fuso, moeda), 2FA, colaboradores.

---
# Aviso sobre os Termos de Uso do Utmify
Os Termos de Uso do Utmify (cláusula 4.4 e item (h)) proíbem realizar engenharia reversa dos componentes da plataforma e criar produtos derivados de conteúdo dela. A exploração deste projeto foi encerrada: **não** ler o código-fonte nem os arquivos internos da plataforma. O que consta aqui vem de textos visíveis na tela e de conceitos padrão do mercado (ROAS, ROI, CPA, MRR, churn etc.). Uso pessoal; não distribuir nem vender o programa.

## Métricas (conceitos padrão) a oferecer no MeuTrack
Geral: faturamento bruto e líquido, gastos, ROAS, lucro, ROI, margem, ARPU, CPA, leads, vendas por produto/pagamento/fonte/src/posicionamento, taxa de aprovação, reembolso, chargeback, custos de produto, gastos adicionais.
Gráficos: vendas por país, por horário, por dia; lucro por horário; funil de conversão.
Impostos: imposto sobre anúncios, sobre vendas, total.
Recorrência: MRR, ARR, ARPU recorrente, churn, assinantes ativos (produto marcado como mensal/anual).

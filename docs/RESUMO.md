# MeuTrack — resumo do que foi feito e do que falta

Documento de acompanhamento. Atualizado na data do último commit deste arquivo.

## 1. Ponto de partida
O objetivo foi montar um programa próprio, de uso pessoal, inspirado nas funções do Utmify (rastreamento de vendas por campanha de anúncio). O método do repositório de referência (REA) serve para apps locais, não para serviços em nuvem, então a análise foi feita pelo comportamento visível:
- páginas públicas do Utmify;
- telas de uma conta gratuita nova (sem dados), com verificação de telefone feita pelo próprio usuário;
- textos visíveis do painel, como as métricas disponíveis.

**Limite assumido:** os Termos de Uso do Utmify proíbem engenharia reversa da plataforma e produtos derivados do conteúdo dela. Depois de encontrar essa cláusula, a exploração foi encerrada: o código-fonte e os arquivos internos do Utmify não foram lidos. O programa foi escrito do zero. Uso pessoal; antes de vender ou distribuir, consulte um advogado.

## 2. O que existe hoje
**Estrutura:** Node.js puro com banco SQLite embutido (sem instalar dependências), painel web no navegador, tema claro/escuro/automático.

**Menu (18 itens):**
- Principal: Resumo, Vendas, Relatórios.
- Anúncios: Meta, Google, YouTube, TikTok, Kwai e "Todas as redes" (cada uma com Contas, Campanhas, Conjuntos e Anúncios).
- Análise: Saúde do rastreamento, UTMs, Eventos do pixel.
- Configuração: Integrações, Regras, Custos (Impostos e taxas, Produtos, Despesas), Notificações.
- Conta: Avançado, Ajuda.

**Resumo:** resultado do período (lucro líquido, status, meta), indicadores com explicação ("?") e comparação com o período anterior, gráfico de faturamento/gastos/lucro por dia, "para onde foi o dinheiro", funil horizontal de conversão, vendas por horário, donuts (pagamento, fonte, produto, plataforma) e rankings de campanhas. Dá para personalizar o que aparece.

**Rastreamento:**
- Webhook para qualquer plataforma de vendas (lista de 167 nomes + "Outra"), com leitura de vários formatos e registro do que chegou.
- Pixel para o site, com captura de UTM e funil.
- Importação de gastos por CSV (Meta, Google, YouTube, TikTok, Kwai), sem duplicar ao reimportar.
- Códigos de UTM por rede e gerador de UTM orgânica.

**Análises e controle:** custos e taxas, despesas, recorrência (MRR, ARR, churn), regras com várias condições, notificações no Telegram, vários dashboards (fuso e moeda), backup em JSON, página de saúde do rastreamento (7 verificações).

**Segurança e aparência:** troca de senha pelo painel (senha guardada protegida), bloqueio após 5 tentativas erradas, escolha de nome e cor com sugestões.

## 3. Como foi verificado
- Servidor testado por requisições com amostras no formato de Hotmart, Kiwify, Stripe, Shopify e Eduzz.
- Painel testado no navegador (claro e escuro): todas as telas abrem sem erro, sem rolagem horizontal e sem blocos estourando; ações principais exercitadas (criar regra, salvar custos, criar dashboard, trocar senha, filtros).
- Tudo com **dados de exemplo**. Nada foi testado com vendas reais, pixel num site real ou envio ao Telegram.

## 4. Pendências

### Dependem do usuário
1. **Lista de plataformas de venda usadas.** Os formatos foram escritos de forma genérica; cada plataforma precisa ser conferida com uma venda real e ajustada se vier errada (veja "Últimos recebidos" em Integrações → Webhooks).
2. **Trocar a senha inicial** (`admin123`) e **escolher nome e cor** (Avançado).
3. **Apagar os dados de exemplo** antes do uso real (Integrações → Testes).
4. **Credenciais das APIs de anúncios**, para a conexão automática (ver abaixo).
5. **Criar o bot no Telegram** (@BotFather) para ativar avisos de venda e resumos.

### A construir
1. **Colocar o programa na internet** (URL pública com HTTPS). Sem isso o pixel do site e o webhook das plataformas não alcançam o programa. É a pendência mais importante para usar de verdade.
2. **Conexão automática com Meta Ads e Google Ads (inclui YouTube)**, no lugar da importação por CSV. Fica para quando houver credenciais, para testar com contas reais. As APIs não têm custo de uso (fontes: documentação do Google Ads e fontes secundárias sobre o Meta); a aprovação do token de desenvolvedor do Google pode demorar. Confirmar sempre nas páginas oficiais.
3. **TikTok e Kwai:** conferir as variáveis de UTM (as do Kwai são um palpite) e, depois, as APIs.
4. **Regras com ação real:** hoje só "Avisar no Telegram" age; pausar, ativar e mudar orçamento são simulados e dependem das APIs dos anúncios.
5. **Página Clientes:** valor gasto por cliente, recompra, assinantes e cancelamentos.
6. **Vários usuários e 2FA**, se mais alguém for usar.
7. **Estilo das telas secundárias:** Campanhas, Vendas e Regras usam o visual de tabela mais simples; podem ser levadas ao mesmo padrão do Resumo.

### Limites conhecidos
- Resumos e avisos só saem com o programa aberto no computador.
- Conjuntos e anúncios só aparecem se a planilha tiver essas colunas e o UTM seguir o formato "nome|id".
- O funil só tem etapas intermediárias reais depois de instalar o pixel.
- Os dados ficam em `data.db` (um arquivo por dashboard); fazer cópia para guardar o histórico.
- Não há app de celular (o painel funciona no navegador do celular).

## 5. Decisões já tomadas
- Manter as páginas por rede separadas (não juntar em uma única página com abas).
- Manter "Eventos do pixel" no menu.
- Juntar Despesas e Taxas em "Custos" (feito) e criar "Saúde do rastreamento" (feito).
- Repositório privado; a especificação das telas foi enviada junto, em `docs/ESPECIFICACAO.md`.
- Conexão automática com as APIs: adiada até haver credenciais.

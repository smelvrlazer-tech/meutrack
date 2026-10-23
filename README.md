# MeuTrack — rastreador de vendas e campanhas

Programa próprio para acompanhar vendas, gastos e lucro por campanha. Redes: Meta (Facebook + Instagram), Google, YouTube, TikTok e Kwai. Vendas de qualquer plataforma por webhook (167 nomes na lista, mais "Outra").
Uso pessoal. Não distribua nem venda sem antes ler a seção "Aviso" abaixo.

## Como abrir
Dois cliques em `iniciar.bat` (precisa do Node.js 22+). O painel abre em http://localhost:3000.
Senha inicial `admin123`. **Troque** em Avançado → Segurança (a senha fica guardada de forma protegida, ninguém consegue lê-la em `config.json`). O nome e a cor do programa mudam em Avançado → Aparência, que também sugere opções.

## Organização do painel
- **Principal:** Resumo em três níveis — (1) resultado do período (lucro líquido, status e meta), (2) indicadores principais com "?" explicando cada número e comparação com o período anterior, (3) gráficos e rankings em grade (faturamento/gastos/lucro por dia, para onde foi o dinheiro, funil, horários, pagamentos, fontes, produtos, campanhas). Você escolhe o que ver em "Personalizar o Resumo". Depois: Vendas e Relatórios (por dia/hora).
- **Funil de conversão:** horizontal, do clique à venda aprovada (cliques, visitas, viu a oferta, checkout, venda iniciada, venda aprovada). A altura de cada etapa segue a porcentagem real e muda com os filtros (por exemplo, só Meta). Cliques vêm dos gastos importados; visitas e checkout vêm do pixel; vendas vêm do webhook.
- **Anúncios:** uma página por rede (Contas, Campanhas, Conjuntos, Anúncios) e "Todas as redes".
- **Análise:** Saúde do rastreamento (diagnóstico do que pode estar errado nos números), UTMs (agrupar por campanha/medium/content/source/term) e Eventos do pixel.
- **Configuração:** Integrações, Regras, Custos (abas Impostos e taxas, Produtos e Despesas) e Notificações.
- **Conta:** Avançado (vários dashboards, fuso, moeda, backup) e Ajuda.
- Tema **claro, escuro ou automático** (botão no topo). Filtros: período (inclusive personalizado), conta, fonte, plataforma de venda, produto, pagamento, chargeback e busca.

## Primeiros passos
1. **Integrações → Testes → Carregar dados de exemplo** para conhecer as telas (depois "Apagar").
2. **Custos:** impostos por rede, taxas, custo e recorrência dos produtos.
3. **Integrações → Códigos de UTM:** cole o código em cada anúncio (formato "nome|id").
4. **Integrações → Webhooks:** escolha a plataforma, copie o endereço e cole nela. Confira "Últimos recebidos".
5. **Integrações → Gastos:** exporte o CSV por dia de cada rede e importe (um nível só por conta).
6. **Pixel (opcional):** script na página de vendas — alimenta funil, leads e recuperação de UTM.
7. **Notificações (opcional):** vendas e resumos no Telegram (crie um bot com o @BotFather).

## Regras
Várias condições, nível (campanha/conjunto/anúncio), período, frequência e limite diário. **Só "Avisar no Telegram" age de verdade**; pausar/ativar/orçamento são simulados porque exigem conectar as APIs dos anúncios.

## Limites atuais
- Gastos entram por CSV (sem conexão automática com as APIs de Meta/Google/TikTok/Kwai).
- Roda no seu computador; para pixel e webhook funcionarem de fora precisa de URL pública com HTTPS (hospedagem ou túnel). Troque a senha antes.
- Resumos e avisos só saem com o programa aberto.
- Não há vários usuários, 2FA nem app de celular.
- Webhooks testados só com formatos de exemplo, não com vendas reais.

## Aviso
Os Termos de Uso do Utmify proíbem engenharia reversa da plataforma e produtos derivados do conteúdo dela. Este programa foi escrito do zero, a partir de textos visíveis e de métricas padrão de mercado, e a exploração da plataforma foi encerrada. Mesmo assim, o risco jurídico é seu: mantenha o uso pessoal e, se for comercializar, consulte um advogado.

## Para quem baixar o código (GitHub)
- Precisa do Node.js 22 ou mais novo. Rode `node server.js` (ou `npm start`) e abra http://localhost:3000.
- Na primeira execução o programa cria `config.json` sozinho (senha inicial `admin123`, que deve ser trocada em Avançado → Segurança).
- **Nunca suba `config.json` nem `data.db` para o repositório**: guardam a senha (protegida), os endereços secretos dos webhooks e todas as vendas. O `.gitignore` já bloqueia esses arquivos. Use `config.example.json` como modelo.

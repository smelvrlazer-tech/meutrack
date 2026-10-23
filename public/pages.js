'use strict';
// ===== Páginas do painel (usam os componentes de app.js) =====
const badge = (txt, kind = '') => `<span class="badge ${kind}">${esc(txt)}</span>`;
const STATUS_PT = { paid: ['Aprovada', 'ok'], pending: ['Pendente', 'warn'], refunded: ['Reembolsada', 'bad'], chargeback: ['Chargeback', 'bad'], canceled: ['Cancelada', ''] };
const ADCOLS = (lvl) => lvl === 'accounts' ? COLS : [
  { k: 'status', l: 'Status', left: true, html: (r) => r.status ? badge(r.status, r.status === 'Ativa' ? 'ok' : r.status === 'Pausada' ? 'warn' : '') : '—' },
  { k: 'orcamento', l: 'Orçamento', f: money }, { k: 'atualizado', l: 'Últ. atualização', left: true, f: (x) => x || '—' }, ...COLS];

// ---------- Resumo: resultado → indicadores → gráficos → listas ----------
const rec = (j, k, f) => j.recorrencia ? f(j.recorrencia[k]) : '—';
// id, grupo, rótulo, valor, chave p/ comparar, "subir é bom?", explicação, detalhe
const MET = [
  ['faturamento', 'Principais', 'Faturamento líquido', (j) => money(j.faturamento), 'faturamento', 1, 'Tudo o que entrou de vendas aprovadas, sem contar reembolsos.'],
  ['gastos', 'Principais', 'Gastos com anúncios', (j) => money(j.gastos), 'gastos', 0, 'Quanto você investiu em anúncios no período.'],
  ['lucro', 'Principais', 'Lucro líquido', (j) => money(j.lucro), 'lucro', 1, 'O que sobra: faturamento menos anúncios, impostos, custo dos produtos, taxas e despesas.'],
  ['roas', 'Principais', 'ROAS', (j) => dec(j.roas), 'roas', 1, 'Quantos reais voltam para cada R$ 1 gasto em anúncio. Acima de 1 você recupera o investimento.'],
  ['roi', 'Principais', 'ROI', (j) => pct(j.roi), 'roi', 1, 'Lucro sobre o que foi gasto em anúncios. 100% significa que você dobrou o investimento.'],
  ['margem', 'Principais', 'Margem de lucro', (j) => pct(j.margem), 'margem', 1, 'De cada R$ 100 vendidos, quanto virou lucro.'],
  ['vendas', 'Principais', 'Vendas aprovadas', (j) => dec(j.vendas), 'vendas', 1, 'Quantidade de pedidos pagos.'],
  ['ticket', 'Vendas', 'Ticket médio', (j) => money(j.ticket), 'ticket', 1, 'Valor médio de cada venda.'],
  ['cpa', 'Vendas', 'CPA', (j) => money(j.cpa), 'cpa', 0, 'Custo por aquisição: quanto de anúncio foi gasto para cada venda.'],
  ['arpu', 'Vendas', 'ARPU', (j) => money(j.arpu), 'arpu', 1, 'Faturamento médio por cliente.'],
  ['leads', 'Vendas', 'Leads', (j) => dec(j.leads), 'leads', 1, 'Contatos captados (evento Lead do pixel).'],
  ['pendentes', 'Vendas', 'Vendas pendentes', (j) => money(j.pendentes), 'pendentes', 1, 'Boletos e Pix gerados e ainda não pagos. Podem virar venda.', (j) => `${j.qtdPendentes} pedido(s)`],
  ['reembolsadas', 'Vendas', 'Reembolsadas', (j) => money(j.reembolsadas), 'reembolsadas', 0, 'Dinheiro devolvido (reembolso e chargeback).'],
  ['reembolsoPct', 'Vendas', 'Taxa de reembolso', (j) => pct(j.reembolsoPct), 'reembolsoPct', 0, 'De cada 100 pedidos, quantos foram devolvidos. Acima de 10% merece atenção.'],
  ['chargeback', 'Vendas', 'Chargeback', (j) => money(j.chargeback), 'chargeback', 0, 'O cliente contestou a compra no cartão. Muitos casos podem bloquear sua conta de pagamento.', (j) => `${j.qtdChargeback} pedido(s)`],
  ['custoProdutos', 'Custos e impostos', 'Custo dos produtos', (j) => money(j.custoProdutos), 'custoProdutos', 0, 'Quanto custa entregar o que foi vendido (cadastrado em Custos).'],
  ['taxas', 'Custos e impostos', 'Taxas', (j) => money(j.taxas), 'taxas', 0, 'Taxas da plataforma de venda e outras cobranças.'],
  ['despesas', 'Custos e impostos', 'Despesas adicionais', (j) => money(j.despesas), 'despesas', 0, 'Despesas lançadas à mão (ferramentas, equipe, contador).'],
  ['impostoVendas', 'Custos e impostos', 'Imposto sobre vendas', (j) => money(j.impostoVendas), 'impostoVendas', 0, 'Imposto calculado sobre o faturamento.'],
  ['impostoAnuncios', 'Custos e impostos', 'Imposto sobre anúncios', (j) => money(j.impostoAnuncios), 'impostoAnuncios', 0, 'Imposto cobrado sobre o que você gasta nas redes.'],
  ['mrr', 'Recorrência', 'MRR', (j) => rec(j, 'mrr', money), null, 1, 'Receita mensal recorrente: o que entra todo mês de assinaturas ativas.'],
  ['arr', 'Recorrência', 'ARR', (j) => rec(j, 'arr', money), null, 1, 'MRR × 12: projeção anual da receita recorrente.'],
  ['arpuRec', 'Recorrência', 'ARPU da recorrência', (j) => rec(j, 'arpu', money), null, 1, 'Valor médio mensal por assinante.'],
  ['churn', 'Recorrência', 'Churn', (j) => rec(j, 'churn', pct), null, 0, 'Parte dos assinantes que deixou de renovar.'],
  ['ativos', 'Recorrência', 'Assinantes ativos', (j) => rec(j, 'ativos', dec), null, 1, 'Clientes com assinatura em dia.'],
];
const BLOCKS = [
  ['hero', 'Resultado do período e meta'], ['insights', 'Pontos de atenção'], ['gDia', 'Gráfico: faturamento, gastos e lucro por dia'], ['dinheiro', 'Para onde foi o dinheiro'],
  ['funil', 'Funil de conversão'], ['gHora', 'Vendas por horário'], ['pagamento', 'Formas de pagamento'], ['fonte', 'Fontes de tráfego'], ['produto', 'Produtos'], ['plataforma', 'Plataformas de venda'],
  ['aprovacao', 'Taxa de aprovação por pagamento'], ['posicionamento', 'Posicionamentos'], ['src', 'Origem (utm_source)'], ['pais', 'Países'], ['ranking', 'Ranking de campanhas'],
];
const DEFAULT_SEL = ['faturamento', 'gastos', 'roas', 'roi', 'margem', 'vendas', 'ticket', 'cpa', 'pendentes', 'reembolsoPct', 'custoProdutos', 'taxas', 'impostoVendas', 'impostoAnuncios',
  'hero', 'insights', 'gDia', 'dinheiro', 'funil', 'gHora', 'pagamento', 'fonte', 'produto', 'ranking'];
const sel = () => store.get('metrics3', DEFAULT_SEL);
function prevQs() {
  const [f, t] = range(); if (!f) return null;
  const a = new Date(f + 'T00:00:00'), b = new Date((t || f) + 'T00:00:00'), n = Math.round((b - a) / 864e5) + 1;
  return qs({ from: isoLocal(new Date(a - n * 864e5)), to: isoLocal(new Date(a - 864e5)) });
}
function insightsOf(j, camps, rep) {
  const out = [], real = camps.filter((c) => c.nome !== '(sem UTM)' && (c.gastos > 0 || c.vendas > 0));
  const best = real.slice().sort((a, b) => b.lucro - a.lucro)[0], worst = real.slice().sort((a, b) => a.lucro - b.lucro)[0];
  if (worst && worst.lucro < 0) out.push(['bad', `<b>${esc(worst.nome)}</b> está no prejuízo (${money(worst.lucro)}). Considere pausar ou ajustar.`]);
  if (j.roas != null && j.roas < 1) out.push(['bad', `Você gasta mais do que fatura em anúncios (ROAS ${dec(j.roas)}).`]);
  if (j.reembolsoPct > 10) out.push(['warn', `${pct(j.reembolsoPct)} dos pedidos foram devolvidos. Vale revisar a oferta ou a entrega.`]);
  if (j.semUtm) out.push(['warn', `${j.semUtm} venda(s) aprovada(s) sem UTM: não dá para saber de qual anúncio vieram.`]);
  if (j.pendentes > 0) out.push(['warn', `${money(j.pendentes)} em vendas pendentes ainda podem entrar.`]);
  if (best && best.lucro > 0) out.push(['pos', `Campanha mais lucrativa: <b>${esc(best.nome)}</b>, com ${money(best.lucro)} de lucro.`]);
  const peak = Math.max(...j.porHora.map((h) => h.vendas)); if (peak > 0) out.push(['', `Horário com mais vendas: <b>${j.porHora.findIndex((h) => h.vendas === peak)}h</b> (${peak} vendas).`]);
  if (rep.length) { const bd = rep.slice().sort((a, b) => b.lucro - a.lucro)[0]; if (bd.lucro > 0) out.push(['', `Melhor dia: <b>${esc(bd.nome.slice(5).split('-').reverse().join('/'))}</b>, com ${money(bd.lucro)} de lucro.`]); }
  return out.length ? out.slice(0, 5) : [['', 'Ainda não há dados suficientes. Conecte as vendas e importe os gastos em Integrações.']];
}

pages.resumo = async (el) => {
  const pq = prevQs();
  const [j, prev, chk, rep, camps, goal] = await Promise.all([api('/api/summary' + qs()), pq ? api('/api/summary' + pq) : null, api('/api/checklist'), api('/api/report' + qs({ by: 'day' })),
    api('/api/campaigns' + qs({ level: 'campaigns' })), api('/api/kv?key=cfg_goal')]);
  const on = new Set(sel()), has = (id) => on.has(id), pend = chk.filter((c) => !c.done && c.id !== 'pixel');
  let html = `<div class="row end"><button class="btn ghost sm" id="btnMetrics">Personalizar o Resumo</button></div>`;

  // nível 1 — o resultado
  if (has('hero')) {
    const none = !j.vendas && !j.gastos, kind = none ? '' : j.lucro > 0 ? 'good' : j.lucro < 0 ? 'bad' : '';
    const status = none ? ['Sem movimento', ''] : j.lucro > 0 ? ['No lucro', 'ok'] : j.lucro < 0 ? ['No prejuízo', 'bad'] : ['Empatado', '']
    const say = none ? 'Quando as vendas e os gastos entrarem, este resumo explica o resultado em palavras simples.'
      : `Você vendeu <b>${money(j.faturamento)}</b> e gastou <b>${money(j.gastos)}</b> em anúncios. Depois de impostos, custos e taxas, ${j.lucro >= 0 ? 'sobraram' : 'faltaram'} <b>${money(Math.abs(j.lucro))}</b>.${j.roas ? ` Cada R$ 1 investido em anúncios retornou <b>${money(j.roas)}</b>.` : ''}`;
    const g = goal.value > 0 ? Math.max(0, j.lucro) / goal.value * 100 : null;
    html += `<div class="summary"><div class="sum-main ${kind}"><div class="sum-top"><span>Lucro líquido</span><span class="pill ${status[1]}">${status[0]}</span></div>
      <div class="sum-val">${money(j.lucro)}</div>${prev ? deltaHtml(j.lucro, prev.lucro, true) : ''}<p>${say}</p></div>
      <div class="goalc"><div class="kl">Meta de lucro</div>${g == null ? '<div class="hint" style="margin:0">Defina uma meta para acompanhar o progresso.</div>'
        : `<div><b style="font-size:22px">${Math.round(g)}%</b> <span class="hint" style="margin:0">${money(Math.max(0, j.lucro))} de ${money(goal.value)}</span></div><div class="prog ${g >= 100 ? 'done' : ''}"><i style="width:${Math.min(100, g)}%"></i></div>`}
      <div><button class="btn ghost sm" id="btnGoal">${g == null ? 'Definir meta' : 'Alterar meta'}</button></div></div></div>`;
  }
  if (pend.length && !store.get('hideChk', false)) html += `<div class="alert warn"><div><b>Falta pouco para começar</b><ul>${pend.map((c) => `<li>• <a data-go="${c.page}" data-tab="${c.tab || ''}">${c.label}</a></li>`).join('')}</ul></div><button class="btn ghost sm" id="hideChk">Ocultar</button></div>`;
  if (S.cfg.defaultPassword) html += `<div class="alert warn"><div><b>Senha inicial em uso.</b> Troque a senha em <a data-go="avancado">Avançado → Segurança</a> antes de colocar o programa na internet.</div></div>`;
  if (has('insights')) html += `<div class="panel"><h3>Pontos de atenção</h3><div class="notes">${insightsOf(j, camps, rep).map(([k, t]) => `<div class="${k}">${t}</div>`).join('')}</div></div>`;

  // nível 2 — indicadores (principais grandes, demais compactos)
  const groups = {};
  for (const m of MET) if (has(m[0]) && !(m[0] === 'lucro' && has('hero'))) (groups[m[1]] ||= []).push(m);
  const cardOf = ([id, , l, f, k, upGood, t, subf]) => kpi({ label: l, value: f(j), tipText: t, sub: subf ? subf(j) : '', delta: prev && k ? deltaHtml(j[k], prev[k], !!upGood) : '', c: id === 'lucro' ? cls(j.lucro) : '' });
  for (const [g, items] of Object.entries(groups)) html += `<div class="sec-title">${g}</div><div class="kpis ${g === 'Principais' ? '' : 'compact'}">${items.map(cardOf).join('')}</div>`;

  // nível 3 — gráficos em grade de 12 colunas
  const days = rep.slice().reverse(), P = [], add = (id, span, title, body) => has(id) && P.push(`<div class="panel s${span}"><h3>${title}</h3>${body}</div>`);
  add('gDia', 8, 'Faturamento, gastos e lucro por dia', areaChart(days.map((d) => d.nome), [{ name: 'Faturamento', color: 'var(--c)', fill: 1, values: days.map((d) => d.faturamento) },
    { name: 'Gastos', color: 'var(--mut)', dash: 1, values: days.map((d) => d.gastos) }, { name: 'Lucro', color: 'var(--ok)', values: days.map((d) => d.lucro) }]));
  if (has('dinheiro')) {
    const base = Math.max(j.faturamento, j.gastos + j.impostoVendas + j.impostoAnuncios + j.custoProdutos + j.taxas + j.despesas, 1);
    const parts = [['Anúncios', j.gastos, RAMP[0]], ['Impostos', j.impostoVendas + j.impostoAnuncios, RAMP[1]], ['Custo dos produtos', j.custoProdutos, RAMP[2]], ['Taxas', j.taxas, RAMP[3]], ['Despesas', j.despesas, RAMP[4]], ['Lucro', Math.max(j.lucro, 0), 'var(--ok)']];
    P.push(`<div class="panel s4"><h3>Para onde foi o dinheiro</h3><div class="split">${parts.map(([n, v, c]) => `<i style="width:${v / base * 100}%;background:${c}" title="${n}: ${money(v)}"></i>`).join('')}</div>
      <div class="dl">${parts.map(([n, v, c]) => `<div><em style="background:${c}"></em><span>${n}</span><span><b>${money(v)}</b><small>${Math.round(v / base * 100)}%</small></span></div>`).join('')}</div>${j.lucro < 0 ? `<p class="hint" style="margin-top:10px">As saídas passaram do faturamento em ${money(-j.lucro)}.</p>` : ''}</div>`);
  }
  add('funil', 12, 'Funil de conversão', funnelHtml(j.funil) + '<p class="hint" style="margin:12px 0 0">Cliques vêm dos gastos importados; visitas e checkout vêm do pixel; vendas vêm do webhook. O formato do funil acompanha o filtro de fonte.</p>');
  add('gHora', 12, 'Vendas por horário <small>barra destacada = melhor horário</small>', hourBars(j.porHora.map((h) => h.vendas)));
  add('pagamento', 4, 'Formas de pagamento', donut(j.porPagamento, money, 'vendido')); add('fonte', 4, 'Fontes de tráfego', donut(j.porFonte, money, 'vendido'));
  add('produto', 4, 'Produtos', donut(j.porProduto, money, 'vendido')); add('plataforma', 4, 'Plataformas de venda', donut(j.porPlataforma, money, 'vendido'));
  add('aprovacao', 4, 'Taxa de aprovação por pagamento', bars(j.aprovacao, (x) => x + '%'));
  add('posicionamento', 4, 'Posicionamentos', donut(j.porPosicionamento, dec, 'vendas')); add('src', 4, 'Origem (utm_source)', donut(j.porSrc, dec, 'vendas')); add('pais', 4, 'Países', donut(j.porPais, dec, 'vendas'));
  if (has('ranking')) {
    const rows = camps.filter((c) => c.nome !== '(sem UTM)' && (c.gastos > 0 || c.vendas > 0)), top = rows.filter((c) => c.lucro > 0).sort((a, b) => b.lucro - a.lucro).slice(0, 5), bad = rows.filter((c) => c.lucro < 0).sort((a, b) => a.lucro - b.lucro).slice(0, 5);
    const list = (arr, empty) => arr.length ? `<div class="rk"><div class="h"><span>#</span><span>Campanha</span><span>Lucro</span></div>${arr.map((c, i) => `<div class="r"><span class="n">${i + 1}</span><div class="nm"><span title="${esc(c.nome)}">${esc(c.nome)}</span><small>${esc(c.source)} · gasto ${money(c.gastos)} · faturamento ${money(c.faturamento)}</small></div><span class="v ${cls(c.lucro)}">${money(c.lucro)}</span></div>`).join('')}</div>` : `<div class="empty">${empty}</div>`;
    P.push(`<div class="panel s6"><h3>Campanhas mais lucrativas</h3>${list(top, 'Nenhuma campanha com lucro ainda.')}</div>`);
    P.push(`<div class="panel s6"><h3>Campanhas que precisam de atenção <small>lucro negativo</small></h3>${list(bad, 'Nenhuma campanha no prejuízo.')}</div>`);
  }
  html += `<div class="sec-title">Análise</div><div class="g12">${P.join('')}</div>`;
  el.innerHTML = html;

  $$('[data-go]', el).forEach((a) => a.onclick = () => { if (a.dataset.tab) S.sub = { itab: a.dataset.tab }; go(a.dataset.go); });
  $('#hideChk')?.addEventListener('click', () => { store.set('hideChk', true); render(); });
  $('#btnGoal')?.addEventListener('click', async () => {
    const v = prompt('Quanto de lucro você quer alcançar neste período? (somente números)', goal.value || ''); if (v === null) return;
    await api('/api/kv', { method: 'POST', body: { key: 'cfg_goal', value: { value: Number(String(v).replace(/\./g, '').replace(',', '.')) || 0 } } }); render();
  });
  $('#btnMetrics').onclick = () => {
    const cur = new Set(sel()), ck = (id, l) => `<label style="display:flex;gap:8px;align-items:center;color:var(--tx)"><input type="checkbox" data-m="${id}" ${cur.has(id) ? 'checked' : ''}>${l}</label>`;
    const gs = [...new Set(MET.map((m) => m[1]))];
    const m = modal(`<h3>Personalizar o Resumo</h3><p class="hint">Marque o que quer ver.</p>${gs.map((g) => `<div class="sec-title">${g}</div><div class="form">${MET.filter((x) => x[1] === g).map((x) => ck(x[0], x[2])).join('')}</div>`).join('')}
      <div class="sec-title">Gráficos e blocos</div><div class="form">${BLOCKS.map(([id, l]) => ck(id, l)).join('')}</div>
      <div class="row end" style="margin-top:16px"><button class="btn ghost" id="mReset">Restaurar padrão</button><button class="btn" id="mSave">Salvar</button></div>`);
    $('#mSave', m).onclick = () => { store.set('metrics3', $$('[data-m]', m).filter((c) => c.checked).map((c) => c.dataset.m)); m.remove(); render(); };
    $('#mReset', m).onclick = () => { store.set('metrics3', DEFAULT_SEL); m.remove(); render(); };
  };
};

pages.vendas = async (el) => {
  const rows = (await api('/api/sales' + qs())).map((r) => ({ ...r, statusRaw: r.status, status: STATUS_PT[r.status]?.[0] || r.status }));
  el.innerHTML = '<div id="tb"></div>';
  mountTable($('#tb'), {
    rows, first: 'Data', nameKey: 'created_at', file: 'vendas', sort: 'created_at', status: true,
    nameHtml: (r) => new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'UTC' }),
    cols: [{ k: 'order_id', l: 'Pedido', left: true, f: esc }, { k: 'product', l: 'Produto', left: true, f: esc }, { k: 'platform', l: 'Plataforma', left: true, f: (x) => esc(x || '—') },
      { k: 'payment_method', l: 'Pagamento', left: true, f: esc }, { k: 'status', l: 'Status', left: true, html: (r) => badge(r.status, STATUS_PT[r.statusRaw]?.[1]) },
      { k: 'amount', l: 'Valor', f: money }, { k: 'source', l: 'Fonte', left: true, f: esc }, { k: 'utm_campaign', l: 'Campanha (UTM)', left: true, f: (x) => esc(x || '—') }, { k: 'email', l: 'E-mail', left: true, f: (x) => esc(x || '—') }],
    total: (rs) => ({ amount: rs.filter((r) => r.statusRaw === 'paid').reduce((a, r) => a + r.amount, 0) }),
    empty: 'Nenhuma venda no período. Conecte sua plataforma em Integrações → Webhooks.',
  });
};

pages.relatorios = async (el) => {
  const by = S.sub.rby || 'day', rows = await api('/api/report' + qs({ by }));
  const asc = rows.slice().reverse();
  el.innerHTML = `<div class="row"><select id="rb"><option value="day" ${by === 'day' ? 'selected' : ''}>Por dia</option><option value="hour" ${by === 'hour' ? 'selected' : ''}>Por hora do dia</option></select></div>
    <div class="panel">${areaChart(asc.map((d) => d.nome), [{ name: 'Faturamento', color: 'var(--c)', fill: 1, values: asc.map((d) => d.faturamento) }, { name: 'Gastos', color: 'var(--mut)', dash: 1, values: asc.map((d) => d.gastos) }, { name: 'Lucro', color: 'var(--ok)', values: asc.map((d) => d.lucro) }])}</div><div id="tb"></div>`;
  $('#rb').onchange = (e) => { S.sub.rby = e.target.value; render(); };
  mountTable($('#tb'), { rows, first: by === 'day' ? 'Dia' : 'Hora', cols: COLS, metrics: true, file: 'relatorio', sort: 'nome' });
};

async function adsTable(el, level, lock, extraCols) {
  const [rows, j] = await Promise.all([api('/api/campaigns' + qs({ level }, lock)), api('/api/summary' + qs({}, lock))]);
  const cols = ADCOLS(level);
  el.insertAdjacentHTML('beforeend', `<div class="row"><span class="grow"></span>${j.semUtm ? badge(`${j.semUtm} venda(s) sem UTM`, 'warn') : badge('Todas as vendas trackeadas', 'ok')}</div><div id="tb"></div>`);
  mountTable($('#tb'), { rows, first: { accounts: 'Conta', campaigns: 'Campanha', adsets: 'Conjunto', ads: 'Anúncio' }[level], cols: extraCols ? [{ k: 'source', l: 'Rede', left: true, f: esc }, ...cols] : cols, metrics: true, status: level !== 'accounts', file: level, sort: 'gastos',
    empty: 'Nada por aqui ainda. Importe os gastos em Integrações → Gastos e conecte as vendas.' });
}
const LEVELS = [['accounts', 'Contas'], ['campaigns', 'Campanhas'], ['adsets', 'Conjuntos'], ['ads', 'Anúncios']];
const levelTabs = (key) => `<div class="tabs">${LEVELS.map(([k, l]) => `<button data-lv="${k}" class="${(S.tabs[key] || 'campaigns') === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const bindLevels = (el, key) => $$('[data-lv]', el).forEach((b) => b.onclick = () => { S.tabs[key] = b.dataset.lv; render(); });
pages.rede = async (el, net) => { el.innerHTML = levelTabs(net); bindLevels(el, net); await adsTable(el, S.tabs[net] || 'campaigns', { source: net }); };
pages.campanhas = async (el) => { el.innerHTML = levelTabs('all'); bindLevels(el, 'all'); await adsTable(el, S.tabs.all || 'campaigns', {}, true); };

pages.utms = async (el) => {
  const by = S.sub.by || 'utm_campaign', rows = await api('/api/utms' + qs({ by }));
  el.innerHTML = `<div class="row"><label>Agrupar por <select id="by">${['utm_campaign', 'utm_medium', 'utm_content', 'utm_source', 'utm_term'].map((b) => `<option ${b === by ? 'selected' : ''}>${b}</option>`).join('')}</select></label></div><div id="tb"></div>`;
  $('#by').onchange = (e) => { S.sub.by = e.target.value; render(); };
  mountTable($('#tb'), { rows, first: by, cols: COLS.filter((c) => !['impressoes', 'cliques', 'cpm', 'ctr', 'cpc'].includes(c.k)), metrics: true, file: 'utms', sort: 'faturamento' });
};

pages.eventos = async (el) => {
  const p = S.sub.pixel || '', t = S.sub.type || '', d = await api(`/api/events?pixel=${encodeURIComponent(p)}&type=${encodeURIComponent(t)}`);
  const o = (arr, v) => arr.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
  el.innerHTML = `<div class="row"><select id="ep"><option value="">Todos os pixels</option>${o(d.pixels, p)}</select><select id="et"><option value="">Todos os eventos</option>${o(d.types, t)}</select></div>
    <div class="cards">${d.funnel.map((f) => card(`${esc(f.type)} (7 dias)`, dec(f.n))).join('')}</div><div id="tb"></div>`;
  $('#ep').onchange = (e) => { S.sub.pixel = e.target.value; render(); }; $('#et').onchange = (e) => { S.sub.type = e.target.value; render(); };
  mountTable($('#tb'), { rows: d.rows, first: 'Data/hora', nameKey: 'ts', nameHtml: (r) => new Date(r.ts).toLocaleString('pt-BR'), sort: 'ts', file: 'eventos',
    cols: [{ k: 'type', l: 'Evento', left: true, f: esc }, { k: 'pixel', l: 'Pixel', left: true, f: esc }, { k: 'page', l: 'Página', left: true, f: esc }],
    empty: 'Nenhum evento recebido. Se o pixel está instalado, o script não chegou a enviar.' });
};

// ---------- Integrações ----------
const UTM_TPL = [
  ['Meta Ads (Facebook + Instagram)', 'utm_source=FB&utm_medium={{adset.name}}|{{adset.id}}&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}', 'No anúncio, em “Parâmetros de URL”. O posicionamento (Instagram, Facebook…) vai em utm_term.'],
  ['Google Ads (Pesquisa/Display)', 'utm_source=google&utm_medium={adgroupid}&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}', 'Em “Modelo de acompanhamento” da conta ou da campanha (ValueTrack).'],
  ['YouTube Ads (Google Ads)', 'utm_source=youtube&utm_medium={adgroupid}&utm_campaign={campaignid}&utm_content={creative}', 'Mesmo lugar do Google Ads; só muda o utm_source. Importe os gastos escolhendo a fonte YouTube.'],
  ['TikTok Ads', 'utm_source=tiktok&utm_medium=__AID_NAME__|__AID__&utm_campaign=__CAMPAIGN_NAME__|__CAMPAIGN_ID__&utm_content=__CID_NAME__|__CID__', 'No campo de parâmetros de URL do anúncio. Confira os nomes das variáveis no TikTok.'],
  ['Kwai Ads', 'utm_source=kwai&utm_medium=__ADSET_NAME__|__ADSET_ID__&utm_campaign=__CAMPAIGN_NAME__|__CAMPAIGN_ID__&utm_content=__CREATIVE_NAME__|__CREATIVE_ID__', 'ATENÇÃO: não confirmei as variáveis do Kwai. Veja na ajuda do Kwai Ads os nomes certos e troque aqui.'],
];
pages.integracoes = async (el) => {
  const base = location.origin, d = S.cfg.dash, tab = S.sub.itab || 'webhooks';
  const tabs = [['webhooks', 'Webhooks (vendas)'], ['utms', 'Códigos de UTM'], ['gastos', 'Gastos dos anúncios'], ['pixel', 'Pixel'], ['testes', 'Testes']];
  let body = '';
  if (tab === 'webhooks') {
    const log = await api('/api/webhook-log');
    body = `<p>1) Escolha a plataforma onde você vende. 2) Copie o endereço. 3) Cole no campo de webhook/postback dela.</p>
      <div class="row"><input id="wq" placeholder="Buscar plataforma…" style="width:180px"><select id="wp">${S.cfg.platforms.map((p) => `<option>${esc(p)}</option>`).join('')}<option value="__outra">Outra (digitar o nome)…</option></select>
      <input id="wo" placeholder="Nome da plataforma" hidden><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="wc"> valor vem em centavos</label></div>
      <pre id="wurl"></pre><div class="row"><button class="btn sec sm" id="wcopy">Copiar endereço</button></div>
      <p class="hint">O programa tenta entender o formato de qualquer plataforma. Como cada uma envia de um jeito, confira abaixo se leu certo; se algo vier errado, me mande o exemplo que eu ajusto.</p>
      <h3>Últimos recebidos</h3>${log.length ? `<div class="tw"><table><thead><tr><th>Hora</th><th>Plataforma</th><th>Status</th><th>Valor</th><th>Produto</th><th>Campanha (UTM)</th></tr></thead>${log.map((l) => `<tr><td>${new Date(l.ts).toLocaleString('pt-BR')}</td><td>${esc(l.platform || '-')}</td><td>${esc(l.parsed.status || l.parsed.erro)}</td><td>${l.parsed.amount != null ? money(l.parsed.amount) : ''}</td><td>${esc(l.parsed.product)}</td><td class="${l.parsed.utm_campaign ? '' : 'neg'}">${esc(l.parsed.utm_campaign || 'sem UTM')}</td></tr><tr><td colspan="6" class="l"><details><summary>ver dados brutos</summary><pre>${esc(l.raw)}</pre></details></td></tr>`).join('')}</table></div>` : '<div class="empty">Nada recebido ainda. Faça uma compra de teste.</div>'}`;
  } else if (tab === 'utms') {
    body = `<p>Cole o código no campo de parâmetros de URL de cada anúncio. O formato “nome|id” liga a venda ao gasto certo (campanha, conjunto e anúncio).</p>
      ${UTM_TPL.map(([n, c, h], i) => `<h3>${n}</h3><pre>${esc(c)}</pre><div class="row"><button class="btn sec sm" data-c="${i}">Copiar</button><span class="hint" style="margin:0">${esc(h)}</span></div>`).join('')}
      <div class="sec-title">Gerar UTM para tráfego orgânico</div><div class="form">
      ${[['gu', 'Link da página *'], ['gs', 'utm_source *'], ['gm', 'utm_medium'], ['gc', 'utm_campaign'], ['gt', 'utm_content'], ['gk', 'utm_term'], ['gx', 'Parâmetros extras (xcod=abc&sck=1)']].map(([id, l]) => `<label>${l}<input id="${id}"></label>`).join('')}</div>
      <div class="row" style="margin-top:10px"><button class="btn" id="gen">Gerar URL</button></div><pre id="gout" hidden></pre>`;
  } else if (tab === 'gastos') {
    body = `<p>Exporte do Gerenciador de cada rede (CSV, por dia) e importe aqui. O programa reconhece as colunas em português e inglês de Meta, Google/YouTube, TikTok e Kwai, inclusive status e orçamento quando existirem.</p>
      <div class="row"><select id="gs">${S.cfg.sources.map((s) => `<option>${s}</option>`).join('')}</select><input id="ga" placeholder="Nome da conta (opcional)"><input type="file" id="csvf" accept=".csv,.txt"></div>
      <textarea id="csv" rows="6" style="width:100%" placeholder="ou cole o conteúdo do CSV aqui"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" id="csvgo">Importar</button><span id="csvmsg"></span></div>
      <p class="hint">Exporte no nível mais detalhado que quiser analisar (anúncio, conjunto ou campanha) e <b>não misture níveis</b> para a mesma conta, senão o gasto soma em dobro. Reimportar o mesmo período atualiza, não duplica. Instagram Ads vem junto com o Meta.</p>`;
  } else if (tab === 'pixel') {
    body = `<p>Cole no <code>&lt;head&gt;</code> da sua página de vendas:</p><pre>${esc(`<script src="${base}/pixel.js" data-pixel="principal"${d.id !== 'principal' ? ` data-dash="${d.id}"` : ''} async></script>`)}</pre>
      <p class="hint">Guarda os UTMs do visitante e repassa aos links de checkout (junto com <code>sck</code>). Eventos extras: <code>trk('ViewContent')</code>, <code>trk('Lead')</code>, <code>trk('InitiateCheckout')</code>. O site precisa alcançar este painel por uma URL pública (veja o README).</p>`;
  } else {
    body = `<div class="row"><button class="btn" id="demo">Carregar dados de exemplo</button><button class="btn sec" id="reset">Apagar vendas, gastos e eventos</button><span id="tmsg"></span></div>
      <p>Enviar uma venda de teste pelo webhook deste dashboard:</p><button class="btn sec" id="tsale">Simular venda aprovada</button>`;
  }
  el.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="panel">${body}</div>`;
  $$('[data-t]', el).forEach((b) => b.onclick = () => { S.sub.itab = b.dataset.t; render(); });
  if ($('#wp')) {
    const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '') || 'outra';
    const upd = () => { const other = $('#wp').value === '__outra'; $('#wo').hidden = !other; $('#wurl').textContent = `${base}/webhook/${d.token}/${slug(other ? $('#wo').value : $('#wp').value)}${$('#wc').checked ? '?cents=1' : ''}`; };
    $('#wq').oninput = () => { const o = [...$('#wp').options].find((x) => x.text.toLowerCase().includes($('#wq').value.toLowerCase()) && x.value !== '__outra'); if (o) { $('#wp').value = o.value; upd(); } };
    $('#wp').onchange = upd; $('#wc').onchange = upd; $('#wo').oninput = upd; upd();
    $('#wcopy').onclick = () => { navigator.clipboard?.writeText($('#wurl').textContent); toast('Endereço copiado'); };
  }
  $$('[data-c]', el).forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(UTM_TPL[b.dataset.c][1]); toast('Código copiado'); });
  $('#gen')?.addEventListener('click', () => {
    const u = $('#gu').value.trim(); if (!u || !$('#gs').value.trim()) return toast('Informe o link e o utm_source');
    const p = new URLSearchParams(); [['utm_source', 'gs'], ['utm_medium', 'gm'], ['utm_campaign', 'gc'], ['utm_content', 'gt'], ['utm_term', 'gk']].forEach(([k, id]) => $('#' + id).value && p.set(k, $('#' + id).value));
    const out = $('#gout'); out.hidden = false; out.textContent = u + (u.includes('?') ? '&' : '?') + p + ($('#gx').value ? '&' + $('#gx').value.replace(/^[?&]/, '') : '');
    navigator.clipboard?.writeText(out.textContent); toast('URL gerada e copiada');
  });
  $('#csvf')?.addEventListener('change', async (e) => { $('#csv').value = await e.target.files[0].text(); });
  $('#csvgo')?.addEventListener('click', async () => {
    const r = await api('/api/spend/csv', { method: 'POST', body: { csv: $('#csv').value, source: $('#gs').value, account: $('#ga').value } });
    $('#csvmsg').textContent = r.error || `${r.importadas} linhas importadas (nível: ${r.nivel}; colunas: ${r.colunas.join(', ')})`;
  });
  $('#demo')?.addEventListener('click', async () => { await api('/api/demo', { method: 'POST', body: {} }); toast('Dados de exemplo carregados'); });
  $('#reset')?.addEventListener('click', async () => { if (confirm('Apagar todas as vendas, gastos e eventos deste dashboard?')) { await api('/api/reset', { method: 'POST', body: {} }); toast('Apagado'); } });
  $('#tsale')?.addEventListener('click', async () => {
    const r = await fetch(`/webhook/${d.token}/teste`, { method: 'POST', body: JSON.stringify({ order_id: 'TESTE-' + Date.now(), status: 'paid', amount: 97, payment_method: 'pix', product: 'Produto Teste', utm_source: 'fb', utm_campaign: 'Campanha Teste|999' }) });
    toast(r.ok ? 'Venda de teste registrada' : 'Falhou');
  });
};

// ---------- Regras ----------
const RMETRICS = [['cpa', 'CPA'], ['roas', 'ROAS'], ['roi', 'ROI (%)'], ['lucro', 'Lucro'], ['gastos', 'Gastos'], ['vendas', 'Vendas'], ['faturamento', 'Faturamento'], ['margem', 'Margem (%)'], ['ctr', 'CTR (%)'], ['cpc', 'CPC'], ['cpm', 'CPM']];
const RACTIONS = [['notify', 'Avisar no Telegram'], ['pause', 'Pausar (simulado)'], ['activate', 'Ativar (simulado)'], ['budget_up', 'Aumentar orçamento (simulado)'], ['budget_down', 'Reduzir orçamento (simulado)']];
const RPERIOD = [['today', 'Hoje'], ['yesterday', 'Ontem'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias']];
const optList = (arr, v) => arr.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
function ruleForm(r = {}) {
  const conds = r.conditions?.length ? r.conditions : [{ metric: 'cpa', op: '>', value: '' }];
  const m = modal(`<h3>${r.id ? 'Editar' : 'Criar'} regra personalizada</h3><p class="hint">Avalia campanhas, conjuntos ou anúncios com as condições abaixo.</p><div class="form">
    <label>Nome da regra<input id="rn" value="${esc(r.name || '')}"></label>
    <label>Produto<select id="rp"><option value="">Qualquer</option>${(S.opts.products || []).map((p) => `<option ${p === r.product ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    <label>Conta de anúncio<select id="rc"><option value="">Todas</option>${(S.opts.accounts || []).map((p) => `<option ${p === r.account ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    <label>Nível<select id="rl">${optList([['campaigns', 'Campanhas'], ['adsets', 'Conjuntos'], ['ads', 'Anúncios']], r.level)}</select></label>
    <label>Aplicar a<select id="ra">${optList([['active', 'Somente ativas'], ['all', 'Todas'], ['paused', 'Somente pausadas']], r.applyTo)}</select></label>
    <label>Nome contém (opcional)<input id="rt" value="${esc(r.nameText || '')}"></label>
    <label>Ação<select id="rx">${optList(RACTIONS, r.action)}</select></label>
    <label>Período de cálculo<select id="rpd">${optList(RPERIOD, r.period)}</select></label>
    <label>Frequência (minutos)<select id="rf">${[5, 15, 30, 60].map((n) => `<option ${parseInt(r.frequency) === n || (!r.frequency && n === 15) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Limite de avisos por dia (0 = sem limite)<input id="rd" type="number" min="0" value="${r.dailyLimit || 0}"></label></div>
    <div class="sec-title">Condições (todas precisam ser verdadeiras)</div><div id="conds"></div><button class="btn ghost sm" id="addc">+ Condição</button>
    <p class="hint" style="margin-top:10px">Só “Avisar no Telegram” age de verdade. As demais ações são simuladas, porque pausar ou mudar orçamento exige conectar as APIs dos anúncios.</p>
    <div class="row end" style="margin-top:12px"><button class="btn ghost" id="rcancel">Cancelar</button><button class="btn" id="rsave">Salvar</button></div>`);
  const drawConds = (list) => { $('#conds', m).innerHTML = list.map((c, i) => `<div class="cond"><select data-f="metric">${optList(RMETRICS, c.metric)}</select><select data-f="op">${['>', '<', '>=', '<='].map((o) => `<option ${o === c.op ? 'selected' : ''}>${o}</option>`).join('')}</select><input data-f="value" type="number" step="0.01" value="${esc(c.value)}" style="width:110px"><button class="btn del" data-rm="${i}">remover</button></div>`).join(''); $$('[data-rm]', m).forEach((b) => b.onclick = () => { const cur = readConds(); cur.splice(+b.dataset.rm, 1); drawConds(cur); }); };
  const readConds = () => $$('.cond', m).map((r2) => Object.fromEntries($$('[data-f]', r2).map((x) => [x.dataset.f, x.value])));
  drawConds(conds);
  $('#addc', m).onclick = () => drawConds([...readConds(), { metric: 'cpa', op: '>', value: '' }]);
  $('#rcancel', m).onclick = () => m.remove();
  $('#rsave', m).onclick = async () => {
    const body = { id: r.id, name: $('#rn', m).value || 'Regra', product: $('#rp', m).value, account: $('#rc', m).value, level: $('#rl', m).value, applyTo: $('#ra', m).value, nameText: $('#rt', m).value,
      action: $('#rx', m).value, period: $('#rpd', m).value, frequency: $('#rf', m).value, dailyLimit: +$('#rd', m).value, conditions: readConds().filter((c) => c.value !== '') };
    if (!body.conditions.length) return toast('Adicione ao menos uma condição');
    await api('/api/rules', { method: 'POST', body }); m.remove(); render();
  };
}
pages.regras = async (el) => {
  const rules = await api('/api/rules'), lbl = (arr, k) => (arr.find((x) => x[0] === k) || [])[1] || k;
  el.innerHTML = `<div class="row"><button class="btn" id="rnew">Criar regra</button><button class="btn ghost" id="rrun">Avaliar agora</button><button class="btn ghost" id="rsend">Avaliar e enviar avisos</button><span class="grow"></span>
    <button class="btn ghost sm" id="rexp">Exportar</button><button class="btn ghost sm" id="rimp">Importar</button></div>
    <div class="panel"><h3>Regras</h3>${rules.length ? `<div class="tw"><table><thead><tr><th>Ativa</th><th class="l">Nome e produto</th><th class="l">Aplicada a</th><th class="l">Ação e condição</th><th class="l">Frequência e período</th><th></th></tr></thead>${rules.map((r) => `<tr>
      <td><input type="checkbox" data-on="${r.id}" ${r.enabled ? 'checked' : ''}></td><td class="l">${esc(r.name)}<br><small class="hint">${esc(r.product || 'Qualquer produto')}</small></td>
      <td class="l">${lbl([['campaigns', 'Campanhas'], ['adsets', 'Conjuntos'], ['ads', 'Anúncios']], r.level)} · ${lbl([['active', 'ativas'], ['all', 'todas'], ['paused', 'pausadas']], r.applyTo)}</td>
      <td class="l">${lbl(RACTIONS, r.action)}<br><small class="hint">${r.conditions.map((c) => `${lbl(RMETRICS, c.metric)} ${c.op} ${c.value}`).join(' e ')}</small></td>
      <td class="l">a cada ${r.frequency || 15} min<br><small class="hint">${lbl(RPERIOD, r.period)}</small></td>
      <td><button class="btn ghost sm" data-ed="${r.id}">editar</button><button class="btn del" data-del="${r.id}">remover</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Nenhuma regra criada</div>'}</div>
    <div class="panel"><h3>O que as regras fariam agora</h3><div id="rres"><div class="empty">Clique em “Avaliar agora”.</div></div></div>`;
  $('#rnew').onclick = () => ruleForm();
  $$('[data-ed]', el).forEach((b) => b.onclick = () => ruleForm(rules.find((r) => r.id === +b.dataset.ed)));
  $$('[data-del]', el).forEach((b) => b.onclick = async () => { if (confirm('Remover esta regra?')) { await api('/api/rules?id=' + b.dataset.del, { method: 'DELETE' }); render(); } });
  $$('[data-on]', el).forEach((c) => c.onchange = () => api('/api/rules/toggle', { method: 'POST', body: { id: +c.dataset.on, enabled: c.checked } }));
  const run = async (send) => {
    const hits = await api('/api/rules/run', { method: 'POST', body: { send } });
    $('#rres').innerHTML = hits.length ? `<div class="tw"><table><thead><tr><th class="l">Regra</th><th class="l">Item</th><th class="l">Valores</th><th class="l">Ação</th></tr></thead>${hits.map((h) => `<tr><td class="l">${esc(h.regra)}</td><td class="l">${esc(h.nome)}</td><td class="l">${Object.entries(h.valores).map(([k, v]) => `${k}: ${dec(v)}`).join(' · ')}</td><td class="l">${esc(lbl(RACTIONS, h.acao))}</td></tr>`).join('')}</table></div>` : '<div class="empty">Nenhum item atingiu as condições.</div>';
    if (send) toast('Avisos enviados (se o Telegram estiver configurado)');
  };
  $('#rrun').onclick = () => run(false); $('#rsend').onclick = () => run(true);
  $('#rexp').onclick = async () => download('regras.json', JSON.stringify(await api('/api/rules/export'), null, 2), 'application/json');
  $('#rimp').onclick = () => { const m = modal(`<h3>Importar regras</h3><p class="hint">Cole o conteúdo do arquivo exportado.</p><textarea id="ri" rows="10" style="width:100%"></textarea><div class="row end"><button class="btn" id="rok">Importar</button></div>`);
    $('#rok', m).onclick = async () => { try { await api('/api/rules/import', { method: 'POST', body: JSON.parse($('#ri', m).value) }); m.remove(); render(); } catch { toast('JSON inválido'); } }; };
};

// ---------- Custos: impostos e taxas, produtos, despesas ----------
const optsRecur = [['none', 'Não recorrente'], ['monthly', 'Mensal'], ['annual', 'Anual']];
const COSTS_TABS = {
  async impostos(el) {
    const s = await api('/api/settings');
    const num = (id, label, v) => `<label>${label}<input id="${id}" type="number" step="0.01" value="${v}"></label>`;
    const feeRow = (f = {}) => `<div class="cond fee"><input data-f="name" placeholder="Nome (ex.: Taxa da plataforma)" value="${esc(f.name || '')}" style="width:230px"><input data-f="pct" type="number" step="0.01" placeholder="%" value="${f.pct ?? ''}" style="width:90px"><input data-f="fixed" type="number" step="0.01" placeholder="valor fixo por venda" value="${f.fixed ?? ''}" style="width:170px"><button class="btn del" data-x>remover</button></div>`;
    el.innerHTML = `<div class="panel"><h3>Imposto sobre gastos com anúncios <small>% sobre o gasto de cada rede</small></h3><div class="form">${S.cfg.sources.map((x) => num('tx_' + x, x, s.ad_tax[x])).join('')}</div></div>
      <div class="panel"><h3>Imposto sobre vendas</h3><div class="form">${num('sales_tax', 'Imposto sobre faturamento (%)', s.sales_tax)}</div></div>
      <div class="panel"><h3>Taxas adicionais</h3><p class="hint">Cobradas sobre vendas aprovadas: percentual do valor e/ou valor fixo por venda.</p><div id="fees">${s.fees.map(feeRow).join('')}</div><button class="btn ghost sm" id="addfee">+ Adicionar taxa</button></div>
      <button class="btn" id="save">Salvar</button>`;
    const bindX = () => $$('[data-x]', el).forEach((b) => b.onclick = () => b.closest('.fee').remove()); bindX();
    $('#addfee').onclick = () => { $('#fees').insertAdjacentHTML('beforeend', feeRow()); bindX(); };
    $('#save').onclick = async () => {
      await api('/api/settings', { method: 'POST', body: { ad_tax: Object.fromEntries(S.cfg.sources.map((x) => [x, $('#tx_' + x).value])), sales_tax: $('#sales_tax').value,
        fees: $$('.fee', el).map((r) => Object.fromEntries($$('[data-f]', r).map((i) => [i.dataset.f, i.value]))).filter((f) => f.name) } });
      toast('Salvo');
    };
  },
  async produtos(el) {
    const [s, recur] = await Promise.all([api('/api/settings'), api('/api/kv?key=cfg_recur')]);
    const costs = Object.fromEntries(s.costs.map((c) => [c.product, c.cost])), prods = [...new Set([...s.products, ...Object.keys(costs)])];
    el.innerHTML = `<div class="panel"><h3>Custo e recorrência dos produtos</h3><p class="hint">Os produtos aparecem aqui depois da primeira venda. O custo entra no cálculo do lucro. Marque mensal ou anual para alimentar MRR, ARR e churn no Resumo.</p>
      ${prods.length ? `<div class="tw"><table><thead><tr><th class="l">Produto</th><th>Custo por venda</th><th>Recorrência</th></tr></thead>${prods.map((p) => `<tr><td class="l">${esc(p)}</td><td><input data-p="${esc(p)}" type="number" step="0.01" value="${costs[p] ?? 0}" style="width:120px"></td>
      <td><select data-r="${esc(p)}">${optList(optsRecur, recur[p] || 'none')}</select></td></tr>`).join('')}</table></div>` : '<div class="empty">Nenhum produto ainda</div>'}</div>
      <button class="btn" id="save">Salvar</button>`;
    $('#save').onclick = async () => {
      await api('/api/settings', { method: 'POST', body: { costs: $$('[data-p]', el).map((i) => ({ product: i.dataset.p, cost: i.value })) } });
      await api('/api/kv', { method: 'POST', body: { key: 'cfg_recur', value: Object.fromEntries($$('[data-r]', el).map((i) => [i.dataset.r, i.value])) } });
      toast('Salvo');
    };
  },
  async despesas(el) {
    const rows = await api('/api/expenses' + qs()), cats = ['Tráfego', 'Ferramentas', 'Funcionários', 'Contabilidade', 'Outros'];
    const byCat = Object.fromEntries(cats.map((c) => [c, rows.filter((r) => r.category === c).reduce((a, r) => a + r.amount, 0)]));
    el.innerHTML = `<div class="cards">${card('Total no período', money(rows.reduce((a, r) => a + r.amount, 0)))}${cats.map((c) => card(c, money(byCat[c]))).join('')}</div>
      <div class="panel"><h3>Adicionar despesa</h3><div class="row"><input type="date" id="ed" value="${isoLocal(new Date())}"><select id="ec">${cats.map((c) => `<option>${c}</option>`).join('')}</select>
      <input id="edsc" placeholder="Descrição" style="width:240px"><input id="ev" type="number" step="0.01" placeholder="Valor" style="width:120px"><button class="btn" id="eadd">Adicionar</button></div></div>
      <div class="panel">${rows.length ? `<div class="tw"><table><thead><tr><th class="l">Data</th><th class="l">Categoria</th><th class="l">Descrição</th><th>Valor</th><th></th></tr></thead>${rows.map((r) => `<tr><td class="l">${esc(r.date)}</td><td class="l">${esc(r.category)}</td><td class="l">${esc(r.description)}</td><td>${money(r.amount)}</td><td><button class="btn del" data-d="${r.id}">remover</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Nenhuma despesa no período</div>'}</div>`;
    $('#eadd').onclick = async () => { await api('/api/expenses', { method: 'POST', body: { date: $('#ed').value, category: $('#ec').value, description: $('#edsc').value, amount: $('#ev').value } }); render(); };
    $$('[data-d]', el).forEach((b) => b.onclick = async () => { await api('/api/expenses?id=' + b.dataset.d, { method: 'DELETE' }); render(); });
  },
};
pages.custos = async (el) => {
  const tab = S.sub.ctab || 'impostos', tabs = [['impostos', 'Impostos e taxas'], ['produtos', 'Produtos'], ['despesas', 'Despesas']];
  el.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="ct"></div>`;
  $$('[data-t]', el).forEach((b) => b.onclick = () => { S.sub.ctab = b.dataset.t; render(); });
  await COSTS_TABS[tab]($('#ct'));
};

// ---------- Saúde do rastreamento ----------
pages.saude = async (el) => {
  const d = await api('/api/health' + qs()), T = d.tabelas, st = { ok: 'Em ordem', warn: 'Atenção', bad: 'Problema', info: 'Sem dados' };
  const kind = d.checks.some((c) => c.status === 'bad') ? 'bad' : d.checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
  el.innerHTML = `<div class="panel hsum"><div><div class="kl">Verificações em ordem</div><div class="sum-val" style="margin:2px 0 0">${d.ok} de ${d.total}</div>
      <p class="hint" style="margin:6px 0 0">${kind === 'ok' ? 'Tudo certo: seus números têm boa base.' : 'Corrija os itens abaixo para que lucro, ROAS e funil reflitam a realidade.'}</p></div>
      <span class="pill ${kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : ''}">${kind === 'ok' ? 'Rastreamento saudável' : kind === 'bad' ? 'Há problemas a corrigir' : 'Pede atenção'}</span></div>
    <div class="health">${d.checks.map((c) => `<div class="hcard ${c.status}"><div class="ht"><b>${c.title}</b><span class="badge ${c.status === 'ok' ? 'ok' : c.status === 'bad' ? 'bad' : c.status === 'warn' ? 'warn' : ''}">${st[c.status]}</span></div>
      <div class="hv">${c.value}</div><p>${c.detail}</p>${c.status === 'ok' || c.status === 'info' ? '' : `<div><button class="btn ghost sm" data-fix="${c.fix.page}" data-tab="${c.fix.tab || ''}">${c.fix.label}</button></div>`}</div>`).join('')}</div>
    <div class="sec-title">Detalhes</div><div class="g12">
      <div class="panel s6"><h3>Vendas sem UTM por plataforma</h3><div id="t1"></div></div><div class="panel s6"><h3>Produtos sem custo cadastrado</h3><div id="t4"></div></div>
      <div class="panel s6"><h3>Campanhas com venda e sem gasto</h3><div id="t2"></div></div><div class="panel s6"><h3>Campanhas com gasto e sem venda</h3><div id="t3"></div></div></div>`;
  $$('[data-fix]', el).forEach((b) => b.onclick = () => { go(b.dataset.fix, b.dataset.tab ? (b.dataset.fix === 'custos' ? { ctab: b.dataset.tab } : { itab: b.dataset.tab }) : undefined); });
  const mini = (id, rows, cols, first, empty) => mountTable($(id), { rows, first, cols, search: false, export: false, empty, sort: cols[0].k });
  mini('#t1', T.plataformas, [{ k: 'vendas', l: 'Vendas', f: dec }, { k: 'semUtm', l: 'Sem UTM', f: dec }, { k: 'pctSemUtm', l: '% sem UTM', f: pct }], 'Plataforma', 'Sem vendas aprovadas no período.');
  mini('#t4', T.semCusto, [{ k: 'vendas', l: 'Vendas', f: dec }], 'Produto', 'Todos os produtos têm custo cadastrado.');
  mini('#t2', T.semGasto, [{ k: 'vendas', l: 'Vendas', f: dec }, { k: 'faturamento', l: 'Faturamento', f: money }], 'Campanha (UTM)', 'Nenhuma campanha nessa situação.');
  mini('#t3', T.semVenda, [{ k: 'fonte', l: 'Rede', left: true, f: esc }, { k: 'gastos', l: 'Gastos', f: money }], 'Campanha', 'Nenhuma campanha nessa situação.');
};

// ---------- Notificações ----------
pages.notificacoes = async (el) => {
  const [n, t] = await Promise.all([api('/api/kv?key=cfg_notif'), api('/api/kv?key=cfg_telegram')]);
  const chk = (id, label, v) => `<label style="display:flex;gap:8px;align-items:center;color:var(--tx)"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}>${label}</label>`;
  el.innerHTML = `<div class="panel"><h3>Canal de aviso: Telegram</h3><p class="hint">Os avisos chegam no seu Telegram. 1) No Telegram, fale com @BotFather e crie um bot (/newbot) para receber o <b>token</b>. 2) Mande uma mensagem para o seu bot. 3) Descubra seu <b>chat id</b> (por exemplo com o bot @userinfobot). As credenciais ficam só no seu computador.</p>
    <div class="form"><label>Token do bot<input id="tk" value="${esc(t.token || '')}" placeholder="123456:ABC..."></label><label>Chat id<input id="tc" value="${esc(t.chat || '')}"></label></div>
    <div class="row" style="margin-top:10px"><button class="btn sec" id="ttest">Enviar mensagem de teste</button></div></div>
    <div class="panel"><h3>Notificações de venda</h3><div class="form">${chk('n_app', 'Avisar vendas aprovadas', n.approved)}${chk('n_pen', 'Avisar vendas pendentes', n.pending)}
      <label>Valor da venda<select id="n_val">${optList([['total', 'Mostrar valor'], ['hide', 'Esconder']], n.showValue || 'total')}</select></label>
      ${chk('n_prod', 'Mostrar nome do produto', n.showProduct !== false)}${chk('n_camp', 'Mostrar valor de utm_campaign', n.showCampaign)}${chk('n_dash', 'Mostrar nome do dashboard', n.showDash)}</div>
      <p class="hint" style="margin-top:10px">Prévia: <b id="prev"></b></p></div>
    <div class="panel"><h3>Resumos por horário</h3><div class="form">${[8, 12, 18, 23].map((h) => chk('h' + h, `Resumo das ${String(h).padStart(2, '0')}:00`, (n.hours || []).includes(h))).join('')}
      <label>Estilo<select id="n_rs">${optList([['status', 'Status de lucro'], ['detalhado', 'Resumo detalhado']], n.reportStyle || 'status')}</select></label></div>
      <p class="hint" style="margin-top:10px">O horário segue o fuso do dashboard (${S.cfg.dash.tz >= 0 ? '+' : ''}${S.cfg.dash.tz}h). O programa precisa estar aberto no computador para enviar.</p></div>
    <button class="btn" id="nsave">Salvar</button>`;
  const prev = () => { $('#prev').textContent = [' Venda aprovada', $('#n_val').value !== 'hide' ? money(197) : null, $('#n_prod').checked ? 'Curso Online' : null, $('#n_camp').checked ? 'UTM: Black Friday|1001' : null, $('#n_dash').checked ? `[${S.cfg.dash.name}]` : null].filter(Boolean).join(' · '); };
  $$('input,select', el).forEach((i) => i.addEventListener('change', prev)); prev();
  const save = async () => {
    await api('/api/kv', { method: 'POST', body: { key: 'cfg_telegram', value: { token: $('#tk').value.trim(), chat: $('#tc').value.trim() } } });
    await api('/api/kv', { method: 'POST', body: { key: 'cfg_notif', value: { approved: $('#n_app').checked, pending: $('#n_pen').checked, showValue: $('#n_val').value, showProduct: $('#n_prod').checked,
      showCampaign: $('#n_camp').checked, showDash: $('#n_dash').checked, hours: [8, 12, 18, 23].filter((h) => $('#h' + h).checked), reportStyle: $('#n_rs').value } } });
  };
  $('#nsave').onclick = async () => { await save(); toast('Salvo'); };
  $('#ttest').onclick = async () => { await save(); await api('/api/telegram/test', { method: 'POST', body: {} }); toast('Mensagem enviada. Veja o Telegram.'); };
};

// ---------- Avançado e Ajuda ----------
// ---------- Aparência e segurança (usadas em Avançado) ----------
const NAME_IDEAS = [['Norte', '#0e7490'], ['Prisma', '#4f46e5'], ['Tracejo', '#7c3aed'], ['Radar', '#0369a1']];
const securityHtml = () => `<div class="panel"><h3>Aparência</h3>
  <div class="form"><label>Nome do programa<input id="apName" maxlength="30" value="${esc(S.cfg.brandName)}"></label>
    <label>Cor de destaque<span class="row" style="margin:0"><input type="color" id="apColor" value="${esc(S.cfg.color)}" style="width:56px;height:36px;padding:2px"><span class="hint" style="margin:0">clique para escolher</span></span></label></div>
  <div class="sec-title">Sugestões de nome e cor</div><div class="ideas">${NAME_IDEAS.map(([n, c]) => `<button class="idea" data-n="${n}" data-c="${c}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>
  <p class="hint" style="margin-top:10px">Dica: prefira cores que não sejam verde nem vermelho, porque essas já indicam lucro e prejuízo nos números.</p>
  <div class="row" style="margin-top:8px"><button class="btn" id="apSave">Salvar aparência</button></div></div>
  <div class="panel"><h3>Segurança</h3>${S.cfg.defaultPassword ? '<div class="alert warn" style="margin-bottom:12px"><div>Você ainda usa a senha inicial. Troque antes de colocar o programa na internet.</div></div>' : ''}
  <div class="form"><label>Senha atual<input type="password" id="pwOld" autocomplete="current-password"></label><label>Nova senha (mínimo 8 caracteres)<input type="password" id="pwNew" autocomplete="new-password"></label>
    <label>Repita a nova senha<input type="password" id="pwNew2" autocomplete="new-password"></label></div>
  <div class="row" style="margin-top:12px"><button class="btn" id="pwSave">Trocar senha</button><span id="pwMsg" class="hint" style="margin:0"></span></div></div>`;
function bindSecurity(el) {
  $$('.idea', el).forEach((b) => b.onclick = () => { $('#apName').value = b.dataset.n; $('#apColor').value = b.dataset.c; });
  $('#apSave').onclick = async () => {
    const body = { brandName: $('#apName').value, color: $('#apColor').value };
    const r = await api('/api/appearance', { method: 'POST', body });
    if (r.error) return toast(r.error);
    S.cfg.brandName = body.brandName.trim(); S.cfg.color = body.color;
    document.documentElement.style.setProperty('--c0', body.color); document.title = S.cfg.brandName; $('.brand').forEach((e) => e.textContent = S.cfg.brandName);
    toast('Aparência salva');
  };
  $('#pwSave').onclick = async () => {
    const msg = $('#pwMsg'); msg.textContent = '';
    if ($('#pwNew').value !== $('#pwNew2').value) return void (msg.textContent = 'As duas senhas novas não são iguais.');
    const r = await api('/api/password', { method: 'POST', body: { current: $('#pwOld').value, next: $('#pwNew').value } });
    if (r.error) return void (msg.textContent = r.error);
    S.cfg.defaultPassword = false; toast('Senha trocada'); render();
  };
}

pages.avancado = async (el) => {
  const ds = await api('/api/dashboards');
  el.innerHTML = `<div class="panel"><h3>Dashboards</h3><p class="hint">Cada dashboard tem vendas, gastos, regras e endereço de webhook próprios (por exemplo, um por produto ou operação).</p>
    <div class="tw"><table><thead><tr><th class="l">Nome</th><th class="l">Fuso</th><th class="l">Moeda</th><th></th></tr></thead>${ds.map((d) => `<tr><td class="l">${esc(d.name)}${d.id === S.cfg.dash.id ? ' ' + badge('em uso', 'ok') : ''}</td><td class="l">GMT${d.tz >= 0 ? '+' : ''}${d.tz}</td><td class="l">${d.currency}</td>
      <td><button class="btn ghost sm" data-ed="${d.id}">editar</button>${d.id !== 'principal' ? `<button class="btn del" data-rm="${d.id}">remover</button>` : ''}</td></tr>`).join('')}</table></div>
    <div class="row" style="margin-top:12px"><button class="btn" id="dnew">Novo dashboard</button></div></div>
    <div class="panel"><h3>Dados</h3><div class="row"><a class="btn ghost" href="/api/export" download>Baixar backup (JSON)</a><button class="btn ghost" id="demo">Carregar dados de exemplo</button><button class="btn sec" id="reset">Apagar vendas, gastos e eventos</button></div>
    <p class="hint">Os dados ficam no arquivo <code>data.db</code> (um por dashboard) na pasta do programa. Copie-os para guardar o histórico.</p></div>
    ${securityHtml()}`;
  bindSecurity(el);
  const form = (d = {}) => { const m = modal(`<h3>${d.id ? 'Editar' : 'Novo'} dashboard</h3><div class="form"><label>Nome<input id="dn" value="${esc(d.name || '')}"></label>
    <label>Fuso horário (horas em relação ao UTC)<input id="dz" type="number" min="-12" max="14" value="${d.tz ?? -3}"></label>
    <label>Moeda<select id="dc">${['BRL', 'USD', 'EUR'].map((c) => `<option ${c === (d.currency || 'BRL') ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
    <div class="row end" style="margin-top:12px"><button class="btn" id="dok">Salvar</button></div>`);
    $('#dok', m).onclick = async () => { const r = await api('/api/dashboards', { method: 'POST', body: { id: d.id, name: $('#dn', m).value, tz: $('#dz', m).value, currency: $('#dc', m).value } }); if (r.error) return toast(r.error); m.remove(); await loadCfg(); render(); }; };
  $('#dnew').onclick = () => form(); $$('[data-ed]', el).forEach((b) => b.onclick = () => form(ds.find((d) => d.id === b.dataset.ed)));
  $$('[data-rm]', el).forEach((b) => b.onclick = async () => { if (!confirm('Remover este dashboard da lista? O arquivo de dados é mantido na pasta.')) return; const r = await api('/api/dashboards?id=' + b.dataset.rm, { method: 'DELETE' }); if (r.error) return toast(r.error); if (S.cfg.dash.id === b.dataset.rm) document.cookie = 'dash=principal; path=/'; await loadCfg(); render(); });
  $('#demo').onclick = async () => { await api('/api/demo', { method: 'POST', body: {} }); toast('Dados de exemplo carregados'); };
  $('#reset').onclick = async () => { if (confirm('Apagar vendas, gastos e eventos deste dashboard?')) { await api('/api/reset', { method: 'POST', body: {} }); toast('Apagado'); } };
};

pages.ajuda = async (el) => {
  const G = [['ROAS', 'Faturamento ÷ gastos com anúncios. 3,0 significa R$ 3 vendidos para cada R$ 1 gasto.'], ['ROI', 'Lucro ÷ gastos, em %. Mostra quanto você ganhou sobre o que investiu.'], ['Margem', 'Lucro ÷ faturamento, em %.'],
    ['CPA', 'Custo por aquisição: gastos ÷ vendas aprovadas.'], ['ARPU', 'Faturamento médio por cliente.'], ['Ticket médio', 'Faturamento ÷ número de vendas.'], ['CPC / CTR / CPM', 'Custo por clique, taxa de cliques e custo por mil impressões.'],
    ['MRR / ARR', 'Receita recorrente mensal e anual (produtos marcados como mensal/anual).'], ['Churn', 'Parcela dos assinantes que deixou de renovar.'], ['Lucro', 'Faturamento − gastos − impostos − custo dos produtos − taxas − despesas.']];
  el.innerHTML = `<div class="panel"><h3>Primeiros passos</h3><ol><li><b>Custos:</b> informe impostos, taxas e o custo dos produtos.</li><li><b>Integrações → Códigos de UTM:</b> cole o código em cada anúncio (formato “nome|id”).</li>
    <li><b>Integrações → Webhooks:</b> cole o endereço na plataforma onde você vende.</li><li><b>Integrações → Gastos:</b> importe o CSV do Gerenciador de cada rede.</li><li><b>Pixel (opcional):</b> cole o script na página de vendas.</li></ol>
    <p class="hint">O que aparece zerado no Resumo é normal até a primeira venda. Use “Carregar dados de exemplo” (Integrações → Testes) para conhecer as telas.</p></div>
    <div class="panel"><h3>Glossário</h3><div class="tw"><table>${G.map(([a, b]) => `<tr><td class="l"><b>${a}</b></td><td class="l" style="white-space:normal">${b}</td></tr>`).join('')}</table></div></div>
    <div class="panel"><h3>Dúvidas comuns</h3><p><b>Uma venda aparece como “sem UTM”.</b> O anúncio não tinha o código de UTM, ou a plataforma não repassou os parâmetros. Confira em Integrações → Webhooks → dados brutos.</p>
    <p><b>O gasto não aparece na campanha.</b> O nome ou id no UTM precisa ser igual ao do CSV (formato “nome|id”).</p><p><b>Instagram Ads?</b> Vem junto com o Meta. <b>YouTube Ads?</b> Use utm_source=youtube e importe com a fonte YouTube.</p></div>`;
};

boot();

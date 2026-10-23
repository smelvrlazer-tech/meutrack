'use strict';
// ===== Núcleo: estado, utilidades, componentes (tabela, gráficos, filtros) e navegação =====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};

// ---- ícones (traçados simples, 24x24) ----
const IC = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', cart: 'M6 6h15l-1.5 9H8zM6 6L5 2H2M9 20h.01M18 20h.01',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h8', ads: 'M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.2-.7-.7-2.2z', percent: 'M19 5L5 19M7 7h.01M17 17h.01',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M17 13h.01',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  cog: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', auto: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 2v20M12 2a10 10 0 0 1 0 20z',
  shield: 'M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5zM9 12l2 2 4-4',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9', menu: 'M3 6h18M3 12h18M3 18h18', refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24"><path d="${IC[n] || IC.help}"/></svg>`;

// ---- estado ----
const S = {
  cfg: null, page: store.get('page', 'resumo'), opts: {}, tabs: {}, updated: Date.now(), sub: {},
  f: store.get('filters', { period: '7', from: '', to: '', account: '', source: '', platform: '', product: '', payment: '', chargeback: '', text: '' }),
};
const money = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: S.cfg?.dash.currency || 'BRL' });
const pct = (v) => v == null ? '—' : v.toLocaleString('pt-BR') + '%';
const dec = (v) => v == null ? '—' : v.toLocaleString('pt-BR');
const cls = (v) => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const compact = (v) => Math.abs(v) >= 1e3 ? (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : Math.round(v).toString();

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, headers: { 'Content-Type': 'application/json' } });
  if (r.status === 401) { showLogin(); throw new Error('login'); }
  return r.json();
}
function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}
function download(name, text, type = 'text/csv') {
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name }).click();
}
function modal(html, onMount) {
  const m = Object.assign(document.createElement('div'), { className: 'modal', innerHTML: `<div>${html}</div>` });
  m.addEventListener('mousedown', (e) => { if (e.target === m) m.remove(); });
  document.body.append(m); onMount?.(m); return m;
}

// ---- período e filtros ----
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function range() {
  const t = new Date(), p = S.f.period, ago = (n) => isoLocal(new Date(t - n * 864e5));
  if (p === 'all') return ['', ''];
  if (p === 'custom') return [S.f.from, S.f.to || S.f.from];
  if (p === 'month') return [isoLocal(new Date(t.getFullYear(), t.getMonth(), 1)), isoLocal(t)];
  if (p === 'lastmonth') return [isoLocal(new Date(t.getFullYear(), t.getMonth() - 1, 1)), isoLocal(new Date(t.getFullYear(), t.getMonth(), 0))];
  if (p === '1') return [ago(1), ago(1)];
  const n = +p; return [ago(n === 0 ? 0 : n - 1), isoLocal(t)];
}
function qs(extra = {}, lock = {}) {
  const [from, to] = range(), p = new URLSearchParams();
  if (from) { p.set('from', from); p.set('to', to || from); }
  for (const k of ['account', 'source', 'platform', 'product', 'payment', 'chargeback', 'text']) if (S.f[k]) p.set(k, S.f[k]);
  for (const [k, v] of Object.entries({ ...extra, ...lock })) p.set(k, v);
  return '?' + p;
}
const PERIODS = [['0', 'Hoje'], ['1', 'Ontem'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['month', 'Este mês'], ['lastmonth', 'Mês passado'], ['all', 'Máximo'], ['custom', 'Personalizado']];
function filterBar(mode, lockSource) {
  const o = S.opts, f = S.f;
  const sel = (id, label, opts, val, any = 'Qualquer') => `<label>${label}<select id="f_${id}"><option value="">${any}</option>${opts.map((x) => `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`;
  const period = `<label>Período de visualização<select id="f_period">${PERIODS.map(([v, l]) => `<option value="${v}" ${f.period === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const custom = f.period === 'custom' ? `<label>De<input type="date" id="f_from" value="${f.from}"></label><label>Até<input type="date" id="f_to" value="${f.to}"></label>` : '';
  const full = mode === 'f' ? `${sel('account', 'Conta de anúncio', o.accounts || [])}${lockSource ? '' : sel('source', 'Fonte de tráfego', S.cfg.sources.concat(['Taboola', 'Outro', 'Direto']))}
    ${sel('platform', 'Plataforma de venda', o.platforms || [])}${sel('product', 'Produto', o.products || [])}` : '';
  const more = mode === 'f' ? `<div class="more fgrid" id="moreBox" ${store.get('more', false) ? '' : 'hidden'}>
    ${sel('payment', 'Forma de pagamento', o.payments || [])}
    <label>Chargeback<select id="f_chargeback">${[['', 'Incluir'], ['exclude', 'Excluir chargebacks'], ['only', 'Somente chargebacks']].map(([v, l]) => `<option value="${v}" ${f.chargeback === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Buscar (campanha, e-mail, pedido)<input id="f_text" value="${esc(f.text)}" placeholder="texto"></label></div>` : '';
  return `<div class="fbar"><button class="icon-btn rf" id="btnRefresh" title="Atualizar">${ic('refresh')}</button>
    <div class="fgrid">${period}${custom}${full}</div>${more}
    ${mode === 'f' ? `<div class="foot"><button class="btn ghost sm" id="btnMore">Mais filtros</button></div>` : ''}</div>`;
}
function bindFilterBar() {
  const set = (k, v) => { S.f[k] = v; store.set('filters', S.f); render(); };
  for (const k of ['period', 'from', 'to', 'account', 'source', 'platform', 'product', 'payment', 'chargeback', 'text'])
    $('#f_' + k)?.addEventListener('change', (e) => { if (k === 'period' && e.target.value === 'custom' && !S.f.from) S.f.from = S.f.to = isoLocal(new Date()); set(k, e.target.value); });
  $('#btnRefresh')?.addEventListener('click', () => render());
  $('#btnMore')?.addEventListener('click', () => { const b = $('#moreBox'); b.hidden = !b.hidden; store.set('more', !b.hidden); });
}
const tickUpdated = () => {
  const el = $('#btnRefresh'); if (!el) return;
  const m = Math.floor((Date.now() - S.updated) / 60000);
  el.title = m < 1 ? 'Atualizar (atualizado agora mesmo)' : `Atualizar (atualizado há ${m} min)`;
};
setInterval(tickUpdated, 20000);

// ---- componentes: cartões, barras, gráficos ----
const card = (label, val, c = '', big = false) => `<div class="card ${big ? 'big' : ''}"><small>${label}</small><b class="${c}">${val}</b></div>`;
function bars(obj, fmt = money) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1]), max = e[0]?.[1] || 1;
  return e.length ? `<div class="bars">${e.map(([k, v]) => `<div class="it"><div class="h"><span>${esc(k)}</span><b>${fmt(v)}</b></div><div class="bar" style="width:${Math.max(2, v / max * 100)}%"></div></div>`).join('')}</div>` : '<div class="empty">Nenhuma venda por aqui</div>';
}
// ---- componentes visuais (uma cor de destaque + neutros) ----
const tip = (t) => `<span class="tip" tabindex="0" data-tip="${esc(t)}">?</span>`;
const RAMP = [100, 72, 50, 34, 22, 14].map((p) => `color-mix(in srgb, var(--c) ${p}%, var(--card))`);
function deltaHtml(cur, prev, goodUp = true) {
  if (cur == null || prev == null || prev === 0) return '<span class="delta flat">sem comparação</span>';
  const p = Math.round((cur - prev) / Math.abs(prev) * 100);
  if (p === 0) return '<span class="delta flat">igual ao período anterior</span>';
  const up = p > 0;
  return `<span class="delta ${up === goodUp ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(p).toLocaleString('pt-BR')}% <small>vs. período anterior</small></span>`;
}
function kpi({ label, value, tipText, delta = '', c = '', sub = '' }) {
  return `<div class="kpi"><div class="kl">${label}${tipText ? tip(tipText) : ''}</div><div class="kv ${c}">${value}</div>${sub ? `<div class="ks">${sub}</div>` : ''}${delta ? `<div class="kd">${delta}</div>` : ''}</div>`;
}
const shortMoney = (v) => {
  const s = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: S.cfg?.dash.currency || 'BRL' }).formatToParts(0).find((p) => p.type === 'currency').value, a = Math.abs(v);
  const f = (x) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return a >= 1e6 ? `${s} ${f(v / 1e6)} mi` : a >= 1e4 ? `${s} ${f(v / 1e3)} mil` : money(v);
};
function niceTicks(min, max, n = 4) {
  const span = (max - min) || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag, t = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + 1e-9; v += step) t.push(v);
  return t;
}
function donut(obj, fmt = money, centerLabel = 'Total') {
  let e = Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const tot = e.reduce((a, [, v]) => a + v, 0);
  if (!tot) return '<div class="empty">Nenhuma venda por aqui</div>';
  if (e.length > 5) e = [...e.slice(0, 4), ['Outros', e.slice(4).reduce((a, [, v]) => a + v, 0)]];
  let acc = 0;
  const seg = e.map(([k, v], i) => { const len = v / tot * 100, d = Math.max(len - .8, .1), s = `<circle cx="21" cy="21" r="15.9155" fill="none" style="stroke:${RAMP[i]}" stroke-width="5" stroke-dasharray="${d} ${100 - d}" stroke-dashoffset="${-acc}"><title>${esc(k)}: ${fmt(v)}</title></circle>`; acc += len; return s; }).join('');
  return `<div class="donut"><div class="dsvg"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--hover)" stroke-width="5"/>${seg}</svg><div class="ctr"><div><b>${fmt === money ? shortMoney(tot) : fmt(tot)}</b>${centerLabel}</div></div></div>
    <ul>${e.map(([k, v], i) => `<li><em style="background:${RAMP[i]}"></em><i>${esc(k)}</i><span><b>${Math.round(v / tot * 100)}%</b>${fmt(v)}</span></li>`).join('')}</ul></div>`;
}
function funnelHtml(steps) {
  const n = steps.length, W = 800, H = 180, mid = H / 2, cw = W / n, first = Math.max(steps[0][1], 1);
  let prev = 1;
  const ratio = steps.map(([, v]) => { prev = Math.min(prev, v / first); return prev; });
  const hh = ratio.map((r) => Math.max(1.2, r * (mid - 6))), xs = hh.map((_, i) => (i + .5) * cw);
  const top = [`M0,${mid - hh[0]}`, `L${xs[0]},${mid - hh[0]}`], bot = [`L${W},${mid + hh[n - 1]}`, `L${xs[n - 1]},${mid + hh[n - 1]}`];
  for (let i = 1; i < n; i++) { const xm = (xs[i - 1] + xs[i]) / 2; top.push(`C${xm},${mid - hh[i - 1]} ${xm},${mid - hh[i]} ${xs[i]},${mid - hh[i]}`); }
  top.push(`L${W},${mid - hh[n - 1]}`);
  for (let i = n - 1; i > 0; i--) { const xm = (xs[i] + xs[i - 1]) / 2; bot.push(`C${xm},${mid + hh[i]} ${xm},${mid + hh[i - 1]} ${xs[i - 1]},${mid + hh[i - 1]}`); }
  bot.push(`L0,${mid + hh[0]}`, 'Z');
  const lines = Array.from({ length: n - 1 }, (_, i) => `<line x1="${(i + 1) * cw}" x2="${(i + 1) * cw}" y1="0" y2="${H}" stroke="currentColor" opacity=".13" vector-effect="non-scaling-stroke"/>`).join('');
  const fmtPct = (v) => { const p = v / first * 100; return (p >= 10 ? Math.round(p) : Math.round(p * 10) / 10).toLocaleString('pt-BR') + '%'; };
  const cell = (html) => `<div>${html}</div>`;
  return `<div class="hf" style="--n:${n}">
    <div class="hf-row hf-names">${steps.map(([nm]) => cell(esc(nm))).join('')}</div>
    <div class="hf-body"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="fng" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--c)" stop-opacity=".95"/><stop offset="1" style="stop-color:var(--c)" stop-opacity=".5"/></linearGradient></defs>
      <path d="${top.join(' ')} ${bot.join(' ')}" fill="url(#fng)"/>${lines}</svg>
      <div class="hf-row hf-pct">${steps.map(([, v]) => cell(`<span>${fmtPct(v)}</span>`)).join('')}</div></div>
    <div class="hf-row hf-vals">${steps.map(([, v], i) => cell(`<b>${dec(v)}</b><small>${i ? (v > steps[i - 1][1] ? 'acima da etapa anterior' : `${steps[i - 1][1] ? (Math.round(v / steps[i - 1][1] * 1000) / 10).toLocaleString('pt-BR') : 0}% da etapa anterior`) : 'entrada do funil'}</small>`)).join('')}</div></div>`;
}
function areaChart(labels, series) {
  if (!labels.length) return '<div class="empty">Sem dados no período</div>';
  const W = 800, H = 240, p = { l: 52, r: 14, t: 12, b: 26 }, all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all), 5), min = ticks[0], max = ticks[ticks.length - 1];
  const x = (i) => p.l + (W - p.l - p.r) * (labels.length < 2 ? .5 : i / (labels.length - 1)), y = (v) => p.t + (H - p.t - p.b) * (1 - (v - min) / (max - min));
  const grid = ticks.map((v) => `<line x1="${p.l}" x2="${W - p.r}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity="${v === 0 ? .3 : .09}"/><text x="${p.l - 8}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`).join('');
  const step = Math.ceil(labels.length / 8);
  const xl = labels.map((l, i) => i % step === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(String(l).slice(5).split('-').reverse().join('/'))}</text>` : '').join('');
  const defs = series.map((s, k) => `<linearGradient id="ag${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color}" stop-opacity=".18"/><stop offset="1" style="stop-color:${s.color}" stop-opacity="0"/></linearGradient>`).join('');
  const paths = series.map((s, k) => { const pts = s.values.map((v, i) => `${x(i)},${y(v)}`); return `${s.fill ? `<polygon fill="url(#ag${k})" points="${p.l},${y(0)} ${pts.join(' ')} ${x(s.values.length - 1)},${y(0)}"/>` : ''}<polyline fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''} points="${pts.join(' ')}"/>`; }).join('');
  const bw = (W - p.l - p.r) / Math.max(labels.length - 1, 1);
  const hover = labels.map((l, i) => `<rect x="${x(i) - bw / 2}" y="${p.t}" width="${bw}" height="${H - p.t - p.b}" fill="transparent"><title>${esc(l)}\n${series.map((s) => `${s.name}: ${money(s.values[i])}`).join('\n')}</title></rect>`).join('');
  return `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div><svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs>${defs}</defs>${grid}${xl}${paths}${hover}</svg>`;
}
function hourBars(values, labelFn = (i) => `${i}h`) {
  const max = Math.max(...values, 1), best = values.indexOf(max), W = 800, H = 200, p = { l: 36, r: 6, t: 10, b: 24 }, bw = (W - p.l - p.r) / values.length;
  const ticks = niceTicks(0, max, 3), top = ticks[ticks.length - 1], yy = (t) => p.t + (H - p.t - p.b) * (1 - t / top);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:200px">${ticks.map((t) => `<line x1="${p.l}" x2="${W - p.r}" y1="${yy(t)}" y2="${yy(t)}" stroke="currentColor" opacity=".09"/><text x="${p.l - 6}" y="${yy(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('')}
    ${values.map((v, i) => { const h = (H - p.t - p.b) * v / top; return `<rect x="${p.l + i * bw + 3}" y="${H - p.b - h}" width="${bw - 6}" height="${Math.max(h, 1.5)}" rx="3" style="fill:var(--c)" opacity="${i === best && v ? 1 : .32}"><title>${labelFn(i)}: ${dec(v)} vendas</title></rect>`; }).join('')}
    ${values.map((v, i) => i % 3 === 0 ? `<text x="${p.l + i * bw + bw / 2}" y="${H - 7}" text-anchor="middle">${labelFn(i)}</text>` : '').join('')}</svg>`;
}

// ---- tabela com busca, ordenação, filtro de status, total e exportação ----
const COLS = [
  { k: 'vendas', l: 'Vendas', f: dec }, { k: 'cpa', l: 'CPA', f: money }, { k: 'gastos', l: 'Gastos', f: money }, { k: 'faturamento', l: 'Faturamento', f: money },
  { k: 'lucro', l: 'Lucro', f: money, c: 1 }, { k: 'roas', l: 'ROAS', f: dec }, { k: 'margem', l: 'Margem', f: pct }, { k: 'roi', l: 'ROI', f: pct },
  { k: 'cpc', l: 'CPC', f: money }, { k: 'ctr', l: 'CTR', f: pct }, { k: 'cpm', l: 'CPM', f: money }, { k: 'impressoes', l: 'Impressões', f: dec }, { k: 'cliques', l: 'Cliques', f: dec },
];
const SUM_KEYS = ['vendas', 'gastos', 'faturamento', 'lucro', 'impressoes', 'cliques'];
function totalsOf(rows) {
  const t = Object.fromEntries(SUM_KEYS.map((k) => [k, rows.reduce((a, r) => a + (r[k] || 0), 0)])), d = (a, b, m = 1) => b ? Math.round(a / b * m * 100) / 100 : null;
  return { ...t, cpa: d(t.gastos, t.vendas), roas: d(t.faturamento, t.gastos), margem: d(t.lucro, t.faturamento, 100), roi: d(t.lucro, t.gastos, 100),
    cpc: d(t.gastos, t.cliques), ctr: d(t.cliques, t.impressoes, 100), cpm: d(t.gastos, t.impressoes, 1000) };
}
function mountTable(el, o) {
  const st = { q: '', status: '', k: o.sort ?? null, dir: -1 };
  const statuses = [...new Set(o.rows.map((r) => r.status).filter(Boolean))];
  el.innerHTML = `<div class="row">${o.search === false ? '' : `<input class="tq" placeholder="Buscar…" style="width:220px">`}
    ${o.status && statuses.length ? `<select class="ts"><option value="">Status: todos</option>${statuses.map((s) => `<option>${esc(s)}</option>`).join('')}</select>` : ''}
    <span class="grow"></span><span class="hint tc" style="margin:0"></span>${o.export === false ? '' : '<button class="btn ghost sm tx">Exportar CSV</button>'}</div><div class="tw"></div>`;
  const body = $('.tw', el);
  const rowsNow = () => {
    let rows = o.rows.filter((r) => (!st.q || Object.values(r).join(' ').toLowerCase().includes(st.q)) && (!st.status || r.status === st.status));
    if (st.k) rows = rows.slice().sort((a, b) => { const x = a[st.k], y = b[st.k]; return ((x == null) - (y == null)) || (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.dir; });
    return rows;
  };
  const draw = () => {
    const rows = rowsNow(), cols = o.cols;
    $('.tc', el).textContent = `${rows.length} ${rows.length === 1 ? 'resultado' : 'resultados'}`;
    if (!rows.length) { body.innerHTML = `<div class="empty">${o.empty || 'Nenhum dado neste período.'}</div>`; return; }
    const tot = o.metrics ? totalsOf(rows) : (o.total ? o.total(rows) : null);
    body.innerHTML = `<table><thead><tr><th data-k="${o.nameKey || 'nome'}" class="l">${o.first}${st.k === (o.nameKey || 'nome') ? (st.dir < 0 ? ' ↓' : ' ↑') : ''}</th>
      ${cols.map((c) => `<th data-k="${c.k}" class="${c.left ? 'l' : ''}">${c.l}${st.k === c.k ? (st.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${o.nameHtml ? o.nameHtml(r) : esc(r[o.nameKey || 'nome'])}</td>${cols.map((c) => `<td class="${c.left ? 'l' : ''} ${c.c ? cls(r[c.k]) : ''}">${c.html ? c.html(r) : c.f(r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody>
      ${tot ? `<tfoot><tr><th class="l">Total (${rows.length})</th>${cols.map((c) => `<th class="${c.left ? 'l' : ''} ${c.c ? cls(tot[c.k]) : ''}">${tot[c.k] != null && c.f ? c.f(tot[c.k]) : ''}</th>`).join('')}</tr></tfoot>` : ''}</table>`;
    $$('th[data-k]', body).forEach((th) => th.onclick = () => { st.dir = st.k === th.dataset.k ? -st.dir : -1; st.k = th.dataset.k; draw(); });
  };
  $('.tq', el)?.addEventListener('input', (e) => { st.q = e.target.value.toLowerCase(); draw(); });
  $('.ts', el)?.addEventListener('change', (e) => { st.status = e.target.value; draw(); });
  $('.tx', el)?.addEventListener('click', () => {
    const rows = rowsNow(), keys = [o.nameKey || 'nome', ...o.cols.map((c) => c.k)];
    download(`${o.file || 'dados'}.csv`, [keys.join(';'), ...rows.map((r) => keys.map((k) => String(r[k] ?? '').replace(/;/g, ',')).join(';'))].join('\n'));
  });
  draw();
}

// ---- navegação ----
// [id, rótulo, ícone, filtros: 'f' completo | 'p' só período | '' nenhum]
const NAV = [
  ['Principal', [['resumo', 'Resumo', 'home', 'f'], ['vendas', 'Vendas', 'cart', 'f'], ['relatorios', 'Relatórios', 'file', 'f']]],
  ['Anúncios', [['rede:Meta', 'Meta Ads', 'ads', 'f'], ['rede:Google', 'Google Ads', 'ads', 'f'], ['rede:YouTube', 'YouTube Ads', 'ads', 'f'], ['rede:TikTok', 'TikTok Ads', 'ads', 'f'], ['rede:Kwai', 'Kwai Ads', 'ads', 'f'], ['campanhas', 'Todas as redes', 'ads', 'f']]],
  ['Análise', [['saude', 'Saúde do rastreamento', 'shield', 'p'], ['utms', 'UTMs', 'tag', 'f'], ['eventos', 'Eventos do pixel', 'bolt', '']]],
  ['Configuração', [['integracoes', 'Integrações', 'link', ''], ['regras', 'Regras', 'wrench', 'f'], ['custos', 'Custos', 'wallet', ''], ['notificacoes', 'Notificações', 'bell', '']]],
  ['Conta', [['avancado', 'Avançado', 'cog', ''], ['ajuda', 'Ajuda', 'help', '']]],
];
const NAVFLAT = NAV.flatMap(([, items]) => items);
const pages = {};

function drawNav() {
  $('#nav').innerHTML = NAV.map(([g, items]) => `<div class="grp">${g}</div>${items.map(([id, l, i]) => `<a data-p="${id}" class="${id === S.page ? 'on' : ''}">${ic(i)}${l}</a>`).join('')}`).join('');
  $$('#nav a').forEach((a) => a.onclick = () => go(a.dataset.p));
}
function go(page, sub) {
  if (page === 'taxas' || page === 'despesas') { sub = { ...(sub || S.sub), ctab: page === 'taxas' ? 'impostos' : 'despesas' }; page = 'custos'; }
  S.page = page; if (sub) S.sub = sub; store.set('page', page); $('#side').classList.remove('open'); render(); window.scrollTo(0, 0); }

async function render() {
  if (S.page === 'taxas' || S.page === 'despesas') { S.sub.ctab = S.page === 'taxas' ? 'impostos' : 'despesas'; S.page = 'custos'; }
  if (!NAVFLAT.some((n) => n[0] === S.page)) S.page = 'resumo';
  const [, label, , fmode0] = NAVFLAT.find((n) => n[0] === S.page), net = S.page.startsWith('rede:') ? S.page.slice(5) : '';
  const fmode = S.page === 'custos' ? (S.sub.ctab === 'despesas' ? 'p' : '') : fmode0;
  drawNav();
  $('#title').innerHTML = `${esc(label)}<small>${esc(S.cfg.dash.name)}</small>`;
  const v = $('#view');
  try {
    S.opts = await api('/api/options');
    v.innerHTML = (fmode ? filterBar(fmode, !!net) : '') + '<div id="pg"></div>';
    if (fmode) bindFilterBar();
    S.updated = Date.now(); tickUpdated();
    await (net ? pages.rede($('#pg'), net) : pages[S.page]($('#pg')));
  } catch (e) { if (e.message !== 'login') v.innerHTML = `<div class="panel"><div class="empty">Erro: ${esc(e.message)}</div></div>`; }
}

// ---- tema, login, inicialização ----
function applyTheme() {
  const t = store.get('theme', 'auto') || 'auto';
  document.documentElement.dataset.theme = (t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme:dark)').matches)) ? 'dark' : 'light';
  $('#themeBtn').innerHTML = ic(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'auto');
  $('#themeBtn').title = `Tema: ${{ auto: 'automático', light: 'claro', dark: 'escuro' }[t]} (clique para trocar)`;
}
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
async function loadCfg() {
  S.cfg = await api('/api/config');
  $('#dashSel').innerHTML = S.cfg.dashboards.map((d) => `<option value="${d.id}" ${d.id === S.cfg.dash.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
}
async function boot() {
  const me = await (await fetch('/api/me')).json();
  document.documentElement.style.setProperty('--c0', me.color);
  document.title = me.brandName;
  $$('.brand').forEach((e) => e.textContent = me.brandName);
  $('#menuBtn').innerHTML = ic('menu'); $('#logoutBtn').innerHTML = ic('out');
  applyTheme();
  if (!me.logged) return showLogin();
  $('#login').hidden = true; $('#app').hidden = false;
  await loadCfg(); await render();
  requestAnimationFrame(() => document.body.classList.add('ready'));
}
$('#themeBtn').onclick = () => { const n = { auto: 'light', light: 'dark', dark: 'auto' }[store.get('theme', 'auto') || 'auto']; store.set('theme', n); applyTheme(); };
matchMedia('(prefers-color-scheme:dark)').addEventListener?.('change', applyTheme);
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
$('#logoutBtn').onclick = async () => { await fetch('/api/logout'); showLogin(); };
$('#dashSel').onchange = async (e) => { document.cookie = `dash=${e.target.value}; path=/; max-age=31536000`; await loadCfg(); render(); };
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const r = await fetch('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
  if (r.ok) boot(); else $('#loginErr').textContent = 'Senha incorreta';
};

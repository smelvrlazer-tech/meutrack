// Servidor do rastreador: API + pixel + webhook + notificações + arquivos do painel.
// Rodar: node server.js  (precisa de Node 22+; sem dependências)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, 'config.json');
const SOURCES = ['Meta', 'Google', 'YouTube', 'TikTok', 'Kwai'];
const rand = (n = 8) => crypto.randomBytes(n).toString('hex');

// ---------- configuração e dashboards ----------
let cfg = { brandName: 'MeuTrack', color: '#0891b2', port: 3000 };
if (fs.existsSync(CONFIG_FILE)) cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
if (!cfg.dashboards) cfg.dashboards = [{ id: 'principal', name: 'Principal', token: cfg.webhookToken || rand(), tz: -3, currency: 'BRL' }];
delete cfg.webhookToken;
// a senha fica guardada só como "hash" (ninguém consegue ler a senha em config.json)
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
const checkPw = (pw) => { try { const [salt, h] = cfg.passwordHash.split(':'); return crypto.timingSafeEqual(Buffer.from(h, 'hex'), crypto.scryptSync(String(pw), salt, 32)); } catch { return false; } };
if (!cfg.passwordHash) cfg.passwordHash = hashPw(cfg.password || 'admin123');
delete cfg.password;
const saveCfg = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
saveCfg();

function migrate(d) {
  d.exec(`
CREATE TABLE IF NOT EXISTS sales(id INTEGER PRIMARY KEY, order_id TEXT UNIQUE, status TEXT, amount REAL, payment_method TEXT,
  product TEXT, source TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  email TEXT, created_at TEXT, platform TEXT DEFAULT '', country TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS spend(id INTEGER PRIMARY KEY, date TEXT, source TEXT, account TEXT DEFAULT '', campaign TEXT DEFAULT '', campaign_id TEXT DEFAULT '',
  adset TEXT DEFAULT '', adset_id TEXT DEFAULT '', ad TEXT DEFAULT '', ad_id TEXT DEFAULT '', spend REAL, impressions INTEGER, clicks INTEGER,
  status TEXT DEFAULT '', budget REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, ts TEXT, type TEXT, pixel TEXT, page TEXT, session TEXT, utm_json TEXT);
CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY, date TEXT, category TEXT, description TEXT, amount REAL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS product_costs(product TEXT PRIMARY KEY, cost REAL);
CREATE TABLE IF NOT EXISTS fees(id INTEGER PRIMARY KEY, name TEXT, pct REAL DEFAULT 0, fixed REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS rules_v2(id INTEGER PRIMARY KEY, json TEXT, enabled INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS webhook_log(id INTEGER PRIMARY KEY, ts TEXT, platform TEXT, raw TEXT, parsed TEXT);`);
  // bancos de versões anteriores
  for (const [t, c] of [['sales', "platform TEXT DEFAULT ''"], ['sales', "country TEXT DEFAULT ''"], ['spend', "adset TEXT DEFAULT ''"], ['spend', "adset_id TEXT DEFAULT ''"],
    ['spend', "ad TEXT DEFAULT ''"], ['spend', "ad_id TEXT DEFAULT ''"], ['spend', "status TEXT DEFAULT ''"], ['spend', 'budget REAL DEFAULT 0']])
    try { d.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`); } catch { /* já existe */ }
  try { d.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_spend ON spend(date,source,account,campaign,campaign_id,adset,adset_id,ad,ad_id)'); } catch { /* duplicados antigos */ }
}
const dbs = new Map();
function openDb(id) {
  if (!dbs.has(id)) {
    const d = new DatabaseSync(path.join(ROOT, id === 'principal' ? 'data.db' : `data-${id}.db`));
    migrate(d); dbs.set(id, d);
  }
  return dbs.get(id);
}
let db, dash; // dashboard em uso na requisição atual (o servidor processa uma por vez)
function useDash(id) { dash = cfg.dashboards.find((x) => x.id === id) || cfg.dashboards[0]; db = openDb(dash.id); return dash; }
useDash('principal');

// ---------- utilidades ----------
const send = (res, code, obj, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((ok) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 5e6) req.destroy(); });
  req.on('end', () => ok(b));
});
const num = (v) => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  let s = String(v).replace(/[^\d,.\-]/g, '');
  if (s.includes(',') && (!s.includes('.') || s.lastIndexOf(',') > s.lastIndexOf('.'))) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  return parseFloat(s) || 0;
};
const makeSid = () => crypto.createHmac('sha256', cfg.passwordHash).update('sid').digest('hex');
let SID = makeSid();
const cookieSid = (req) => `sid=${SID}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;
const fails = new Map(); // tentativas de login erradas por IP
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => [c.split('=')[0], decodeURIComponent(c.slice(c.indexOf('=') + 1))]));
const authed = (req) => cookies(req).sid === SID;
const getSetting = (k, d = 0) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? num(r.value) : d; };
const kv = (k, d = null) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); try { return r ? JSON.parse(r.value) : d; } catch { return d; } };
const setKv = (k, v) => db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(k, JSON.stringify(v));

// horário do dashboard (fuso em horas, ex.: -3)
const tzSql = () => `${dash.tz >= 0 ? '+' : ''}${dash.tz} hours`;
const localIso = (iso) => new Date(Date.parse(iso) + dash.tz * 3600e3).toISOString();
const localDate = (daysAgo = 0) => new Date(Date.now() + dash.tz * 3600e3 - daysAgo * 864e5).toISOString().slice(0, 10);

const normSource = (s = '') => {
  s = String(s).toLowerCase().trim();
  if (/youtube|^yt/.test(s)) return 'YouTube';
  if (/^(fb|ig|meta)|facebook|instagram/.test(s)) return 'Meta';
  if (/google|gads|^adwords/.test(s)) return 'Google';
  if (/tiktok|^tt$/.test(s)) return 'TikTok';
  if (/kwai/.test(s)) return 'Kwai';
  if (/taboola/.test(s)) return 'Taboola';
  return s ? 'Outro' : 'Direto';
};
const normStatus = (s = '') => {
  s = String(s).toLowerCase();
  if (/chargeback|dispute|contest/.test(s)) return 'chargeback';
  if (/refund|reembols|estorn/.test(s)) return 'refunded';
  if (/cancel|refus|recus|expir|abandon|fail|negad/.test(s)) return 'canceled';
  if (/unpaid|not_paid|waiting|aguard|pending|pendente|billet_printed|pix_created/.test(s)) return 'pending';
  if (/paid|approved|aprovad|complet|pago|confirm|finaliz|succeed|captur/.test(s)) return 'paid';
  return 'pending';
};
const normPay = (s = '') => {
  s = String(s).toLowerCase();
  if (/pix/.test(s)) return 'Pix';
  if (/bol|billet/.test(s)) return 'Boleto';
  if (/card|cart|credit/.test(s)) return 'Cartão';
  return 'Outro';
};

// ---------- métricas ----------
function ctx() {
  return {
    adTax: Object.fromEntries(SOURCES.map((s) => [s, getSetting('ad_tax_' + s)])),
    salesTax: getSetting('sales_tax'),
    fees: db.prepare('SELECT * FROM fees').all(),
    costs: Object.fromEntries(db.prepare('SELECT product,cost FROM product_costs').all().map((r) => [r.product, r.cost])),
  };
}
const sumBy = (a, f) => a.reduce((t, x) => t + f(x), 0);
const r2 = (x) => Math.round(x * 100) / 100;
function metrics(sales, spendRows, c, expenses = 0) {
  const paid = sales.filter((s) => s.status === 'paid');
  const pend = sales.filter((s) => s.status === 'pending');
  const ref = sales.filter((s) => s.status === 'refunded' || s.status === 'chargeback');
  const revenue = sumBy(paid, (s) => s.amount);
  const spend = sumBy(spendRows, (s) => s.spend);
  const adTax = sumBy(spendRows, (s) => s.spend * (c.adTax[s.source] || 0) / 100);
  const productCosts = sumBy(paid, (s) => c.costs[s.product] || 0);
  const fees = sumBy(c.fees, (f) => revenue * f.pct / 100 + paid.length * f.fixed);
  const salesTax = revenue * c.salesTax / 100;
  const profit = revenue - spend - adTax - salesTax - productCosts - fees - expenses;
  const impressions = sumBy(spendRows, (s) => s.impressions), clicks = sumBy(spendRows, (s) => s.clicks);
  return {
    vendas: paid.length, faturamento: r2(revenue), gastos: r2(spend), despesas: r2(expenses), lucro: r2(profit),
    roas: spend ? r2(revenue / spend) : null, roi: spend ? r2(profit / spend * 100) : null,
    margem: revenue ? r2(profit / revenue * 100) : null, cpa: paid.length ? r2(spend / paid.length) : null,
    ticket: paid.length ? r2(revenue / paid.length) : null,
    pendentes: r2(sumBy(pend, (s) => s.amount)), qtdPendentes: pend.length,
    reembolsadas: r2(sumBy(ref, (s) => s.amount)),
    reembolsoPct: paid.length + ref.length ? r2(ref.length / (paid.length + ref.length) * 100) : null,
    impostoVendas: r2(salesTax), impostoAnuncios: r2(adTax), custoProdutos: r2(productCosts), taxas: r2(fees),
    semUtm: paid.filter((s) => !s.utm_campaign).length,
    impressoes: impressions, cliques: clicks,
    cpc: clicks ? r2(spend / clicks) : null, ctr: impressions ? r2(clicks / impressions * 100) : null,
    cpm: impressions ? r2(spend / impressions * 1000) : null,
  };
}

function filters(q) {
  const g = (k) => q.get(k) || '';
  return { from: g('from') || '0000-01-01', to: g('to') || '9999-12-31', source: g('source'), product: g('product'), account: g('account'),
    platform: g('platform'), payment: g('payment'), chargeback: g('chargeback'), text: g('text') };
}
function loadSpend(f) {
  let sql = 'SELECT * FROM spend WHERE date BETWEEN ? AND ?'; const p = [f.from, f.to];
  if (f.source) { sql += ' AND source=?'; p.push(f.source); }
  if (f.account) { sql += ' AND account=?'; p.push(f.account); }
  return db.prepare(sql).all(...p);
}
function loadSales(f) {
  let sql = `SELECT * FROM sales WHERE date(created_at,'${tzSql()}') BETWEEN ? AND ?`; const p = [f.from, f.to];
  const add = (cond, v) => { sql += ' AND ' + cond; if (v !== undefined) p.push(v); };
  if (f.source) add('source=?', f.source);
  if (f.product) add('product=?', f.product);
  if (f.platform) add('platform=?', f.platform);
  if (f.payment) add('payment_method=?', f.payment);
  if (f.chargeback === 'exclude') add("status!='chargeback'");
  if (f.chargeback === 'only') add("status='chargeback'");
  if (f.text) { sql += ' AND (utm_campaign LIKE ? OR email LIKE ? OR order_id LIKE ? OR product LIKE ?)'; p.push(...Array(4).fill(`%${f.text}%`)); }
  let rows = db.prepare(sql).all(...p);
  if (f.account) { // vendas não têm conta; usa as campanhas que gastaram nessa conta
    const idx = campaignIndex(db.prepare('SELECT * FROM spend WHERE account=?').all(f.account));
    rows = rows.filter((s) => (s.utm_campaign || '').split('|').some((k) => idx.has(k.trim())));
  }
  return rows;
}
const loadExpenses = (f) => db.prepare('SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE date BETWEEN ? AND ?').get(f.from, f.to).t;

// campanha canônica: casa utm ("nome|id") com a tabela de gastos
function campaignIndex(spendRows, nk = 'campaign', ik = 'campaign_id') {
  const idx = new Map();
  for (const s of spendRows) {
    const canon = s[nk] || s[ik];
    if (s[nk]) idx.set(s[nk], canon);
    if (s[ik]) idx.set(s[ik], canon);
  }
  return idx;
}
function canonCampaign(utm, idx) {
  if (!utm) return '(sem UTM)';
  const parts = utm.split('|').map((x) => x.trim());
  for (const k of [utm, ...parts.reverse()]) if (idx.has(k)) return idx.get(k);
  return utm;
}
function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}
const normStatusAd = (s = '') => /activ|ativ|enabl|deliver|running|on$/i.test(s) ? 'Ativa' : /paus|inativ|inactiv|disabl|off|remov|archiv/i.test(s) ? 'Pausada' : s;

function campaignsReport(f, level) {
  const sales = loadSales(f), c = ctx();
  const allSpend = loadSpend(f);
  if (level === 'accounts') { // agrupa por conta de anúncio
    const idx = campaignIndex(allSpend), accOf = new Map(allSpend.map((s) => [s.campaign || s.campaign_id, s.account]));
    const sBy = groupBy(sales, (s) => accOf.get(canonCampaign(s.utm_campaign, idx)) || '(sem conta)');
    const spBy = groupBy(allSpend, (s) => s.account || '(sem conta)');
    return [...new Set([...sBy.keys(), ...spBy.keys()])].map((n) => ({ nome: n, level: 'account',
      source: (spBy.get(n) || [])[0]?.source || '-', ...metrics(sBy.get(n) || [], spBy.get(n) || [], c) })).sort((a, b) => b.gastos - a.gastos);
  }
  // convenção de UTM: campanha em utm_campaign, conjunto em utm_medium, anúncio em utm_content ("nome|id")
  const L = level === 'ads' ? { utm: 'utm_content', n: 'ad', i: 'ad_id' }
    : level === 'adsets' ? { utm: 'utm_medium', n: 'adset', i: 'adset_id' } : { utm: 'utm_campaign', n: 'campaign', i: 'campaign_id' };
  const spend = allSpend.filter((s) => s[L.n] || s[L.i]);
  const idx = campaignIndex(spend, L.n, L.i);
  const salesBy = groupBy(sales, (s) => canonCampaign(s[L.utm], idx));
  const spendBy = groupBy(spend, (s) => s[L.n] || s[L.i]);
  return [...new Set([...salesBy.keys(), ...spendBy.keys()])].map((n) => {
    const rows = (spendBy.get(n) || []).slice().sort((a, b) => a.date.localeCompare(b.date)), last = rows[rows.length - 1];
    return { nome: n, level: L.n, source: last?.source || (salesBy.get(n) || [])[0]?.source || '-', account: last?.account || '',
      status: normStatusAd(last?.status || ''), orcamento: last?.budget || null, atualizado: last?.date || '',
      ...metrics(salesBy.get(n) || [], rows, c) };
  }).sort((a, b) => b.gastos - a.gastos);
}

// ---------- notificações (Telegram, com as credenciais do próprio usuário) ----------
function notify(text) {
  const t = kv('cfg_telegram');
  if (!t?.token || !t?.chat) return;
  fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: t.chat, text }) }).catch(() => { /* sem internet: ignora */ });
}
const brl = (v) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: dash.currency || 'BRL' });
function saleMessage(s) {
  const n = kv('cfg_notif', {});
  const parts = [s.status === 'paid' ? 'Venda aprovada' : '⏳ Venda pendente'];
  if (n.showValue !== 'hide') parts.push(brl(s.amount));
  if (n.showProduct !== false) parts.push(s.product);
  if (n.showCampaign) parts.push(`UTM: ${s.utm_campaign || 'sem UTM'}`);
  if (n.showDash) parts.push(`[${dash.name}]`);
  return parts.join(' · ');
}
function todaySummary() {
  const d = localDate(0), f = { ...filters(new URLSearchParams()), from: d, to: d };
  const m = metrics(loadSales(f), loadSpend(f), ctx(), loadExpenses(f));
  const n = kv('cfg_notif', {});
  const head = ` ${dash.name} — hoje`;
  if (n.reportStyle === 'detalhado') return `${head}\nFaturamento ${brl(m.faturamento)}\nGastos ${brl(m.gastos)}\nLucro ${brl(m.lucro)}\nROAS ${m.roas ?? '—'} · ROI ${m.roi ?? '—'}%\nVendas ${m.vendas} · pendentes ${brl(m.pendentes)}`;
  return `${head}: ${m.lucro >= 0 ? ' lucro' : ' prejuízo'} de ${brl(m.lucro)} (faturou ${brl(m.faturamento)})`;
}

// ---------- regras ----------
const PERIODS = { today: [0, 0], yesterday: [1, 1], '7d': [6, 0], '30d': [29, 0] };
function evalRule(r) {
  const [a, b] = PERIODS[r.period] || PERIODS.today;
  const f = { ...filters(new URLSearchParams()), from: localDate(a), to: localDate(b), product: r.product || '', account: r.account || '' };
  const ops = { '>': (x, y) => x > y, '<': (x, y) => x < y, '>=': (x, y) => x >= y, '<=': (x, y) => x <= y, '=': (x, y) => x === y };
  return campaignsReport(f, r.level || 'campaigns').filter((row) => {
    if (r.nameText && !row.nome.toLowerCase().includes(r.nameText.toLowerCase())) return false;
    if (r.applyTo === 'active' && row.status && row.status !== 'Ativa') return false;
    if (r.applyTo === 'paused' && row.status !== 'Pausada') return false;
    return (r.conditions || []).length > 0 && r.conditions.every((c) => row[c.metric] != null && ops[c.op]?.(row[c.metric], num(c.value)));
  }).map((row) => ({ regra: r.name, nome: row.nome, status: row.status, acao: r.action, valores: Object.fromEntries((r.conditions || []).map((c) => [c.metric, row[c.metric]])) }));
}
const ruleList = () => db.prepare('SELECT * FROM rules_v2 ORDER BY id').all().map((x) => ({ id: x.id, enabled: !!x.enabled, ...JSON.parse(x.json) }));

// ---------- recorrência (produtos marcados como mensal/anual em Taxas e custos) ----------
function recurrence() {
  const cfgR = kv('cfg_recur', {}), prods = Object.keys(cfgR).filter((p) => cfgR[p] === 'monthly' || cfgR[p] === 'annual');
  if (!prods.length) return null;
  const rows = db.prepare(`SELECT * FROM sales WHERE status='paid' AND product IN (${prods.map(() => '?').join(',')}) ORDER BY created_at`).all(...prods);
  const byCust = new Map();
  for (const s of rows) byCust.set(s.email || s.order_id, s);       // fica a última compra de cada cliente
  const now = Date.now(); let active = 0, churned = 0, mrr = 0;
  for (const s of byCust.values()) {
    const annual = cfgR[s.product] === 'annual', window = (annual ? 370 : 35) * 864e5;
    if (now - Date.parse(s.created_at) <= window) { active++; mrr += annual ? s.amount / 12 : s.amount; } else churned++;
  }
  return { ativos: active, mrr: r2(mrr), arr: r2(mrr * 12), arpu: active ? r2(mrr / active) : null, churn: active + churned ? r2(churned / (active + churned) * 100) : null };
}

// ---------- rotas autenticadas ----------
const filterOpts = (q) => filters(q);
const api = {
  'GET /api/config': (req, res) => {
    let platforms = []; // lista inicial = plataformas do Utmify; edite platforms.json para acrescentar as suas
    try { platforms = JSON.parse(fs.readFileSync(path.join(ROOT, 'platforms.json'), 'utf8')); } catch { /* sem lista */ }
    send(res, 200, { brandName: cfg.brandName, color: cfg.color, defaultPassword: checkPw('admin123'), platforms, sources: SOURCES, dash: { id: dash.id, name: dash.name, token: dash.token, tz: dash.tz, currency: dash.currency },
      dashboards: cfg.dashboards.map((d) => ({ id: d.id, name: d.name })) });
  },
  'GET /api/options': (req, res) => {
    const col = (sql) => db.prepare(sql).all().map((r) => r.v).filter(Boolean);
    send(res, 200, { products: col('SELECT DISTINCT product v FROM sales ORDER BY v'), accounts: col('SELECT DISTINCT account v FROM spend ORDER BY v'),
      platforms: col('SELECT DISTINCT platform v FROM sales ORDER BY v'), payments: col('SELECT DISTINCT payment_method v FROM sales ORDER BY v') });
  },
  'GET /api/summary': (req, res, q) => {
    const f = filterOpts(q), sales = loadSales(f), spend = loadSpend(f);
    const m = metrics(sales, spend, ctx(), loadExpenses(f));
    const pay = {}, prod = {}, src = {}, plat = {};
    for (const s of sales) {
      if (s.status === 'paid') {
        prod[s.product] = (prod[s.product] || 0) + s.amount; src[s.source] = (src[s.source] || 0) + s.amount;
        plat[s.platform || 'não informada'] = (plat[s.platform || 'não informada'] || 0) + s.amount;
      }
      pay[s.payment_method] ||= { total: 0, paid: 0 };
      pay[s.payment_method].total++;
      if (s.status === 'paid') pay[s.payment_method].paid++;
    }
    const aprov = Object.fromEntries(Object.entries(pay).map(([k, v]) => [k, Math.round(v.paid / v.total * 100)]));
    const paid = sales.filter((s) => s.status === 'paid'), cnt = (key) => paid.reduce((o, s) => { const k = key(s) || '(vazio)'; o[k] = (o[k] || 0) + 1; return o; }, {});
    const paidBy = (key) => paid.reduce((o, s) => { const k = key(s) || "(vazio)"; o[k] = (o[k] || 0) + s.amount; return o; }, {});
    const hour = Array.from({ length: 24 }, () => ({ vendas: 0, faturamento: 0 }));
    for (const s of paid) { const h = +localIso(s.created_at).slice(11, 13); hour[h].vendas++; hour[h].faturamento += s.amount; }
    // funil: eventos do pixel no período + vendas
    let fE;
    if (f.source) {
      const cnt = {}, seen = new Set();
      for (const e of db.prepare(`SELECT type, session, utm_json FROM events WHERE date(ts,'${tzSql()}') BETWEEN ? AND ?`).all(f.from, f.to)) {
        let u = {}; try { u = JSON.parse(e.utm_json || '{}'); } catch { /* sem utm */ }
        if (normSource(u.utm_source) !== f.source) continue;
        const k = e.type + '|' + e.session; if (seen.has(k)) continue;
        seen.add(k); cnt[e.type] = (cnt[e.type] || 0) + 1;
      }
      fE = Object.entries(cnt).map(([type, n]) => ({ type, n }));
    } else fE = db.prepare(`SELECT type, COUNT(DISTINCT session) n FROM events WHERE date(ts,'${tzSql()}') BETWEEN ? AND ? GROUP BY type`).all(f.from, f.to);
    const ev = Object.fromEntries(fE.map((r) => [r.type, r.n]));
    const customers = new Set(paid.map((s) => s.email || s.order_id)).size;
    send(res, 200, { ...m, bruto: r2(sumBy(sales.filter((s) => ['paid', 'refunded', 'chargeback'].includes(s.status)), (s) => s.amount)),
      chargeback: r2(sumBy(sales.filter((s) => s.status === 'chargeback'), (s) => s.amount)), qtdChargeback: sales.filter((s) => s.status === 'chargeback').length,
      arpu: customers ? r2(m.faturamento / customers) : null, leads: ev.Lead || 0,
      porProduto: prod, porFonte: src, porPlataforma: plat, porPagamento: paidBy((s) => s.payment_method), aprovacao: aprov, porPais: cnt((s) => s.country), porPosicionamento: cnt((s) => s.utm_term), porSrc: cnt((s) => s.utm_source),
      porHora: hour, funil: [['Cliques', m.cliques], ['Visitas na página', ev.PageView || 0], ['Viu a oferta', ev.ViewContent || 0], ['Checkout iniciado', ev.InitiateCheckout || 0], ['Vendas iniciadas', paid.length + m.qtdPendentes], ['Vendas aprovadas', paid.length]],
      recorrencia: recurrence(f) });
  },
  'GET /api/campaigns': (req, res, q) => send(res, 200, campaignsReport(filterOpts(q), q.get('level') || 'campaigns')),
  'GET /api/utms': (req, res, q) => {
    const f = filterOpts(q), by = q.get('by') || 'utm_campaign';
    if (!/^utm_(campaign|medium|content|source|term)$/.test(by)) return send(res, 400, { error: 'agrupamento inválido' });
    const text = (q.get('text') || '').toLowerCase();
    const sales = loadSales({ ...f, text: '' }), spend = loadSpend(f), c = ctx(), idx = campaignIndex(spend);
    const g = groupBy(sales, (s) => by === 'utm_campaign' ? canonCampaign(s.utm_campaign, idx) : (s[by] || '(vazio)'));
    const sp = by === 'utm_campaign' ? groupBy(spend, (s) => s.campaign || s.campaign_id) : new Map();
    send(res, 200, [...new Set([...g.keys(), ...sp.keys()])].filter((k) => !text || k.toLowerCase().includes(text))
      .map((k) => ({ nome: k, ...metrics(g.get(k) || [], sp.get(k) || [], c) })).sort((a, b) => b.faturamento - a.faturamento));
  },
  'GET /api/report': (req, res, q) => {
    const f = filterOpts(q), by = q.get('by') === 'hour' ? 'hour' : 'day';
    const sales = loadSales(f), spend = loadSpend(f), c = ctx();
    const g = groupBy(sales, (s) => by === 'hour' ? localIso(s.created_at).slice(11, 13) + 'h' : localIso(s.created_at).slice(0, 10));
    const sp = groupBy(spend, (s) => by === 'day' ? s.date : '_');
    const exp = Object.fromEntries(db.prepare('SELECT date, SUM(amount) t FROM expenses WHERE date BETWEEN ? AND ? GROUP BY date').all(f.from, f.to).map((r) => [r.date, r.t]));
    const keys = by === 'day' ? new Set([...g.keys(), ...sp.keys()]) : new Set(g.keys());
    send(res, 200, [...keys].sort().reverse().map((k) => ({ nome: k, ...metrics(g.get(k) || [], by === 'day' ? sp.get(k) || [] : [], c, by === 'day' ? exp[k] || 0 : 0) })));
  },
  'GET /api/sales': (req, res, q) => {
    const rows = loadSales(filterOpts(q)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 1000);
    const st = q.get('status');
    send(res, 200, rows.filter((r) => !st || r.status === st).map((r) => ({ ...r, created_at: localIso(r.created_at) })));
  },
  'GET /api/events': (req, res, q) => {
    const p = q.get('pixel'), t = q.get('type');
    let sql = 'SELECT * FROM events WHERE 1=1'; const a = [];
    if (p) { sql += ' AND pixel=?'; a.push(p); }
    if (t) { sql += ' AND type=?'; a.push(t); }
    const rows = db.prepare(sql + ' ORDER BY id DESC LIMIT 300').all(...a);
    send(res, 200, { rows, funnel: db.prepare("SELECT type, COUNT(*) n FROM events WHERE ts >= date('now','-7 day') GROUP BY type").all(),
      pixels: db.prepare('SELECT DISTINCT pixel v FROM events').all().map((r) => r.v), types: db.prepare('SELECT DISTINCT type v FROM events').all().map((r) => r.v) });
  },
  // diagnóstico: aponta onde o rastreamento pode estar falhando e por que os números podem não bater
  'GET /api/health': (req, res, q) => {
    const f = filterOpts(q), c = ctx();
    const paid = loadSales({ ...f, text: '' }).filter((s) => s.status === 'paid'), noUtm = paid.filter((s) => !s.utm_campaign);
    const pctNo = paid.length ? Math.round(noUtm.length / paid.length * 1000) / 10 : null;
    const plataformas = [...groupBy(paid, (s) => s.platform || 'não informada')].map(([nome, rs]) => {
      const n = rs.filter((s) => !s.utm_campaign).length; return { nome, vendas: rs.length, semUtm: n, pctSemUtm: Math.round(n / rs.length * 1000) / 10 };
    }).sort((a, b) => b.semUtm - a.semUtm);
    const camps = campaignsReport(f, 'campaigns').filter((x) => x.nome !== '(sem UTM)');
    const semGasto = camps.filter((x) => x.vendas > 0 && x.gastos === 0).map((x) => ({ nome: x.nome, vendas: x.vendas, faturamento: x.faturamento }));
    const semVenda = camps.filter((x) => x.gastos > 0 && x.vendas === 0).map((x) => ({ nome: x.nome, fonte: x.source, gastos: x.gastos }));
    const semCusto = [...new Set(paid.map((s) => s.product))].filter((p) => !(p in c.costs)).map((nome) => ({ nome, vendas: paid.filter((s) => s.product === nome).length }));
    const ago = (iso) => iso ? Math.round((Date.now() - Date.parse(iso)) / 6e4) : null;
    const lastWh = db.prepare('SELECT MAX(ts) t FROM webhook_log').get().t, lastEv = db.prepare('SELECT MAX(ts) t FROM events').get().t, lastSpend = db.prepare('SELECT MAX(date) d FROM spend').get().d;
    const whErr = db.prepare("SELECT COUNT(*) n FROM webhook_log WHERE ts >= ? AND parsed LIKE '%\"erro\"%'").get(new Date(Date.now() - 7 * 864e5).toISOString()).n;
    const spendAge = lastSpend ? Math.round((Date.parse(localDate(0)) - Date.parse(lastSpend)) / 864e5) : null;
    const whMin = ago(lastWh), evMin = ago(lastEv), fmtAgo = (m) => m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} dia(s)`;
    const checks = [
      { id: 'utm', title: 'Vendas com UTM', status: pctNo == null ? 'info' : pctNo < 5 ? 'ok' : pctNo < 20 ? 'warn' : 'bad',
        value: pctNo == null ? 'sem vendas' : `${(100 - pctNo).toLocaleString('pt-BR')}%`, detail: pctNo == null ? 'Ainda não há vendas aprovadas no período.' : `${noUtm.length} de ${paid.length} vendas aprovadas chegaram sem UTM, então não dá para saber de qual anúncio vieram.`, fix: { label: 'Ver códigos de UTM', page: 'integracoes', tab: 'utms' } },
      { id: 'webhook', title: 'Webhook de vendas', status: !lastWh ? 'bad' : whErr ? 'warn' : whMin > 1440 ? 'warn' : 'ok',
        value: !lastWh ? 'nada recebido' : `último há ${fmtAgo(whMin)}`, detail: !lastWh ? 'Nenhuma venda chegou por webhook. Conecte a plataforma de vendas.' : whErr ? `${whErr} webhook(s) com erro nos últimos 7 dias. Abra o registro para ver os dados brutos.` : whMin > 1440 ? 'Faz mais de um dia sem receber vendas. Se você vendeu nesse período, confira a plataforma.' : 'Recebendo normalmente.', fix: { label: 'Abrir webhooks', page: 'integracoes', tab: 'webhooks' } },
      { id: 'pixel', title: 'Pixel do site', status: !lastEv ? 'warn' : evMin > 1440 ? 'warn' : 'ok',
        value: !lastEv ? 'sem eventos' : `último há ${fmtAgo(evMin)}`, detail: !lastEv ? 'O pixel não enviou nenhum evento. Sem ele o funil fica incompleto e os UTMs se perdem entre a página e o checkout.' : evMin > 1440 ? 'O pixel não envia eventos há mais de um dia.' : 'Enviando eventos normalmente.', fix: { label: 'Ver instalação do pixel', page: 'integracoes', tab: 'pixel' } },
      { id: 'gastos', title: 'Gastos dos anúncios', status: lastSpend == null ? 'bad' : spendAge > 2 ? 'warn' : 'ok',
        value: lastSpend == null ? 'nada importado' : `até ${lastSpend.split('-').reverse().join('/')}`, detail: lastSpend == null ? 'Nenhum gasto foi importado: lucro e ROAS ficam errados.' : spendAge > 2 ? `Os gastos estão ${spendAge} dias atrasados. Importe a planilha mais recente.` : 'Gastos em dia.', fix: { label: 'Importar gastos', page: 'integracoes', tab: 'gastos' } },
      { id: 'semGasto', title: 'Campanhas com venda e sem gasto', status: semGasto.length ? 'warn' : 'ok', value: semGasto.length ? `${semGasto.length} campanha(s)` : 'nenhuma',
        detail: semGasto.length ? 'O UTM tem um nome ou id que não aparece na planilha de gastos. O lucro dessas campanhas está superestimado.' : 'Todo UTM com venda foi encontrado nos gastos.', fix: { label: 'Importar gastos', page: 'integracoes', tab: 'gastos' } },
      { id: 'semVenda', title: 'Campanhas com gasto e sem venda', status: semVenda.length ? 'warn' : 'ok', value: semVenda.length ? `${semVenda.length} campanha(s)` : 'nenhuma',
        detail: semVenda.length ? 'Gastaram dinheiro sem vendas atribuídas. Pode ser campanha ruim ou UTM faltando no anúncio.' : 'Toda campanha com gasto tem vendas.', fix: { label: 'Ver códigos de UTM', page: 'integracoes', tab: 'utms' } },
      { id: 'custos', title: 'Custo dos produtos', status: semCusto.length ? 'warn' : 'ok', value: semCusto.length ? `${semCusto.length} sem custo` : 'completo',
        detail: semCusto.length ? 'Produtos vendidos sem custo cadastrado: o lucro pode estar maior do que a realidade.' : 'Todos os produtos vendidos têm custo cadastrado.', fix: { label: 'Cadastrar custos', page: 'custos', tab: 'produtos' } },
    ];
    const noData = (id) => { const k = checks.find((x) => x.id === id); Object.assign(k, { status: 'info', value: 'sem dados', detail: 'Será verificado quando houver dados.' }); };
    if (!paid.length) { noData('semGasto'); noData('custos'); }
    if (!camps.length) noData('semVenda');
    send(res, 200, { checks, ok: checks.filter((x) => x.status === 'ok').length, total: checks.length, tabelas: { plataformas, semGasto, semVenda, semCusto } });
  },
  'GET /api/checklist': (req, res) => {
    const n = (sql) => db.prepare(sql).get().n;
    send(res, 200, [
      { id: 'taxas', label: 'Informar impostos e custo dos produtos', page: 'taxas', done: n("SELECT COUNT(*) n FROM settings WHERE key LIKE 'ad_tax_%' OR key='sales_tax'") > 0 || n('SELECT COUNT(*) n FROM product_costs') > 0 },
      { id: 'webhook', label: 'Conectar a plataforma de vendas (webhook)', page: 'integracoes', tab: 'webhooks', done: n('SELECT COUNT(*) n FROM sales') > 0 },
      { id: 'utm', label: 'Colocar o código de UTM nos anúncios', page: 'integracoes', tab: 'utms', done: n("SELECT COUNT(*) n FROM sales WHERE utm_campaign!=''") > 0 },
      { id: 'gastos', label: 'Importar os gastos dos anúncios', page: 'integracoes', tab: 'gastos', done: n('SELECT COUNT(*) n FROM spend') > 0 },
      { id: 'pixel', label: 'Instalar o pixel na página de vendas (opcional)', page: 'integracoes', tab: 'pixel', done: n('SELECT COUNT(*) n FROM events') > 0 },
    ]);
  },
  'GET /api/settings': (req, res) => send(res, 200, {
    ad_tax: Object.fromEntries(SOURCES.map((s) => [s, getSetting('ad_tax_' + s)])), sales_tax: getSetting('sales_tax'),
    fees: db.prepare('SELECT * FROM fees ORDER BY id').all(),
    costs: db.prepare('SELECT * FROM product_costs ORDER BY product').all(),
    products: db.prepare('SELECT DISTINCT product p FROM sales').all().map((r) => r.p),
  }),
  'POST /api/settings': (req, res, q, body) => {
    for (const [s, v] of Object.entries(body.ad_tax || {})) if (SOURCES.includes(s)) db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('ad_tax_' + s, String(num(v)));
    if ('sales_tax' in body) db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('sales_tax', String(num(body.sales_tax)));
    for (const c of body.costs || []) if (c.product) db.prepare('INSERT OR REPLACE INTO product_costs VALUES(?,?)').run(c.product, num(c.cost));
    if (body.fees) {
      db.exec('DELETE FROM fees');
      for (const f of body.fees) if (f.name) db.prepare('INSERT INTO fees(name,pct,fixed) VALUES(?,?,?)').run(String(f.name).slice(0, 60), num(f.pct), num(f.fixed));
    }
    send(res, 200, { ok: true });
  },
  'GET /api/kv': (req, res, q) => { const k = q.get('key') || ''; send(res, 200, /^cfg_/.test(k) ? kv(k, {}) : {}); },
  'POST /api/kv': (req, res, q, b) => {
    if (!/^cfg_[a-z_]+$/.test(b.key || '')) return send(res, 400, { error: 'chave inválida' });
    setKv(b.key, b.value); send(res, 200, { ok: true });
  },
  'POST /api/telegram/test': (req, res) => { notify(` ${cfg.brandName}: notificações funcionando (${dash.name}).`); send(res, 200, { ok: true }); },
  'GET /api/expenses': (req, res, q) => send(res, 200, db.prepare('SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC').all(filterOpts(q).from, filterOpts(q).to)),
  'POST /api/expenses': (req, res, q, b) => {
    db.prepare('INSERT INTO expenses(date,category,description,amount) VALUES(?,?,?,?)').run(b.date || localDate(0), b.category || 'Outros', b.description || '', num(b.amount));
    send(res, 200, { ok: true });
  },
  'DELETE /api/expenses': (req, res, q) => { db.prepare('DELETE FROM expenses WHERE id=?').run(+q.get('id')); send(res, 200, { ok: true }); },
  'GET /api/webhook-log': (req, res) => send(res, 200, db.prepare('SELECT * FROM webhook_log ORDER BY id DESC LIMIT 50').all().map((r) => ({ ...r, parsed: JSON.parse(r.parsed) }))),
  'POST /api/spend/csv': (req, res, q, b) => {
    const r = importSpendCsv(String(b.csv || ''), b.source, b.account);
    send(res, r.error ? 400 : 200, r);
  },
  'GET /api/rules': (req, res) => send(res, 200, ruleList()),
  'POST /api/rules': (req, res, q, b) => {
    const { id, enabled, ...rule } = b; if (!rule.name) rule.name = 'Regra';
    if (id) db.prepare('UPDATE rules_v2 SET json=? WHERE id=?').run(JSON.stringify(rule), id);
    else db.prepare('INSERT INTO rules_v2(json) VALUES(?)').run(JSON.stringify(rule));
    send(res, 200, { ok: true });
  },
  'POST /api/rules/toggle': (req, res, q, b) => { db.prepare('UPDATE rules_v2 SET enabled=? WHERE id=?').run(b.enabled ? 1 : 0, b.id); send(res, 200, { ok: true }); },
  'DELETE /api/rules': (req, res, q) => { db.prepare('DELETE FROM rules_v2 WHERE id=?').run(+q.get('id')); send(res, 200, { ok: true }); },
  'GET /api/rules/export': (req, res) => send(res, 200, ruleList().map(({ id, enabled, ...r }) => r)),
  'POST /api/rules/import': (req, res, q, b) => {
    for (const r of Array.isArray(b) ? b : []) db.prepare('INSERT INTO rules_v2(json) VALUES(?)').run(JSON.stringify(r));
    send(res, 200, { ok: true });
  },
  // avalia as regras agora; regras com ação "avisar" mandam Telegram, as demais só mostram (precisam das APIs dos anúncios)
  'POST /api/rules/run': (req, res, q, b) => {
    const out = [];
    for (const r of ruleList().filter((x) => x.enabled)) {
      const hits = evalRule(r); out.push(...hits);
      if (b.send && r.action === 'notify' && hits.length) notify(` ${r.name}: ${hits.map((h) => h.nome).join(', ')}`);
    }
    send(res, 200, out);
  },
  'GET /api/dashboards': (req, res) => send(res, 200, cfg.dashboards),
  'POST /api/dashboards': (req, res, q, b) => {
    const name = String(b.name || '').trim().slice(0, 40);
    if (!name) return send(res, 400, { error: 'Informe um nome' });
    const tz = Math.max(-12, Math.min(14, Math.round(num(b.tz ?? -3)))), currency = ['BRL', 'USD', 'EUR'].includes(b.currency) ? b.currency : 'BRL';
    if (b.id) { const d = cfg.dashboards.find((x) => x.id === b.id); if (!d) return send(res, 404, { error: 'não existe' }); Object.assign(d, { name, tz, currency }); }
    else {
      let id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dash';
      while (cfg.dashboards.some((x) => x.id === id)) id += '-' + rand(1);
      cfg.dashboards.push({ id, name, token: rand(), tz, currency });
    }
    saveCfg(); send(res, 200, { ok: true });
  },
  'DELETE /api/dashboards': (req, res, q) => {
    const id = q.get('id');
    if (id === 'principal' || cfg.dashboards.length < 2) return send(res, 400, { error: 'O dashboard principal não pode ser removido' });
    cfg.dashboards = cfg.dashboards.filter((d) => d.id !== id); saveCfg(); send(res, 200, { ok: true }); // o arquivo de dados é mantido
  },
  'POST /api/password': (req, res, q, b) => {
    const next = String(b.next || '');
    if (!checkPw(String(b.current || ''))) return send(res, 400, { error: 'A senha atual está incorreta.' });
    if (next.length < 8) return send(res, 400, { error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
    if (next === 'admin123') return send(res, 400, { error: 'Escolha uma senha diferente da inicial.' });
    cfg.passwordHash = hashPw(next); saveCfg(); SID = makeSid(); // as outras sessões abertas caem e precisam entrar de novo
    send(res, 200, { ok: true }, { 'Set-Cookie': cookieSid(req) });
  },
  'POST /api/appearance': (req, res, q, b) => {
    const name = String(b.brandName || '').trim().slice(0, 30), color = String(b.color || '');
    if (!name || !/^#[0-9a-fA-F]{6}$/.test(color)) return send(res, 400, { error: 'Informe um nome e uma cor válidos.' });
    cfg.brandName = name; cfg.color = color; saveCfg(); send(res, 200, { ok: true });
  },
  'GET /api/export': (req, res) => {
    const all = Object.fromEntries(['sales', 'spend', 'expenses', 'product_costs', 'fees', 'settings'].map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()]));
    send(res, 200, all, { 'Content-Disposition': `attachment; filename="${dash.id}-backup.json"` });
  },
  'POST /api/demo': (req, res) => { seedDemo(); send(res, 200, { ok: true }); },
  'POST /api/reset': (req, res) => {
    for (const t of ['sales', 'spend', 'events', 'expenses', 'webhook_log']) db.exec(`DELETE FROM ${t}`);
    send(res, 200, { ok: true });
  },
};

// ---------- importação de gastos (exportações de Meta, Google, YouTube, TikTok, Kwai) ----------
const SPEND_COLS = {
  date: ['date', 'day', 'dia', 'data', 'reporting starts', 'início dos relatórios', 'inicio dos relatorios', 'stat_time_day', 'date/time'],
  campaign: ['campaign name', 'campaign', 'nome da campanha', 'campanha'],
  campaign_id: ['campaign id', 'campaign id (api)', 'id da campanha'],
  adset: ['ad set name', 'nome do conjunto de anúncios', 'conjunto de anúncios', 'ad group name', 'ad group', 'grupo de anúncios', 'adgroup name'],
  adset_id: ['ad set id', 'id do conjunto de anúncios', 'ad group id', 'id do grupo de anúncios', 'adgroup id'],
  ad: ['ad name', 'nome do anúncio', 'anúncio', 'anuncio', 'ad', 'creative name'],
  ad_id: ['ad id', 'id do anúncio', 'creative id'],
  impressions: ['impressions', 'impressões', 'impressoes'],
  clicks: ['link clicks', 'cliques no link', 'clicks', 'cliques', 'clicks (all)'],
  status: ['campaign delivery', 'delivery', 'status da campanha', 'entrega da campanha', 'campaign status', 'status', 'ad status'],
  budget: ['budget', 'orçamento', 'orcamento', 'campaign budget', 'daily budget', 'orçamento da campanha'],
};
const SPEND_PREFIX = ['amount spent', 'valor usado', 'valor gasto', 'cost', 'custo', 'spend', 'total cost', 'gasto'];
function splitCsv(line, sep) {
  const out = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  return [...out, cur].map((x) => x.trim());
}
function normDate(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function importSpendCsv(text, source, account) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head5 = lines.slice(0, 5).join('\n');
  const sep = (head5.match(/;/g) || []).length > (head5.match(/,/g) || []).length ? ';' : ',';
  const find = (head, names) => head.findIndex((h) => names.includes(h));
  let hi = -1, head = [];
  for (let i = 0; i < Math.min(lines.length, 8); i++) { // Google coloca títulos antes do cabeçalho
    const h = splitCsv(lines[i], sep).map((x) => x.toLowerCase());
    if (find(h, SPEND_COLS.date) >= 0 && h.some((x) => SPEND_PREFIX.some((p) => x.startsWith(p)))) { hi = i; head = h; break; }
  }
  if (hi < 0) return { error: 'Não encontrei as colunas de data e de gasto. Confira se exportou com “dia” e “valor gasto/custo”.' };
  const col = Object.fromEntries(Object.entries(SPEND_COLS).map(([k, names]) => [k, find(head, names)]));
  const spendIdx = head.findIndex((x) => SPEND_PREFIX.some((p) => x.startsWith(p)));
  const src = normSource(source || 'meta');
  const ins = db.prepare(`INSERT INTO spend(date,source,account,campaign,campaign_id,adset,adset_id,ad,ad_id,spend,impressions,clicks,status,budget)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(date,source,account,campaign,campaign_id,adset,adset_id,ad,ad_id)
    DO UPDATE SET spend=excluded.spend, impressions=excluded.impressions, clicks=excluded.clicks, status=excluded.status, budget=excluded.budget`);
  let ok = 0, skip = 0;
  for (const l of lines.slice(hi + 1)) {
    const v = splitCsv(l, sep), g = (k) => (col[k] >= 0 ? v[col[k]] || '' : '');
    const date = normDate(g('date'));
    if (!date || /total/i.test(l.slice(0, 20))) { skip++; continue; }
    ins.run(date, src, account || 'Conta 1', g('campaign'), g('campaign_id'), g('adset'), g('adset_id'), g('ad'), g('ad_id'),
      num(v[spendIdx]), Math.round(num(g('impressions'))), Math.round(num(g('clicks'))), normStatusAd(g('status')), num(g('budget'))); ok++;
  }
  const lvl = col.ad >= 0 || col.ad_id >= 0 ? 'anúncio' : col.adset >= 0 || col.adset_id >= 0 ? 'conjunto' : 'campanha';
  return { importadas: ok, ignoradas: skip, nivel: lvl, colunas: Object.entries(col).filter(([, i]) => i >= 0).map(([k]) => k) };
}

// ---------- leitura de vendas de qualquer plataforma ----------
// procura o primeiro valor cujo nome (ou caminho "a.b") bate com algum apelido, do mais raso para o mais fundo
function deepFind(obj, aliases) {
  for (const al of aliases) {
    const want = al.toLowerCase().split('.');
    const queue = [obj];
    while (queue.length) {
      const n = queue.shift();
      if (!n || typeof n !== 'object') continue;
      let cur = n;
      for (const w of want) {
        if (!cur || typeof cur !== 'object') { cur = undefined; break; }
        const k = Object.keys(cur).find((x) => x.toLowerCase() === w);
        cur = k === undefined ? undefined : cur[k];
      }
      if (cur != null && typeof cur !== 'object' && cur !== '') return cur;
      for (const v of Object.values(n)) if (v && typeof v === 'object') queue.push(v);
    }
  }
  return undefined;
}
const ALIAS = {
  order: ['transaction', 'transaction_id', 'order_id', 'order_ref', 'sale_id', 'codigo_transacao', 'purchase.transaction', 'order.id', 'data.object.id', 'id'],
  status: ['order_status', 'purchase.status', 'payment_status', 'financial_status', 'status', 'event', 'webhook_event_type', 'evento', 'type'],
  amount: ['purchase.price.value', 'price.value', 'amount_total', 'total_price', 'order_value', 'charge_amount', 'sale_amount', 'full_price', 'valor', 'value', 'price', 'amount', 'total'],
  pay: ['purchase.payment.type', 'payment.type', 'payment_method', 'payment_type', 'forma_pagamento', 'method'],
  product: ['product.name', 'product_name', 'produto', 'product', 'offer.name', 'line_items.0.title', 'items.0.name'],
  email: ['buyer.email', 'customer.email', 'client.email', 'email'],
  date: ['approved_date', 'creation_date', 'created_at', 'purchase.order_date', 'date'],
  sck: ['sck', 'purchase.origin.sck', 'xcod', 'src'],
  country: ['buyer.address.country', 'customer.address.country', 'billing_address.country_code', 'billing_address.country', 'customer_details.address.country', 'country_code', 'country', 'pais'],
};
const toIso = (v) => {
  if (v == null) return new Date().toISOString();
  const n = Number(v), d = new Date(n > 1e11 ? n : n > 1e9 ? n * 1000 : v);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
};
function saveSale(p, opts = {}) {
  const f = (k) => deepFind(p, ALIAS[k]);
  const g = (k) => deepFind(p, [k, 'tracking.' + k, 'trackingparameters.' + k]);
  let utms = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map((k) => [k, g(k) || '']));
  const sck = f('sck');
  if (!utms.utm_campaign && sck) {
    const ev = db.prepare('SELECT utm_json FROM events WHERE session=? AND utm_json IS NOT NULL ORDER BY id DESC LIMIT 1').get(String(sck));
    if (ev) utms = { ...JSON.parse(ev.utm_json), ...Object.fromEntries(Object.entries(utms).filter(([, v]) => v)) };
  }
  const id = String(f('order') ?? crypto.randomUUID());
  const prev = db.prepare('SELECT status FROM sales WHERE order_id=?').get(id)?.status;
  const status = normStatus(f('status'));
  const amount = num(f('amount')) / (opts.cents ? 100 : 1);
  const row = [id, status, amount, normPay(f('pay')), String(f('product') || 'Produto'), normSource(utms.utm_source), utms.utm_source || '',
    utms.utm_medium || '', utms.utm_campaign || '', utms.utm_content || '', utms.utm_term || '', String(f('email') || ''), toIso(f('date')), opts.platform || '', String(f('country') || '').toUpperCase().slice(0, 40)];
  db.prepare(`INSERT INTO sales(order_id,status,amount,payment_method,product,source,utm_source,utm_medium,utm_campaign,utm_content,utm_term,email,created_at,platform,country)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(order_id) DO UPDATE SET status=excluded.status, country=COALESCE(NULLIF(country,''),excluded.country),
      amount=CASE WHEN excluded.amount>0 THEN excluded.amount ELSE amount END,
      payment_method=CASE WHEN excluded.payment_method!='Outro' THEN excluded.payment_method ELSE payment_method END,
      product=CASE WHEN excluded.product!='Produto' THEN excluded.product ELSE product END,
      utm_source=COALESCE(NULLIF(utm_source,''),excluded.utm_source), source=CASE WHEN utm_source='' THEN excluded.source ELSE source END,
      utm_medium=COALESCE(NULLIF(utm_medium,''),excluded.utm_medium), utm_campaign=COALESCE(NULLIF(utm_campaign,''),excluded.utm_campaign),
      utm_content=COALESCE(NULLIF(utm_content,''),excluded.utm_content), utm_term=COALESCE(NULLIF(utm_term,''),excluded.utm_term)`).run(...row);
  return { order_id: id, status, prev, amount, product: row[4], source: row[5], utm_campaign: row[8], payment: row[3] };
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const PIXEL_JS = `(function(){
var s=document.currentScript,base=s.src.replace(/\\/pixel\\.js.*/,''),pix=s.getAttribute('data-pixel')||'principal',dsh=s.getAttribute('data-dash')||'';
var K=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'],q=new URLSearchParams(location.search),u={};
try{u=JSON.parse(localStorage.getItem('_trk_utm')||'{}');}catch(e){}
K.forEach(function(k){if(q.get(k))u[k]=q.get(k);});
var sid;try{localStorage.setItem('_trk_utm',JSON.stringify(u));sid=localStorage.getItem('_trk_sid');
if(!sid){sid=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem('_trk_sid',sid);}}catch(e){sid='anon';}
function send(type){fetch(base+'/track'+(dsh?'?d='+dsh:''),{method:'POST',keepalive:true,headers:{'Content-Type':'text/plain'},
body:JSON.stringify({type:type,pixel:pix,page:location.href.split('?')[0],session:sid,utm:u})}).catch(function(){});}
window.trk=send;send('PageView');
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
try{var h=new URL(a.href);if(h.host===location.host||!/^https?:/.test(h.protocol))return;
K.forEach(function(k){if(u[k]&&!h.searchParams.has(k))h.searchParams.set(k,u[k]);});h.searchParams.set('sck',sid);a.href=h.toString();}catch(x){}},true);
})();`;

// ---------- arquivos estáticos ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
function serveStatic(req, res, pathname) {
  const f = path.normalize(path.join(ROOT, 'public', pathname === '/' ? 'index.html' : pathname));
  if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('não encontrado'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (p === '/pixel.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', ...CORS }); return res.end(PIXEL_JS); }
    const raw = req.method === 'POST' ? await readBody(req) : '';
    // a partir daqui tudo é síncrono: pode trocar o dashboard em uso com segurança

    if (p === '/track' && req.method === 'POST') {
      useDash(url.searchParams.get('d') || 'principal');
      let b = {}; try { b = JSON.parse(raw); } catch { /* ignora */ }
      db.prepare('INSERT INTO events(ts,type,pixel,page,session,utm_json) VALUES(?,?,?,?,?,?)')
        .run(new Date().toISOString(), String(b.type || 'PageView').slice(0, 40), String(b.pixel || '').slice(0, 40),
          String(b.page || '').slice(0, 300), String(b.session || '').slice(0, 60), b.utm && Object.keys(b.utm).length ? JSON.stringify(b.utm) : null);
      return send(res, 200, { ok: true }, CORS);
    }
    if (p.startsWith('/webhook/') && req.method === 'POST') {
      const [token, platform = ''] = p.slice(9).split('/');
      const d = cfg.dashboards.find((x) => x.token === token);
      if (!d) return send(res, 403, { error: 'token inválido' });
      useDash(d.id);
      let b; try { b = JSON.parse(raw); } catch { b = Object.fromEntries(new URLSearchParams(raw)); }
      let parsed;
      try { parsed = saveSale(b, { platform, cents: url.searchParams.get('cents') === '1' }); } catch (e) { parsed = { erro: String(e.message) }; }
      db.prepare('INSERT INTO webhook_log(ts,platform,raw,parsed) VALUES(?,?,?,?)').run(new Date().toISOString(), platform, raw.slice(0, 6000), JSON.stringify(parsed));
      db.exec('DELETE FROM webhook_log WHERE id <= (SELECT MAX(id) FROM webhook_log) - 200');
      const n = kv('cfg_notif', {});
      if (!parsed.erro && parsed.status !== parsed.prev && ((parsed.status === 'paid' && n.approved) || (parsed.status === 'pending' && n.pending))) notify(saleMessage(parsed));
      return send(res, parsed.erro ? 500 : 200, parsed);
    }
    if (p === '/api/login' && req.method === 'POST') {
      let b = {}; try { b = JSON.parse(raw); } catch { /* ignora */ }
      const ip = req.socket.remoteAddress || '', f = fails.get(ip), recent = f && Date.now() - f.t < 10 * 60e3;
      if (recent && f.n >= 5) return send(res, 429, { error: 'Muitas tentativas erradas. Aguarde 10 minutos.' });
      if (!checkPw(b.password ?? '')) { fails.set(ip, { n: (recent ? f.n : 0) + 1, t: Date.now() }); return send(res, 401, { error: 'senha incorreta' }); }
      fails.delete(ip);
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieSid(req) });
    }
    if (p === '/api/logout') return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
    if (p === '/api/me') return send(res, 200, { logged: authed(req), brandName: cfg.brandName, color: cfg.color });
    if (p.startsWith('/api/')) {
      if (!authed(req)) return send(res, 401, { error: 'não autenticado' });
      useDash(cookies(req).dash || 'principal');
      const h = api[`${req.method} ${p}`];
      if (!h) return send(res, 404, { error: 'rota não existe' });
      let b = {}; if (req.method === 'POST') { try { b = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'JSON inválido' }); } }
      return h(req, res, url.searchParams, b);
    }
    serveStatic(req, res, p);
  } catch (e) { console.error(e); send(res, 500, { error: String(e.message || e) }); }
});

// ---------- tarefas em segundo plano: resumos por horário e regras de aviso ----------
const sentReports = new Set(), lastRuns = new Map(), dayRuns = new Map();
function tick() {
  for (const d of cfg.dashboards) {
    useDash(d.id);
    const n = kv('cfg_notif', {}), now = new Date(Date.now() + d.tz * 3600e3), day = now.toISOString().slice(0, 10), hour = now.getUTCHours();
    const key = `${d.id}-${day}-${hour}`;
    if ((n.hours || []).includes(hour) && !sentReports.has(key)) { sentReports.add(key); notify(todaySummary()); }
    for (const r of ruleList().filter((x) => x.enabled && x.action === 'notify')) {
      const rk = `${d.id}-${r.id}`, every = (parseInt(r.frequency) || 15) * 60e3, dk = `${rk}-${day}`;
      if (Date.now() - (lastRuns.get(rk) || 0) < every || (r.dailyLimit && (dayRuns.get(dk) || 0) >= r.dailyLimit)) continue;
      lastRuns.set(rk, Date.now());
      const hits = evalRule(r);
      if (hits.length) { dayRuns.set(dk, (dayRuns.get(dk) || 0) + 1); notify(` ${r.name} (${d.name}): ${hits.map((h) => h.nome).join(', ')}`); }
    }
  }
}

// ---------- dados de demonstração ----------
function seedDemo() {
  for (const t of ['sales', 'spend', 'events', 'webhook_log']) db.exec(`DELETE FROM ${t}`);
  let rnd = 7; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const day = (n) => new Date(Date.now() + dash.tz * 3600e3 - n * 864e5).toISOString().slice(0, 10);
  const nets = [['Meta', 'Conta Meta 01', 'FB', ['Black Friday', 'Remarketing 7d']], ['Google', 'Conta Google 01', 'google', ['Pesquisa Marca', 'Display Amplo']],
    ['YouTube', 'Conta Google 01', 'youtube', ['Vídeo Oferta']], ['TikTok', 'Conta TikTok 01', 'tiktok', ['Spark Ads']], ['Kwai', 'Conta Kwai 01', 'kwai', ['Kwai Lookalike']]];
  const ins = db.prepare('INSERT INTO spend(date,source,account,campaign,campaign_id,adset,adset_id,ad,ad_id,spend,impressions,clicks,status,budget) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const creatives = []; let cid = 1000;
  for (const [src, acc, utm, camps] of nets) for (const cn of camps) {
    cid++;
    for (let a = 1; a <= 2; a++) for (let c = 1; c <= 2; c++) {
      const e = { src, utm, camp: `${cn}|${cid}`, set: `Conjunto ${a}|${cid}0${a}`, ad: `Criativo ${c}|${cid}0${a}${c}`, w: R() * R() + 0.1 };
      creatives.push(e);
      for (let d = 0; d < 30; d++) {
        const sp = (15 + R() * 40) * (src === 'Meta' ? 1.4 : 1), imp = Math.round(sp * (60 + R() * 40));
        ins.run(day(d), src, acc, cn, String(cid), `Conjunto ${a}`, `${cid}0${a}`, `Criativo ${c}`, `${cid}0${a}${c}`, +sp.toFixed(2), imp, Math.round(imp * (0.003 + R() * 0.008)), R() < 0.85 ? 'Ativa' : 'Pausada', 100);
      }
    }
  }
  const prods = [['Curso Online', 197], ['Mentoria', 497], ['Ebook', 27]], pays = ['Cartão', 'Pix', 'Boleto'], plats = ['hotmart', 'kiwify', 'eduzz', 'cartpanda'];
  for (let i = 0; i < 420; i++) {
    const e = creatives[Math.floor(R() * creatives.length)], [prod, price] = prods[Math.floor(R() * 3)];
    const st = R() < 0.72 ? 'paid' : R() < 0.7 ? 'pending' : R() < 0.5 ? 'refunded' : 'canceled';
    const at = new Date(Date.now() - Math.floor(R() * 30) * 864e5 - Math.floor(R() * 86400) * 1000).toISOString();
    const noUtm = R() < 0.06;
    saveSale({ order_id: 'DEMO-' + i, status: st, amount: price, payment_method: pays[Math.floor(R() * 3)], product: prod, email: `cliente${i % 170}@exemplo.com`, country: ['BR', 'BR', 'BR', 'BR', 'PT', 'US'][Math.floor(R() * 6)],
      utm_source: noUtm ? '' : e.utm, utm_campaign: noUtm ? '' : e.camp, utm_medium: noUtm ? '' : e.set, utm_content: noUtm ? '' : e.ad, created_at: at },
    { platform: plats[Math.floor(R() * plats.length)] });
  }
  // eventos do pixel proporcionais aos cliques e às vendas, para o funil ficar coerente
  const clicks = db.prepare('SELECT COALESCE(SUM(clicks),0) n FROM spend').get().n;
  const started = db.prepare("SELECT COUNT(*) n FROM sales WHERE status IN ('paid','pending')").get().n;
  const plan = [['PageView', Math.round(clicks * .83)], ['ViewContent', Math.round(started * 5.2)], ['Lead', Math.round(started * .9)], ['InitiateCheckout', Math.round(started * 1.7)]];
  const insEv = db.prepare('INSERT INTO events(ts,type,pixel,page,session,utm_json) VALUES(?,?,?,?,?,?)');
  db.exec('BEGIN');
  const utmName = { Meta: 'FB', Google: 'google', YouTube: 'youtube', TikTok: 'tiktok', Kwai: 'kwai' };
  const mix = db.prepare('SELECT source, SUM(clicks) n FROM spend GROUP BY source').all(), mixTot = mix.reduce((a, m) => a + m.n, 0) || 1;
  const pick = () => { let r = R() * mixTot; for (const m of mix) { r -= m.n; if (r <= 0) return JSON.stringify({ utm_source: utmName[m.source] || m.source }); } return null; };
  for (const [type, qty] of plan) for (let i = 0; i < qty; i++) insEv.run(new Date(Date.now() - Math.floor(R() * 30 * 864e5)).toISOString(), type, 'principal', 'https://seusite.com/oferta', type[0] + i, pick());
  db.exec('COMMIT');
  const recent = db.prepare("SELECT order_id, status, amount, product, source, utm_campaign, platform FROM sales ORDER BY id DESC LIMIT 6").all();
  recent.forEach((s, i) => db.prepare('INSERT INTO webhook_log(ts,platform,raw,parsed) VALUES(?,?,?,?)').run(new Date(Date.now() - (i * 17 + 4) * 6e4).toISOString(), s.platform, JSON.stringify({ order_id: s.order_id, status: s.status, amount: s.amount }), JSON.stringify({ order_id: s.order_id, status: s.status, amount: s.amount, product: s.product, source: s.source, utm_campaign: s.utm_campaign })));
  setKv('cfg_recur', { Mentoria: 'monthly' });
  const set = db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)');
  set.run('ad_tax_Meta', '12.15'); set.run('ad_tax_Google', '0'); set.run('sales_tax', '6');
  db.exec("DELETE FROM fees; INSERT INTO fees(name,pct,fixed) VALUES('Taxa da plataforma',4.99,1);");
  db.exec("INSERT OR REPLACE INTO product_costs VALUES('Curso Online',10),('Mentoria',50),('Ebook',0)");
}

if (require.main === module) {
  server.listen(cfg.port, () => console.log(`${cfg.brandName} rodando em http://localhost:${cfg.port}  (troque a senha em Avançado > Segurança)`));
  setInterval(tick, 60e3);
}

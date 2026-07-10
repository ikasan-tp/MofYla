import { Storage } from './storage.js';
import { showToast } from './components/toast.js';

const STORE_KEY = 'brand:data';
const SCHEMA_VERSION = 7;
const todayKey = () => new Date().toISOString().slice(0, 10);
const CUSTOMER_STATUSES = ['お問い合わせ','見積り','デザイン確認','制作中','印刷','塗装','梱包','発送','完了'];
const LEAD_STATUSES = ['未調査','調査済','DM送信','返信待ち','商談中','サンプル送付','導入済','見送り'];
const LEAD_POTENTIALS = ['未設定','高','中','低'];
const WHOLESALE_STATUSES = ['商談中','納品準備中','納品済み','受注中','追加発注待ち','取り扱い終了'];
const CATEGORIES = ['ネームプレート','コースター','キーホルダー','その他'];
const TASK_FILTERS = ['今日','期限近い','マルシェ関連','制作','SNS','事務作業','完了済み'];
const DAILY_TASKS = [
  { id:'daily-sns-post', title:'SNS投稿を1件確認する', memo:'投稿作成、予約、投稿済みチェックのどれか1つでOK。', priority:'中', energy:'軽い', category:'SNS', minutes:15 },
  { id:'daily-order-check', title:'注文・問い合わせを確認する', memo:'DM、メール、LINEをざっと見るだけでOK。', priority:'高', energy:'軽い', category:'事務作業', minutes:10 }
];
const DEMO_WORDS = ['神戸マルシェ','山田さま','うさぎネームプレート','肉球風コースター','デモ売上','MOF-001','迷子札','マルシェ什器','うさぎ専門店サンプル','rabbit_sample','rabbit_shop'];

let state;
let activeTaskFilter = '今日';
let activeProductTab = 'online';
let activeDocumentTab = 'invoice';
let documentHistoryFilter = { type:'all', query:'', status:'', month:'' };
let brandDashboardInitialized = false;

function uid(prefix){ return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; }
function yen(value){ return `${Number(value || 0).toLocaleString('ja-JP')}円`; }
function escapeHtml(value = ''){ return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function asArray(value){ return Array.isArray(value) ? value : []; }
function clamp(value){ return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }
function daysUntil(date){
  if(!date) return null;
  const base = new Date(`${todayKey()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target - base) / 86400000);
}
function byDue(a, b){ return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'); }
function priorityValue(item){ return ({高:3, 中:2, 低:1})[item.priority] || 1; }
function progressBar(value){ return `<div class="brand-progress" style="--value:${clamp(value)}%"><span></span></div>`; }
function empty(text = 'まだ登録がありません。必要になったら1つだけ追加しましょう。'){ return `<div class="brand-empty">${text}</div>`; }
function pageHead(title, desc, action){ return `<div class="page-head"><div><p class="eyebrow">MofYla operations</p><h2>${title}</h2><p>${desc}</p></div>${action || ''}</div>`; }

function emptyState(){
  return {
    schemaVersion: SCHEMA_VERSION,
    energy:'普通',
    salesMonth:new Date().toISOString().slice(0, 7),
    monthlySalesGoal:0,
    dailyDone:{},
    goals:[],
    tasks:[],
    markets:[],
    sales:[],
    customers:[],
    leads:[],
    products:[],
    ideas:[],
    sellerProfile:{name:'', postalCode:'', address:'', phone:'', email:'', contact:'', invoiceRegistrationNumber:'', contactPerson:'', bankInfo:''},
    invoiceDraft:null,
    invoices:[],
    documentDrafts:{invoice:null, delivery:null},
    documents:[]
  };
}

function containsDemo(item){ return DEMO_WORDS.some(word => JSON.stringify(item || {}).includes(word)); }
function stripDemoData(){
  let changed = false;
  for(const key of ['goals','tasks','markets','sales','customers','leads','products','ideas']){
    const before = asArray(state[key]).length;
    state[key] = asArray(state[key]).filter(item => !containsDemo(item));
    if(state[key].length !== before) changed = true;
  }
  return changed;
}
function ensureShape(){
  const base = emptyState();
  state = { ...base, ...(state || {}) };
  for(const key of ['goals','tasks','markets','sales','customers','leads','products','ideas','invoices','documents']) state[key] = asArray(state[key]);
  state.dailyDone = state.dailyDone && typeof state.dailyDone === 'object' ? state.dailyDone : {};
  state.sellerProfile = { ...base.sellerProfile, ...(state.sellerProfile && typeof state.sellerProfile === 'object' ? state.sellerProfile : {}) };
  state.documentDrafts = state.documentDrafts && typeof state.documentDrafts === 'object' ? state.documentDrafts : {};
  state.documentDrafts.invoice = normalizeDocument(state.documentDrafts.invoice || state.invoiceDraft, 'invoice');
  state.documentDrafts.delivery = normalizeDocument(state.documentDrafts.delivery, 'delivery');
  state.invoiceDraft = state.documentDrafts.invoice;
  migrateInvoicesToDocuments();
  state.documents = asArray(state.documents).map(document => normalizeDocument(document, document.type)).filter(Boolean);
  state.schemaVersion = SCHEMA_VERSION;
}
async function load(){
  state = await Storage.get(STORE_KEY, null);
  if(!state) state = emptyState();
  const savedVersion = state.schemaVersion;
  ensureShape();
  let changed = stripDemoData();
  state.markets = state.markets.map(normalizeMarket);
  state.leads = state.leads.map(lead => {
    if(lead.potential) return lead;
    changed = true;
    return { ...lead, potential:'未設定' };
  });
  if(changed || savedVersion !== SCHEMA_VERSION) await save(false);
}
async function save(notify = true){
  syncInvoiceCompatibility();
  await Storage.set(STORE_KEY, state);
  if(notify) showToast('保存しました');
}

function dailyTaskInstances(){
  const today = todayKey();
  const done = state.dailyDone[today] || {};
  return DAILY_TASKS.map(task => ({ ...task, id:task.id, dueDate:today, done:!!done[task.id], isDaily:true }));
}
function allTasks(){ return [...dailyTaskInstances(), ...state.tasks]; }
function nextTask(){
  const list = allTasks().filter(task => !task.done && (state.energy !== '疲れた' || task.energy === '軽い'));
  list.sort((a, b) => priorityValue(b) - priorityValue(a) || byDue(a, b));
  return list[0];
}
function todayTasks(){
  const today = todayKey();
  return allTasks().filter(task => !task.done && (!task.dueDate || task.dueDate <= today)).sort((a, b) => priorityValue(b) - priorityValue(a) || byDue(a, b)).slice(0, 5);
}
function dueSoonTasks(){
  return state.tasks.filter(task => !task.done && daysUntil(task.dueDate) !== null && daysUntil(task.dueDate) <= 7).sort(byDue).slice(0, 5);
}
function monthlySales(){
  const month = state.salesMonth || new Date().toISOString().slice(0, 7);
  return state.sales.filter(sale => (sale.date || '').startsWith(month)).reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
}
function nextMarket(){ return [...state.markets].filter(market => daysUntil(market.date) === null || daysUntil(market.date) >= -1).sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0]; }
function marketProgress(market){ const checks = asArray(market.checklist); return checks.length ? Math.round(checks.filter(item => item.done).length / checks.length * 100) : 0; }
function customerProgress(customer){ return CUSTOMER_STATUSES.indexOf(customer.status) < 0 ? 0 : Math.round((CUSTOMER_STATUSES.indexOf(customer.status) + 1) / CUSTOMER_STATUSES.length * 100); }
function leadProgress(lead){ return LEAD_STATUSES.indexOf(lead.status) < 0 ? 0 : Math.round((LEAD_STATUSES.indexOf(lead.status) + 1) / LEAD_STATUSES.length * 100); }
function dueCustomers(){ return state.customers.filter(item => item.status !== '完了' && daysUntil(item.dueDate) !== null && daysUntil(item.dueDate) <= 10).sort((a,b)=>(a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 4); }
function todayLeads(){ return state.leads.filter(lead => lead.nextContactDate && lead.nextContactDate <= todayKey() && !['導入済','見送り'].includes(lead.status)).sort((a,b)=>a.nextContactDate.localeCompare(b.nextContactDate)).slice(0, 4); }
function customerCounts(){ return CUSTOMER_STATUSES.reduce((acc, status) => ({ ...acc, [status]:state.customers.filter(item => item.status === status).length }), {}); }
function leadCounts(){ return LEAD_STATUSES.reduce((acc, status) => ({ ...acc, [status]:state.leads.filter(item => item.status === status).length }), {}); }
function instagramUrl(value){
  const raw = String(value || '').trim();
  if(!raw) return '';
  if(/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/^www\.instagram\.com\//i, '').replace(/\/.*$/, '');
  return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : '';
}
function instagramLink(value){
  const label = String(value || '').trim();
  const url = instagramUrl(label);
  if(!url) return '-';
  return `<a class="brand-inline-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label || url)}</a>`;
}
function archiveDetails(title, items, renderer){
  if(!items.length) return '';
  return `<details class="brand-archive">
    <summary><span>${title}</span><b>${items.length}件</b></summary>
    <div class="brand-archive-body">${items.map(renderer).join('')}</div>
  </details>`;
}

function defaultMarketChecklist(){
  return ['商品数を決める','商品を制作する','値札を作る','POPを作る','ショップカードを用意する','什器を確認する','机を確認する','椅子を確認する','テントを確認する','搬入時間・搬出時間を確認する','持ち運び方法を確認する','備品を確認する','お釣りを用意する','SNSで告知する','搬入物を確認する']
    .map(title => ({ id:uid('check'), title, done:false }));
}

function normalizeMarket(market){
  const defaults = defaultMarketChecklist();
  const existing = asArray(market.checklist).filter(item => item.title !== 'QRコードを用意する');
  defaults.forEach(item => {
    if(!existing.some(old => old.title === item.title)) existing.push(item);
  });
  market.checklist = existing;
  market.deskStatus = market.deskStatus || '未確認';
  market.chairStatus = market.chairStatus || '未確認';
  market.tentStatus = market.tentStatus || '未確認';
  market.carryInTime = market.carryInTime || '';
  market.carryOutTime = market.carryOutTime || '';
  market.transportMethod = market.transportMethod || '';
  market.suppliesMemo = market.suppliesMemo || '';
  market.productItems = asArray(market.productItems).map(item => ({
    id:item.id || uid('marketProduct'),
    productName:item.productName || item.name || '',
    category:item.category || '',
    plannedQty:Number(item.plannedQty || 0),
    packedQty:Number(item.packedQty || 0),
    price:Number(item.price || 0),
    memo:item.memo || ''
  }));
  return market;
}

function marketProductTotals(market){
  const items = asArray(market.productItems);
  return {
    planned: items.reduce((sum, item) => sum + Number(item.plannedQty || 0), 0),
    packed: items.reduce((sum, item) => sum + Number(item.packedQty || 0), 0),
    value: items.reduce((sum, item) => sum + Number(item.price || 0) * (Number(item.packedQty) || Number(item.plannedQty) || 1), 0)
  };
}

function taskChips(task){
  const d = daysUntil(task.dueDate);
  return `<div class="brand-chiprow">
    ${task.isDaily ? '<span class="brand-chip ok">毎日の確認</span>' : ''}
    <span class="brand-chip ${task.priority === '高' ? 'warn' : ''}">優先度 ${task.priority || '中'}</span>
    <span class="brand-chip">${task.energy || '普通'}</span>
    <span class="brand-chip">${task.minutes || 15}分</span>
    ${task.dueDate ? `<span class="brand-chip ${d !== null && d <= 3 ? 'warn' : ''}">期限 ${task.dueDate}</span>` : ''}
  </div>`;
}
function taskItem(task, compact = false){
  return `<div class="brand-item ${task.done ? 'done' : ''}">
    <div class="brand-row">
      <label class="brand-checkline"><input type="checkbox" data-action="toggle-task" data-id="${task.id}" ${task.isDaily ? 'data-daily="true"' : ''} ${task.done ? 'checked' : ''}><span class="brand-title">${escapeHtml(task.title)}</span></label>
      <div class="brand-row">
        ${task.isDaily ? '' : `<button class="btn btn-ghost btn-small" data-action="postpone-task" data-id="${task.id}">明日に送る</button>`}
        ${compact || task.isDaily ? '' : `<button class="btn btn-ghost btn-small" data-action="edit-task" data-id="${task.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-task" data-id="${task.id}">削除</button>`}
      </div>
    </div>
    ${taskChips(task)}
    ${task.memo && !compact ? `<p class="brand-note">${escapeHtml(task.memo)}</p>` : ''}
    ${task.decomposition && !compact ? `<p class="brand-note">分解メモ: ${escapeHtml(task.decomposition)}</p>` : ''}
  </div>`;
}

function customerCard(customer){
  const d = daysUntil(customer.dueDate);
  return `<div class="brand-item">
    <div class="brand-row"><strong>${escapeHtml(customer.customerName || '名前未設定')} / ${escapeHtml(customer.productName || '商品未設定')}</strong><span class="brand-chip ${d !== null && d <= 3 ? 'warn' : ''}">納期まで${d ?? '-'}日</span></div>
    <div class="brand-meter"><span>${escapeHtml(customer.status || '未設定')} / ${customerProgress(customer)}%</span>${progressBar(customerProgress(customer))}</div>
    <p class="brand-note">${escapeHtml(customer.nextAction || customer.memo || '')}</p>
  </div>`;
}
function leadCard(lead){
  return `<div class="brand-item">
    <div class="brand-row"><strong>${escapeHtml(lead.shopName || '店舗名未設定')}</strong><span class="brand-chip ${potentialClass(lead.potential)}">見込み ${escapeHtml(lead.potential || '未設定')}</span></div>
    <div class="brand-meter"><span>営業進捗 ${leadProgress(lead)}%</span>${progressBar(leadProgress(lead))}</div>
    <p class="brand-note">${escapeHtml(lead.nextAction || '')} / ${lead.nextContactDate || '-'} / ${instagramLink(lead.instagram)}</p>
  </div>`;
}
function potentialClass(value){ return value === '高' ? 'hot' : value === '中' ? 'warm' : value === '低' ? 'cool' : ''; }

function isWholesaleProduct(product){ return product.salesChannel === 'wholesale' || product.isWholesale === true; }
function productDelivered(product, from, to){
  return asArray(product.deliveries)
    .filter(d => (!from || (d.date || '') >= from) && (!to || (d.date || '') <= to))
    .reduce((sum, d) => sum + Number(d.qty || 0), 0);
}
function productStoreName(product){ return product.storeName || product.shopName || product.wholesaleStore || '店舗未設定'; }
function wholesaleStoreNames(){ return [...new Set(state.products.filter(isWholesaleProduct).map(productStoreName))].sort((a,b)=>a.localeCompare(b,'ja')); }

function renderHome(){
  const root = document.getElementById('brandHome');
  if(!root) return;
  const task = nextTask();
  const market = nextMarket();
  const sales = monthlySales();
  const goal = Number(state.monthlySalesGoal || 0);
  root.innerHTML = `<div class="brand-home">
    <div class="brand-hero">
      <div class="brand-hero-top">
        <div><p class="eyebrow">今日のタスク</p><h2>${task ? escapeHtml(task.title) : '今日は整える日。必要ならタスクを1つ追加しましょう'}</h2><p class="brand-note">${task ? '今やることはこの1件だけ。終わったらチェックで大丈夫です。' : '空白の日も運用の一部です。'}</p></div>
        <div class="brand-energy">${['元気','普通','疲れた'].map(value => `<button class="${state.energy === value ? 'active' : ''}" data-action="set-energy" data-value="${value}">体力: ${value}</button>`).join('')}</div>
      </div>
      ${task ? taskItem(task, true) : ''}
      <div class="brand-row" style="margin-top:14px;"><button class="btn btn-primary" data-action="focus-next">次にやる</button></div>
    </div>
    <div class="brand-home-grid">
      <div class="brand-card"><div class="brand-mini-head"><h3>今日連絡する営業先</h3></div><div class="brand-list">${todayLeads().map(leadCard).join('') || empty('今日連絡予定の営業先はありません。')}</div></div>
      <div class="brand-card">
        <h3>次のマルシェ</h3>
        ${market ? `<p class="brand-title">${escapeHtml(market.name)}</p><p class="brand-note">${market.date || '-'} / ${escapeHtml(market.place || '')} / あと${daysUntil(market.date) ?? '-'}日</p><div class="brand-meter"><span>準備 ${marketProgress(market)}%</span>${progressBar(marketProgress(market))}</div>` : empty('予定マルシェはありません。')}
      </div>
      <div class="brand-card">
        <h3>今月売上</h3>
        <div class="brand-meter"><strong class="brand-metric">${yen(sales)}</strong><span class="brand-note">目標 ${yen(goal)} / あと ${yen(Math.max(0, goal - sales))}</span>${progressBar(goal ? sales / goal * 100 : 0)}</div>
      </div>
      <div class="brand-card"><div class="brand-mini-head"><h3>期限が近いもの</h3></div><div class="brand-list">${dueSoonTasks().map(task => taskItem(task, true)).join('') || empty('近い期限はありません。')}</div></div>
      <div class="brand-card"><div class="brand-mini-head"><h3>納期が近い注文</h3></div><div class="brand-list">${dueCustomers().map(customerCard).join('') || empty('近い納期の注文はありません。')}</div></div>
    </div>
  </div>`;
}

function renderTasks(){
  const root = document.getElementById('brandTasks');
  if(!root) return;
  const filtered = allTasks().filter(task => {
    const d = daysUntil(task.dueDate);
    if(activeTaskFilter === '今日') return !task.done && (!task.dueDate || task.dueDate <= todayKey());
    if(activeTaskFilter === '期限近い') return !task.done && d !== null && d <= 7;
    if(activeTaskFilter === '完了済み') return task.done;
    return task.category === activeTaskFilter;
  }).sort((a,b)=>Number(a.done)-Number(b.done) || priorityValue(b)-priorityValue(a) || byDue(a,b));
  const completed = allTasks().filter(task => task.done);
  root.innerHTML = `${pageHead('タスク管理','毎日の確認と個別タスクをここで整理します。', '<button class="btn btn-primary" data-action="new-task">追加</button>')}
    <div class="brand-toolbar"><div class="brand-filters">${TASK_FILTERS.map(f => `<button class="brand-filter ${activeTaskFilter === f ? 'active' : ''}" data-action="filter-task" data-value="${f}">${f}</button>`).join('')}</div></div>
    <div class="brand-list">${filtered.map(task => taskItem(task)).join('') || empty()}</div>
    ${activeTaskFilter === '完了済み' ? '' : archiveDetails('完了アーカイブ', completed, task => taskItem(task))}`;
}

function goalChildren(goal){ return state.goals.filter(g => g.parentId === goal.id); }
function goalProgress(goal){
  if(goal.progress !== null && goal.progress !== undefined && goal.progress !== '') return clamp(goal.progress);
  const children = goalChildren(goal);
  if(children.length) return Math.round(children.reduce((sum, child) => sum + goalProgress(child), 0) / children.length);
  const related = state.tasks.filter(task => task.goalId === goal.id);
  if(!related.length) return 0;
  return Math.round(related.filter(task => task.done).length / related.length * 100);
}
function renderGoals(){
  const root = document.getElementById('brandGoals');
  if(!root) return;
  const majorGoals = state.goals.filter(goal => goal.type === '大目標');
  const orphans = state.goals.filter(goal => goal.type !== '大目標' && !majorGoals.some(major => major.id === goal.parentId));
  const goalCard = (goal, isChild) => `<div class="brand-card brand-goal-card ${isChild ? 'brand-goal-child' : ''}">
    <div class="brand-goal-card-head"><span class="brand-chip">${escapeHtml(goal.type || '目標')}</span><h3 title="${escapeHtml(goal.title)}">${escapeHtml(goal.title)}</h3></div>
    <div class="brand-goal-card-actions"><button class="btn btn-ghost btn-small" data-action="edit-goal" data-id="${goal.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-goal" data-id="${goal.id}">削除</button></div>
    <p class="brand-note">${goal.dueDate ? `期限: ${goal.dueDate}` : '期限なし'}</p>${progressBar(goalProgress(goal))}<p class="brand-note">完了率 ${goalProgress(goal)}%</p><p class="brand-note">${escapeHtml(goal.memo || '')}</p></div>`;
  const groups = majorGoals.map(major => {
    const children = goalChildren(major);
    return `<section class="brand-goal-group">${goalCard(major, false)}${children.length ? `<div class="brand-goal-children">${children.map(child => goalCard(child, true)).join('')}</div>` : ''}</section>`;
  }).join('');
  const orphanSection = orphans.length ? `<section class="brand-goal-group"><div class="brand-mini-head"><h3>未分類</h3></div><div class="brand-goal-children">${orphans.map(goal => goalCard(goal, true)).join('')}</div></section>` : '';
  const content = groups || orphanSection ? `<div class="brand-goal-tree">${groups}${orphanSection}</div>` : empty();
  root.innerHTML = `${pageHead('目標管理','大目標ごとに、関連する中目標・小タスクをまとめて見ます。', '<button class="btn btn-primary" data-action="new-goal">追加</button>')}${content}`;
}

function renderMarkets(){
  const root = document.getElementById('brandMarkets');
  if(!root) return;
  root.innerHTML = `${pageHead('マルシェ準備','準備チェックと売上目標をまとめます。', '<button class="btn btn-primary" data-action="new-market">追加</button>')}
    <div class="brand-grid">${state.markets.map(market => {
      const productTotals = marketProductTotals(market);
      return `<div class="brand-card brand-market-card"><div class="brand-row"><div><h3>${escapeHtml(market.name)}</h3><p class="brand-note">${market.date || '-'} / ${escapeHtml(market.place || '')} / あと${daysUntil(market.date) ?? '-'}日</p></div><div class="brand-row"><button class="btn btn-ghost btn-small" data-action="edit-market" data-id="${market.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-market" data-id="${market.id}">削除</button></div></div><div class="brand-meter"><span>準備 ${marketProgress(market)}%</span>${progressBar(marketProgress(market))}</div><p class="brand-note">売上目標 ${yen(market.salesGoal)} / 実績 ${yen(market.actualSales)} / 参加費 ${yen(market.participationFee)}</p>
      ${market.participationFee ? `<p class="brand-note">差引 ${yen(Number(market.actualSales || 0) - Number(market.participationFee || 0))}（実績 - 参加費）</p>` : ''}
      <div class="brand-detail-grid">
        <div><small>机</small><strong>${escapeHtml(market.deskStatus || '未確認')}</strong></div>
        <div><small>椅子</small><strong>${escapeHtml(market.chairStatus || '未確認')}</strong></div>
        <div><small>テント</small><strong>${escapeHtml(market.tentStatus || '未確認')}</strong></div>
        <div><small>搬入</small><strong>${escapeHtml(market.carryInTime || '-')}</strong><span>搬入時間</span></div>
        <div><small>搬出</small><strong>${escapeHtml(market.carryOutTime || '-')}</strong><span>搬出時間</span></div>
        <div><small>持ち運び</small><strong>${escapeHtml(market.transportMethod || '-')}</strong><span>${escapeHtml(market.suppliesMemo || '備品メモなし')}</span></div>
      </div>
      <section class="brand-market-products">
        <div class="brand-mini-head"><h3>持っていく商品</h3><button class="btn btn-ghost btn-small" data-action="new-market-product" data-market="${market.id}">商品追加</button></div>
        <div class="brand-market-product-summary"><span>予定 ${productTotals.planned}点</span><span>持参 ${productTotals.packed}点</span><span>概算 ${yen(productTotals.value)}</span></div>
        <div class="brand-market-product-list">${asArray(market.productItems).map(item => `<div class="brand-market-product-row"><div><strong>${escapeHtml(item.productName || '商品名未設定')}</strong><span>${escapeHtml(item.category || '-')} / 予定 ${item.plannedQty || 0} / 持参 ${item.packedQty || 0} / ${yen(item.price)}</span>${item.memo ? `<p>${escapeHtml(item.memo)}</p>` : ''}</div><div class="brand-row"><button class="btn btn-ghost btn-small" data-action="edit-market-product" data-market="${market.id}" data-id="${item.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-market-product" data-market="${market.id}" data-id="${item.id}">削除</button></div></div>`).join('') || empty('持っていく商品はまだありません。')}</div>
      </section>
      <div class="brand-list brand-check-grid">${asArray(market.checklist).map(item => `<label class="brand-checkline"><input type="checkbox" data-action="toggle-market-check" data-market="${market.id}" data-id="${item.id}" ${item.done ? 'checked' : ''}><span>${escapeHtml(item.title)}</span></label>`).join('')}</div></div>`;
    }).join('') || empty()}</div>`;
}

function renderSales(){
  const root = document.getElementById('brandSales');
  if(!root) return;
  const total = monthlySales();
  const goal = Number(state.monthlySalesGoal || 0);
  const byCat = Object.fromEntries(CATEGORIES.map(cat => [cat, 0]));
  state.sales.filter(sale => (sale.date || '').startsWith(state.salesMonth)).forEach(sale => { byCat[sale.category] = (byCat[sale.category] || 0) + Number(sale.amount || 0); });
  root.innerHTML = `${pageHead('売上管理','月間目標とカテゴリ別の売上を見ます。', '<button class="btn btn-primary" data-action="new-sale">追加</button>')}
    <section class="brand-card brand-sales-hero">
      <div>
        <span class="brand-chip ok">${state.salesMonth || new Date().toISOString().slice(0, 7)}</span>
        <h3>${yen(total)}</h3>
        <p>目標 ${yen(goal)} / あと ${yen(Math.max(0, goal - total))}</p>
      </div>
      <button class="btn btn-ghost btn-small" data-action="edit-sales-goal">目標設定</button>
      <div class="brand-sales-progress">${progressBar(goal ? total / goal * 100 : 0)}</div>
    </section>
    <section class="brand-sales-section">
      <h3>カテゴリ別</h3>
      <div class="brand-sales-categories">${Object.entries(byCat).map(([cat, amount]) => `<div><span>${escapeHtml(cat)}</span><strong>${yen(amount)}</strong></div>`).join('')}</div>
    </section>
    <section class="brand-sales-section">
      <h3>売上履歴</h3>
      <div class="brand-sales-list">${state.sales.slice().sort((a,b)=>(b.date || '').localeCompare(a.date || '')).map(sale => `<div class="brand-sales-row"><div><strong>${yen(sale.amount)}</strong><span>${sale.date || '-'} / ${escapeHtml(sale.category)}</span>${sale.memo ? `<p>${escapeHtml(sale.memo)}</p>` : ''}</div><button class="btn btn-ghost btn-small brand-danger" data-action="delete-sale" data-id="${sale.id}">削除</button></div>`).join('') || empty()}</div>
    </section>`;
}

function customerOpsCard(customer){
  return `<article class="brand-card brand-ops-card">
      <div class="brand-ops-head">
        <div>
          <span class="brand-chip ok">${escapeHtml(customer.status || '未設定')}</span>
          <h3>${escapeHtml(customer.customerName || '名前未設定')}</h3>
          <p>${escapeHtml(customer.orderNo || '-')} / ${escapeHtml(customer.productName || '-')} / ${yen(customer.amount)}</p>
        </div>
        <div class="brand-product-actions">
          <button class="btn btn-ghost btn-small" data-action="edit-customer" data-id="${customer.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-customer" data-id="${customer.id}">削除</button>
        </div>
      </div>
      <div class="brand-meter"><span>制作進捗 ${customerProgress(customer)}%</span>${progressBar(customerProgress(customer))}</div>
      <div class="brand-detail-grid">
        <div><small>ペット</small><strong>${escapeHtml(customer.petName || '-')}</strong><span>${escapeHtml(customer.petType || '-')}</span></div>
        <div><small>納期</small><strong>${customer.dueDate || '-'}</strong><span>あと${daysUntil(customer.dueDate) ?? '-'}日</span></div>
        <div><small>入金</small><strong>${escapeHtml(customer.paid || '-')}</strong><span>完了日 ${customer.completedAt || '-'}</span></div>
      </div>
      <div class="brand-next-action"><small>次に確認</small><p>${escapeHtml(customer.nextAction || customer.memo || '未設定')}</p></div>
      <details class="brand-step-panel">
        <summary>ステータスを変更</summary>
        <div class="brand-status">${CUSTOMER_STATUSES.map(status => `<button class="brand-step ${customer.status === status ? 'active' : ''}" data-action="set-customer-status" data-id="${customer.id}" data-value="${status}">${status}</button>`).join('')}</div>
      </details>
    </article>`;
}

function leadOpsCard(lead){
  return `<article class="brand-card brand-ops-card">
      <div class="brand-ops-head">
        <div>
          <div class="brand-chiprow">
            <span class="brand-chip ok">${escapeHtml(lead.status || '未調査')}</span>
            <span class="brand-chip ${potentialClass(lead.potential)}">見込み ${escapeHtml(lead.potential || '未設定')}</span>
          </div>
          <h3>${escapeHtml(lead.shopName || '店舗名未設定')}</h3>
          <p>${escapeHtml(lead.area || '-')} / ${instagramLink(lead.instagram)}</p>
        </div>
        <div class="brand-product-actions">
          <button class="btn btn-ghost btn-small" data-action="edit-lead" data-id="${lead.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-lead" data-id="${lead.id}">削除</button>
        </div>
      </div>
      <div class="brand-meter"><span>営業進捗 ${leadProgress(lead)}%</span>${progressBar(leadProgress(lead))}</div>
      <div class="brand-detail-grid">
        <div><small>次回連絡</small><strong>${lead.nextContactDate || '-'}</strong><span>${lead.nextContactDate ? `あと${daysUntil(lead.nextContactDate)}日` : '-'}</span></div>
        <div><small>最終連絡</small><strong>${lead.lastContactDate || '-'}</strong><span>${escapeHtml(lead.person || '担当者未設定')}</span></div>
        <div><small>連絡先</small><strong>${escapeHtml(lead.email || lead.phone || '-')}</strong><span>${escapeHtml(lead.hp || '')}</span></div>
      </div>
      <div class="brand-next-action"><small>次にやること</small><p>${escapeHtml(lead.nextAction || '未設定')}</p></div>
      <details class="brand-step-panel">
        <summary>営業状況を変更</summary>
        <div class="brand-status">${LEAD_STATUSES.map(status => `<button class="brand-step ${lead.status === status ? 'active' : ''}" data-action="set-lead-status" data-id="${lead.id}" data-value="${status}">${status}</button>`).join('')}</div>
      </details>
    </article>`;
}

function renderCrm(){
  const root = document.getElementById('brandCrm');
  if(!root) return;
  const counts = customerCounts();
  const activeCustomers = state.customers.filter(customer => customer.status !== '完了');
  const archivedCustomers = state.customers.filter(customer => customer.status === '完了');
  root.innerHTML = `${pageHead('お客様管理','注文ごとの現在地が見えるよう、進捗バーとステータスで追います。', '<button class="btn btn-primary" data-action="new-customer">追加</button>')}
    <div class="brand-status-summary">${CUSTOMER_STATUSES.map(status => `<div class="brand-status-tile"><strong>${counts[status]}</strong><span>${status}</span></div>`).join('')}</div>
    <div class="brand-ops-grid">${activeCustomers.map(customerOpsCard).join('') || empty()}</div>
    ${archiveDetails('完了アーカイブ', archivedCustomers, customerOpsCard)}`;
}

function renderLeads(){
  const root = document.getElementById('brandLeads');
  if(!root) return;
  const counts = leadCounts();
  const activeLeads = state.leads.filter(lead => !['導入済','見送り'].includes(lead.status));
  const archivedLeads = state.leads.filter(lead => ['導入済','見送り'].includes(lead.status));
  root.innerHTML = `${pageHead('営業先管理','営業状況ごとの件数と、次の連絡予定を見やすくします。', '<button class="btn btn-primary" data-action="new-lead">追加</button>')}
    <div class="brand-status-summary">${LEAD_STATUSES.map(status => `<div class="brand-status-tile"><strong>${counts[status]}</strong><span>${status}</span></div>`).join('')}</div>
    <div class="brand-ops-grid">${activeLeads.map(leadOpsCard).join('') || empty()}</div>
    ${archiveDetails('完了・見送りアーカイブ', archivedLeads, leadOpsCard)}`;
}

function renderProducts(){
  const root = document.getElementById('brandProducts');
  if(!root) return;
  const isWholesale = isWholesaleProduct;
  const productStock = product => isWholesale(product) ? productDelivered(product) : Number(product.stock || 0);
  const productPrice = product => Number((isWholesale(product) ? product.wholesalePrice : product.price) || 0);
  const productStore = productStoreName;
  const onlineProducts = state.products.filter(product => !isWholesale(product));
  const wholesaleProducts = state.products.filter(isWholesale);
  const currentProducts = activeProductTab === 'wholesale' ? wholesaleProducts : onlineProducts;
  const stores = wholesaleStoreNames();
  const totalStock = currentProducts.reduce((sum, product) => sum + productStock(product), 0);
  const totalValue = currentProducts.reduce((sum, product) => sum + productStock(product) * productPrice(product), 0);
  const productCard = product => `<article class="brand-card brand-product-card">
      <div class="brand-product-head">
        <div class="brand-product-title">
          <h3>${escapeHtml(product.name || '商品名未設定')}</h3>
          <p>${escapeHtml(product.category || 'カテゴリ未設定')} / ${escapeHtml(product.status || '未設定')}</p>
        </div>
        <div class="brand-product-actions">
          <button class="btn btn-ghost btn-small" data-action="edit-product" data-id="${product.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-product" data-id="${product.id}">削除</button>
        </div>
      </div>
      ${isWholesale(product) ? `<span class="brand-wholesale-store">${escapeHtml(productStore(product))}</span>` : ''}
      <div class="brand-product-metrics">
        <span><b>${yen(productPrice(product))}</b><small>${isWholesale(product) ? '卸し価格' : '価格'}</small></span>
        <span><b>${yen(product.cost)}</b><small>原価</small></span>
        <span><b>${productStock(product)}</b><small>${isWholesale(product) ? '累計卸し数' : '在庫'}</small></span>
        <span><b>${product.minutes || 0}分</b><small>制作</small></span>
      </div>
      ${product.description ? `<p class="brand-note">${escapeHtml(product.description)}</p>` : '<p class="brand-note">説明はまだありません。</p>'}
      ${isWholesale(product) && product.wholesaleMemo ? `<p class="brand-note">${escapeHtml(product.wholesaleMemo)}</p>` : ''}
      ${isWholesale(product) ? `<section class="brand-market-products">
        <div class="brand-mini-head"><h3>卸し実績</h3><button class="btn btn-ghost btn-small" data-action="new-delivery" data-id="${product.id}">記録追加</button></div>
        <div class="brand-market-product-list">${asArray(product.deliveries).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(d => `<div class="brand-market-product-row"><div><strong>${d.date || '日付未設定'}</strong><span>${d.qty || 0}個</span>${d.memo ? `<p>${escapeHtml(d.memo)}</p>` : ''}</div><button class="btn btn-ghost btn-small brand-danger" data-action="delete-delivery" data-id="${product.id}" data-delivery="${d.id}">削除</button></div>`).join('') || empty('まだ卸し実績がありません。記録追加から入力できます。')}</div>
      </section>` : ''}
    </article>`;
  const tabs = `<div class="brand-product-tabs">
    <button class="brand-filter ${activeProductTab === 'online' ? 'active' : ''}" data-action="set-product-tab" data-value="online">ネット販売在庫 <span>${onlineProducts.length}</span></button>
    <button class="brand-filter ${activeProductTab === 'wholesale' ? 'active' : ''}" data-action="set-product-tab" data-value="wholesale">卸し商品 <span>${wholesaleProducts.length}</span></button>
  </div>`;
  const summary = `<div class="brand-status-summary">
    <div class="brand-status-tile"><strong>${currentProducts.length}</strong><span>商品数</span></div>
    <div class="brand-status-tile"><strong>${totalStock}</strong><span>${activeProductTab === 'wholesale' ? '累計卸し数' : '在庫合計'}</span></div>
    <div class="brand-status-tile"><strong>${activeProductTab === 'wholesale' ? stores.length : onlineProducts.length}</strong><span>${activeProductTab === 'wholesale' ? '店舗数' : 'ネット販売商品'}</span></div>
    <div class="brand-status-tile"><strong>${yen(totalValue)}</strong><span>${activeProductTab === 'wholesale' ? '累計卸し金額' : '在庫金額目安'}</span></div>
  </div>`;
  const wholesaleToolbar = activeProductTab === 'wholesale' ? `<div class="brand-toolbar"><button class="btn btn-ghost btn-small" data-action="export-deliveries-csv">卸し実績をCSV出力</button></div>` : '';
  const content = activeProductTab === 'wholesale'
    ? stores.map(store => {
        const items = wholesaleProducts.filter(product => productStore(product) === store);
        const stock = items.reduce((sum, product) => sum + productStock(product), 0);
        return `<details class="brand-archive brand-wholesale-group" open><summary><span>${escapeHtml(store)}</span><b>${items.length}商品 / 累計卸し${stock}</b></summary><div class="brand-product-grid">${items.map(productCard).join('')}</div></details>`;
      }).join('') || empty('卸し商品はまだありません。商品追加から管理区分を「卸し商品」にして登録できます。')
    : `<div class="brand-product-grid">${onlineProducts.map(productCard).join('') || empty('ネット販売在庫はまだありません。')}</div>`;
  root.innerHTML = `${pageHead('商品管理','卸し商品とネット販売在庫を分けて管理します。', '<button class="btn btn-primary" data-action="new-product">追加</button>')}${tabs}${summary}${wholesaleToolbar}${content}`;
}

function renderIdeas(){
  const root = document.getElementById('brandIdeas');
  if(!root) return;
  root.innerHTML = `${pageHead('アイデア帳','思いついたことをすぐ保存し、後からタスク化できます。', '<button class="btn btn-primary" data-action="new-brand-idea">追加</button>')}
    <div class="brand-grid">${state.ideas.map(idea => `<div class="brand-card"><div class="brand-row"><div><span class="brand-chip">${escapeHtml(idea.priority || '中')}</span><h3>${escapeHtml(idea.title)}</h3></div><div class="brand-row"><button class="btn btn-sage btn-small" data-action="idea-to-task" data-id="${idea.id}">タスク化</button><button class="btn btn-ghost btn-small" data-action="edit-brand-idea" data-id="${idea.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-idea" data-id="${idea.id}">削除</button></div></div><p class="brand-note">${escapeHtml(idea.memo || '')}</p><p class="brand-note">${escapeHtml(idea.tags || '')} / ${idea.createdAt || ''}</p></div>`).join('') || empty()}</div>`;
}

const DOCUMENT_TYPES = {
  invoice:{label:'請求書', prefix:'INV', statuses:['下書き','発行済み','入金済み'], other:'delivery'},
  delivery:{label:'納品書', prefix:'DN', statuses:['下書き','納品済み','受領確認済み'], other:'invoice'}
};
function safeNumber(value){ return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0); }
function documentLabel(type){ return DOCUMENT_TYPES[type]?.label || '帳票'; }
function normalizeDocument(document, fallbackType = 'invoice'){
  if(!document || typeof document !== 'object') return null;
  const type = document.type === 'delivery' ? 'delivery' : fallbackType === 'delivery' ? 'delivery' : 'invoice';
  const date = document.issueDate || document.date || todayKey();
  return {
    id:document.id || '',
    type,
    number:document.number || '',
    store:document.store || '',
    billTo:document.billTo || '',
    issueDate:date,
    date,
    deliveryDate:document.deliveryDate || (type === 'delivery' ? date : ''),
    dueDate:document.dueDate || '',
    periodFrom:document.periodFrom || '',
    periodTo:document.periodTo || '',
    taxRate:safeNumber(document.taxRate ?? 10),
    showPrices:document.showPrices !== false,
    receiptCopy:document.receiptCopy === true,
    subject:document.subject || '',
    destination:document.destination || '',
    items:asArray(document.items).map(item => ({
      id:item.id || uid('documentItem'),
      name:item.name || '品名未設定',
      qty:safeNumber(item.qty),
      unit:item.unit || '個',
      price:safeNumber(item.price)
    })),
    notes:document.notes || '',
    status:document.status || DOCUMENT_TYPES[type].statuses[0],
    createdAt:document.createdAt || '',
    updatedAt:document.updatedAt || ''
  };
}
function migrateInvoicesToDocuments(){
  const existingKeys = new Set(asArray(state.documents).map(document => `${document.type || 'invoice'}:${document.id || document.number}`));
  asArray(state.invoices).forEach(invoice => {
    const normalized = normalizeDocument(invoice, 'invoice');
    if(!normalized) return;
    normalized.type = 'invoice';
    normalized.id = normalized.id || uid('invoice');
    normalized.createdAt = normalized.createdAt || invoice.createdAt || new Date().toISOString();
    const key = `invoice:${invoice.id || invoice.number}`;
    if(!existingKeys.has(key)){
      state.documents.push(normalized);
      existingKeys.add(key);
    }
  });
}
function syncInvoiceCompatibility(){
  state.documentDrafts.invoice = normalizeDocument(state.documentDrafts.invoice, 'invoice');
  state.invoiceDraft = state.documentDrafts.invoice;
  state.invoices = asArray(state.documents).filter(document => document.type === 'invoice').map(document => ({ ...document, date:document.issueDate }));
}
function currentDocument(){ return normalizeDocument(state.documentDrafts?.[activeDocumentTab], activeDocumentTab); }
function setCurrentDocument(document){
  const normalized = normalizeDocument(document, document?.type || activeDocumentTab);
  state.documentDrafts[normalized.type] = normalized;
  if(normalized.type === 'invoice') state.invoiceDraft = normalized;
}
function nextDocumentNumber(type){
  const prefix = DOCUMENT_TYPES[type].prefix;
  const nums = [...asArray(state.documents), normalizeDocument(state.documentDrafts?.[type], type)]
    .filter(document => document && document.type === type)
    .map(document => {
      const m = new RegExp(`^${prefix}-(\\d+)$`).exec(document.number || '');
      return m ? Number(m[1]) : 0;
    });
  return `${prefix}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
}
function documentTotals(items, taxRate){
  const subtotal = asArray(items).reduce((sum, item) => sum + safeNumber(item.qty) * safeNumber(item.price), 0);
  const tax = Math.round(subtotal * safeNumber(taxRate) / 100);
  return { subtotal, tax, total:subtotal + tax, qty:asArray(items).reduce((sum, item) => sum + safeNumber(item.qty), 0) };
}
function documentItemsFromDeliveries(store, from, to){
  return state.products
    .filter(product => isWholesaleProduct(product) && productStoreName(product) === store)
    .map(product => ({
      id:uid('documentItem'),
      name:product.name || '商品名未設定',
      qty:productDelivered(product, from, to),
      unit:'個',
      price:safeNumber(product.wholesalePrice)
    }))
    .filter(item => item.qty > 0);
}
function sellerProfileLines(profile, forInvoice = false){
  const lines = [
    profile.name,
    profile.postalCode ? `〒${profile.postalCode}` : '',
    profile.address,
    profile.phone ? `TEL ${profile.phone}` : '',
    profile.email ? `MAIL ${profile.email}` : '',
    profile.contact || '',
    profile.invoiceRegistrationNumber ? `登録番号 ${profile.invoiceRegistrationNumber}` : '',
    profile.contactPerson ? `担当 ${profile.contactPerson}` : ''
  ].filter(Boolean).map(line => `<p>${escapeHtml(line)}</p>`).join('');
  const bank = forInvoice && profile.bankInfo ? `<div class="invoice-bank"><p>お振込先</p><p>${escapeHtml(profile.bankInfo)}</p></div>` : '';
  return `${lines || '<p>（発行者情報未設定）</p>'}${bank}`;
}
function renderDocumentTabs(){
  return `<div class="document-tabs no-print">
    ${['invoice','delivery','history'].map(tab => `<button class="${activeDocumentTab === tab ? 'active' : ''}" data-action="set-document-tab" data-value="${tab}">${tab === 'history' ? '履歴' : documentLabel(tab)}</button>`).join('')}
  </div>`;
}
function renderDocumentStartCards(){
  return `<div class="document-start-grid no-print">
    <button class="document-start-card" data-action="start-document" data-type="invoice"><strong>請求書を作成</strong><span>商品代金を請求するための書類です</span></button>
    <button class="document-start-card" data-action="start-document" data-type="delivery"><strong>納品書を作成</strong><span>納品した商品と数量をお知らせする書類です</span></button>
  </div>`;
}
function documentHeaderMeta(document){
  const numberLabel = document.type === 'delivery' ? '納品書番号' : '請求書番号';
  return `<div><span>${numberLabel}</span><strong>${escapeHtml(document.number || '-')}</strong></div>
    <div><span>発行日</span><strong>${document.issueDate || '-'}</strong></div>
    ${document.type === 'delivery' ? `<div><span>納品日</span><strong>${document.deliveryDate || '-'}</strong></div>` : `<div><span>支払期限</span><strong>${document.dueDate || '-'}</strong></div>`}`;
}
function documentIssuerBlock(profile, forInvoice = false){
  return `<div class="invoice-seller">
    <div class="document-stamp-logo"><img src="./assets/mofyla-logo.png" alt="MofYla logo"></div>
    ${sellerProfileLines(profile, forInvoice)}
  </div>`;
}
function receiptCopyBlock(document, totals, profile){
  if(document.type !== 'delivery' || document.receiptCopy !== true || document.showPrices === false) return '';
  return `<div class="receipt-copy">
    <div class="receipt-cut-line"><span>切り取り</span></div>
    <div class="receipt-copy-grid">
      <div class="receipt-copy-main">
        <div class="receipt-copy-meta"><span>領収日 ${document.issueDate || '-'}</span><span>番号 ${escapeHtml(document.number || '-')}</span></div>
        <h2>領収書 控え</h2>
        <p class="receipt-copy-to">${escapeHtml(document.billTo || document.store || 'お客様')}　様</p>
        <p>下記金額を領収いたしました。</p>
        <div class="receipt-copy-amount">${yen(totals.total)}</div>
        <p>但し　${escapeHtml(document.subject || '商品代金')}　として</p>
      </div>
      <div class="receipt-copy-issuer">
        <div class="document-stamp-logo"><img src="./assets/mofyla-logo.png" alt="MofYla logo"></div>
        <p><strong>${escapeHtml(profile.name || 'MofYla')}</strong></p>
        ${profile.postalCode ? `<p>${escapeHtml(`〒${profile.postalCode}`)}</p>` : ''}
        ${profile.address ? `<p>${escapeHtml(profile.address)}</p>` : ''}
        ${profile.phone ? `<p>${escapeHtml(`TEL ${profile.phone}`)}</p>` : ''}
      </div>
    </div>
  </div>`;
}
function renderDocumentPreview(document){
  const profile = state.sellerProfile || {};
  const items = asArray(document.items);
  const totals = documentTotals(items, document.taxRate);
  const isDelivery = document.type === 'delivery';
  const showPrices = document.showPrices !== false;
  const periodLabel = document.periodFrom || document.periodTo ? `${document.periodFrom || '-'} 〜 ${document.periodTo || '-'}` : '';
  const priceHeads = showPrices ? '<th>単価</th><th>金額</th>' : '';
  const priceFootColspan = showPrices ? 4 : 2;
  return `<div class="invoice-sheet document-sheet ${isDelivery ? 'delivery-sheet' : 'invoice-kind'}" id="invoiceSheet">
    <div class="invoice-head">
      <div>
        <h1>${documentLabel(document.type)}</h1>
        <p class="document-lead">${isDelivery ? '上記の通り納品いたしました。' : '下記の通りご請求申し上げます。'}</p>
      </div>
      <div class="invoice-meta">${documentHeaderMeta(document)}</div>
    </div>
    <div class="invoice-parties">
      <div class="invoice-billto"><span>${isDelivery ? '納品先' : 'ご請求先'}</span><strong>${escapeHtml(document.billTo || document.store || 'お客様')} 御中</strong></div>
      ${documentIssuerBlock(profile, false)}
    </div>
    <div class="document-info-grid">
      ${document.subject ? `<div><span>件名</span><strong>${escapeHtml(document.subject)}</strong></div>` : ''}
      ${document.destination ? `<div><span>納品場所</span><strong>${escapeHtml(document.destination)}</strong></div>` : ''}
      ${periodLabel ? `<div><span>対象期間</span><strong>${periodLabel}</strong></div>` : ''}
      ${isDelivery ? `<div class="document-qty-total"><span>納品数量</span><strong>合計${totals.qty}点</strong></div>` : ''}
    </div>
    ${isDelivery ? `<div class="delivery-total-highlight">納品数量　合計${totals.qty}点${showPrices ? ` / ${yen(totals.total)}（税込）` : ''}</div>` : `<div class="invoice-total-highlight">ご請求金額　${yen(totals.total)}（税込）</div>`}
    <table class="invoice-table document-table ${showPrices ? '' : 'hide-prices'}">
      <thead><tr><th>品名</th><th>数量</th><th>単位</th>${priceHeads}<th class="no-print"></th></tr></thead>
      <tbody>${items.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${safeNumber(item.qty)}</td><td>${escapeHtml(item.unit || '個')}</td>${showPrices ? `<td>${yen(item.price)}</td><td>${yen(safeNumber(item.qty) * safeNumber(item.price))}</td>` : ''}<td class="no-print"><button class="btn btn-ghost btn-small" data-action="edit-document-item" data-id="${item.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-document-item" data-id="${item.id}">削除</button></td></tr>`).join('') || `<tr><td colspan="${showPrices ? 6 : 4}">明細がありません。「明細を追加」から入力するか、卸し実績のある店舗で作成してください。</td></tr>`}</tbody>
      ${showPrices ? `<tfoot><tr><td colspan="${priceFootColspan}">小計</td><td colspan="2">${yen(totals.subtotal)}</td></tr><tr><td colspan="${priceFootColspan}">消費税（${safeNumber(document.taxRate)}%）</td><td colspan="2">${yen(totals.tax)}</td></tr><tr class="invoice-grand-total"><td colspan="${priceFootColspan}">合計</td><td colspan="2">${yen(totals.total)}</td></tr></tfoot>` : ''}
    </table>
    ${document.notes ? `<div class="invoice-notes"><p>備考</p><p>${escapeHtml(document.notes)}</p></div>` : ''}
    ${isDelivery ? '<div class="receipt-stamp"><span>受領印</span></div>' : sellerProfileLines(profile, true).includes('invoice-bank') ? `<div class="document-bank-wrap">${sellerProfileLines(profile, true).match(/<div class="invoice-bank">[\s\S]*<\/div>/)?.[0] || ''}</div>` : ''}
    ${receiptCopyBlock(document, totals, profile)}
  </div>`;
}
function renderDocumentHistory(){
  const query = documentHistoryFilter.query.trim().toLowerCase();
  const filtered = asArray(state.documents)
    .filter(document => documentHistoryFilter.type === 'all' || document.type === documentHistoryFilter.type)
    .filter(document => !query || [document.store, document.billTo, document.number].some(value => String(value || '').toLowerCase().includes(query)))
    .filter(document => !documentHistoryFilter.status || document.status === documentHistoryFilter.status)
    .filter(document => !documentHistoryFilter.month || (document.issueDate || '').startsWith(documentHistoryFilter.month))
    .sort((a,b) => (b.updatedAt || b.createdAt || b.issueDate || '').localeCompare(a.updatedAt || a.createdAt || a.issueDate || ''));
  const statusOptions = [...new Set(Object.values(DOCUMENT_TYPES).flatMap(type => type.statuses))];
  return `<div class="document-history no-print">
    <div class="document-history-filters">
      <select data-action="filter-document-history" data-filter="type"><option value="all">すべて</option><option value="invoice" ${documentHistoryFilter.type === 'invoice' ? 'selected' : ''}>請求書のみ</option><option value="delivery" ${documentHistoryFilter.type === 'delivery' ? 'selected' : ''}>納品書のみ</option></select>
      <input data-action="filter-document-history" data-filter="query" value="${escapeHtml(documentHistoryFilter.query)}" placeholder="店舗名・宛名・帳票番号で検索">
      <select data-action="filter-document-history" data-filter="status"><option value="">ステータスすべて</option>${statusOptions.map(status => `<option value="${escapeHtml(status)}" ${documentHistoryFilter.status === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select>
      <input type="month" data-action="filter-document-history" data-filter="month" value="${escapeHtml(documentHistoryFilter.month)}">
    </div>
    <div class="brand-archive-body">${filtered.map(documentHistoryCard).join('') || empty('条件に合う帳票はありません。')}</div>
  </div>`;
}
function documentHistoryCard(document){
  const totals = documentTotals(document.items, document.taxRate);
  const amount = document.type === 'delivery' && document.showPrices === false ? '価格非表示' : yen(totals.total);
  return `<div class="brand-card document-history-card">
    <div class="brand-row"><div><span class="document-badge ${document.type}">${documentLabel(document.type)}</span><strong>${escapeHtml(document.number || '-')}</strong><p class="brand-note">${escapeHtml(document.store || document.billTo || '店舗未設定')}</p></div><span class="brand-chip">${escapeHtml(document.status || '下書き')}</span></div>
    <p class="brand-note">発行日 ${document.issueDate || '-'} / ${document.type === 'delivery' ? `納品日 ${document.deliveryDate || '-'}` : `支払期限 ${document.dueDate || '-'}`}</p>
    <p class="brand-note">${amount} / 明細 ${asArray(document.items).length}件</p>
    <div class="brand-row document-card-actions">
      <button class="btn btn-ghost btn-small" data-action="open-document-history" data-id="${document.id}">開く</button>
      <button class="btn btn-ghost btn-small" data-action="edit-document-history" data-id="${document.id}">編集</button>
      <button class="btn btn-ghost btn-small" data-action="duplicate-document" data-id="${document.id}">複製</button>
      <button class="btn btn-primary btn-small" data-action="print-document-history" data-id="${document.id}">印刷・PDF保存</button>
      <button class="btn btn-sage btn-small" data-action="convert-document" data-id="${document.id}">${documentLabel(DOCUMENT_TYPES[document.type].other)}へ変換</button>
      <button class="btn btn-ghost btn-small brand-danger" data-action="delete-document-history" data-id="${document.id}">削除</button>
    </div>
  </div>`;
}
function renderInvoice(){
  const root = document.getElementById('brandInvoice');
  if(!root) return;
  const draft = currentDocument();
  const actions = `<button class="btn btn-ghost btn-small" data-action="edit-seller-profile">発行者情報</button>`;
  if(activeDocumentTab === 'history'){
    root.innerHTML = `${pageHead('帳票','請求書と納品書をまとめて作成・管理できます。', actions)}${renderDocumentTabs()}${renderDocumentHistory()}`;
    return;
  }
  const label = documentLabel(activeDocumentTab);
  const toolbar = draft ? `<div class="invoice-toolbar no-print">
    <button class="btn btn-ghost btn-small" data-action="edit-document-header">${label}情報を編集</button>
    <button class="btn btn-ghost btn-small" data-action="add-document-item">明細を追加</button>
    <button class="btn btn-ghost btn-small brand-danger" data-action="clear-document">${label}をクリア</button>
    <button class="btn btn-sage btn-small" data-action="save-document-history">${label}を履歴に保存</button>
    <button class="btn btn-primary btn-small" data-action="print-document">印刷・PDF保存</button>
  </div>` : renderDocumentStartCards();
  root.innerHTML = `${pageHead('帳票','請求書・納品書を、卸し実績から自動で作成できます。', actions)}${renderDocumentTabs()}${toolbar}${draft ? `<details class="brand-archive invoice-archive" id="invoiceArchive" open><summary class="no-print"><span>${label}プレビュー</span><b>${escapeHtml(draft.number || '-')}</b></summary><div class="document-preview-scroll">${renderDocumentPreview(draft)}</div></details>` : ''}${asArray(state.documents).length ? `<div class="no-print section-gap"><h3>最近の帳票</h3>${renderDocumentHistory()}</div>` : ''}`;
}

function renderAll(){ renderHome(); renderTasks(); renderGoals(); renderMarkets(); renderSales(); renderCrm(); renderLeads(); renderProducts(); renderIdeas(); renderInvoice(); }

function openForm(title, fields, values, onSubmit){
  const overlay = document.createElement('div');
  overlay.className = 'brand-modal-overlay';
  overlay.innerHTML = `<div class="brand-modal"><div class="brand-modal-head"><h3>${title}</h3><button class="modal-close" type="button" data-close-brand>×</button></div><form class="brand-modal-body"><div class="brand-form-grid">${fields.map(fieldHtml).join('')}</div><div class="toolbar" style="margin-top:16px;"><button class="btn btn-primary" type="submit">保存</button><button class="btn btn-ghost" type="button" data-close-brand>キャンセル</button></div></form></div>`;
  document.body.appendChild(overlay);
  fields.forEach(field => { const el = overlay.querySelector(`[name="${field.name}"]`); if(el) el.value = values[field.name] ?? field.default ?? ''; });
  overlay.addEventListener('click', event => { if(event.target.closest('[data-close-brand]')) overlay.remove(); });
  overlay.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    await onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()));
    overlay.remove();
    renderAll();
  });
}
function fieldHtml(field){
  if(field.type === 'section') return `<div class="brand-form-section">${field.label}</div>`;
  const cls = `brand-field ${field.full ? 'full' : ''}`;
  if(field.type === 'textarea') return `<div class="${cls}"><label>${field.label}</label><textarea name="${field.name}"></textarea></div>`;
  if(field.type === 'select') return `<div class="${cls}"><label>${field.label}</label><select name="${field.name}">${field.options.map(option => `<option value="${escapeHtml(option.value ?? option)}">${escapeHtml(option.label ?? option)}</option>`).join('')}</select></div>`;
  return `<div class="${cls}"><label>${field.label}</label><input name="${field.name}" type="${field.type || 'text'}"></div>`;
}
function optionsFrom(items, labelKey){ return [{value:'', label:'なし'}, ...items.map(item => ({ value:item.id, label:item[labelKey] || item.title || item.name || item.id }))]; }
function findBy(type, id){ return state[type].find(item => item.id === id); }
function upsert(type, item){ const i = state[type].findIndex(old => old.id === item.id); if(i >= 0) state[type][i] = item; else state[type].push(item); }
async function removeBy(type, id, label){
  if(!confirm(`${label}を削除します。よろしいですか？`)) return;
  state[type] = state[type].filter(item => item.id !== id);
  await save();
  renderAll();
}

function taskForm(task = {}){ openForm(task.id ? 'タスク編集' : 'タスク追加', [
  {name:'title',label:'タイトル',full:true},{name:'memo',label:'メモ',type:'textarea',full:true},{name:'dueDate',label:'期限',type:'date'},{name:'priority',label:'優先度',type:'select',options:['高','中','低']},{name:'goalId',label:'所属目標',type:'select',options:optionsFrom(state.goals,'title')},{name:'marketId',label:'所属マルシェ',type:'select',options:optionsFrom(state.markets,'name')},{name:'minutes',label:'作業時間目安',type:'number'},{name:'energy',label:'体力レベル',type:'select',options:['軽い','普通','重い']},{name:'category',label:'カテゴリ',type:'select',options:['制作','SNS','事務作業','マルシェ関連']},{name:'decomposition',label:'分解メモ',type:'textarea',full:true}
], task, async data => { upsert('tasks', {...task, ...data, id:task.id || uid('task'), done:!!task.done}); await save(); }); }
function goalForm(goal = {}){ openForm(goal.id ? '目標編集' : '目標追加', [{name:'type',label:'種類',type:'select',options:['大目標','中目標','小タスク']},{name:'title',label:'タイトル',full:true},{name:'parentId',label:'親目標（大目標のみ）',type:'select',options:optionsFrom(state.goals.filter(g => g.type === '大目標' && g.id !== goal.id),'title')},{name:'dueDate',label:'期限',type:'date'},{name:'progress',label:'進捗率（空欄なら自動）',type:'number'},{name:'memo',label:'メモ',type:'textarea',full:true}], goal, async data => { upsert('goals', {...goal, ...data, id:goal.id || uid('goal'), progress:data.progress === '' ? null : Number(data.progress)}); await save(); }); }
function marketForm(market = {}){ openForm(market.id ? 'マルシェ編集' : 'マルシェ追加', [
  {name:'name',label:'マルシェ名'},{name:'date',label:'日付',type:'date'},{name:'place',label:'場所'},{name:'participationFee',label:'参加費',type:'number'},{name:'salesGoal',label:'目標売上',type:'number'},{name:'actualSales',label:'実績売上',type:'number'},
  {name:'carryInTime',label:'搬入時間'},{name:'carryOutTime',label:'搬出時間'},{name:'transportMethod',label:'持ち運び方法',full:true},
  {name:'deskStatus',label:'机',type:'select',options:['未確認','主催者用意','自分で用意','不要']},{name:'chairStatus',label:'椅子',type:'select',options:['未確認','主催者用意','自分で用意','不要']},{name:'tentStatus',label:'テント',type:'select',options:['未確認','主催者用意','自分で用意','不要']},
  {name:'suppliesMemo',label:'備品メモ',type:'textarea',full:true}
], normalizeMarket(market), async data => { upsert('markets', normalizeMarket({...market, ...data, id:market.id || uid('market'), checklist:market.checklist || defaultMarketChecklist()})); await save(); }); }
function marketProductForm(marketId, item = {}){
  const market = findBy('markets', marketId);
  if(!market) return;
  openForm(item.id ? '持っていく商品を編集' : '持っていく商品を追加', [
    {name:'productName',label:'商品名',full:true},
    {name:'category',label:'カテゴリ',type:'select',options:['',...CATEGORIES]},
    {name:'plannedQty',label:'予定数',type:'number'},
    {name:'packedQty',label:'持参数',type:'number'},
    {name:'price',label:'販売価格',type:'number'},
    {name:'memo',label:'メモ',type:'textarea',full:true}
  ], item, async data => {
    market.productItems = asArray(market.productItems);
    const next = {
      ...item,
      ...data,
      id:item.id || uid('marketProduct'),
      plannedQty:Number(data.plannedQty || 0),
      packedQty:Number(data.packedQty || 0),
      price:Number(data.price || 0)
    };
    const index = market.productItems.findIndex(old => old.id === next.id);
    if(index >= 0) market.productItems[index] = next; else market.productItems.push(next);
    await save();
  });
}
function saleForm(){ openForm('売上追加', [{name:'date',label:'日付',type:'date'},{name:'category',label:'カテゴリ',type:'select',options:CATEGORIES},{name:'amount',label:'金額',type:'number'},{name:'memo',label:'メモ',type:'textarea',full:true}], {date:todayKey()}, async data => { state.sales.push({...data, id:uid('sale')}); await save(); }); }
function salesGoalForm(){ openForm('月間売上目標', [{name:'salesMonth',label:'対象月',type:'month'},{name:'monthlySalesGoal',label:'月間目標',type:'number'}], state, async data => { state.salesMonth = data.salesMonth; state.monthlySalesGoal = Number(data.monthlySalesGoal || 0); await save(); }); }
function customerForm(customer = {}){ openForm(customer.id ? '注文編集' : '注文追加', [
  {type:'section',label:'基本情報'},
  {name:'customerName',label:'お客様名'},{name:'sns',label:'SNSアカウント'},{name:'line',label:'LINE'},{name:'email',label:'メール'},
  {type:'section',label:'ペット情報'},
  {name:'petName',label:'ペット名'},{name:'petType',label:'種類'},{name:'petNote',label:'ペット備考',type:'textarea',full:true},
  {type:'section',label:'注文と進捗'},
  {name:'orderNo',label:'受付番号'},{name:'productName',label:'商品名'},{name:'quantity',label:'数量',type:'number'},{name:'amount',label:'金額',type:'number'},
  {name:'paid',label:'入金状況',type:'select',options:['未入金','入金済','一部入金']},{name:'dueDate',label:'納期',type:'date'},{name:'status',label:'制作状況',type:'select',options:CUSTOMER_STATUSES},
  {name:'nextAction',label:'次に確認すること',full:true},{name:'memo',label:'メモ',type:'textarea',full:true}
], customer, async data => {
  const completedAt = data.status === '完了' ? (customer.completedAt || todayKey()) : customer.completedAt;
  upsert('customers', {...customer, ...data, completedAt, id:customer.id || uid('customer')});
  await save();
}); }
function leadForm(lead = {}){ openForm(lead.id ? '営業先編集' : '営業先追加', [
  {type:'section',label:'店舗情報'},
  {name:'shopName',label:'店舗名'},{name:'area',label:'地域'},{name:'hp',label:'HP'},{name:'instagram',label:'Instagram'},
  {type:'section',label:'連絡先'},
  {name:'person',label:'担当者'},{name:'phone',label:'電話'},{name:'email',label:'メール'},
  {type:'section',label:'営業の進み具合'},
  {name:'status',label:'営業状況',type:'select',options:LEAD_STATUSES},{name:'potential',label:'見込み度',type:'select',options:LEAD_POTENTIALS},
  {name:'lastContactDate',label:'最終連絡日',type:'date'},{name:'nextContactDate',label:'次回連絡予定日',type:'date'},
  {name:'nextAction',label:'次にやること',full:true},{name:'memo',label:'メモ',type:'textarea',full:true}
], {potential:'未設定', ...lead}, async data => { upsert('leads', {...lead, ...data, id:lead.id || uid('lead')}); await save(); }); }
function productForm(product = {}){
  const channel = product.salesChannel || (product.isWholesale ? 'wholesale' : activeProductTab);
  const commonFields = [
    {name:'salesChannel',label:'管理区分',type:'select',options:[{value:'online',label:'ネット販売在庫'},{value:'wholesale',label:'卸し商品'}]},
    {name:'name',label:'商品名'},
    {name:'category',label:'商品カテゴリ',type:'select',options:CATEGORIES},
    {name:'cost',label:'原価',type:'number'},
    {name:'minutes',label:'制作時間目安',type:'number'}
  ];
  const onlineFields = [
    {name:'price',label:'販売価格',type:'number'},
    {name:'stock',label:'ネット販売在庫数',type:'number'},
    {name:'status',label:'販売状態',type:'select',options:['販売中','非公開','準備中','在庫少']},
    {name:'sold',label:'販売数',type:'number'},
    {name:'lastSoldDate',label:'最終販売日',type:'date'},
    {name:'description',label:'商品説明',type:'textarea',full:true}
  ];
  const wholesaleFields = [
    {name:'storeName',label:'店舗名'},
    {name:'wholesalePrice',label:'卸し価格',type:'number'},
    {name:'status',label:'取引状態',type:'select',options:WHOLESALE_STATUSES},
    {name:'description',label:'商品説明',type:'textarea',full:true},
    {name:'wholesaleMemo',label:'卸しメモ',type:'textarea',full:true}
  ];
  const fields = [...commonFields, ...(channel === 'wholesale' ? wholesaleFields : onlineFields)];
  openForm(product.id ? '商品編集' : '商品追加', fields, {salesChannel:channel, ...product}, async data => {
    const salesChannel = data.salesChannel || 'online';
    upsert('products', {
      ...product, ...data, id:product.id || uid('product'), salesChannel,
      price:Number(data.price ?? product.price ?? 0),
      wholesalePrice:Number(data.wholesalePrice ?? product.wholesalePrice ?? 0),
      cost:Number(data.cost || 0),
      minutes:Number(data.minutes || 0),
      stock:Number(data.stock ?? product.stock ?? 0),
      sold:Number(data.sold ?? product.sold ?? 0)
    });
    activeProductTab = salesChannel === 'wholesale' ? 'wholesale' : 'online';
    await save();
  });
}
function productDeliveryForm(productId){
  const product = findBy('products', productId);
  if(!product) return;
  openForm('卸し実績を記録', [
    {name:'date',label:'卸した日',type:'date'},
    {name:'qty',label:'数量',type:'number'},
    {name:'memo',label:'メモ',type:'textarea',full:true}
  ], {date:todayKey()}, async data => {
    product.deliveries = asArray(product.deliveries);
    product.deliveries.push({id:uid('delivery'), date:data.date || todayKey(), qty:Number(data.qty || 0), memo:data.memo || ''});
    await save();
  });
}
function ideaForm(idea = {}){ openForm(idea.id ? 'アイデア編集' : 'アイデア追加', [{name:'title',label:'タイトル',full:true},{name:'memo',label:'メモ',type:'textarea',full:true},{name:'tags',label:'タグ'},{name:'priority',label:'優先度',type:'select',options:['高','中','低']}], idea, async data => { upsert('ideas', {...idea, ...data, id:idea.id || uid('idea'), createdAt:idea.createdAt || todayKey()}); await save(); }); }

function sellerProfileForm(){
  openForm('発行者情報', [
    {name:'name',label:'事業者名／屋号'},
    {name:'postalCode',label:'郵便番号'},
    {name:'address',label:'住所',full:true},
    {name:'phone',label:'電話番号'},
    {name:'email',label:'メールアドレス'},
    {name:'contact',label:'連絡先（電話・メールなど）',full:true},
    {name:'invoiceRegistrationNumber',label:'適格請求書発行事業者登録番号'},
    {name:'contactPerson',label:'担当者名'},
    {name:'bankInfo',label:'振込先情報',type:'textarea',full:true}
  ], state.sellerProfile, async data => {
    state.sellerProfile = { ...state.sellerProfile, ...data };
    await save();
  });
}
function nextInvoiceNumber(){
  const nums = asArray(state.invoices).map(inv => { const m = /(\d+)\s*$/.exec(inv.number || ''); return m ? Number(m[1]) : 0; });
  const max = nums.length ? Math.max(...nums) : 0;
  return `INV-${String(max + 1).padStart(4, '0')}`;
}
function invoiceTotals(items, taxRate){
  const subtotal = asArray(items).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const tax = Math.round(subtotal * Number(taxRate || 0) / 100);
  return { subtotal, tax, total: subtotal + tax };
}
async function saveInvoiceToHistory(){
  const draft = state.invoiceDraft;
  if(!draft) return;
  if(!draft.number){ showToast('請求書番号を入力してください'); return; }
  state.invoices = asArray(state.invoices);
  const index = state.invoices.findIndex(inv => inv.number === draft.number);
  if(index >= 0){
    state.invoices[index] = { ...state.invoices[index], ...draft, id:state.invoices[index].id };
    showToast(`請求書番号 ${draft.number} の履歴を更新しました`);
  } else {
    state.invoices.push({ ...draft, id:uid('invoice'), createdAt:new Date().toISOString() });
    showToast('請求書を履歴に保存しました');
  }
  await save();
  renderAll();
}
function loadInvoiceFromHistory(id){
  const invoice = asArray(state.invoices).find(inv => inv.id === id);
  if(!invoice) return;
  const { id: _drop, createdAt: _drop2, ...draft } = invoice;
  state.invoiceDraft = draft;
  save();
  renderAll();
}
function exportDeliveriesCsv(){
  const rows = [['店舗名','商品名','日付','数量','単価','金額','メモ']];
  state.products
    .filter(isWholesaleProduct)
    .slice()
    .sort((a,b) => productStoreName(a).localeCompare(productStoreName(b), 'ja'))
    .forEach(product => {
      asArray(product.deliveries).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(d => {
        const price = Number(product.wholesalePrice || 0);
        const qty = Number(d.qty || 0);
        rows.push([productStoreName(product), product.name || '', d.date || '', qty, price, qty * price, d.memo || '']);
      });
    });
  if(rows.length === 1){ showToast('卸し実績がまだありません'); return; }
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const bom = String.fromCharCode(0xFEFF);
  const blob = new Blob([bom + csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `卸し実績_${todayKey()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function defaultDocument(type){
  const stores = wholesaleStoreNames();
  const issueDate = todayKey();
  return {
    type,
    number:nextDocumentNumber(type),
    store:stores[0] || '',
    billTo:stores[0] || '',
    issueDate,
    date:issueDate,
    deliveryDate:type === 'delivery' ? issueDate : '',
    dueDate:type === 'invoice' ? issueDate : '',
    periodFrom:'',
    periodTo:'',
    taxRate:10,
    showPrices:true,
    receiptCopy:false,
    subject:type === 'delivery' ? '納品商品' : '',
    destination:'',
    items:[],
    notes:'',
    status:DOCUMENT_TYPES[type].statuses[0]
  };
}
function documentHeaderForm(type = activeDocumentTab){
  const draft = normalizeDocument(state.documentDrafts?.[type], type) || defaultDocument(type);
  const stores = wholesaleStoreNames();
  const isNew = !state.documentDrafts?.[type];
  const commonFields = [
    {name:'store',label:type === 'delivery' ? '納品先の店舗' : '宛先の店舗',type:'select',options:stores.map(s => ({value:s, label:s}))},
    {name:'billTo',label:'宛名（空欄なら店舗名を使用）'},
    {name:'number',label:`${documentLabel(type)}番号`},
    {name:'issueDate',label:'発行日',type:'date'},
    {name:'periodFrom',label:'対象期間（開始）',type:'date'},
    {name:'periodTo',label:'対象期間（終了）',type:'date'}
  ];
  const invoiceFields = [
    {name:'dueDate',label:'支払期限',type:'date'},
    {name:'taxRate',label:'消費税率（%）',type:'number'},
    {name:'status',label:'ステータス',type:'select',options:DOCUMENT_TYPES.invoice.statuses},
    {name:'notes',label:'備考',type:'textarea',full:true}
  ];
  const deliveryFields = [
    {name:'deliveryDate',label:'納品日',type:'date'},
    {name:'subject',label:'件名または取引名'},
    {name:'destination',label:'納品場所'},
    {name:'taxRate',label:'消費税率（%）',type:'number'},
    {name:'showPrices',label:'単価・金額を表示する',type:'select',options:[{value:'true',label:'表示する'},{value:'false',label:'表示しない'}]},
    {name:'receiptCopy',label:'領収書控えを付ける',type:'select',options:[{value:'false',label:'付けない'},{value:'true',label:'付ける'}]},
    {name:'status',label:'ステータス',type:'select',options:DOCUMENT_TYPES.delivery.statuses},
    {name:'notes',label:'備考',type:'textarea',full:true}
  ];
  openForm(isNew ? `${documentLabel(type)}を作成` : `${documentLabel(type)}情報を編集`, [...commonFields, ...(type === 'invoice' ? invoiceFields : deliveryFields)], {...draft, showPrices:String(draft.showPrices !== false), receiptCopy:String(draft.receiptCopy === true)}, async data => {
    const store = data.store || draft.store || '';
    const items = isNew ? documentItemsFromDeliveries(store, data.periodFrom, data.periodTo) : draft.items;
    setCurrentDocument({
      ...draft,
      ...data,
      type,
      store,
      billTo:data.billTo || store,
      issueDate:data.issueDate || todayKey(),
      date:data.issueDate || todayKey(),
      taxRate:safeNumber(data.taxRate),
      showPrices:data.showPrices !== 'false',
      receiptCopy:data.receiptCopy === 'true',
      status:data.status || DOCUMENT_TYPES[type].statuses[0],
      items
    });
    await save();
  });
}
function documentItemForm(item = {}){
  const draft = currentDocument();
  if(!draft) return;
  openForm(item.id ? '明細を編集' : '明細を追加', [
    {name:'name',label:'品名'},
    {name:'qty',label:'数量',type:'number'},
    {name:'unit',label:'単位'},
    {name:'price',label:'単価',type:'number'}
  ], {unit:'個', ...item}, async data => {
    const next = { id:item.id || uid('documentItem'), name:data.name || '品名未設定', qty:safeNumber(data.qty), unit:data.unit || '個', price:safeNumber(data.price) };
    draft.items = asArray(draft.items);
    const index = draft.items.findIndex(old => old.id === next.id);
    if(index >= 0) draft.items[index] = next; else draft.items.push(next);
    setCurrentDocument(draft);
    await save();
  });
}
async function saveDocumentToHistory(){
  const draft = currentDocument();
  if(!draft) return;
  if(!draft.number){ showToast(`${documentLabel(draft.type)}番号を入力してください`); return; }
  const now = new Date().toISOString();
  const existingIndex = asArray(state.documents).findIndex(document => document.id === draft.id || (document.type === draft.type && document.number === draft.number));
  const saved = normalizeDocument({ ...draft, id:draft.id || uid(draft.type), createdAt:draft.createdAt || now, updatedAt:now }, draft.type);
  if(existingIndex >= 0) state.documents[existingIndex] = { ...state.documents[existingIndex], ...saved, id:state.documents[existingIndex].id };
  else state.documents.push(saved);
  setCurrentDocument(saved);
  await save();
  showToast(`${documentLabel(saved.type)}を履歴に保存しました`);
  renderAll();
}
function loadDocumentFromHistory(id, tab = null){
  const document = asArray(state.documents).find(item => item.id === id);
  if(!document) return null;
  const draft = normalizeDocument(document, document.type);
  setCurrentDocument(draft);
  activeDocumentTab = tab || draft.type;
  save();
  renderAll();
  return draft;
}
async function duplicateDocument(id){
  const source = asArray(state.documents).find(item => item.id === id);
  if(!source) return;
  const copy = normalizeDocument({
    ...source,
    id:'',
    number:nextDocumentNumber(source.type),
    issueDate:todayKey(),
    date:todayKey(),
    deliveryDate:source.type === 'delivery' ? todayKey() : '',
    dueDate:source.type === 'invoice' ? todayKey() : '',
    status:DOCUMENT_TYPES[source.type].statuses[0],
    createdAt:'',
    updatedAt:''
  }, source.type);
  copy.items = asArray(copy.items).map(item => ({ ...item, id:uid('documentItem') }));
  setCurrentDocument(copy);
  activeDocumentTab = copy.type;
  await save();
  renderAll();
}
async function convertDocument(id){
  const source = asArray(state.documents).find(item => item.id === id) || currentDocument();
  if(!source) return;
  const type = DOCUMENT_TYPES[source.type].other;
  const converted = normalizeDocument({
    type,
    number:nextDocumentNumber(type),
    store:source.store,
    billTo:source.billTo,
    issueDate:todayKey(),
    date:todayKey(),
    deliveryDate:type === 'delivery' ? todayKey() : '',
    dueDate:type === 'invoice' ? todayKey() : '',
    periodFrom:source.periodFrom,
    periodTo:source.periodTo,
    taxRate:source.taxRate,
    showPrices:true,
    subject:source.subject,
    destination:source.destination,
    items:asArray(source.items).map(item => ({ ...item, id:uid('documentItem'), unit:item.unit || '個' })),
    notes:source.notes,
    status:DOCUMENT_TYPES[type].statuses[0]
  }, type);
  setCurrentDocument(converted);
  activeDocumentTab = type;
  await save();
  renderAll();
}
function invoiceItemsFromDeliveries(store, from, to){
  return state.products
    .filter(product => isWholesaleProduct(product) && productStoreName(product) === store)
    .map(product => ({
      id:uid('invoiceItem'),
      name:product.name || '商品名未設定',
      qty:productDelivered(product, from, to),
      price:Number(product.wholesalePrice || 0)
    }))
    .filter(item => item.qty > 0);
}
function invoiceHeaderForm(){
  const draft = state.invoiceDraft;
  const stores = wholesaleStoreNames();
  openForm(draft ? '請求書情報を編集' : '請求書を作成', [
    {name:'store',label:'宛先の店舗',type:'select',options:stores.map(s => ({value:s, label:s}))},
    {name:'billTo',label:'宛名（空欄なら店舗名を使用）'},
    {name:'number',label:'請求書番号'},
    {name:'date',label:'発行日',type:'date'},
    {name:'periodFrom',label:'対象期間（開始）',type:'date'},
    {name:'periodTo',label:'対象期間（終了）',type:'date'},
    {name:'taxRate',label:'消費税率（%）',type:'number'},
    {name:'notes',label:'備考',type:'textarea',full:true}
  ], draft || {number:nextInvoiceNumber(), date:todayKey(), taxRate:10, store:stores[0] || ''}, async data => {
    const isNew = !draft;
    const store = data.store || (draft && draft.store) || '';
    const items = isNew ? invoiceItemsFromDeliveries(store, data.periodFrom, data.periodTo) : draft.items;
    state.invoiceDraft = {
      ...(draft || {}),
      ...data,
      store,
      billTo: data.billTo || store,
      taxRate: Number(data.taxRate || 0),
      items
    };
    await save();
  });
}
function invoiceItemForm(item = {}){
  openForm(item.id ? '明細を編集' : '明細を追加', [
    {name:'name',label:'品名'},
    {name:'qty',label:'数量',type:'number'},
    {name:'price',label:'単価',type:'number'}
  ], item, async data => {
    if(!state.invoiceDraft) return;
    state.invoiceDraft.items = asArray(state.invoiceDraft.items);
    const next = { id:item.id || uid('invoiceItem'), name:data.name || '品名未設定', qty:Number(data.qty || 0), price:Number(data.price || 0) };
    const index = state.invoiceDraft.items.findIndex(old => old.id === next.id);
    if(index >= 0) state.invoiceDraft.items[index] = next; else state.invoiceDraft.items.push(next);
    await save();
  });
}

async function handleClick(event){
  const el = event.target.closest('[data-action]');
  if(!el) return;
  const { action, id, value, market, daily, delivery } = el.dataset;
  if(action === 'set-energy'){ state.energy = value; await save(false); renderAll(); }
  if(action === 'focus-next'){ const task = nextTask(); if(task) showToast(`次は「${task.title}」です`); }
  if(action === 'filter-task'){ activeTaskFilter = value; renderTasks(); }
  if(action === 'toggle-task'){
    if(daily){ state.dailyDone[todayKey()] = state.dailyDone[todayKey()] || {}; state.dailyDone[todayKey()][id] = el.checked; }
    else { const task = findBy('tasks', id); if(task) task.done = el.checked; }
    await save(); renderAll();
  }
  if(action === 'postpone-task'){ const task = findBy('tasks', id); if(task){ const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1); task.dueDate = tomorrow.toISOString().slice(0,10); await save(); showToast('明日の自分にやさしく渡しました'); renderAll(); } }
  if(action === 'toggle-market-check'){ const m = findBy('markets', market); const check = m?.checklist.find(item => item.id === id); if(check){ check.done = el.checked; await save(); renderAll(); } }
  if(action === 'set-customer-status'){ const c = findBy('customers', id); if(c){ c.status = value; if(value === '完了' && !c.completedAt) c.completedAt = todayKey(); await save(); renderAll(); } }
  if(action === 'set-lead-status'){ const lead = findBy('leads', id); if(lead){ lead.status = value; await save(); renderAll(); } }
  if(action === 'set-product-tab'){ activeProductTab = value === 'wholesale' ? 'wholesale' : 'online'; renderProducts(); }
  if(action === 'new-task') taskForm();
  if(action === 'edit-task') taskForm(findBy('tasks', id));
  if(action === 'new-goal') goalForm();
  if(action === 'edit-goal') goalForm(findBy('goals', id));
  if(action === 'new-market') marketForm();
  if(action === 'edit-market') marketForm(findBy('markets', id));
  if(action === 'new-market-product') marketProductForm(market);
  if(action === 'edit-market-product'){ const m = findBy('markets', market); const item = m?.productItems?.find(product => product.id === id); if(m && item) marketProductForm(market, item); }
  if(action === 'delete-market-product'){
    const m = findBy('markets', market);
    if(m && confirm('持っていく商品を削除します。よろしいですか？')){
      m.productItems = asArray(m.productItems).filter(product => product.id !== id);
      await save();
      renderAll();
    }
  }
  if(action === 'new-sale') saleForm();
  if(action === 'edit-sales-goal') salesGoalForm();
  if(action === 'new-customer') customerForm();
  if(action === 'edit-customer') customerForm(findBy('customers', id));
  if(action === 'new-lead') leadForm();
  if(action === 'edit-lead') leadForm(findBy('leads', id));
  if(action === 'new-product') productForm();
  if(action === 'edit-product') productForm(findBy('products', id));
  if(action === 'new-delivery') productDeliveryForm(id);
  if(action === 'delete-delivery'){
    const product = findBy('products', id);
    if(product && confirm('この卸し実績を削除します。よろしいですか？')){
      product.deliveries = asArray(product.deliveries).filter(d => d.id !== delivery);
      await save();
      renderAll();
    }
  }
  if(action === 'new-brand-idea') ideaForm();
  if(action === 'edit-brand-idea') ideaForm(findBy('ideas', id));
  if(action === 'idea-to-task'){ const idea = findBy('ideas', id); if(idea){ state.tasks.push({ id:uid('task'), title:idea.title, memo:idea.memo, dueDate:todayKey(), priority:idea.priority || '中', goalId:'', marketId:'', minutes:15, energy:'軽い', category:'制作', done:false, decomposition:'' }); await save(); showToast('タスクにしました'); renderAll(); } }
  if(action === 'delete-task') removeBy('tasks', id, 'タスク');
  if(action === 'delete-goal') removeBy('goals', id, '目標');
  if(action === 'delete-market') removeBy('markets', id, 'マルシェ');
  if(action === 'delete-sale') removeBy('sales', id, '売上');
  if(action === 'delete-customer') removeBy('customers', id, 'お客様');
  if(action === 'delete-lead') removeBy('leads', id, '営業先');
  if(action === 'delete-product') removeBy('products', id, '商品');
  if(action === 'delete-idea') removeBy('ideas', id, 'アイデア');
  if(action === 'edit-seller-profile') sellerProfileForm();
  if(action === 'set-document-tab'){ activeDocumentTab = value; renderAll(); }
  if(action === 'start-document'){ activeDocumentTab = el.dataset.type; documentHeaderForm(activeDocumentTab); }
  if(action === 'edit-document-header' || action === 'generate-invoice' || action === 'edit-invoice-header') documentHeaderForm(activeDocumentTab === 'history' ? 'invoice' : activeDocumentTab);
  if(action === 'add-document-item' || action === 'add-invoice-item') documentItemForm();
  if(action === 'edit-document-item' || action === 'edit-invoice-item'){ const item = asArray(currentDocument()?.items).find(i => i.id === id); if(item) documentItemForm(item); }
  if(action === 'delete-document-item' || action === 'delete-invoice-item'){
    const draft = currentDocument();
    if(draft && confirm('この明細を削除します。よろしいですか？')){
      draft.items = asArray(draft.items).filter(i => i.id !== id);
      setCurrentDocument(draft);
      await save();
      renderAll();
    }
  }
  if(action === 'clear-document' || action === 'clear-invoice'){
    const type = activeDocumentTab === 'history' ? 'invoice' : activeDocumentTab;
    if(confirm(`作成中の${documentLabel(type)}をクリアします。よろしいですか？`)){
      state.documentDrafts[type] = null;
      if(type === 'invoice') state.invoiceDraft = null;
      await save();
      renderAll();
    }
  }
  if(action === 'print-document' || action === 'print-invoice'){ const archive = document.getElementById('invoiceArchive'); if(archive) archive.open = true; window.print(); }
  if(action === 'save-document-history' || action === 'save-invoice-history') await saveDocumentToHistory();
  if(action === 'open-document-history' || action === 'edit-document-history' || action === 'load-invoice-history') loadDocumentFromHistory(id);
  if(action === 'print-document-history'){ const draft = loadDocumentFromHistory(id); if(draft) setTimeout(() => window.print(), 80); }
  if(action === 'duplicate-document') await duplicateDocument(id);
  if(action === 'convert-document') await convertDocument(id);
  if(action === 'delete-document-history' || action === 'delete-invoice-history'){
    if(confirm('この帳票の履歴を削除します。よろしいですか？')){
      state.documents = asArray(state.documents).filter(document => document.id !== id);
      await save();
      renderAll();
    }
  }
  if(action === 'export-deliveries-csv') exportDeliveriesCsv();
}
function handleDocumentFilter(event){
  const el = event.target.closest('[data-action="filter-document-history"]');
  if(!el) return;
  const filter = el.dataset.filter;
  documentHistoryFilter[filter] = el.value;
  renderAll();
}
let titleBeforePrint = '';
window.addEventListener('beforeprint', () => {
  const archive = document.getElementById('invoiceArchive');
  if(archive) archive.open = true;
  const draft = currentDocument();
  if(draft){
    titleBeforePrint = document.title;
    const store = String(draft.store || draft.billTo || '').replace(/[\\/:*?"<>|]/g, '');
    document.title = `${documentLabel(draft.type)}_${draft.number || ''}${store ? `_${store}` : ''}`;
  }
});
window.addEventListener('afterprint', () => {
  if(titleBeforePrint) document.title = titleBeforePrint;
});

export async function initBrandDashboard(){
  await load();
  if(!brandDashboardInitialized){
    document.addEventListener('click', handleClick);
    document.addEventListener('change', handleDocumentFilter);
    document.addEventListener('input', handleDocumentFilter);
    brandDashboardInitialized = true;
  }
  renderAll();
}

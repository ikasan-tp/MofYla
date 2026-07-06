import { Storage } from './storage.js';
import { showToast } from './components/toast.js';

const STORE_KEY = 'brand:data';
const SCHEMA_VERSION = 6;
const todayKey = () => new Date().toISOString().slice(0, 10);
const CUSTOMER_STATUSES = ['お問い合わせ','見積り','デザイン確認','制作中','印刷','塗装','梱包','発送','完了'];
const LEAD_STATUSES = ['未調査','調査済','DM送信','返信待ち','商談中','サンプル送付','導入済','見送り'];
const LEAD_POTENTIALS = ['未設定','高','中','低'];
const CATEGORIES = ['ネームプレート','コースター','キーホルダー','その他'];
const TASK_FILTERS = ['今日','期限近い','マルシェ関連','制作','SNS','事務作業','完了済み'];
const DAILY_TASKS = [
  { id:'daily-sns-post', title:'SNS投稿を1件確認する', memo:'投稿作成、予約、投稿済みチェックのどれか1つでOK。', priority:'中', energy:'軽い', category:'SNS', minutes:15 },
  { id:'daily-order-check', title:'注文・問い合わせを確認する', memo:'DM、メール、LINEをざっと見るだけでOK。', priority:'高', energy:'軽い', category:'事務作業', minutes:10 }
];
const DEMO_WORDS = ['神戸マルシェ','山田さま','うさぎネームプレート','肉球風コースター','デモ売上','MOF-001','迷子札','マルシェ什器','うさぎ専門店サンプル','rabbit_sample','rabbit_shop'];

let state;
let activeTaskFilter = '今日';
let timerId = null;
let timerSeconds = 15 * 60;

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
    ideas:[]
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
  for(const key of ['goals','tasks','markets','sales','customers','leads','products','ideas']) state[key] = asArray(state[key]);
  state.dailyDone = state.dailyDone && typeof state.dailyDone === 'object' ? state.dailyDone : {};
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
    value: items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.packedQty || item.plannedQty || 0), 0)
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
    <p class="brand-note">${escapeHtml(lead.nextAction || '')} / ${lead.nextContactDate || '-'}</p>
  </div>`;
}
function potentialClass(value){ return value === '高' ? 'hot' : value === '中' ? 'warm' : value === '低' ? 'cool' : ''; }

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
        <div><p class="eyebrow">今日見るものだけ</p><h2>${task ? escapeHtml(task.title) : '今日は整える日。必要ならタスクを1つ追加しましょう'}</h2><p class="brand-note">${task ? '今やることはこの1件だけ。終わったらチェックで大丈夫です。' : '空白の日も運用の一部です。'}</p></div>
        <div class="brand-energy">${['元気','普通','疲れた'].map(value => `<button class="${state.energy === value ? 'active' : ''}" data-action="set-energy" data-value="${value}">体力: ${value}</button>`).join('')}</div>
      </div>
      ${task ? taskItem(task, true) : ''}
      <div class="brand-row" style="margin-top:14px;"><button class="btn btn-primary" data-action="focus-next">次にやる</button><div class="brand-row"><span class="brand-timer" id="brandTimer">15:00</span><button class="btn btn-sage" data-action="start-timer">15分だけやる</button><button class="btn btn-ghost" data-action="reset-timer">リセット</button></div></div>
    </div>
    <div class="brand-home-grid">
        <div class="brand-card"><div class="brand-mini-head"><h3>今日のタスク</h3><span class="brand-chip">最大5件</span></div><div class="brand-list">${todayTasks().map(task => taskItem(task, true)).join('') || empty('今日必須のタスクはありません。')}</div></div>
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
      <div class="brand-card"><div class="brand-mini-head"><h3>今日連絡する営業先</h3></div><div class="brand-list">${todayLeads().map(leadCard).join('') || empty('今日連絡予定の営業先はありません。')}</div></div>
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
  root.innerHTML = `${pageHead('タスク管理','毎日の確認と個別タスクをここで整理します。', '<button class="btn btn-primary" data-action="new-task">タスク追加</button>')}
    <div class="brand-toolbar"><div class="brand-filters">${TASK_FILTERS.map(f => `<button class="brand-filter ${activeTaskFilter === f ? 'active' : ''}" data-action="filter-task" data-value="${f}">${f}</button>`).join('')}</div></div>
    <div class="brand-list">${filtered.map(task => taskItem(task)).join('') || empty()}</div>
    ${activeTaskFilter === '完了済み' ? '' : archiveDetails('完了アーカイブ', completed, task => taskItem(task))}`;
}

function goalProgress(goal){
  if(goal.progress !== null && goal.progress !== undefined && goal.progress !== '') return clamp(goal.progress);
  const related = state.tasks.filter(task => task.goalId === goal.id);
  if(!related.length) return 0;
  return Math.round(related.filter(task => task.done).length / related.length * 100);
}
function renderGoals(){
  const root = document.getElementById('brandGoals');
  if(!root) return;
  root.innerHTML = `${pageHead('目標管理','大目標・中目標・小タスクを階層で見ます。', '<button class="btn btn-primary" data-action="new-goal">目標追加</button>')}
    <div class="brand-grid">${state.goals.map(goal => `<div class="brand-card"><div class="brand-row"><div><span class="brand-chip">${escapeHtml(goal.type || '目標')}</span><h3>${escapeHtml(goal.title)}</h3></div><div class="brand-row"><button class="btn btn-ghost btn-small" data-action="edit-goal" data-id="${goal.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-goal" data-id="${goal.id}">削除</button></div></div><p class="brand-note">${goal.dueDate ? `期限: ${goal.dueDate}` : '期限なし'}</p>${progressBar(goalProgress(goal))}<p class="brand-note">完了率 ${goalProgress(goal)}%</p><p class="brand-note">${escapeHtml(goal.memo || '')}</p></div>`).join('') || empty()}</div>`;
}

function renderMarkets(){
  const root = document.getElementById('brandMarkets');
  if(!root) return;
  root.innerHTML = `${pageHead('マルシェ準備','準備チェックと売上目標をまとめます。', '<button class="btn btn-primary" data-action="new-market">マルシェ追加</button>')}
    <div class="brand-grid">${state.markets.map(market => {
      const productTotals = marketProductTotals(market);
      return `<div class="brand-card brand-market-card"><div class="brand-row"><div><h3>${escapeHtml(market.name)}</h3><p class="brand-note">${market.date || '-'} / ${escapeHtml(market.place || '')} / あと${daysUntil(market.date) ?? '-'}日</p></div><div class="brand-row"><button class="btn btn-ghost btn-small" data-action="edit-market" data-id="${market.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-market" data-id="${market.id}">削除</button></div></div><div class="brand-meter"><span>準備 ${marketProgress(market)}%</span>${progressBar(marketProgress(market))}</div><p class="brand-note">売上目標 ${yen(market.salesGoal)} / 実績 ${yen(market.actualSales)}</p>
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
  root.innerHTML = `${pageHead('売上管理','月間目標とカテゴリ別の売上を見ます。', '<button class="btn btn-primary" data-action="new-sale">売上追加</button>')}
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
          <p>${escapeHtml(lead.area || '-')} / ${escapeHtml(lead.instagram || '-')}</p>
        </div>
        <div class="brand-product-actions">
          <button class="btn btn-ghost btn-small" data-action="edit-lead" data-id="${lead.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-lead" data-id="${lead.id}">削除</button>
        </div>
      </div>
      <div class="brand-meter"><span>営業進捗 ${leadProgress(lead)}%</span>${progressBar(leadProgress(lead))}</div>
      <div class="brand-detail-grid">
        <div><small>見込み度</small><strong>${escapeHtml(lead.potential || '未設定')}</strong><span>営業判断の温度感</span></div>
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
  root.innerHTML = `${pageHead('お客様管理','注文ごとの現在地が見えるよう、進捗バーとステータスで追います。', '<button class="btn btn-primary" data-action="new-customer">注文追加</button>')}
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
  root.innerHTML = `${pageHead('営業先管理','営業状況ごとの件数と、次の連絡予定を見やすくします。', '<button class="btn btn-primary" data-action="new-lead">営業先追加</button>')}
    <div class="brand-status-summary">${LEAD_STATUSES.map(status => `<div class="brand-status-tile"><strong>${counts[status]}</strong><span>${status}</span></div>`).join('')}</div>
    <div class="brand-ops-grid">${activeLeads.map(leadOpsCard).join('') || empty()}</div>
    ${archiveDetails('完了・見送りアーカイブ', archivedLeads, leadOpsCard)}`;
}

function renderProducts(){
  const root = document.getElementById('brandProducts');
  if(!root) return;
  const popular = [...state.products].filter(product => Number(product.sold || 0) > 0).sort((a,b)=>Number(b.sold || 0)-Number(a.sold || 0)).slice(0, 3);
  const stale = state.products.filter(product => product.status === '販売中' && (!product.lastSoldDate || daysUntil(product.lastSoldDate) < -30));
  root.innerHTML = `${pageHead('商品管理','価格・原価・在庫・販売状態をまとめます。', '<button class="btn btn-primary" data-action="new-product">商品追加</button>')}
    <div class="brand-insight-grid">
      <section class="brand-insight-card">
        <div class="brand-mini-head"><h3>人気商品</h3><span class="brand-chip ok">${popular.length}件</span></div>
        ${popular.length ? `<div class="brand-compact-list">${popular.map(p => `<div><strong>${escapeHtml(p.name || '商品名未設定')}</strong><span>販売 ${p.sold || 0}</span></div>`).join('')}</div>` : empty('まだ販売数の記録がありません。')}
      </section>
      <section class="brand-insight-card">
        <div class="brand-mini-head"><h3>最近売れていない商品</h3><span class="brand-chip">${stale.length}件</span></div>
        ${stale.length ? `<div class="brand-compact-list">${stale.map(p => `<div><strong>${escapeHtml(p.name || '商品名未設定')}</strong><span>最終 ${p.lastSoldDate || '-'}</span></div>`).join('')}</div>` : empty('該当商品はありません。')}
      </section>
    </div>
    <div class="brand-product-grid">${state.products.map(product => `<article class="brand-card brand-product-card">
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
      <div class="brand-product-metrics">
        <span><b>${yen(product.price)}</b><small>価格</small></span>
        <span><b>${yen(product.cost)}</b><small>原価</small></span>
        <span><b>${product.stock || 0}</b><small>在庫</small></span>
        <span><b>${product.minutes || 0}分</b><small>制作</small></span>
      </div>
      ${product.description ? `<p class="brand-note">${escapeHtml(product.description)}</p>` : '<p class="brand-note">説明はまだありません。</p>'}
    </article>`).join('') || empty()}</div>`;
}

function renderIdeas(){
  const root = document.getElementById('brandIdeas');
  if(!root) return;
  root.innerHTML = `${pageHead('アイデア帳','思いついたことをすぐ保存し、後からタスク化できます。', '<button class="btn btn-primary" data-action="new-brand-idea">アイデア追加</button>')}
    <div class="brand-grid">${state.ideas.map(idea => `<div class="brand-card"><div class="brand-row"><div><span class="brand-chip">${escapeHtml(idea.priority || '中')}</span><h3>${escapeHtml(idea.title)}</h3></div><div class="brand-row"><button class="btn btn-sage btn-small" data-action="idea-to-task" data-id="${idea.id}">タスク化</button><button class="btn btn-ghost btn-small" data-action="edit-brand-idea" data-id="${idea.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-idea" data-id="${idea.id}">削除</button></div></div><p class="brand-note">${escapeHtml(idea.memo || '')}</p><p class="brand-note">${escapeHtml(idea.tags || '')} / ${idea.createdAt || ''}</p></div>`).join('') || empty()}</div>`;
}

function renderAll(){ renderHome(); renderTasks(); renderGoals(); renderMarkets(); renderSales(); renderCrm(); renderLeads(); renderProducts(); renderIdeas(); updateTimer(); }

function openForm(title, fields, values, onSubmit){
  const overlay = document.createElement('div');
  overlay.className = 'brand-modal-overlay';
  overlay.innerHTML = `<div class="brand-modal"><div class="brand-modal-head"><h3>${title}</h3><button class="modal-close" type="button" data-close-brand>×</button></div><form class="brand-modal-body"><div class="brand-form-grid">${fields.map(fieldHtml).join('')}</div><div class="toolbar" style="margin-top:16px;"><button class="btn btn-primary" type="submit">保存</button><button class="btn btn-ghost" type="button" data-close-brand>キャンセル</button></div></form></div>`;
  document.body.appendChild(overlay);
  fields.forEach(field => { const el = overlay.querySelector(`[name="${field.name}"]`); if(el) el.value = values[field.name] ?? field.default ?? ''; });
  overlay.addEventListener('click', event => { if(event.target === overlay || event.target.closest('[data-close-brand]')) overlay.remove(); });
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
function goalForm(goal = {}){ openForm(goal.id ? '目標編集' : '目標追加', [{name:'type',label:'種類',type:'select',options:['大目標','中目標','小タスク']},{name:'title',label:'タイトル',full:true},{name:'parentId',label:'親目標',type:'select',options:optionsFrom(state.goals.filter(g => g.id !== goal.id),'title')},{name:'dueDate',label:'期限',type:'date'},{name:'progress',label:'進捗率（空欄なら自動）',type:'number'},{name:'memo',label:'メモ',type:'textarea',full:true}], goal, async data => { upsert('goals', {...goal, ...data, id:goal.id || uid('goal'), progress:data.progress === '' ? null : Number(data.progress)}); await save(); }); }
function marketForm(market = {}){ openForm(market.id ? 'マルシェ編集' : 'マルシェ追加', [
  {name:'name',label:'マルシェ名'},{name:'date',label:'日付',type:'date'},{name:'place',label:'場所'},{name:'salesGoal',label:'目標売上',type:'number'},{name:'actualSales',label:'実績売上',type:'number'},
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
function productForm(product = {}){ openForm(product.id ? '商品編集' : '商品追加', [{name:'name',label:'商品名'},{name:'category',label:'商品カテゴリ',type:'select',options:CATEGORIES},{name:'price',label:'販売価格',type:'number'},{name:'cost',label:'原価',type:'number'},{name:'minutes',label:'制作時間目安',type:'number'},{name:'stock',label:'在庫数',type:'number'},{name:'image',label:'サンプル画像URL'},{name:'status',label:'販売状態',type:'select',options:['販売中','非公開']},{name:'sold',label:'販売数',type:'number'},{name:'lastSoldDate',label:'最終販売日',type:'date'},{name:'description',label:'商品説明',type:'textarea',full:true}], product, async data => { upsert('products', {...product, ...data, id:product.id || uid('product')}); await save(); }); }
function ideaForm(idea = {}){ openForm(idea.id ? 'アイデア編集' : 'アイデア追加', [{name:'title',label:'タイトル',full:true},{name:'memo',label:'メモ',type:'textarea',full:true},{name:'tags',label:'タグ'},{name:'priority',label:'優先度',type:'select',options:['高','中','低']}], idea, async data => { upsert('ideas', {...idea, ...data, id:idea.id || uid('idea'), createdAt:idea.createdAt || todayKey()}); await save(); }); }

async function handleClick(event){
  const el = event.target.closest('[data-action]');
  if(!el) return;
  const { action, id, value, market, daily } = el.dataset;
  if(action === 'set-energy'){ state.energy = value; await save(false); renderAll(); }
  if(action === 'focus-next'){ const task = nextTask(); if(task) showToast(`次は「${task.title}」です`); }
  if(action === 'start-timer') startTimer();
  if(action === 'reset-timer'){ stopTimer(); timerSeconds = 15 * 60; updateTimer(); }
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
}

function startTimer(){
  if(timerId) return;
  timerId = setInterval(() => {
    timerSeconds -= 1;
    if(timerSeconds <= 0){ stopTimer(); timerSeconds = 0; showToast('15分できました。ここで止めても大丈夫です'); }
    updateTimer();
  }, 1000);
}
function stopTimer(){ clearInterval(timerId); timerId = null; }
function updateTimer(){
  const el = document.getElementById('brandTimer');
  if(!el) return;
  el.textContent = `${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}`;
}

export async function initBrandDashboard(){
  await load();
  document.addEventListener('click', handleClick);
  renderAll();
}

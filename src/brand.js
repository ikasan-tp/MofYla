import { Storage } from './storage.js';
import { showToast } from './components/toast.js';

const STORE_KEY = 'brand:data';
const TODAY = () => new Date().toISOString().slice(0, 10);
const STATUSES = ['お問い合わせ','見積り','デザイン確認','制作中','印刷','塗装','梱包','発送','完了'];
const LEAD_STATUSES = ['未調査','調査済','DM送信','返信待ち','商談中','サンプル送付','導入済','見送り'];
const CATEGORIES = ['ネームプレート','コースター','キーホルダー','その他'];
const TASK_FILTERS = ['今日','期限近い','マルシェ関連','制作','SNS','事務作業','完了済み'];

let state;
let activeTaskFilter = '今日';
let timerId = null;
let timerSeconds = 15 * 60;

function uid(prefix){ return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function yen(value){ return Number(value || 0).toLocaleString('ja-JP') + '円'; }
function daysUntil(date){
  if(!date) return null;
  const base = new Date(TODAY() + 'T00:00:00');
  const target = new Date(date + 'T00:00:00');
  return Math.ceil((target - base) / 86400000);
}
function clamp(n){ return Math.max(0, Math.min(100, Math.round(Number(n) || 0))); }
function escapeHtml(value = ''){
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function asArray(value){ return Array.isArray(value) ? value : []; }
function byDue(a, b){ return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'); }
function priorityValue(task){ return ({高:3, 中:2, 低:1})[task.priority] || 1; }
function taskGoal(task){ return state.goals.find(goal => goal.id === task.goalId); }
function taskMarket(task){ return state.markets.find(market => market.id === task.marketId); }

function defaultMarketChecklist(){
  return ['商品数を決める','商品を制作する','値札を作る','POPを作る','ショップカードを用意する','QRコードを用意する','什器を確認する','お釣りを用意する','SNSで告知する','搬入物を確認する']
    .map(title => ({ id:uid('check'), title, done:false }));
}

function emptyState(){
  return {
    schemaVersion:2,
    energy:'普通',
    salesMonth: new Date().toISOString().slice(0, 7),
    monthlySalesGoal: 0,
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

async function load(){
  state = await Storage.get(STORE_KEY, null);
  if(!state){
    state = emptyState();
    await save(false);
  }else if(!state.schemaVersion){
    state = emptyState();
    await save(false);
  }
  state.goals = asArray(state.goals);
  state.tasks = asArray(state.tasks);
  state.markets = asArray(state.markets);
  state.sales = asArray(state.sales);
  state.customers = asArray(state.customers);
  state.leads = asArray(state.leads);
  state.products = asArray(state.products);
  state.ideas = asArray(state.ideas);
}
async function save(notify = true){
  await Storage.set(STORE_KEY, state);
  if(notify) showToast('保存しました');
}

function progressFromTasks(goalId){
  const related = state.tasks.filter(task => task.goalId === goalId);
  if(!related.length) return 0;
  return Math.round(related.filter(task => task.done).length / related.length * 100);
}
function goalProgress(goal){
  if(goal.progress !== null && goal.progress !== undefined && goal.progress !== '') return clamp(goal.progress);
  const childGoals = state.goals.filter(item => item.parentId === goal.id);
  const parts = [];
  if(childGoals.length) parts.push(...childGoals.map(goalProgress));
  const taskProgress = progressFromTasks(goal.id);
  if(state.tasks.some(task => task.goalId === goal.id)) parts.push(taskProgress);
  return parts.length ? Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length) : 0;
}
function marketProgress(market){
  const checks = asArray(market.checklist);
  return checks.length ? Math.round(checks.filter(item => item.done).length / checks.length * 100) : 0;
}
function monthlySales(){
  const month = state.salesMonth || new Date().toISOString().slice(0, 7);
  return state.sales.filter(sale => (sale.date || '').startsWith(month)).reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
}
function nextTask(){
  const tasks = state.tasks.filter(task => !task.done && (state.energy !== '疲れた' || task.energy === '軽い'));
  tasks.sort((a, b) => priorityValue(b) - priorityValue(a) || byDue(a, b));
  return tasks[0];
}
function todayTasks(){
  const today = TODAY();
  return state.tasks.filter(task => !task.done && (!task.dueDate || task.dueDate <= today)).sort((a, b) => priorityValue(b) - priorityValue(a) || byDue(a, b)).slice(0, 5);
}
function dueSoonTasks(){
  return state.tasks.filter(task => !task.done && daysUntil(task.dueDate) !== null && daysUntil(task.dueDate) <= 7).sort(byDue).slice(0, 5);
}
function nextMarket(){
  return [...state.markets].filter(market => daysUntil(market.date) === null || daysUntil(market.date) >= -1).sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
}
function dueCustomers(){
  return state.customers.filter(item => item.status !== '完了' && daysUntil(item.dueDate) !== null && daysUntil(item.dueDate) <= 10).sort((a,b)=>(a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 4);
}
function todayLeads(){
  return state.leads.filter(lead => lead.nextContactDate && lead.nextContactDate <= TODAY() && !['導入済','見送り'].includes(lead.status)).sort((a,b)=>a.nextContactDate.localeCompare(b.nextContactDate)).slice(0, 4);
}

function pageHead(title, desc, action){
  return `<div class="page-head"><div><p class="eyebrow">MofYla operations</p><h2>${title}</h2><p>${desc}</p></div>${action || ''}</div>`;
}
function progressBar(value){ return `<div class="brand-progress" style="--value:${clamp(value)}%"><span></span></div>`; }
function empty(text = 'まだ登録がありません。小さく1つだけ追加しましょう。'){ return `<div class="brand-empty">${text}</div>`; }
function taskChips(task){
  const d = daysUntil(task.dueDate);
  return `<div class="brand-chiprow">
    <span class="brand-chip ${task.priority === '高' ? 'warn' : ''}">優先度 ${task.priority || '中'}</span>
    <span class="brand-chip">${task.energy || '普通'}</span>
    <span class="brand-chip">${task.minutes || 15}分</span>
    ${task.dueDate ? `<span class="brand-chip ${d <= 3 ? 'warn' : ''}">期限 ${task.dueDate}${d !== null ? ` / あと${d}日` : ''}</span>` : ''}
  </div>`;
}
function taskItem(task, compact = false){
  return `<div class="brand-item ${task.done ? 'done' : ''}">
    <div class="brand-row">
      <label class="brand-checkline"><input type="checkbox" data-action="toggle-task" data-id="${task.id}" ${task.done ? 'checked' : ''}><span class="brand-title">${escapeHtml(task.title)}</span></label>
      <div class="brand-row">
        <button class="btn btn-ghost btn-small" data-action="postpone-task" data-id="${task.id}">明日に送る</button>
        ${compact ? '' : `<button class="btn btn-ghost btn-small" data-action="edit-task" data-id="${task.id}">編集</button>`}
      </div>
    </div>
    ${taskChips(task)}
    ${task.memo && !compact ? `<p class="brand-note">${escapeHtml(task.memo)}</p>` : ''}
    ${task.decomposition && !compact ? `<p class="brand-note">分解メモ: ${escapeHtml(task.decomposition)}</p>` : ''}
  </div>`;
}

function renderHome(){
  const root = document.getElementById('brandHome');
  if(!root) return;
  const task = nextTask();
  const market = nextMarket();
  const sales = monthlySales();
  const salesGoal = Number(state.monthlySalesGoal || 0);
  const remainingSales = Math.max(0, salesGoal - sales);
  const marketDays = market ? daysUntil(market.date) : null;
  root.innerHTML = `<div class="brand-home">
    <div class="brand-hero">
      <div class="brand-hero-top">
        <div><p class="eyebrow">今日見るものだけ</p><h2>${task ? escapeHtml(task.title) : '今日は整える日。次のタスクを1つ追加しましょう'}</h2><p class="brand-note">${task ? '今やることはこの1件だけ。終わったらチェックで大丈夫です。' : '空白の日も運用の一部です。'}</p></div>
        <div class="brand-energy" id="energyButtons">
          ${['元気','普通','疲れた'].map(value => `<button class="${state.energy === value ? 'active' : ''}" data-action="set-energy" data-value="${value}">体力: ${value}</button>`).join('')}
        </div>
      </div>
      ${task ? taskItem(task, true) : ''}
      <div class="brand-row" style="margin-top:14px;">
        <button class="btn btn-primary" data-action="focus-next">次にやる</button>
        <div class="brand-row"><span class="brand-timer" id="brandTimer">15:00</span><button class="btn btn-sage" data-action="start-timer">15分だけやる</button><button class="btn btn-ghost" data-action="reset-timer">リセット</button></div>
      </div>
    </div>
    <div class="brand-layout">
      <div class="brand-home-lists">
        <div class="brand-card"><div class="brand-mini-head"><h3>今日のタスク</h3><span class="brand-chip">最大5件</span></div><div class="brand-list">${todayTasks().map(task => taskItem(task, true)).join('') || empty('今日必須のタスクはありません。')}</div></div>
        <div class="brand-card"><div class="brand-mini-head"><h3>期限が近いもの</h3></div><div class="brand-list">${dueSoonTasks().map(task => taskItem(task, true)).join('') || empty('近い期限はありません。')}</div></div>
        <div class="brand-card"><div class="brand-mini-head"><h3>納期が近い注文</h3></div><div class="brand-list">${dueCustomers().map(customerCard).join('') || empty('近い納期の注文はありません。')}</div></div>
        <div class="brand-card"><div class="brand-mini-head"><h3>今日連絡する営業先</h3></div><div class="brand-list">${todayLeads().map(leadCard).join('') || empty('今日連絡予定の営業先はありません。')}</div></div>
      </div>
      <div class="brand-card">
        <h3>次のマルシェ</h3>
        ${market ? `<p class="brand-title">${escapeHtml(market.name)}</p><p class="brand-note">${market.date} / ${escapeHtml(market.place || '')} ${marketDays !== null ? ` / あと${marketDays}日` : ''}</p><div class="brand-meter"><span>準備 ${marketProgress(market)}%</span>${progressBar(marketProgress(market))}</div>` : empty('予定マルシェはありません。')}
        <hr>
        <h3>今月売上</h3>
        <div class="brand-meter"><strong class="brand-metric">${yen(sales)}</strong><span class="brand-note">目標 ${yen(salesGoal)} / あと ${yen(remainingSales)}</span>${progressBar(salesGoal ? sales / salesGoal * 100 : 0)}</div>
      </div>
    </div>
  </div>`;
}

function renderTasks(){
  const root = document.getElementById('brandTasks');
  if(!root) return;
  const filtered = state.tasks.filter(task => {
    const d = daysUntil(task.dueDate);
    if(activeTaskFilter === '今日') return !task.done && (!task.dueDate || task.dueDate <= TODAY());
    if(activeTaskFilter === '期限近い') return !task.done && d !== null && d <= 7;
    if(activeTaskFilter === '完了済み') return task.done;
    return task.category === activeTaskFilter;
  }).sort((a,b)=>Number(a.done)-Number(b.done) || priorityValue(b)-priorityValue(a) || byDue(a,b));
  root.innerHTML = `${pageHead('タスク管理','ホームでは見せすぎず、ここでまとめて整理します。', '<button class="btn btn-primary" data-action="new-task">タスク追加</button>')}
    <div class="brand-toolbar"><div class="brand-filters">${TASK_FILTERS.map(f => `<button class="brand-filter ${activeTaskFilter === f ? 'active' : ''}" data-action="filter-task" data-value="${f}">${f}</button>`).join('')}</div></div>
    <div class="brand-list">${filtered.map(task => taskItem(task)).join('') || empty()}</div>`;
}

function renderGoals(){
  const root = document.getElementById('brandGoals');
  if(!root) return;
  root.innerHTML = `${pageHead('目標管理','大目標・中目標・小タスクを階層で見ます。', '<button class="btn btn-primary" data-action="new-goal">目標追加</button>')}
    <div class="brand-grid">${state.goals.map(goal => {
      const parent = state.goals.find(item => item.id === goal.parentId);
      const progress = goalProgress(goal);
      return `<div class="brand-card"><div class="brand-row"><div><span class="brand-chip">${goal.type || '目標'}</span><h3>${escapeHtml(goal.title)}</h3></div><button class="btn btn-ghost btn-small" data-action="edit-goal" data-id="${goal.id}">編集</button></div>
        <p class="brand-note">${parent ? `親目標: ${escapeHtml(parent.title)} / ` : ''}${goal.dueDate ? `期限: ${goal.dueDate}` : '期限なし'}</p>
        ${progressBar(progress)}<p class="brand-note">完了率 ${progress}%</p><p class="brand-note">${escapeHtml(goal.memo || '')}</p></div>`;
    }).join('') || empty()}</div>`;
}

function renderMarkets(){
  const root = document.getElementById('brandMarkets');
  if(!root) return;
  root.innerHTML = `${pageHead('マルシェ準備','準備チェックと売上目標をまとめます。', '<button class="btn btn-primary" data-action="new-market">マルシェ追加</button>')}
    <div class="brand-grid">${state.markets.map(market => `<div class="brand-card"><div class="brand-row"><div><h3>${escapeHtml(market.name)}</h3><p class="brand-note">${market.date || '-'} / ${escapeHtml(market.place || '')} / あと${daysUntil(market.date)}日</p></div><button class="btn btn-ghost btn-small" data-action="edit-market" data-id="${market.id}">編集</button></div>
      <div class="brand-meter"><span>準備 ${marketProgress(market)}%</span>${progressBar(marketProgress(market))}</div>
      <p class="brand-note">売上目標 ${yen(market.salesGoal)} / 実績 ${yen(market.actualSales)}</p>
      <div class="brand-list">${asArray(market.checklist).map(item => `<label class="brand-checkline"><input type="checkbox" data-action="toggle-market-check" data-market="${market.id}" data-id="${item.id}" ${item.done ? 'checked' : ''}><span>${escapeHtml(item.title)}</span></label>`).join('')}</div></div>`).join('') || empty()}</div>`;
}

function renderSales(){
  const root = document.getElementById('brandSales');
  if(!root) return;
  const total = monthlySales();
  const goal = Number(state.monthlySalesGoal || 0);
  const byCat = Object.fromEntries(CATEGORIES.map(cat => [cat, 0]));
  state.sales.filter(sale => (sale.date || '').startsWith(state.salesMonth)).forEach(sale => { byCat[sale.category] = (byCat[sale.category] || 0) + Number(sale.amount || 0); });
  root.innerHTML = `${pageHead('売上管理','月間目標とカテゴリ別の売上を見ます。', '<button class="btn btn-primary" data-action="new-sale">売上追加</button>')}
    <div class="brand-card brand-meter"><div class="brand-row"><div><strong class="brand-metric">${yen(total)}</strong><p class="brand-note">目標 ${yen(goal)} / あと ${yen(Math.max(0, goal - total))}</p></div><button class="btn btn-ghost btn-small" data-action="edit-sales-goal">目標設定</button></div>${progressBar(goal ? total / goal * 100 : 0)}</div>
    <div class="brand-grid">${Object.entries(byCat).map(([cat, amount]) => `<div class="brand-card soft"><span class="brand-chip">${cat}</span><div class="brand-metric">${yen(amount)}</div></div>`).join('')}</div>
    <div class="brand-list">${state.sales.slice().sort((a,b)=>(b.date || '').localeCompare(a.date || '')).map(sale => `<div class="brand-item"><div class="brand-row"><strong>${sale.date} / ${escapeHtml(sale.category)}</strong><span>${yen(sale.amount)}</span></div><p class="brand-note">${escapeHtml(sale.memo || '')}</p></div>`).join('') || empty()}</div>`;
}

function customerCard(customer){
  const d = daysUntil(customer.dueDate);
  return `<div class="brand-item"><div class="brand-row"><strong>${escapeHtml(customer.customerName)} / ${escapeHtml(customer.productName)}</strong><span class="brand-chip ${d <= 3 ? 'warn' : ''}">納期まで${d}日</span></div><p class="brand-note">${escapeHtml(customer.status)} / ${escapeHtml(customer.petName || '')}</p></div>`;
}
function renderCrm(){
  const root = document.getElementById('brandCrm');
  if(!root) return;
  root.innerHTML = `${pageHead('お客様管理','オーダーメイド制作の進捗を追います。', '<button class="btn btn-primary" data-action="new-customer">注文追加</button>')}
    <div class="brand-grid">${state.customers.map(customer => `<div class="brand-card"><div class="brand-row"><div><h3>${escapeHtml(customer.customerName)}</h3><p class="brand-note">${escapeHtml(customer.orderNo)} / ${escapeHtml(customer.productName)} / ${yen(customer.amount)}</p></div><button class="btn btn-ghost btn-small" data-action="edit-customer" data-id="${customer.id}">編集</button></div>
      <p class="brand-note">ペット: ${escapeHtml(customer.petName || '-')}（${escapeHtml(customer.petType || '-')}） / 納期 ${customer.dueDate || '-'} / あと${daysUntil(customer.dueDate)}日</p>
      <div class="brand-status">${STATUSES.map(status => `<button class="brand-step ${customer.status === status ? 'active' : ''}" data-action="set-customer-status" data-id="${customer.id}" data-value="${status}">${status}</button>`).join('')}</div>
      <p class="brand-note">完了日: ${customer.completedAt || '-'}</p></div>`).join('') || empty()}</div>`;
}

function leadCard(lead){
  return `<div class="brand-item"><div class="brand-row"><strong>${escapeHtml(lead.shopName)}</strong><span class="brand-chip">${escapeHtml(lead.status)}</span></div><p class="brand-note">${escapeHtml(lead.nextAction || '')} / ${lead.nextContactDate || '-'}</p></div>`;
}
function renderLeads(){
  const root = document.getElementById('brandLeads');
  if(!root) return;
  root.innerHTML = `${pageHead('営業先管理','うさぎ専門店やイベント運営への営業状況を管理します。', '<button class="btn btn-primary" data-action="new-lead">営業先追加</button>')}
    <div class="brand-grid">${state.leads.map(lead => `<div class="brand-card"><div class="brand-row"><div><h3>${escapeHtml(lead.shopName)}</h3><p class="brand-note">${escapeHtml(lead.area || '')} / ${escapeHtml(lead.instagram || '')}</p></div><button class="btn btn-ghost btn-small" data-action="edit-lead" data-id="${lead.id}">編集</button></div>
      <div class="brand-chiprow"><span class="brand-chip">${escapeHtml(lead.status)}</span><span class="brand-chip">次回 ${lead.nextContactDate || '-'}</span></div><p class="brand-note">${escapeHtml(lead.nextAction || '')}</p></div>`).join('') || empty()}</div>`;
}

function renderProducts(){
  const root = document.getElementById('brandProducts');
  if(!root) return;
  const popular = [...state.products].sort((a,b)=>Number(b.sold || 0)-Number(a.sold || 0)).slice(0, 3);
  const stale = state.products.filter(product => product.status === '販売中' && (!product.lastSoldDate || daysUntil(product.lastSoldDate) < -30));
  root.innerHTML = `${pageHead('商品管理','価格・原価・在庫・販売状態をまとめます。', '<button class="btn btn-primary" data-action="new-product">商品追加</button>')}
    <div class="brand-grid"><div class="brand-card"><h3>人気商品</h3>${popular.map(p => `<p class="brand-note">${escapeHtml(p.name)} / 販売 ${p.sold || 0}</p>`).join('') || empty()}</div><div class="brand-card"><h3>最近売れていない商品</h3>${stale.map(p => `<p class="brand-note">${escapeHtml(p.name)} / 最終 ${p.lastSoldDate || '-'}</p>`).join('') || empty('該当商品はありません。')}</div></div>
    <div class="brand-grid">${state.products.map(product => `<div class="brand-card"><div class="brand-row"><div><h3>${escapeHtml(product.name)}</h3><p class="brand-note">${escapeHtml(product.category)} / ${escapeHtml(product.status)}</p></div><button class="btn btn-ghost btn-small" data-action="edit-product" data-id="${product.id}">編集</button></div>
      <div class="brand-chiprow"><span class="brand-chip">価格 ${yen(product.price)}</span><span class="brand-chip">原価 ${yen(product.cost)}</span><span class="brand-chip">在庫 ${product.stock || 0}</span><span class="brand-chip">${product.minutes || 0}分</span></div><p class="brand-note">${escapeHtml(product.description || '')}</p></div>`).join('') || empty()}</div>`;
}

function renderIdeas(){
  const root = document.getElementById('brandIdeas');
  if(!root) return;
  root.innerHTML = `${pageHead('アイデア帳','思いついたことをすぐ保存し、後からタスク化できます。', '<button class="btn btn-primary" data-action="new-brand-idea">アイデア追加</button>')}
    <div class="brand-grid">${state.ideas.map(idea => `<div class="brand-card"><div class="brand-row"><div><span class="brand-chip">${escapeHtml(idea.priority || '中')}</span><h3>${escapeHtml(idea.title)}</h3></div><div class="brand-row"><button class="btn btn-sage btn-small" data-action="idea-to-task" data-id="${idea.id}">タスク化</button><button class="btn btn-ghost btn-small" data-action="edit-brand-idea" data-id="${idea.id}">編集</button></div></div><p class="brand-note">${escapeHtml(idea.memo || '')}</p><p class="brand-note">${escapeHtml(idea.tags || '')} / ${idea.createdAt || ''}</p></div>`).join('') || empty()}</div>`;
}

function renderAll(){
  renderHome(); renderTasks(); renderGoals(); renderMarkets(); renderSales(); renderCrm(); renderLeads(); renderProducts(); renderIdeas(); updateTimer();
}

function openForm(title, fields, values, onSubmit){
  const overlay = document.createElement('div');
  overlay.className = 'brand-modal-overlay';
  overlay.innerHTML = `<div class="brand-modal"><div class="brand-modal-head"><h3>${title}</h3><button class="modal-close" type="button" data-close-brand>×</button></div><form class="brand-modal-body"><div class="brand-form-grid">${fields.map(fieldHtml).join('')}</div><div class="toolbar" style="margin-top:16px;"><button class="btn btn-primary" type="submit">保存</button><button class="btn btn-ghost" type="button" data-close-brand>キャンセル</button></div></form></div>`;
  document.body.appendChild(overlay);
  fields.forEach(field => {
    const el = overlay.querySelector(`[name="${field.name}"]`);
    if(el) el.value = values[field.name] ?? field.default ?? '';
  });
  overlay.addEventListener('click', event => { if(event.target === overlay || event.target.closest('[data-close-brand]')) overlay.remove(); });
  overlay.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await onSubmit(data);
    overlay.remove();
    renderAll();
  });
}
function fieldHtml(field){
  const cls = `brand-field ${field.full ? 'full' : ''}`;
  if(field.type === 'textarea') return `<div class="${cls}"><label>${field.label}</label><textarea name="${field.name}"></textarea></div>`;
  if(field.type === 'select') return `<div class="${cls}"><label>${field.label}</label><select name="${field.name}">${field.options.map(option => `<option>${option}</option>`).join('')}</select></div>`;
  return `<div class="${cls}"><label>${field.label}</label><input name="${field.name}" type="${field.type || 'text'}"></div>`;
}
function findBy(type, id){ return state[type].find(item => item.id === id); }
function upsert(type, item){ const index = state[type].findIndex(old => old.id === item.id); if(index >= 0) state[type][index] = item; else state[type].push(item); }

function taskForm(task = {}){
  openForm(task.id ? 'タスク編集' : 'タスク追加', [
    {name:'title',label:'タイトル',full:true},{name:'memo',label:'メモ',type:'textarea',full:true},{name:'dueDate',label:'期限',type:'date'},{name:'priority',label:'優先度',type:'select',options:['高','中','低']},
    {name:'goalId',label:'所属目標',type:'select',options:['',...state.goals.map(g=>g.id)]},{name:'marketId',label:'所属マルシェ',type:'select',options:['',...state.markets.map(m=>m.id)]},{name:'minutes',label:'作業時間目安',type:'number'},{name:'energy',label:'体力レベル',type:'select',options:['軽い','普通','重い']},{name:'category',label:'カテゴリ',type:'select',options:['制作','SNS','事務作業','マルシェ']},{name:'decomposition',label:'分解メモ',type:'textarea',full:true}
  ], task, async data => { upsert('tasks', {...task, ...data, id:task.id || uid('task'), done:!!task.done}); await save(); });
}
function goalForm(goal = {}){
  openForm(goal.id ? '目標編集' : '目標追加', [
    {name:'type',label:'種類',type:'select',options:['大目標','中目標','小タスク']},{name:'title',label:'タイトル',full:true},{name:'parentId',label:'親目標',type:'select',options:['',...state.goals.filter(g=>g.id!==goal.id).map(g=>g.id)]},{name:'dueDate',label:'期限',type:'date'},{name:'progress',label:'進捗率（空欄なら自動）',type:'number'},{name:'memo',label:'メモ',type:'textarea',full:true}
  ], goal, async data => { upsert('goals', {...goal, ...data, id:goal.id || uid('goal'), progress:data.progress === '' ? null : Number(data.progress)}); await save(); });
}
function marketForm(market = {}){
  openForm(market.id ? 'マルシェ編集' : 'マルシェ追加', [
    {name:'name',label:'マルシェ名'},{name:'date',label:'日付',type:'date'},{name:'place',label:'場所'},{name:'salesGoal',label:'目標売上',type:'number'},{name:'actualSales',label:'実績売上',type:'number'}
  ], market, async data => {
    const checklist = market.checklist || defaultMarketChecklist();
    upsert('markets', {...market, ...data, id:market.id || uid('market'), checklist});
    await save();
  });
}
function saleForm(){
  openForm('売上追加', [{name:'date',label:'日付',type:'date'},{name:'category',label:'カテゴリ',type:'select',options:CATEGORIES},{name:'amount',label:'金額',type:'number'},{name:'memo',label:'メモ',type:'textarea',full:true}], {date:TODAY()}, async data => { state.sales.push({...data, id:uid('sale')}); await save(); });
}
function salesGoalForm(){
  openForm('月間売上目標', [{name:'salesMonth',label:'対象月',type:'month'},{name:'monthlySalesGoal',label:'月間目標',type:'number'}], state, async data => { state.salesMonth = data.salesMonth; state.monthlySalesGoal = Number(data.monthlySalesGoal || 0); await save(); });
}
function customerForm(customer = {}){
  openForm(customer.id ? '注文編集' : '注文追加', [
    {name:'customerName',label:'お客様名'},{name:'sns',label:'SNSアカウント'},{name:'line',label:'LINE'},{name:'email',label:'メール'},{name:'memo',label:'メモ',type:'textarea',full:true},
    {name:'petName',label:'ペット名'},{name:'petType',label:'種類'},{name:'petNote',label:'ペット備考',type:'textarea',full:true},{name:'orderNo',label:'受付番号'},{name:'productName',label:'商品名'},{name:'quantity',label:'数量',type:'number'},{name:'amount',label:'金額',type:'number'},{name:'paid',label:'入金状況',type:'select',options:['未入金','入金済','一部入金']},{name:'dueDate',label:'納期',type:'date'},{name:'status',label:'制作状況',type:'select',options:STATUSES}
  ], customer, async data => { upsert('customers', {...customer, ...data, id:customer.id || uid('customer')}); await save(); });
}
function leadForm(lead = {}){
  openForm(lead.id ? '営業先編集' : '営業先追加', [
    {name:'shopName',label:'店舗名'},{name:'area',label:'地域'},{name:'hp',label:'HP'},{name:'instagram',label:'Instagram'},{name:'person',label:'担当者'},{name:'phone',label:'電話'},{name:'email',label:'メール'},{name:'status',label:'営業状況',type:'select',options:LEAD_STATUSES},{name:'lastContactDate',label:'最終連絡日',type:'date'},{name:'nextContactDate',label:'次回連絡予定日',type:'date'},{name:'nextAction',label:'次にやること',full:true},{name:'memo',label:'メモ',type:'textarea',full:true}
  ], lead, async data => { upsert('leads', {...lead, ...data, id:lead.id || uid('lead')}); await save(); });
}
function productForm(product = {}){
  openForm(product.id ? '商品編集' : '商品追加', [
    {name:'name',label:'商品名'},{name:'category',label:'商品カテゴリ',type:'select',options:CATEGORIES},{name:'price',label:'販売価格',type:'number'},{name:'cost',label:'原価',type:'number'},{name:'minutes',label:'制作時間目安',type:'number'},{name:'stock',label:'在庫数',type:'number'},{name:'image',label:'サンプル画像URL'},{name:'status',label:'販売状態',type:'select',options:['販売中','非公開']},{name:'sold',label:'販売数',type:'number'},{name:'lastSoldDate',label:'最終販売日',type:'date'},{name:'description',label:'商品説明',type:'textarea',full:true}
  ], product, async data => { upsert('products', {...product, ...data, id:product.id || uid('product')}); await save(); });
}
function ideaForm(idea = {}){
  openForm(idea.id ? 'アイデア編集' : 'アイデア追加', [
    {name:'title',label:'タイトル',full:true},{name:'memo',label:'メモ',type:'textarea',full:true},{name:'tags',label:'タグ'},{name:'priority',label:'優先度',type:'select',options:['高','中','低']}
  ], idea, async data => { upsert('ideas', {...idea, ...data, id:idea.id || uid('idea'), createdAt:idea.createdAt || TODAY()}); await save(); });
}

async function handleClick(event){
  const actionEl = event.target.closest('[data-action]');
  if(!actionEl) return;
  const { action, id, value, market } = actionEl.dataset;
  if(action === 'set-energy'){ state.energy = value; await save(false); renderAll(); }
  if(action === 'focus-next'){ const task = nextTask(); if(task) showToast('次は「' + task.title + '」です'); }
  if(action === 'start-timer') startTimer();
  if(action === 'reset-timer'){ stopTimer(); timerSeconds = 15 * 60; updateTimer(); }
  if(action === 'filter-task'){ activeTaskFilter = value; renderTasks(); }
  if(action === 'new-task') taskForm();
  if(action === 'edit-task') taskForm(findBy('tasks', id));
  if(action === 'toggle-task'){ const task = findBy('tasks', id); if(task){ task.done = actionEl.checked; await save(); renderAll(); } }
  if(action === 'postpone-task'){ const task = findBy('tasks', id); if(task){ const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); task.dueDate = tomorrow.toISOString().slice(0,10); await save(); showToast('明日の自分にやさしく渡しました'); renderAll(); } }
  if(action === 'new-goal') goalForm();
  if(action === 'edit-goal') goalForm(findBy('goals', id));
  if(action === 'new-market') marketForm();
  if(action === 'edit-market') marketForm(findBy('markets', id));
  if(action === 'toggle-market-check'){ const m = findBy('markets', market); const check = m?.checklist.find(item => item.id === id); if(check){ check.done = actionEl.checked; await save(); renderAll(); } }
  if(action === 'new-sale') saleForm();
  if(action === 'edit-sales-goal') salesGoalForm();
  if(action === 'new-customer') customerForm();
  if(action === 'edit-customer') customerForm(findBy('customers', id));
  if(action === 'set-customer-status'){ const customer = findBy('customers', id); if(customer){ customer.status = value; if(value === '完了' && !customer.completedAt) customer.completedAt = TODAY(); await save(); renderAll(); } }
  if(action === 'new-lead') leadForm();
  if(action === 'edit-lead') leadForm(findBy('leads', id));
  if(action === 'new-product') productForm();
  if(action === 'edit-product') productForm(findBy('products', id));
  if(action === 'new-brand-idea') ideaForm();
  if(action === 'edit-brand-idea') ideaForm(findBy('ideas', id));
  if(action === 'idea-to-task'){
    const idea = findBy('ideas', id);
    if(idea){ state.tasks.push({ id:uid('task'), title:idea.title, memo:idea.memo, dueDate:TODAY(), priority:idea.priority || '中', goalId:'', marketId:'', minutes:15, energy:'軽い', category:'制作', done:false, decomposition:'' }); await save(); showToast('タスクにしました'); renderAll(); }
  }
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
  const min = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
  const sec = String(timerSeconds % 60).padStart(2, '0');
  el.textContent = `${min}:${sec}`;
}

export async function initBrandDashboard(){
  await load();
  document.addEventListener('click', handleClick);
  renderAll();
}

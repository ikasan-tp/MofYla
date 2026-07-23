import { Storage } from './storage.js';
import { showToast } from './components/toast.js';
import { RABBIT_BREEDS, breedCode } from './services/rabbitBreeds.js';

const STORE_KEY = 'brand:data';
const SCHEMA_VERSION = 6;
const todayKey = () => new Date().toISOString().slice(0, 10);
const CUSTOMER_STATUSES = ['お問い合わせ','見積り','デザイン確認','制作中','印刷','塗装','梱包','発送','完了'];
const LEAD_STATUSES = ['未調査','調査済','DM送信','返信待ち','商談中','サンプル送付','導入済','見送り'];
const LEAD_POTENTIALS = ['未設定','高','中','低'];
const WHOLESALE_STATUSES = ['商談中','納品準備中','納品済み','受注中','追加発注待ち','取り扱い終了'];
const CATEGORIES = ['ネームプレート','コースター','キーホルダー','その他'];
const CATEGORY_CODES = { 'ネームプレート':'NP', 'コースター':'CS', 'キーホルダー':'KH', 'その他':'OT' };
const DEFAULT_COLOR_PALETTE = [
  { id:'color-c001', code:'C001', name:'White', hex:'#FFFFFF' },
  { id:'color-c002', code:'C002', name:'Ivory', hex:'#F5EAD6' },
  { id:'color-c003', code:'C003', name:'Milk Tea', hex:'#C9A27E' },
  { id:'color-c004', code:'C004', name:'Ash Gray', hex:'#A9A9A9' },
  { id:'color-c005', code:'C005', name:'Chocolate', hex:'#5C3A21' },
  { id:'color-c006', code:'C006', name:'Black', hex:'#1A1A1A' }
];
const TASK_FILTERS = ['今日','期限近い','マルシェ関連','制作','SNS','事務作業','完了済み'];
const DAILY_TASKS = [
  { id:'daily-sns-post', title:'SNS投稿を1件確認する', memo:'投稿作成、予約、投稿済みチェックのどれか1つでOK。', priority:'中', energy:'軽い', category:'SNS', minutes:15 },
  { id:'daily-order-check', title:'注文・問い合わせを確認する', memo:'DM、メール、LINEをざっと見るだけでOK。', priority:'高', energy:'軽い', category:'事務作業', minutes:10 }
];
const DEMO_WORDS = ['神戸マルシェ','山田さま','うさぎネームプレート','肉球風コースター','デモ売上','MOF-001','迷子札','マルシェ什器','うさぎ専門店サンプル','rabbit_sample','rabbit_shop'];

let state;
let activeTaskFilter = '今日';
let activeProductTab = 'online';
let activeNegotiationLead = 'all';
let couponQuery = '';

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
    customerProfiles:[],
    leads:[],
    products:[],
    ideas:[],
    sellerProfile:{name:'', contactPerson:'', postalCode:'', address:'', phone:'', email:'', bankName:'', branchName:'', accountType:'普通', accountNumber:'', accountHolder:''},
    invoiceDraft:null,
    invoices:[],
    coupons:[],
    colorPalette:DEFAULT_COLOR_PALETTE.map(c => ({...c})),
    negotiations:[]
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
  for(const key of ['goals','tasks','markets','sales','customers','customerProfiles','leads','products','ideas','invoices','coupons','colorPalette','negotiations']) state[key] = asArray(state[key]);
  if(!state.colorPalette.length) state.colorPalette = DEFAULT_COLOR_PALETTE.map(c => ({...c}));
  state.dailyDone = state.dailyDone && typeof state.dailyDone === 'object' ? state.dailyDone : {};
  state.sellerProfile = state.sellerProfile && typeof state.sellerProfile === 'object' ? state.sellerProfile : {name:'', contactPerson:'', postalCode:'', address:'', phone:'', email:'', bankName:'', branchName:'', accountType:'普通', accountNumber:'', accountHolder:''};
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
  if(migrateCustomerProfiles()) changed = true;
  if(migrateWholesaleListings()) changed = true;
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
function migrateCustomerProfiles(){
  state.customerProfiles = asArray(state.customerProfiles);
  let changed = false;
  const byName = new Map(state.customerProfiles.map(p => [p.name, p]));
  state.customers.forEach(order => {
    if(order.customerId && state.customerProfiles.some(p => p.id === order.customerId)) return;
    const name = order.customerName || '名前未設定';
    let profile = byName.get(name);
    if(!profile){
      profile = { id:uid('customerProfile'), name, sns:order.sns || '', line:order.line || '', email:order.email || '', memo:'' };
      state.customerProfiles.push(profile);
      byName.set(name, profile);
    }
    order.customerId = profile.id;
    changed = true;
  });
  return changed;
}
function migrateWholesaleListings(){
  let changed = false;
  state.products.forEach(product => {
    if(!isWholesaleProduct(product) || Array.isArray(product.wholesaleListings)) return;
    changed = true;
    const storeName = product.storeName || product.shopName || product.wholesaleStore || '';
    let lead = storeName ? state.leads.find(l => l.shopName === storeName) : null;
    if(storeName && !lead){
      lead = { id:uid('lead'), shopName:storeName, status:'導入済', potential:'未設定' };
      state.leads.push(lead);
    }
    product.wholesaleListings = lead ? [{
      id:uid('listing'),
      leadId:lead.id,
      wholesalePrice:Number(product.wholesalePrice || 0),
      status:product.status || '',
      memo:product.wholesaleMemo || '',
      deliveries:asArray(product.deliveries)
    }] : [];
    delete product.storeName;
    delete product.wholesalePrice;
    delete product.wholesaleMemo;
    delete product.deliveries;
    delete product.status;
  });
  return changed;
}
function customerDisplayName(order){
  const profile = state.customerProfiles.find(p => p.id === order.customerId);
  return profile?.name || order.customerName || '名前未設定';
}
function customerProfile(order){
  return state.customerProfiles.find(p => p.id === order.customerId) || null;
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
    <div class="brand-card-head">
      <label class="brand-checkline"><input type="checkbox" data-action="toggle-task" data-id="${task.id}" ${task.isDaily ? 'data-daily="true"' : ''} ${task.done ? 'checked' : ''}><span class="brand-title">${escapeHtml(task.title)}</span></label>
      <div class="brand-card-actions">
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
    <div class="brand-row"><strong>${escapeHtml(customerDisplayName(customer))} / ${escapeHtml(customer.productName || '商品未設定')}</strong><span class="brand-chip ${d !== null && d <= 3 ? 'warn' : ''}">納期まで${d ?? '-'}日</span></div>
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
function productDelivered(deliverable, from, to){
  return asArray(deliverable.deliveries)
    .filter(d => (!from || (d.date || '') >= from) && (!to || (d.date || '') <= to))
    .reduce((sum, d) => sum + Number(d.qty || 0), 0);
}
function listingLeadName(listing){ return findBy('leads', listing.leadId)?.shopName || '店舗未設定'; }
function allWholesaleListings(){
  return state.products.flatMap(product => asArray(product.wholesaleListings).map(listing => ({ listing, product })));
}
function wholesaleStoreNames(){ return [...new Set(allWholesaleListings().map(x => listingLeadName(x.listing)))].sort((a,b)=>a.localeCompare(b,'ja')); }
function nextProductSku(category, breedName){
  const catCode = CATEGORY_CODES[category] || 'OT';
  const brCode = breedCode(breedName);
  const prefix = `MY-${catCode}-${brCode}-`;
  const pattern = new RegExp(`^${prefix}(\\d+)`);
  const nums = state.products.map(p => { const m = pattern.exec(p.sku || ''); return m ? Number(m[1]) : 0; });
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
function colorLabel(colorId){
  const color = state.colorPalette.find(c => c.id === colorId);
  return color ? `${color.code} ${color.name}` : '';
}
function productColorIds(product){ return asArray(product.colorIds).length ? product.colorIds : (product.colorId ? [product.colorId] : []); }
function productColorSwatches(product){
  const colors = productColorIds(product).map(id => state.colorPalette.find(c => c.id === id)).filter(Boolean);
  if(!colors.length) return '';
  return `<div class="brand-product-colors">${colors.map(c => `<span class="brand-product-color-chip" title="${escapeHtml(c.code)} ${escapeHtml(c.name)}"><span class="brand-color-swatch" style="background:${escapeHtml(c.hex || '#ccc')}"></span>${escapeHtml(c.name)}</span>`).join('')}</div>`;
}
function nextColorCode(){
  const nums = state.colorPalette.map(c => { const m = /^C(\d+)/.exec(c.code || ''); return m ? Number(m[1]) : 0; });
  const max = nums.length ? Math.max(...nums) : 0;
  return `C${String(max + 1).padStart(3, '0')}`;
}
function colorPaletteForm(color = {}){
  openForm(color.id ? 'カラー編集' : 'カラー追加', [
    {name:'code',label:'カラー番号（空欄なら自動採番）'},
    {name:'name',label:'カラー名'},
    {name:'hex',label:'カラーコード',type:'color'}
  ], { hex:'#CCCCCC', ...color }, async data => {
    upsert('colorPalette', {...color, ...data, code:data.code || color.code || nextColorCode(), id:color.id || uid('color')});
    await save();
  });
}

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
  const childRow = child => `<div class="brand-goal-child-row">
    <div class="brand-goal-child-row-head"><div class="brand-card-title"><span class="brand-chip">${escapeHtml(child.type || '目標')}</span><h4 title="${escapeHtml(child.title)}">${escapeHtml(child.title)}</h4></div>
    <div class="brand-card-actions"><button class="btn btn-ghost btn-small" data-action="edit-goal" data-id="${child.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-goal" data-id="${child.id}">削除</button></div></div>
    <div class="brand-goal-meta-row"><span>${child.dueDate ? `期限: ${child.dueDate}` : '期限なし'}</span><b>${goalProgress(child)}%</b></div>
    ${progressBar(goalProgress(child))}
    ${child.memo ? `<p class="brand-note">${escapeHtml(child.memo)}</p>` : ''}
  </div>`;
  const cluster = (major, children) => `<article class="brand-card brand-goal-cluster">
    <div class="brand-goal-cluster-head">
      <div class="brand-card-title"><span class="brand-chip">${escapeHtml(major.type || '目標')}</span><h3 title="${escapeHtml(major.title)}">${escapeHtml(major.title)}</h3></div>
      <div class="brand-card-actions"><button class="btn btn-ghost btn-small" data-action="edit-goal" data-id="${major.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-goal" data-id="${major.id}">削除</button></div>
      <div class="brand-goal-meta-row"><span>${major.dueDate ? `期限: ${major.dueDate}` : '期限なし'}</span><b>完了率 ${goalProgress(major)}%</b></div>
      ${progressBar(goalProgress(major))}
      ${major.memo ? `<p class="brand-note">${escapeHtml(major.memo)}</p>` : ''}
    </div>
    ${children.length
      ? `<div class="brand-goal-cluster-children"><p class="brand-goal-cluster-children-label">中目標・小タスク（${children.length}）</p>${children.map(childRow).join('')}</div>`
      : `<p class="brand-goal-empty-children">まだ中目標・小タスクがありません。追加から「親目標」にこの大目標を選ぶと、ここに表示されます。</p>`}
  </article>`;
  const groups = majorGoals.map(major => cluster(major, goalChildren(major))).join('');
  const orphanSection = orphans.length ? `<article class="brand-card brand-goal-cluster brand-goal-cluster-unassigned">
    <div class="brand-goal-cluster-head"><div class="brand-card-title"><span class="brand-chip">未分類</span><h3>親目標が未設定</h3></div></div>
    <div class="brand-goal-cluster-children">${orphans.map(childRow).join('')}</div>
  </article>` : '';
  const content = groups || orphanSection ? `<div class="brand-goal-tree">${groups}${orphanSection}</div>` : empty();
  root.innerHTML = `${pageHead('目標管理','大目標ごとに、関連する中目標・小タスクをまとめて見ます。', '<button class="btn btn-primary" data-action="new-goal">追加</button>')}${content}`;
}

function renderMarkets(){
  const root = document.getElementById('brandMarkets');
  if(!root) return;
  root.innerHTML = `${pageHead('マルシェ準備','準備チェックと売上目標をまとめます。', '<button class="btn btn-primary" data-action="new-market">追加</button>')}
    <div class="brand-grid">${state.markets.map(market => {
      const productTotals = marketProductTotals(market);
      return `<div class="brand-card brand-market-card"><div class="brand-card-head"><div class="brand-card-title"><h3>${escapeHtml(market.name)}</h3><p class="brand-note">${market.date || '-'} / ${escapeHtml(market.place || '')} / あと${daysUntil(market.date) ?? '-'}日</p></div><div class="brand-card-actions"><button class="btn btn-ghost btn-small" data-action="edit-market" data-id="${market.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-market" data-id="${market.id}">削除</button></div></div><div class="brand-meter"><span>準備 ${marketProgress(market)}%</span>${progressBar(marketProgress(market))}</div><p class="brand-note">売上目標 ${yen(market.salesGoal)} / 実績 ${yen(market.actualSales)} / 参加費 ${yen(market.participationFee)}</p>
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
          <h3>${escapeHtml(customerDisplayName(customer))}</h3>
          <p>${escapeHtml(customer.orderNo || '-')} / ${escapeHtml(customer.productName || '-')} / ${yen(customer.amount)}</p>
        </div>
        <div class="brand-product-actions">
          <button class="btn btn-ghost btn-small" data-action="edit-order" data-id="${customer.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-order" data-id="${customer.id}">削除</button>
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

function leadNegotiationSummary(leadId){
  const records = asArray(state.negotiations).filter(n => n.leadId === leadId).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  if(!records.length) return '';
  const latest = records[0];
  return `<p class="brand-note">商談記録 ${records.length}件・最新 ${latest.date || '-'}${latest.result ? ` ${escapeHtml(latest.result)}` : ''}</p>`;
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
      ${leadNegotiationSummary(lead.id)}
      <details class="brand-step-panel">
        <summary>営業状況を変更</summary>
        <div class="brand-status">${LEAD_STATUSES.map(status => `<button class="brand-step ${lead.status === status ? 'active' : ''}" data-action="set-lead-status" data-id="${lead.id}" data-value="${status}">${status}</button>`).join('')}</div>
      </details>
    </article>`;
}

function customerProfileSummaryLine(profile){
  return [profile.sns ? `SNS: ${escapeHtml(profile.sns)}` : '', profile.line ? `LINE: ${escapeHtml(profile.line)}` : '', profile.email ? escapeHtml(profile.email) : ''].filter(Boolean).join(' / ') || '連絡先未登録';
}
function renderCrm(){
  const root = document.getElementById('brandCrm');
  if(!root) return;
  const counts = customerCounts();
  const activeCustomers = state.customers.filter(customer => customer.status !== '完了');
  const archivedCustomers = state.customers.filter(customer => customer.status === '完了');
  const profiles = asArray(state.customerProfiles).slice().sort((a,b) => a.name.localeCompare(b.name, 'ja'));
  const profileGroups = profiles.map(profile => {
    const orders = activeCustomers.filter(o => o.customerId === profile.id);
    return `<details class="brand-archive brand-customer-group" open>
      <summary><span>${escapeHtml(profile.name)}</span><b>${orders.length}件</b></summary>
      <div class="brand-archive-body">
        <div class="brand-card brand-customer-profile-card">
          <div class="brand-card-head">
            <div class="brand-card-title"><strong>${escapeHtml(profile.name)}</strong><p class="brand-note">${customerProfileSummaryLine(profile)}</p>${profile.memo ? `<p class="brand-note">${escapeHtml(profile.memo)}</p>` : ''}</div>
            <div class="brand-card-actions">
              <button class="btn btn-sage btn-small" data-action="new-order" data-id="${profile.id}">注文追加</button>
              <button class="btn btn-ghost btn-small" data-action="edit-customer-profile" data-id="${profile.id}">編集</button>
              <button class="btn btn-ghost btn-small brand-danger" data-action="delete-customer-profile" data-id="${profile.id}">削除</button>
            </div>
          </div>
        </div>
        ${orders.length ? `<div class="brand-ops-grid">${orders.map(customerOpsCard).join('')}</div>` : empty('この方の進行中の注文はまだありません。')}
      </div>
    </details>`;
  }).join('');
  const orphanOrders = activeCustomers.filter(o => !profiles.some(p => p.id === o.customerId));
  const orphanSection = orphanOrders.length ? `<section class="brand-wholesale-group"><div class="brand-mini-head"><h3>未分類の注文</h3></div><div class="brand-ops-grid">${orphanOrders.map(customerOpsCard).join('')}</div></section>` : '';
  const bodyContent = profileGroups + orphanSection;
  root.innerHTML = `${pageHead('お客様管理','お客様ごとに、注文の現在地をまとめて見ます。', '<button class="btn btn-primary" data-action="new-customer-profile">顧客追加</button>')}
    <div class="brand-status-summary">${CUSTOMER_STATUSES.map(status => `<div class="brand-status-tile"><strong>${counts[status]}</strong><span>${status}</span></div>`).join('')}</div>
    ${bodyContent || empty('まだお客様がいません。「顧客追加」から登録してください。')}
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
  const onlineProducts = state.products.filter(product => !isWholesaleProduct(product));
  const wholesaleProducts = state.products.filter(isWholesaleProduct);
  const listings = allWholesaleListings();
  const unassignedProducts = wholesaleProducts.filter(product => !asArray(product.wholesaleListings).length);
  const storeNames = wholesaleStoreNames();
  const productTitleHtml = product => `<div class="brand-product-title">
    <h3>${escapeHtml(product.name || '商品名未設定')}</h3>
    ${product.sku ? `<p class="brand-product-sku">${escapeHtml(product.sku)}</p>` : ''}
    <p>${escapeHtml(product.category || 'カテゴリ未設定')}</p>
    ${product.dimensions ? `<p class="brand-product-dimensions">${escapeHtml(product.dimensions)}</p>` : ''}
    ${productColorSwatches(product)}
  </div>`;
  const onlineCard = product => `<article class="brand-card brand-product-card">
      <div class="brand-product-head">
        ${productTitleHtml(product)}
        <div class="brand-product-actions">
          <button class="btn btn-ghost btn-small" data-action="edit-product" data-id="${product.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-product" data-id="${product.id}">削除</button>
        </div>
      </div>
      <div class="brand-product-metrics">
        <span><b>${yen(product.price)}</b><small>価格</small></span>
        <span><b>${yen(product.cost)}</b><small>原価</small></span>
        <span><b>${Number(product.stock || 0)}</b><small>在庫</small></span>
        <span><b>${product.minutes || 0}分</b><small>制作</small></span>
      </div>
      ${product.description ? `<p class="brand-note">${escapeHtml(product.description)}</p>` : '<p class="brand-note">説明はまだありません。</p>'}
    </article>`;
  const listingCard = ({listing, product}) => `<article class="brand-card brand-product-card">
      <div class="brand-product-head">
        ${productTitleHtml(product)}
        <div class="brand-product-actions">
          <button class="btn btn-ghost btn-small" data-action="edit-listing" data-id="${product.id}" data-listing="${listing.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-listing" data-id="${product.id}" data-listing="${listing.id}">削除</button>
        </div>
      </div>
      ${listing.status ? `<span class="brand-wholesale-store">${escapeHtml(listing.status)}</span>` : ''}
      <div class="brand-product-metrics">
        <span><b>${yen(listing.wholesalePrice)}</b><small>卸し価格</small></span>
        <span><b>${yen(product.cost)}</b><small>原価</small></span>
        <span><b>${productDelivered(listing)}</b><small>累計卸し数</small></span>
        <span><b>${product.minutes || 0}分</b><small>制作</small></span>
      </div>
      ${product.description ? `<p class="brand-note">${escapeHtml(product.description)}</p>` : ''}
      ${listing.memo ? `<p class="brand-note">${escapeHtml(listing.memo)}</p>` : ''}
      <section class="brand-market-products">
        <div class="brand-mini-head"><h3>卸し実績</h3><button class="btn btn-ghost btn-small" data-action="new-delivery" data-id="${product.id}" data-listing="${listing.id}">記録追加</button></div>
        <div class="brand-market-product-list">${asArray(listing.deliveries).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(d => `<div class="brand-market-product-row"><div><strong>${d.date || '日付未設定'}</strong><span>${d.qty || 0}個</span>${d.memo ? `<p>${escapeHtml(d.memo)}</p>` : ''}</div><button class="btn btn-ghost btn-small brand-danger" data-action="delete-delivery" data-id="${product.id}" data-listing="${listing.id}" data-delivery="${d.id}">削除</button></div>`).join('') || empty('まだ卸し実績がありません。記録追加から入力できます。')}</div>
      </section>
      <div class="brand-toolbar" style="margin-bottom:0;"><button class="btn btn-ghost btn-small" data-action="new-listing" data-id="${product.id}">他の店舗にも卸し先を追加</button></div>
    </article>`;
  const unassignedCard = product => `<article class="brand-card brand-product-card">
      <div class="brand-product-head">
        ${productTitleHtml(product)}
        <div class="brand-product-actions">
          <button class="btn btn-ghost btn-small" data-action="edit-product" data-id="${product.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-product" data-id="${product.id}">削除</button>
        </div>
      </div>
      <div class="brand-product-metrics">
        <span><b>${yen(product.cost)}</b><small>原価</small></span>
        <span><b>${product.minutes || 0}分</b><small>制作</small></span>
      </div>
      ${product.description ? `<p class="brand-note">${escapeHtml(product.description)}</p>` : ''}
      <div class="brand-toolbar" style="margin-bottom:0;"><button class="btn btn-sage btn-small" data-action="new-listing" data-id="${product.id}">卸し先を追加</button></div>
    </article>`;
  const currentCount = activeProductTab === 'wholesale' ? listings.length : onlineProducts.length;
  const totalStock = activeProductTab === 'wholesale'
    ? listings.reduce((sum, x) => sum + productDelivered(x.listing), 0)
    : onlineProducts.reduce((sum, p) => sum + Number(p.stock || 0), 0);
  const totalValue = activeProductTab === 'wholesale'
    ? listings.reduce((sum, x) => sum + productDelivered(x.listing) * Number(x.listing.wholesalePrice || 0), 0)
    : onlineProducts.reduce((sum, p) => sum + Number(p.stock || 0) * Number(p.price || 0), 0);
  const tabs = `<div class="brand-product-tabs">
    <button class="brand-filter ${activeProductTab === 'online' ? 'active' : ''}" data-action="set-product-tab" data-value="online">ネット販売在庫 <span>${onlineProducts.length}</span></button>
    <button class="brand-filter ${activeProductTab === 'wholesale' ? 'active' : ''}" data-action="set-product-tab" data-value="wholesale">卸し商品 <span>${wholesaleProducts.length}</span></button>
  </div>`;
  const summary = `<div class="brand-status-summary">
    <div class="brand-status-tile"><strong>${currentCount}</strong><span>${activeProductTab === 'wholesale' ? '卸し先数' : '商品数'}</span></div>
    <div class="brand-status-tile"><strong>${totalStock}</strong><span>${activeProductTab === 'wholesale' ? '累計卸し数' : '在庫合計'}</span></div>
    <div class="brand-status-tile"><strong>${activeProductTab === 'wholesale' ? storeNames.length : onlineProducts.length}</strong><span>${activeProductTab === 'wholesale' ? '店舗数' : 'ネット販売商品'}</span></div>
    <div class="brand-status-tile"><strong>${yen(totalValue)}</strong><span>${activeProductTab === 'wholesale' ? '累計卸し金額' : '在庫金額目安'}</span></div>
  </div>`;
  const wholesaleToolbar = activeProductTab === 'wholesale' ? `<div class="brand-toolbar"><button class="btn btn-ghost btn-small" data-action="export-deliveries-csv">卸し実績をCSV出力</button></div>` : '';
  const colorSection = `<details class="brand-archive brand-color-palette section-gap">
    <summary><span>カラー管理</span><b>${state.colorPalette.length}色</b></summary>
    <div class="brand-archive-body">
      <div class="brand-color-list">${state.colorPalette.map(c => `<div class="brand-color-chip"><span class="brand-color-swatch" style="background:${escapeHtml(c.hex || '#ccc')}"></span><strong>${escapeHtml(c.code)}</strong><span>${escapeHtml(c.name)}</span><button class="btn btn-ghost btn-small" data-action="edit-color" data-id="${c.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-color" data-id="${c.id}">削除</button></div>`).join('') || empty('カラーがまだありません。')}</div>
      <button class="btn btn-sage btn-small" data-action="new-color" style="margin-top:10px;">カラー追加</button>
    </div>
  </details>`;
  const groupedByStore = storeNames.map(store => {
    const items = listings.filter(x => listingLeadName(x.listing) === store);
    const stock = items.reduce((sum, x) => sum + productDelivered(x.listing), 0);
    return `<details class="brand-archive brand-wholesale-group" open><summary><span>${escapeHtml(store)}</span><b>${items.length}商品 / 累計卸し${stock}</b></summary><div class="brand-product-grid">${items.map(listingCard).join('')}</div></details>`;
  }).join('');
  const unassignedSection = unassignedProducts.length ? `<section class="brand-wholesale-group"><div class="brand-mini-head"><h3>卸し先未設定</h3></div><div class="brand-product-grid">${unassignedProducts.map(unassignedCard).join('')}</div></section>` : '';
  const content = activeProductTab === 'wholesale'
    ? (groupedByStore + unassignedSection || empty('卸し商品はまだありません。商品追加から管理区分を「卸し商品」にして登録できます。'))
    : `<div class="brand-product-grid">${onlineProducts.map(onlineCard).join('') || empty('ネット販売在庫はまだありません。')}</div>`;
  root.innerHTML = `${pageHead('商品管理','卸し商品とネット販売在庫を分けて管理します。', '<button class="btn btn-primary" data-action="new-product">追加</button>')}${tabs}${summary}${wholesaleToolbar}${colorSection}${content}`;
}

function renderIdeas(){
  const root = document.getElementById('brandIdeas');
  if(!root) return;
  root.innerHTML = `${pageHead('アイデア帳','思いついたことをすぐ保存し、後からタスク化できます。', '<button class="btn btn-primary" data-action="new-brand-idea">追加</button>')}
    <div class="brand-grid">${state.ideas.map(idea => `<div class="brand-card"><div class="brand-card-head"><div class="brand-card-title"><span class="brand-chip">${escapeHtml(idea.priority || '中')}</span><h3>${escapeHtml(idea.title)}</h3></div><div class="brand-card-actions"><button class="btn btn-sage btn-small" data-action="idea-to-task" data-id="${idea.id}">タスク化</button><button class="btn btn-ghost btn-small" data-action="edit-brand-idea" data-id="${idea.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-idea" data-id="${idea.id}">削除</button></div></div><p class="brand-note">${escapeHtml(idea.memo || '')}</p><p class="brand-note">${escapeHtml(idea.tags || '')} / ${idea.createdAt || ''}</p></div>`).join('') || empty()}</div>`;
}

function invoiceHistoryCard(invoice){
  const totals = invoiceTotals(invoice.items, invoice.taxRate, invoice.shippingFee);
  const type = invoice.documentType || '請求書';
  return `<div class="brand-card"><div class="brand-card-head"><div class="brand-card-title"><span class="brand-chip">${escapeHtml(type)}</span><strong>${escapeHtml(invoice.number)}</strong><p class="brand-note">${invoice.date || '-'}</p></div><div class="brand-card-actions"><button class="btn btn-ghost btn-small" data-action="load-invoice-history" data-id="${invoice.id}">呼び出す</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-invoice-history" data-id="${invoice.id}">削除</button></div></div><p class="brand-note">合計 ${yen(totals.total)}（税込）</p></div>`;
}
function invoiceHistoryByStore(history){
  const storeNames = [...new Set(history.map(inv => inv.store || inv.billTo || '店舗未設定'))].sort((a,b) => a.localeCompare(b, 'ja'));
  return storeNames.map(store => {
    const items = history.filter(inv => (inv.store || inv.billTo || '店舗未設定') === store);
    return `<details class="brand-archive brand-invoice-history-group"><summary><span>${escapeHtml(store)}</span><b>${items.length}件</b></summary><div class="brand-archive-body">${items.map(invoiceHistoryCard).join('')}</div></details>`;
  }).join('');
}
function bankInfoHtml(profile){
  const rows = [];
  if(profile.bankName || profile.branchName) rows.push(['銀行', [profile.bankName, profile.branchName].filter(Boolean).map(escapeHtml).join(' ')]);
  if(profile.accountType || profile.accountNumber) rows.push(['口座', [profile.accountType, profile.accountNumber].filter(Boolean).map(escapeHtml).join(' ')]);
  if(profile.accountHolder) rows.push(['名義', escapeHtml(profile.accountHolder)]);
  if(!rows.length) return '';
  return `<div class="invoice-bank"><p>お振込先</p><table class="invoice-bank-table">${rows.map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join('')}</table></div>`;
}
function invoiceGreeting(isDeliveryNote){
  return isDeliveryNote
    ? 'この度はご注文ありがとうございます。<br>下記のとおり納品申し上げます。'
    : 'いつもお世話になっております。<br>下記のとおりご請求申し上げます。';
}
const INVOICE_TABLE_MIN_ROWS = 4;
function renderInvoice(){
  const root = document.getElementById('brandInvoice');
  if(!root) return;
  const draft = state.invoiceDraft;
  const profile = state.sellerProfile || {};
  const history = asArray(state.invoices).slice().sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const historySection = history.length ? `<div class="no-print section-gap"><h3>書類履歴</h3>${invoiceHistoryByStore(history)}</div>` : '';
  const actions = `<button class="btn btn-ghost btn-small" data-action="edit-seller-profile">発行者情報</button><button class="btn btn-primary" data-action="${draft ? 'edit-invoice-header' : 'generate-invoice'}">${draft ? '書類情報を編集' : '書類を作成'}</button>`;
  if(!draft){
    root.innerHTML = `${pageHead('帳票','請求書・納品書を、卸し実績から自動で作成できます。', actions)}${empty('まだ書類がありません。「書類を作成」から種類・店舗・期間を選んでください。')}${historySection}`;
    return;
  }
  const docType = draft.documentType || '請求書';
  const isDeliveryNote = docType === '納品書';
  const items = asArray(draft.items);
  const { subtotal, shipping, tax, total } = invoiceTotals(items, draft.taxRate, draft.shippingFee);
  const periodLabel = draft.periodFrom || draft.periodTo ? `対象期間: ${draft.periodFrom || '-'} 〜 ${draft.periodTo || '-'}` : '';
  const blankRows = Math.max(0, INVOICE_TABLE_MIN_ROWS - items.length);
  const itemRows = items.map((item, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(item.name)}</td><td>${item.qty}</td><td>${yen(item.price)}</td><td>${yen(Number(item.qty || 0) * Number(item.price || 0))}</td><td class="no-print"><button class="btn btn-ghost btn-small" data-action="edit-invoice-item" data-id="${item.id}">編集</button><button class="btn btn-ghost btn-small brand-danger" data-action="delete-invoice-item" data-id="${item.id}">削除</button></td></tr>`).join('');
  const emptyRows = Array.from({ length: blankRows }, (_, i) => `<tr><td>${items.length + i + 1}</td><td></td><td></td><td></td><td></td><td class="no-print"></td></tr>`).join('');
  root.innerHTML = `${pageHead('帳票','請求書・納品書を、卸し実績から自動で作成できます。', actions)}
    <div class="invoice-toolbar no-print">
      <button class="btn btn-ghost btn-small" data-action="add-invoice-item">明細を追加</button>
      <button class="btn btn-ghost btn-small brand-danger" data-action="clear-invoice">${escapeHtml(docType)}をクリア</button>
      <button class="btn btn-sage btn-small" data-action="save-invoice-history">履歴に保存</button>
      <button class="btn btn-primary btn-small" data-action="print-invoice">A4で印刷する</button>
    </div>
    <details class="brand-archive invoice-archive" id="invoiceArchive" open>
      <summary class="no-print"><span>${escapeHtml(docType)}プレビュー</span><b>${escapeHtml(draft.number || '-')}</b></summary>
      <div class="invoice-sheet" id="invoiceSheet">
        <div class="invoice-head">
          <h1>${escapeHtml(docType)}</h1>
          <div class="invoice-meta">
            <div class="invoice-meta-row"><span>発行日</span><strong>${draft.date || '-'}</strong><span>${escapeHtml(docType)}番号</span><strong>${escapeHtml(draft.number || '-')}</strong></div>
            <div class="invoice-meta-row"><span>${isDeliveryNote ? '納品日' : '支払期限'}</span><strong>${draft.dueDate || '-'}</strong><span>注文番号</span><strong>${escapeHtml(draft.orderNumber || '-')}</strong></div>
          </div>
        </div>
        <div class="invoice-parties">
          <div class="invoice-billto-block">
            <div class="invoice-billto"><strong>${escapeHtml(draft.billTo || draft.store || 'お客様')} 御中</strong></div>
            ${draft.billToContact ? `<p>お受取人：${escapeHtml(draft.billToContact)} 様</p>` : ''}
            ${draft.billToPostalCode ? `<p>〒${escapeHtml(draft.billToPostalCode)}</p>` : ''}
            ${draft.billToAddress ? `<p>${escapeHtml(draft.billToAddress)}</p>` : ''}
            ${draft.billToPhone ? `<p>TEL: ${escapeHtml(draft.billToPhone)}</p>` : ''}
            ${draft.billToEmail ? `<p>${escapeHtml(draft.billToEmail)}</p>` : ''}
          </div>
          <div class="invoice-seller">
            <img class="invoice-logo" src="./assets/mofyla-logo.png" alt="MofYla logo">
            <p class="invoice-seller-name">${escapeHtml(profile.name || '（発行者情報未設定）')}</p>
            ${profile.contactPerson ? `<p>担当者：${escapeHtml(profile.contactPerson)}</p>` : ''}
            ${profile.postalCode ? `<p>〒${escapeHtml(profile.postalCode)}</p>` : ''}
            ${profile.address ? `<p>${escapeHtml(profile.address)}</p>` : ''}
            ${profile.phone ? `<p>TEL: ${escapeHtml(profile.phone)}</p>` : ''}
            ${profile.email ? `<p>${escapeHtml(profile.email)}</p>` : ''}
          </div>
        </div>
        <p class="invoice-greeting">${invoiceGreeting(isDeliveryNote)}</p>
        ${periodLabel ? `<p class="brand-note">${periodLabel}</p>` : ''}
        <div class="invoice-total-highlight">${isDeliveryNote ? '合計金額' : 'ご請求金額'}　${yen(total)}（税込）</div>
        <table class="invoice-table">
          <thead><tr><th>No.</th><th>品目・商品名</th><th>数量</th><th>単価（税抜）</th><th>金額（税抜）</th><th class="no-print"></th></tr></thead>
          <tbody>${itemRows || emptyRows ? itemRows + emptyRows : `<tr><td colspan="6">明細がありません。「明細を追加」から入力するか、卸し実績のある店舗で作り直してください。</td></tr>`}</tbody>
        </table>
        <div class="invoice-bottom">
          <div class="invoice-notes"><p>備考</p><p>${draft.notes ? escapeHtml(draft.notes) : ''}</p></div>
          <table class="invoice-summary-table">
            <tr><td>小計（税抜）</td><td>${yen(subtotal)}</td></tr>
            <tr><td>送料（税抜）</td><td>${yen(shipping)}</td></tr>
            <tr><td>消費税（${draft.taxRate || 0}%）</td><td>${yen(tax)}</td></tr>
            <tr class="invoice-grand-total"><td>合計（税込）</td><td>${yen(total)}</td></tr>
          </table>
        </div>
        ${!isDeliveryNote ? bankInfoHtml(profile) : ''}
        <div class="invoice-footer">
          <span>${escapeHtml(profile.name || '')}</span>
        </div>
      </div>
    </details>
    ${historySection}`;
}

function renderAll(){ renderHome(); renderTasks(); renderGoals(); renderMarkets(); renderSales(); renderCrm(); renderLeads(); renderNegotiations(); renderProducts(); renderIdeas(); renderInvoice(); renderCoupons(); }

function negotiationOccurrence(negotiation){
  const sameLeadSorted = asArray(state.negotiations).filter(n => n.leadId === negotiation.leadId).slice().sort((a,b) => (a.date||'').localeCompare(b.date||'') || (a.createdAt||'').localeCompare(b.createdAt||''));
  const index = sameLeadSorted.findIndex(n => n.id === negotiation.id);
  return index >= 0 ? index + 1 : sameLeadSorted.length + 1;
}
function negotiationResultClass(result){
  if(result === '前向き') return 'ok';
  if(result === '見送り') return 'warn';
  if(result === '保留' || result === '要検討') return 'warm';
  return '';
}
function renderNegotiations(){
  const root = document.getElementById('brandNegotiations');
  if(!root) return;
  const allRecords = asArray(state.negotiations).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const filterLeads = [...new Set(allRecords.map(n => n.leadId))]
    .map(id => findBy('leads', id)).filter(Boolean)
    .sort((a,b) => (a.shopName || '').localeCompare(b.shopName || '', 'ja'));
  if(activeNegotiationLead !== 'all' && !filterLeads.some(l => l.id === activeNegotiationLead)) activeNegotiationLead = 'all';
  const records = activeNegotiationLead === 'all' ? allRecords : allRecords.filter(n => n.leadId === activeNegotiationLead);
  const filters = filterLeads.length ? `<div class="brand-toolbar"><div class="brand-filters">
    <button class="brand-filter ${activeNegotiationLead === 'all' ? 'active' : ''}" data-action="filter-negotiation" data-value="all">すべて <span>${allRecords.length}</span></button>
    ${filterLeads.map(l => `<button class="brand-filter ${activeNegotiationLead === l.id ? 'active' : ''}" data-action="filter-negotiation" data-value="${l.id}">${escapeHtml(l.shopName || '店舗未設定')} <span>${allRecords.filter(n => n.leadId === l.id).length}</span></button>`).join('')}
  </div></div>` : '';
  const cards = records.map(n => {
    const lead = findBy('leads', n.leadId);
    const preview = n.requestSummary || n.reaction || n.nextAction || '';
    return `<article class="brand-card brand-negotiation-card" data-action="view-negotiation" data-id="${n.id}">
      <div class="brand-negotiation-card-head">
        <span class="brand-chip ${negotiationResultClass(n.result)}">${escapeHtml(n.result || '結果未記入')}</span>
        <span class="brand-note">${n.date || '日付未設定'}${n.visitType ? ` / ${escapeHtml(n.visitType)}` : ''}</span>
      </div>
      <h3>${escapeHtml(lead?.shopName || '店舗未設定')}</h3>
      ${preview ? `<p class="brand-negotiation-preview">${escapeHtml(preview)}</p>` : ''}
      <div class="brand-negotiation-card-foot">
        <button class="btn btn-sage btn-small" data-action="view-negotiation" data-id="${n.id}">詳細を見る</button>
        <div class="brand-card-actions">
          <button class="btn btn-ghost btn-small" data-action="edit-negotiation" data-id="${n.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-negotiation" data-id="${n.id}">削除</button>
        </div>
      </div>
    </article>`;
  }).join('');
  root.innerHTML = `${pageHead('商談記録','店舗ごとの商談ややり取りを、時系列で記録します。', '<button class="btn btn-primary" data-action="new-negotiation">追加</button>')}
    ${filters}
    <div class="brand-grid">${cards || empty(activeNegotiationLead === 'all' ? 'まだ商談記録がありません。「追加」から記録してください。営業先が未登録の場合は先に営業先を追加してください。' : 'この店舗の商談記録はまだありません。')}</div>`;
}
function negotiationDetailOverlay(negotiation){
  const lead = findBy('leads', negotiation.leadId);
  const bullets = text => asArray((text || '').split('\n').map(line => line.trim()).filter(Boolean)).map(line => `<li>${escapeHtml(line)}</li>`).join('');
  const overlay = document.createElement('div');
  overlay.className = 'brand-modal-overlay';
  overlay.innerHTML = `<div class="brand-modal">
    <div class="brand-modal-head"><h3>商談記録詳細</h3><button class="modal-close" type="button" data-close-brand>×</button></div>
    <div class="brand-modal-body brand-negotiation-detail">
      <div class="brand-negotiation-summary-row">
        <div><small>商談概要</small><p>${negotiation.date || '-'}（${negotiationOccurrence(negotiation)}回目） / ${escapeHtml(lead?.shopName || '店舗未設定')}${negotiation.contactPerson ? `（${escapeHtml(negotiation.contactPerson)}）` : ''} / ${escapeHtml(negotiation.visitType || '種別未設定')}${negotiation.importance ? ` / 重要度${escapeHtml(negotiation.importance)}` : ''}</p></div>
      </div>
      <div class="brand-negotiation-section"><h4>1. 相手が求めていたこと</h4><p>${escapeHtml(negotiation.requestSummary || '未記入')}</p></div>
      <div class="brand-negotiation-section"><h4>2. MofYlaからの提案</h4><p>${escapeHtml(negotiation.proposal || '未記入')}</p></div>
      <div class="brand-negotiation-section"><h4>3. 相手の反応</h4><p>${escapeHtml(negotiation.reaction || '未記入')}</p></div>
      <div class="brand-negotiation-section"><h4>4. 決定事項・保留事項</h4><p>${escapeHtml(negotiation.decisions || '未記入')}</p>${negotiation.pending ? `<p class="brand-note">保留・課題: ${escapeHtml(negotiation.pending)}</p>` : ''}</div>
      <div class="brand-negotiation-section"><h4>5. 次の対応</h4><label class="brand-checkline"><input type="checkbox" disabled><span>${escapeHtml(negotiation.nextAction || '未記入')}</span></label>${negotiation.nextActionAssignee ? `<p class="brand-note">担当 / ${escapeHtml(negotiation.nextActionAssignee)}</p>` : ''}</div>
      <div class="brand-negotiation-section"><h4>6. 次回連絡日</h4><p>${negotiation.nextContactDate || '未設定'}</p></div>
      <div class="brand-negotiation-section"><h4>7. その他メモ</h4>${negotiation.memo ? `<ul class="brand-negotiation-memo-list">${bullets(negotiation.memo)}</ul>` : '<p>未記入</p>'}</div>
      <div class="toolbar" style="margin-top:16px;justify-content:flex-end;"><button class="btn btn-primary" type="button" data-action="edit-negotiation-from-detail" data-id="${negotiation.id}">編集</button></div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', event => {
    if(event.target.closest('[data-close-brand]')) overlay.remove();
    if(event.target.closest('[data-action="edit-negotiation-from-detail"]')){ overlay.remove(); negotiationForm(negotiation); }
  });
}

function openForm(title, fields, values, onSubmit){
  const overlay = document.createElement('div');
  overlay.className = 'brand-modal-overlay';
  overlay.innerHTML = `<div class="brand-modal"><div class="brand-modal-head"><h3>${title}</h3><button class="modal-close" type="button" data-close-brand>×</button></div><form class="brand-modal-body"><div class="brand-form-grid">${fields.map(fieldHtml).join('')}</div><div class="toolbar" style="margin-top:16px;"><button class="btn btn-primary" type="submit">保存</button><button class="btn btn-ghost" type="button" data-close-brand>キャンセル</button></div></form></div>`;
  document.body.appendChild(overlay);
  fields.forEach(field => {
    if(field.type === 'checkboxGroup'){
      const selected = asArray(values[field.name]);
      const boxes = [...overlay.querySelectorAll(`input[name="${field.name}"]`)];
      boxes.forEach(box => { box.checked = selected.includes(box.value); });
      if(field.max){
        const enforce = () => {
          const checkedCount = boxes.filter(box => box.checked).length;
          boxes.forEach(box => { if(!box.checked) box.disabled = checkedCount >= field.max; });
        };
        boxes.forEach(box => box.addEventListener('change', enforce));
        enforce();
      }
      return;
    }
    const el = overlay.querySelector(`[name="${field.name}"]`);
    if(el) el.value = values[field.name] ?? field.default ?? '';
  });
  overlay.addEventListener('click', event => { if(event.target.closest('[data-close-brand]')) overlay.remove(); });
  overlay.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = {};
    fields.forEach(field => {
      if(field.type === 'section') return;
      data[field.name] = field.type === 'checkboxGroup' ? formData.getAll(field.name) : formData.get(field.name);
    });
    await onSubmit(data);
    overlay.remove();
    renderAll();
  });
}
function fieldHtml(field){
  if(field.type === 'section') return `<div class="brand-form-section">${field.label}</div>`;
  const cls = `brand-field ${field.full ? 'full' : ''}`;
  if(field.type === 'textarea') return `<div class="${cls}"><label>${field.label}</label><textarea name="${field.name}"></textarea></div>`;
  if(field.type === 'select') return `<div class="${cls}"><label>${field.label}</label><select name="${field.name}">${field.options.map(option => `<option value="${escapeHtml(option.value ?? option)}">${escapeHtml(option.label ?? option)}</option>`).join('')}</select></div>`;
  if(field.type === 'checkboxGroup') return `<div class="${cls} full"><label>${field.label}</label><div class="brand-checkbox-group">${field.options.map(option => `<label class="brand-checkbox-pill"><input type="checkbox" name="${field.name}" value="${escapeHtml(option.value ?? option)}"><span>${escapeHtml(option.label ?? option)}</span></label>`).join('')}</div></div>`;
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
function customerProfileForm(profile = {}){
  openForm(profile.id ? 'お客様編集' : 'お客様追加', [
    {name:'name',label:'お客様名'},
    {name:'sns',label:'SNSアカウント'},
    {name:'line',label:'LINE'},
    {name:'email',label:'メール'},
    {name:'memo',label:'メモ',type:'textarea',full:true}
  ], profile, async data => {
    upsert('customerProfiles', {...profile, ...data, id:profile.id || uid('customerProfile')});
    await save();
  });
}
function orderForm(customerId, order = {}){
  const profile = state.customerProfiles.find(p => p.id === customerId);
  if(!profile) return;
  openForm(order.id ? '注文編集' : '注文追加', [
    {type:'section',label:'ペット情報'},
    {name:'petName',label:'ペット名'},{name:'petType',label:'種類'},{name:'petNote',label:'ペット備考',type:'textarea',full:true},
    {type:'section',label:'注文と進捗'},
    {name:'orderNo',label:'受付番号'},{name:'productName',label:'商品名'},{name:'quantity',label:'数量',type:'number'},{name:'amount',label:'金額',type:'number'},
    {name:'paid',label:'入金状況',type:'select',options:['未入金','入金済','一部入金']},{name:'dueDate',label:'納期',type:'date'},{name:'status',label:'制作状況',type:'select',options:CUSTOMER_STATUSES},
    {name:'nextAction',label:'次に確認すること',full:true},{name:'memo',label:'メモ',type:'textarea',full:true}
  ], order, async data => {
    const completedAt = data.status === '完了' ? (order.completedAt || todayKey()) : order.completedAt;
    upsert('customers', {...order, ...data, completedAt, customerId:profile.id, id:order.id || uid('customer')});
    await save();
  });
}
function generateCouponCode(){
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = 'MOF-' + Array.from({ length:6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while(state.coupons.some(c => c.code === code));
  return code;
}
function couponStatus(coupon){
  if(coupon.usedAt) return '使用済み';
  if(coupon.expiryDate && coupon.expiryDate < todayKey()) return '失効';
  return '未使用';
}
function couponStatusClass(status){ return status === '使用済み' ? '' : status === '失効' ? 'warn' : 'ok'; }
function couponForm(coupon = {}){
  openForm(coupon.id ? 'クーポン編集' : 'クーポン追加', [
    {name:'discountType',label:'割引タイプ',type:'select',options:[{value:'percent',label:'割引率（%）'},{value:'amount',label:'金額（円）'}]},
    {name:'discountValue',label:'割引の値',type:'number'},
    {name:'expiryDate',label:'有効期限（空欄なら無期限）',type:'date'},
    {name:'customerId',label:'対象のお客様（任意）',type:'select',options:optionsFrom(state.customerProfiles,'name')},
    {name:'memo',label:'メモ',type:'textarea',full:true}
  ], { discountType:'percent', ...coupon }, async data => {
    upsert('coupons', {
      ...coupon, ...data,
      id:coupon.id || uid('coupon'),
      code:coupon.code || generateCouponCode(),
      discountValue:Number(data.discountValue || 0),
      usedAt:coupon.usedAt || null,
      createdAt:coupon.createdAt || new Date().toISOString()
    });
    await save();
  });
}
function couponCard(coupon){
  const status = couponStatus(coupon);
  const customer = state.customerProfiles.find(p => p.id === coupon.customerId);
  const discountLabel = coupon.discountType === 'amount' ? `${yen(coupon.discountValue)}引き` : `${coupon.discountValue || 0}%引き`;
  return `<div class="brand-card coupon-card">
      <div class="brand-card-head">
        <div class="brand-card-title">
          <span class="brand-chip ${couponStatusClass(status)}">${status}</span>
          <h3 class="coupon-code">${escapeHtml(coupon.code)}</h3>
          <p class="brand-note">${discountLabel}${coupon.expiryDate ? ` / 期限 ${coupon.expiryDate}` : ' / 無期限'}${customer ? ` / ${escapeHtml(customer.name)}` : ''}</p>
        </div>
        <div class="brand-card-actions">
          ${status === '未使用' ? `<button class="btn btn-sage btn-small" data-action="mark-coupon-used" data-id="${coupon.id}">使用済みにする</button>` : ''}
          <button class="btn btn-ghost btn-small" data-action="edit-coupon" data-id="${coupon.id}">編集</button>
          <button class="btn btn-ghost btn-small brand-danger" data-action="delete-coupon" data-id="${coupon.id}">削除</button>
        </div>
      </div>
      ${coupon.memo ? `<p class="brand-note">${escapeHtml(coupon.memo)}</p>` : ''}
    </div>`;
}
function renderCouponLookupResult(){
  const box = document.getElementById('couponLookupResult');
  if(!box) return;
  const query = couponQuery.trim().toLowerCase();
  if(!query){ box.innerHTML = ''; return; }
  const matches = asArray(state.coupons).filter(c => c.code.toLowerCase().includes(query));
  box.innerHTML = matches.length ? matches.map(couponCard).join('') : `<p class="brand-note">一致するクーポンが見つかりません。</p>`;
}
function renderCoupons(){
  const root = document.getElementById('brandCoupons');
  if(!root) return;
  const coupons = asArray(state.coupons).slice().sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const active = coupons.filter(c => couponStatus(c) === '未使用');
  const inactive = coupons.filter(c => couponStatus(c) !== '未使用');
  const usedCount = coupons.filter(c => couponStatus(c) === '使用済み').length;
  const expiredCount = coupons.filter(c => couponStatus(c) === '失効').length;
  root.innerHTML = `${pageHead('クーポン管理','コードを発行し、番号照会でその場ですぐに確認・使用済みにできます。', '<button class="btn btn-primary" data-action="new-coupon">追加</button>')}
    <div class="brand-card coupon-lookup section-gap">
      <p class="label-eyebrow">番号照会</p>
      <input type="text" id="couponLookupInput" class="coupon-lookup-input" placeholder="コードを入力（例: MOF-AB12CD）" value="${escapeHtml(couponQuery)}" autocomplete="off">
      <div id="couponLookupResult"></div>
    </div>
    <div class="brand-status-summary">
      <div class="brand-status-tile"><strong>${active.length}</strong><span>未使用</span></div>
      <div class="brand-status-tile"><strong>${usedCount}</strong><span>使用済み</span></div>
      <div class="brand-status-tile"><strong>${expiredCount}</strong><span>失効</span></div>
    </div>
    <div class="brand-grid">${active.map(couponCard).join('') || empty('未使用のクーポンはまだありません。「追加」から発行してください。')}</div>
    ${archiveDetails('使用済み・失効クーポン', inactive, couponCard)}`;
  renderCouponLookupResult();
}
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
    {name:'breed',label:'兎種',type:'select',options:RABBIT_BREEDS.map(b => b.name)},
    {name:'sku',label:'商品番号（自動採番・編集可）'},
    {name:'dimensions',label:'寸法（例: W80×D80×H10mm）'},
    {name:'colorIds',label:'カラー（最大4色まで選択可）',type:'checkboxGroup',max:4,options:state.colorPalette.map(c => ({value:c.id, label:`${c.code} ${c.name}`}))},
    {name:'cost',label:'原価',type:'number'},
    {name:'minutes',label:'制作時間目安',type:'number'},
    {name:'description',label:'商品説明',type:'textarea',full:true}
  ];
  const onlineFields = [
    {name:'price',label:'販売価格',type:'number'},
    {name:'stock',label:'ネット販売在庫数',type:'number'},
    {name:'status',label:'販売状態',type:'select',options:['販売中','非公開','準備中','在庫少']},
    {name:'sold',label:'販売数',type:'number'},
    {name:'lastSoldDate',label:'最終販売日',type:'date'}
  ];
  const fields = [...commonFields, ...(channel === 'wholesale' ? [] : onlineFields)];
  const defaultCategory = product.category || CATEGORIES[0];
  const defaultBreed = product.breed || RABBIT_BREEDS[0].name;
  const initialValues = {
    salesChannel:channel, category:defaultCategory, breed:defaultBreed,
    sku:product.sku || (product.id ? '' : nextProductSku(defaultCategory, defaultBreed)),
    colorIds:asArray(product.colorIds).length ? product.colorIds : (product.colorId ? [product.colorId] : []),
    ...product
  };
  openForm(product.id ? '商品編集' : '商品追加', fields, initialValues, async data => {
    const salesChannel = data.salesChannel || 'online';
    upsert('products', {
      ...product, ...data, id:product.id || uid('product'), salesChannel,
      colorIds:asArray(data.colorIds).slice(0, 4), colorId:undefined,
      price:Number(data.price ?? product.price ?? 0),
      cost:Number(data.cost || 0),
      minutes:Number(data.minutes || 0),
      stock:Number(data.stock ?? product.stock ?? 0),
      sold:Number(data.sold ?? product.sold ?? 0),
      wholesaleListings:asArray(product.wholesaleListings)
    });
    activeProductTab = salesChannel === 'wholesale' ? 'wholesale' : 'online';
    await save();
  });
  if(!product.id) wireProductSkuAutoFill();
}
function wireProductSkuAutoFill(){
  const overlay = document.querySelector('.brand-modal-overlay');
  if(!overlay) return;
  const categorySelect = overlay.querySelector('[name="category"]');
  const breedSelect = overlay.querySelector('[name="breed"]');
  const skuInput = overlay.querySelector('[name="sku"]');
  if(!categorySelect || !breedSelect || !skuInput) return;
  skuInput.dataset.autofilled = 'true';
  skuInput.addEventListener('input', () => { skuInput.dataset.autofilled = 'false'; });
  const recompute = () => {
    if(skuInput.dataset.autofilled !== 'true') return;
    skuInput.value = nextProductSku(categorySelect.value, breedSelect.value);
  };
  categorySelect.addEventListener('change', recompute);
  breedSelect.addEventListener('change', recompute);
}
function productDeliveryForm(productId, listingId){
  const product = findBy('products', productId);
  const listing = product && asArray(product.wholesaleListings).find(l => l.id === listingId);
  if(!listing) return;
  openForm('卸し実績を記録', [
    {name:'date',label:'卸した日',type:'date'},
    {name:'qty',label:'数量',type:'number'},
    {name:'memo',label:'メモ',type:'textarea',full:true}
  ], {date:todayKey()}, async data => {
    listing.deliveries = asArray(listing.deliveries);
    listing.deliveries.push({id:uid('delivery'), date:data.date || todayKey(), qty:Number(data.qty || 0), memo:data.memo || ''});
    await save();
  });
}
function listingForm(productId, listing = {}){
  const product = findBy('products', productId);
  if(!product) return;
  openForm(listing.id ? '卸し先編集' : '卸し先を追加', [
    {name:'leadId',label:'卸し先店舗',type:'select',options:optionsFrom(state.leads, 'shopName')},
    {name:'wholesalePrice',label:'卸し価格',type:'number'},
    {name:'status',label:'取引状態',type:'select',options:WHOLESALE_STATUSES},
    {name:'memo',label:'メモ',type:'textarea',full:true}
  ], listing, async data => {
    product.wholesaleListings = asArray(product.wholesaleListings);
    const newListing = {...listing, ...data, id:listing.id || uid('listing'), wholesalePrice:Number(data.wholesalePrice || 0), deliveries:asArray(listing.deliveries)};
    const idx = product.wholesaleListings.findIndex(l => l.id === newListing.id);
    if(idx >= 0) product.wholesaleListings[idx] = newListing; else product.wholesaleListings.push(newListing);
    await save();
  });
}
function negotiationForm(negotiation = {}){
  openForm(negotiation.id ? '商談記録編集' : '商談記録追加', [
    {type:'section', label:'基本情報'},
    {name:'leadId',label:'対象店舗',type:'select',options:optionsFrom(state.leads, 'shopName')},
    {name:'contactPerson',label:'先方担当者'},
    {name:'date',label:'商談日',type:'date'},
    {name:'visitType',label:'種別',type:'select',options:['訪問','電話','メール','DM','その他']},
    {name:'importance',label:'重要度',type:'select',options:['高','中','低']},
    {name:'result',label:'結果',type:'select',options:['前向き','保留','要検討','見送り','その他']},
    {type:'section', label:'商談内容'},
    {name:'requestSummary',label:'相手が求めていたこと',type:'textarea',full:true},
    {name:'proposal',label:'MofYlaからの提案',type:'textarea',full:true},
    {name:'reaction',label:'相手の反応',type:'textarea',full:true},
    {type:'section', label:'決定・対応'},
    {name:'decisions',label:'決定事項',type:'textarea',full:true},
    {name:'pending',label:'保留・課題',type:'textarea',full:true},
    {name:'nextAction',label:'次の対応'},
    {name:'nextActionAssignee',label:'次の対応の担当'},
    {name:'nextContactDate',label:'次回連絡日',type:'date'},
    {type:'section', label:'メモ'},
    {name:'memo',label:'その他メモ（改行で箇条書き）',type:'textarea',full:true}
  ], {date:todayKey(), ...negotiation}, async data => {
    upsert('negotiations', {...negotiation, ...data, id:negotiation.id || uid('negotiation'), createdAt:negotiation.createdAt || todayKey()});
    await save();
  });
}
function ideaForm(idea = {}){ openForm(idea.id ? 'アイデア編集' : 'アイデア追加', [{name:'title',label:'タイトル',full:true},{name:'memo',label:'メモ',type:'textarea',full:true},{name:'tags',label:'タグ'},{name:'priority',label:'優先度',type:'select',options:['高','中','低']}], idea, async data => { upsert('ideas', {...idea, ...data, id:idea.id || uid('idea'), createdAt:idea.createdAt || todayKey()}); await save(); }); }

function sellerProfileForm(){
  openForm('発行者情報', [
    {name:'name',label:'事業者名／屋号'},
    {name:'contactPerson',label:'担当者名'},
    {name:'postalCode',label:'郵便番号（〒）'},
    {name:'address',label:'住所',full:true},
    {name:'phone',label:'電話番号'},
    {name:'email',label:'メールアドレス'},
    {type:'section',label:'振込先'},
    {name:'bankName',label:'銀行名'},
    {name:'branchName',label:'支店名'},
    {name:'accountType',label:'口座種別',type:'select',options:['普通','当座']},
    {name:'accountNumber',label:'口座番号'},
    {name:'accountHolder',label:'口座名義'}
  ], state.sellerProfile, async data => {
    state.sellerProfile = { ...state.sellerProfile, ...data };
    await save();
  });
}
function nextDocumentNumber(type){
  const prefix = type === '納品書' ? 'DN' : 'INV';
  const nums = asArray(state.invoices)
    .filter(inv => (inv.documentType || '請求書') === type)
    .map(inv => { const m = /(\d+)\s*$/.exec(inv.number || ''); return m ? Number(m[1]) : 0; });
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
function invoiceTotals(items, taxRate, shippingFee){
  const subtotal = asArray(items).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const shipping = Number(shippingFee || 0);
  const tax = Math.round((subtotal + shipping) * Number(taxRate || 0) / 100);
  return { subtotal, shipping, tax, total: subtotal + shipping + tax };
}
async function saveInvoiceToHistory(){
  const draft = state.invoiceDraft;
  if(!draft) return;
  if(!draft.number){ showToast('書類番号を入力してください'); return; }
  state.invoices = asArray(state.invoices);
  const index = state.invoices.findIndex(inv => inv.number === draft.number);
  if(index >= 0){
    state.invoices[index] = { ...state.invoices[index], ...draft, id:state.invoices[index].id };
    showToast(`書類番号 ${draft.number} の履歴を更新しました`);
  } else {
    state.invoices.push({ ...draft, id:uid('invoice'), createdAt:new Date().toISOString() });
    showToast('書類を履歴に保存しました');
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
  const rows = [['店舗名','商品番号','商品名','日付','数量','単価','金額','メモ']];
  allWholesaleListings()
    .slice()
    .sort((a,b) => listingLeadName(a.listing).localeCompare(listingLeadName(b.listing), 'ja'))
    .forEach(({listing, product}) => {
      asArray(listing.deliveries).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(d => {
        const price = Number(listing.wholesalePrice || 0);
        const qty = Number(d.qty || 0);
        rows.push([listingLeadName(listing), product.sku || '', product.name || '', d.date || '', qty, price, qty * price, d.memo || '']);
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
function invoiceItemsFromDeliveries(store, from, to){
  return allWholesaleListings()
    .filter(x => listingLeadName(x.listing) === store)
    .map(({listing, product}) => ({
      id:uid('invoiceItem'),
      name:product.name || '商品名未設定',
      qty:productDelivered(listing, from, to),
      price:Number(listing.wholesalePrice || 0)
    }))
    .filter(item => item.qty > 0);
}
function invoiceHeaderForm(){
  const draft = state.invoiceDraft;
  const stores = wholesaleStoreNames();
  const defaultType = (draft && draft.documentType) || '請求書';
  openForm(draft ? '書類情報を編集' : '書類を作成', [
    {type:'section',label:'書類情報'},
    {name:'documentType',label:'書類の種類',type:'select',options:['請求書','納品書']},
    {name:'store',label:'宛先の店舗',type:'select',options:stores.map(s => ({value:s, label:s}))},
    {name:'number',label:'書類番号'},
    {name:'orderNumber',label:'注文番号（任意）'},
    {name:'date',label:'発行日',type:'date'},
    {name:'dueDate',label:'納品日／支払期限',type:'date'},
    {name:'periodFrom',label:'対象期間（開始）',type:'date'},
    {name:'periodTo',label:'対象期間（終了）',type:'date'},
    {type:'section',label:'宛先情報'},
    {name:'billTo',label:'宛名（空欄なら店舗名を使用）'},
    {name:'billToContact',label:'お受取人／担当者名'},
    {name:'billToPostalCode',label:'郵便番号（〒）'},
    {name:'billToAddress',label:'住所',full:true},
    {name:'billToPhone',label:'電話番号'},
    {name:'billToEmail',label:'メールアドレス'},
    {type:'section',label:'金額・備考'},
    {name:'taxRate',label:'消費税率（%）',type:'number'},
    {name:'shippingFee',label:'送料（税抜・任意）',type:'number'},
    {name:'notes',label:'備考',type:'textarea',full:true}
  ], draft || {documentType:defaultType, number:nextDocumentNumber(defaultType), date:todayKey(), taxRate:10, store:stores[0] || ''}, async data => {
    const isNew = !draft;
    const store = data.store || (draft && draft.store) || '';
    const items = isNew ? invoiceItemsFromDeliveries(store, data.periodFrom, data.periodTo) : draft.items;
    state.invoiceDraft = {
      ...(draft || {}),
      ...data,
      documentType: data.documentType || defaultType,
      store,
      billTo: data.billTo || store,
      taxRate: Number(data.taxRate || 0),
      shippingFee: Number(data.shippingFee || 0),
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
  const { action, id, value, market, daily, delivery, listing } = el.dataset;
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
  if(action === 'filter-negotiation'){ activeNegotiationLead = value; renderNegotiations(); }
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
  if(action === 'new-customer-profile') customerProfileForm();
  if(action === 'edit-customer-profile') customerProfileForm(findBy('customerProfiles', id));
  if(action === 'delete-customer-profile'){
    const hasOrders = state.customers.some(o => o.customerId === id);
    const message = hasOrders ? 'このお客様を削除します。紐づく注文は「未分類の注文」に残ります。よろしいですか？' : 'このお客様を削除します。よろしいですか？';
    if(confirm(message)){
      state.customerProfiles = state.customerProfiles.filter(p => p.id !== id);
      await save();
      renderAll();
    }
  }
  if(action === 'new-order') orderForm(id);
  if(action === 'edit-order') orderForm(findBy('customers', id)?.customerId, findBy('customers', id));
  if(action === 'new-lead') leadForm();
  if(action === 'edit-lead') leadForm(findBy('leads', id));
  if(action === 'new-negotiation') negotiationForm();
  if(action === 'edit-negotiation') negotiationForm(findBy('negotiations', id));
  if(action === 'delete-negotiation') removeBy('negotiations', id, '商談記録');
  if(action === 'view-negotiation'){ const negotiation = findBy('negotiations', id); if(negotiation) negotiationDetailOverlay(negotiation); }
  if(action === 'new-product') productForm();
  if(action === 'edit-product') productForm(findBy('products', id));
  if(action === 'new-listing') listingForm(id);
  if(action === 'edit-listing'){ const product = findBy('products', id); if(product) listingForm(id, asArray(product.wholesaleListings).find(l => l.id === listing)); }
  if(action === 'delete-listing'){
    const product = findBy('products', id);
    if(product && confirm('この卸し先を削除します。よろしいですか？')){
      product.wholesaleListings = asArray(product.wholesaleListings).filter(l => l.id !== listing);
      await save();
      renderAll();
    }
  }
  if(action === 'new-delivery') productDeliveryForm(id, listing);
  if(action === 'delete-delivery'){
    const product = findBy('products', id);
    const targetListing = product && asArray(product.wholesaleListings).find(l => l.id === listing);
    if(targetListing && confirm('この卸し実績を削除します。よろしいですか？')){
      targetListing.deliveries = asArray(targetListing.deliveries).filter(d => d.id !== delivery);
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
  if(action === 'delete-order') removeBy('customers', id, '注文');
  if(action === 'delete-lead') removeBy('leads', id, '営業先');
  if(action === 'delete-product') removeBy('products', id, '商品');
  if(action === 'delete-idea') removeBy('ideas', id, 'アイデア');
  if(action === 'new-coupon') couponForm();
  if(action === 'edit-coupon') couponForm(findBy('coupons', id));
  if(action === 'delete-coupon') removeBy('coupons', id, 'クーポン');
  if(action === 'mark-coupon-used'){
    const coupon = findBy('coupons', id);
    if(coupon){ coupon.usedAt = new Date().toISOString(); await save(); renderAll(); }
  }
  if(action === 'edit-seller-profile') sellerProfileForm();
  if(action === 'generate-invoice') invoiceHeaderForm();
  if(action === 'edit-invoice-header') invoiceHeaderForm();
  if(action === 'add-invoice-item') invoiceItemForm();
  if(action === 'edit-invoice-item'){ const item = asArray(state.invoiceDraft?.items).find(i => i.id === id); if(item) invoiceItemForm(item); }
  if(action === 'delete-invoice-item'){
    if(state.invoiceDraft && confirm('この明細を削除します。よろしいですか？')){
      state.invoiceDraft.items = asArray(state.invoiceDraft.items).filter(i => i.id !== id);
      await save();
      renderAll();
    }
  }
  if(action === 'clear-invoice'){
    if(confirm('作成中の書類をクリアします。よろしいですか？')){
      state.invoiceDraft = null;
      await save();
      renderAll();
    }
  }
  if(action === 'print-invoice'){ const archive = document.getElementById('invoiceArchive'); if(archive) archive.open = true; window.print(); }
  if(action === 'save-invoice-history') await saveInvoiceToHistory();
  if(action === 'load-invoice-history') loadInvoiceFromHistory(id);
  if(action === 'delete-invoice-history'){
    if(confirm('この書類の履歴を削除します。よろしいですか？')){
      state.invoices = asArray(state.invoices).filter(inv => inv.id !== id);
      await save();
      renderAll();
    }
  }
  if(action === 'export-deliveries-csv') exportDeliveriesCsv();
  if(action === 'new-color') colorPaletteForm();
  if(action === 'edit-color') colorPaletteForm(findBy('colorPalette', id));
  if(action === 'delete-color'){
    const inUse = state.products.some(p => asArray(p.colorIds).includes(id) || p.colorId === id);
    if(confirm(inUse ? 'このカラーは商品で使用中です。削除します。よろしいですか？' : 'このカラーを削除します。よろしいですか？')){
      state.colorPalette = state.colorPalette.filter(c => c.id !== id);
      await save();
      renderAll();
    }
  }
}
let titleBeforePrint = '';
window.addEventListener('beforeprint', () => {
  const archive = document.getElementById('invoiceArchive');
  if(archive) archive.open = true;
  if(state?.invoiceDraft){
    titleBeforePrint = document.title;
    document.title = `${state.invoiceDraft.documentType || '請求書'}_${state.invoiceDraft.number || ''}`;
  }
});
window.addEventListener('afterprint', () => {
  if(titleBeforePrint) document.title = titleBeforePrint;
});

export async function initBrandDashboard(){
  await load();
  document.addEventListener('click', handleClick);
  document.addEventListener('input', event => {
    if(event.target.id === 'couponLookupInput'){
      couponQuery = event.target.value;
      renderCouponLookupResult();
    }
  });
  renderAll();
}


/* ==================================================================
   Navigation
================================================================== */
const pages = document.querySelectorAll('.page');
const navBtns = document.querySelectorAll('.side-nav button');
function goPage(name){
  pages.forEach(p=>p.classList.toggle('active', p.id === 'page-' + name));
  navBtns.forEach(b=>b.classList.toggle('active', b.dataset.page === name));
  window.scrollTo({top:0, behavior:'smooth'});
  closeSidebar();
}
navBtns.forEach(b=> b.addEventListener('click', ()=> goPage(b.dataset.page)));
document.querySelectorAll('[data-page]').forEach(el=>{
  if(el.tagName === 'A') el.addEventListener('click', (e)=>{ e.preventDefault(); goPage(el.dataset.page); });
});

/* ---------------- Mobile hamburger nav ---------------- */
const sidebarEl = document.getElementById('sidebar');
const navOverlay = document.getElementById('navOverlay');
function openSidebar(){ sidebarEl.classList.add('open'); navOverlay.classList.add('show'); }
function closeSidebar(){ sidebarEl.classList.remove('open'); navOverlay.classList.remove('show'); }
document.getElementById('hamburgerBtn').addEventListener('click', openSidebar);
document.getElementById('sideCloseBtn').addEventListener('click', closeSidebar);
navOverlay.addEventListener('click', closeSidebar);


/* ==================================================================
   Date helpers
================================================================== */
function todayKey(d){
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
const now = new Date();
document.getElementById('homeDate').textContent = now.toLocaleDateString('ja-JP', {month:'2-digit', day:'2-digit', weekday:'short'});
const hour = now.getHours();
document.getElementById('greetingText').textContent = hour < 11 ? 'Good Morning' : (hour < 18 ? 'Good Afternoon' : 'Good Evening');

/* ==================================================================
   Toast / loading / error helpers
================================================================== */
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1600);
}
function showErr(el, msg){ el.textContent = msg; el.classList.add('show'); }
function hideErr(el){ el.classList.remove('show'); }
function setLoading(loaderEl, btnEl, on, label, loadingLabel){
  loaderEl.classList.toggle('active', on);
  if(!btnEl) return;
  btnEl.disabled = on;
  const labelSpan = btnEl.querySelector('.btn-label');
  const text = on ? loadingLabel : label;
  if(labelSpan) labelSpan.textContent = text; else btnEl.textContent = text;
}

/* ==================================================================
   Claude API helper
================================================================== */
async function callClaude(systemPrompt, userText){
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userText }]
    })
  });
  if(!response.ok) throw new Error('API error ' + response.status);
  const data = await response.json();
  const text = data.content.map(b => b.text || "").join("\n").trim();
  const clean = text.replace(/^```json\s*|^```\s*|```$/gmi, "").trim();
  return JSON.parse(clean);
}
const BRAND_GUARD = "『個人で』『一人で』作っているといった、法人としての実態と異なる印象を与える表現は使わないでください。";

/* ==================================================================
   AI toggle
================================================================== */
const aiToggle = document.getElementById('aiToggle');
const aiStatusText = document.getElementById('aiStatusText');
aiToggle.addEventListener('change', ()=>{
  aiStatusText.textContent = aiToggle.checked ? 'ON ・ Claudeが生成' : 'OFF ・ テンプレート';
});

/* ==================================================================
   Idea bank
================================================================== */
const IDEAS = [
  {tag:"制作工程", title:"今の一点を、角度を変えて3カット投稿", detail:"商品数が少ない今は『同じ物を毎回別の見せ方で』でOK。正面・使用シーン・ディテールの3カットだけでも新鮮に見える。", tags:["#MofYla","#3Dプリント雑貨"], difficulty:"かんたん", minutes:"約10分", reason:"新しい写真を撮るだけで完結。文章に悩まなくていい日向き。", photo:"正面・使用シーン・ディテールの3カット", effect:"商品の魅力を多角的に伝えられる"},
  {tag:"制作工程", title:"レイヤーが積み上がる様子をタイムラプス風に", detail:"プリンターが1層ずつ形を作っていく様子は初見の人ほど驚く。完成までの時間や使用フィラメントも添えると保存されやすい。", tags:["#3Dプリント","#制作過程"], difficulty:"ふつう", minutes:"約20分", reason:"制作過程は保存されやすい鉄板ネタ。", photo:"造形中のプリンターを動画または連続写真で", effect:"保存数が伸びやすい"},
  {tag:"ブランドの話", title:"なぜ『うさぎ×3Dプリント』という事業を始めたか語る", detail:"立ち上げ期だからこそ効く鉄板ネタ。既存グッズへの不満やうさぎ飼育者の悩みなど、事業を始めたきっかけを一つ選んで書く。", tags:["#ブランドストーリー","#立ち上げ期"], difficulty:"じっくり", minutes:"約30分", reason:"立ち上げ期にしか出せない共感ネタ。", photo:"最初の試作品や設計画面", effect:"ブランドへの共感・愛着が生まれる"},
  {tag:"どうぶつ紹介", title:"製品モデルとして協力してくれているうさぎを紹介", detail:"製品より先に『使用シーンの主役』を知ってもらう回。名前・性格・好きな仕草を一言添えるだけで十分。", tags:["#うさぎのいる暮らし","#MofYla"], difficulty:"かんたん", minutes:"約10分", reason:"動物の写真は反応率が高い定番ネタ。", photo:"うさぎが製品を使っている自然な様子", effect:"新規ユーザーの目に留まりやすい"},
  {tag:"お客様の声", title:"最初にご購入くださった方への感謝を投稿", detail:"数が少ない今こそ、一件一件のお声を丁寧に紹介できる。許可を取った上でスクショや一言コメントを引用。", tags:["#お客様の声","#ありがとうございます"], difficulty:"かんたん", minutes:"約10分", reason:"信頼感を伝えられる、少品目の今こそ効くネタ。", photo:"感想のスクリーンショット（許可を得て）", effect:"購入への後押しになる"},
  {tag:"豆知識", title:"うさぎが物を齧る理由と、齧っても安全な素材の話", detail:"『なぜPLA素材を選んでいるか』の説明にもつながる豆知識ネタ。安全性の根拠は簡潔に。", tags:["#うさぎ雑学","#安全素材"], difficulty:"ふつう", minutes:"約15分", reason:"専門性が伝わり保存されやすい。", photo:"無塗装の質感が分かる接写", effect:"安全性への信頼を積み上げる"},
  {tag:"Q&A", title:"『サイズはどう選べばいい？』によくある質問に回答", detail:"DMやコメントで多い質問をまとめて投稿。次に同じ質問が来たらこの投稿を貼れるようにしておく。", tags:["#よくある質問","#サイズ選び"], difficulty:"かんたん", minutes:"約10分", reason:"よくある質問はストックしておくと後々も使える。", photo:"サイズ比較が伝わる写真", effect:"問い合わせ対応の手間が減る"},
  {tag:"制作工程", title:"塗装なし・フィラメントの色そのままで仕上げる理由", detail:"『無塗装だから齧っても安心』という安全性の話と、素材の質感の魅力を両方伝えられるネタ。", tags:["#無塗装","#安全設計"], difficulty:"ふつう", minutes:"約15分", reason:"安全性とデザイン哲学を同時に語れる。", photo:"素材そのものの質感が分かる接写", effect:"素材へのこだわりが伝わる"},
  {tag:"制作の裏側", title:"『今日の失敗プリント』を正直に見せる", detail:"造形失敗や試行錯誤を見せると、完成品のありがたみと親近感が同時に伝わる。商品数が少なくても毎日書けるネタ。", tags:["#制作の裏側","#試行錯誤"], difficulty:"かんたん", minutes:"約10分", reason:"気負わず書ける日におすすめ。親近感が生まれる。", photo:"失敗した造形物そのまま", effect:"人間味が伝わりフォローの動機になる"},
  {tag:"リクエスト募集", title:"『次に作ってほしい物』を聞いてみる", detail:"ラインナップが少ない今だからこそ、フォロワーの声が次の一点を決める参考になる。アンケート機能で気軽に投票してもらう。", tags:["#リクエスト募集","#次の新作"], difficulty:"かんたん", minutes:"約10分", reason:"フォロワーとの対話が生まれ、開発のヒントにもなる。", photo:"候補となる素材やラフスケッチ", effect:"コメント・保存が増えやすい"},
  {tag:"制作環境紹介", title:"作業スペースやプリンターまわりを見せる", detail:"『どこでどうやって作っているか』は立ち上げ期のブランドならではの興味を引くネタ。作業中の様子を含めて等身大に見せる。", tags:["#制作環境","#3Dプリント"], difficulty:"ふつう", minutes:"約15分", reason:"『どこで作られているか』は興味を引く定番ネタ。", photo:"作業中の机やプリンター周り", effect:"ブランドの背景に親しみが生まれる"},
  {tag:"作業ログ", title:"『今日はここまで進んだ』の記録投稿", detail:"派手な内容がなくても、日々の積み重ねを見せるだけで応援したくなる人が増える。数字や進捗は正直に。", tags:["#今日の制作","#立ち上げ期"], difficulty:"かんたん", minutes:"約5分", reason:"書くことがない日でも成立する最短ネタ。", photo:"作業途中の一枚で十分", effect:"継続していることが伝わる"},
  {tag:"ブランドの話", title:"『MofYla』という名前の由来を紹介", detail:"名前やロゴ、パッケージへのこだわりは一度しか話せない貴重なネタ。まだ話していなければ早めに出しておく。", tags:["#ブランドストーリー","#MofYla"], difficulty:"ふつう", minutes:"約15分", reason:"一度しか話せない貴重なネタ。早めに出しておく。", photo:"ロゴやパッケージ", effect:"ブランドの世界観が伝わる"},
  {tag:"交流", title:"コメントやDMでもらった質問への回答まとめ", detail:"立ち上げ期の今だからこそできる距離の近さが強み。もらったやり取りを匿名で紹介し、感謝も添える。", tags:["#質問回答","#フォロワーとの交流"], difficulty:"ふつう", minutes:"約15分", reason:"距離の近さが伝わる、立ち上げ期ならではのネタ。", photo:"該当する製品の写真", effect:"フォロワーとの関係性が深まる"},
  {tag:"制作紹介", title:"これから挑戦したいこと・目標を語る", detail:"立ち上げ期は『成長を見せる』こと自体がコンテンツになる。等身大の目標を一つ言葉にする。", tags:["#立ち上げ期","#目標"], difficulty:"じっくり", minutes:"約20分", reason:"成長を見せること自体がコンテンツになる。", photo:"今の作業風景や試作品", effect:"応援したい気持ちを引き出せる"},
  {tag:"制作工程", title:"試作段階のラフ（設計図・仮組み）を見せる", detail:"完成品だけでなく途中経過を見せることで、次の投稿への期待値を作れる。CADの画面キャプチャでもOK。", tags:["#設計","#試作段階"], difficulty:"ふつう", minutes:"約15分", reason:"完成品だけでなく過程を見せ期待値を作る。", photo:"CAD画面のキャプチャ", effect:"次の投稿への期待感を作れる"}
];
const CATEGORY_LIST = [...new Set(IDEAS.map(i=>i.tag))];
const dayIndex = Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000);
function renderDailyRabbit(){
  const rabbit = RABBIT_BREEDS[dayIndex % RABBIT_BREEDS.length];
  const nameEl = document.getElementById('dailyRabbitName');
  const descEl = document.getElementById('dailyRabbitDescription');
  const tagsEl = document.getElementById('dailyRabbitTags');
  if(!nameEl || !descEl || !tagsEl) return;
  nameEl.textContent = rabbit.name;
  descEl.textContent = rabbit.features.join(' / ');
  tagsEl.innerHTML = `<span>体長 ${rabbit.length}</span><span>体重 ${rabbit.weight}</span><span>原産国 ${rabbit.origin}</span>`;
}
let recentIdeaTitles = [];

function getRecentCategories(limit){
  const posts = [];
  activityLog.forEach((arr, date)=>{
    arr.forEach(a=>{ if(a.type==='post' && a.status!=='planned') posts.push({date, category:a.category}); });
  });
  posts.sort((a,b)=> b.date.localeCompare(a.date));
  return posts.slice(0, limit).map(p=>p.category).filter(Boolean);
}

function pickRecommendedIdea(excludeTitle){
  const recentCats = getRecentCategories(5);
  let scored = IDEAS.map((idea, idx)=>{
    if(excludeTitle && idea.title === excludeTitle) return {idea, score:-999};
    const usedCount = recentCats.filter(c=>c===idea.tag).length;
    let score = usedCount===0 ? 3 : -usedCount;
    if(idx === (dayIndex % IDEAS.length)) score += 1;
    return {idea, score};
  });
  scored.sort((a,b)=> b.score - a.score);
  const top = scored.filter(s=>s.score > -999).slice(0,3);
  const seed = (dayIndex + (excludeTitle?1:0)) % Math.max(1, top.length);
  return (top[seed] || top[0] || {idea:IDEAS[0]}).idea;
}

function buildReasons(idea){
  const recentCats = getRecentCategories(5);
  const reasons = [];
  const usedCount = recentCats.filter(c=>c===idea.tag).length;
  const otherRecent = [...new Set(recentCats)].filter(c=>c!==idea.tag);
  if(usedCount===0 && otherRecent.length){
    reasons.push('「' + otherRecent.slice(0,2).join('」「') + '」が続いているので、そろそろ違う切り口が効果的です');
  }
  if(idea.reason) reasons.push(idea.reason);
  const dow = new Date().getDay();
  if(idea.tag === '制作工程' && dow === 5) reasons.push('今日は金曜日。週の終わりは制作風景との相性が良い傾向があります');
  if((idea.tag === '交流' || idea.tag === 'お客様の声') && (dow===0 || dow===6)) reasons.push('週末はフォロワーとの交流投稿に反応が集まりやすい傾向があります');
  const streak = computeStreak();
  if(streak >= 3) reasons.push('連続投稿' + streak + '日目です。この調子でリズムを保ちましょう');
  return reasons.slice(0,3);
}

function renderFeatureIdea(idea, viaAI, reasonsOverride){
  document.getElementById('fIdeaTag').textContent = idea.tag;
  document.getElementById('fIdeaIdx').textContent = viaAI ? 'AI提案' : '秘書のおすすめ';
  document.getElementById('fIdeaTitle').textContent = idea.title;
  document.getElementById('fIdeaDetail').textContent = idea.detail;
  document.getElementById('fDifficulty').textContent = idea.difficulty || '-';
  document.getElementById('fMinutes').textContent = idea.minutes || '-';
  const reasons = (reasonsOverride && reasonsOverride.length) ? reasonsOverride : (buildReasons(idea).length ? buildReasons(idea) : [idea.reason || '-']);
  document.getElementById('fReasonList').innerHTML = reasons.map(r=>'<li>'+r+'</li>').join('');
  document.getElementById('fPhoto').textContent = idea.photo || '-';
  document.getElementById('fEffect').textContent = idea.effect || '-';
  const tagWrap = document.getElementById('fTags');
  tagWrap.innerHTML = '';
  (idea.tags||[]).forEach(t=>{ const s = document.createElement('span'); s.textContent = t; tagWrap.appendChild(s); });
  recentIdeaTitles.push(idea.title);
  if(recentIdeaTitles.length > 6) recentIdeaTitles.shift();
  markChecklist('seen', true);
}
function pickAndRenderTodayIdea(){
  renderFeatureIdea(pickRecommendedIdea(), false);
}

document.getElementById('fShuffleBtn').addEventListener('click', async ()=>{
  const err = document.getElementById('fErr'); hideErr(err);
  if(!aiToggle.checked){
    const currentTitle = document.getElementById('fIdeaTitle').textContent;
    renderFeatureIdea(pickRecommendedIdea(currentTitle), false);
    return;
  }
  const loader = document.getElementById('fLoader'); const btn = document.getElementById('fShuffleBtn');
  setLoading(loader, btn, true, '別のネタ', '生成中…');
  try{
    const recentCats = getRecentCategories(5);
    const dow = ['日','月','火','水','木','金','土'][new Date().getDay()];
    const streak = computeStreak();
    const sys = "あなたはうさぎ中心のエキゾチックアニマル向け3Dプリント雑貨ブランド「MofYla」のSNS運用アシスタントです。"
      + "法人内で立ち上げたばかりの新規事業で、商品数もまだ少ないという前提で、"
      + "商品バリエーションに頼らず、ブランドのストーリー・制作工程・試行錯誤・フォロワーとの交流など少品目でも書けるネタを1件提案してください。"
      + "直近使ったカテゴリ・曜日・連続投稿日数を踏まえ、なぜこのネタが今日良いのかを2〜3個の理由として示してください。"
      + BRAND_GUARD
      + '出力は次のJSON形式のみ、説明文なしで返してください： {"tag":"カテゴリ(4文字程度)","title":"見出し(30字以内)","detail":"投稿の切り口(80字以内)","tags":["#タグ1","#タグ2"],"difficulty":"かんたん/ふつう/じっくりのいずれか","minutes":"約◯分","reasons":["理由1(30字以内)","理由2(30字以内)"],"photo":"写真アイデア(30字以内)","effect":"投稿の効果(30字以内)"}';
    const userMsg = "直近で使ったカテゴリ：" + (recentCats.join(' / ') || 'なし')
      + "\n今日の曜日：" + dow + "曜日\n現在の連続投稿日数：" + streak + "日"
      + "\n直近で使ったネタ（重複回避のため）：" + (recentIdeaTitles.join(' / ') || 'なし');
    const idea = await callClaude(sys, userMsg);
    renderFeatureIdea(idea, true, idea.reasons);
  }catch(e){
    showErr(err, 'AI生成に失敗しました。通信状況を確認するか、時間をおいて再試行してください。');
  }finally{
    setLoading(loader, btn, false, '別のネタ', '');
  }
});
document.getElementById('fSkipBtn').addEventListener('click', ()=> document.getElementById('fShuffleBtn').click());
document.getElementById('fWriteBtn').addEventListener('click', ()=>{
  const title = document.getElementById('fIdeaTitle').textContent;
  const detail = document.getElementById('fIdeaDetail').textContent;
  document.getElementById('draftInput').value = title + '。' + detail;
  markChecklist('wrote', true);
  goPage('write');
});
document.getElementById('fPostedBtn').addEventListener('click', async ()=>{
  await markPostedToday();
  const idea = {
    id: Date.now(), date: todayKey(), type:'post',
    title: document.getElementById('fIdeaTitle').textContent,
    platform:'both', category: document.getElementById('fIdeaTag').textContent,
    likes:0, saves:0, comments:0, memo:'簡易記録（Homeから投稿済みにする）', videoUsed:false, status:'posted'
  };
  await saveActivity(idea);
  renderCalendars();
  markChecklist('posted', true);
  toast('今日の投稿を記録しました');
});

/* ==================================================================
   Checklist (persisted per day)
================================================================== */
let checklistState = {seen:false, wrote:false, posted:false, replied:false};
async function loadChecklist(){
  try{
    const res = await window.storage.get('checklist:' + todayKey(), false);
    if(res && res.value) checklistState = JSON.parse(res.value);
  }catch(e){ /* no entry yet */ }
  renderChecklist();
}
function renderChecklist(){
  document.querySelectorAll('.checklist-item').forEach(el=>{
    const task = el.dataset.task;
    el.classList.toggle('done', !!checklistState[task]);
  });
}
async function markChecklist(task, done, bounce){
  checklistState[task] = done;
  renderChecklist();
  if(bounce){
    const box = document.querySelector('.checklist-item[data-task="'+task+'"] .checkbox');
    if(box){ box.classList.remove('bounce'); void box.offsetWidth; box.classList.add('bounce'); }
  }
  try{ await window.storage.set('checklist:' + todayKey(), JSON.stringify(checklistState), false); }catch(e){}
}
document.querySelectorAll('.checklist-item').forEach(el=>{
  el.addEventListener('click', async ()=>{
    const task = el.dataset.task;
    const newState = !checklistState[task];
    markChecklist(task, newState, true);
    if(task === 'posted' && newState){
      await markPostedToday();
      renderCalendars();
    }
  });
});

/* ==================================================================
   Activity log ("ブランド活動の記録") + Calendar + Streak
================================================================== */
const ACTIVITY_TYPES = {
  post:    {label:'投稿',       icon:'ic-pencil'},
  video:   {label:'制作動画',   icon:'ic-video'},
  release: {label:'商品公開',   icon:'ic-gift'},
  event:   {label:'イベント',   icon:'ic-flag'}
};
const STATUS_LABEL = {planned:'予定', draft:'下書き', scheduled:'予約', posted:'投稿済み'};

let postedDays = new Set();
let activityLog = new Map(); // dateKey -> [activity, ...]
let monthlyGoal = 12;

async function loadPostedDays(){
  try{
    const listed = await window.storage.list('postedday:', false);
    const keys = (listed && listed.keys) || [];
    postedDays = new Set(keys.map(k => k.replace('postedday:', '')));
  }catch(e){ postedDays = new Set(); }
}
async function markPostedDate(key){
  postedDays.add(key);
  try{ await window.storage.set('postedday:' + key, 'true', false); }catch(e){}
}
async function markPostedToday(){
  await markPostedDate(todayKey());
}
async function loadActivityLog(){
  const map = new Map();
  try{
    const listed = await window.storage.list('activity:', false);
    const keys = (listed && listed.keys) || [];
    for(const key of keys){
      try{
        const res = await window.storage.get(key, false);
        if(res && res.value){
          const item = JSON.parse(res.value);
          if(item.type === 'reply') continue;
          if(!map.has(item.date)) map.set(item.date, []);
          map.get(item.date).push(item);
          if(item.type === 'post' && item.status !== 'planned') await markPostedDate(item.date);
        }
      }catch(e){ /* skip unreadable entry */ }
    }
  }catch(e){ /* no entries yet */ }
  activityLog = map;
}
async function saveActivity(item){
  try{ await window.storage.set('activity:' + item.id, JSON.stringify(item), false); }
  catch(e){ toast('保存に失敗しました'); }
  if(item.type === 'post' && item.status !== 'planned' && item.date) await markPostedDate(item.date);
  await loadActivityLog();
}
async function deleteActivity(id){
  try{ await window.storage.delete('activity:' + id, false); }catch(e){}
  await loadActivityLog();
}
async function loadMonthlyGoal(){
  try{ const res = await window.storage.get('setting:monthlyGoal', false); if(res && res.value) monthlyGoal = Number(res.value) || 12; }catch(e){}
  const input = document.getElementById('monthlyGoalInput');
  if(input) input.value = monthlyGoal;
}

function computeStreak(){
  let streak = 0;
  let d = new Date();
  while(postedDays.has(todayKey(d))){
    streak++;
    d.setDate(d.getDate()-1);
  }
  return streak;
}
function computeMonthRate(){
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth();
  const daysElapsed = d.getDate();
  let count = 0;
  for(let i=1;i<=daysElapsed;i++){
    const key = y + '-' + String(m+1).padStart(2,'0') + '-' + String(i).padStart(2,'0');
    if(postedDays.has(key)) count++;
  }
  return Math.round((count / daysElapsed) * 100);
}
function computeMonthlyStats(){
  const now2 = new Date();
  const prefix = now2.getFullYear() + '-' + String(now2.getMonth()+1).padStart(2,'0');
  let posts=0, videos=0;
  activityLog.forEach((arr, date)=>{
    if(!date.startsWith(prefix)) return;
    arr.forEach(a=>{
      if(a.status === 'planned') return;
      if(a.type==='post') posts++;
      if(a.videoUsed || a.type==='video') videos++;
    });
  });
  return {posts, videos};
}
const MONTH_LABEL_FMT = (y,m)=> y + '年' + (m+1) + '月';
let fullCalDate = new Date();

function buildMonthGrid(containerId, year, month){
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);
  const firstDow = new Date(year, month, 1).getDay();
  const numDays = new Date(year, month+1, 0).getDate();
  const streakLen = computeStreak();
  const iconMap = {post:'ic-pencil', video:'ic-video', release:'ic-gift', event:'ic-flag'};

  for(let i=0;i<firstDow;i++){
    const pad = document.createElement('div');
    pad.className = 'day-cell pad';
    wrap.appendChild(pad);
  }
  for(let day=1; day<=numDays; day++){
    const d = new Date(year, month, day);
    const key = todayKey(d);
    const acts = activityLog.get(key) || [];
    const hasPlanned = acts.some(a=>a.status==='planned');
    const isPosted = postedDays.has(key) || acts.some(a=>a.type==='post' && a.status!=='planned');

    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if(d > today){
      cell.classList.add('future');
      if(hasPlanned) cell.classList.add('planned');
    }else{
      if(isPosted) cell.classList.add('posted');
      const diffDays = Math.round((today - d) / 86400000);
      if(isPosted && diffDays < streakLen) cell.classList.add('streak');
    }
    if(d.getTime() === today.getTime()) cell.classList.add('today');

    const iconTypes = new Set();
    let popular = false;
    acts.forEach(a=>{
      if(a.status==='planned') return;
      if(a.type==='post') iconTypes.add('post');
      if(a.videoUsed || a.type==='video') iconTypes.add('video');
      if(a.type==='release') iconTypes.add('release');
      if(a.type==='event') iconTypes.add('event');
      if(a.popular || (Number(a.likes)||0) >= 30) popular = true;
    });
    let iconsHtml = [...iconTypes].slice(0,3).map(t=>'<svg class="ic-'+t+'"><use href="#'+iconMap[t]+'"/></svg>').join('');
    if(popular) iconsHtml += '<svg class="ic-popular"><use href="#ic-star"/></svg>';

    cell.innerHTML = '<span class="daynum">'+day+'</span><span class="day-icons">'+iconsHtml+'</span>';
    cell.addEventListener('click', ()=> openDayModal(key));
    wrap.appendChild(cell);
  }
}

function buildWeekStrip(){
  const wrap = document.getElementById('weekStrip');
  if(!wrap) return;
  wrap.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);
  const sunday = new Date(today); sunday.setDate(today.getDate() - today.getDay());
  const wdNames = ['日','月','火','水','木','金','土'];
  for(let i=0;i<7;i++){
    const d = new Date(sunday); d.setDate(sunday.getDate()+i);
    const key = todayKey(d);
    const acts = activityLog.get(key) || [];
    const isPosted = postedDays.has(key) || acts.some(a=>a.type==='post' && a.status!=='planned');
    const cell = document.createElement('div');
    cell.className = 'week-cell' + (isPosted?' posted':'') + (d.getTime()===today.getTime()?' today':'');
    const hasVideo = acts.some(a=>a.videoUsed || a.type==='video');
    cell.innerHTML = '<span class="wd">'+wdNames[i]+'</span><span class="dn">'+d.getDate()+'</span>'
      + '<span class="dotwrap">' + (hasVideo?'<span></span>':'') + '</span>';
    cell.addEventListener('click', ()=> goPage('calendar'));
    wrap.appendChild(cell);
  }
}

function renderPlanAdvice(){
  const el = document.getElementById('planAdviceText');
  if(!el) return;
  const planned = [];
  activityLog.forEach(arr => arr.forEach(a=>{ if(a.status==='planned') planned.push(a); }));
  if(planned.length===0){ el.textContent = '予定を登録すると、投稿の組み立て方を提案します。'; return; }
  const xCount = planned.filter(p=>p.platform==='X').length;
  const igCount = planned.filter(p=>p.platform==='Instagram').length;
  let msg;
  if(igCount >= 3 && xCount === 0) msg = 'Instagram向けの予定が続いています。Xにも1件追加すると、両プラットフォームのバランスが取れます。';
  else if(xCount >= 3 && igCount === 0) msg = 'X向けの予定が続いています。Instagramにも1件追加してみましょう。';
  else msg = planned.length + '件の予定が登録されています。順調に組み立てられています。';
  el.textContent = msg;
}

function renderBalanceAnalysis(){
  const wrap = document.getElementById('balanceBars');
  const adviceEl = document.getElementById('balanceAdviceText');
  if(!wrap || !adviceEl) return;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
  const counts = {};
  let total = 0;
  activityLog.forEach((arr, date)=>{
    if(new Date(date+'T00:00:00') < cutoff) return;
    arr.forEach(a=>{
      if(a.type!=='post' || a.status==='planned') return;
      const cat = a.category || 'その他';
      counts[cat] = (counts[cat]||0) + 1;
      total++;
    });
  });
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(total === 0){
    wrap.innerHTML = '<div class="empty-state">データが増えてくると、ここにカテゴリの偏りが表示されます。</div>';
    adviceEl.textContent = 'まだ分析するデータがありません。投稿履歴が増えると秘書からアドバイスします。';
    return;
  }
  const max = entries[0][1];
  wrap.innerHTML = entries.map(([cat,cnt])=>
    '<div class="balance-bar-row"><span class="catname">'+cat+'</span>'
    + '<div class="balance-bar-track"><div class="balance-bar-fill" style="width:'+Math.round(cnt/max*100)+'%"></div></div>'
    + '<span class="cnt">'+cnt+'</span></div>'
  ).join('');
  const top = entries[0];
  const missing = CATEGORY_LIST.filter(c => !counts[c]);
  let advice;
  if(top[1] / total > 0.4){
    const suggestion = missing.length ? missing[0] : (CATEGORY_LIST.find(c=>c!==top[0]) || top[0]);
    advice = '直近30日は「'+top[0]+'」が多めです（全体の'+Math.round(top[1]/total*100)+'%）。「'+suggestion+'」を1〜2回入れると、ブランドらしいバランスに近づきます。';
  }else if(missing.length){
    advice = '直近30日、「'+missing[0]+'」の投稿がありません。次の投稿の候補にしてみてはどうでしょうか。';
  }else{
    advice = '直近30日はバランス良く投稿できています。この調子を維持しましょう。';
  }
  adviceEl.textContent = advice;
}

function renderCalendars(){
  const streak = computeStreak();
  const rate = computeMonthRate();
  document.getElementById('streakNum').textContent = streak;
  document.getElementById('monthRateNum').textContent = rate + '%';
  document.getElementById('streakNumFull').textContent = streak;
  document.getElementById('monthRateNumFull').textContent = rate + '%';
  document.getElementById('totalPostedNum').textContent = postedDays.size;

  const stats = computeMonthlyStats();
  document.getElementById('postsThisMonthNum').textContent = stats.posts;
  document.getElementById('postsThisMonthNumFull').textContent = stats.posts;
  document.getElementById('videosThisMonthNum').textContent = stats.videos;
  document.getElementById('ideaStockNum').textContent = IDEAS.length + (window.refNoteCount||0);

  const goalRateRaw = monthlyGoal > 0 ? Math.round(stats.posts / monthlyGoal * 100) : 0;
  document.getElementById('goalRateNumFull').textContent = goalRateRaw + '%';
  document.getElementById('goalPostsNumFull').textContent = stats.posts;
  document.getElementById('goalTargetNumFull').textContent = monthlyGoal;
  const ring = document.getElementById('goalRingFg');
  if(ring){
    const circumference = 2 * Math.PI * 27;
    const pct = Math.min(100, goalRateRaw);
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - pct/100);
  }

  buildWeekStrip();
  document.getElementById('calMonthLabel').textContent = MONTH_LABEL_FMT(fullCalDate.getFullYear(), fullCalDate.getMonth());
  buildMonthGrid('calGridFull', fullCalDate.getFullYear(), fullCalDate.getMonth());
  renderPlanAdvice();
  renderBalanceAnalysis();
}
document.getElementById('calPrevBtn').addEventListener('click', ()=>{
  fullCalDate.setMonth(fullCalDate.getMonth()-1);
  renderCalendars();
});
document.getElementById('calNextBtn').addEventListener('click', ()=>{
  fullCalDate.setMonth(fullCalDate.getMonth()+1);
  renderCalendars();
});

/* ---------------- Day detail modal ---------------- */
function fmtDateJp(dateKey){
  const [y,m,d] = dateKey.split('-').map(Number);
  const wd = ['日','月','火','水','木','金','土'][new Date(y,m-1,d).getDay()];
  return y+'年'+m+'月'+d+'日('+wd+')';
}
function openDayModal(dateKey){
  document.getElementById('dayModalTitle').textContent = fmtDateJp(dateKey);
  renderDayModalBody(dateKey);
  document.getElementById('dayModalOverlay').classList.add('show');
}
function closeDayModal(){ document.getElementById('dayModalOverlay').classList.remove('show'); }
document.getElementById('dayModalClose').addEventListener('click', closeDayModal);

function renderActivityRowHtml(item){
  const meta = ACTIVITY_TYPES[item.type] || ACTIVITY_TYPES.post;
  const dateRow = item.status==='planned'
    ? '<div class="mini-field"><label>日付を変更</label><input type="date" value="'+item.date+'" data-field="date"></div>'
    : '';
  const metricsRow = item.type==='post'
    ? '<div class="mini-field-grid"><div class="mini-field"><label>いいね</label><input type="number" min="0" value="'+(item.likes||0)+'" data-field="likes"></div>'
      + '<div class="mini-field"><label>保存数</label><input type="number" min="0" value="'+(item.saves||0)+'" data-field="saves"></div>'
      + '<div class="mini-field"><label>コメント</label><input type="number" min="0" value="'+(item.comments||0)+'" data-field="comments"></div></div>'
    : '';
  return '<div class="activity-row" data-activity-id="'+item.id+'">'
    + '<div class="activity-row-head"><span class="activity-type-badge"><svg class="svgic"><use href="#'+meta.icon+'"/></svg>'+meta.label+(item.status==='planned'?'（予定）':'')+'</span>'
    + '<button class="btn-ghost btn-small btn" data-role="delete-activity"><svg class="icon-sm svgic"><use href="#ic-trash"/></svg></button></div>'
    + '<div class="mini-field"><label>タイトル</label><input type="text" value="'+(item.title||'').replace(/"/g,'&quot;')+'" data-field="title"></div>'
    + '<div class="mini-field-grid">'
    + '<div class="mini-field"><label>媒体</label><select data-field="platform">'
    + ['X','Instagram','both','-'].map(p=>'<option value="'+p+'" '+(item.platform===p?'selected':'')+'>'+(p==='both'?'X+Instagram':p)+'</option>').join('')
    + '</select></div>'
    + '<div class="mini-field"><label>カテゴリ</label><select data-field="category">'
    + CATEGORY_LIST.map(c=>'<option value="'+c+'" '+(item.category===c?'selected':'')+'>'+c+'</option>').join('')
    + '</select></div></div>'
    + '<div class="mini-field-grid"><div class="mini-field"><label>ステータス</label><select data-field="status">'
    + Object.keys(STATUS_LABEL).map(s=>'<option value="'+s+'" '+(item.status===s?'selected':'')+'>'+STATUS_LABEL[s]+'</option>').join('')
    + '</select></div>' + dateRow + '</div>'
    + metricsRow
    + '<label class="metric-check" style="margin:8px 0;"><input type="checkbox" data-field="videoUsed" '+(item.videoUsed?'checked':'')+'> 制作動画あり</label>'
    + '<div class="mini-field"><label>メモ</label><textarea data-field="memo" rows="2">'+(item.memo||'')+'</textarea></div>'
    + '</div>';
}
function activityPlanFormHtml(dateKey, heading){
  return '<div class="activity-row" id="planFormBox">'
    + '<p class="lbl" style="font-family:\'Klee One\',sans-serif;color:var(--sage-deep);margin:0 0 10px;">'+heading+'</p>'
    + '<div class="mini-field-grid">'
    + '<div class="mini-field"><label>種類</label><select id="planType">'
    + Object.entries(ACTIVITY_TYPES).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join('')
    + '</select></div>'
    + '<div class="mini-field"><label>媒体</label><select id="planPlatform"><option value="X">X</option><option value="Instagram">Instagram</option><option value="both">X+Instagram</option><option value="-">-</option></select></div>'
    + '</div>'
    + '<div class="mini-field"><label>タイトル</label><input type="text" id="planTitle" placeholder="例）ヘイラック新色の紹介"></div>'
    + '<div class="mini-field-grid">'
    + '<div class="mini-field"><label>カテゴリ</label><select id="planCategory">'+CATEGORY_LIST.map(c=>'<option value="'+c+'">'+c+'</option>').join('')+'</select></div>'
    + '<div class="mini-field"><label>日付</label><input type="date" id="planDate" value="'+dateKey+'"></div>'
    + '</div>'
    + '<button class="btn btn-sage btn-small" id="planSaveBtn" style="margin-top:6px;"><svg class="icon-sm svgic"><use href="#ic-plus"/></svg><span class="btn-label">保存する</span></button>'
    + '</div>';
}
function wirePlanForm(dateKey){
  const btn = document.getElementById('planSaveBtn');
  if(!btn) return;
  btn.addEventListener('click', async ()=>{
    const type = document.getElementById('planType').value;
    const platform = document.getElementById('planPlatform').value;
    const title = document.getElementById('planTitle').value.trim() || '(タイトル未設定)';
    const category = document.getElementById('planCategory').value;
    const targetDate = document.getElementById('planDate').value || dateKey;
    const today = new Date(); today.setHours(0,0,0,0);
    const isFutureTarget = new Date(targetDate+'T00:00:00') > today;
    const item = {
      id: Date.now(), date: targetDate, type, title, platform, category,
      likes:0, saves:0, comments:0, memo:'', videoUsed:false,
      status: isFutureTarget ? 'planned' : 'posted'
    };
    await saveActivity(item);
    renderCalendars();
    closeDayModal();
    toast('記録しました');
  });
}
function renderDayModalBody(dateKey){
  const body = document.getElementById('dayModalBody');
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateKey + 'T00:00:00');
  const isFuture = d > today;
  const isToday = dateKey === todayKey();
  const activities = (activityLog.get(dateKey) || []).slice();

  let html = '';
  if(activities.length){
    html += activities.map(renderActivityRowHtml).join('');
    html += '<button class="btn-ghost btn-small btn" id="modalAddMoreBtn"><svg class="icon-sm svgic"><use href="#ic-plus"/></svg><span class="btn-label">アクティビティを追加</span></button>';
  }else if(isFuture){
    html += activityPlanFormHtml(dateKey, '投稿を計画する');
  }else if(isToday){
    html += '<div class="cta-empty"><p>今日はまだ何も記録がありません。今日のおすすめネタを作成しますか？</p>'
      + '<button class="btn btn-primary" id="modalWriteBtn"><svg class="icon-sm svgic"><use href="#ic-pencil"/></svg><span class="btn-label">投稿を作成する</span></button></div>';
  }else{
    html += '<div class="cta-empty"><p>この日はまだ記録がありません。</p>'
      + '<button class="btn btn-ghost" id="modalAddPastBtn"><svg class="icon-sm svgic"><use href="#ic-plus"/></svg><span class="btn-label">この日の記録を追加</span></button></div>';
  }
  body.innerHTML = html;

  activities.forEach(item=>{
    const row = body.querySelector('[data-activity-id="'+item.id+'"]');
    if(!row) return;
    row.querySelectorAll('[data-field]').forEach(input=>{
      input.addEventListener('change', async ()=>{
        const f = input.dataset.field;
        item[f] = input.type==='checkbox' ? input.checked : (input.type==='number' ? Number(input.value) : input.value);
        await saveActivity(item);
        renderCalendars();
        renderDayModalBody(dateKey);
      });
    });
    const delBtn = row.querySelector('[data-role="delete-activity"]');
    if(delBtn) delBtn.addEventListener('click', async ()=>{
      await deleteActivity(item.id);
      renderCalendars();
      renderDayModalBody(dateKey);
    });
  });

  const writeBtn = document.getElementById('modalWriteBtn');
  if(writeBtn) writeBtn.addEventListener('click', ()=>{
    const title = document.getElementById('fIdeaTitle').textContent;
    const detail = document.getElementById('fIdeaDetail').textContent;
    draftInput.value = title + '。' + detail;
    markChecklist('wrote', true);
    closeDayModal();
    goPage('write');
  });
  const addPastBtn = document.getElementById('modalAddPastBtn');
  if(addPastBtn) addPastBtn.addEventListener('click', ()=>{
    body.innerHTML = activityPlanFormHtml(dateKey, 'アクティビティを記録');
    wirePlanForm(dateKey);
  });
  const addMoreBtn = document.getElementById('modalAddMoreBtn');
  if(addMoreBtn) addMoreBtn.addEventListener('click', ()=>{
    body.insertAdjacentHTML('beforeend', activityPlanFormHtml(dateKey, 'アクティビティを追加'));
    wirePlanForm(dateKey);
  });
  wirePlanForm(dateKey);
}

/* ==================================================================
   Template generation (non-AI)
================================================================== */
const BRAND_TAGS = ["#MofYla","#3Dプリント雑貨","#エキゾチックアニマル"];
const KEYWORD_TAGS = [
  {k:/うさぎ|ラビット/, tags:["#うさぎ","#うさぎ用品","#うさぎのいる暮らし"]},
  {k:/ハリネズミ/, tags:["#ハリネズミ","#ハリネズミのいる生活"]},
  {k:/モルモット/, tags:["#モルモット","#モルモットのいる暮らし"]},
  {k:/デグー/, tags:["#デグー"]},
  {k:/新作|先行予約|発売/, tags:["#新作","#先行予約"]},
  {k:/セール|割引|キャンペーン/, tags:["#キャンペーン"]},
];
function pickTags(draft, count){
  let tags = [...BRAND_TAGS];
  KEYWORD_TAGS.forEach(({k,tags:t})=>{ if(k.test(draft)) tags.push(...t); });
  return [...new Set(tags)].slice(0, count);
}
function templateX(draft){
  const tags = pickTags(draft, 4);
  const tagLine = tags.join(' ');
  let body = draft.trim();
  const maxBody = 280 - tagLine.length - 4;
  if(body.length > maxBody) body = body.slice(0, Math.max(0,maxBody-1)) + '…';
  return body + '\n\n' + tagLine;
}
function templateIG(draft){
  const sentences = draft.trim().split(/(?<=[。！？])/).filter(Boolean);
  const spaced = sentences.join('\n\n');
  const tags = pickTags(draft, 4);
  return '🐰✨\n\n' + spaced + '\n\n⋆┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈⋆\n\n' + tags.join(' ');
}

/* ==================================================================
   AI generation
================================================================== */
async function getRefContext(){
  if(!document.getElementById('useRefToggle').checked) return '';
  try{
    const listed = await window.storage.list('refnote:', false);
    const keys = ((listed && listed.keys) || []).slice(-5);
    const notes = [];
    for(const key of keys){
      try{ const res = await window.storage.get(key, false); if(res && res.value) notes.push(JSON.parse(res.value).note); }catch(e){}
    }
    return notes.length ? ('参考にしたい過去のネタメモ：' + notes.join(' / ')) : '';
  }catch(e){ return ''; }
}
async function aiGenerate(draft){
  const refCtx = await getRefContext();
  const sys = "あなたはうさぎ中心のエキゾチックアニマル向け3Dプリント雑貨ブランド「MofYla」のSNS運用アシスタントです。"
    + "法人内で立ち上げたばかりの新規事業で、商品数もまだ少ないという前提でトーンを調整してください。"
    + "与えられた下書きメモをもとに、X（旧Twitter、280字以内、簡潔で即時性重視、ハッシュタグ2〜4個）と"
    + "Instagram（絵文字を交えた短めのキャプション、可愛らしく余白のある改行、末尾に区切り線と3〜5個の関連性の高いハッシュタグ）用の投稿文を作成してください。"
    + "大量生産や商品の豊富さを匂わせる表現、誇大表現、医療・健康効果の断定は避け、"
    + "少品目だからこそ一つひとつ丁寧に作っている雰囲気が伝わる、丁寧で親しみやすいトーンにしてください。"
    + BRAND_GUARD
    + '出力は次のJSON形式のみ、説明文なしで返してください： {"x_text":"...","instagram_text":"..."}';
  return await callClaude(sys, "下書きメモ：" + draft + (refCtx ? ("\n" + refCtx) : ''));
}
async function aiRemix(currentX, currentIG, instruction){
  const sys = "あなたはうさぎ中心のエキゾチックアニマル向け3Dプリント雑貨ブランド「MofYla」のSNS運用アシスタントです。"
    + "法人内で立ち上げたばかりの新規事業という前提でトーンを保ってください。"
    + "既存のX用・Instagram用の投稿文を、指定された方向に調整し直してください。文字数制限（X:280字、Instagram目安2200字）は守ってください。"
    + BRAND_GUARD
    + '出力は次のJSON形式のみ、説明文なしで返してください： {"x_text":"...","instagram_text":"..."}';
  const user = "調整方針：" + instruction + "\n\n現在のX文章：" + currentX + "\n\n現在のInstagram文章：" + currentIG;
  return await callClaude(sys, user);
}
function templateRemix(text, kind){
  switch(kind){
    case 'short': return text.length > 60 ? text.slice(0, Math.floor(text.length*0.7)) + '…' : text;
    case 'cute': return '🐰💕 ' + text;
    case 'polite': return text.replace(/だ。/g,'です。').replace(/だ$/,'です') + '\nいつもありがとうございます。';
    case 'lessemoji': return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/ {2,}/g,' ').trim();
    case 'moretags': return text + ' #うさぎ用品 #3Dプリント';
    case 'brand': return text + '\n\n— MofYla Studio';
    default: return text;
  }
}

/* ==================================================================
   Composer wiring
================================================================== */
const draftInput = document.getElementById('draftInput');
const generateBtn = document.getElementById('generateBtn');
const genLoader = document.getElementById('genLoader');
const genErr = document.getElementById('genErr');
const xResult = document.getElementById('xResult');
const igResult = document.getElementById('igResult');
const xCount = document.getElementById('xCount');
const igCount = document.getElementById('igCount');
const remixRow = document.getElementById('remixRow');

function updateCount(el, countEl, limit){
  const n = el.value.length;
  countEl.textContent = n + ' / ' + limit;
  countEl.classList.toggle('warn', n > limit*0.85 && n <= limit);
  countEl.classList.toggle('over', n > limit);
}
xResult.addEventListener('input', ()=>{ updateCount(xResult, xCount, 280); renderPrecheck(); });
igResult.addEventListener('input', ()=>{ updateCount(igResult, igCount, 2200); renderPrecheck(); });

async function runGenerate(){
  hideErr(genErr);
  const draft = draftInput.value.trim();
  if(!draft){ showErr(genErr, '下書きを入力してから生成してください。'); return; }
  if(!aiToggle.checked){
    xResult.value = templateX(draft);
    igResult.value = templateIG(draft);
    finishGenerate(draft);
    return;
  }
  setLoading(genLoader, generateBtn, true, 'X / Instagram 用に生成', '生成中…');
  try{
    const out = await aiGenerate(draft);
    xResult.value = out.x_text || '';
    igResult.value = out.instagram_text || '';
    finishGenerate(draft);
  }catch(e){
    showErr(genErr, 'AI生成に失敗しました。通信状況を確認するか、時間をおいて再試行してください。');
  }finally{
    setLoading(genLoader, generateBtn, false, 'X / Instagram 用に生成', '');
  }
}
function finishGenerate(draft){
  updateCount(xResult, xCount, 280);
  updateCount(igResult, igCount, 2200);
  renderTagPickers(draft);
  renderPrecheck();
  remixRow.style.display = 'flex';
  markChecklist('wrote', true, true);
}
generateBtn.addEventListener('click', runGenerate);

remixRow.addEventListener('click', async (e)=>{
  const btn = e.target.closest('[data-remix]');
  if(!btn) return;
  const kind = btn.dataset.remix;
  if(!aiToggle.checked){
    xResult.value = templateRemix(xResult.value, kind);
    igResult.value = templateRemix(igResult.value, kind);
    updateCount(xResult, xCount, 280); updateCount(igResult, igCount, 2200); renderPrecheck();
    return;
  }
  const labelMap = {short:'もっと短く', cute:'もっと可愛く', polite:'もっと丁寧に', lessemoji:'絵文字を減らす', moretags:'ハッシュタグを増やす', brand:'ブランド感を強く'};
  const prev = btn.textContent;
  btn.disabled = true; btn.textContent = '調整中…';
  try{
    const out = await aiRemix(xResult.value, igResult.value, labelMap[kind]);
    xResult.value = out.x_text || xResult.value;
    igResult.value = out.instagram_text || igResult.value;
    updateCount(xResult, xCount, 280); updateCount(igResult, igCount, 2200); renderPrecheck();
  }catch(err){
    toast('調整に失敗しました');
  }finally{
    btn.disabled = false; btn.textContent = prev;
  }
});

/* Tag picker */
const EXTRA_TAGS = ["#立ち上げ期","#3Dプリンター","#ペット用品","#エキゾチックアニマル"];
function renderTagPickers(draft){
  const xTags = [...new Set([...pickTags(draft, 6), ...EXTRA_TAGS])];
  const igTags = [...new Set([...pickTags(draft, 5), ...EXTRA_TAGS])];
  buildChips('xTagPicker', xTags, xResult, xCount, 280);
  buildChips('igTagPicker', igTags, igResult, igCount, 2200);
}
function buildChips(containerId, tags, textareaEl, countEl, limit){
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  tags.forEach(tag=>{
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tagchip' + (textareaEl.value.includes(tag) ? ' active' : '');
    chip.textContent = tag;
    chip.addEventListener('click', ()=>{
      if(textareaEl.value.includes(tag)){
        textareaEl.value = textareaEl.value.split(tag).join('').replace(/[ 　]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
        chip.classList.remove('active');
      }else{
        textareaEl.value = textareaEl.value.trim() + ' ' + tag;
        chip.classList.add('active');
      }
      updateCount(textareaEl, countEl, limit);
      renderPrecheck();
    });
    wrap.appendChild(chip);
  });
}

/* Pre-post checklist */
const PERSONAL_PHRASES = ['一人で作','個人で作','私が作','自分で作','個人ブランド'];
function renderPrecheck(){
  const grid = document.getElementById('precheckGrid');
  grid.innerHTML = '';
  const xLen = xResult.value.length;
  const bothText = xResult.value + '\n' + igResult.value;
  const hasHashtag = /#\S+/.test(bothText);
  const hasCTA = /(プロフィール|コメント|保存|フォロー|覗いて|見てね|チェック)/.test(bothText);
  const foundPersonal = PERSONAL_PHRASES.find(p => bothText.includes(p));

  addPrecheckRow(grid, xLen>0 && xLen<=280 ? 'ok':'warn', '280文字以内（X）', xLen + '字');
  addPrecheckRow(grid, hasHashtag ? 'ok':'warn', 'ハッシュタグあり', hasHashtag ? 'OK' : '未設定');
  addPrecheckRow(grid, hasCTA ? 'ok':'warn', 'CTA（次の行動）あり', hasCTA ? 'OK' : '未検出');
  addPrecheckRow(grid, foundPersonal ? 'warn':'ok', '法人表現として適切', foundPersonal ? ('「'+foundPersonal+'」を検出') : 'OK');
  addManualPrecheckRow(grid, 'toneCheck', 'ブランドトーンを確認した');
}
function addPrecheckRow(grid, state, label, sub){
  const el = document.createElement('div');
  el.className = 'precheck-item ' + state;
  const iconRef = state === 'ok' ? 'ic-check-circle' : 'ic-alert';
  el.innerHTML = '<span class="icon"><svg class="svgic"><use href="#'+iconRef+'"/></svg></span><span>'+label+'<br><span style="color:var(--ink-faint);font-size:0.72rem;">'+sub+'</span></span>';
  grid.appendChild(el);
}
let manualChecks = {toneCheck:false};
function addManualPrecheckRow(grid, key, label){
  const el = document.createElement('div');
  el.className = 'precheck-item manual ' + (manualChecks[key] ? 'ok' : '');
  const iconRef = manualChecks[key] ? 'ic-square-check' : 'ic-square';
  el.innerHTML = '<span class="icon"><svg class="svgic"><use href="#'+iconRef+'"/></svg></span><span>'+label+'</span>';
  el.addEventListener('click', ()=>{ manualChecks[key] = !manualChecks[key]; renderPrecheck(); });
  grid.appendChild(el);
}
renderPrecheck();

/* ==================================================================
   History (post log + engagement + reaction memo)
================================================================== */
const historyList = document.getElementById('historyList');
const saveHistoryBtn = document.getElementById('saveHistoryBtn');
const REACTIONS = [{key:'good', label:'伸びた'},{key:'normal', label:'普通'},{key:'low', label:'イマイチ'}];

async function loadHistory(){
  historyList.innerHTML = '<div class="empty-state">読み込み中…</div>';
  try{
    const listed = await window.storage.list('post:', false);
    const keys = (listed && listed.keys) || [];
    if(keys.length === 0){
      historyList.innerHTML = '<div class="empty-state">まだ履歴がありません。投稿文を保存するとここに並びます。</div>';
      updateHistStats([]);
      return;
    }
    const items = [];
    for(const key of keys){
      try{ const res = await window.storage.get(key, false); if(res && res.value) items.push(JSON.parse(res.value)); }catch(e){}
    }
    items.sort((a,b)=> b.createdAt - a.createdAt);
    historyList.innerHTML = '';
    items.forEach(renderHistoryItem);
    updateHistStats(items);
  }catch(e){
    historyList.innerHTML = '<div class="empty-state">履歴の読み込みに失敗しました。時間をおいて再度開いてみてください。</div>';
  }
}
function updateHistStats(items){
  document.getElementById('statTotal').textContent = items.length;
  const likesArr = items.map(i=> Number(i.likes)||0);
  const avgLikes = likesArr.length ? Math.round(likesArr.reduce((a,b)=>a+b,0)/likesArr.length) : 0;
  document.getElementById('statLikes').textContent = avgLikes;
  document.getElementById('statSales').textContent = items.filter(i=>i.ledToSale).length;
}
function renderHistoryItem(item){
  const el = document.createElement('details');
  el.className = 'hist-item';
  const dateStr = new Date(item.createdAt).toLocaleDateString('ja-JP', {month:'2-digit', day:'2-digit'});
  el.innerHTML = `
    <summary>
      <div class="litem-meta"><span class="litem-tag">${item.ideaTag||'投稿'}</span><span class="litem-date">${dateStr}</span></div>
      <div class="litem-preview" style="max-width:420px;">${(item.x||'').replace(/\n/g,' ').slice(0,60)}</div>
    </summary>
    <div class="hist-body">
      <div class="hist-text">${(item.x||'').replace(/</g,'&lt;')}</div>
      <div class="metric-grid">
        <div class="metric-field"><label>いいね</label><input type="number" min="0" value="${item.likes||0}" data-field="likes"></div>
        <div class="metric-field"><label>保存数</label><input type="number" min="0" value="${item.saves||0}" data-field="saves"></div>
        <div class="metric-field"><label>コメント</label><input type="number" min="0" value="${item.comments||0}" data-field="comments"></div>
      </div>
      <label class="metric-check"><input type="checkbox" data-field="ledToSale" ${item.ledToSale?'checked':''}> 売上につながった</label>
      <div class="litem-foot" style="margin-top:12px;">
        <div class="reaction-btns"></div>
        <button class="btn-ghost btn-small btn" data-role="delete">削除</button>
      </div>
    </div>
  `;
  const reactionWrap = el.querySelector('.reaction-btns');
  REACTIONS.forEach(r=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.key = r.key;
    btn.className = 'reaction-btn' + (item.reaction === r.key ? ' active ' + r.key : '');
    btn.textContent = r.label;
    btn.addEventListener('click', async (ev)=>{
      ev.preventDefault();
      item.reaction = (item.reaction === r.key) ? null : r.key;
      await persistHistoryItem(item);
      loadHistory();
    });
    reactionWrap.appendChild(btn);
  });
  el.querySelectorAll('[data-field]').forEach(input=>{
    input.addEventListener('change', async ()=>{
      const f = input.dataset.field;
      item[f] = input.type === 'checkbox' ? input.checked : Number(input.value);
      await persistHistoryItem(item);
      updateHistStatsFromStorage();
    });
  });
  el.querySelector('[data-role="delete"]').addEventListener('click', async (ev)=>{
    ev.preventDefault();
    try{ await window.storage.delete('post:' + item.id, false); loadHistory(); }catch(e){ toast('削除に失敗しました'); }
  });
  historyList.appendChild(el);
}
async function persistHistoryItem(item){
  try{ await window.storage.set('post:' + item.id, JSON.stringify(item), false); }catch(e){ toast('保存に失敗しました'); }
}
async function updateHistStatsFromStorage(){
  try{
    const listed = await window.storage.list('post:', false);
    const keys = (listed && listed.keys) || [];
    const items = [];
    for(const key of keys){ try{ const res = await window.storage.get(key, false); if(res && res.value) items.push(JSON.parse(res.value)); }catch(e){} }
    updateHistStats(items);
  }catch(e){}
}
saveHistoryBtn.addEventListener('click', async ()=>{
  if(!xResult.value.trim() && !igResult.value.trim()){ toast('先に投稿文を生成してください'); return; }
  const item = {
    id: Date.now(), createdAt: Date.now(),
    ideaTag: document.getElementById('fIdeaTag').textContent,
    x: xResult.value, ig: igResult.value, reaction: null,
    likes:0, saves:0, comments:0, ledToSale:false
  };
  await persistHistoryItem(item);
  await markPostedToday();
  const platform = (xResult.value.trim() && igResult.value.trim()) ? 'both' : (xResult.value.trim() ? 'X' : 'Instagram');
  await saveActivity({
    id: item.id, date: todayKey(), type:'post',
    title: item.ideaTag, platform, category: item.ideaTag,
    likes:0, saves:0, comments:0, memo: xResult.value.slice(0,60), videoUsed:false, status:'posted'
  });
  renderCalendars();
  markChecklist('posted', true, true);
  toast('履歴に保存しました');
  loadHistory();
});

/* ==================================================================
   Reference notes (ideas library)
================================================================== */
const refList = document.getElementById('refList');
const refUrlInput = document.getElementById('refUrlInput');
const refNoteInput = document.getElementById('refNoteInput');
const addRefBtn = document.getElementById('addRefBtn');
const useRefToggle = document.getElementById('useRefToggle');

async function loadRefSetting(){
  try{ const res = await window.storage.get('setting:useRefNotes', false); useRefToggle.checked = res && res.value === 'true'; }catch(e){}
}
useRefToggle.addEventListener('change', async ()=>{
  try{ await window.storage.set('setting:useRefNotes', String(useRefToggle.checked), false); }catch(e){}
});

const monthlyGoalInput = document.getElementById('monthlyGoalInput');
monthlyGoalInput.addEventListener('change', async ()=>{
  const v = Math.max(1, Number(monthlyGoalInput.value) || 12);
  monthlyGoalInput.value = v;
  monthlyGoal = v;
  try{ await window.storage.set('setting:monthlyGoal', String(v), false); }catch(e){}
  renderCalendars();
});

async function loadRefNotes(){
  refList.innerHTML = '<div class="empty-state">読み込み中…</div>';
  try{
    const listed = await window.storage.list('refnote:', false);
    const keys = (listed && listed.keys) || [];
    window.refNoteCount = keys.length;
    if(keys.length === 0){ refList.innerHTML = '<div class="empty-state">まだメモがありません。</div>'; return; }
    const items = [];
    for(const key of keys){ try{ const res = await window.storage.get(key, false); if(res && res.value) items.push(JSON.parse(res.value)); }catch(e){} }
    items.sort((a,b)=> b.createdAt - a.createdAt);
    refList.innerHTML = '';
    items.forEach(renderRefNote);
  }catch(e){
    refList.innerHTML = '<div class="empty-state">読み込みに失敗しました。時間をおいて再度開いてみてください。</div>';
  }
}
function renderRefNote(item){
  const el = document.createElement('div');
  el.className = 'litem';
  const dateStr = new Date(item.createdAt).toLocaleDateString('ja-JP', {month:'2-digit', day:'2-digit'});
  el.innerHTML = `
    <div class="litem-head">
      <span class="litem-date">${dateStr}</span>
      <button class="btn-ghost btn-small btn" data-role="delete">削除</button>
    </div>
    <div class="litem-preview" style="-webkit-line-clamp:3;"></div>
  `;
  el.querySelector('.litem-preview').textContent = item.note || '';
  if(item.url){
    const a = document.createElement('a');
    a.href = item.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.style.cssText = 'font-family:IBM Plex Mono,monospace;font-size:0.72rem;color:var(--clay);word-break:break-all;';
    a.textContent = item.url;
    el.insertBefore(a, el.querySelector('.litem-preview'));
  }
  el.querySelector('[data-role="delete"]').addEventListener('click', async ()=>{
    try{ await window.storage.delete('refnote:' + item.id, false); loadRefNotes(); }catch(e){ toast('削除に失敗しました'); }
  });
  refList.appendChild(el);
}
addRefBtn.addEventListener('click', async ()=>{
  const note = refNoteInput.value.trim();
  if(!note){ toast('メモを入力してください'); return; }
  const item = { id: Date.now(), createdAt: Date.now(), url: refUrlInput.value.trim(), note: note };
  try{
    await window.storage.set('refnote:' + item.id, JSON.stringify(item), false);
    refUrlInput.value = ''; refNoteInput.value = '';
    toast('メモを追加しました');
    loadRefNotes();
  }catch(e){ toast('保存に失敗しました'); }
});

/* Ideas grid */
const ideaGrid = document.getElementById('ideaGrid');
IDEAS.forEach((idea, idx)=>{
  const card = document.createElement('div');
  card.className = 'idea-card';
  card.innerHTML = `<span class="tag">${idea.tag}</span><h4>${idea.title}</h4><p>${idea.detail}</p>`;
  const btn = document.createElement('button');
  btn.className = 'btn-ghost btn-small btn';
  btn.textContent = 'この案で書く';
  btn.addEventListener('click', ()=>{
    draftInput.value = idea.title + '。' + idea.detail;
    goPage('write');
  });
  card.appendChild(btn);
  ideaGrid.appendChild(card);
});

/* ==================================================================
   Reply composer
================================================================== */
const commentInput = document.getElementById('commentInput');
const replyGenerateBtn = document.getElementById('replyGenerateBtn');
const replyLoader = document.getElementById('replyLoader');
const replyErr = document.getElementById('replyErr');
const replyResult = document.getElementById('replyResult');
const favReplyBtn = document.getElementById('favReplyBtn');

function templateReply(comment){
  const trimmed = comment.trim();
  const quoted = trimmed.length > 30 ? trimmed.slice(0,30) + '…' : trimmed;
  return `コメントありがとうございます🐰✨\n「${quoted}」とのこと、とても嬉しいです！\nまた新しい試作の様子もぜひ見にきてくださいね。`;
}
async function aiGenerateReply(comment){
  const sys = "あなたはうさぎ中心のエキゾチックアニマル向け3Dプリント雑貨ブランド「MofYla」のSNS運用アシスタントです。"
    + "法人内で立ち上げたばかりの新規事業という前提でトーンを調整してください。"
    + "受け取ったコメントに対する、温かみがありつつ丁寧な返信文を1つ作成してください。"
    + "コメントの内容を丸ごと引用せず、要点だけ踏まえて自分の言葉で返してください。"
    + BRAND_GUARD
    + '出力は次のJSON形式のみ、説明文なしで返してください： {"reply":"..."}';
  return await callClaude(sys, "受け取ったコメント：" + comment);
}
async function runReplyGenerate(){
  hideErr(replyErr);
  const comment = commentInput.value.trim();
  if(!comment){ showErr(replyErr, 'コメントを入力してから生成してください。'); return; }
  let replyText;
  if(!aiToggle.checked){
    replyText = templateReply(comment);
    replyResult.value = replyText;
  }else{
    setLoading(replyLoader, replyGenerateBtn, true, '返信文を考える', '生成中…');
    try{
      const out = await aiGenerateReply(comment);
      replyText = out.reply || '';
      replyResult.value = replyText;
    }catch(e){
      showErr(replyErr, 'AI生成に失敗しました。通信状況を確認するか、時間をおいて再試行してください。');
      setLoading(replyLoader, replyGenerateBtn, false, '返信文を考える', '');
      return;
    }
    setLoading(replyLoader, replyGenerateBtn, false, '返信文を考える', '');
  }
  const item = {id: Date.now(), createdAt: Date.now(), comment, reply: replyText, favorite:false};
  try{ await window.storage.set('reply:' + item.id, JSON.stringify(item), false); }catch(e){}
  loadReplies();
}
replyGenerateBtn.addEventListener('click', runReplyGenerate);
favReplyBtn.addEventListener('click', async ()=>{
  if(!replyResult.value.trim()){ toast('先に返信文を生成してください'); return; }
  const item = {id: Date.now(), createdAt: Date.now(), comment: commentInput.value.trim(), reply: replyResult.value, favorite:true};
  try{
    await window.storage.set('reply:' + item.id, JSON.stringify(item), false);
    toast('お気に入りに登録しました');
    loadReplies();
  }catch(e){ toast('保存に失敗しました'); }
});

const favReplyList = document.getElementById('favReplyList');
const replyHistList = document.getElementById('replyHistList');
async function loadReplies(){
  try{
    const listed = await window.storage.list('reply:', false);
    const keys = (listed && listed.keys) || [];
    const items = [];
    for(const key of keys){ try{ const res = await window.storage.get(key, false); if(res && res.value) items.push(JSON.parse(res.value)); }catch(e){} }
    items.sort((a,b)=> b.createdAt - a.createdAt);
    const favs = items.filter(i=>i.favorite);
    favReplyList.innerHTML = favs.length ? '' : '<div class="empty-state">まだお気に入りがありません。</div>';
    favs.forEach(item=> renderReplyItem(favReplyList, item, true));
    replyHistList.innerHTML = items.length ? '' : '<div class="empty-state">まだ履歴がありません。</div>';
    items.forEach(item=> renderReplyItem(replyHistList, item, false));
  }catch(e){
    favReplyList.innerHTML = '<div class="empty-state">読み込みに失敗しました。</div>';
  }
}
function renderReplyItem(container, item, isFavList){
  const el = document.createElement('div');
  el.className = 'litem';
  const dateStr = new Date(item.createdAt).toLocaleDateString('ja-JP', {month:'2-digit', day:'2-digit'});
  el.innerHTML = `
    <div class="litem-head">
      <span class="litem-date">${dateStr}</span>
      <span class="fav-star${item.favorite ? ' active' : ''}" data-role="fav"><svg class="svgic"><use href="#ic-star"/></svg></span>
    </div>
    <div class="litem-preview" style="-webkit-line-clamp:3;">${(item.reply||'').replace(/\n/g,' ')}</div>
    <div class="litem-foot"><span class="hint"></span><button class="btn-ghost btn-small btn" data-role="delete">削除</button></div>
  `;
  el.querySelector('[data-role="fav"]').addEventListener('click', async ()=>{
    item.favorite = !item.favorite;
    try{ await window.storage.set('reply:' + item.id, JSON.stringify(item), false); loadReplies(); }catch(e){}
  });
  el.querySelector('[data-role="delete"]').addEventListener('click', async ()=>{
    try{ await window.storage.delete('reply:' + item.id, false); loadReplies(); }catch(e){ toast('削除に失敗しました'); }
  });
  container.appendChild(el);
}

/* ==================================================================
   Copy buttons (event delegation, works for dynamically added too)
================================================================== */
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('[data-copy]');
  if(!btn) return;
  const el = document.getElementById(btn.dataset.copy);
  if(!el.value){ toast('まだ文章がありません'); return; }
  try{ await navigator.clipboard.writeText(el.value); toast('コピーしました'); }
  catch(e){ el.select(); toast('選択しました（手動でコピーしてください）'); }
});

/* ==================================================================
   Settings: reset all data
================================================================== */
document.getElementById('resetAllBtn').addEventListener('click', async ()=>{
  if(!confirm('保存されているデータを全て削除します。元に戻せません。よろしいですか？')) return;
  try{
    const prefixes = ['post:','refnote:','reply:','postedday:','checklist:','setting:','activity:','brand:'];
    for(const prefix of prefixes){
      const listed = await window.storage.list(prefix, false);
      const keys = (listed && listed.keys) || [];
      for(const key of keys){ await window.storage.delete(key, false); }
    }
    toast('データを削除しました');
    await Promise.all([loadHistory(), loadRefNotes(), loadReplies(), loadPostedDays(), loadChecklist(), loadActivityLog(), loadMonthlyGoal()]);
    renderCalendars();
    pickAndRenderTodayIdea();
    renderDailyRabbit();
  }catch(e){ toast('削除に失敗しました'); }
});

/* ==================================================================
   Init
================================================================== */
async function initApp(){
  await Promise.all([
    loadChecklist(),
    loadPostedDays(),
    loadActivityLog(),
    loadMonthlyGoal(),
    loadHistory(),
    loadRefNotes(),
    loadReplies(),
    loadRefSetting()
  ]);
  renderCalendars();
  pickAndRenderTodayIdea();
  renderDailyRabbit();
}
initApp();

import { Storage } from './storage.js';
import { showToast } from './components/toast.js';
import { renderBars } from './components/chart.js';
import { createWeeklyPlan } from './services/aiPlanner.js';
import { analyzeActivities } from './services/analysis.js';
import { SNS_PROFILES, optimizeForSns, renderTemplate } from './services/templateEngine.js';
import { initBrandDashboard } from './brand.js';
import { RABBIT_BREEDS } from './services/rabbitBreeds.js';

const V2_KEYS = {
  draft: 'draft:current',
  calendar: 'calendar:state',
  ideas: 'ideas:notes',
  reply: 'reply:current',
  settings: 'settings:ai',
  templates: 'templates:items',
  sns: 'settings:sns',
  todayRecommendation: 'home:todayRecommendation',
  analytics: 'analytics:snapshot'
};

function debounce(fn, wait = 2000){
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function safeActivities(){
  const list = [];
  if(window.activityLog && typeof window.activityLog.forEach === 'function'){
    window.activityLog.forEach(items => items.forEach(item => list.push(item)));
  }
  return list;
}

async function saveWholeState(reason = '保存しました'){
  const payload = {
    savedAt: new Date().toISOString(),
    draft: document.getElementById('draftInput')?.value || '',
    replyInput: document.getElementById('replyInput')?.value || '',
    replyResult: document.getElementById('replyResult')?.value || '',
    aiEnabled: document.getElementById('aiToggle')?.checked || false,
    sns: document.querySelector('.sns-tabs button.active')?.dataset.sns || 'X'
  };
  await Storage.set('app:lastState', payload);
  await Storage.set(V2_KEYS.draft, payload.draft);
  await Storage.set(V2_KEYS.reply, { input: payload.replyInput, result: payload.replyResult });
  await Storage.set(V2_KEYS.settings, { aiEnabled: payload.aiEnabled });
  await Storage.set(V2_KEYS.sns, { active: payload.sns, profiles: SNS_PROFILES });
  await Storage.set(V2_KEYS.analytics, analyzeActivities(safeActivities()));
  showToast(reason);
}
const autoSave = debounce(() => saveWholeState('自動保存しました'), 2000);

async function restoreWholeState(){
  const state = await Storage.get('app:lastState', {});
  if(state.draft && document.getElementById('draftInput')) document.getElementById('draftInput').value = state.draft;
  if(state.replyInput && document.getElementById('replyInput')) document.getElementById('replyInput').value = state.replyInput;
  if(state.replyResult && document.getElementById('replyResult')) document.getElementById('replyResult').value = state.replyResult;
  if(typeof state.aiEnabled === 'boolean' && document.getElementById('aiToggle')) document.getElementById('aiToggle').checked = state.aiEnabled;
}

function addSaveButtons(){
  document.querySelectorAll('[data-v2-save]').forEach(btn => btn.remove());
}

function wireAutoSave(){
  ['draftInput','replyInput','replyResult','monthlyGoalInput','refNoteInput'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', autoSave);
  });
  document.addEventListener('change', event => {
    if(event.target.matches('input, textarea, select')) autoSave();
  });
}

function addSnsSwitcher(){
  const draft = document.getElementById('draftInput');
  if(!draft || document.querySelector('.sns-tabs')) return;
  const tabs = document.createElement('div');
  tabs.className = 'sns-tabs';
  tabs.innerHTML = Object.keys(SNS_PROFILES).map((key, index) => `<button type="button" data-sns="${key}" class="${index === 0 ? 'active' : ''}">${key}</button>`).join('');
  draft.parentElement.insertBefore(tabs, draft);
  tabs.addEventListener('click', event => {
    const btn = event.target.closest('button');
    if(!btn) return;
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    const optimized = optimizeForSns(draft.value, btn.dataset.sns);
    const target = document.getElementById('xResult') || document.getElementById('igResult');
    if(target) target.value = optimized;
    autoSave();
  });
}

function ensureAssistantHome(){
  const home = document.getElementById('page-home');
  if(!home || document.getElementById('weeklyAssistantPanel')) return;
  const panel = document.createElement('div');
  panel.className = 'panel section-gap assistant-card';
  panel.id = 'weeklyAssistantPanel';
  panel.innerHTML = `<div class="page-head assistant-head"><div><p class="eyebrow">SNS Secretary</p><h2>AI秘書</h2><p>投稿履歴とジャンルの偏りから、今日のおすすめと来週の予定を提案します。</p></div><button class="btn btn-primary" id="makeWeeklyPlanBtn">来週の投稿を作成</button></div><div id="assistantInsight" class="ai-note"></div><div id="weeklyPlanList" class="assistant-list"></div>`;
  home.appendChild(panel);
  document.getElementById('makeWeeklyPlanBtn').addEventListener('click', renderWeeklyPlan);
  renderAssistantInsight();
}

function renderAssistantInsight(){
  const box = document.getElementById('assistantInsight');
  if(!box) return;
  const analysis = analyzeActivities(safeActivities());
  box.textContent = analysis.notes.join(' ');
}

function renderWeeklyPlan(){
  const list = document.getElementById('weeklyPlanList');
  if(!list) return;
  const plan = createWeeklyPlan(safeActivities());
  list.innerHTML = plan.map(item => `<div class="assistant-plan"><b>${item.date}</b><span>${item.title}<br><small>${item.platform} / ${item.category}</small></span><button class="btn btn-sage btn-small" data-add-plan="${item.id}">登録</button></div>`).join('');
  list.querySelectorAll('[data-add-plan]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = plan.find(p => String(p.id) === btn.dataset.addPlan);
      if(window.saveActivity) await window.saveActivity(item);
      await Storage.set(`calendar:${item.id}`, item);
      if(window.renderCalendars) window.renderCalendars();
      showToast('カレンダーに登録しました');
    });
  });
}

function enhanceAnalytics(){
  const page = document.getElementById('page-analytics');
  if(!page || document.getElementById('v2Dashboard')) return;
  const panel = document.createElement('div');
  panel.className = 'panel section-gap';
  panel.id = 'v2Dashboard';
  panel.innerHTML = `<div class="page-head"><div><p class="eyebrow">Dashboard</p><h2>週別・月別分析</h2></div></div><div class="dashboard-grid"><div class="metric"><b id="v2PostCount">0</b><span>投稿数</span></div><div class="metric"><b id="v2VideoCount">0</b><span>動画投稿数</span></div><div class="metric"><b id="v2PopularCount">0</b><span>人気投稿数</span></div></div><div class="chart-bars" id="categoryChart"></div><div class="ai-note section-gap" id="aiAnalysisText"></div>`;
  page.appendChild(panel);
  refreshAnalytics();
}

function refreshAnalytics(){
  const analysis = analyzeActivities(safeActivities());
  const set = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };
  set('v2PostCount', analysis.posts.length);
  set('v2VideoCount', analysis.videoCount);
  set('v2PopularCount', analysis.popular);
  renderBars(document.getElementById('categoryChart'), analysis.byCategory);
  const text = document.getElementById('aiAnalysisText');
  if(text) text.textContent = analysis.notes.join(' ');
}

const defaultTemplates = [
  { id: 1, name: '商品紹介', category: '商品紹介', body: '{topic}\n\nこだわりは {point} です。\n\n#MofYla' },
  { id: 2, name: '制作動画', category: '制作動画', body: '今日は制作の様子を少しだけ。\n{point}\n\n#MofYla #制作動画' },
  { id: 3, name: 'イベント告知', category: 'イベント告知', body: '{topic} のお知らせです。\n日時や詳細は追ってご案内します。\n\n#MofYla' },
  { id: 4, name: 'うさぎの日常', category: 'うさぎの日常', body: 'うさぎさんとの暮らしに寄り添う小さな工夫。\n{point}\n\n#うさぎのいる暮らし' },
  { id: 5, name: 'お客様紹介', category: 'お客様紹介', body: 'お迎えいただいた方の声をご紹介します。\n{topic}\n\nありがとうございます。' },
  { id: 6, name: 'レビュー紹介', category: 'レビュー紹介', body: 'レビューをいただきました。\n{topic}\n\n励みになります。' },
  { id: 7, name: '豆知識', category: '豆知識', body: '今日の豆知識。\n{topic}\n\nポイント: {point}' }
];
let templates = [];

async function loadTemplates(){
  templates = await Storage.get(V2_KEYS.templates, defaultTemplates);
  renderTemplates();
}
async function saveTemplates(){ await Storage.set(V2_KEYS.templates, templates); }
function renderTemplates(){
  const list = document.getElementById('templateList');
  if(!list) return;
  list.innerHTML = templates.map(item => `<div class="idea-card" data-template-id="${item.id}"><span class="tag">${item.category}</span><h4>${item.name}</h4><p>${item.body.replace(/\n/g,'<br>')}</p><div class="toolbar"><button class="btn btn-sage btn-small" data-use-template>生成</button><button class="btn-ghost btn-small btn" data-edit-template>編集</button><button class="btn-ghost btn-small btn" data-delete-template>削除</button></div></div>`).join('');
}
function wireTemplates(){
  document.getElementById('templateSaveBtn')?.addEventListener('click', async () => {
    const id = Number(document.getElementById('templateName').dataset.editing || Date.now());
    const item = { id, name: document.getElementById('templateName').value || '新規テンプレート', category: document.getElementById('templateCategory').value || '投稿', body: document.getElementById('templateBody').value || '{topic}' };
    templates = templates.filter(t => t.id !== id).concat(item);
    document.getElementById('templateName').dataset.editing = '';
    await saveTemplates(); renderTemplates(); showToast('テンプレートを保存しました');
  });
  document.getElementById('templateGenerateBtn')?.addEventListener('click', () => generateFromTemplate());
  document.getElementById('templateAddBtn')?.addEventListener('click', () => {
    ['templateName','templateCategory','templateBody'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('templateName').dataset.editing = '';
  });
  document.getElementById('templateList')?.addEventListener('click', async event => {
    const card = event.target.closest('[data-template-id]');
    if(!card) return;
    const item = templates.find(t => String(t.id) === card.dataset.templateId);
    if(event.target.closest('[data-use-template]')) generateFromTemplate(item);
    if(event.target.closest('[data-edit-template]')){
      document.getElementById('templateName').value = item.name;
      document.getElementById('templateName').dataset.editing = item.id;
      document.getElementById('templateCategory').value = item.category;
      document.getElementById('templateBody').value = item.body;
    }
    if(event.target.closest('[data-delete-template]')){
      templates = templates.filter(t => t.id !== item.id);
      await saveTemplates(); renderTemplates();
    }
  });
}
function generateFromTemplate(item){
  item = item || templates[0];
  if(!item) return;
  const text = renderTemplate(item.body, { topic: document.getElementById('templateTopic')?.value || item.name, point: document.getElementById('templatePoint')?.value || 'MofYlaらしいやさしい使い心地' });
  const draft = document.getElementById('draftInput');
  if(draft) draft.value = text;
  const x = document.getElementById('xResult');
  if(x) x.value = optimizeForSns(text, 'X');
  if(window.goPage) window.goPage('write');
  autoSave();
}

function wireExport(){
  const preview = document.getElementById('exportPreview');
  const cloudUrlInput = document.getElementById('cloudSyncUrl');
  const cloudKeyInput = document.getElementById('cloudSyncKey');
  const cloudAutoToggle = document.getElementById('cloudAutoUploadToggle');
  const cloudStatus = document.getElementById('cloudSyncStatus');
  const syncPrefixes = ['post:','refnote:','reply:','postedday:','checklist:','setting:','activity:','draft:','calendar:','ideas:','templates:','analytics:','app:','brand:'];
  let downloadedCloudData = null;
  let cloudAutoTimer = null;

  async function collect(prefix = ''){
    const listed = await Storage.list(prefix);
    const entries = listed.values.filter(item => !item.key.startsWith('setting:cloud'));
    return Object.fromEntries(entries.map(item => [item.key, item.value]));
  }
  async function show(data){
    preview.value = JSON.stringify(data, null, 2);
    preview.closest('.export-preview-wrap')?.classList.remove('is-hidden');
    await navigator.clipboard?.writeText(preview.value).catch(() => {});
  }
  function downloadJson(filename, data){
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('JSONファイルをダウンロードしました');
  }
  function setCloudStatus(message){ if(cloudStatus) cloudStatus.textContent = message; }
  function cloudConfig(){
    return {
      url: (cloudUrlInput?.value || '').trim(),
      key: (cloudKeyInput?.value || '').trim()
    };
  }
  function ensureCloudConfig(){
    const cfg = cloudConfig();
    if(!cfg.url || !cfg.key){ showToast('Apps Script URLと同期キーを入力してください'); return null; }
    return cfg;
  }
  async function saveCloudSettings(){
    if(cloudUrlInput) await Storage.set('setting:cloudSyncUrl', cloudUrlInput.value.trim());
    if(cloudKeyInput) await Storage.set('setting:cloudSyncKey', cloudKeyInput.value.trim());
    if(cloudAutoToggle) await Storage.set('setting:cloudAutoUpload', String(cloudAutoToggle.checked));
  }
  async function loadCloudSettings(){
    if(cloudUrlInput) cloudUrlInput.value = await Storage.get('setting:cloudSyncUrl', '');
    if(cloudKeyInput) cloudKeyInput.value = await Storage.get('setting:cloudSyncKey', '');
    if(cloudAutoToggle) cloudAutoToggle.checked = await Storage.get('setting:cloudAutoUpload', 'false') === 'true';
    const uploadedAt = await Storage.get('setting:cloudLastUpload', '');
    const installedAt = await Storage.get('setting:cloudLastInstall', '');
    setCloudStatus(uploadedAt || installedAt ? `最終保存: ${uploadedAt || '-'} / 最終インストール: ${installedAt || '-'}` : '未同期です。Upload/Downloadで別デバイスと共有できます。');
  }
  function jsonpCloud(url){
    return new Promise((resolve, reject) => {
      const callback = 'mofylaCloud_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const cleanup = () => { delete window[callback]; script.remove(); };
      window[callback] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('download failed')); };
      url.searchParams.set('callback', callback);
      script.src = url.toString();
      document.body.appendChild(script);
    });
  }
  function postCloudForm(cfg, payload){
    return new Promise(resolve => {
      const frameName = 'mofylaCloudUploadFrame';
      let frame = document.querySelector('iframe[name="' + frameName + '"]');
      if(!frame){
        frame = document.createElement('iframe');
        frame.name = frameName;
        frame.style.display = 'none';
        document.body.appendChild(frame);
      }
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = cfg.url;
      form.target = frameName;
      form.style.display = 'none';
      const fields = { action:'upload', key:cfg.key, payload };
      Object.entries(fields).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
      setTimeout(() => { form.remove(); resolve(); }, 1200);
    });
  }
  async function uploadCloud(silent = false){
    const cfg = ensureCloudConfig();
    if(!cfg) return false;
    await saveCloudSettings();
    const data = await collect('');
    const payload = JSON.stringify({ app:'MofYla', version:1, savedAt:new Date().toISOString(), data });
    await postCloudForm(cfg, payload);
    const stamp = new Date().toLocaleString('ja-JP');
    await Storage.set('setting:cloudLastUpload', stamp);
    setCloudStatus(`クラウドへ送信しました: ${stamp}。クラウドから取得で保存結果を確認できます。`);
    if(!silent) showToast('クラウドへ送信しました');
    return true;
  }
  async function downloadCloud(){
    const cfg = ensureCloudConfig();
    if(!cfg) return;
    await saveCloudSettings();
    const url = new URL(cfg.url);
    url.searchParams.set('action', 'download');
    url.searchParams.set('key', cfg.key);
    const json = await jsonpCloud(url);
    if(!json.ok) throw new Error(json.error || 'download failed');
    downloadedCloudData = json.payload?.data || json.payload || {};
    await show(downloadedCloudData);
    setCloudStatus(`クラウドから取得しました: ${new Date().toLocaleString('ja-JP')}。内容を確認してからインストールしてください。`);
    showToast('クラウドから取得しました');
  }
  async function installData(data){
    for(const prefix of syncPrefixes){
      const listed = await Storage.list(prefix);
      for(const item of listed.values){
        if(!item.key.startsWith('setting:cloud')) await Storage.remove(item.key);
      }
    }
    for(const [key, value] of Object.entries(data)){
      if(!key.startsWith('setting:cloud')) await Storage.set(key, value);
    }
    const stamp = new Date().toLocaleString('ja-JP');
    await Storage.set('setting:cloudLastInstall', stamp);
    showToast('クラウドデータをインストールしました');
    setCloudStatus(`インストールしました: ${stamp}`);
    setTimeout(() => location.reload(), 600);
  }
  function scheduleCloudAutoUpload(){
    if(!cloudAutoToggle?.checked) return;
    clearTimeout(cloudAutoTimer);
    cloudAutoTimer = setTimeout(() => uploadCloud(true).catch(() => setCloudStatus('自動アップロードに失敗しました。URLと同期キーを確認してください。')), 30000);
  }

  document.getElementById('backupJsonBtn')?.addEventListener('click', async () => downloadJson(`mofyla-backup-${todayKey()}.json`, await collect('')));
  document.getElementById('exportSettingsBtn')?.addEventListener('click', async () => downloadJson(`mofyla-settings-${todayKey()}.json`, await collect('settings')));
  document.getElementById('exportHistoryBtn')?.addEventListener('click', async () => downloadJson(`mofyla-history-${todayKey()}.json`, await collect('activity:')));
  document.getElementById('restoreJsonBtn')?.addEventListener('click', () => document.getElementById('restoreFileInput').click());
  document.getElementById('restoreFileInput')?.addEventListener('change', async event => {
    const file = event.target.files[0];
    if(!file) return;
    const data = JSON.parse(await file.text());
    await installData(data.data || data);
  });
  document.getElementById('cloudUploadBtn')?.addEventListener('click', () => uploadCloud(false).catch(err => { showToast('クラウド保存に失敗しました'); setCloudStatus(err.message); }));
  document.getElementById('cloudDownloadBtn')?.addEventListener('click', () => downloadCloud().catch(err => { showToast('クラウド取得に失敗しました'); setCloudStatus(err.message); }));
  document.getElementById('cloudInstallBtn')?.addEventListener('click', async () => {
    let data = downloadedCloudData;
    if(!data && preview.value.trim()){
      const parsed = JSON.parse(preview.value);
      data = parsed.data || parsed;
    }
    if(!data){ showToast('先にクラウドから取得してください'); return; }
    if(!confirm('取得したクラウドデータをこの端末にインストールします。現在のローカルデータは上書きされます。よろしいですか？')) return;
    await installData(data);
  });
  [cloudUrlInput, cloudKeyInput, cloudAutoToggle].forEach(el => el?.addEventListener('change', saveCloudSettings));
  document.addEventListener('change', event => { if(!event.target.closest('#page-export')) scheduleCloudAutoUpload(); });
  document.addEventListener('input', event => { if(!event.target.closest('#page-export')) scheduleCloudAutoUpload(); });
  loadCloudSettings();
}

const undoStack = [];
const redoStack = [];
function snapshot(){
  return { draft: document.getElementById('draftInput')?.value || '', reply: document.getElementById('replyResult')?.value || '' };
}
function applySnapshot(s){
  if(document.getElementById('draftInput')) document.getElementById('draftInput').value = s.draft;
  if(document.getElementById('replyResult')) document.getElementById('replyResult').value = s.reply;
}
function wireUndoRedo(){
  document.addEventListener('input', event => {
    if(!event.target.matches('textarea,input')) return;
    undoStack.push(snapshot());
    if(undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
  });
  document.addEventListener('keydown', event => {
    if(!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    if(event.shiftKey){
      const next = redoStack.pop();
      if(next){ undoStack.push(snapshot()); applySnapshot(next); }
    }else{
      const prev = undoStack.pop();
      if(prev){ redoStack.push(snapshot()); applySnapshot(prev); }
    }
  });
}

function exposeLegacyHooks(){
  if(typeof renderCalendars === 'function') window.renderCalendars = renderCalendars;
  if(typeof saveActivity === 'function') window.saveActivity = saveActivity;
  if(typeof activityLog !== 'undefined') window.activityLog = activityLog;
  if(typeof goPage === 'function') window.goPage = goPage;
}

window.addEventListener('DOMContentLoaded', async () => {
  exposeLegacyHooks();
  await restoreWholeState();
  await initBrandDashboard();
  addSaveButtons();
  wireAutoSave();
  addSnsSwitcher();
  ensureAssistantHome();
  enhanceAnalytics();
  await loadTemplates();
  wireTemplates();
  wireExport();
  wireUndoRedo();
  setInterval(() => { renderAssistantInsight(); refreshAnalytics(); }, 3000);
});











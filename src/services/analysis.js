const CATEGORIES = ['商品紹介','制作動画','イベント告知','うさぎの日常','お客様紹介','レビュー紹介','豆知識'];

export function analyzeActivities(activities = []){
  const posts = activities.filter(a => a.type === 'post' || a.status === 'posted');
  const byCategory = new Map();
  for(const item of posts){
    const category = item.category || item.title || '未分類';
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
  }
  const sorted = [...byCategory.entries()].sort((a,b) => b[1] - a[1]);
  const top = sorted[0];
  const videoCount = posts.filter(a => a.videoUsed || /動画|制作/.test(`${a.title || ''}${a.category || ''}`)).length;
  const popular = posts.filter(a => Number(a.likes || 0) + Number(a.saves || 0) + Number(a.comments || 0) >= 10).length;
  const notes = [];
  if(top && posts.length >= 3 && top[1] / posts.length > 0.45) notes.push(`最近「${top[0]}」が多めです。`);
  if(videoCount < Math.max(1, Math.floor(posts.length * 0.2))) notes.push('制作動画が不足しています。工程や手元の短い動画を入れるとバランスが良くなります。');
  if(!notes.length) notes.push('投稿ジャンルの偏りは大きくありません。この調子でやさしく続けられます。');
  return { posts, byCategory: Object.fromEntries(byCategory), videoCount, popular, notes };
}


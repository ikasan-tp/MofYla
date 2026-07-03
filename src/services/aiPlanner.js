import { analyzeActivities } from './analysis.js';

const PLAN_CATEGORIES = ['商品紹介','制作動画','豆知識','うさぎの日常','レビュー紹介','イベント告知','お客様紹介'];

export function createWeeklyPlan(activities = [], startDate = new Date()){
  const analysis = analyzeActivities(activities);
  const used = new Set(Object.keys(analysis.byCategory).slice(0, 2));
  const base = PLAN_CATEGORIES.filter(c => !used.has(c)).concat(PLAN_CATEGORIES.filter(c => used.has(c)));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index + 1);
    const category = base[index % base.length];
    return {
      id: Date.now() + index,
      date: date.toISOString().slice(0, 10),
      type: category === '制作動画' ? 'video' : 'post',
      title: `${category}の投稿案`,
      platform: index % 2 ? 'Instagram' : 'X',
      category,
      status: 'planned',
      memo: 'AI秘書の週間提案',
      likes: 0,
      saves: 0,
      comments: 0,
      videoUsed: category === '制作動画'
    };
  });
}

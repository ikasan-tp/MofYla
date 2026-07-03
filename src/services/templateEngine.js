export const SNS_PROFILES = {
  X: { label: 'X', max: 280, tagCount: 4, breaks: 'compact' },
  Instagram: { label: 'Instagram', max: 2200, tagCount: 8, breaks: 'spacious' },
  Threads: { label: 'Threads', max: 500, tagCount: 4, breaks: 'natural' },
  Bluesky: { label: 'Bluesky', max: 300, tagCount: 3, breaks: 'compact' }
};

export function optimizeForSns(text, sns = 'X', tags = ['#MofYla']){
  const profile = SNS_PROFILES[sns] || SNS_PROFILES.X;
  const tagLine = tags.slice(0, profile.tagCount).join(' ');
  let body = String(text || '').trim();
  if(profile.breaks === 'spacious') body = body.replace(/。/g, '。\n\n');
  if(profile.breaks === 'compact') body = body.replace(/\n{3,}/g, '\n\n');
  const reserve = tagLine ? tagLine.length + 2 : 0;
  if(body.length + reserve > profile.max) body = body.slice(0, Math.max(0, profile.max - reserve - 1)) + '…';
  return tagLine ? `${body}\n\n${tagLine}` : body;
}

export function renderTemplate(template, data = {}){
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => data[key] || '');
}

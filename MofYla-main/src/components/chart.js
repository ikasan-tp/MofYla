export function renderBars(container, data){
  if(!container) return;
  const max = Math.max(1, ...Object.values(data));
  container.innerHTML = Object.entries(data).map(([label, value]) => `<div class="chart-row"><span>${label}</span><div class="chart-track"><div class="chart-fill" style="width:${Math.round(value / max * 100)}%"></div></div><b>${value}</b></div>`).join('');
}

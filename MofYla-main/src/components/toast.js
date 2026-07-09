export function showToast(message){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = message;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1600);
}

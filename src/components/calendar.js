export function enableCalendarDrag({ getItem, moveItem }){
  document.addEventListener('dragstart', event => {
    const row = event.target.closest?.('[data-activity-id]');
    if(!row) return;
    event.dataTransfer.setData('text/plain', row.dataset.activityId);
  });
  document.addEventListener('dragover', event => {
    const target = event.target.closest?.('[data-date]');
    if(target){ event.preventDefault(); target.classList.add('drop-target'); }
  });
  document.addEventListener('dragleave', event => event.target.closest?.('[data-date]')?.classList.remove('drop-target'));
  document.addEventListener('drop', async event => {
    const target = event.target.closest?.('[data-date]');
    if(!target) return;
    event.preventDefault();
    target.classList.remove('drop-target');
    const id = event.dataTransfer.getData('text/plain');
    const item = getItem(id);
    if(item) await moveItem(item, target.dataset.date);
  });
}

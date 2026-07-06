const FILE_NAME = 'mofyla-sync.json';

function jsonOutput(obj, callback) {
  const text = callback
    ? `${callback}(${JSON.stringify(obj)});`
    : JSON.stringify(obj);
  return ContentService
    .createTextOutput(text)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function getExpectedKey() {
  return PropertiesService.getScriptProperties().getProperty('SYNC_KEY') || '';
}

function authorize(key) {
  const expected = getExpectedKey();
  return expected && key && key === expected;
}

function findOrCreateFile() {
  const files = DriveApp.getFilesByName(FILE_NAME);
  if (files.hasNext()) return files.next();
  return DriveApp.createFile(FILE_NAME, JSON.stringify({ app: 'MofYla', version: 1, savedAt: '', data: {} }), MimeType.PLAIN_TEXT);
}

function doGet(e) {
  const action = e.parameter.action || 'download';
  const key = e.parameter.key || '';
  const callback = e.parameter.callback || '';
  if (!authorize(key)) return jsonOutput({ ok: false, error: 'unauthorized' }, callback);
  if (action !== 'download') return jsonOutput({ ok: false, error: 'unknown action' }, callback);

  const file = findOrCreateFile();
  const text = file.getBlob().getDataAsString('UTF-8');
  return jsonOutput({ ok: true, updatedAt: file.getLastUpdated().toISOString(), payload: JSON.parse(text || '{}') }, callback);
}

function doPost(e) {
  const action = e.parameter.action || '';
  const key = e.parameter.key || '';
  if (!authorize(key)) return jsonOutput({ ok: false, error: 'unauthorized' });
  if (action !== 'upload') return jsonOutput({ ok: false, error: 'unknown action' });

  const payload = e.parameter.payload || '{}';
  JSON.parse(payload);
  const file = findOrCreateFile();
  file.setContent(payload);
  return jsonOutput({ ok: true, updatedAt: file.getLastUpdated().toISOString() });
}


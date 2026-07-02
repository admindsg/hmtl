const SPREADSHEET_ID = '14K2jWXMQDm0UXPtCgaK6gcFQkAFjJpXBmUT8MLxKs7A';
const COMPLETED_SHEET_NAME = 'Hub Completed Tasks';

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const data = getCompletedTaskData_();
  const payload = JSON.stringify({
    ok: true,
    completedTaskIds: data.completedTaskIds,
    updatedAt: new Date().toISOString()
  });

  if (params.callback) {
    return ContentService
      .createTextOutput(`${params.callback}(${payload});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const payload = parsePayload_(e);
  const taskId = String(payload.taskId || payload['Task ID'] || '').trim();
  const taskTitle = String(payload.taskTitle || payload['Task title'] || '').trim();

  if (!taskId) {
    return json_({ ok: false, error: 'Missing taskId' });
  }

  const sheet = getCompletedSheet_();
  const existingIds = getCompletedTaskIdsFromSheet_(sheet);

  if (!existingIds.has(taskId)) {
    sheet.appendRow([
      new Date(),
      taskId,
      taskTitle,
      String(payload.owner || payload.Owner || '').trim(),
      String(payload.approves || payload.Approves || '').trim(),
      String(payload.page || payload.Page || '').trim(),
      String(payload.userAgent || payload['User Agent'] || '').trim(),
      'Confirmed complete from Hub'
    ]);
  }

  return json_({
    ok: true,
    completedTaskIds: Array.from(getCompletedTaskIdsFromSheet_(sheet)),
    updatedAt: new Date().toISOString()
  });
}

function getCompletedTaskData_() {
  const sheet = getCompletedSheet_();
  return {
    completedTaskIds: Array.from(getCompletedTaskIdsFromSheet_(sheet))
  };
}

function getCompletedSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(COMPLETED_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(COMPLETED_SHEET_NAME);
    sheet.appendRow([
      'Completed At',
      'Task ID',
      'Task Title',
      'Owner',
      'Approves',
      'Page',
      'User Agent',
      'Status'
    ]);
  }

  return sheet;
}

function getCompletedTaskIdsFromSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set();

  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  return new Set(values.flat().map(value => String(value).trim()).filter(Boolean));
}

function parsePayload_(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    const contents = e.postData.contents;
    try {
      return JSON.parse(contents);
    } catch (error) {
      return parseQueryString_(contents);
    }
  }

  return e.parameter || {};
}

function parseQueryString_(source) {
  return String(source || '').split('&').reduce((acc, pair) => {
    const [rawKey, rawValue = ''] = pair.split('=');
    if (!rawKey) return acc;
    acc[decodeURIComponent(rawKey.replace(/\+/g, ' '))] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    return acc;
  }, {});
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

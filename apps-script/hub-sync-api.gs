/*
DSG Hub Sync API
Bound Google Apps Script for the DSG Leadership Cockpit.

Purpose:
- Hub users can click Pull from Cockpit without running the agent.
- Confirmed Hub completions can write directly into Source Inbox and Action Tracker.
- Completion emails can stay in place as a backup/audit signal.

Install:
1. Open the DSG Leadership Cockpit spreadsheet from the admin account.
2. Go to Extensions > Apps Script.
3. Replace the Hub sync .gs file with this full script.
4. Set syncKey below to a private phrase.
5. Deploy as a Web App: Execute as Me; access Anyone with the link.
6. In the Hub, click Set Cockpit Sync URL and paste:
   WEB_APP_URL?key=YOUR_KEY
*/

const DSG_HUB_SYNC_CONFIG = {
  syncKey: 'DSG-HUB-PRIVATE',
  actionTrackerSheetName: 'Action Tracker',
  sourceInboxSheetName: 'Source Inbox',
  completionsSheetName: 'Hub Completions',
  inactiveStatuses: ['complete', 'completed', 'confirmed complete', 'archived', 'sent', 'superseded', 'resolved', 'parked', 'deferred'],
  completionStatus: 'Complete',
  completionActiveValue: 'No'
};

function dsgHubSyncOnOpen_() {
  SpreadsheetApp.getUi()
    .createMenu('DSG Hub Sync')
    .addItem('Show setup note', 'showHubSyncSetupNote')
    .addItem('Preview Hub data', 'previewHubData')
    .addToUi();
}

function showHubSyncSetupNote() {
  SpreadsheetApp.getUi().alert(
    'Deploy this Apps Script project as a Web App. Use Execute as Me and access Anyone with the link. ' +
    'Paste the Web App URL into the Hub using Set Cockpit Sync URL. Add ?key=YOUR_KEY to the URL.'
  );
}

function previewHubData() {
  const payload = buildHubData_();
  SpreadsheetApp.getUi().alert(
    'Hub preview: ' + payload.tasks.length + ' active task(s), ' +
    payload.completedTaskIds.length + ' completed hidden task id(s).'
  );
  return payload;
}

function doGet(e) {
  const params = getParams_(e);
  const auth = authorize_(params);
  if (!auth.ok) return jsonOutput_(auth, params.callback);

  if (params.action !== 'hubData') {
    return jsonOutput_({ ok: false, error: 'Unsupported action. Use action=hubData.' }, params.callback);
  }

  return jsonOutput_(buildHubData_(), params.callback);
}

function doPost(e) {
  const params = getParams_(e);
  const auth = authorize_(params);
  if (!auth.ok) return jsonOutput_(auth);

  if (params.action !== 'completeTask') {
    return jsonOutput_({ ok: false, error: 'Unsupported action. Use action=completeTask.' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return jsonOutput_({ ok: false, error: 'Another Hub completion write is already running.' });
  }

  try {
    const completion = normalizeCompletion_(params);
    appendHubCompletion_(completion);
    appendSourceInboxCompletion_(completion);
    const trackerResult = updateActionTrackerCompletion_(completion);
    return jsonOutput_({ ok: true, trackerResult: trackerResult });
  } catch (err) {
    return jsonOutput_({ ok: false, error: err && err.message ? err.message : String(err) });
  } finally {
    lock.releaseLock();
  }
}

function buildHubData_() {
  const sheet = getSpreadsheet_().getSheetByName(DSG_HUB_SYNC_CONFIG.actionTrackerSheetName);
  if (!sheet) throw new Error('Missing sheet: ' + DSG_HUB_SYNC_CONFIG.actionTrackerSheetName);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { ok: true, updatedAt: new Date().toISOString(), tasks: [], completedTaskIds: [], resources: [], meetings: [] };
  }

  const headers = buildHeaderMap_(values[0]);
  const tasks = [];
  const completedTaskIds = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const action = getValue_(row, headers, 'Action') || getValue_(row, headers, 'Task');
    if (!action) continue;

    const taskId = getValue_(row, headers, 'Hub Task ID') || slugify_(action);
    const status = getValue_(row, headers, 'Status');
    const active = getValue_(row, headers, 'Active?');

    if (isInactiveStatus_(status) || lower_(active) === 'no') {
      completedTaskIds.push(taskId);
      continue;
    }

    tasks.push(rowToHubTask_(row, headers, rowIndex + 1, taskId, action));
  }

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    tasks: tasks,
    completedTaskIds: completedTaskIds,
    resources: [],
    meetings: []
  };
}

function rowToHubTask_(row, headers, rowNumber, taskId, action) {
  const owner = getValue_(row, headers, 'Owner') || 'Ask Andrew';
  const workstream = getValue_(row, headers, 'Parent Workstream') || getValue_(row, headers, 'Workstream') || getValue_(row, headers, 'Decision Lane') || 'Team Operations';
  const source = getValue_(row, headers, 'Source');
  const definitionOfDone = getValue_(row, headers, 'Definition of Done');
  const blocker = getValue_(row, headers, 'Blocker / Risk');
  const nextStep = getValue_(row, headers, 'Next Step');
  const notes = getValue_(row, headers, 'Notes');
  const textForInference = action + ' ' + source + ' ' + workstream;

  return {
    id: taskId,
    title: clean_(action),
    department: normalizeDepartment_(workstream),
    category: getValue_(row, headers, 'Decision Lane') || getValue_(row, headers, 'Task Level') || workstream,
    project: getValue_(row, headers, 'Parent Task') || workstream,
    status: getValue_(row, headers, 'Status') || 'Needs Review',
    priority: getValue_(row, headers, 'Priority') || 'Medium',
    owner: owner,
    support: 'Use Cockpit row owner/support notes if assigned',
    approves: inferApprover_(owner, workstream),
    due: getValue_(row, headers, 'Due') || getValue_(row, headers, 'Timing Signal') || 'Ask',
    tool: inferTool_(textForInference),
    audience: inferAudience_(workstream),
    deliverable: definitionOfDone || nextStep || 'Complete the Action Tracker outcome and record evidence.',
    saveFinalIn: inferSaveLocation_(workstream),
    context: blocker || notes || source || 'Pulled from the DSG Leadership Cockpit Action Tracker.',
    nextSteps: buildSteps_(nextStep, definitionOfDone, source),
    requiredEvidence: definitionOfDone || 'Completion evidence posted from the Hub or saved in the linked source record.',
    verification1: owner + ' verifies the work product or operational outcome is actually complete.',
    verification2: inferApprover_(owner, workstream) + ' confirms the task can close.',
    cockpitBacklink: 'Action Tracker row ' + rowNumber + (source ? '; ' + source : ''),
    links: inferResourceIds_(textForInference),
    prompt: buildPrompt_(action, workstream, definitionOfDone, source)
  };
}

function normalizeCompletion_(params) {
  const taskId = clean_(params.taskId);
  const title = clean_(params.title);
  if (!taskId && !title) throw new Error('Completion needs a taskId or title.');

  return {
    timestamp: new Date(),
    taskId: taskId,
    title: title || taskId,
    department: clean_(params.department),
    owner: clean_(params.owner),
    completedAt: clean_(params.completedAt) || new Date().toISOString(),
    cockpitBacklink: clean_(params.cockpitBacklink),
    page: clean_(params.page),
    source: clean_(params.source) || 'DSG Communications Hub',
    evidence: 'Confirmed finished from the DSG Communications Hub completion button.',
    verification1: 'Hub user confirmed task finished.',
    verification2: 'Hub completion confirmation accepted.',
    closureNote: 'Marked completed from Hub; remove from active Hub view.'
  };
}

function appendHubCompletion_(completion) {
  const sheet = getOrCreateSheet_(DSG_HUB_SYNC_CONFIG.completionsSheetName, [
    'Timestamp', 'Task ID', 'Title', 'Department', 'Owner', 'Completed At', 'Cockpit Backlink', 'Page', 'Source',
    'Evidence', 'Verification 1', 'Verification 2', 'Closure Note'
  ]);

  sheet.appendRow([
    completion.timestamp,
    completion.taskId,
    completion.title,
    completion.department,
    completion.owner,
    completion.completedAt,
    completion.cockpitBacklink,
    completion.page,
    completion.source,
    completion.evidence,
    completion.verification1,
    completion.verification2,
    completion.closureNote
  ]);
}

function appendSourceInboxCompletion_(completion) {
  const sheet = getSpreadsheet_().getSheetByName(DSG_HUB_SYNC_CONFIG.sourceInboxSheetName);
  if (!sheet) return;

  const values = sheet.getDataRange().getValues();
  if (!values.length) return;

  const headers = buildHeaderMap_(values[0]);
  const row = new Array(values[0].length).fill('');

  setRowValue_(row, headers, 'Intake Timestamp', completion.timestamp);
  setRowValue_(row, headers, 'Source Type', 'Hub completion');
  setRowValue_(row, headers, 'Source Title / Subject', completion.title);
  setRowValue_(row, headers, 'Thread / Context Date Range', completion.completedAt);
  setRowValue_(row, headers, 'Summary', 'Task was marked finished in the Hub and should be treated as completed/closed unless re-added intentionally.');
  setRowValue_(row, headers, 'Extracted Task / Decision / Follow-Up', 'Close Hub task: ' + completion.title);
  setRowValue_(row, headers, 'Suggested Destination Tab', 'Action Tracker');
  setRowValue_(row, headers, 'Urgency', 'High');
  setRowValue_(row, headers, 'Confidence', 'High');
  setRowValue_(row, headers, 'Currentness Status', 'Resolved');
  setRowValue_(row, headers, 'Source Link / Reference', completion.cockpitBacklink || completion.page || completion.taskId);
  setRowValue_(row, headers, 'Notes', completion.evidence + ' Verification 1: ' + completion.verification1 + ' Verification 2: ' + completion.verification2 + '. Page: ' + completion.page);
  setRowValue_(row, headers, 'Agent Action', 'Write-back');

  sheet.appendRow(row);
}

function updateActionTrackerCompletion_(completion) {
  const sheet = getSpreadsheet_().getSheetByName(DSG_HUB_SYNC_CONFIG.actionTrackerSheetName);
  if (!sheet) return { updated: false, reason: 'Missing Action Tracker sheet' };

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { updated: false, reason: 'Action Tracker has no task rows' };

  const headers = buildHeaderMap_(values[0]);
  const rowIndex = findTrackerRow_(values, headers, completion);
  if (!rowIndex) return { updated: false, reason: 'No matching Action Tracker row found' };

  const rowNumber = rowIndex + 1;

  writeIfHeader_(sheet, rowNumber, headers, 'Status', DSG_HUB_SYNC_CONFIG.completionStatus);
  writeIfHeader_(sheet, rowNumber, headers, 'Active?', DSG_HUB_SYNC_CONFIG.completionActiveValue);
  writeIfHeader_(sheet, rowNumber, headers, 'Review Flag', 'Closed from Hub');
  writeIfHeader_(sheet, rowNumber, headers, 'Attention Flag', 'Completed from Hub');
  appendIfHeader_(sheet, rowNumber, headers, 'Source', 'Hub completion ' + completion.completedAt + ': ' + (completion.page || completion.source));
  appendIfHeader_(sheet, rowNumber, headers, 'Notes', completion.closureNote + ' Evidence: ' + completion.evidence + ' Verification 1: ' + completion.verification1 + ' Verification 2: ' + completion.verification2 + '.');

  return { updated: true, rowNumber: rowNumber };
}

function findTrackerRow_(values, headers, completion) {
  const targetId = lower_(completion.taskId);
  const targetTitle = lower_(completion.title);

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (targetId && lower_(getValue_(values[rowIndex], headers, 'Hub Task ID')) === targetId) return rowIndex;
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const action = lower_(getValue_(values[rowIndex], headers, 'Action') || getValue_(values[rowIndex], headers, 'Task'));
    if (targetTitle && action === targetTitle) return rowIndex;
  }

  return null;
}

function getParams_(e) {
  return e && e.parameter ? e.parameter : {};
}

function authorize_(params) {
  const requiredKey = clean_(DSG_HUB_SYNC_CONFIG.syncKey);
  if (!requiredKey) return { ok: true };
  return clean_(params.key) === requiredKey
    ? { ok: true }
    : { ok: false, error: 'Unauthorized Hub sync request.' };
}

function jsonOutput_(payload, callback) {
  const body = callback
    ? String(callback) + '(' + JSON.stringify(payload) + ');'
    : JSON.stringify(payload);

  const mime = callback
    ? ContentService.MimeType.JAVASCRIPT
    : ContentService.MimeType.JSON;

  return ContentService.createTextOutput(body).setMimeType(mime);
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function buildHeaderMap_(headers) {
  const map = {};
  headers.forEach(function(header, index) {
    const key = clean_(header);
    if (key) map[key] = index + 1;
  });
  return map;
}

function getValue_(row, headers, header) {
  const column = headers[header];
  return column ? clean_(row[column - 1]) : '';
}

function setRowValue_(row, headers, header, value) {
  const column = headers[header];
  if (column) row[column - 1] = value;
}

function writeIfHeader_(sheet, rowNumber, headers, header, value) {
  const column = headers[header];
  if (column) sheet.getRange(rowNumber, column).setValue(value);
}

function appendIfHeader_(sheet, rowNumber, headers, header, addition) {
  const column = headers[header];
  if (!column || !addition) return;

  const range = sheet.getRange(rowNumber, column);
  const existing = clean_(range.getValue());
  range.setValue(existing ? existing + '\n' + addition : addition);
}

function clean_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function lower_(value) {
  return clean_(value).toLowerCase();
}

function isInactiveStatus_(status) {
  return DSG_HUB_SYNC_CONFIG.inactiveStatuses.indexOf(lower_(status)) !== -1;
}

function slugify_(value) {
  return lower_(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'hub-task';
}

function buildSteps_(nextStep, definitionOfDone, source) {
  const steps = [];
  if (nextStep) steps.push(nextStep);
  if (definitionOfDone) steps.push('Work toward the definition of done: ' + definitionOfDone);
  if (source) steps.push('Use the Cockpit source reference for evidence: ' + source);
  steps.push('When the task is actually finished, click Mark finished in the Hub and confirm once.');
  return steps;
}

function buildPrompt_(action, workstream, definitionOfDone, source) {
  return 'Help complete this DSG Hub task: ' + action +
    '. Workstream: ' + workstream +
    '. Definition of done: ' + (definitionOfDone || 'confirm the finished outcome and evidence') +
    '. Source: ' + (source || 'Action Tracker row') +
    '. Keep the output source-backed and review-ready.';
}

function inferApprover_(owner, workstream) {
  const text = lower_(owner + ' ' + workstream);
  if (text.indexOf('board') !== -1) return 'Board / Andrew';
  if (text.indexOf('clark') !== -1 || text.indexOf('finance') !== -1) return 'Andrew / Clark';
  return 'Andrew';
}

function inferAudience_(workstream) {
  const text = lower_(workstream);
  if (text.indexOf('marketing') !== -1 || text.indexOf('public') !== -1) return 'Public / marketing audience after approval';
  if (text.indexOf('program') !== -1 || text.indexOf('registrant') !== -1) return 'Programming / participants after approval';
  if (text.indexOf('finance') !== -1 || text.indexOf('compliance') !== -1 || text.indexOf('governance') !== -1) return 'Internal admin / governance';
  return 'Internal DSG team';
}

function inferSaveLocation_(workstream) {
  const text = lower_(workstream);
  if (text.indexOf('marketing') !== -1) return 'DSG Share Folder > Marketing & Brand';
  if (text.indexOf('program') !== -1) return 'DSG Share Folder > Programming';
  if (text.indexOf('finance') !== -1) return 'DSG Share Folder > Finance';
  if (text.indexOf('compliance') !== -1 || text.indexOf('governance') !== -1) return 'DSG Share Folder > Governance & Legal';
  if (text.indexOf('fund') !== -1 || text.indexOf('development') !== -1) return 'DSG Share Folder > Development & Fundraising';
  return 'DSG Leadership Cockpit / linked source folder';
}

function inferTool_(text) {
  const source = lower_(text);
  if (source.indexOf('zeffy') !== -1) return 'Zeffy + Cockpit source evidence';
  if (source.indexOf('relay') !== -1 || source.indexOf('finance') !== -1) return 'Relay + finance records';
  if (source.indexOf('google') !== -1 || source.indexOf('workspace') !== -1) return 'Google source account + Cockpit';
  if (source.indexOf('calendar') !== -1 || source.indexOf('meeting') !== -1) return 'Google Calendar + Cockpit';
  if (source.indexOf('brand') !== -1 || source.indexOf('canva') !== -1) return 'Brand Kit + Canva';
  if (source.indexOf('grant') !== -1 || source.indexOf('fund') !== -1 || source.indexOf('citizens') !== -1) return 'Grants Folder + funding source evidence';
  return 'DSG Leadership Cockpit + linked source evidence';
}

function inferResourceIds_(text) {
  const source = lower_(text);
  const ids = ['cockpit-action-tracker', 'cockpit-source-inbox', 'dsg-share-folder'];

  if (source.indexOf('brand') !== -1) ids.push('dsg-brand-kit', 'canva');
  if (source.indexOf('grant') !== -1 || source.indexOf('fund') !== -1 || source.indexOf('citizens') !== -1) ids.push('grants-folder');
  if (source.indexOf('zeffy') !== -1) ids.push('zeffy');
  if (source.indexOf('relay') !== -1 || source.indexOf('finance') !== -1) ids.push('relay');
  if (source.indexOf('calendar') !== -1) ids.push('compliance-calendar');
  if (source.indexOf('google business') !== -1) ids.push('google-business-profile');
  if (source.indexOf('nonprofits') !== -1 || source.indexOf('workspace') !== -1) ids.push('google-nonprofits');
  if (source.indexOf('st-119') !== -1 || source.indexOf('st119') !== -1) ids.push('st119-folder');

  return ids.filter(function(id, index) {
    return ids.indexOf(id) === index;
  });
}

function normalizeDepartment_(workstream) {
  const text = lower_(workstream);

  if (text.indexOf('marketing') !== -1 || text.indexOf('public') !== -1 || text.indexOf('brand') !== -1) return 'Marketing & Social';
  if (text.indexOf('program') !== -1 || text.indexOf('participant') !== -1 || text.indexOf('registrant') !== -1) return 'Programming / Registrants';
  if (text.indexOf('finance') !== -1 || text.indexOf('admin') !== -1) return 'Finance / Administration';
  if (text.indexOf('compliance') !== -1 || text.indexOf('governance') !== -1 || text.indexOf('board') !== -1) return 'Compliance / Governance';
  if (text.indexOf('fund') !== -1 || text.indexOf('development') !== -1 || text.indexOf('grant') !== -1) return 'Development / Fundraising';
  if (text.indexOf('tech') !== -1 || text.indexOf('google') !== -1) return 'Operations / Technology';

  return 'Team Operations';
}

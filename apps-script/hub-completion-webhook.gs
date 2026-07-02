const DSG_HUB_CONFIG = {
  spreadsheetId: '1znq0A2TYxSFA1jP1_HMXhdUQEdW1QyTAvG8fIKU7EFk',
  completedStatus: 'Complete',
  inactiveValue: 'No',
  taskSheets: [
    {
      name: 'Action Tracker',
      titleHeaders: ['Action'],
      statusHeader: 'Status',
      activeHeader: 'Active?',
      completionNoteHeader: 'Source'
    },
    {
      name: 'Today',
      titleHeaders: ['Immediate Work', 'Focus'],
      statusHeader: 'Status',
      completionNoteHeader: 'Notes'
    },
    {
      name: 'This Week',
      titleHeaders: ['This Week Focus', 'Priority'],
      statusHeader: 'Status',
      completionNoteHeader: 'Notes'
    },
    {
      name: 'Team Next Steps',
      titleHeaders: ['Task', 'Next Step', 'Action', 'Item'],
      statusHeader: 'Status',
      completionNoteHeader: 'Notes'
    },
    {
      name: 'Follow-Ups',
      titleHeaders: ['Follow-Up', 'Action', 'Task', 'Item'],
      statusHeader: 'Status',
      completionNoteHeader: 'Notes'
    },
    {
      name: 'Source Inbox',
      titleHeaders: ['Item', 'Source Item', 'Summary', 'Task', 'Action'],
      statusHeader: 'Status',
      completionNoteHeader: 'Notes'
    }
  ],
  auditSheetName: 'System Audit',
  completedStatuses: ['complete', 'completed', 'confirmed complete', 'archived', 'sent', 'superseded', 'resolved']
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  let payload;

  if (params.action === 'complete') {
    payload = completeTask_(params);
  } else {
    payload = getCompletedPayload_();
  }

  return jsonOrJsonp_(payload, params.callback);
}

function doPost(e) {
  const payload = parsePayload_(e);
  return json_(completeTask_(payload));
}

function completeTask_(payload) {
  const taskId = String(payload.taskId || payload['Task ID'] || '').trim();
  const taskTitle = String(payload.taskTitle || payload['Task title'] || '').trim();

  if (!taskId || !taskTitle) {
    return { ok: false, error: 'Missing taskId or taskTitle', completedTaskIds: getCompletedTaskIds_() };
  }

  const ss = SpreadsheetApp.openById(DSG_HUB_CONFIG.spreadsheetId);
  const match = findBestTaskRow_(ss, taskId, taskTitle);

  if (!match) {
    logAudit_(ss, 'Hub completion unmatched', 'Needs Review', 'No Cockpit row matched Hub task: ' + taskId + ' / ' + taskTitle);
    return {
      ok: false,
      error: 'No matching Cockpit row found',
      taskId: taskId,
      taskTitle: taskTitle,
      completedTaskIds: getCompletedTaskIds_()
    };
  }

  applyCompletion_(match, payload, taskId, taskTitle);
  logAudit_(ss, 'Hub completion applied', 'Complete', 'Hub task completed: ' + taskId + ' / ' + taskTitle + ' -> ' + match.sheet.getName() + ' row ' + match.rowNumber);

  return {
    ok: true,
    taskId: taskId,
    taskTitle: taskTitle,
    updatedSheet: match.sheet.getName(),
    updatedRow: match.rowNumber,
    completedTaskIds: getCompletedTaskIds_(),
    updatedAt: new Date().toISOString()
  };
}

function getCompletedPayload_() {
  return {
    ok: true,
    completedTaskIds: getCompletedTaskIds_(),
    updatedAt: new Date().toISOString()
  };
}

function getCompletedTaskIds_() {
  const ss = SpreadsheetApp.openById(DSG_HUB_CONFIG.spreadsheetId);
  const ids = new Set();

  DSG_HUB_CONFIG.taskSheets.forEach(function(config) {
    const sheet = ss.getSheetByName(config.name);
    if (!sheet) return;

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    const headerMap = buildHeaderMap_(values[0]);
    const statusColumn = headerMap[config.statusHeader];
    if (!statusColumn) return;

    for (let r = 1; r < values.length; r += 1) {
      const row = values[r];
      const status = normalize_(row[statusColumn - 1]);
      if (DSG_HUB_CONFIG.completedStatuses.indexOf(status) === -1) continue;

      const rowText = row.map(function(value) { return String(value || ''); }).join(' ');
      extractHubTaskIds_(rowText).forEach(function(id) { ids.add(id); });
    }
  });

  return Array.from(ids);
}

function findBestTaskRow_(ss, taskId, taskTitle) {
  const targetTitle = normalizeForMatch_(taskTitle);
  const targetTokens = usefulTokens_(taskTitle).concat(usefulTokens_(taskId.replace(/^task-/, '').replace(/-/g, ' ')));
  let best = null;

  DSG_HUB_CONFIG.taskSheets.forEach(function(config) {
    const sheet = ss.getSheetByName(config.name);
    if (!sheet) return;

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    const headerMap = buildHeaderMap_(values[0]);
    const statusColumn = headerMap[config.statusHeader];
    if (!statusColumn) return;

    for (let r = 1; r < values.length; r += 1) {
      const row = values[r];
      const rowText = row.map(function(value) { return String(value || ''); }).join(' ');
      const normalizedRowText = normalizeForMatch_(rowText);
      if (!normalizedRowText) continue;

      let score = 0;
      if (normalizedRowText.indexOf(taskId.toLowerCase()) !== -1) score += 100;
      if (normalizedRowText.indexOf(targetTitle) !== -1) score += 80;

      config.titleHeaders.forEach(function(header) {
        const col = headerMap[header];
        if (!col) return;
        const cellTitle = normalizeForMatch_(row[col - 1]);
        if (cellTitle === targetTitle) score += 120;
        if (cellTitle && (cellTitle.indexOf(targetTitle) !== -1 || targetTitle.indexOf(cellTitle) !== -1)) score += 55;
      });

      targetTokens.forEach(function(token) {
        if (normalizedRowText.indexOf(token) !== -1) score += 6;
      });

      if (score > 0 && (!best || score > best.score)) {
        best = { sheet: sheet, rowNumber: r + 1, headerMap: headerMap, config: config, score: score };
      }
    }
  });

  return best && best.score >= 30 ? best : null;
}

function applyCompletion_(match, payload, taskId, taskTitle) {
  const sheet = match.sheet;
  const headerMap = match.headerMap;
  const rowNumber = match.rowNumber;
  const now = new Date();

  writeIfHeaderExists_(sheet, rowNumber, headerMap, match.config.statusHeader, DSG_HUB_CONFIG.completedStatus);

  if (match.config.activeHeader) {
    writeIfHeaderExists_(sheet, rowNumber, headerMap, match.config.activeHeader, DSG_HUB_CONFIG.inactiveValue);
  }

  const noteHeader = match.config.completionNoteHeader;
  const noteColumn = headerMap[noteHeader];
  if (noteColumn) {
    const cell = sheet.getRange(rowNumber, noteColumn);
    const existing = String(cell.getValue() || '').trim();
    const note = 'Hub Complete: ' + taskId + ' | ' + taskTitle + ' | ' + now.toISOString();
    cell.setValue(existing ? existing + '\n' + note : note);
  }
}

function logAudit_(ss, action, status, details) {
  let sheet = ss.getSheetByName(DSG_HUB_CONFIG.auditSheetName);
  if (!sheet) return;

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Area', 'Action', 'Status', 'Details']);
  }

  sheet.appendRow([new Date(), 'Hub Completion Webhook', action, status, details]);
}

function buildHeaderMap_(headers) {
  const map = {};
  headers.forEach(function(header, index) {
    const key = String(header || '').trim();
    if (key && !map[key]) map[key] = index + 1;
  });
  return map;
}

function writeIfHeaderExists_(sheet, rowNumber, headerMap, header, value) {
  const col = headerMap[header];
  if (col) sheet.getRange(rowNumber, col).setValue(value);
}

function extractHubTaskIds_(text) {
  const matches = String(text || '').match(/task-[a-z0-9-]+/gi) || [];
  return matches.map(function(value) { return value.toLowerCase(); });
}

function usefulTokens_(text) {
  const stopWords = new Set(['task', 'the', 'and', 'with', 'from', 'into', 'for', 'this', 'that', 'review', 'confirm', 'complete']);
  const tokens = normalizeForMatch_(text).split(' ').filter(function(token) {
    return token.length >= 4 && !stopWords.has(token);
  });
  return Array.from(new Set(tokens));
}

function normalizeForMatch_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize_(value) {
  return String(value || '').trim().toLowerCase();
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
  return String(source || '').split('&').reduce(function(acc, pair) {
    const parts = pair.split('=');
    const rawKey = parts[0];
    const rawValue = parts.slice(1).join('=');
    if (!rawKey) return acc;
    acc[decodeURIComponent(rawKey.replace(/\+/g, ' '))] = decodeURIComponent((rawValue || '').replace(/\+/g, ' '));
    return acc;
  }, {});
}

function jsonOrJsonp_(payload, callback) {
  const safePayload = JSON.stringify(payload);
  if (callback) {
    return ContentService
      .createTextOutput(String(callback).replace(/[^a-zA-Z0-9_.$]/g, '') + '(' + safePayload + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(payload);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

const state = {
  tasks: [],
  meetings: [],
  resources: [],
  resourceMap: new Map(),
  verifiedCompletedTaskIds: new Set(),
  selectedTaskId: null,
  filters: { search: '', person: 'all', department: 'all' }
};

const dataVersion = '20260716-action-tracker-refresh';
const priorityRank = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const teamMembers = ['Andrew', 'Clark', 'Karena', 'Monae', 'Omari', 'Richard'];
const inactiveStatuses = new Set(['complete', 'completed', 'confirmed complete', 'archived', 'sent', 'superseded', 'resolved', 'parked', 'deferred']);
const approvedIntakeTasks = [];

const resourceGroups = [
  { title: 'Brand, Voice & Briefs', note: 'Use before anything public-facing or review-ready.', resources: ['dsg-brand-kit', 'dsg-brief-builder', 'dsg-website', 'dsg-gpt'] },
  { title: 'Marketing & Social', note: 'Social channels, access, scheduling, audience engagement, and campaign learning.', resources: ['dsg-instagram', 'dsg-linkedin', 'meta-business-suite', 'buffer', 'manychat', 'canva', 'getting-in-on-the-act', 'barun-audience-engagement', 'youtube-experience-video'] },
  { title: 'Development & Funding', note: 'Funding work, funder-facing language, and staged grant materials.', resources: ['grants-folder', 'dsg-brand-kit', 'dsg-brief-builder', 'dsg-share-folder'] },
  { title: 'Programming & Registrants', note: 'Participant follow-up, program records, and Vanguard Voices planning.', resources: ['zeffy', 'dsg-gpt', 'dsg-brand-kit', 'dsg-share-folder', 'getting-in-on-the-act'] },
  { title: 'Compliance, Finance & Admin', note: 'Filing, receipts, finance cleanup, and administrative reference.', resources: ['ny-charities', 'irs-nonprofits', 'stay-exempt', 'relay', 'dsg-share-folder'] },
  { title: 'AI Prompt Support', note: 'Prompt examples and reusable AI workflow inspiration.', resources: ['complete-ai-bundle', 'chatgpt-mega-prompt-bundle', 'dsg-gpt', 'dsg-brief-builder'] },
  { title: 'Experience Design & UX', note: 'Useful when shaping audience journeys, hub structure, or workshop experience.', resources: ['ux-design-process', 'hbr-new-experience-economy', 'experience-economy-wiki', 'hbr-welcome-experience-economy', 'participations-wlazel', 'getting-in-on-the-act'] }
];

const els = {
  searchInput: document.querySelector('#searchInput'),
  personFilter: document.querySelector('#personFilter'),
  departmentFilter: document.querySelector('#departmentFilter'),
  quickGlance: document.querySelector('#quickGlance'),
  taskList: document.querySelector('#taskList'),
  taskDetail: document.querySelector('#taskDetail'),
  resourceGrid: document.querySelector('#resourceGrid'),
  resultsMeta: document.querySelector('#resultsMeta'),
  andrewWork: document.querySelector('#andrewWork'),
  andrewMeta: document.querySelector('#andrewMeta'),
  meetingsList: document.querySelector('#meetingsList'),
  suggestTaskForm: document.querySelector('#suggestTaskForm'),
  taskSuggestion: document.querySelector('#taskSuggestion'),
  suggestionPage: document.querySelector('#suggestionPage'),
  suggestionStatus: document.querySelector('#suggestionStatus'),
  suggestionSubmit: document.querySelector('#suggestTaskForm button[type="submit"]')
};

async function loadData() {
  const [tasksResponse, resourcesResponse, meetingsResponse, completedResponse] = await Promise.all([
    fetch(`data/tasks.json?v=${dataVersion}`),
    fetch(`data/resources.json?v=${dataVersion}`),
    fetch(`data/meetings.json?v=${dataVersion}`).catch(() => null),
    fetch(`data/completed-tasks.json?v=${dataVersion}`).catch(() => null)
  ]);
  if (!tasksResponse.ok || !resourcesResponse.ok) {
    throw new Error('Could not load hub data. If previewing locally, serve the folder with a simple local web server.');
  }

  const completedPayload = completedResponse && completedResponse.ok ? await completedResponse.json() : { completedTaskIds: [] };
  state.verifiedCompletedTaskIds = new Set(Array.isArray(completedPayload.completedTaskIds) ? completedPayload.completedTaskIds : []);

  const loadedTasks = await tasksResponse.json();
  state.tasks = [...loadedTasks, ...approvedIntakeTasks].filter(isVisibleTask);
  state.resources = await resourcesResponse.json();
  state.meetings = meetingsResponse && meetingsResponse.ok ? await meetingsResponse.json() : [];
  state.resourceMap = new Map(state.resources.map(resource => [resource.id, resource]));
  state.selectedTaskId = state.tasks[0]?.id || null;
  populateFilters();
  renderResources();
  renderAndrewWork();
  renderMeetings();
  render();
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isActiveTask(task) {
  return !inactiveStatuses.has(normalizeStatus(task.status));
}

function isVisibleTask(task) {
  return isActiveTask(task) && !state.verifiedCompletedTaskIds.has(task.id);
}

function getActiveTasks() {
  return state.tasks.filter(isVisibleTask);
}

function splitPeople(value) {
  const source = String(value || '');
  return teamMembers.filter(person => new RegExp(`\\b${person}\\b`, 'i').test(source));
}

function addOptions(select, values) {
  select.querySelectorAll('option:not([value="all"])').forEach(option => option.remove());
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function populateFilters() {
  const activeTasks = getActiveTasks();
  addOptions(els.personFilter, teamMembers);
  addOptions(els.departmentFilter, [...new Set(activeTasks.map(task => task.department || task.category).filter(Boolean))].sort());
}

function getSearchText(task) {
  const linkedResources = (task.links || [])
    .map(linkId => state.resourceMap.get(linkId))
    .filter(Boolean)
    .map(resource => `${resource.label} ${resource.category} ${resource.tool} ${resource.useWhen}`);
  return [
    task.title, task.department, task.category, task.project, task.status, task.priority,
    task.owner, task.support, task.approves, task.due, task.tool, task.audience,
    task.deliverable, task.saveFinalIn, task.context, task.requiredEvidence,
    task.verification1, task.verification2, task.cockpitBacklink, task.prompt,
    ...(task.nextSteps || []), ...linkedResources
  ].join(' ').toLowerCase();
}

function formatDueLabel(value) {
  const source = String(value || '').trim();
  if (!source) return 'Due: Ask';

  const iso = source.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const parsed = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    return `Due: ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(parsed)}`;
  }

  const monthDate = source.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthDate) {
    const parsed = new Date(`${monthDate[1].replace('.', '')} ${monthDate[2]}, 2026`);
    if (!Number.isNaN(parsed.getTime())) {
      return `Due: ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(parsed)}`;
    }
  }

  const numeric = source.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    const year = numeric[3] ? (numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : '2026';
    const parsed = new Date(`${year}-${numeric[1].padStart(2, '0')}-${numeric[2].padStart(2, '0')}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return `Due: ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(parsed)}`;
    }
  }

  return `Due: ${source}`;
}

function personMatches(task, person) {
  if (person === 'all') return true;
  return [...splitPeople(task.owner), ...splitPeople(task.support), ...splitPeople(task.approves)].includes(person);
}

function filteredTasks() {
  const query = state.filters.search.trim().toLowerCase();
  return getActiveTasks()
    .filter(task => !query || getSearchText(task).includes(query))
    .filter(task => state.filters.department === 'all' || (task.department || task.category) === state.filters.department)
    .filter(task => personMatches(task, state.filters.person))
    .sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99) || a.title.localeCompare(b.title));
}

function render() {
  const tasks = filteredTasks();
  els.resultsMeta.textContent = tasks.length === 1 ? '1 active task found' : `${tasks.length} active tasks found`;
  if (!tasks.some(task => task.id === state.selectedTaskId)) state.selectedTaskId = tasks[0]?.id || null;
  renderQuickGlance(tasks);
  renderTaskList(tasks);
  renderTaskDetail(tasks.find(task => task.id === state.selectedTaskId));
}

function renderQuickGlance(tasks) {
  if (!els.quickGlance) return;
  els.quickGlance.innerHTML = '';
  if (!tasks.length) {
    els.quickGlance.innerHTML = '<div class="empty-state">No active matching tasks.</div>';
    return;
  }
  tasks.slice(0, 8).forEach(task => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `quick-glance-row ${task.id === state.selectedTaskId ? 'is-selected' : ''}`;
    button.innerHTML = `<span class="quick-owner">${escapeHtml(task.owner)}</span><span class="quick-task">${escapeHtml(task.title)}</span><span class="quick-due">${escapeHtml(formatDueLabel(task.due))}</span>`;
    button.addEventListener('click', () => {
      state.selectedTaskId = task.id;
      render();
      els.taskDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    els.quickGlance.appendChild(button);
  });
  if (tasks.length > 8) {
    const note = document.createElement('div');
    note.className = 'quick-glance-more';
    note.textContent = `${tasks.length - 8} more active tasks in the full list below.`;
    els.quickGlance.appendChild(note);
  }
}

function renderTaskList(tasks) {
  els.taskList.innerHTML = '';
  if (!tasks.length) {
    els.taskList.innerHTML = '<div class="empty-state">No active matching tasks.</div>';
    return;
  }
  tasks.forEach(task => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `task-row ${task.id === state.selectedTaskId ? 'is-selected' : ''}`;
    button.innerHTML = `<span class="task-row-title">${escapeHtml(task.title)}</span><span class="task-row-meta">${escapeHtml(task.department || task.category)} · ${escapeHtml(formatDueLabel(task.due))} · ${escapeHtml(task.owner)}</span>`;
    button.addEventListener('click', () => {
      state.selectedTaskId = task.id;
      render();
      if (window.matchMedia('(max-width: 820px)').matches) els.taskDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    els.taskList.appendChild(button);
  });
}

function renderTaskDetail(task) {
  if (!task) {
    els.taskDetail.innerHTML = '<div class="empty-state">Choose an active task to see the details.</div>';
    return;
  }
  const links = (task.links || [])
    .map(linkId => state.resourceMap.get(linkId))
    .filter(Boolean)
    .map(resource => `<a href="${resource.url}" target="_blank" rel="noreferrer" title="${escapeHtml(resource.useWhen)}">${escapeHtml(resource.label)}</a>`)
    .join('');
  const steps = (task.nextSteps || []).map(step => `<li>${escapeHtml(step)}</li>`).join('');
  const requiredEvidence = task.requiredEvidence || 'Save the source-backed proof or blocker note before requesting closure.';
  const verification1 = task.verification1 || 'Reviewer 1 confirms the deliverable or outcome is actually complete.';
  const verification2 = task.verification2 || 'Reviewer 2 confirms leadership, owner, or approval closure.';
  const cockpitBacklink = task.cockpitBacklink || task.id;

  els.taskDetail.innerHTML = `<article class="detail-card"><div class="card-topline"><span class="badge category">${escapeHtml(task.department || task.category)}</span><span class="badge status">${escapeHtml(task.status)}</span></div><h2>${escapeHtml(task.title)}</h2><p class="context">${escapeHtml(task.context)}</p><div class="next-action-block"><strong>Deliverable</strong><p>${escapeHtml(task.deliverable)}</p></div><dl class="meta-grid"><div><dt>Owner</dt><dd>${escapeHtml(task.owner)}</dd></div><div><dt>Support</dt><dd>${escapeHtml(task.support)}</dd></div><div><dt>Approves</dt><dd>${escapeHtml(task.approves)}</dd></div><div><dt>Due</dt><dd>${escapeHtml(formatDueLabel(task.due))}</dd></div><div><dt>Tool</dt><dd>${escapeHtml(task.tool)}</dd></div><div><dt>Save final in</dt><dd>${escapeHtml(task.saveFinalIn)}</dd></div></dl><div class="link-block"><strong>Use these links</strong><div class="links">${links}</div></div><details open><summary>Steps to complete</summary><ol class="next-steps">${steps}</ol></details><dl class="meta-grid"><div><dt>Required evidence</dt><dd>${escapeHtml(requiredEvidence)}</dd></div><div><dt>Verification 1</dt><dd>${escapeHtml(verification1)}</dd></div><div><dt>Verification 2</dt><dd>${escapeHtml(verification2)}</dd></div><div><dt>Cockpit backlink</dt><dd>${escapeHtml(cockpitBacklink)}</dd></div></dl><details><summary>Prompt starter</summary><p class="prompt">${escapeHtml(task.prompt)}</p><button class="copy-button prompt-copy-button" type="button">Copy prompt</button></details><button class="copy-button step-complete-button" type="button">Submit for Andrew review</button><p class="completion-status" role="status" aria-live="polite"></p><p class="intake-note"><strong>Hub flow:</strong> This sends a review signal only. The task stays visible until completion evidence, Verification 1, Verification 2, and the Cockpit backlink are confirmed in the Cockpit.</p></article>`;
  els.taskDetail.querySelector('.prompt-copy-button').addEventListener('click', async event => {
    await navigator.clipboard.writeText(task.prompt);
    event.currentTarget.textContent = 'Copied';
    setTimeout(() => { event.currentTarget.textContent = 'Copy prompt'; }, 1200);
  });
  els.taskDetail.querySelector('.step-complete-button').addEventListener('click', event => handleReviewSubmit(event, task));
}

function renderAndrewWork() {
  const andrewTasks = getActiveTasks().filter(task => personMatches(task, 'Andrew')).sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99) || a.title.localeCompare(b.title));
  if (!els.andrewWork) return;
  if (els.andrewMeta) els.andrewMeta.textContent = andrewTasks.length === 1 ? '1 active item' : `${andrewTasks.length} active items`;
  if (!andrewTasks.length) {
    els.andrewWork.innerHTML = '<div class="empty-state">No active Andrew tasks.</div>';
    return;
  }
  els.andrewWork.innerHTML = andrewTasks.map(task => `<button type="button" class="andrew-chip" data-task-id="${escapeHtml(task.id)}"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.department || task.category)} · ${escapeHtml(formatDueLabel(task.due))}</span></button>`).join('');
  els.andrewWork.querySelectorAll('[data-task-id]').forEach(button => {
    button.addEventListener('click', () => {
      state.selectedTaskId = button.dataset.taskId;
      state.filters.person = 'all';
      state.filters.department = 'all';
      els.personFilter.value = 'all';
      els.departmentFilter.value = 'all';
      render();
      els.taskDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderMeetings() {
  if (!els.meetingsList) return;
  if (!state.meetings.length) {
    els.meetingsList.innerHTML = '<div class="empty-state">No upcoming shared-calendar meetings loaded. Check Google Calendar before assuming timing.</div>';
    return;
  }
  els.meetingsList.innerHTML = state.meetings.map(meeting => {
    const metadata = [meeting.department, meeting.owner].filter(Boolean).join(' · ');
    const source = meeting.source ? `<span class="meeting-source">${escapeHtml(meeting.source)}</span>` : '';
    const link = meeting.calendarUrl ? `<a href="${escapeHtml(meeting.calendarUrl)}" target="_blank" rel="noreferrer">Open shared calendar</a>` : '';
    return `<article class="meeting-card"><strong>${escapeHtml(meeting.title)}</strong><span>${escapeHtml(meeting.date)} · ${escapeHtml(meeting.time)}</span>${metadata ? `<span>${escapeHtml(metadata)}</span>` : ''}<p>${escapeHtml(meeting.purpose)}</p>${source}${link}</article>`;
  }).join('');
}

function renderResources() {
  els.resourceGrid.innerHTML = '';
  resourceGroups.forEach(group => {
    const section = document.createElement('section');
    section.className = 'resource-group';
    section.innerHTML = `<div class="resource-group-heading"><h3>${escapeHtml(group.title)}</h3><p>${escapeHtml(group.note)}</p></div><div class="resource-cards"></div>`;
    const cards = section.querySelector('.resource-cards');
    group.resources.map(id => state.resourceMap.get(id)).filter(Boolean).forEach(resource => {
      const card = document.createElement('article');
      card.className = 'resource-card';
      card.innerHTML = `<strong>${escapeHtml(resource.label)}</strong><p>${escapeHtml(resource.useWhen)}</p><a href="${resource.url}" target="_blank" rel="noreferrer">Open</a>`;
      cards.appendChild(card);
    });
    els.resourceGrid.appendChild(section);
  });
}

async function handleReviewSubmit(event, task) {
  const confirmed = window.confirm(`Submit this task for Andrew review?\n\nThis will not hide the task or request Cockpit completion.\n\n${task.title}`);
  if (!confirmed) return;

  const button = event.currentTarget;
  const status = els.taskDetail.querySelector('.completion-status');
  const submittedAt = new Date().toISOString();
  const formData = new FormData();
  formData.append('_subject', `DSG Hub review signal: ${task.title}`);
  formData.append('_template', 'table');
  formData.append('_captcha', 'false');
  formData.append('Page', window.location.href);
  formData.append('Task ID', task.id);
  formData.append('Task title', task.title);
  formData.append('Department', task.department || task.category || '');
  formData.append('Owner', task.owner);
  formData.append('Support', task.support);
  formData.append('Approves', task.approves);
  formData.append('Save final in', task.saveFinalIn);
  formData.append('Submitted at', submittedAt);
  formData.append('Cockpit status requested', 'Review only');
  formData.append('Cockpit action requested', 'Andrew review signal. Do not mark complete unless completion evidence, Verification 1, Verification 2, and Cockpit backlink are confirmed.');
  formData.append('Hub action taken', 'No task hiding. No shared completion update.');
  formData.append('Required evidence', task.requiredEvidence || 'Evidence not listed in task data.');
  formData.append('Verification 1', task.verification1 || 'Reviewer 1 must confirm completion.');
  formData.append('Verification 2', task.verification2 || 'Reviewer 2/approver must confirm closure.');
  formData.append('Cockpit backlink field', task.cockpitBacklink || task.id);

  status.textContent = 'Submitting review signal...';
  button.disabled = true;
  try {
    const response = await fetch('https://formsubmit.co/ajax/admin@discoverysoundgarden.com', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData
    });
    if (!response.ok) throw new Error('Review submission failed');
    status.textContent = 'Sent for Andrew review. The task stays visible until verified closed.';
  } catch (error) {
    status.textContent = 'Could not submit review signal. Please try again in a moment.';
  } finally {
    button.disabled = false;
  }
}

async function handleSuggestionSubmit(event) {
  event.preventDefault();
  const suggestion = els.taskSuggestion.value.trim();
  if (!suggestion) {
    els.suggestionStatus.textContent = 'Add a task note first.';
    return;
  }

  if (els.suggestionPage) els.suggestionPage.value = window.location.href;
  els.suggestionStatus.textContent = 'Submitting suggestion...';
  if (els.suggestionSubmit) els.suggestionSubmit.disabled = true;

  try {
    const response = await fetch(els.suggestTaskForm.action, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(els.suggestTaskForm)
    });
    if (!response.ok) throw new Error('Submission failed');
    els.suggestTaskForm.reset();
    els.suggestionStatus.textContent = 'Suggestion emailed for Cockpit review.';
  } catch (error) {
    els.suggestionStatus.textContent = 'Could not submit. Please try again in a moment.';
  } finally {
    if (els.suggestionSubmit) els.suggestionSubmit.disabled = false;
  }
}

function setFilter(key, value) {
  state.filters[key] = value;
  render();
}

function escapeHtml(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

els.searchInput.addEventListener('input', event => setFilter('search', event.target.value));
els.personFilter.addEventListener('change', event => setFilter('person', event.target.value));
els.departmentFilter.addEventListener('change', event => setFilter('department', event.target.value));
if (els.suggestTaskForm) els.suggestTaskForm.addEventListener('submit', handleSuggestionSubmit);

loadData().catch(error => {
  els.taskList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  els.taskDetail.innerHTML = '';
  if (els.resultsMeta) els.resultsMeta.textContent = 'Could not load tasks.';
  console.error(error);
});

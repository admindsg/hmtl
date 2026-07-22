const dataVersion = '20260722-cockpit-refresh';
const teamMembers = ['Andrew', 'Clark', 'Karena', 'Monae', 'Omari', 'Richard'];
const priorityRank = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const inactiveStatuses = new Set(['complete', 'completed', 'confirmed complete', 'archived', 'sent', 'superseded', 'resolved', 'parked', 'deferred']);
const state = { tasks: [], resources: [], meetings: [], resourceMap: new Map(), selectedTaskId: null, filters: { search: '', person: 'all', department: 'all' } };

const resourceGroups = [
  { title: 'Cockpit & Source Evidence', note: 'Use to confirm active work, source rows, backlinks, and completion evidence.', resources: ['cockpit-action-tracker', 'cockpit-source-inbox', 'dsg-share-folder'] },
  { title: 'Brand, Voice & Briefs', note: 'Use before anything public-facing or review-ready.', resources: ['dsg-brand-kit', 'dsg-brief-builder', 'dsg-website', 'dsg-gpt'] },
  { title: 'Marketing & Social', note: 'Social channels, public profile readiness, access, scheduling, and campaign learning.', resources: ['google-business-profile', 'dsg-instagram', 'dsg-linkedin', 'meta-business-suite', 'buffer', 'manychat', 'canva', 'getting-in-on-the-act', 'barun-audience-engagement'] },
  { title: 'Development & Funding', note: 'Funding work, funder-facing language, and staged grant materials.', resources: ['funding-report-july20', 'grants-folder', 'business-plan', 'google-nonprofits', 'dsg-brand-kit', 'dsg-share-folder'] },
  { title: 'Programming & Registrants', note: 'Participant follow-up, program records, and Vanguard Voices planning.', resources: ['zeffy', 'dsg-gpt', 'dsg-brand-kit', 'dsg-share-folder', 'getting-in-on-the-act'] },
  { title: 'Compliance, Finance & Admin', note: 'Filing, receipts, finance cleanup, and administrative reference.', resources: ['ny-charities', 'compliance-calendar', 'st119-folder', 'irs-nonprofits', 'stay-exempt', 'relay', 'monthly-subscriptions', 'dsg-share-folder'] }
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

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isVisibleTask(task) {
  return !inactiveStatuses.has(normalizeStatus(task.status));
}

function splitPeople(value) {
  const source = String(value || '');
  return teamMembers.filter(person => new RegExp(`\\b${person}\\b`, 'i').test(source));
}

function personMatches(task, person) {
  if (person === 'all') return true;
  return [...splitPeople(task.owner), ...splitPeople(task.support), ...splitPeople(task.approves)].includes(person);
}

function getSearchText(task) {
  const linkedResources = (task.links || []).map(id => state.resourceMap.get(id)).filter(Boolean).map(resource => `${resource.label} ${resource.category} ${resource.tool} ${resource.useWhen}`);
  return [task.title, task.department, task.category, task.project, task.status, task.priority, task.owner, task.support, task.approves, task.due, task.tool, task.audience, task.deliverable, task.saveFinalIn, task.context, task.requiredEvidence, task.verification1, task.verification2, task.cockpitBacklink, task.prompt, ...(task.nextSteps || []), ...linkedResources].join(' ').toLowerCase();
}

function formatDueLabel(value) {
  const source = String(value || '').trim();
  if (!source) return 'Due: Ask';
  const iso = source.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const parsed = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    return `Due: ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(parsed)}`;
  }
  return `Due: ${source}`;
}

function getActiveTasks() {
  return state.tasks.filter(isVisibleTask);
}

function filteredTasks() {
  const query = state.filters.search.trim().toLowerCase();
  return getActiveTasks()
    .filter(task => !query || getSearchText(task).includes(query))
    .filter(task => state.filters.department === 'all' || (task.department || task.category) === state.filters.department)
    .filter(task => personMatches(task, state.filters.person))
    .sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99) || a.title.localeCompare(b.title));
}

function addOptions(select, values) {
  if (!select) return;
  select.querySelectorAll('option:not([value="all"])').forEach(option => option.remove());
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function populateFilters() {
  addOptions(els.personFilter, teamMembers);
  addOptions(els.departmentFilter, [...new Set(getActiveTasks().map(task => task.department || task.category).filter(Boolean))].sort());
}

function renderQuickGlance(tasks) {
  if (!els.quickGlance) return;
  if (!tasks.length) {
    els.quickGlance.innerHTML = '<div class="empty-state">No active matching tasks.</div>';
    return;
  }
  els.quickGlance.innerHTML = tasks.slice(0, 8).map(task => `<button type="button" class="quick-glance-row ${task.id === state.selectedTaskId ? 'is-selected' : ''}" data-task-id="${escapeHtml(task.id)}"><span class="quick-owner">${escapeHtml(task.owner)}</span><span class="quick-task">${escapeHtml(task.title)}</span><span class="quick-due">${escapeHtml(formatDueLabel(task.due))}</span></button>`).join('') + (tasks.length > 8 ? `<div class="quick-glance-more">${tasks.length - 8} more active tasks in the full list below.</div>` : '');
}

function renderTaskList(tasks) {
  if (!els.taskList) return;
  if (!tasks.length) {
    els.taskList.innerHTML = '<div class="empty-state">No active matching tasks.</div>';
    return;
  }
  els.taskList.innerHTML = tasks.map(task => `<button type="button" class="task-row ${task.id === state.selectedTaskId ? 'is-selected' : ''}" data-task-id="${escapeHtml(task.id)}"><span class="task-row-title">${escapeHtml(task.title)}</span><span class="task-row-meta">${escapeHtml(task.department || task.category)} · ${escapeHtml(formatDueLabel(task.due))} · ${escapeHtml(task.owner)}</span></button>`).join('');
}

function renderTaskDetail(task) {
  if (!els.taskDetail) return;
  if (!task) {
    els.taskDetail.innerHTML = '<div class="empty-state">Choose an active task to see the details.</div>';
    return;
  }
  const links = (task.links || []).map(id => state.resourceMap.get(id)).filter(Boolean).map(resource => `<a href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(resource.useWhen)}">${escapeHtml(resource.label)}</a>`).join('');
  const steps = (task.nextSteps || []).map(step => `<li>${escapeHtml(step)}</li>`).join('');
  els.taskDetail.innerHTML = `<article class="detail-card"><div class="card-topline"><span class="badge category">${escapeHtml(task.department || task.category)}</span><span class="badge status">${escapeHtml(task.status)}</span></div><h2>${escapeHtml(task.title)}</h2><p class="context">${escapeHtml(task.context)}</p><div class="next-action-block"><strong>Deliverable</strong><p>${escapeHtml(task.deliverable)}</p></div><dl class="meta-grid"><div><dt>Owner</dt><dd>${escapeHtml(task.owner)}</dd></div><div><dt>Support</dt><dd>${escapeHtml(task.support)}</dd></div><div><dt>Approves</dt><dd>${escapeHtml(task.approves)}</dd></div><div><dt>Due</dt><dd>${escapeHtml(formatDueLabel(task.due))}</dd></div><div><dt>Tool</dt><dd>${escapeHtml(task.tool)}</dd></div><div><dt>Save final in</dt><dd>${escapeHtml(task.saveFinalIn)}</dd></div></dl><div class="link-block"><strong>Use these links</strong><div class="links">${links}</div></div><details open><summary>Steps to complete</summary><ol class="next-steps">${steps}</ol></details><dl class="meta-grid"><div><dt>Required evidence</dt><dd>${escapeHtml(task.requiredEvidence || 'Save the source-backed proof or blocker note before requesting closure.')}</dd></div><div><dt>Verification 1</dt><dd>${escapeHtml(task.verification1 || 'Reviewer 1 confirms the work product or outcome is complete.')}</dd></div><div><dt>Verification 2</dt><dd>${escapeHtml(task.verification2 || 'Reviewer 2 confirms leadership, owner, or approval closure.')}</dd></div><div><dt>Cockpit backlink</dt><dd>${escapeHtml(task.cockpitBacklink || task.id)}</dd></div></dl><details><summary>Prompt starter</summary><p class="prompt">${escapeHtml(task.prompt || '')}</p><button class="copy-button prompt-copy-button" type="button">Copy prompt</button></details><button class="copy-button step-complete-button" type="button">Submit for Andrew review</button><p class="completion-status" role="status" aria-live="polite"></p><p class="intake-note"><strong>Hub flow:</strong> This sends a review signal only. The task stays visible until completion evidence, Verification 1, Verification 2, and the Cockpit backlink are confirmed in the Cockpit.</p></article>`;
}

function renderAndrewWork() {
  if (!els.andrewWork) return;
  const tasks = getActiveTasks().filter(task => personMatches(task, 'Andrew')).sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99) || a.title.localeCompare(b.title));
  if (els.andrewMeta) els.andrewMeta.textContent = tasks.length === 1 ? '1 active item' : `${tasks.length} active items`;
  els.andrewWork.innerHTML = tasks.length ? tasks.map(task => `<button type="button" class="andrew-chip" data-task-id="${escapeHtml(task.id)}"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.department || task.category)} · ${escapeHtml(formatDueLabel(task.due))}</span></button>`).join('') : '<div class="empty-state">No active Andrew tasks.</div>';
}

function renderMeetings() {
  if (!els.meetingsList) return;
  els.meetingsList.innerHTML = state.meetings.length ? state.meetings.map(meeting => `<article class="meeting-card"><strong>${escapeHtml(meeting.title)}</strong><span>${escapeHtml(meeting.date)} · ${escapeHtml(meeting.time)}</span><span>${escapeHtml([meeting.department, meeting.owner].filter(Boolean).join(' · '))}</span><p>${escapeHtml(meeting.purpose)}</p>${meeting.source ? `<span class="meeting-source">${escapeHtml(meeting.source)}</span>` : ''}${meeting.calendarUrl ? `<a href="${escapeHtml(meeting.calendarUrl)}" target="_blank" rel="noreferrer">Open shared calendar</a>` : ''}</article>`).join('') : '<div class="empty-state">No upcoming shared-calendar meetings loaded. Check Google Calendar before assuming timing.</div>';
}

function renderResources() {
  if (!els.resourceGrid) return;
  els.resourceGrid.innerHTML = resourceGroups.map(group => {
    const cards = group.resources.map(id => state.resourceMap.get(id)).filter(Boolean).map(resource => `<article class="resource-card"><strong>${escapeHtml(resource.label)}</strong><p>${escapeHtml(resource.useWhen)}</p><a href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">Open</a></article>`).join('');
    return `<section class="resource-group"><div class="resource-group-heading"><h3>${escapeHtml(group.title)}</h3><p>${escapeHtml(group.note)}</p></div><div class="resource-cards">${cards}</div></section>`;
  }).join('');
}

function render() {
  const tasks = filteredTasks();
  if (els.resultsMeta) els.resultsMeta.textContent = tasks.length === 1 ? '1 active task found' : `${tasks.length} active tasks found`;
  if (!tasks.some(task => task.id === state.selectedTaskId)) state.selectedTaskId = tasks[0]?.id || null;
  renderQuickGlance(tasks);
  renderTaskList(tasks);
  renderTaskDetail(tasks.find(task => task.id === state.selectedTaskId));
}

function selectTask(id) {
  state.selectedTaskId = id;
  render();
  els.taskDetail?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleReviewSubmit(button, task) {
  const confirmed = window.confirm(`Submit this task for Andrew review?\n\nThis will not hide the task or request Cockpit completion.\n\n${task.title}`);
  if (!confirmed) return;
  const status = els.taskDetail.querySelector('.completion-status');
  const formData = new FormData();
  formData.append('_subject', `DSG Hub review signal: ${task.title}`);
  formData.append('_template', 'table');
  formData.append('_captcha', 'false');
  formData.append('Page', window.location.href);
  formData.append('Task ID', task.id);
  formData.append('Task title', task.title);
  formData.append('Department', task.department || task.category || '');
  formData.append('Owner', task.owner || '');
  formData.append('Support', task.support || '');
  formData.append('Approves', task.approves || '');
  formData.append('Save final in', task.saveFinalIn || '');
  formData.append('Cockpit action requested', 'Andrew review signal only. Do not mark complete unless completion evidence, Verification 1, Verification 2, and Cockpit backlink are confirmed.');
  formData.append('Required evidence', task.requiredEvidence || 'Evidence not listed in task data.');
  formData.append('Verification 1', task.verification1 || 'Reviewer 1 must confirm completion.');
  formData.append('Verification 2', task.verification2 || 'Reviewer 2/approver must confirm closure.');
  formData.append('Cockpit backlink field', task.cockpitBacklink || task.id);
  status.textContent = 'Submitting review signal...';
  button.disabled = true;
  try {
    const response = await fetch('https://formsubmit.co/ajax/admin@discoverysoundgarden.com', { method: 'POST', headers: { Accept: 'application/json' }, body: formData });
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
  if (!els.taskSuggestion?.value.trim()) {
    els.suggestionStatus.textContent = 'Add a task note first.';
    return;
  }
  if (els.suggestionPage) els.suggestionPage.value = window.location.href;
  if (els.suggestionSubmit) els.suggestionSubmit.disabled = true;
  els.suggestionStatus.textContent = 'Submitting suggestion...';
  try {
    const response = await fetch(els.suggestTaskForm.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(els.suggestTaskForm) });
    if (!response.ok) throw new Error('Submission failed');
    els.suggestTaskForm.reset();
    els.suggestionStatus.textContent = 'Suggestion emailed for Cockpit review.';
  } catch (error) {
    els.suggestionStatus.textContent = 'Could not submit. Please try again in a moment.';
  } finally {
    if (els.suggestionSubmit) els.suggestionSubmit.disabled = false;
  }
}

async function loadData() {
  const [tasksResponse, resourcesResponse, meetingsResponse] = await Promise.all([
    fetch(`data/tasks.json?v=${dataVersion}`),
    fetch(`data/resources.json?v=${dataVersion}`),
    fetch(`data/meetings.json?v=${dataVersion}`).catch(() => null)
  ]);
  if (!tasksResponse.ok || !resourcesResponse.ok) throw new Error('Could not load hub data.');
  state.tasks = (await tasksResponse.json()).filter(isVisibleTask);
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

els.searchInput?.addEventListener('input', event => { state.filters.search = event.target.value; render(); });
els.personFilter?.addEventListener('change', event => { state.filters.person = event.target.value; render(); });
els.departmentFilter?.addEventListener('change', event => { state.filters.department = event.target.value; render(); });
els.suggestTaskForm?.addEventListener('submit', handleSuggestionSubmit);
document.addEventListener('click', async event => {
  const taskButton = event.target.closest('[data-task-id]');
  if (taskButton) selectTask(taskButton.dataset.taskId);
  if (event.target.matches('.prompt-copy-button')) {
    const task = state.tasks.find(item => item.id === state.selectedTaskId);
    await navigator.clipboard.writeText(task?.prompt || '');
    event.target.textContent = 'Copied';
    setTimeout(() => { event.target.textContent = 'Copy prompt'; }, 1200);
  }
  if (event.target.matches('.step-complete-button')) {
    const task = state.tasks.find(item => item.id === state.selectedTaskId);
    if (task) handleReviewSubmit(event.target, task);
  }
});

loadData().catch(error => {
  if (els.taskList) els.taskList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  if (els.taskDetail) els.taskDetail.innerHTML = '';
  if (els.resultsMeta) els.resultsMeta.textContent = 'Could not load tasks.';
  console.error(error);
});

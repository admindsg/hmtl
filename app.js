const state = {
  tasks: [],
  meetings: [],
  resources: [],
  resourceMap: new Map(),
  selectedTaskId: null,
  filters: { search: '', person: 'all', department: 'all' }
};

const dataVersion = '20260701-cockpit-repull';
const priorityRank = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const teamMembers = ['Andrew', 'Clark', 'Karena', 'Monae', 'Omari', 'Richard'];

const resourceGroups = [
  { title: 'Brand, Voice & Briefs', note: 'Use before anything public-facing or review-ready.', resources: ['dsg-brand-kit', 'dsg-brief-builder', 'dsg-website', 'dsg-gpt'] },
  { title: 'Marketing & Social', note: 'Social channels, scheduling, audience engagement, and campaign learning.', resources: ['dsg-instagram', 'dsg-linkedin', 'meta-business-suite', 'buffer', 'manychat', 'canva', 'getting-in-on-the-act', 'barun-audience-engagement', 'youtube-experience-video'] },
  { title: 'Development & Funding', note: 'Funding work, funder-facing language, and staged grant materials.', resources: ['grants-folder', 'dsg-brand-kit', 'dsg-brief-builder', 'dsg-share-folder'] },
  { title: 'Programming & Registrants', note: 'Workshop communication, participant follow-up, and program records.', resources: ['zeffy', 'dsg-gpt', 'dsg-brand-kit', 'dsg-share-folder', 'getting-in-on-the-act'] },
  { title: 'Compliance, Finance & Admin', note: 'Filing, receipts, finance cleanup, and administrative reference.', resources: ['ny-charities', 'irs-nonprofits', 'stay-exempt', 'relay', 'dsg-share-folder'] },
  { title: 'AI Prompt Support', note: 'Prompt examples and reusable AI workflow inspiration.', resources: ['complete-ai-bundle', 'chatgpt-mega-prompt-bundle', 'dsg-gpt', 'dsg-brief-builder'] },
  { title: 'Experience Design & UX', note: 'Useful when shaping audience journeys, hub structure, or workshop experience.', resources: ['ux-design-process', 'hbr-new-experience-economy', 'experience-economy-wiki', 'hbr-welcome-experience-economy', 'participations-wlazel', 'getting-in-on-the-act'] }
];

const els = {
  searchInput: document.querySelector('#searchInput'),
  personFilter: document.querySelector('#personFilter'),
  departmentFilter: document.querySelector('#departmentFilter'),
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
  const [tasksResponse, resourcesResponse, meetingsResponse] = await Promise.all([
    fetch(`data/tasks.json?v=${dataVersion}`),
    fetch(`data/resources.json?v=${dataVersion}`),
    fetch(`data/meetings.json?v=${dataVersion}`).catch(() => null)
  ]);
  if (!tasksResponse.ok || !resourcesResponse.ok) {
    throw new Error('Could not load hub data. If previewing locally, serve the folder with a simple local web server.');
  }
  state.tasks = await tasksResponse.json();
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

function splitPeople(value) {
  const source = String(value || '');
  return teamMembers.filter(person => new RegExp(`\\b${person}\\b`, 'i').test(source));
}

function getPeople() {
  return teamMembers.filter(person => state.tasks.some(task => personMatches(task, person)));
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
  addOptions(els.personFilter, getPeople());
  addOptions(els.departmentFilter, [...new Set(state.tasks.map(task => task.department || task.category).filter(Boolean))].sort());
}

function getSearchText(task) {
  const linkedResources = (task.links || [])
    .map(linkId => state.resourceMap.get(linkId))
    .filter(Boolean)
    .map(resource => `${resource.label} ${resource.category} ${resource.tool} ${resource.useWhen}`);
  return [task.title, task.department, task.category, task.project, task.status, task.priority, task.owner, task.support, task.approves, task.due, task.tool, task.audience, task.deliverable, task.saveFinalIn, task.context, task.prompt, ...(task.nextSteps || []), ...linkedResources].join(' ').toLowerCase();
}

function personMatches(task, person) {
  if (person === 'all') return true;
  return [...splitPeople(task.owner), ...splitPeople(task.support), ...splitPeople(task.approves)].includes(person);
}

function filteredTasks() {
  const query = state.filters.search.trim().toLowerCase();
  return state.tasks
    .filter(task => !query || getSearchText(task).includes(query))
    .filter(task => state.filters.department === 'all' || (task.department || task.category) === state.filters.department)
    .filter(task => personMatches(task, state.filters.person))
    .sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99) || a.title.localeCompare(b.title));
}

function render() {
  const tasks = filteredTasks();
  els.resultsMeta.textContent = tasks.length === 1 ? '1 task found' : `${tasks.length} tasks found`;
  if (!tasks.some(task => task.id === state.selectedTaskId)) state.selectedTaskId = tasks[0]?.id || null;
  renderTaskList(tasks);
  renderTaskDetail(tasks.find(task => task.id === state.selectedTaskId));
}

function renderTaskList(tasks) {
  els.taskList.innerHTML = '';
  if (!tasks.length) {
    els.taskList.innerHTML = '<div class="empty-state">No matching tasks. Try a different person, department, or search term.</div>';
    return;
  }
  tasks.forEach(task => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `task-row ${task.id === state.selectedTaskId ? 'is-selected' : ''}`;
    button.innerHTML = `<span class="task-row-title">${escapeHtml(task.title)}</span><span class="task-row-meta">${escapeHtml(task.department || task.category)} · ${escapeHtml(task.due)} · ${escapeHtml(task.owner)}</span>`;
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
    els.taskDetail.innerHTML = '<div class="empty-state">Choose a task to see the details.</div>';
    return;
  }
  const links = (task.links || []).map(linkId => state.resourceMap.get(linkId)).filter(Boolean).map(resource => `<a href="${resource.url}" target="_blank" rel="noreferrer" title="${escapeHtml(resource.useWhen)}">${escapeHtml(resource.label)}</a>`).join('');
  const steps = (task.nextSteps || []).map(step => `<li>${escapeHtml(step)}</li>`).join('');
  els.taskDetail.innerHTML = `<article class="detail-card"><div class="card-topline"><span class="badge category">${escapeHtml(task.department || task.category)}</span><span class="badge status">${escapeHtml(task.status)}</span></div><h2>${escapeHtml(task.title)}</h2><p class="context">${escapeHtml(task.context)}</p><div class="next-action-block"><strong>Deliverable</strong><p>${escapeHtml(task.deliverable)}</p></div><dl class="meta-grid"><div><dt>Owner</dt><dd>${escapeHtml(task.owner)}</dd></div><div><dt>Support</dt><dd>${escapeHtml(task.support)}</dd></div><div><dt>Approves</dt><dd>${escapeHtml(task.approves)}</dd></div><div><dt>Due</dt><dd>${escapeHtml(task.due)}</dd></div><div><dt>Tool</dt><dd>${escapeHtml(task.tool)}</dd></div><div><dt>Save final in</dt><dd>${escapeHtml(task.saveFinalIn)}</dd></div></dl><div class="link-block"><strong>Use these links</strong><div class="links">${links}</div></div><details open><summary>Steps to complete</summary><ol class="next-steps">${steps}</ol></details><details><summary>Prompt starter</summary><p class="prompt">${escapeHtml(task.prompt)}</p><button class="copy-button" type="button">Copy prompt</button></details></article>`;
  els.taskDetail.querySelector('.copy-button').addEventListener('click', async event => {
    await navigator.clipboard.writeText(task.prompt);
    event.currentTarget.textContent = 'Copied';
    setTimeout(() => { event.currentTarget.textContent = 'Copy prompt'; }, 1200);
  });
}

function renderAndrewWork() {
  const andrewTasks = state.tasks.filter(task => personMatches(task, 'Andrew')).sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99) || a.title.localeCompare(b.title));
  if (!els.andrewWork) return;
  if (els.andrewMeta) els.andrewMeta.textContent = andrewTasks.length === 1 ? '1 item' : `${andrewTasks.length} items`;
  els.andrewWork.innerHTML = andrewTasks.map(task => `<button type="button" class="andrew-chip" data-task-id="${escapeHtml(task.id)}"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.department || task.category)} · ${escapeHtml(task.due)}</span></button>`).join('');
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
    els.meetingsList.innerHTML = '<div class="empty-state">No meetings loaded yet.</div>';
    return;
  }
  els.meetingsList.innerHTML = state.meetings.map(meeting => `<article class="meeting-card"><strong>${escapeHtml(meeting.title)}</strong><span>${escapeHtml(meeting.date)} · ${escapeHtml(meeting.time)}</span><p>${escapeHtml(meeting.purpose)}</p></article>`).join('');
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
    els.suggestionStatus.textContent = 'Suggestion submitted for Andrew review.';
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

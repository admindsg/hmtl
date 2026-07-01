const state = {
  tasks: [],
  resources: [],
  resourceMap: new Map(),
  selectedTaskId: null,
  filters: {
    search: '',
    person: 'all',
    department: 'all'
  }
};

const priorityRank = { High: 1, Medium: 2, Low: 3 };

const els = {
  searchInput: document.querySelector('#searchInput'),
  personFilter: document.querySelector('#personFilter'),
  departmentFilter: document.querySelector('#departmentFilter'),
  taskList: document.querySelector('#taskList'),
  taskDetail: document.querySelector('#taskDetail'),
  resourceGrid: document.querySelector('#resourceGrid'),
  resultsMeta: document.querySelector('#resultsMeta')
};

async function loadData() {
  const [tasksResponse, resourcesResponse] = await Promise.all([
    fetch('data/tasks.json'),
    fetch('data/resources.json')
  ]);

  if (!tasksResponse.ok || !resourcesResponse.ok) {
    throw new Error('Could not load hub data. If previewing locally, serve the folder with a simple local web server.');
  }

  state.tasks = await tasksResponse.json();
  state.resources = await resourcesResponse.json();
  state.resourceMap = new Map(state.resources.map(resource => [resource.id, resource]));
  state.selectedTaskId = state.tasks[0]?.id || null;

  populateFilters();
  renderResources();
  render();
}

function splitPeople(value) {
  return String(value || '')
    .replace(/\bif\b.*$/i, '')
    .replace(/Board Secretary/gi, '')
    .split(/\/|,|&| and | for |\//i)
    .map(name => name.trim())
    .filter(Boolean)
    .map(name => name.replace(/\s+support$/i, '').trim())
    .filter(name => !['Board', 'Admin support', 'Marketing support', 'delegated researcher'].includes(name));
}

function getPeople() {
  const people = new Set();
  state.tasks.forEach(task => {
    [...splitPeople(task.owner), ...splitPeople(task.support), ...splitPeople(task.approves)].forEach(person => people.add(person));
  });
  return [...people].sort();
}

function addOptions(select, values) {
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

  return [
    task.title,
    task.department,
    task.category,
    task.project,
    task.status,
    task.priority,
    task.owner,
    task.support,
    task.approves,
    task.due,
    task.tool,
    task.audience,
    task.deliverable,
    task.saveFinalIn,
    task.context,
    task.prompt,
    ...(task.nextSteps || []),
    ...linkedResources
  ].join(' ').toLowerCase();
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
    .sort((a, b) => (priorityRank[a.priority] || 99) - (priorityRank[b.priority] || 99) || a.title.localeCompare(b.title));
}

function render() {
  const tasks = filteredTasks();
  els.resultsMeta.textContent = tasks.length === 1 ? '1 task found' : `${tasks.length} tasks found`;

  if (!tasks.some(task => task.id === state.selectedTaskId)) {
    state.selectedTaskId = tasks[0]?.id || null;
  }

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
    button.innerHTML = `
      <span class="task-row-title">${escapeHtml(task.title)}</span>
      <span class="task-row-meta">${escapeHtml(task.department || task.category)} · ${escapeHtml(task.due)} · ${escapeHtml(task.owner)}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedTaskId = task.id;
      render();
      if (window.matchMedia('(max-width: 820px)').matches) {
        els.taskDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    els.taskList.appendChild(button);
  });
}

function renderTaskDetail(task) {
  if (!task) {
    els.taskDetail.innerHTML = '<div class="empty-state">Choose a task to see the details.</div>';
    return;
  }

  const links = (task.links || [])
    .map(linkId => state.resourceMap.get(linkId))
    .filter(Boolean)
    .map(resource => `<a href="${resource.url}" target="_blank" rel="noreferrer" title="${escapeHtml(resource.useWhen)}">${escapeHtml(resource.label)}</a>`)
    .join('');

  const steps = (task.nextSteps || [])
    .map(step => `<li>${escapeHtml(step)}</li>`)
    .join('');

  els.taskDetail.innerHTML = `
    <article class="detail-card">
      <div class="card-topline">
        <span class="badge category">${escapeHtml(task.department || task.category)}</span>
        <span class="badge status">${escapeHtml(task.status)}</span>
      </div>
      <h2>${escapeHtml(task.title)}</h2>
      <p class="context">${escapeHtml(task.context)}</p>

      <div class="next-action-block">
        <strong>Deliverable</strong>
        <p>${escapeHtml(task.deliverable)}</p>
      </div>

      <dl class="meta-grid">
        <div><dt>Owner</dt><dd>${escapeHtml(task.owner)}</dd></div>
        <div><dt>Support</dt><dd>${escapeHtml(task.support)}</dd></div>
        <div><dt>Approves</dt><dd>${escapeHtml(task.approves)}</dd></div>
        <div><dt>Due</dt><dd>${escapeHtml(task.due)}</dd></div>
        <div><dt>Tool</dt><dd>${escapeHtml(task.tool)}</dd></div>
        <div><dt>Save final in</dt><dd>${escapeHtml(task.saveFinalIn)}</dd></div>
      </dl>

      <div class="link-block">
        <strong>Use these links</strong>
        <div class="links">${links}</div>
      </div>

      <details open>
        <summary>Steps to complete</summary>
        <ol class="next-steps">${steps}</ol>
      </details>
      <details>
        <summary>Prompt starter</summary>
        <p class="prompt">${escapeHtml(task.prompt)}</p>
        <button class="copy-button" type="button">Copy prompt</button>
      </details>
    </article>
  `;

  els.taskDetail.querySelector('.copy-button').addEventListener('click', async event => {
    await navigator.clipboard.writeText(task.prompt);
    event.currentTarget.textContent = 'Copied';
    setTimeout(() => { event.currentTarget.textContent = 'Copy prompt'; }, 1200);
  });
}

function renderResources() {
  els.resourceGrid.innerHTML = '';
  const byCategory = new Map();

  state.resources.forEach(resource => {
    if (!byCategory.has(resource.category)) byCategory.set(resource.category, []);
    byCategory.get(resource.category).push(resource);
  });

  [...byCategory.entries()].sort().forEach(([category, resources]) => {
    const group = document.createElement('section');
    group.className = 'resource-group';
    group.innerHTML = `<h3>${escapeHtml(category)}</h3><div class="resource-cards"></div>`;
    const cards = group.querySelector('.resource-cards');

    resources.forEach(resource => {
      const card = document.createElement('article');
      card.className = 'resource-card';
      card.innerHTML = `
        <strong>${escapeHtml(resource.label)}</strong>
        <p>${escapeHtml(resource.useWhen)}</p>
        <a href="${resource.url}" target="_blank" rel="noreferrer">Open</a>
      `;
      cards.appendChild(card);
    });

    els.resourceGrid.appendChild(group);
  });
}

function setFilter(key, value) {
  state.filters[key] = value;
  render();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

els.searchInput.addEventListener('input', event => setFilter('search', event.target.value));
els.personFilter.addEventListener('change', event => setFilter('person', event.target.value));
els.departmentFilter.addEventListener('change', event => setFilter('department', event.target.value));

loadData().catch(error => {
  els.taskList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  els.taskDetail.innerHTML = '';
  if (els.resultsMeta) els.resultsMeta.textContent = 'Could not load tasks.';
  console.error(error);
});

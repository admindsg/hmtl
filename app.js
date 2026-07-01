const state = {
  tasks: [],
  resources: [],
  resourceMap: new Map(),
  filters: {
    search: '',
    category: 'all',
    tool: 'all',
    status: 'all',
    owner: 'all',
    sort: 'priority'
  }
};

const priorityRank = { High: 1, Medium: 2, Low: 3 };
const timingRank = {
  Immediate: 1,
  'This week': 2,
  'July 1': 3,
  'July 2': 4,
  'July 3': 5,
  'Next team call': 6
};

const els = {
  searchInput: document.querySelector('#searchInput'),
  categoryFilter: document.querySelector('#categoryFilter'),
  toolFilter: document.querySelector('#toolFilter'),
  statusFilter: document.querySelector('#statusFilter'),
  ownerFilter: document.querySelector('#ownerFilter'),
  sortSelect: document.querySelector('#sortSelect'),
  taskGrid: document.querySelector('#taskGrid'),
  resourceGrid: document.querySelector('#resourceGrid'),
  taskTemplate: document.querySelector('#taskTemplate'),
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

  populateFilters();
  renderResources();
  renderTasks();
}

function uniqueValues(key) {
  return [...new Set(state.tasks.map(task => task[key]).filter(Boolean))].sort();
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
  addOptions(els.categoryFilter, uniqueValues('category'));
  addOptions(els.toolFilter, uniqueValues('tool'));
  addOptions(els.statusFilter, uniqueValues('status'));
  addOptions(els.ownerFilter, uniqueValues('owner'));
}

function getSearchText(task) {
  const linkedResources = (task.links || [])
    .map(linkId => state.resourceMap.get(linkId))
    .filter(Boolean)
    .map(resource => `${resource.label} ${resource.category} ${resource.tool} ${resource.useWhen}`);

  return [
    task.title,
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

function filterTasks() {
  const query = state.filters.search.trim().toLowerCase();

  return state.tasks
    .filter(task => !query || getSearchText(task).includes(query))
    .filter(task => state.filters.category === 'all' || task.category === state.filters.category)
    .filter(task => state.filters.tool === 'all' || task.tool === state.filters.tool)
    .filter(task => state.filters.status === 'all' || task.status === state.filters.status)
    .filter(task => state.filters.owner === 'all' || task.owner === state.filters.owner)
    .sort(sortTasks);
}

function sortTasks(a, b) {
  switch (state.filters.sort) {
    case 'due':
      return (timingRank[a.due] || 99) - (timingRank[b.due] || 99) || a.title.localeCompare(b.title);
    case 'title':
      return a.title.localeCompare(b.title);
    case 'status':
      return a.status.localeCompare(b.status) || a.title.localeCompare(b.title);
    case 'priority':
    default:
      return (priorityRank[a.priority] || 99) - (priorityRank[b.priority] || 99) || a.title.localeCompare(b.title);
  }
}

function renderTasks() {
  const tasks = filterTasks();
  els.taskGrid.innerHTML = '';

  els.resultsMeta.textContent = tasks.length === 1
    ? 'Showing 1 matching task. Open the card, use the task links, then copy the prompt if helpful.'
    : `Showing ${tasks.length} matching tasks. Pick the card that matches your lane and open only what you need.`;

  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No matching tasks. Try searching a person, tool, folder, or project name.';
    els.taskGrid.appendChild(empty);
    return;
  }

  tasks.forEach(task => {
    const node = els.taskTemplate.content.cloneNode(true);

    node.querySelector('.category').textContent = task.category;
    node.querySelector('.status').textContent = task.status;
    node.querySelector('h3').textContent = task.title;
    node.querySelector('.context').textContent = task.context;
    node.querySelector('.owner').textContent = task.owner;
    node.querySelector('.support').textContent = task.support;
    node.querySelector('.approves').textContent = task.approves;
    node.querySelector('.due').textContent = task.due;
    node.querySelector('.tool').textContent = task.tool;
    node.querySelector('.save').textContent = task.saveFinalIn;
    node.querySelector('.deliverable').textContent = task.deliverable;
    node.querySelector('.prompt').textContent = task.prompt;

    const nextSteps = node.querySelector('.next-steps');
    (task.nextSteps || []).forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      nextSteps.appendChild(li);
    });

    const links = node.querySelector('.links');
    (task.links || []).forEach(linkId => {
      const resource = state.resourceMap.get(linkId);
      if (!resource) return;
      const a = document.createElement('a');
      a.href = resource.url;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = resource.label;
      a.title = resource.useWhen;
      links.appendChild(a);
    });

    const copyButton = node.querySelector('.copy-button');
    copyButton.addEventListener('click', async () => {
      await navigator.clipboard.writeText(task.prompt);
      copyButton.textContent = 'Copied';
      setTimeout(() => { copyButton.textContent = 'Copy prompt'; }, 1200);
    });

    els.taskGrid.appendChild(node);
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
    group.innerHTML = `<h3>${escapeHtml(category)}</h3>`;

    resources.forEach(resource => {
      const card = document.createElement('article');
      card.className = 'resource-card';
      card.innerHTML = `
        <div>
          <strong>${escapeHtml(resource.label)}</strong>
          <p>${escapeHtml(resource.useWhen)}</p>
        </div>
        <a href="${resource.url}" target="_blank" rel="noreferrer">Open</a>
      `;
      group.appendChild(card);
    });

    els.resourceGrid.appendChild(group);
  });
}

function setFilter(key, value) {
  state.filters[key] = value;
  renderTasks();
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
els.categoryFilter.addEventListener('change', event => setFilter('category', event.target.value));
els.toolFilter.addEventListener('change', event => setFilter('tool', event.target.value));
els.statusFilter.addEventListener('change', event => setFilter('status', event.target.value));
els.ownerFilter.addEventListener('change', event => setFilter('owner', event.target.value));
els.sortSelect.addEventListener('change', event => setFilter('sort', event.target.value));

loadData().catch(error => {
  els.taskGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  if (els.resultsMeta) els.resultsMeta.textContent = 'Could not load tasks.';
  console.error(error);
});

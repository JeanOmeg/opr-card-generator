import type { SavedList } from '../db';

export interface ListsViewCallbacks {
  onLoad: (saved: SavedList) => void;
  onRefresh: (saved: SavedList) => Promise<void>;
  onDelete: (saved: SavedList) => Promise<void>;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';

  const units: Array<{ label: string; secs: number }> = [
    { label: 'year', secs: 31536000 },
    { label: 'month', secs: 2592000 },
    { label: 'day', secs: 86400 },
    { label: 'hour', secs: 3600 },
    { label: 'minute', secs: 60 },
  ];

  for (const unit of units) {
    const value = Math.floor(seconds / unit.secs);
    if (value >= 1) {
      return `${value} ${unit.label}${value > 1 ? 's' : ''} ago`;
    }
  }
  return 'just now';
}

function createButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function createListItem(saved: SavedList, cb: ListsViewCallbacks): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'saved-list';

  const info = document.createElement('div');
  info.className = 'saved-list-info';

  const name = document.createElement('div');
  name.className = 'saved-list-name';
  name.textContent = saved.name || 'Unnamed list';

  const meta = document.createElement('div');
  meta.className = 'saved-list-meta';
  meta.textContent = `${saved.listPoints} / ${saved.pointsLimit} pts · ${saved.gameSystem.toUpperCase()}`;

  const when = document.createElement('div');
  when.className = 'saved-list-when';
  when.textContent = `Updated ${timeAgo(saved.updatedAt)}`;

  info.append(name, meta, when);

  const actions = document.createElement('div');
  actions.className = 'saved-list-actions';

  const loadButton = createButton('Load', 'saved-list-btn');
  loadButton.title = 'Load this list instantly from your saved copy.';
  loadButton.addEventListener('click', () => cb.onLoad(saved));

  const refreshButton = createButton('Refresh', 'saved-list-btn');
  refreshButton.title =
    'Update this list with its latest version saved on Army Forge. Only runs when you click it.';
  refreshButton.addEventListener('click', () => {
    refreshButton.disabled = true;
    refreshButton.textContent = 'Refreshing...';
    void cb.onRefresh(saved).finally(() => {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Refresh';
    });
  });

  const deleteButton = createButton('Delete', 'saved-list-btn saved-list-btn--danger');
  deleteButton.title = 'Remove this list from your saved lists.';
  deleteButton.addEventListener('click', () => {
    if (!window.confirm(`Remove "${saved.name || 'this list'}" from your saved lists?`)) {
      return;
    }
    deleteButton.disabled = true;
    void cb.onDelete(saved);
  });

  actions.append(loadButton, refreshButton, deleteButton);
  item.append(info, actions);
  return item;
}

export function renderListsView(
  container: HTMLElement,
  lists: SavedList[],
  cb: ListsViewCallbacks,
): void {
  container.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'view-title';
  title.textContent = 'My Lists';
  container.append(title);

  if (lists.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'view-placeholder';
    empty.textContent =
      'No saved lists yet. Generate cards on the Home page and they will be saved here automatically.';
    container.append(empty);
    return;
  }

  const listEl = document.createElement('div');
  listEl.className = 'saved-lists';
  for (const saved of lists) {
    listEl.append(createListItem(saved, cb));
  }
  container.append(listEl);
}

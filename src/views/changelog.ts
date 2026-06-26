import changelog from '../data/changelog.json';

export interface ChangelogEntry {
  date: string;
  items: string[];
}

// Turn an item string into DOM nodes, converting **bold** spans into <strong>
// so the data file stays plain text instead of raw HTML.
function appendFormatted(target: HTMLElement, text: string): void {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  parts.forEach((part, index) => {
    if (!part) return;
    if (index % 2 === 1) {
      const strong = document.createElement('strong');
      strong.textContent = part;
      target.appendChild(strong);
    } else {
      target.appendChild(document.createTextNode(part));
    }
  });
}

function createEntry(entry: ChangelogEntry): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'changelog-entry';

  const date = document.createElement('h2');
  date.className = 'changelog-date';
  date.textContent = entry.date;

  const list = document.createElement('ul');
  list.className = 'changelog-list';
  for (const item of entry.items) {
    const li = document.createElement('li');
    appendFormatted(li, item);
    list.appendChild(li);
  }

  wrapper.append(date, list);
  return wrapper;
}

/** Render the changelog entries (newest first) into `container`. */
export function renderChangelog(container: HTMLElement): void {
  container.replaceChildren();
  for (const entry of changelog as ChangelogEntry[]) {
    container.appendChild(createEntry(entry));
  }
}

import { extractArmyId, fetchArmy } from './src/api';
import {
  deleteList,
  getList,
  getLists,
  pruneCardImages,
  saveList,
  type SavedList,
} from './src/db';
import {
  downloadAllCards,
  renderCards,
  renderSpecialRulesTable,
  renderSpellsTable,
  unitImageId,
} from './src/render';
import { initRouter, onRouteEnter } from './src/router';
import type { ArmyList } from './src/types';
import { renderChangelog } from './src/views/changelog';
import { renderListsView, type ListsViewCallbacks } from './src/views/lists';

const cardsContainerElement = document.getElementById('cards');
const inputElementElement = document.getElementById('armyLink');
const generateButton = document.getElementById('btnGenerate') as HTMLButtonElement | null;
const printButton = document.getElementById('btnPrint');
const downloadAllButton = document.getElementById('btnDownloadAll') as HTMLButtonElement | null;
const refreshButton = document.getElementById('btnRefresh') as HTMLButtonElement | null;
const printOptions = document.querySelector('.print-options') as HTMLElement | null;
const includeCardsCheckbox = document.getElementById('optCards') as HTMLInputElement | null;
const includeRulesCheckbox = document.getElementById('optRules') as HTMLInputElement | null;
const includeSpellsCheckbox = document.getElementById('optSpells') as HTMLInputElement | null;
const combineUnitsCheckbox = document.getElementById('optCombine') as HTMLInputElement | null;
const specialRulesSection = document.getElementById('special-rules');
const spellsSection = document.getElementById('spells');
const listsView = document.getElementById('view-lists');
const changelogEntries = document.getElementById('changelog-entries');

if (!(cardsContainerElement instanceof HTMLDivElement)) {
  throw new Error('Missing #cards container.');
}

if (!(inputElementElement instanceof HTMLInputElement)) {
  throw new Error('Missing #armyLink input.');
}

const cardsContainer = cardsContainerElement;
const inputElement = inputElementElement;

const DEFAULT_DOCUMENT_TITLE = document.title;

// The army currently on screen, so "Refresh List" knows what to re-fetch and the
// "Combine similar units" toggle can re-render without re-fetching.
let currentArmyId: string | null = null;
let currentInput = '';
let currentArmy: ArmyList | null = null;

function setDocumentTitle(listName?: string): void {
  const name = listName?.trim();
  document.title = name ? `${DEFAULT_DOCUMENT_TITLE} - ${name}` : DEFAULT_DOCUMENT_TITLE;
}

function setPrintControlsVisible(visible: boolean): void {
  if (printButton) printButton.style.display = visible ? '' : 'none';
  if (downloadAllButton) downloadAllButton.style.display = visible ? '' : 'none';
  if (refreshButton) refreshButton.style.display = visible ? '' : 'none';
  if (printOptions) printOptions.style.display = visible ? '' : 'none';
}

function setMessage(message: string, type: 'loading' | 'error' | 'empty' = 'empty'): void {
  setPrintControlsVisible(false);
  setDocumentTitle();
  cardsContainer.replaceChildren();
  specialRulesSection?.replaceChildren();
  spellsSection?.replaceChildren();

  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;

  cardsContainer.appendChild(messageElement);
}

function displayArmy(army: ArmyList, input: string): void {
  currentArmyId = army.id || null;
  currentInput = input;
  currentArmy = army;

  const unitCount = renderCards(cardsContainer, army, combineUnitsCheckbox?.checked ?? true);

  if (unitCount === 0) {
    setMessage('This army list did not return any units.', 'empty');
  } else {
    setDocumentTitle(army.name);
    setPrintControlsVisible(true);
  }

  if (specialRulesSection) renderSpecialRulesTable(specialRulesSection, army);
  if (spellsSection) renderSpellsTable(spellsSection, army);
}

/** Fetch from the relay, then render and cache the result. */
async function fetchAndShow(armyId: string, input: string): Promise<void> {
  setMessage('Loading army list...', 'loading');
  generateButton?.setAttribute('disabled', 'true');

  try {
    const army = await fetchArmy(armyId);
    displayArmy(army, input);

    if (army.id) {
      try {
        await saveList(army, input);
      } catch (saveError) {
        console.error('Failed to save list:', saveError);
      }
    }
  } catch (error) {
    console.error(error);
    setMessage(
      'Could not load this army list. Check the link, try again, or verify whether the browser blocked the request.',
      'error',
    );
  } finally {
    generateButton?.removeAttribute('disabled');
  }
}

async function loadArmy(): Promise<void> {
  const input = inputElement.value.trim();
  const armyId = extractArmyId(input);

  if (!armyId) {
    setMessage('Paste a shared Army Forge link or list ID.', 'error');
    inputElement.focus();
    return;
  }

  localStorage.setItem('lastArmyInput', input);

  // Cache-first: if this list is already saved, show it instantly (works
  // offline). The user clicks "Refresh List" to pull the latest when needed.
  try {
    const cached = await getList(armyId);
    if (cached) {
      displayArmy(cached.payload, cached.input);
      return;
    }
  } catch (error) {
    console.error('Failed to read cached list:', error);
  }

  await fetchAndShow(armyId, input);
}

// After a refresh, drop saved card images for units no longer in the list.
// Units still present (even when combined into another card) are kept.
async function pruneRemovedUnitImages(army: ArmyList): Promise<void> {
  if (!army.id) return;
  const keep = new Set((Array.isArray(army.units) ? army.units : []).map(unitImageId));
  try {
    await pruneCardImages(army.id, keep);
  } catch (error) {
    console.error('Failed to prune card images:', error);
  }
}

/** Re-fetch the army on screen from the relay and refresh the cached copy. */
async function refreshArmy(): Promise<void> {
  if (!currentArmyId) return;

  const id = currentArmyId;
  const input = currentInput || id;
  refreshButton?.setAttribute('disabled', 'true');

  try {
    const army = await fetchArmy(id);
    await pruneRemovedUnitImages(army);
    displayArmy(army, input);
    try {
      await saveList(army, input);
    } catch (saveError) {
      console.error('Failed to save list:', saveError);
    }
  } catch (error) {
    console.error(error);
    window.alert('Could not refresh this list. Check your connection and try again.');
  } finally {
    refreshButton?.removeAttribute('disabled');
  }
}

generateButton?.addEventListener('click', loadArmy);
refreshButton?.addEventListener('click', () => void refreshArmy());
printButton?.addEventListener('click', () => window.print());
downloadAllButton?.addEventListener('click', () => {
  if (!downloadAllButton) return;
  downloadAllButton.disabled = true;
  void downloadAllCards(cardsContainer).finally(() => {
    downloadAllButton.disabled = false;
  });
});

function bindPrintToggle(checkbox: HTMLInputElement | null, bodyClass: string): void {
  if (!checkbox) return;
  const apply = (): void => {
    document.body.classList.toggle(bodyClass, !checkbox.checked);
  };
  checkbox.addEventListener('change', apply);
  apply();
}

bindPrintToggle(includeCardsCheckbox, 'print-hide-cards');
bindPrintToggle(includeRulesCheckbox, 'print-hide-rules');
bindPrintToggle(includeSpellsCheckbox, 'print-hide-spells');

// Unlike the print toggles, combining changes the cards themselves, so re-render
// the army on screen (no re-fetch needed) whenever it flips.
combineUnitsCheckbox?.addEventListener('change', () => {
  if (currentArmy) {
    renderCards(cardsContainer, currentArmy, combineUnitsCheckbox.checked);
  }
});
inputElement.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    void loadArmy();
  }
});

const listsCallbacks: ListsViewCallbacks = {
  onLoad: (saved: SavedList) => {
    inputElement.value = saved.input;
    localStorage.setItem('lastArmyInput', saved.input);
    displayArmy(saved.payload, saved.input);
    window.location.hash = '#/';
  },
  onRefresh: async (saved: SavedList) => {
    try {
      const army = await fetchArmy(saved.id);
      await pruneRemovedUnitImages(army);
      await saveList(army, saved.input);
    } catch (error) {
      console.error('Failed to refresh list:', error);
      window.alert('Could not refresh this list. Check your connection and try again.');
    }
    await refreshListsView();
  },
  onDelete: async (saved: SavedList) => {
    await deleteList(saved.id);
    await refreshListsView();
  },
};

async function refreshListsView(): Promise<void> {
  if (!listsView) return;
  const lists = await getLists();
  renderListsView(listsView, lists, listsCallbacks);
}

onRouteEnter('/lists', () => {
  void refreshListsView();
});

if (changelogEntries) renderChangelog(changelogEntries);

inputElement.value = localStorage.getItem('lastArmyInput') ?? '';
setPrintControlsVisible(false);

initRouter();

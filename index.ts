import { extractArmyId, fetchArmy } from './src/api';
import { deleteList, getLists, saveList, type SavedList } from './src/db';
import {
  downloadAllCards,
  renderCards,
  renderSpecialRulesTable,
  renderSpellsTable,
} from './src/render';
import { initRouter, onRouteEnter } from './src/router';
import type { ArmyList } from './src/types';
import { renderListsView, type ListsViewCallbacks } from './src/views/lists';

const cardsContainerElement = document.getElementById('cards');
const inputElementElement = document.getElementById('armyLink');
const generateButton = document.getElementById('btnGenerate') as HTMLButtonElement | null;
const printButton = document.getElementById('btnPrint');
const downloadAllButton = document.getElementById('btnDownloadAll') as HTMLButtonElement | null;
const printOptions = document.querySelector('.print-options') as HTMLElement | null;
const includeCardsCheckbox = document.getElementById('optCards') as HTMLInputElement | null;
const includeRulesCheckbox = document.getElementById('optRules') as HTMLInputElement | null;
const includeSpellsCheckbox = document.getElementById('optSpells') as HTMLInputElement | null;
const specialRulesSection = document.getElementById('special-rules');
const spellsSection = document.getElementById('spells');
const listsView = document.getElementById('view-lists');

if (!(cardsContainerElement instanceof HTMLDivElement)) {
  throw new Error('Missing #cards container.');
}

if (!(inputElementElement instanceof HTMLInputElement)) {
  throw new Error('Missing #armyLink input.');
}

const cardsContainer = cardsContainerElement;
const inputElement = inputElementElement;

const DEFAULT_DOCUMENT_TITLE = document.title;

function setDocumentTitle(listName?: string): void {
  const name = listName?.trim();
  document.title = name ? `${DEFAULT_DOCUMENT_TITLE} - ${name}` : DEFAULT_DOCUMENT_TITLE;
}

function setPrintControlsVisible(visible: boolean): void {
  if (printButton) printButton.style.display = visible ? '' : 'none';
  if (downloadAllButton) downloadAllButton.style.display = visible ? '' : 'none';
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

function displayArmy(army: ArmyList): void {
  const unitCount = renderCards(cardsContainer, army);

  if (unitCount === 0) {
    setMessage('This army list did not return any units.', 'empty');
  } else {
    setDocumentTitle(army.name);
    setPrintControlsVisible(true);
  }

  if (specialRulesSection) renderSpecialRulesTable(specialRulesSection, army);
  if (spellsSection) renderSpellsTable(spellsSection, army);
}

async function loadArmy(): Promise<void> {
  const armyId = extractArmyId(inputElement.value);

  if (!armyId) {
    setMessage('Paste a shared Army Forge link or list ID.', 'error');
    inputElement.focus();
    return;
  }

  setMessage('Loading army list...', 'loading');
  generateButton?.setAttribute('disabled', 'true');

  try {
    const army = await fetchArmy(armyId);
    localStorage.setItem('lastArmyInput', inputElement.value.trim());
    displayArmy(army);

    if (army.id) {
      try {
        await saveList(army, inputElement.value.trim());
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

generateButton?.addEventListener('click', loadArmy);
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
inputElement.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    void loadArmy();
  }
});

const listsCallbacks: ListsViewCallbacks = {
  onLoad: (saved: SavedList) => {
    inputElement.value = saved.input;
    localStorage.setItem('lastArmyInput', saved.input);
    displayArmy(saved.payload);
    window.location.hash = '#/';
  },
  onRefresh: async (saved: SavedList) => {
    try {
      const army = await fetchArmy(saved.id);
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

inputElement.value = localStorage.getItem('lastArmyInput') ?? '';
setPrintControlsVisible(false);

initRouter();

import html2canvas from 'html2canvas';

interface WeaponSpecialRule {
  type: string;
  id: string;
  name: string;
  rating?: number;
  label: string;
  content?: WeaponSpecialRule[];
}

interface Weapon {
  id: string;
  name: string;
  type: string;
  range: number;
  attacks: number;
  weaponId: string;
  specialRules: WeaponSpecialRule[];
  attacksMultiplier: number;
  label: string;
  count: number;
  originalCount: number;
  content?: WeaponSpecialRule[];
}

interface UnitRule {
  id: string;
  name: string;
  label: string;
  rating?: number;
}

interface Bases {
  round: string;
  square: string;
}

interface Unit {
  id: string;
  cost: number;
  name: string;
  size: number;
  bases?: Bases;
  items: unknown[];
  rules: UnitRule[];
  valid: boolean;
  defense: number;
  quality: number;
  weapons: Weapon[];
  upgrades: string[];
  genericName: string;
  hasCustomRule: boolean;
  disabledSections: unknown[];
  hasBalanceInvalid: boolean;
  originalSize: number;
  disabledUpgradeSections: unknown[];
  armyId: string;
  xp: number;
  notes: string | null;
  traits: unknown[];
  combined: boolean;
  joinToUnit: string | null;
  selectionId: string;
  selectedUpgrades: unknown[];
  loadout: Weapon[];
}

interface ArmySpecialRule {
  id: string;
  name: string;
  aliasedRuleId: string | null;
  description: string;
  hasRating: boolean | null;
  coreType: number | null;
  targetType: number;
}

interface Spell {
  id: string;
  name: string;
  threshold: number;
  effect: string;
}

interface ArmyList {
  id: string;
  name: string;
  isCloud: boolean;
  forceOrg: boolean;
  modified: string;
  gameSystem: string;
  modelCount: number;
  simpleMode: boolean;
  description: string;
  pointsLimit: number;
  campaignMode: boolean;
  cloudModified: string;
  narrativeMode: boolean;
  activationCount: number;
  includeVehicles: boolean;
  listPoints: number;
  units: Unit[];
  specialRules: ArmySpecialRule[];
  forceOrgErrors: unknown[];
  spells?: Spell[];
}

// The front-end is hosted on GitHub Pages and the relay runs as a Netlify
// Function on a different origin, so production calls the relay by its absolute
// URL (and the function sends CORS headers). During local dev the front-end is
// served by Parcel while the relay runs as the Express server on port 3000.
//
// After your first Netlify deploy, replace this with your site URL — e.g.
// https://opr-card-relay.netlify.app — with no trailing slash.
const PROD_RELAY_BASE = 'https://opr-card-generator.netlify.app';

const isLocalDev =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocalDev ? 'http://localhost:3000' : PROD_RELAY_BASE;
const API_URL = `${API_BASE}/army`;

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

function extractArmyId(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.searchParams.get('id');
  } catch {
    return trimmed.match(/^[a-zA-Z0-9_-]+$/) ? trimmed : null;
  }
}

function getRules(unit: Unit): UnitRule[] {
  return Array.isArray(unit.rules) ? unit.rules : [];
}

function isWeapon(item: Weapon): boolean {
  return typeof item.attacks === 'number';
}

function getWeapons(unit: Unit): Weapon[] {
  return Array.isArray(unit.loadout) ? unit.loadout.filter(isWeapon) : [];
}

function getUpgrades(unit: Unit): Weapon[] {
  return Array.isArray(unit.loadout) ? unit.loadout.filter((item) => !isWeapon(item)) : [];
}

function getWeaponSpecialRules(weapon: Weapon): WeaponSpecialRule[] {
  return Array.isArray(weapon.specialRules) ? weapon.specialRules : [];
}

function getTough(unit: Unit): string {
  const rule = getRules(unit).find((item) => item.name === 'Tough');
  return rule?.rating?.toString() ?? '-';
}

function getBaseLabel(unit: Unit): string {
  const roundBase = unit.bases?.round;
  return roundBase ? `Base ${roundBase} mm` : 'Base ?';
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

function createTextElement(className: string, text: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

function createStat(label: string, value: string): HTMLDivElement {
  const stat = document.createElement('div');
  stat.className = 'stat';
  stat.append(
    createTextElement('stat-label', label),
    createTextElement('stat-value', value),
  );
  return stat;
}

function createWeaponElement(weapon: Weapon): HTMLDivElement {
  return createTextElement('weapon-chip', weapon.label);
}

function createRulesContainer(unit: Unit): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'rules-container';

  const rules = getRules(unit).filter((rule) => rule.name !== 'Tough');
  const upgrades = getUpgrades(unit);

  if (rules.length === 0 && upgrades.length === 0) {
    container.appendChild(createTextElement('muted', 'No special rules'));
    return container;
  }

  const addPill = (text: string): void => {
    const pill = document.createElement('span');
    pill.className = 'rule-pill';
    pill.textContent = text;
    container.appendChild(pill);
  };

  for (const rule of rules) addPill(rule.label);
  for (const upgrade of upgrades) addPill(upgrade.label);

  return container;
}

function isHero(unit: Unit): boolean {
  return getRules(unit).some((r) => r.name === 'Hero');
}

const DEFAULT_BG_OPACITY = 1;

const MIN_BG_SCALE = 0.1;
const MAX_BG_SCALE = 4;
const DEFAULT_BG_SCALE = 1;

interface CardImageState {
  scale: number;
  tx: number;
  ty: number;
  zoomSlider?: HTMLInputElement;
}

const cardImageStates = new WeakMap<HTMLDivElement, CardImageState>();

function getCardImageState(card: HTMLDivElement): CardImageState {
  let state = cardImageStates.get(card);
  if (!state) {
    state = { scale: DEFAULT_BG_SCALE, tx: 0, ty: 0 };
    cardImageStates.set(card, state);
  }
  return state;
}

function fitBgCover(card: HTMLDivElement, img: HTMLImageElement): void {
  const cardW = card.clientWidth;
  const cardH = card.clientHeight;
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (!cardW || !cardH || !natW || !natH) return;

  const coverScale = Math.max(cardW / natW, cardH / natH);
  img.style.width = `${natW * coverScale}px`;
  img.style.height = `${natH * coverScale}px`;
}

const MIN_VISIBLE_FRACTION = 0.25;

function getPanBounds(card: HTMLDivElement): { maxX: number; maxY: number } {
  const img = card.querySelector<HTMLImageElement>('.card-bg');
  if (!img) return { maxX: 0, maxY: 0 };
  const state = getCardImageState(card);
  const overflowX = (img.offsetWidth * state.scale - card.clientWidth) / 2;
  const overflowY = (img.offsetHeight * state.scale - card.clientHeight) / 2;
  const freeX = card.clientWidth * (1 - MIN_VISIBLE_FRACTION);
  const freeY = card.clientHeight * (1 - MIN_VISIBLE_FRACTION);
  return {
    maxX: Math.max(0, overflowX + freeX),
    maxY: Math.max(0, overflowY + freeY),
  };
}

function clampPan(card: HTMLDivElement, state: CardImageState): void {
  const { maxX, maxY } = getPanBounds(card);
  state.tx = Math.max(-maxX, Math.min(maxX, state.tx));
  state.ty = Math.max(-maxY, Math.min(maxY, state.ty));
}

function applyBgTransform(card: HTMLDivElement): void {
  const state = getCardImageState(card);
  card.style.setProperty('--card-bg-scale', state.scale.toString());
  card.style.setProperty('--card-bg-tx', `${state.tx}px`);
  card.style.setProperty('--card-bg-ty', `${state.ty}px`);
  const { maxX, maxY } = getPanBounds(card);
  card.classList.toggle('card--pannable', maxX > 0 || maxY > 0);
}

function setCardScale(card: HTMLDivElement, scale: number): void {
  const state = getCardImageState(card);
  state.scale = Math.max(MIN_BG_SCALE, Math.min(MAX_BG_SCALE, scale));
  clampPan(card, state);
  applyBgTransform(card);
  if (state.zoomSlider) state.zoomSlider.value = state.scale.toString();
}

function resetCardFraming(card: HTMLDivElement): void {
  const state = getCardImageState(card);
  state.scale = DEFAULT_BG_SCALE;
  state.tx = 0;
  state.ty = 0;
  applyBgTransform(card);
  if (state.zoomSlider) state.zoomSlider.value = state.scale.toString();
}

function setCardImage(card: HTMLDivElement, src: string | null): void {
  let img = card.querySelector<HTMLImageElement>('.card-bg');

  if (!src) {
    img?.remove();
    card.classList.remove('card--has-image');
    card.title = 'Click to add a background image';
    return;
  }

  if (!img) {
    img = document.createElement('img');
    img.className = 'card-bg';
    img.alt = '';
    card.insertBefore(img, card.firstChild);
  }

  const imageEl = img;
  imageEl.addEventListener(
    'load',
    () => {
      fitBgCover(card, imageEl);
      applyBgTransform(card);
    },
    { once: true },
  );

  img.src = src;
  card.classList.add('card--has-image');
  card.title = 'Drag to move · scroll to zoom · ✕ to remove';
  resetCardFraming(card);
}

function enableCardImagePanZoom(card: HTMLDivElement): void {
  let active = false;
  let startX = 0;
  let startY = 0;
  let baseTx = 0;
  let baseTy = 0;

  card.addEventListener('pointerdown', (event) => {
    if (!card.classList.contains('card--has-image')) return;
    if ((event.target as HTMLElement).closest('.card-bg-remove')) return;

    const state = getCardImageState(card);
    active = true;
    startX = event.clientX;
    startY = event.clientY;
    baseTx = state.tx;
    baseTy = state.ty;
    card.setPointerCapture(event.pointerId);
    card.classList.add('card--panning');
  });

  card.addEventListener('pointermove', (event) => {
    if (!active) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const state = getCardImageState(card);
    state.tx = baseTx + dx;
    state.ty = baseTy + dy;
    clampPan(card, state);
    applyBgTransform(card);
  });

  const endDrag = (event: PointerEvent): void => {
    if (!active) return;
    active = false;
    card.classList.remove('card--panning');
    if (card.hasPointerCapture(event.pointerId)) {
      card.releasePointerCapture(event.pointerId);
    }
  };
  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);

  card.addEventListener(
    'wheel',
    (event) => {
      if (!card.classList.contains('card--has-image')) return;
      event.preventDefault();
      const state = getCardImageState(card);
      const step = event.deltaY < 0 ? 0.1 : -0.1;
      setCardScale(card, state.scale + step);
    },
    { passive: false },
  );
}

function enableCardImageUpload(card: HTMLDivElement): void {
  card.classList.add('card--clickable');
  card.title = 'Click to add a background image';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'card-bg-remove';
  removeButton.textContent = '✕';
  removeButton.title = 'Remove image';
  removeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setCardImage(card, null);
  });
  card.appendChild(removeButton);

  enableCardImagePanZoom(card);

  card.addEventListener('click', () => {
    if (card.classList.contains('card--has-image')) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => setCardImage(card, reader.result as string);
      reader.readAsDataURL(file);
    });
    input.click();
  });
}

function createSliderRow(
  label: string,
  options: { min: string; max: string; step: string; value: string },
  onInput: (value: string) => void,
): { row: HTMLLabelElement; slider: HTMLInputElement } {
  const row = document.createElement('label');
  row.className = 'toolbar-row';

  const text = document.createElement('span');
  text.className = 'toolbar-label';
  text.textContent = label;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'toolbar-slider';
  slider.min = options.min;
  slider.max = options.max;
  slider.step = options.step;
  slider.value = options.value;
  slider.setAttribute('aria-label', label);
  slider.addEventListener('input', () => onInput(slider.value));

  row.append(text, slider);
  return { row, slider };
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'card';
}

async function renderCardToBlob(card: HTMLDivElement): Promise<Blob | null> {
  const canvas = await html2canvas(card, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    ignoreElements: (element) => element.classList.contains('card-bg-remove'),
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function downloadCardPng(card: HTMLDivElement, filename: string): Promise<void> {
  const blob = await renderCardToBlob(card);
  if (blob) triggerBlobDownload(blob, filename);
}

async function downloadAllCards(): Promise<void> {
  const cards = Array.from(cardsContainer.querySelectorAll<HTMLDivElement>('.card'));
  for (const [index, card] of cards.entries()) {
    const name = sanitizeFilename(card.dataset.unitName ?? `card-${index + 1}`);
    const prefix = String(index + 1).padStart(2, '0');
    await downloadCardPng(card, `${prefix}-${name}.png`);
  }
}

function createDownloadButton(card: HTMLDivElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toolbar-download';
  button.title = 'Download card as PNG';
  button.setAttribute('aria-label', 'Download card as PNG');
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>' +
    '<span>PNG</span>';
  button.addEventListener('click', () => {
    const name = sanitizeFilename(card.dataset.unitName ?? 'card');
    button.disabled = true;
    void downloadCardPng(card, `${name}.png`).finally(() => {
      button.disabled = false;
    });
  });
  return button;
}

function wrapCardWithToolbar(card: HTMLDivElement): HTMLDivElement {
  card.style.setProperty('--card-bg-opacity', DEFAULT_BG_OPACITY.toString());
  applyBgTransform(card);

  const wrapper = document.createElement('div');
  wrapper.className = 'card-wrapper';

  const toolbar = document.createElement('div');
  toolbar.className = 'card-toolbar';

  const opacity = createSliderRow(
    'Opacity',
    { min: '0', max: '1', step: '0.05', value: DEFAULT_BG_OPACITY.toString() },
    (value) => card.style.setProperty('--card-bg-opacity', value),
  );

  const zoom = createSliderRow(
    'Zoom',
    {
      min: MIN_BG_SCALE.toString(),
      max: MAX_BG_SCALE.toString(),
      step: '0.05',
      value: DEFAULT_BG_SCALE.toString(),
    },
    (value) => setCardScale(card, parseFloat(value)),
  );
  getCardImageState(card).zoomSlider = zoom.slider;

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'toolbar-reset';
  reset.textContent = 'Recenter';
  reset.title = 'Reset zoom and position';
  reset.addEventListener('click', () => resetCardFraming(card));

  const imageControls = document.createElement('div');
  imageControls.className = 'card-toolbar-image-controls';
  imageControls.append(opacity.row, zoom.row, reset);

  const actions = document.createElement('div');
  actions.className = 'card-toolbar-actions';
  actions.append(createDownloadButton(card));

  toolbar.append(imageControls, actions);
  wrapper.append(card, toolbar);
  return wrapper;
}

function createCard(unit: Unit): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.unitName = unit.name || 'Unnamed unit';

  const hero = isHero(unit);
  const modelsLabel = unit.size === 1 ? '1 model' : `${unit.size} models`;
  const costParts = [`${unit.cost} pts`, modelsLabel];
  if (unit.xp > 0) costParts.push(`XP ${unit.xp}`);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.append(
    createTextElement('card-name', unit.name || 'Unnamed unit'),
    createTextElement('card-subtitle', unit.genericName || ''),
    createTextElement('card-cost', costParts.join(' · ')),
  );

  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.append(
    createStat('Quality', `${unit.quality}+`),
    createStat('Defense', `${unit.defense}+`),
    createStat('Tough', getTough(unit)),
  );

  const weaponsContainer = document.createElement('div');
  weaponsContainer.className = 'weapons-container';

  const weapons = getWeapons(unit);
  if (weapons.length === 0) {
    weaponsContainer.appendChild(createTextElement('muted', 'No weapons'));
  } else {
    for (const weapon of weapons) {
      weaponsContainer.appendChild(createWeaponElement(weapon));
    }
  }

  card.append(
    header,
    createTextElement('base-info', getBaseLabel(unit)),
    stats,
    createTextElement('section-title', 'Special Rules'),
    createRulesContainer(unit),
    createTextElement('section-title', 'Weapons'),
    weaponsContainer,
  );

  if (unit.notes) {
    card.appendChild(createTextElement('card-notes', unit.notes));
  }

  enableCardImageUpload(card);

  return card;
}

function renderSpecialRulesTable(army: ArmyList): void {
  if (!specialRulesSection) return;
  specialRulesSection.replaceChildren();

  const usedIds = new Set<string>();
  const collect = (entries: WeaponSpecialRule[] | undefined): void => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (entry.id) usedIds.add(entry.id);
      collect(entry.content);
    }
  };

  const units = Array.isArray(army.units) ? army.units : [];
  for (const unit of units) {
    for (const rule of getRules(unit)) usedIds.add(rule.id);
    for (const weapon of getWeapons(unit)) {
      collect(getWeaponSpecialRules(weapon));
      collect(weapon.content);
    }
    for (const upgrade of getUpgrades(unit)) {
      collect(getWeaponSpecialRules(upgrade));
      collect(upgrade.content);
    }
  }

  const armySpecialRules = Array.isArray(army.specialRules) ? army.specialRules : [];
  const sorted = armySpecialRules
    .filter((r) => usedIds.has(r.id) || (r.aliasedRuleId != null && usedIds.has(r.aliasedRuleId)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const table = document.createElement('table');
  table.className = 'special-rules-table';

  const thead = document.createElement('thead');

  const armyRow = document.createElement('tr');
  const armyCell = document.createElement('th');
  armyCell.colSpan = 2;
  armyCell.className = 'army-header-cell';
  armyCell.append(
    createTextElement('army-info-name', army.name),
    createTextElement(
      'army-info-meta',
      `${army.listPoints} / ${army.pointsLimit} pts · ${army.gameSystem.toUpperCase()}`,
    ),
  );
  armyRow.appendChild(armyCell);
  thead.appendChild(armyRow);

  if (sorted.length > 0) {
    const headerRow = document.createElement('tr');
    for (const text of ['Rule', 'Description']) {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
  }

  const tbody = document.createElement('tbody');
  for (const rule of sorted) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.className = 'rule-name';
    nameTd.textContent = rule.name;

    const descTd = document.createElement('td');
    descTd.textContent = rule.description;

    tr.append(nameTd, descTd);
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  specialRulesSection.append(table);
}

function renderSpellsTable(army: ArmyList): void {
  if (!spellsSection) return;
  spellsSection.replaceChildren();

  const spells = Array.isArray(army.spells) ? army.spells : [];
  if (spells.length === 0) return;

  const sorted = [...spells].sort(
    (a, b) => a.threshold - b.threshold || a.name.localeCompare(b.name),
  );

  const table = document.createElement('table');
  table.className = 'special-rules-table spells-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const text of ['Cost', 'Spell', 'Effect']) {
    const th = document.createElement('th');
    th.textContent = text;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  for (const spell of sorted) {
    const tr = document.createElement('tr');

    const costTd = document.createElement('td');
    costTd.className = 'spell-cost';
    costTd.textContent = spell.threshold.toString();

    const nameTd = document.createElement('td');
    nameTd.className = 'rule-name';
    nameTd.textContent = spell.name;

    const effectTd = document.createElement('td');
    effectTd.textContent = spell.effect;

    tr.append(costTd, nameTd, effectTd);
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  spellsSection.append(table);
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
    const url = new URL(API_URL, window.location.origin);
    url.searchParams.set('id', armyId);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Army Forge returned ${response.status}.`);
    }

    const army = (await response.json()) as ArmyList;
    localStorage.setItem('lastArmyInput', inputElement.value.trim());
    renderCards(army);
    renderSpecialRulesTable(army);
    renderSpellsTable(army);
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

function renderCards(army: ArmyList): void {
  cardsContainer.replaceChildren();

  const units = Array.isArray(army.units) ? army.units : [];

  if (units.length === 0) {
    setMessage('This army list did not return any units.', 'empty');
    return;
  }

  for (const unit of units) {
    cardsContainer.appendChild(wrapCardWithToolbar(createCard(unit)));
  }

  setDocumentTitle(army.name);
  setPrintControlsVisible(true);
}

generateButton?.addEventListener('click', loadArmy);
printButton?.addEventListener('click', () => window.print());
downloadAllButton?.addEventListener('click', () => {
  if (!downloadAllButton) return;
  downloadAllButton.disabled = true;
  void downloadAllCards().finally(() => {
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

inputElement.value = localStorage.getItem('lastArmyInput') ?? '';
setPrintControlsVisible(false);

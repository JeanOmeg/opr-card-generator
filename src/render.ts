import html2canvas from 'html2canvas';

import { deleteCardImage, getCardImage, saveCardImage } from './db';
import type {
  ArmySpecialRule,
  ArmyList,
  Unit,
  UpgradeGain,
  Weapon,
  WeaponSpecialRule,
} from './types';

// Stable per-list identity for a unit, used to key its saved background image.
// `selectionId` is unique per unit selection and survives "Refresh List"; falls
// back to the army-book id if a payload ever omits it.
export function unitImageId(unit: Unit): string {
  return unit.selectionId || unit.id || '';
}

// --- Unit data helpers -------------------------------------------------------

function getRules(unit: Unit) {
  return Array.isArray(unit.rules) ? unit.rules : [];
}

// A plain weapon exposes `attacks` directly. Bundled items (e.g. "Weapon Team")
// come through as an ArmyBookItem with no top-level `attacks` — the weapon lives
// nested in `content` — so we recurse to still treat those as weapons.
function hasWeaponProfile(item: { attacks?: number; content?: WeaponSpecialRule[] }): boolean {
  if (typeof item.attacks === 'number') return true;
  return Array.isArray(item.content) && item.content.some(hasWeaponProfile);
}

function isWeapon(item: Weapon): boolean {
  return hasWeaponProfile(item);
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

// Army Forge sometimes omits an upgrade's `label`. When it does, rebuild it from
// the item name plus the rules it grants (its `content`), e.g. a Combat Shield
// with no label becomes "Combat Shield (Shielded)" — matching items that ship a
// label. Falls back to the bare name when there are no granted rules to show.
function getUpgradeLabel(upgrade: Weapon): string {
  if (upgrade.label?.trim()) return upgrade.label;

  const name = upgrade.name?.trim() ?? '';
  const granted = (Array.isArray(upgrade.content) ? upgrade.content : [])
    .map((rule) => rule.label?.trim() || rule.name?.trim() || '')
    .filter(Boolean);

  return granted.length > 0 ? `${name} (${granted.join(', ')})` : name;
}

// Some upgrades grant a special rule to a subset of a unit's models rather than
// a weapon or item — e.g. upgrading one model to a "Sergeant". Army Forge folds
// weapon/item upgrades into `loadout`, but a rule-only upgrade lands nowhere the
// card otherwise reads: it isn't in `loadout` and (being model-specific) isn't
// merged into `rules` either. So we read it straight from `selectedUpgrades`.
// Army Forge shows these as "1x Sergeant" — the count being how many models gain
// the rule — so we keep the count prefix even when it's 1.
function getUpgradeRuleGains(unit: Unit): { gain: UpgradeGain; count: number }[] {
  const selected = Array.isArray(unit.selectedUpgrades) ? unit.selectedUpgrades : [];
  const existing = new Set(getRules(unit).map((rule) => rule.name));
  const result: { gain: UpgradeGain; count: number }[] = [];

  for (const selection of selected) {
    const gains = Array.isArray(selection.option?.gains) ? selection.option.gains : [];
    const count = selection.upgrade?.affects?.value ?? 1;
    for (const gain of gains) {
      if (gain.type !== 'ArmyBookRule') continue;
      const label = gain.label?.trim() || gain.name?.trim() || '';
      if (!label || existing.has(gain.name ?? label)) continue;
      result.push({ gain, count });
    }
  }

  return result;
}

// Army Forge shows these as "1x Sergeant" — the count being how many models gain
// the rule — so we keep the count prefix even when it's 1.
function getUpgradeRulePills(unit: Unit): string[] {
  return getUpgradeRuleGains(unit).map(
    ({ gain, count }) => `${count}x ${(gain.label?.trim() || gain.name?.trim()) ?? ''}`,
  );
}

function getTough(unit: Unit): string {
  const rule = getRules(unit).find((item) => item.name === 'Tough');
  return rule?.rating?.toString() ?? '-';
}

function getBaseLabel(unit: Unit): string {
  const roundBase = unit.bases?.round;
  return roundBase ? `Base ${roundBase} mm` : 'Base ?';
}

// --- Small DOM helpers -------------------------------------------------------

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

interface MergedWeapon {
  label: string;
  count: number;
}

// Army Forge collapses identical weapon profiles into one line with a summed
// quantity — three models each carrying a Dagger show as "3x Dagger", not three
// "1x Dagger" lines. We mirror that: group the loadout by profile (the label,
// which already encodes name + range + attacks + special rules) and add up the
// counts. The leading "Nx " is stripped first, both so it becomes the grouping
// key and because Army Forge sometimes bakes the multiplier into the label of a
// count>1 weapon, which would otherwise render as "2x 2x Hand Weapon".
// `multiplier` scales every weapon count by the number of identical units a
// combined card represents, so a card for 3 merged archers shows "3x Bow"
// rather than the single unit's "1x Bow".
function mergeWeapons(weapons: Weapon[], multiplier = 1): MergedWeapon[] {
  const order: string[] = [];
  const byLabel = new Map<string, MergedWeapon>();

  for (const weapon of weapons) {
    const label = weapon.label.replace(/^\s*\d+x\s+/, '');
    const count = (typeof weapon.count === 'number' ? weapon.count : 0) * multiplier;
    const existing = byLabel.get(label);
    if (existing) {
      existing.count += count;
    } else {
      byLabel.set(label, { label, count });
      order.push(label);
    }
  }

  return order.map((label) => byLabel.get(label) as MergedWeapon);
}

function createWeaponElement(weapon: MergedWeapon): HTMLDivElement {
  const label = weapon.count > 0 ? `${weapon.count}x ${weapon.label}` : weapon.label;
  return createTextElement('weapon-chip', label);
}

function createRulesContainer(unit: Unit): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'rules-container';

  const rules = getRules(unit).filter((rule) => rule.name !== 'Tough');
  const upgrades = getUpgrades(unit);
  const upgradeRulePills = getUpgradeRulePills(unit);

  if (rules.length === 0 && upgrades.length === 0 && upgradeRulePills.length === 0) {
    container.appendChild(createTextElement('muted', 'No special rules'));
    return container;
  }

  const addPill = (text: string): void => {
    // Skip blanks so a label-less entry never renders as an empty pill.
    const label = text?.trim() || '';
    if (!label) return;
    const pill = document.createElement('span');
    pill.className = 'rule-pill';
    pill.textContent = label;
    container.appendChild(pill);
  };

  for (const rule of rules) addPill(rule.label || rule.name);
  for (const upgrade of upgrades) addPill(getUpgradeLabel(upgrade));
  for (const pill of upgradeRulePills) addPill(pill);

  return container;
}

// --- Card background image: pan / zoom / upload ------------------------------

const DEFAULT_BG_OPACITY = 1;

const MIN_BG_SCALE = 0.1;
const MAX_BG_SCALE = 4;
const DEFAULT_BG_SCALE = 1;

interface CardImageState {
  scale: number;
  tx: number;
  ty: number;
  zoomSlider?: HTMLInputElement;
  opacitySlider?: HTMLInputElement;
}

// The largest background image we accept, to keep IndexedDB lean.
const MAX_IMAGE_MB = 2;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

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
  scheduleCardImagePersist(card);
}

function resetCardFraming(card: HTMLDivElement): void {
  const state = getCardImageState(card);
  state.scale = DEFAULT_BG_SCALE;
  state.tx = 0;
  state.ty = 0;
  applyBgTransform(card);
  if (state.zoomSlider) state.zoomSlider.value = state.scale.toString();
}

// `resetFraming` is true for a fresh upload (start centered at 1x) and false
// when restoring a saved image, where the caller has already applied the stored
// zoom/pan/opacity that the load handler then renders.
function setCardImage(card: HTMLDivElement, src: string | null, resetFraming = true): void {
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
  if (resetFraming) resetCardFraming(card);
}

// --- Card image persistence (Localbase) --------------------------------------

function getCardOpacity(card: HTMLDivElement): number {
  const raw = card.style.getPropertyValue('--card-bg-opacity').trim();
  const value = raw ? parseFloat(raw) : DEFAULT_BG_OPACITY;
  return Number.isFinite(value) ? value : DEFAULT_BG_OPACITY;
}

// Write the card's current image + framing to storage, or delete the record if
// the card no longer has an image.
function persistCardImage(card: HTMLDivElement): void {
  const { armyId, unitId } = card.dataset;
  if (!armyId || !unitId) return;

  const img = card.querySelector<HTMLImageElement>('.card-bg');
  if (!img || !card.classList.contains('card--has-image')) {
    void deleteCardImage(armyId, unitId).catch((error) => console.error(error));
    return;
  }

  const state = getCardImageState(card);
  void saveCardImage({
    armyId,
    unitId,
    src: img.src,
    scale: state.scale,
    tx: state.tx,
    ty: state.ty,
    opacity: getCardOpacity(card),
  }).catch((error) => console.error(error));
}

// Coalesce the rapid-fire changes of dragging / zoom & opacity sliders into one
// write shortly after the user stops.
const persistTimers = new WeakMap<HTMLDivElement, number>();
function scheduleCardImagePersist(card: HTMLDivElement): void {
  const pending = persistTimers.get(card);
  if (pending) window.clearTimeout(pending);
  persistTimers.set(card, window.setTimeout(() => persistCardImage(card), 300));
}

function removeCardImage(card: HTMLDivElement): void {
  setCardImage(card, null);
  const { armyId, unitId } = card.dataset;
  if (armyId && unitId) void deleteCardImage(armyId, unitId).catch((error) => console.error(error));
}

// Load a unit's saved image (if any) and apply its stored framing without
// resetting it. Safe to call on a card that has no saved image.
async function restoreCardImage(card: HTMLDivElement, armyId: string, unitId: string): Promise<void> {
  let record;
  try {
    record = await getCardImage(armyId, unitId);
  } catch (error) {
    console.error('Failed to load card image:', error);
    return;
  }
  if (!record) return;

  const state = getCardImageState(card);
  state.scale = record.scale;
  state.tx = record.tx;
  state.ty = record.ty;

  card.style.setProperty('--card-bg-opacity', record.opacity.toString());
  if (state.opacitySlider) state.opacitySlider.value = record.opacity.toString();
  if (state.zoomSlider) state.zoomSlider.value = record.scale.toString();

  setCardImage(card, record.src, false);
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
    scheduleCardImagePersist(card);
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
    removeCardImage(card);
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

      if (file.size > MAX_IMAGE_BYTES) {
        window.alert(`That image is too large. Please choose one under ${MAX_IMAGE_MB} MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setCardImage(card, reader.result as string);
        persistCardImage(card);
      };
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

// --- PNG export --------------------------------------------------------------

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

/** Download every card currently in the container as sequentially named PNGs. */
export async function downloadAllCards(container: HTMLDivElement): Promise<void> {
  const cards = Array.from(container.querySelectorAll<HTMLDivElement>('.card'));
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
    (value) => {
      card.style.setProperty('--card-bg-opacity', value);
      scheduleCardImagePersist(card);
    },
  );
  getCardImageState(card).opacitySlider = opacity.slider;

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
  reset.addEventListener('click', () => {
    resetCardFraming(card);
    scheduleCardImagePersist(card);
  });

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

// --- Cards & tables ----------------------------------------------------------

// Signature of everything a card shows, so two selections that look identical
// (same profile, rules and loadout) collapse into one "Combine Similar Units"
// group. Deliberately excludes per-selection identifiers (selectionId, xp,
// notes) so genuine duplicates match while a customised copy stays separate.
// The custom name only joins the signature when it's actually shown, so that
// renamed units stay on their own card then but merge with their twins when
// custom names are hidden.
function unitSignature(unit: Unit, useCustomNames: boolean): string {
  const rules = getRules(unit)
    .map((rule) => `${rule.name}:${rule.rating ?? ''}`)
    .sort();
  const loadout = (Array.isArray(unit.loadout) ? unit.loadout : [])
    .map((item) => `${item.label ?? item.name ?? ''}:${item.count ?? ''}`)
    .sort();

  return JSON.stringify({
    name: unit.name,
    custom: useCustomNames ? unit.customName ?? '' : '',
    generic: unit.genericName,
    cost: unit.cost,
    size: unit.size,
    quality: unit.quality,
    defense: unit.defense,
    rules,
    loadout,
  });
}

interface UnitGroup {
  unit: Unit;
  count: number;
}

// Group identical units, preserving first-seen order (like Army Forge's
// "Combine Similar Units"): three separate Spider Rigs become one group of 3.
// Only single-model units combine — multi-model units (e.g. two squads of 3)
// stay on their own cards even when identical.
function combineUnits(units: Unit[], useCustomNames: boolean): UnitGroup[] {
  const order: string[] = [];
  const groups = new Map<string, UnitGroup>();

  for (const unit of units) {
    if (unit.size !== 1) {
      const key = `__uncombined__${order.length}`;
      groups.set(key, { unit, count: 1 });
      order.push(key);
      continue;
    }

    const signature = unitSignature(unit, useCustomNames);
    const existing = groups.get(signature);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(signature, { unit, count: 1 });
      order.push(signature);
    }
  }

  return order.map((signature) => groups.get(signature) as UnitGroup);
}

function createCard(unit: Unit, count = 1, armyId = '', useCustomNames = false): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'card';

  // Identify the card for image persistence. A combined card uses its first
  // unit's id, so its image is the one shown; the other units keep their own
  // stored images for when the user un-combines them.
  card.dataset.armyId = armyId;
  card.dataset.unitId = unitImageId(unit);

  // Army Forge keeps a renamed unit's edited title in `customName`, leaving the
  // book name in `name`. When custom names are enabled, show the custom title
  // and drop `name` to the subtitle (as Army Forge does); otherwise show the
  // book name over the generic name.
  const customName = useCustomNames ? unit.customName?.trim() : '';
  const baseName = customName || unit.name || 'Unnamed unit';
  const subtitle = customName ? unit.name : unit.genericName;
  const displayName = count > 1 ? `${count}x ${baseName}` : baseName;
  card.dataset.unitName = displayName;

  // A combined card stands in for `count` identical units, so its points and
  // model tally are the per-unit values multiplied by how many were merged
  // (only single-model units combine, so `size` is 1 for every combined card).
  const totalModels = unit.size * count;
  const totalCost = unit.cost * count;
  const modelsLabel = totalModels === 1 ? '1 model' : `${totalModels} models`;
  const costParts = [`${totalCost} pts`, modelsLabel];
  if (unit.xp > 0) costParts.push(`XP ${unit.xp}`);

  const header = document.createElement('div');
  header.className = 'card-header';
  header.append(
    createTextElement('card-name', displayName),
    createTextElement('card-subtitle', subtitle || ''),
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

  const weapons = mergeWeapons(getWeapons(unit), count);
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

/**
 * Fill `container` with cards. With `combineSimilar` (the default), identical
 * units collapse into a single card prefixed with their count. With
 * `useCustomNames`, a renamed unit shows its Army Forge custom name as the title.
 * Returns the number of units (unchanged by combining, so callers can detect an
 * empty list).
 */
export function renderCards(
  container: HTMLDivElement,
  army: ArmyList,
  combineSimilar = true,
  useCustomNames = false,
): number {
  container.replaceChildren();

  const armyId = army.id || '';
  const units = Array.isArray(army.units) ? army.units : [];
  const groups = combineSimilar
    ? combineUnits(units, useCustomNames)
    : units.map((unit) => ({ unit, count: 1 }));

  for (const group of groups) {
    const card = createCard(group.unit, group.count, armyId, useCustomNames);
    container.appendChild(wrapCardWithToolbar(card));
    // Restore after wrapping so the toolbar's sliders exist to reflect the
    // stored zoom / opacity.
    void restoreCardImage(card, armyId, unitImageId(group.unit));
  }

  return units.length;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A granted ability often names another rule only in its prose description, with
// no structural link in the data — e.g. "Shred when Shooting" reads "...gets
// Shred when shooting", and "Repel Ambushers" mentions "Ambush". For each granted
// rule on the unit, pull in the army rule it names so that rule's description
// shows in the table instead of dangling.
//
// Scoped deliberately: only rules granted via an item's `content` seed the scan
// (so a core rule like AP mentioning a stat in passing doesn't), and rating-based
// entries (Defense, Armor, Tough...) are never pulled in — those are stat
// modifiers mentioned inline, not keyword rules a reader needs spelled out.
function expandGrantedRules(
  included: ArmySpecialRule[],
  grantedIds: Set<string>,
  allRules: ArmySpecialRule[],
): ArmySpecialRule[] {
  const candidates = allRules.filter(
    (rule) => rule.name && rule.description && rule.hasRating !== true,
  );
  const result = [...included];
  const seenIds = new Set(included.map((rule) => rule.id));

  for (const source of included.filter((rule) => grantedIds.has(rule.id))) {
    const description = source.description ?? '';
    for (const candidate of candidates) {
      if (seenIds.has(candidate.id)) continue;
      // Whole-word, case-sensitive: descriptions name other rules capitalized,
      // which keeps common lowercase words from matching by accident.
      if (new RegExp(`\\b${escapeRegExp(candidate.name)}\\b`).test(description)) {
        seenIds.add(candidate.id);
        result.push(candidate);
      }
    }
  }

  return result;
}

export function renderSpecialRulesTable(section: HTMLElement, army: ArmyList): void {
  section.replaceChildren();

  const usedIds = new Set<string>();
  // Ids reached through an item's `content` chain — the abilities granted to the
  // unit (e.g. Repel Ambushers). Only these seed the granted-rule scan below.
  const grantedIds = new Set<string>();
  const collect = (entries: WeaponSpecialRule[] | undefined): void => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (entry.id) usedIds.add(entry.id);
      collect(entry.content);
    }
  };
  const collectGranted = (entries: WeaponSpecialRule[] | undefined): void => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (entry.id) {
        usedIds.add(entry.id);
        grantedIds.add(entry.id);
      }
      collectGranted(entry.content);
    }
  };

  const units = Array.isArray(army.units) ? army.units : [];
  for (const unit of units) {
    for (const rule of getRules(unit)) usedIds.add(rule.id);
    for (const weapon of getWeapons(unit)) {
      collect(getWeaponSpecialRules(weapon));
      collectGranted(weapon.content);
    }
    for (const upgrade of getUpgrades(unit)) {
      collect(getWeaponSpecialRules(upgrade));
      collectGranted(upgrade.content);
    }
    // Rule-only model upgrades (e.g. Sergeant) live in `selectedUpgrades`, not in
    // loadout, so collect their rule ids here too. Treat them as granted so the
    // expand scan can pull in any rule their description names.
    for (const { gain } of getUpgradeRuleGains(unit)) {
      if (gain.id) {
        usedIds.add(gain.id);
        grantedIds.add(gain.id);
      }
    }
  }

  const armySpecialRules = Array.isArray(army.specialRules) ? army.specialRules : [];
  const used = armySpecialRules.filter(
    (r) => usedIds.has(r.id) || (r.aliasedRuleId != null && usedIds.has(r.aliasedRuleId)),
  );
  const sorted = expandGrantedRules(used, grantedIds, armySpecialRules).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

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
  section.append(table);
}

export function renderSpellsTable(section: HTMLElement, army: ArmyList): void {
  section.replaceChildren();

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
  section.append(table);
}

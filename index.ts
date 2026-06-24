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

// Backend relay (see /api). It fetches the Army Forge list AND the core special
// rules, merges them, and returns the combined army payload — so the table can
// document rules like Fast/Strider that the raw TTS feed omits.
// For local dev with the API running, use 'http://localhost:3000'.
const API_BASE = 'http://localhost:3000';
const API_URL = `${API_BASE}/army`;

const cardsContainerElement = document.getElementById('cards');
const inputElementElement = document.getElementById('armyLink');
const generateButton = document.getElementById('btnGenerate') as HTMLButtonElement | null;
const printButton = document.getElementById('btnPrint');
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
    // The loadout mixes real weapons with rules granted by upgrades (e.g.
    // "Captain", "Horde of Rats"). A real weapon always carries an attack
    // profile; rule/upgrade grants do not.
    return typeof item.attacks === 'number';
}

function getWeapons(unit: Unit): Weapon[] {
    return Array.isArray(unit.loadout) ? unit.loadout.filter(isWeapon) : [];
}

// Loadout entries that aren't weapons are special rules granted by upgrades
// (e.g. "Captain", "Scout Master"). They belong under Special Rules.
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

function setMessage(message: string, type: 'loading' | 'error' | 'empty' = 'empty'): void {
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
    const weaponElement = document.createElement('div');
    weaponElement.className = 'weapon';

    if (weapon.name && weapon.name !== weapon.label) {
        weaponElement.appendChild(createTextElement('weapon-name', weapon.name));
    }

    weaponElement.appendChild(createTextElement('weapon-label', weapon.label));
    return weaponElement;
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

function createCard(unit: Unit): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'card';

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

    if (hero) {
        const badge = document.createElement('span');
        badge.className = 'hero-badge';
        badge.textContent = '★ Hero';
        header.appendChild(badge);
    }

    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.append(
        createStat('Q', `${unit.quality}+`),
        createStat('D', `${unit.defense}+`),
        createStat('T', getTough(unit)),
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

    // Army name + points live in the table header (instead of a separate box
    // above the cards) so they print with the rules table and don't push the
    // cards grid down — that keeps 9 cards per page.
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

// Spells live in the army book (the relay attaches them only when the list
// fields a caster), so the table renders when, and only when, spells are sent.
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
        const url = new URL(API_URL);
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
        cardsContainer.appendChild(createCard(unit));
    }
}

generateButton?.addEventListener('click', loadArmy);
printButton?.addEventListener('click', () => window.print());
inputElement.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        void loadArmy();
    }
});

inputElement.value = localStorage.getItem('lastArmyInput') ?? '';

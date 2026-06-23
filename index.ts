interface Rule {
    name: string;
    label: string;
    rating?: string;
}

interface Weapon {
    name?: string;
    label: string;
}

interface Unit {
    name: string;
    genericName?: string;
    cost: number;
    size?: number;
    quality: number;
    defense: number;
    bases?: {
        round?: number;
        shape?: string;
    };
    rules?: Rule[];
    weapons?: Weapon[];
}

interface ArmyList {
    name?: string;
    units?: Unit[];
}

const API_URL = 'https://army-forge.onepagerules.com/api/tts';

const cardsContainerElement = document.getElementById('cards');
const inputElementElement = document.getElementById('armyLink');
const generateButton = document.getElementById('btnGenerate') as HTMLButtonElement | null;
const printButton = document.getElementById('btnPrint');

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

function getRules(unit: Unit): Rule[] {
    return Array.isArray(unit.rules) ? unit.rules : [];
}

function getWeapons(unit: Unit): Weapon[] {
    return Array.isArray(unit.weapons) ? unit.weapons : [];
}

function getTough(unit: Unit): string {
    const rule = getRules(unit).find((item) => item.name === 'Tough');
    return rule?.rating ?? '-';
}

function getBaseLabel(unit: Unit): string {
    const roundBase = unit.bases?.round;
    const shape = unit.bases?.shape;

    if (roundBase) {
        return `Base ${roundBase} mm`;
    }

    if (shape) {
        return `Base ${shape}`;
    }

    return 'Base ?';
}

function setMessage(message: string, type: 'loading' | 'error' | 'empty' = 'empty'): void {
    cardsContainer.replaceChildren();

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

    if (rules.length === 0) {
        container.appendChild(createTextElement('muted', 'No special rules'));
        return container;
    }

    for (const rule of rules) {
        const pill = document.createElement('span');
        pill.className = 'rule-pill';
        pill.textContent = rule.label;
        container.appendChild(pill);
    }

    return container;
}

function getPointsLabel(unit: Unit, copyIndex: number, copies: number): string {
    if (copies <= 1) {
        return `${unit.cost} pts`;
    }

    const basePoints = Math.floor(unit.cost / copies);
    const remainder = unit.cost % copies;
    const points = basePoints + (copyIndex < remainder ? 1 : 0);

    return `${points} pts (${unit.cost}/${copies})`;
}

function createCard(unit: Unit, copyIndex: number, copies: number): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'card';

    const header = document.createElement('div');
    header.className = 'card-header';
    header.append(
        createTextElement('card-name', unit.name || 'Unnamed unit'),
        createTextElement('card-subtitle', unit.genericName || ''),
        createTextElement('card-cost', getPointsLabel(unit, copyIndex, copies)),
    );

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

    return card;
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
        renderCards(army);
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
        const copies = Math.max(1, unit.size || 1);

        for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
            cardsContainer.appendChild(createCard(unit, copyIndex, copies));
        }
    }
}

generateButton?.addEventListener('click', loadArmy);
printButton?.addEventListener('click', () => window.print());
inputElement.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        void loadArmy();
    }
});

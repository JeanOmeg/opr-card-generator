// Framework-free relay core shared by the Express server (api/src/server.ts) and
// the Netlify Function (netlify/functions/army.mts). It only uses the global
// `fetch`, so it bundles cleanly in both a Node server and a serverless runtime.
//
// Why it exists: OnePageRules' army feed (/api/tts) is CORS-enabled, but the
// core/common rule descriptions (/api/rules/common/{id}) send no CORS header,
// so a static browser app can't read them directly. This runs server-side,
// merges both sources, and returns one combined payload. OPR permits this for
// free, non-monetized community use.

const OPR_TTS_URL = 'https://army-forge.onepagerules.com/api/tts';
const OPR_COMMON_RULES_URL = 'https://army-forge.onepagerules.com/api/rules/common';
const OPR_ARMY_BOOKS_URL = 'https://army-forge.onepagerules.com/api/army-books';

const GAME_SYSTEM_IDS: Record<string, number> = {
  gf: 2,
  gff: 3,
  aof: 4,
  aofs: 5,
  aofr: 6,
};

export interface RuleLike {
  id?: string;
  name?: string;
  description?: string;
  content?: RuleLike[];
}

export interface UnitLike {
  armyId?: string;
  rules?: RuleLike[];
  loadout?: RuleLike[];
}

export interface Spell {
  id?: string;
  name?: string;
  threshold?: number;
  effect?: string;
}

export interface ArmyBook {
  spells?: Spell[];
}

export interface ArmyPayload {
  gameSystem?: string;
  specialRules?: RuleLike[];
  units?: UnitLike[];
  spells?: Spell[];
  [key: string]: unknown;
}

/** Carries an HTTP status so each transport (Express / Netlify) can map it. */
export class RelayError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RelayError';
    this.status = status;
  }
}

async function fetchCommonRules(gameSystem: string | undefined): Promise<RuleLike[]> {
  const id = gameSystem ? GAME_SYSTEM_IDS[gameSystem.toLowerCase()] : undefined;
  if (id === undefined) return [];

  try {
    const response = await fetch(`${OPR_COMMON_RULES_URL}/${id}`);
    if (!response.ok) return [];
    const data = (await response.json()) as { rules?: RuleLike[] };
    return Array.isArray(data.rules) ? data.rules : [];
  } catch (error) {
    console.error('Failed to fetch common rules:', error);
    return [];
  }
}

function hasCasterRule(rules: RuleLike[] | undefined): boolean {
  if (!Array.isArray(rules)) return false;
  return rules.some((rule) => rule.name === 'Caster' || hasCasterRule(rule.content));
}

function unitHasCaster(unit: UnitLike): boolean {
  return hasCasterRule(unit.rules) || hasCasterRule(unit.loadout);
}

async function fetchSpells(army: ArmyPayload): Promise<Spell[]> {
  const id = army.gameSystem ? GAME_SYSTEM_IDS[army.gameSystem.toLowerCase()] : undefined;
  if (id === undefined) return [];

  const units = Array.isArray(army.units) ? army.units : [];
  const casterArmyIds = [
    ...new Set(
      units
        .filter((unit) => unit.armyId && unitHasCaster(unit))
        .map((unit) => unit.armyId as string),
    ),
  ];
  if (casterArmyIds.length === 0) return [];

  const books = await Promise.all(
    casterArmyIds.map(async (armyId) => {
      try {
        const response = await fetch(
          `${OPR_ARMY_BOOKS_URL}/${encodeURIComponent(armyId)}?gameSystem=${id}`,
        );
        if (!response.ok) return [] as Spell[];
        const data = (await response.json()) as ArmyBook;
        return Array.isArray(data.spells) ? data.spells : [];
      } catch (error) {
        console.error(`Failed to fetch army book ${armyId}:`, error);
        return [] as Spell[];
      }
    }),
  );

  const seen = new Set<string>();
  const spells: Spell[] = [];
  for (const spell of books.flat()) {
    const key = spell.id ?? spell.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    spells.push({
      id: spell.id,
      name: spell.name,
      threshold: spell.threshold,
      effect: spell.effect,
    });
  }
  return spells;
}

function mergeRules(army: ArmyPayload, commonRules: RuleLike[]): ArmyPayload {
  const armySpecialRules = Array.isArray(army.specialRules) ? army.specialRules : [];
  const seen = new Set(armySpecialRules.map((rule) => rule.id));

  const merged = [...armySpecialRules];
  for (const rule of commonRules) {
    if (rule.id && !seen.has(rule.id)) {
      seen.add(rule.id);
      merged.push(rule);
    }
  }

  return { ...army, specialRules: merged };
}

/**
 * Load an Army Forge list and enrich it with core rule descriptions and spells.
 * Throws {@link RelayError} (with an HTTP status) on upstream/network failure.
 */
export async function loadArmy(id: string): Promise<ArmyPayload> {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new RelayError(400, 'Missing army id.');
  }

  let ttsResponse: Response;
  try {
    ttsResponse = await fetch(`${OPR_TTS_URL}?id=${encodeURIComponent(trimmed)}`);
  } catch (error) {
    console.error('Failed to load army:', error);
    throw new RelayError(502, 'Could not load this army list.');
  }

  if (!ttsResponse.ok) {
    throw new RelayError(502, `Army Forge returned ${ttsResponse.status}.`);
  }

  const army = (await ttsResponse.json()) as ArmyPayload;
  const [commonRules, spells] = await Promise.all([
    fetchCommonRules(army.gameSystem),
    fetchSpells(army),
  ]);

  return { ...mergeRules(army, commonRules), spells };
}

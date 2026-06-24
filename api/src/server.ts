import express from 'express';
import cors from 'cors';

// --- OnePageRules upstream endpoints ---------------------------------------
// The TTS endpoint sends a permissive CORS header, but /api/rules/common/{id}
// (where the core rule descriptions live) does not. This relay fetches both
// server-side — where CORS doesn't apply — joins them, and returns one payload
// to the static front-end. OPR is fine with this for free, non-monetized
// community use.
const OPR_TTS_URL = 'https://army-forge.onepagerules.com/api/tts';
const OPR_COMMON_RULES_URL = 'https://army-forge.onepagerules.com/api/rules/common';
const OPR_ARMY_BOOKS_URL = 'https://army-forge.onepagerules.com/api/army-books';

// OnePageRules game-system slug -> numeric id used by the common-rules endpoint.
const GAME_SYSTEM_IDS: Record<string, number> = {
    gf: 2,
    gff: 3,
    aof: 4,
    aofs: 5,
    aofr: 6,
};

interface RuleLike {
    id?: string;
    name?: string;
    description?: string;
    content?: RuleLike[];
}

interface UnitLike {
    armyId?: string;
    rules?: RuleLike[];
    loadout?: RuleLike[];
}

// Spell as returned by the army-book endpoint. We forward only the fields the
// card table needs; the upstream entry also carries cost formulas, generation
// metadata, etc. that the front-end doesn't use.
interface Spell {
    id?: string;
    name?: string;
    threshold?: number;
    effect?: string;
}

interface ArmyBook {
    spells?: Spell[];
}

interface ArmyPayload {
    gameSystem?: string;
    specialRules?: RuleLike[];
    units?: UnitLike[];
    spells?: Spell[];
    [key: string]: unknown;
}

// Best-effort: never throws, returns [] on any failure so a common-rules outage
// degrades to "army-book rules only" instead of failing the whole request.
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

// The "Caster(X)" rule can sit directly on a unit or be granted by an upgrade,
// in which case it lives nested inside a loadout entry's `content`. Scan both.
function hasCasterRule(rules: RuleLike[] | undefined): boolean {
    if (!Array.isArray(rules)) return false;
    return rules.some((rule) => rule.name === 'Caster' || hasCasterRule(rule.content));
}

function unitHasCaster(unit: UnitLike): boolean {
    return hasCasterRule(unit.rules) || hasCasterRule(unit.loadout);
}

// Spells are defined per army book, not in the TTS feed, so we only fetch the
// books whose units actually field a caster. Best-effort: a failed fetch just
// contributes no spells rather than failing the whole request.
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

// Appends the core rules into the army's specialRules list so the front-end can
// document them in its table. Army-book entries win on id collisions.
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

const app = express();

// Allow the static front-end (GitHub Pages, localhost, etc.) to call this API.
// The data is public, so a wildcard origin is fine; restrict it if you prefer.
app.use(cors());

app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

// GET /army?id=<armyId>
// Fetches the army from Army Forge, enriches its specialRules with the core
// rule descriptions, and returns the combined army payload.
app.get('/army', async (req, res) => {
    const id = String(req.query.id ?? '').trim();
    if (!id) {
        res.status(400).json({ error: 'Missing army id.' });
        return;
    }

    try {
        const ttsResponse = await fetch(`${OPR_TTS_URL}?id=${encodeURIComponent(id)}`);
        if (!ttsResponse.ok) {
            res.status(502).json({ error: `Army Forge returned ${ttsResponse.status}.` });
            return;
        }

        const army = (await ttsResponse.json()) as ArmyPayload;
        const [commonRules, spells] = await Promise.all([
            fetchCommonRules(army.gameSystem),
            fetchSpells(army),
        ]);
        res.json({ ...mergeRules(army, commonRules), spells });
    } catch (error) {
        console.error('Failed to load army:', error);
        res.status(502).json({ error: 'Could not load this army list.' });
    }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
    console.log(`OPR Card Generator API listening on port ${port}`);
});

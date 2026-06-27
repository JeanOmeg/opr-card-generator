import Localbase from 'localbase';

import type { ArmyList } from './types';

// A saved army list: lightweight metadata for the listing plus the full relay
// payload, which doubles as an offline cache so "Load" is instant (no network).
export interface SavedList {
  id: string;
  name: string;
  gameSystem: string;
  listPoints: number;
  pointsLimit: number;
  input: string;
  payload: ArmyList;
  savedAt: string;
  updatedAt: string;
}

const DB_NAME = 'opr-card-generator';
const COLLECTION = 'lists';
const IMAGE_COLLECTION = 'cardImages';

// Localbase stores the in-progress query (collectionName, docSelectionCriteria,
// orderBy, ...) as MUTABLE FIELDS on the instance, and clears them only when an
// operation succeeds. A `.doc({...}).get()` that finds nothing never clears its
// criteria — which is the common case for a card with no saved image. A shared
// instance therefore leaks that stale criteria into the next call: after loading
// a list, the per-card image lookups leave `docSelectionCriteria` set, so the
// next `getLists()` is treated as a *document* lookup instead of a *collection*
// read, finds nothing, and "My Lists" shows up empty until a reload.
//
// The fix is to never share query state: each operation gets its own throwaway
// Localbase instance. They all point at the same IndexedDB database, so the data
// is shared; only the query-builder state is isolated. Operations are also
// serialized through a queue so the two object stores aren't created
// concurrently on first use (which can block the connection).
function freshDb(): Localbase {
  const instance = new Localbase(DB_NAME);
  instance.config.debug = false;
  return instance;
}

let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const result = queue.then(op, op);
  // Keep the chain alive regardless of this op's outcome.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function nowIso(): string {
  return new Date().toISOString();
}

// A user-supplied background image for one unit's card, plus the framing the
// user set (zoom / pan / opacity). Keyed by army list id + unit so it survives
// reloads and follows the unit across "Refresh List" as long as it stays in the
// list. `src` is a data URL.
export interface CardImageRecord {
  key: string;
  armyId: string;
  unitId: string;
  src: string;
  scale: number;
  tx: number;
  ty: number;
  opacity: number;
  updatedAt: string;
}

function imageKey(armyId: string, unitId: string): string {
  return `${armyId}:${unitId}`;
}

// --- Raw operations -------------------------------------------------------
// Each takes its own Localbase instance so query state can never leak. They run
// only inside `enqueue`, and may reuse the caller's instance for sub-reads since
// the reads happen before any leftover criteria would matter.

async function rawAllCardImages(db: Localbase): Promise<CardImageRecord[]> {
  const docs = await db.collection(IMAGE_COLLECTION).get();
  return Array.isArray(docs) ? (docs as CardImageRecord[]) : [];
}

async function rawGetCardImage(
  db: Localbase,
  armyId: string,
  unitId: string,
): Promise<CardImageRecord | undefined> {
  const doc = await db.collection(IMAGE_COLLECTION).doc({ key: imageKey(armyId, unitId) }).get();
  return (doc as CardImageRecord | null) ?? undefined;
}

async function rawGetList(db: Localbase, id: string): Promise<SavedList | undefined> {
  const doc = await db.collection(COLLECTION).doc({ id }).get();
  return (doc as SavedList | null) ?? undefined;
}

async function rawDeleteCardImagesForArmy(db: Localbase, armyId: string): Promise<void> {
  const records = (await rawAllCardImages(db)).filter((record) => record.armyId === armyId);
  for (const record of records) {
    await freshDb().collection(IMAGE_COLLECTION).doc({ key: record.key }).delete();
  }
}

// --- Public API -----------------------------------------------------------

/** Fetch a stored card image by army + unit, or undefined if none. */
export function getCardImage(
  armyId: string,
  unitId: string,
): Promise<CardImageRecord | undefined> {
  return enqueue(() => rawGetCardImage(freshDb(), armyId, unitId));
}

/** Upsert a card image record. */
export function saveCardImage(input: Omit<CardImageRecord, 'key' | 'updatedAt'>): Promise<void> {
  return enqueue(async () => {
    const key = imageKey(input.armyId, input.unitId);
    const record: CardImageRecord = { ...input, key, updatedAt: nowIso() };
    const existing = await rawGetCardImage(freshDb(), input.armyId, input.unitId);
    if (existing) {
      await freshDb().collection(IMAGE_COLLECTION).doc({ key }).set(record);
    } else {
      await freshDb().collection(IMAGE_COLLECTION).add(record);
    }
  });
}

/** Remove one card image (e.g. the user cleared it). */
export function deleteCardImage(armyId: string, unitId: string): Promise<void> {
  return enqueue(async () => {
    await freshDb().collection(IMAGE_COLLECTION).doc({ key: imageKey(armyId, unitId) }).delete();
  });
}

/**
 * Drop stored images for an army whose unit is no longer present — called after
 * a refresh so images for removed units are cleaned up, while units that are
 * still in the list (even if currently combined into another card) are kept.
 */
export function pruneCardImages(armyId: string, keepUnitIds: Set<string>): Promise<void> {
  return enqueue(async () => {
    const orphans = (await rawAllCardImages(freshDb())).filter(
      (record) => record.armyId === armyId && !keepUnitIds.has(record.unitId),
    );
    for (const record of orphans) {
      await freshDb().collection(IMAGE_COLLECTION).doc({ key: record.key }).delete();
    }
  });
}

/** Remove every stored image for an army (e.g. when its list is deleted). */
export function deleteCardImagesForArmy(armyId: string): Promise<void> {
  return enqueue(() => rawDeleteCardImagesForArmy(freshDb(), armyId));
}

/** Fetch one saved list by army id, or undefined if not stored. */
export function getList(id: string): Promise<SavedList | undefined> {
  return enqueue(() => rawGetList(freshDb(), id));
}

/** All saved lists, most recently updated first. */
export function getLists(): Promise<SavedList[]> {
  return enqueue(async () => {
    const docs = await freshDb().collection(COLLECTION).orderBy('updatedAt', 'desc').get();
    return Array.isArray(docs) ? (docs as SavedList[]) : [];
  });
}

/**
 * Upsert a list from a relay payload. Preserves the original `savedAt` on
 * updates and always refreshes `updatedAt` and the cached payload.
 */
export function saveList(army: ArmyList, input: string): Promise<SavedList> {
  return enqueue(async () => {
    const existing = await rawGetList(freshDb(), army.id);
    const now = nowIso();

    const record: SavedList = {
      id: army.id,
      name: army.name,
      gameSystem: army.gameSystem,
      listPoints: army.listPoints,
      pointsLimit: army.pointsLimit,
      input,
      payload: army,
      savedAt: existing?.savedAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await freshDb().collection(COLLECTION).doc({ id: army.id }).set(record);
    } else {
      await freshDb().collection(COLLECTION).add(record);
    }

    return record;
  });
}

/** Remove a saved list by army id, along with any card images it stored. */
export function deleteList(id: string): Promise<void> {
  return enqueue(async () => {
    await freshDb().collection(COLLECTION).doc({ id }).delete();
    await rawDeleteCardImagesForArmy(freshDb(), id);
  });
}

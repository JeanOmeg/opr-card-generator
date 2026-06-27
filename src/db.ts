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

const COLLECTION = 'lists';
const IMAGE_COLLECTION = 'cardImages';

const db = new Localbase('opr-card-generator');
db.config.debug = false;

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

async function allCardImages(): Promise<CardImageRecord[]> {
  const docs = await db.collection(IMAGE_COLLECTION).get();
  return Array.isArray(docs) ? (docs as CardImageRecord[]) : [];
}

/** Fetch a stored card image by army + unit, or undefined if none. */
export async function getCardImage(
  armyId: string,
  unitId: string,
): Promise<CardImageRecord | undefined> {
  const doc = await db.collection(IMAGE_COLLECTION).doc({ key: imageKey(armyId, unitId) }).get();
  return (doc as CardImageRecord | null) ?? undefined;
}

/** Upsert a card image record. */
export async function saveCardImage(
  input: Omit<CardImageRecord, 'key' | 'updatedAt'>,
): Promise<void> {
  const key = imageKey(input.armyId, input.unitId);
  const record: CardImageRecord = { ...input, key, updatedAt: nowIso() };
  const existing = await getCardImage(input.armyId, input.unitId);
  if (existing) {
    await db.collection(IMAGE_COLLECTION).doc({ key }).set(record);
  } else {
    await db.collection(IMAGE_COLLECTION).add(record);
  }
}

/** Remove one card image (e.g. the user cleared it). */
export async function deleteCardImage(armyId: string, unitId: string): Promise<void> {
  await db.collection(IMAGE_COLLECTION).doc({ key: imageKey(armyId, unitId) }).delete();
}

/**
 * Drop stored images for an army whose unit is no longer present — called after
 * a refresh so images for removed units are cleaned up, while units that are
 * still in the list (even if currently combined into another card) are kept.
 */
export async function pruneCardImages(armyId: string, keepUnitIds: Set<string>): Promise<void> {
  const orphans = (await allCardImages()).filter(
    (record) => record.armyId === armyId && !keepUnitIds.has(record.unitId),
  );
  await Promise.all(
    orphans.map((record) => db.collection(IMAGE_COLLECTION).doc({ key: record.key }).delete()),
  );
}

/** Remove every stored image for an army (e.g. when its list is deleted). */
export async function deleteCardImagesForArmy(armyId: string): Promise<void> {
  const records = (await allCardImages()).filter((record) => record.armyId === armyId);
  await Promise.all(
    records.map((record) => db.collection(IMAGE_COLLECTION).doc({ key: record.key }).delete()),
  );
}

/** Fetch one saved list by army id, or undefined if not stored. */
export async function getList(id: string): Promise<SavedList | undefined> {
  const doc = await db.collection(COLLECTION).doc({ id }).get();
  return (doc as SavedList | null) ?? undefined;
}

/** All saved lists, most recently updated first. */
export async function getLists(): Promise<SavedList[]> {
  const docs = await db.collection(COLLECTION).orderBy('updatedAt', 'desc').get();
  return Array.isArray(docs) ? (docs as SavedList[]) : [];
}

/**
 * Upsert a list from a relay payload. Preserves the original `savedAt` on
 * updates and always refreshes `updatedAt` and the cached payload.
 */
export async function saveList(army: ArmyList, input: string): Promise<SavedList> {
  const existing = await getList(army.id);
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
    await db.collection(COLLECTION).doc({ id: army.id }).set(record);
  } else {
    await db.collection(COLLECTION).add(record);
  }

  return record;
}

/** Remove a saved list by army id, along with any card images it stored. */
export async function deleteList(id: string): Promise<void> {
  await db.collection(COLLECTION).doc({ id }).delete();
  await deleteCardImagesForArmy(id);
}

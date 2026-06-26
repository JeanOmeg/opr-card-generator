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

const db = new Localbase('opr-card-generator');
db.config.debug = false;

function nowIso(): string {
  return new Date().toISOString();
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

/** Remove a saved list by army id. */
export async function deleteList(id: string): Promise<void> {
  await db.collection(COLLECTION).doc({ id }).delete();
}

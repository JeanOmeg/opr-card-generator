import type { ArmyList } from './types';

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

/** Pull an Army Forge list id out of a shared link or a bare id. */
export function extractArmyId(value: string): string | null {
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

/** Fetch an army (enriched with core rules + spells) from the relay. */
export async function fetchArmy(armyId: string): Promise<ArmyList> {
  const url = new URL(API_URL, window.location.origin);
  url.searchParams.set('id', armyId);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Army Forge returned ${response.status}.`);
  }

  return (await response.json()) as ArmyList;
}

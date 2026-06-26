// Shared shape of the Army Forge payload returned by the relay (api/). These
// mirror the fields the front-end actually reads; the relay may include more.

export interface WeaponSpecialRule {
  type: string;
  id: string;
  name: string;
  rating?: number;
  label: string;
  content?: WeaponSpecialRule[];
}

export interface Weapon {
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

export interface UnitRule {
  id: string;
  name: string;
  label: string;
  rating?: number;
}

export interface Bases {
  round: string;
  square: string;
}

export interface Unit {
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

export interface ArmySpecialRule {
  id: string;
  name: string;
  aliasedRuleId: string | null;
  description: string;
  hasRating: boolean | null;
  coreType: number | null;
  targetType: number;
}

export interface Spell {
  id: string;
  name: string;
  threshold: number;
  effect: string;
}

export interface ArmyList {
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

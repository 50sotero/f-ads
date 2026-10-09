/**
 * Persistent campaign progression for Crowd Cannon.
 *
 * This module deliberately has no browser or game-engine dependencies. The UI
 * can keep the returned value in localStorage, while the game only needs the
 * small startingLoadout projection when a run begins.
 */

export const CAMPAIGN_ROUTES = 12;
export const MAX_CREDITS = 9_999_999;

const FIRST_CLEAR_CREDITS = 150;
const NEW_STAR_CREDITS = 40;
const REPEAT_CLEAR_CREDITS = 35;
const MAX_TIME = 3_600;

export type UpgradeId = "crew" | "weapon" | "champion";

export type CampaignUpgrades = {
  crew: number;
  weapon: number;
  champion: number;
};

export type CampaignSave = {
  stars: number[];
  muted: boolean;
  tutorialDone: boolean;
  credits: number;
  bestTimes: number[];
  upgrades: CampaignUpgrades;
};

export type UpgradeDefinition = {
  id: UpgradeId;
  title: string;
  description: string;
  costs: number[];
  maxrank: number;
};

export type StartingLoadout = {
  tier: number;
  weaponLevel: number;
  charge: number;
};

export type CompleteRouteResult = {
  save: CampaignSave;
  earned: number;
  bestStars: number;
  bestTime: number;
};

/**
 * Costs are intentionally reachable from normal play. A first clear with
 * three stars pays 270 credits, so a player can choose between an early
 * firepower upgrade and a cheaper champion charge upgrade.
 */
export const UPGRADE_DEFS: readonly UpgradeDefinition[] = [
  {
    id: "crew",
    title: "Crowd crew",
    description: "Start each route with more cannons in the battery.",
    costs: [180, 360],
    maxrank: 2,
  },
  {
    id: "weapon",
    title: "Weapon core",
    description: "Start with a stronger shot pattern already equipped.",
    costs: [240, 500],
    maxrank: 2,
  },
  {
    id: "champion",
    title: "Champion charge",
    description: "Begin routes with a reserve champion charge.",
    costs: [80, 160, 280],
    maxrank: 3,
  },
];

const UPGRADE_BY_ID: Record<UpgradeId, UpgradeDefinition> = {
  crew: UPGRADE_DEFS[0],
  weapon: UPGRADE_DEFS[1],
  champion: UPGRADE_DEFS[2],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function finiteInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeStars(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, CAMPAIGN_ROUTES).map((rating) => intInRange(rating, 0, 3, 0));
}

function normalizeTimes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, CAMPAIGN_ROUTES).map((time) => {
    if (typeof time !== "number" || !Number.isFinite(time) || time <= 0) return 0;
    return finiteInRange(time, 0, MAX_TIME, 0);
  });
}

function normalizeUpgrades(value: unknown): CampaignUpgrades {
  const source = isRecord(value) ? value : {};
  return {
    crew: intInRange(source.crew, 0, UPGRADE_BY_ID.crew.maxrank, 0),
    weapon: intInRange(source.weapon, 0, UPGRADE_BY_ID.weapon.maxrank, 0),
    champion: intInRange(source.champion, 0, UPGRADE_BY_ID.champion.maxrank, 0),
  };
}

function migratedCredits(stars: number[]): number {
  return stars.reduce((total, rating) => (
    rating > 0 ? total + FIRST_CLEAR_CREDITS + rating * NEW_STAR_CREDITS : total
  ), 0);
}

/** Return a fresh save with the canonical shape and bounded values. */
export function emptyCampaignSave(): CampaignSave {
  return {
    stars: [],
    muted: false,
    tutorialDone: false,
    credits: 0,
    bestTimes: [],
    upgrades: { crew: 0, weapon: 0, champion: 0 },
  };
}

/**
 * Parse both the original {stars, muted, tutorialDone} save and the extended
 * campaign save. Missing credits are migrated exactly once by writing the
 * calculated balance into the normalized result; a second normalization sees
 * the explicit balance and does not award it again.
 */
export function normalizeCampaignSave(raw: unknown): CampaignSave {
  const source = isRecord(raw) ? raw : {};
  const stars = normalizeStars(source.stars);
  const hasCreditsField = Object.prototype.hasOwnProperty.call(source, "credits");
  const credits = hasCreditsField
    ? finiteInRange(source.credits, 0, MAX_CREDITS, 0)
    : Math.min(MAX_CREDITS, migratedCredits(stars));
  const hasTutorialField = Object.prototype.hasOwnProperty.call(source, "tutorialDone");
  const tutorialDone = typeof source.tutorialDone === "boolean"
    ? source.tutorialDone
    : hasTutorialField
      ? false
      : stars.some((rating) => rating > 0);

  return {
    stars,
    muted: source.muted === true,
    tutorialDone,
    credits: Math.floor(credits),
    bestTimes: normalizeTimes(source.bestTimes),
    upgrades: normalizeUpgrades(source.upgrades),
  };
}

function upgradeDefinition(id: UpgradeId | string): UpgradeDefinition | undefined {
  if (id === "crew" || id === "weapon" || id === "champion") return UPGRADE_BY_ID[id];
  return undefined;
}

function copySave(save: CampaignSave): CampaignSave {
  return {
    stars: [...save.stars],
    muted: save.muted,
    tutorialDone: save.tutorialDone,
    credits: save.credits,
    bestTimes: [...save.bestTimes],
    upgrades: { ...save.upgrades },
  };
}

/**
 * Buy one rank of an upgrade. Failed purchases return the exact input object,
 * which makes button handlers cheap and prevents accidental save churn.
 */
export function buyUpgrade(save: CampaignSave, id: UpgradeId | string): CampaignSave {
  const definition = upgradeDefinition(id);
  if (!definition) return save;

  const rank = intInRange(save.upgrades?.[definition.id], 0, definition.maxrank, 0);
  const credits = finiteInRange(save.credits, 0, MAX_CREDITS, 0);
  const cost = definition.costs[rank];
  if (cost === undefined || credits < cost) return save;

  const next = copySave(save);
  next.credits = Math.floor(credits - cost);
  next.upgrades[definition.id] = rank + 1;
  return next;
}

/**
 * Record a completed route. Stars and credits are incremental: new stars pay
 * once, while a replay of an already-cleared route pays the small repeat fee.
 * Losses (rating 0) do not pay and do not replace the best time.
 */
export function completeRoute(
  save: CampaignSave,
  index: number,
  rating: number,
  time: number,
): CompleteRouteResult {
  if (typeof index !== "number" || !Number.isFinite(index) || !Number.isInteger(index)
    || index < 0 || index >= CAMPAIGN_ROUTES) {
    return {
      save,
      earned: 0,
      bestStars: 0,
      bestTime: 0,
    };
  }
  const route = index;

  const next = copySave(save);
  const safeRating = intInRange(rating, 0, 3, 0);
  const previousStars = intInRange(next.stars[route], 0, 3, 0);
  const bestStars = Math.max(previousStars, safeRating);
  const newStars = Math.max(0, bestStars - previousStars);
  const firstClear = previousStars === 0 && safeRating > 0;
  const earned = safeRating > 0
    ? firstClear
      ? FIRST_CLEAR_CREDITS + newStars * NEW_STAR_CREDITS
      : newStars > 0
        ? newStars * NEW_STAR_CREDITS
        : REPEAT_CLEAR_CREDITS
    : 0;

  if (bestStars > previousStars) next.stars[route] = bestStars;
  next.credits = Math.min(MAX_CREDITS, next.credits + earned);

  const candidateTime = finiteInRange(time, 0.001, MAX_TIME, 0);
  const previousTime = finiteInRange(next.bestTimes[route], 0.001, MAX_TIME, 0);
  let bestTime = previousTime;
  if (safeRating > 0 && candidateTime > 0 && (previousTime === 0 || candidateTime < previousTime)) {
    next.bestTimes[route] = candidateTime;
    bestTime = candidateTime;
  }

  return { save: next, earned, bestStars, bestTime };
}

/** Project persistent ranks into the engine's run-start values. */
export function startingLoadout(save: CampaignSave): StartingLoadout {
  const upgrades = normalizeUpgrades(save?.upgrades);
  return {
    tier: 1 + upgrades.crew,
    weaponLevel: 1 + upgrades.weapon,
    charge: upgrades.champion * 10,
  };
}

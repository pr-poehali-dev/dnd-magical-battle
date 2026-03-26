import { DiceRoll, DiceType, AbilityScores } from './types';

/** Roll a single die */
export const rollDie = (sides: number): number =>
  Math.floor(Math.random() * sides) + 1;

const DIE_SIDES: Record<DiceType, number> = {
  d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20
};

/** Roll dice and return individual results + total */
export const rollDice = (roll: DiceRoll): { rolls: number[]; total: number } => {
  const sides = DIE_SIDES[roll.die];
  const rolls = Array.from({ length: roll.count }, () => rollDie(sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + roll.modifier };
};

/** Ability modifier = floor((score - 10) / 2) */
export const getModifier = (score: number): number =>
  Math.floor((score - 10) / 2);

/** Proficiency bonus by level (DnD table) */
export const getProficiencyBonus = (level: number): number => {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  if (level <= 16) return 5;
  return 6;
};

/** DnD Attack Roll: d20 + ability mod + proficiency vs AC */
export const attackRoll = (
  abilityMod: number,
  profBonus: number,
  targetAC: number
): { roll: number; total: number; hit: boolean; crit: boolean } => {
  const roll = rollDie(20);
  const total = roll + abilityMod + profBonus;
  return {
    roll,
    total,
    hit: roll === 20 || (roll !== 1 && total >= targetAC),
    crit: roll === 20,
  };
};

/** Saving throw: d20 + ability mod vs DC */
export const savingThrow = (
  score: number,
  dc: number
): { roll: number; total: number; success: boolean } => {
  const roll = rollDie(20);
  const total = roll + getModifier(score);
  return { roll, total, success: total >= dc };
};

/** DnD XP thresholds (slow progression, 20 levels) */
export const XP_THRESHOLDS: number[] = [
  0,        // lv 1 start
  300,      // → lv 2
  900,      // → lv 3
  2700,     // → lv 4
  6500,     // → lv 5
  14000,    // → lv 6
  23000,    // → lv 7
  34000,    // → lv 8
  48000,    // → lv 9
  64000,    // → lv 10
  85000,    // → lv 11
  100000,   // → lv 12
  120000,   // → lv 13
  140000,   // → lv 14
  165000,   // → lv 15
  195000,   // → lv 16
  225000,   // → lv 17
  265000,   // → lv 18
  305000,   // → lv 19
  355000,   // → lv 20
];

export const getExpToNext = (level: number): number =>
  level >= 20 ? 9999999 : XP_THRESHOLDS[level] - XP_THRESHOLDS[level - 1];

export const getTotalExpForLevel = (level: number): number =>
  XP_THRESHOLDS[Math.max(0, level - 1)];

/** Manhattan distance in cells */
export const gridDistance = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

/** Distance in feet */
export const distanceFeet = (x1: number, y1: number, x2: number, y2: number): number =>
  gridDistance(x1, y1, x2, y2) * 5;

/** Reachable cells given movement budget (feet) */
export const getReachableCells = (
  fromX: number, fromY: number,
  movementFt: number,
  gridCols: number, gridRows: number
): { x: number; y: number }[] => {
  const cells: { x: number; y: number }[] = [];
  const maxCells = Math.floor(movementFt / 5);
  for (let dx = -maxCells; dx <= maxCells; dx++) {
    for (let dy = -maxCells; dy <= maxCells; dy++) {
      const x = fromX + dx;
      const y = fromY + dy;
      if (x < 0 || x >= gridCols || y < 0 || y >= gridRows) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= maxCells) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
};

/** Cells in attack range */
export const getAttackRangeCells = (
  fromX: number, fromY: number,
  rangeFt: number,
  gridCols: number, gridRows: number
): { x: number; y: number }[] => {
  const cells: { x: number; y: number }[] = [];
  const maxCells = Math.floor(rangeFt / 5);
  for (let dx = -maxCells; dx <= maxCells; dx++) {
    for (let dy = -maxCells; dy <= maxCells; dy++) {
      const x = fromX + dx;
      const y = fromY + dy;
      if (x < 0 || x >= gridCols || y < 0 || y >= gridRows) continue;
      if (dx === 0 && dy === 0) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= maxCells) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
};

export const abilityName: Record<keyof AbilityScores, string> = {
  str: 'Сила', dex: 'Ловкость', con: 'Телосложение',
  int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма'
};

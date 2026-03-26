import { DiceRoll, DiceType, AbilityScores, GridCell, GRID_COLS, GRID_ROWS, CELL_FT, TerrainType } from './types';

const DIE_SIDES: Record<DiceType, number> = {
  d2: 2, d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20
};

export const rollDie = (die: DiceType): number =>
  Math.floor(Math.random() * DIE_SIDES[die]) + 1;

export const rollDieN = (sides: number): number =>
  Math.floor(Math.random() * sides) + 1;

export const rollDice = (roll: DiceRoll): { rolls: number[]; total: number } => {
  const sides = DIE_SIDES[roll.die];
  const rolls = Array.from({ length: roll.count }, () => Math.floor(Math.random() * sides) + 1);
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + roll.modifier };
};

export const rollDoubled = (roll: DiceRoll): { rolls: number[]; total: number } => {
  return rollDice({ ...roll, count: roll.count * 2 });
};

export const getModifier = (score: number) => Math.floor((score - 10) / 2);

export const getProficiencyBonus = (level: number): number => {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  if (level <= 16) return 5;
  return 6;
};

export const attackRoll20 = (
  atkMod: number,
  targetAC: number,
  hasAdvantage = false,
  hasDisadvantage = false
): { roll: number; total: number; hit: boolean; crit: boolean; critFail: boolean } => {
  let roll: number;
  if (hasAdvantage && !hasDisadvantage) {
    roll = Math.max(rollDieN(20), rollDieN(20));
  } else if (hasDisadvantage && !hasAdvantage) {
    roll = Math.min(rollDieN(20), rollDieN(20));
  } else {
    roll = rollDieN(20);
  }
  return {
    roll,
    total: roll + atkMod,
    hit: roll === 20 || (roll !== 1 && roll + atkMod >= targetAC),
    crit: roll === 20,
    critFail: roll === 1,
  };
};

export const savingThrow20 = (
  score: number,
  dc: number
): { roll: number; total: number; success: boolean; perfect: boolean; critFail: boolean } => {
  const roll = rollDieN(20);
  return {
    roll,
    total: roll + getModifier(score),
    success: roll === 20 || (roll !== 1 && roll + getModifier(score) >= dc),
    perfect: roll === 20,
    critFail: roll === 1,
  };
};

export const abilityName: Record<keyof AbilityScores, string> = {
  str: 'Сила', dex: 'Ловкость', con: 'Телосложение',
  int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма'
};

export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 99999];
export const getExpToNext = (level: number): number =>
  level >= 10 ? 9999999 : XP_THRESHOLDS[level] - XP_THRESHOLDS[level - 1];

// Евклидово расстояние в клетках: диагональ = √2 ≈ 1.414 клетки
// (т.е. 2 клетки по диагонали = ~2.83 клетки, что даёт круглые радиусы)
export const euclideanDist = (x1: number, y1: number, x2: number, y2: number) =>
  Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

// Расстояние в футах через евклидово (диагональ считается как √2 клетки)
export const distFeet = (x1: number, y1: number, x2: number, y2: number) =>
  euclideanDist(x1, y1, x2, y2) * CELL_FT;

// Оставляем chebyshevDist для AI-движения (шаг-за-шагом)
export const chebyshevDist = (x1: number, y1: number, x2: number, y2: number) =>
  Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

export const getReachable = (
  fromX: number, fromY: number,
  moveFt: number,
  grid: GridCell[][]
): { x: number; y: number }[] => {
  const budget = moveFt / CELL_FT; // в клетках (дробное)
  const maxGrid = Math.ceil(budget);
  const result: { x: number; y: number }[] = [];
  for (let dx = -maxGrid; dx <= maxGrid; dx++) {
    for (let dy = -maxGrid; dy <= maxGrid; dy++) {
      const x = fromX + dx, y = fromY + dy;
      if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) continue;
      if (x === fromX && y === fromY) continue;
      const cell = grid[y]?.[x];
      if (!cell || cell.terrain === 'blocked') continue;
      // Евклидово расстояние (диагональ ≈ 1.414 клетки)
      const dist = euclideanDist(fromX, fromY, x, y);
      const cost = cell.terrain === 'difficult' ? dist * 2 : dist;
      if (cost <= budget) result.push({ x, y });
    }
  }
  return result;
};

export const getTargetable = (
  fromX: number, fromY: number,
  rangeFt: number,
  grid: GridCell[][]
): { x: number; y: number }[] => {
  const maxDist = rangeFt / CELL_FT; // в клетках (дробное)
  const maxGrid = Math.ceil(maxDist);
  const result: { x: number; y: number }[] = [];
  for (let dx = -maxGrid; dx <= maxGrid; dx++) {
    for (let dy = -maxGrid; dy <= maxGrid; dy++) {
      const x = fromX + dx, y = fromY + dy;
      if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) continue;
      if (dx === 0 && dy === 0) continue;
      // Круглый радиус через евклидово расстояние
      if (euclideanDist(fromX, fromY, x, y) <= maxDist) result.push({ x, y });
    }
  }
  return result;
};

export const generateForestGrid = (): GridCell[][] => {
  const grid: GridCell[][] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      const r = Math.random();
      let terrain: TerrainType = 'open';
      let prop: GridCell['prop'];
      let treeHp: number | undefined;
      const variant = Math.floor(Math.random() * 4);
      // Clear spawn zones
      const isPlayerZone = x <= 3 && y >= 3 && y <= 7;
      const isEnemyZone  = x >= GRID_COLS - 4 && y >= 3 && y <= 7;
      if (!isPlayerZone && !isEnemyZone) {
        if (r < 0.14) {
          // Trees: open terrain (can enter), has HP, gives disadvantage
          terrain = 'open';
          prop = 'tree';
          treeHp = 3;
        } else if (r < 0.18) {
          terrain = 'cover';
          prop = 'rock';
        }
      }
      row.push({ x, y, terrain, prop, tileVariant: variant, treeHp });
    }
    grid.push(row);
  }
  return grid;
};
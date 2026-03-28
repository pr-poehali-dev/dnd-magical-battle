import {
  BattleState, BattleUnit, BattleLog, Character, Enemy, Skill,
  GridCell, StatusEffect, AnimEvent, GRID_COLS, GRID_ROWS, CELL_FT
} from './types';
import {
  attackRoll20, savingThrow20, rollDice, rollDoubled, rollDie, rollDieN,
  getModifier, getReachable, getTargetable, distFeet, chebyshevDist, euclideanDist,
  generateForestGrid
} from './dndUtils';

let _logId = 0;
let _animId = 0;
const mkLog = (text: string, type: BattleLog['type'], dice?: BattleLog['diceResult']): BattleLog =>
  ({ id: String(_logId++), text, type, diceResult: dice });

const LOG_MAX = 10;
const mkAnim = (type: AnimEvent['type'], unitId: string, dur: number, extra: Partial<AnimEvent> = {}): AnimEvent =>
  ({ id: String(_animId++), type, unitId, duration: dur, startTime: Date.now(), ...extra });

// ─── INIT ──────────────────────────────────────────────────────────────────
export const initBattle = (
  playerChars: Character[],
  enemies: Enemy[],
): BattleState => {
  const allUnits: BattleUnit[] = [
    ...playerChars.map((c, i): BattleUnit => ({
      kind: 'player',
      data: { ...c, gridX: 2 + i, gridY: 7 + (i % 3), statusEffects: [], hasAction: true, hasBonusAction: true, hasReaction: true, movementLeft: c.speed },
      teamId: 0,
      turnIndex: rollDieN(20) + getModifier(c.abilityScores.dex),
    })),
    ...enemies.map((e, i): BattleUnit => ({
      kind: 'enemy',
      data: { ...e, gridX: GRID_COLS - 3 - (i % 3), gridY: 7 + i, statusEffects: [], hasAction: true, hasBonusAction: true, hasReaction: true, movementLeft: e.speed },
      teamId: 1,
      turnIndex: rollDieN(20) + getModifier(e.abilityScores.dex),
    })),
  ].sort((a, b) => b.turnIndex - a.turnIndex);

  const grid = generateForestGrid();

  return {
    units: allUnits,
    currentUnitIndex: 0,
    round: 1,
    grid,
    log: [mkLog(`⚔ Бой начался! Ходит: ${allUnits[0].data.name} (инициатива: ${allUnits[0].turnIndex})`, 'system')],
    animQueue: [],
    phase: 'active',
    selectedUnitId: null,
    selectedSkill: null,
    movementMode: false,
    reachableCells: [],
    targetableCells: [],
    disengage: new Set(),
    unitsOnTree: new Set(),
    winTeam: undefined,
  };
};

export const initLocalPvP = (p1: Character, p2: Character): BattleState => {
  const allUnits: BattleUnit[] = [
    {
      kind: 'player',
      data: { ...p1, gridX: 2, gridY: 8, statusEffects: [], hasAction: true, hasBonusAction: true, hasReaction: true, movementLeft: p1.speed },
      teamId: 0,
      turnIndex: rollDieN(20) + getModifier(p1.abilityScores.dex),
    },
    {
      kind: 'player',
      data: { ...p2, gridX: GRID_COLS - 3, gridY: 8, statusEffects: [], hasAction: true, hasBonusAction: true, hasReaction: true, movementLeft: p2.speed },
      teamId: 1,
      turnIndex: rollDieN(20) + getModifier(p2.abilityScores.dex),
    },
  ].sort((a, b) => b.turnIndex - a.turnIndex);

  const grid = generateForestGrid();
  return {
    units: allUnits,
    currentUnitIndex: 0,
    round: 1,
    grid,
    log: [mkLog(`⚔ Локальный PvP! Ходит: ${allUnits[0].data.name} (инициатива: ${allUnits[0].turnIndex})`, 'system')],
    animQueue: [],
    phase: 'active',
    selectedUnitId: null,
    selectedSkill: null,
    movementMode: false,
    reachableCells: [],
    targetableCells: [],
    disengage: new Set(),
    unitsOnTree: new Set(),
    winTeam: undefined,
  };
};

// ─── HELPERS ───────────────────────────────────────────────────────────────
export const getCurrentUnit = (state: BattleState): BattleUnit =>
  state.units[state.currentUnitIndex % state.units.length];

const getUnitById = (state: BattleState, id: string) =>
  state.units.find(u => u.data.id === id);

const updateUnit = (state: BattleState, id: string, updater: (u: BattleUnit) => BattleUnit): BattleState => ({
  ...state,
  units: state.units.map(u => u.data.id === id ? updater(u) : u),
});

const applyDamage = (target: Character | Enemy, dmg: number): Character | Enemy => {
  let rem = dmg;
  let tempHp = target.tempHp;
  if (tempHp > 0) {
    const abs = Math.min(tempHp, rem);
    tempHp -= abs;
    rem -= abs;
  }
  const newHp = Math.max(0, target.hp - rem);
  const unconscious = newHp <= 0;
  const isChar = 'class' in target;
  const isDead = unconscious && !isChar;
  return { ...target, hp: newHp, tempHp, isUnconscious: unconscious, isDead };
};

const applyHeal = (target: Character | Enemy, amt: number): Character | Enemy => ({
  ...target, hp: Math.min(target.maxHp, target.hp + amt),
});

const checkWin = (units: BattleUnit[]): 0 | 1 | null => {
  const team0alive = units.filter(u => u.teamId === 0 && !u.data.isUnconscious).length;
  const team1alive = units.filter(u => u.teamId === 1 && !u.data.isUnconscious).length;
  if (team0alive === 0) return 1;
  if (team1alive === 0) return 0;
  return null;
};

const hasStatusEffect = (unit: BattleUnit, type: StatusEffect['type']) =>
  unit.data.statusEffects.some(e => e.type === type);

// ─── TREE HELPERS ──────────────────────────────────────────────────────────
export const TREE_HP = 3;

const isTreeCell = (cell: GridCell | undefined): boolean =>
  !!cell && cell.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0;

const damageTree = (grid: GridCell[][], x: number, y: number): GridCell[][] => {
  const newGrid = grid.map(row => row.map(c => ({ ...c })));
  const cell = newGrid[y]?.[x];
  if (!cell || cell.prop !== 'tree') return newGrid;
  const hp = (cell.treeHp ?? TREE_HP) - 1;
  if (hp <= 0) {
    newGrid[y][x] = { ...cell, terrain: 'open', prop: undefined, treeHp: 0 };
  } else {
    newGrid[y][x] = { ...cell, treeHp: hp };
  }
  return newGrid;
};

/** Найти свободную клетку рядом с координатами (не занятую юнитами) */
const findFreeCell = (state: BattleState, x: number, y: number, excludeId?: string): { x: number; y: number } | null => {
  const blocked = (cx: number, cy: number) => {
    if (cx < 0 || cx >= GRID_COLS || cy < 0 || cy >= GRID_ROWS) return true;
    const cell = state.grid[cy]?.[cx];
    if (!cell || cell.terrain === 'blocked') return true;
    return state.units.some(u =>
      u.data.id !== excludeId &&
      u.data.gridX === cx && u.data.gridY === cy &&
      !u.data.isUnconscious
    );
  };
  if (!blocked(x, y)) return { x, y };
  // Search in spiral
  for (let r = 1; r <= 4; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (!blocked(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
};

// ─── MOVE ──────────────────────────────────────────────────────────────────
export const moveUnit = (state: BattleState, unitId: string, toX: number, toY: number): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit) return state;

  const { data } = unit;
  const cell = state.grid[toY]?.[toX];
  if (!cell || cell.terrain === 'blocked') return state;

  const occupied = state.units.some(u =>
    u.data.id !== unitId &&
    u.data.gridX === toX && u.data.gridY === toY &&
    !u.data.isUnconscious && !u.data.onTree
  );
  if (occupied) return state;

  const dist = euclideanDist(data.gridX, data.gridY, toX, toY);
  const ftCost = (cell.terrain === 'difficult' ? dist * 2 : dist) * CELL_FT;
  if (ftCost > data.movementLeft) return state;

  const newData = { ...data, gridX: toX, gridY: toY, movementLeft: data.movementLeft - ftCost, onTree: false };
  const anims = [mkAnim('move', unitId, 300, { fromX: data.gridX, fromY: data.gridY, toX, toY })];

  const newOnTree = new Set(state.unitsOnTree);
  newOnTree.delete(unitId);

  return {
    ...updateUnit(state, unitId, u => ({ ...u, data: newData as typeof u.data })),
    unitsOnTree: newOnTree,
    log: [...state.log, mkLog(`${data.name} перемещается (осталось ${Math.floor(newData.movementLeft)} фут.)`, 'info')].slice(-LOG_MAX),
    animQueue: [...state.animQueue, ...anims],
    reachableCells: getReachable(toX, toY, newData.movementLeft, state.grid),
    movementMode: true,
  };
};

// ─── INFINITY STEP (Годжо: телепорт бонусным действием до 5 клеток) ──────────
export const doInfinityStep = (state: BattleState, unitId: string, targetId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  const target = getUnitById(state, targetId);
  if (!unit || !target || !unit.data.hasBonusAction) return state;

  const dist = euclideanDist(unit.data.gridX, unit.data.gridY, target.data.gridX, target.data.gridY);
  if (dist > 5) {
    return { ...state, log: [...state.log, mkLog(`❌ Infinity Step: цель слишком далеко (радиус 5 клеток)`, 'info')].slice(-LOG_MAX) };
  }

  const dx = Math.sign(target.data.gridX - unit.data.gridX);
  const dy = Math.sign(target.data.gridY - unit.data.gridY);
  let toX = Math.max(1, Math.min(GRID_COLS - 2, target.data.gridX - dx));
  let toY = Math.max(1, Math.min(GRID_ROWS - 2, target.data.gridY - dy));

  // Найти свободную клетку
  const free = findFreeCell(state, toX, toY, unitId);
  if (!free) return { ...state, log: [...state.log, mkLog(`❌ Infinity Step: нет свободной клетки рядом!`, 'info')].slice(-LOG_MAX) };
  toX = free.x; toY = free.y;

  const newState = updateUnit(state, unitId, u => ({
    ...u, data: { ...u.data, hasBonusAction: false, gridX: toX, gridY: toY } as typeof u.data
  }));
  return {
    ...newState,
    log: [...state.log, mkLog(`⚡ ${unit.data.name}: Infinity Step — телепортация!`, 'special')].slice(-LOG_MAX),
    animQueue: [...state.animQueue, mkAnim('move', unitId, 150, { fromX: unit.data.gridX, fromY: unit.data.gridY, toX, toY })],
  };
};

// ─── ATTACK ────────────────────────────────────────────────────────────────
export const executeAttack = (
  state: BattleState,
  attackerId: string,
  skill: Skill,
  targetId: string,
  isLocalPvp = false,
  /** Для Lapse Blue: координаты куда бросить врага */
  lapseThrowX?: number,
  lapseThrowY?: number,
  /** Маньи Кик: вызван как реакция */
  asReaction = false,
): BattleState => {
  const attacker = getUnitById(state, attackerId);
  const targetUnit = getUnitById(state, targetId);
  if (!attacker || !targetUnit) return state;

  const atk = attacker.data;
  const tgt = targetUnit.data;

  // Range check
  const distFt = distFeet(atk.gridX, atk.gridY, tgt.gridX, tgt.gridY);
  const maxRange = skill.range;
  if (distFt > maxRange && !skill.aoe) {
    return { ...state, log: [...state.log, mkLog(`❌ ${skill.name}: цель вне досягаемости (${Math.round(distFt)}/${maxRange} фут.)`, 'info')].slice(-LOG_MAX) };
  }

  // Tree rules: unit ON TOP → cannot be attacked in melee (tree blocks)
  const tgtOnTree = state.unitsOnTree.has(targetId);
  const atkOnTree = state.unitsOnTree.has(attackerId);
  if (tgtOnTree && skill.range <= 5 && !atkOnTree) {
    // Melee attacks hit the TREE, not the unit
    const cell = state.grid[tgt.gridY]?.[tgt.gridX];
    if (cell && cell.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0) {
      const newGrid = damageTree(state.grid, tgt.gridX, tgt.gridY);
      const hp = newGrid[tgt.gridY]?.[tgt.gridX]?.treeHp ?? 0;
      const newOnTree = new Set(state.unitsOnTree);
      let ns = { ...state, grid: newGrid };
      const logs: BattleLog[] = [mkLog(`🌲 ${atk.name} атакует дерево — ${tgt.name} вне досягаемости!`, 'miss')];
      if (hp <= 0) {
        logs.push(mkLog(`🌲💥 Дерево разрушено! ${tgt.name} падает!`, 'special'));
        newOnTree.delete(targetId);
        ns = updateUnit(ns, targetId, u => ({ ...u, data: { ...u.data, onTree: false } as typeof u.data }));
        ns = { ...ns, unitsOnTree: newOnTree };
      } else {
        logs.push(mkLog(`🌲 Дерево повреждено (${hp}/${TREE_HP} HP)`, 'system'));
      }
      return { ...ns, grid: newGrid, unitsOnTree: newOnTree, log: [...state.log, ...logs].slice(-LOG_MAX) };
    }
  }

  // ── Lapse Blue ─────────────────────────────────────────────────────────────
  if (skill.id === 'lapse_blue') {
    if (attacker.kind === 'player') {
      const ch = atk as Character;
      if (ch.cursedEnergy < skill.energyCost) {
        return { ...state, log: [...state.log, mkLog(`❌ Недостаточно ячеек (${ch.cursedEnergy}/${skill.energyCost})`, 'info')].slice(-LOG_MAX) };
      }
    }
    const actionPatch2: Partial<Character & Enemy> = {
      hasAction: false,
      ...(attacker.kind === 'player' ? { cursedEnergy: Math.max(0, (atk as Character).cursedEnergy - skill.energyCost) } : {}),
    };
    let ns = updateUnit(state, attackerId, u => ({ ...u, data: { ...u.data, ...actionPatch2 } as typeof u.data }));
    const blueLogs: BattleLog[] = [];
    const blueAnims: AnimEvent[] = [mkAnim('attack', attackerId, 300, { toX: tgt.gridX, toY: tgt.gridY, skillName: 'Lapse Blue' })];

    // Pull target adjacent to attacker
    const pullX = Math.max(1, Math.min(GRID_COLS - 2, atk.gridX + Math.sign(tgt.gridX - atk.gridX)));
    const pullY = Math.max(1, Math.min(GRID_ROWS - 2, atk.gridY + Math.sign(tgt.gridY - atk.gridY)));
    const freeCell = findFreeCell(ns, pullX, pullY, targetId);
    const finalPullX = freeCell?.x ?? pullX;
    const finalPullY = freeCell?.y ?? pullY;
    ns = updateUnit(ns, targetId, u => ({ ...u, data: { ...u.data, gridX: finalPullX, gridY: finalPullY, onTree: false } as typeof u.data }));
    const newOnTree = new Set(ns.unitsOnTree);
    newOnTree.delete(targetId);
    ns = { ...ns, unitsOnTree: newOnTree };
    blueLogs.push(mkLog(`🔵 Lapse Blue! ${tgt.name} притянут к ${atk.name}!`, 'special'));
    blueAnims.push(mkAnim('move', targetId, 400, { fromX: tgt.gridX, fromY: tgt.gridY, toX: finalPullX, toY: finalPullY }));

    // 100% попадание — спасбросок ТЕЛ СЛ10
    const sv = savingThrow20(tgt.abilityScores.con, 10);
    const dmgRoll = rollDice(skill.damageDice);
    const finalDmg = sv.success ? Math.floor(dmgRoll.total / 2) : dmgRoll.total;
    blueLogs.push(mkLog(`🎲 Спасбросок ТЕЛ [${sv.roll}]+${getModifier(tgt.abilityScores.con)}=${sv.total} vs СЛ10 — ${sv.success ? 'УСПЕХ (пол урона)' : 'ПРОВАЛ'}`, 'save', { rolls: [sv.roll], total: sv.total, mod: getModifier(tgt.abilityScores.con), die: 'd20' }));
    blueLogs.push(mkLog(`🔵 Blue удар (100%): ${finalDmg} урона → ${tgt.name}`, 'hit', { rolls: dmgRoll.rolls, total: finalDmg, mod: 0, die: skill.damageDice.die }));
    blueAnims.push(mkAnim('hit', targetId, 300));

    const curTgt = (getUnitById(ns, targetId)?.data ?? tgt);
    const damagedTgt = applyDamage(curTgt, finalDmg);
    ns = updateUnit(ns, targetId, u => ({ ...u, data: damagedTgt as typeof u.data }));

    // Push: игрок выбирает куда бросить (lapseThrowX/Y), иначе авто 5 клеток от атакующего
    const curT = getUnitById(ns, targetId)?.data ?? damagedTgt;
    let pushX: number, pushY: number;
    if (lapseThrowX !== undefined && lapseThrowY !== undefined) {
      // Ограничиваем бросок: не более 7 клеток (35ft) от атакующего
      const throwDist = euclideanDist(atk.gridX, atk.gridY, lapseThrowX, lapseThrowY);
      const maxThrowCells = 7;
      if (throwDist > maxThrowCells) {
        const ratio = maxThrowCells / throwDist;
        lapseThrowX = Math.round(atk.gridX + (lapseThrowX - atk.gridX) * ratio);
        lapseThrowY = Math.round(atk.gridY + (lapseThrowY - atk.gridY) * ratio);
      }
      pushX = Math.max(1, Math.min(GRID_COLS - 2, lapseThrowX));
      pushY = Math.max(1, Math.min(GRID_ROWS - 2, lapseThrowY));
    } else {
      const pushDx = Math.sign(curT.gridX - atk.gridX) || 1;
      const pushDy = Math.sign(curT.gridY - atk.gridY);
      pushX = Math.max(1, Math.min(GRID_COLS - 2, curT.gridX + pushDx * 3));
      pushY = Math.max(1, Math.min(GRID_ROWS - 2, curT.gridY + pushDy * 3));
    }
    // Найти свободную клетку для отброса
    const freePush = findFreeCell(ns, pushX, pushY, targetId);
    if (freePush) { pushX = freePush.x; pushY = freePush.y; }

    const fromPX = curT.gridX; const fromPY = curT.gridY;
    ns = updateUnit(ns, targetId, u => ({ ...u, data: { ...u.data, gridX: pushX, gridY: pushY, onTree: false } as typeof u.data }));
    blueLogs.push(mkLog(`💨 ${tgt.name} отброшен ударом ноги!`, 'special'));
    blueAnims.push(mkAnim('move', targetId, 500, { fromX: fromPX, fromY: fromPY, toX: pushX, toY: pushY }));

    if (damagedTgt.isUnconscious) {
      blueLogs.push(mkLog(`💀 ${tgt.name} повержен!`, 'death'));
      blueAnims.push(mkAnim('death', targetId, 400));
    }

    const winT = checkWin(ns.units);
    return {
      ...ns,
      log: [...state.log, ...blueLogs].slice(-LOG_MAX),
      animQueue: [...state.animQueue, ...blueAnims],
      phase: winT !== null ? (winT === 0 ? 'victory' : 'defeat') : 'active',
      winTeam: winT ?? undefined,
    };
  }

  // ── Manji Kick — реакция: уклонение + контратака ──────────────────────────
  if (skill.id === 'manji_kick') {
    // В localPvP — не работает
    if (isLocalPvp) {
      return { ...state, log: [...state.log, mkLog(`❌ Маньи Кик не работает в локальном PvP`, 'info')].slice(-LOG_MAX) };
    }

    if (!attacker.data.hasReaction) {
      return { ...state, log: [...state.log, mkLog(`❌ Реакция уже потрачена в этом раунде!`, 'info')].slice(-LOG_MAX) };
    }

    const manjiLogs: BattleLog[] = [];
    const manjiAnims: AnimEvent[] = [];

    // Потратить реакцию (без КД)
    let ns = updateUnit(state, attackerId, u => ({
      ...u, data: { ...u.data, hasReaction: false } as typeof u.data
    }));

    manjiLogs.push(mkLog(`⚡ ${atk.name} — Маньи Кик! Уклонение и контратака!`, 'special'));
    manjiAnims.push(mkAnim('reaction', attackerId, 300));

    // Контратака (обычный бросок атаки)
    const atkMod = getModifier(atk.abilityScores.str) + atk.proficiencyBonus;
    const roll = attackRoll20(atkMod, tgt.armorClass);
    manjiLogs.push(mkLog(`🎲 Контратака: [${roll.roll}]+${atkMod}=${roll.total} vs КБ${tgt.armorClass}`, 'info', { rolls: [roll.roll], total: roll.total, mod: atkMod, die: 'd20' }));

    if (!roll.hit) {
      manjiLogs.push(mkLog(`💨 Контратака — ПРОМАХ`, 'miss'));
      manjiAnims.push(mkAnim('miss', targetId, 200));
    } else {
      const dmgRoll = rollDice(skill.damageDice);
      const finalDmg = roll.crit ? rollDice({ ...skill.damageDice, count: skill.damageDice.count * 2 }).total : dmgRoll.total;
      manjiLogs.push(mkLog(`👊 Контратака ${roll.crit ? 'КРИТ!' : ''}: ${finalDmg} урона → ${tgt.name}`, roll.crit ? 'critical' : 'hit', { rolls: dmgRoll.rolls, total: finalDmg, mod: 0, die: skill.damageDice.die }));
      manjiAnims.push(mkAnim('hit', targetId, 300, { isCrit: roll.crit }));
      const damaged = applyDamage(tgt, finalDmg);
      ns = updateUnit(ns, targetId, u => ({ ...u, data: damaged as typeof u.data }));
      if (damaged.isUnconscious) {
        manjiLogs.push(mkLog(`💀 ${tgt.name} повержен!`, 'death'));
        manjiAnims.push(mkAnim('death', targetId, 400));
      }
    }

    const winT = checkWin(ns.units);
    return {
      ...ns,
      log: [...state.log, ...manjiLogs].slice(-LOG_MAX),
      animQueue: [...state.animQueue, ...manjiAnims],
      phase: winT !== null ? (winT === 0 ? 'victory' : 'defeat') : 'active',
      winTeam: winT ?? undefined,
    };
  }

  // ── Consume action ─────────────────────────────────────────────────────────
  const actionPatch: Partial<Character & Enemy> = {};
  if (skill.actionCost === 'action') actionPatch.hasAction = false;
  if (skill.actionCost === 'bonus_action') actionPatch.hasBonusAction = false;
  if (skill.actionCost === 'reaction') actionPatch.hasReaction = false;

  let newState = updateUnit(state, attackerId, u => ({ ...u, data: { ...u.data, ...actionPatch } as typeof u.data }));

  const logs: BattleLog[] = [];
  const anims: AnimEvent[] = [mkAnim('attack', attackerId, 250, { toX: tgt.gridX, toY: tgt.gridY, skillName: skill.name })];

  // Tree: unit standing IN tree cell (not on top) = disadvantage on attacks against them
  const unitCellIsTree = (u: BattleUnit) => {
    const cell = state.grid[u.data.gridY]?.[u.data.gridX];
    return !!(cell && cell.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0 && !state.unitsOnTree.has(u.data.id));
  };
  const tgtInTree = unitCellIsTree(targetUnit);

  if (atkOnTree && !tgtOnTree && !skill.aoe) {
    return { ...state, log: [...state.log, mkLog(`❌ ${atk.name} на вершине дерева — не может атаковать наземные цели!`, 'info')].slice(-LOG_MAX) };
  }

  const hasAdv = hasStatusEffect(attacker, 'advantage_atk');
  let hasDisAdv = hasStatusEffect(attacker, 'disadvantage_atk') || tgtInTree;

  // Reserve Balls: если цель в 5 футах — помеха, урон 1к6 вместо 1к4
  let reserveBallsClose = false;
  if (skill.id === 'reserve_balls') {
    if (distFeet(atk.gridX, atk.gridY, tgt.gridX, tgt.gridY) <= 5) {
      hasDisAdv = true;
      reserveBallsClose = true;
    }
  }

  // ── 100% attack ──
  if (skill.is100pct) {
    const dmgRoll = rollDice(skill.damageDice);
    const dmg = dmgRoll.total;
    logs.push(mkLog(`💥 ${atk.name} — «${skill.name}» (100%)! Урон: ${dmg}`,
      'hit', { rolls: dmgRoll.rolls, total: dmg, mod: 0, die: skill.damageDice.die }));
    anims.push(mkAnim('hit', targetId, 300, { isCrit: false }));
    const newTarget = applyDamage(tgt, dmg);
    newState = updateUnit(newState, targetId, u => ({ ...u, data: newTarget as typeof u.data }));
    if (newTarget.isDead) anims.push(mkAnim('death', targetId, 400));
  } else {
    // ── Standard attack roll ──
    const atkMod = getModifier(atk.abilityScores.str) + atk.proficiencyBonus;
    const roll = attackRoll20(atkMod, tgt.armorClass, hasAdv, hasDisAdv);

    logs.push(mkLog(
      `🎲 ${atk.name} — [${roll.roll}]+${atkMod}=${roll.total} vs КБ${tgt.armorClass}${hasDisAdv ? ' (помеха)' : ''}`,
      'info', { rolls: [roll.roll], total: roll.total, mod: atkMod, die: 'd20' }
    ));

    if (!roll.hit) {
      logs.push(mkLog(`💨 «${skill.name}» — ПРОМАХ!`, 'miss'));
      anims.push(mkAnim('miss', targetId, 200));
      // Tree: промах по юниту в дереве ломает 1 прочность
      if (tgtInTree) {
        const newGrid = damageTree(newState.grid, tgt.gridX, tgt.gridY);
        const hp = newGrid[tgt.gridY]?.[tgt.gridX]?.treeHp ?? 0;
        newState = { ...newState, grid: newGrid };
        logs.push(mkLog(`🌲 Промах! Дерево повреждено (${hp}/${TREE_HP} HP)`, 'system'));
      }
    } else {
      // Black Flash check (Divergent's Fist: 18-20)
      let finalDice = skill.damageDice;
      let isBlackFlash = false;
      if (skill.blackFlash && roll.roll >= 18) {
        finalDice = skill.blackFlash.damageDice;
        isBlackFlash = true;
        logs.push(mkLog('⚡ ЧЁРНАЯ МОЛНИЯ! (18-20) 1к6!', 'special'));
      }

      let dmgRoll: { rolls: number[]; total: number };
      if (roll.crit) {
        if (skill.blackFlash && isBlackFlash) {
          const r1 = rollDice(skill.blackFlash.damageDice);
          const r2 = rollDice(skill.blackFlash.damageDice);
          dmgRoll = { rolls: [...r1.rolls, ...r2.rolls], total: r1.total + r2.total };
        } else {
          dmgRoll = rollDoubled(finalDice);
        }
        logs.push(mkLog(`💥 КРИТИЧЕСКОЕ ПОПАДАНИЕ! Двойной урон!`, 'critical'));
      } else {
        dmgRoll = rollDice(finalDice);
      }

      const finalDmg = dmgRoll.total;
      logs.push(mkLog(
        `${roll.crit ? '💥' : '✅'} «${skill.name}»${isBlackFlash ? ' ⚡' : ''}: ${finalDmg} урона → ${tgt.name}`,
        roll.crit ? 'critical' : 'hit',
        { rolls: dmgRoll.rolls, total: finalDmg, mod: 0, die: finalDice.die }
      ));
      anims.push(mkAnim('hit', targetId, 300, { isCrit: roll.crit }));

      let newStatusFX = [...tgt.statusEffects];
      let newTarget = applyDamage(tgt, finalDmg);

      // ── Mechanics for specific skills ─────────────────────────────────────

      // Cursed Strikes — толкает обоих на 1 клетку в сторону врага (если возможно)
      if (skill.id === 'cursed_strikes') {
        const dx = Math.sign(tgt.gridX - atk.gridX);
        const dy = Math.sign(tgt.gridY - atk.gridY);
        const newTgtX = Math.max(1, Math.min(GRID_COLS - 2, tgt.gridX + dx));
        const newTgtY = Math.max(1, Math.min(GRID_ROWS - 2, tgt.gridY + dy));
        const newAtkX = Math.max(1, Math.min(GRID_COLS - 2, atk.gridX + dx));
        const newAtkY = Math.max(1, Math.min(GRID_ROWS - 2, atk.gridY + dy));
        const tgtFree = !newState.units.some(u => u.data.id !== targetId && u.data.gridX === newTgtX && u.data.gridY === newTgtY && !u.data.isUnconscious);
        const atkFree = !newState.units.some(u => u.data.id !== attackerId && u.data.gridX === newAtkX && u.data.gridY === newAtkY && !u.data.isUnconscious);
        if (tgtFree) {
          newTarget = { ...newTarget, gridX: newTgtX, gridY: newTgtY };
          anims.push(mkAnim('move', targetId, 200, { fromX: tgt.gridX, fromY: tgt.gridY, toX: newTgtX, toY: newTgtY }));
        }
        if (atkFree) {
          newState = updateUnit(newState, attackerId, u => ({ ...u, data: { ...u.data, gridX: newAtkX, gridY: newAtkY } as typeof u.data }));
          anims.push(mkAnim('move', attackerId, 200, { fromX: atk.gridX, fromY: atk.gridY, toX: newAtkX, toY: newAtkY }));
        }
        logs.push(mkLog(`👊 Cursed Strikes — серия ударов, оба сдвинулись на 1 кл.!`, 'special'));
      }

      // Reserve Balls — если цель близко, урон 1к6
      if (skill.id === 'reserve_balls' && reserveBallsClose && !roll.crit) {
        const closeRoll = rollDice({ count: 1, die: 'd6', modifier: 0 });
        const extraDmg = closeRoll.total - finalDmg;
        if (extraDmg > 0) {
          newTarget = applyDamage(newTarget.isUnconscious ? newTarget : (applyHeal(newTarget, finalDmg) as typeof newTarget), closeRoll.total);
        }
        logs.push(mkLog(`🟢 Reserve Balls (вблизи): урон 1к6 = ${closeRoll.total}`, 'special'));
      }

      // Shutted Doors — при провале спасброска: лишает реакции
      if (skill.id === 'shutted_doors' && skill.savingThrow) {
        const svDoors = savingThrow20(tgt.abilityScores.con, skill.savingThrow.dc);
        logs.push(mkLog(`🚪 Shutted Doors: спасбросок ТЕЛ [${svDoors.roll}]=${svDoors.total} vs СЛ${skill.savingThrow.dc} — ${svDoors.success ? 'УСПЕХ (пол урона)' : 'ПРОВАЛ (нет реакции)'}`, 'save', { rolls: [svDoors.roll], total: svDoors.total, mod: getModifier(tgt.abilityScores.con), die: 'd20' }));
        if (svDoors.success) {
          newTarget = applyHeal(newTarget, Math.floor(finalDmg / 2)) as typeof newTarget;
        } else {
          newTarget = { ...newTarget, hasReaction: false };
          newStatusFX = [...newStatusFX, { type: 'no_movement', duration: 1, value: 0 }];
        }
      }

      // Rough Energy — откидывает цель на 5 клеток (25 ft)
      if (skill.id === 'rough_energy') {
        const dx = Math.sign(tgt.gridX - atk.gridX) || 1;
        const dy = Math.sign(tgt.gridY - atk.gridY);
        const roughX = Math.max(1, Math.min(GRID_COLS - 2, tgt.gridX + dx * 5));
        const roughY = Math.max(1, Math.min(GRID_ROWS - 2, tgt.gridY + dy * 5));
        const roughFree = findFreeCell(newState, roughX, roughY, targetId);
        if (roughFree && !newTarget.isUnconscious) {
          newTarget = { ...newTarget, gridX: roughFree.x, gridY: roughFree.y };
          anims.push(mkAnim('move', targetId, 500, { fromX: tgt.gridX, fromY: tgt.gridY, toX: roughFree.x, toY: roughFree.y }));
          logs.push(mkLog(`💚 Rough Energy — цель отброшена на 25 фут.!`, 'special'));
        }
      }

      // Fever Breaker — цель отлетает на 5 клеток, Хакари летит вперёд на 2 клетки
      if (skill.id === 'fever_breaker') {
        const dx = Math.sign(tgt.gridX - atk.gridX) || 1;
        const dy = Math.sign(tgt.gridY - atk.gridY);
        const feverTgtX = Math.max(1, Math.min(GRID_COLS - 2, tgt.gridX + dx * 5));
        const feverTgtY = Math.max(1, Math.min(GRID_ROWS - 2, tgt.gridY + dy * 5));
        const feverFree = findFreeCell(newState, feverTgtX, feverTgtY, targetId);
        if (feverFree && !newTarget.isUnconscious) {
          newTarget = { ...newTarget, gridX: feverFree.x, gridY: feverFree.y };
          anims.push(mkAnim('move', targetId, 500, { fromX: tgt.gridX, fromY: tgt.gridY, toX: feverFree.x, toY: feverFree.y }));
          logs.push(mkLog(`💚 Fever Breaker — цель пробита насквозь, отлетает на 25 фут.!`, 'special'));
        }
        // Хакари летит вперёд
        const atkFX = Math.max(1, Math.min(GRID_COLS - 2, atk.gridX + dx * 2));
        const atkFY = Math.max(1, Math.min(GRID_ROWS - 2, atk.gridY + dy * 2));
        const atkFree2 = findFreeCell(newState, atkFX, atkFY, attackerId);
        if (atkFree2) {
          newState = updateUnit(newState, attackerId, u => ({ ...u, data: { ...u.data, gridX: atkFree2.x, gridY: atkFree2.y } as typeof u.data }));
          anims.push(mkAnim('move', attackerId, 400, { fromX: atk.gridX, fromY: atk.gridY, toX: atkFree2.x, toY: atkFree2.y }));
          logs.push(mkLog(`💚 Хакари пробивает двери и летит вперёд!`, 'special'));
        }
      }

      // Gojo Rapid Punches — толкает врага на 5 ft (1 клетку) в сторону атаки
      if (skill.id === 'gojo_rapid_punches') {
        const dx = Math.sign(tgt.gridX - atk.gridX);
        const dy = Math.sign(tgt.gridY - atk.gridY);
        const newTgtX = Math.max(1, Math.min(GRID_COLS - 2, tgt.gridX + dx));
        const newTgtY = Math.max(1, Math.min(GRID_ROWS - 2, tgt.gridY + dy));
        const cellT = state.grid[newTgtY]?.[newTgtX];
        const canPush = cellT && cellT.terrain !== 'blocked' &&
          !newState.units.some(u => u.data.id !== targetId && u.data.gridX === newTgtX && u.data.gridY === newTgtY && !u.data.isUnconscious);
        if (canPush) {
          newTarget = { ...newTarget, gridX: newTgtX, gridY: newTgtY };
          anims.push(mkAnim('move', targetId, 250, { fromX: tgt.gridX, fromY: tgt.gridY, toX: newTgtX, toY: newTgtY }));
          logs.push(mkLog(`👊 Rapid Punches — толчок на 5 фут.!`, 'special'));
        }
        // Годжо тоже продвигается
        const newAtkX = Math.max(1, Math.min(GRID_COLS - 2, atk.gridX + dx));
        const newAtkY = Math.max(1, Math.min(GRID_ROWS - 2, atk.gridY + dy));
        const atkCell = state.grid[newAtkY]?.[newAtkX];
        const atkFree = atkCell && atkCell.terrain !== 'blocked' &&
          !newState.units.some(u => u.data.id !== attackerId && u.data.gridX === newAtkX && u.data.gridY === newAtkY && !u.data.isUnconscious);
        if (atkFree) {
          newState = updateUnit(newState, attackerId, u => ({ ...u, data: { ...u.data, gridX: newAtkX, gridY: newAtkY } as typeof u.data }));
          anims.push(mkAnim('move', attackerId, 250, { fromX: atk.gridX, fromY: atk.gridY, toX: newAtkX, toY: newAtkY }));
        }
      }

      // Saving throw (для скиллов кроме Shutted Doors который уже обработан выше)
      if (skill.savingThrow && !skill.is100pct && skill.id !== 'shutted_doors') {
        const sv = savingThrow20(tgt.abilityScores[skill.savingThrow.stat], skill.savingThrow.dc);
        logs.push(mkLog(`🎲 Спасбросок ${skill.savingThrow.stat.toUpperCase()} [${sv.roll}]=${sv.total} vs СЛ${skill.savingThrow.dc} — ${sv.success ? 'УСПЕХ' : 'ПРОВАЛ'}`, 'save', { rolls: [sv.roll], total: sv.total, mod: getModifier(tgt.abilityScores[skill.savingThrow.stat]), die: 'd20' }));
        if (sv.perfect) {
          logs.push(mkLog(`✨ Идеальный спасбросок — урон не нанесён!`, 'special'));
          newTarget = applyHeal(tgt, finalDmg) as typeof newTarget;
        }
      } else if (skill.statusEffect && !skill.savingThrow) {
        newStatusFX = [...newStatusFX, { ...skill.statusEffect }];
      }

      newTarget = { ...newTarget, statusEffects: newStatusFX } as typeof newTarget;
      newState = updateUnit(newState, targetId, u => ({ ...u, data: newTarget as typeof u.data }));
      if (newTarget.isDead) {
        logs.push(mkLog(`💀 ${tgt.name} повержен!`, 'death'));
        anims.push(mkAnim('death', targetId, 500));
      }
    }
  }

  // Cooldown
  if (skill.cooldownRounds > 0) {
    newState = updateUnit(newState, attackerId, u => {
      const hasUnlocked = !!(u.data as Character).unlockedSkills;
      const srcArr: Skill[] = hasUnlocked
        ? ((u.data as Character).unlockedSkills ?? [])
        : ((u.data as Enemy).skills ?? []);
      const ticked = srcArr.map(s => s.id === skill.id ? { ...s, currentCooldown: s.cooldownRounds } : s);
      return hasUnlocked
        ? { ...u, data: { ...u.data, unlockedSkills: ticked } as typeof u.data }
        : { ...u, data: { ...u.data, skills: ticked } as typeof u.data };
    });
  }

  // Tree damage when target is in tree and NOT on top
  let finalGrid = newState.grid;
  const tgtCell = state.grid[tgt.gridY]?.[tgt.gridX];
  if (tgtCell?.prop === 'tree' && (tgtCell.treeHp ?? TREE_HP) > 0 && !state.unitsOnTree.has(targetId)) {
    finalGrid = damageTree(newState.grid, tgt.gridX, tgt.gridY);
    const newTreeHp = (finalGrid[tgt.gridY]?.[tgt.gridX]?.treeHp ?? 0);
    if (newTreeHp <= 0) {
      logs.push(mkLog(`🌲💥 Дерево разрушено!`, 'special'));
      const newOnTree = new Set(newState.unitsOnTree);
      newState.units.forEach(u => {
        if (u.data.gridX === tgt.gridX && u.data.gridY === tgt.gridY) {
          newOnTree.delete(u.data.id);
        }
      });
      newState = { ...newState, unitsOnTree: newOnTree };
    } else {
      logs.push(mkLog(`🌲 Дерево повреждено (${newTreeHp}/${TREE_HP} HP)`, 'system'));
    }
  }

  const winTeam = checkWin(newState.units);
  return {
    ...newState,
    grid: finalGrid,
    log: [...state.log, ...logs].slice(-LOG_MAX),
    animQueue: [...state.animQueue, ...anims],
    phase: winTeam !== null ? (winTeam === 0 ? 'victory' : 'defeat') : 'active',
    winTeam: winTeam ?? undefined,
  };
};

// ─── REVERSAL RED: AOE с откатом врагов на 5 ft ──────────────────────────────
export const executeReversalRed = (state: BattleState, attackerId: string, targetX: number, targetY: number): BattleState => {
  const attacker = getUnitById(state, attackerId);
  if (!attacker || !attacker.data.hasAction) return state;

  const atk = attacker.data;
  const skill = (attacker.kind === 'player'
    ? (atk as Character).unlockedSkills
    : (atk as Enemy).skills
  ).find(s => s.id === 'reversal_red');
  if (!skill) return state;

  if (attacker.kind === 'player') {
    const ch = atk as Character;
    if (ch.cursedEnergy < skill.energyCost) {
      return { ...state, log: [...state.log, mkLog(`❌ Недостаточно ячеек (${ch.cursedEnergy}/${skill.energyCost})`, 'info')].slice(-LOG_MAX) };
    }
  }

  const distFt = euclideanDist(atk.gridX, atk.gridY, targetX, targetY) * CELL_FT;
  if (distFt > skill.range) {
    return { ...state, log: [...state.log, mkLog(`❌ Reversal Red: точка вне досягаемости (${Math.round(distFt)}/${skill.range} фут.)`, 'info')].slice(-LOG_MAX) };
  }

  const energyPatch = attacker.kind === 'player'
    ? { cursedEnergy: Math.max(0, (atk as Character).cursedEnergy - skill.energyCost) }
    : {};
  let ns = updateUnit(state, attackerId, u => ({ ...u, data: { ...u.data, hasAction: false, ...energyPatch } as typeof u.data }));
  const logs: BattleLog[] = [mkLog(`🔴 Reversal Red! Взрыв в (${targetX},${targetY})`, 'special')];
  const anims: AnimEvent[] = [mkAnim('attack', attackerId, 500, { toX: targetX, toY: targetY, skillName: 'Reversal Red' })];

  const aoeR = skill.aoeRadius ?? 2;

  ns.units.forEach(u => {
    if (u.data.id === attackerId || u.data.isUnconscious) return;
    const d = euclideanDist(u.data.gridX, u.data.gridY, targetX, targetY);
    if (d > aoeR) return;

    const tgt = u.data;
    const sv = savingThrow20(tgt.abilityScores.dex, 10);
    const dmgRoll = rollDice(skill.damageDice);
    const finalDmg = sv.success ? Math.floor(dmgRoll.total / 2) : dmgRoll.total;
    logs.push(mkLog(`🎲 ${tgt.name}: спасбросок ЛОВ [${sv.roll}]=${sv.total} vs СЛ10 — ${sv.success ? 'УСПЕХ' : 'ПРОВАЛ'}`, 'save', { rolls: [sv.roll], total: sv.total, mod: getModifier(tgt.abilityScores.dex), die: 'd20' }));
    logs.push(mkLog(`🔴 Взрыв: ${finalDmg} урона → ${tgt.name}`, 'hit', { rolls: dmgRoll.rolls, total: finalDmg, mod: 0, die: skill.damageDice.die }));
    const damaged = applyDamage(tgt, finalDmg);

    // Откат врага на 5 фут от центра взрыва
    const isInCenter = d < 0.5;
    let knockX = tgt.gridX;
    let knockY = tgt.gridY;
    if (!damaged.isUnconscious) {
      if (isInCenter) {
        // Откат от Годжо (центр взрыва совпадает с врагом)
        const kDx = Math.sign(tgt.gridX - atk.gridX) || 1;
        const kDy = Math.sign(tgt.gridY - atk.gridY);
        knockX = Math.max(1, Math.min(GRID_COLS - 2, tgt.gridX + kDx));
        knockY = Math.max(1, Math.min(GRID_ROWS - 2, tgt.gridY + kDy));
      } else {
        // Откат от центра взрыва
        const kDx = Math.sign(tgt.gridX - targetX);
        const kDy = Math.sign(tgt.gridY - targetY);
        knockX = Math.max(1, Math.min(GRID_COLS - 2, tgt.gridX + (kDx || 1)));
        knockY = Math.max(1, Math.min(GRID_ROWS - 2, tgt.gridY + (kDy || 0)));
      }
      const knockFree = findFreeCell(ns, knockX, knockY, u.data.id);
      if (knockFree) { knockX = knockFree.x; knockY = knockFree.y; }
    }

    ns = updateUnit(ns, u.data.id, uu => ({
      ...uu, data: { ...damaged, gridX: knockX, gridY: knockY } as typeof uu.data
    }));
    anims.push(mkAnim('hit', u.data.id, 300));
    if (!damaged.isUnconscious && (knockX !== tgt.gridX || knockY !== tgt.gridY)) {
      anims.push(mkAnim('move', u.data.id, 300, { fromX: tgt.gridX, fromY: tgt.gridY, toX: knockX, toY: knockY }));
      logs.push(mkLog(`💨 ${tgt.name} отброшен взрывом на 5 фут.!`, 'special'));
    }
    if (damaged.isUnconscious) {
      logs.push(mkLog(`💀 ${tgt.name} повержен!`, 'death'));
      anims.push(mkAnim('death', u.data.id, 400));
    }
  });

  // Ломаем деревья в радиусе
  let finalGrid = ns.grid;
  const newOnTree = new Set(ns.unitsOnTree);
  for (let dy = -aoeR; dy <= aoeR; dy++) {
    for (let dx = -aoeR; dx <= aoeR; dx++) {
      const tx = targetX + dx, ty = targetY + dy;
      if (tx < 0 || tx >= GRID_COLS || ty < 0 || ty >= GRID_ROWS) continue;
      if (euclideanDist(tx, ty, targetX, targetY) > aoeR) continue;
      const cell = finalGrid[ty]?.[tx];
      if (!cell || cell.prop !== 'tree' || (cell.treeHp ?? TREE_HP) <= 0) continue;
      finalGrid = damageTree(finalGrid, tx, ty);
      const newHp = finalGrid[ty]?.[tx]?.treeHp ?? 0;
      if (newHp <= 0) {
        logs.push(mkLog(`🌲💥 Дерево в (${tx},${ty}) уничтожено взрывом!`, 'special'));
        ns.units.forEach(u => { if (u.data.gridX === tx && u.data.gridY === ty) newOnTree.delete(u.data.id); });
      }
    }
  }

  // Tick cooldown
  ns = updateUnit(ns, attackerId, u => {
    if (u.kind === 'player') {
      const ch = u.data as Character;
      const ticked = ch.unlockedSkills.map(s => s.id === 'reversal_red' ? { ...s, currentCooldown: s.cooldownRounds } : s);
      return { ...u, data: { ...ch, unlockedSkills: ticked } as typeof u.data };
    }
    return u;
  });

  const winTeam = checkWin(ns.units);
  return {
    ...ns,
    grid: finalGrid,
    unitsOnTree: newOnTree,
    log: [...state.log, ...logs].slice(-LOG_MAX),
    animQueue: [...state.animQueue, ...anims],
    phase: winTeam !== null ? (winTeam === 0 ? 'victory' : 'defeat') : 'active',
    winTeam: winTeam ?? undefined,
  };
};

// ─── BASE ACTIONS ──────────────────────────────────────────────────────────

/** Dash: тратит действие, прибавляет +30 ft движения (x2 скорость) */
export const doDash = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.hasAction) return state;
  const newState = updateUnit(state, unitId, u => ({
    ...u, data: { ...u.data, hasAction: false, movementLeft: u.data.movementLeft + u.data.speed } as typeof u.data
  }));
  return {
    ...newState,
    log: [...state.log, mkLog(`${unit.data.name}: Рывок — +${unit.data.speed} фут. движения!`, 'info')].slice(-LOG_MAX),
    reachableCells: getReachable(unit.data.gridX, unit.data.gridY, unit.data.movementLeft + unit.data.speed, newState.grid),
    movementMode: true,
  };
};

/** Disengage: action, mark unit so it won't provoke */
export const doDisengage = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.hasAction) return state;
  const newState = updateUnit(state, unitId, u => ({
    ...u, data: { ...u.data, hasAction: false } as typeof u.data
  }));
  const newDisengage = new Set(state.disengage);
  newDisengage.add(unitId);
  return { ...newState, disengage: newDisengage, log: [...state.log, mkLog(`${unit.data.name}: Отход — не провоцирует атаки!`, 'info')].slice(-LOG_MAX) };
};

/** Jump: тратит бонусное действие, стоит 15 ft движения (половина), прыгнуть на 15 ft.
 *  Если toX/toY — клетка дерева и юнит рядом — запрыгивает на дерево.
 *  Иначе — обычный прыжок (забирает половину движения).
 */
export const doJump = (state: BattleState, unitId: string, toX?: number, toY?: number): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.hasBonusAction) return state;

  const jumpCost = unit.data.speed / 2; // 15 ft
  if (unit.data.movementLeft < jumpCost) {
    return { ...state, log: [...state.log, mkLog(`❌ Недостаточно движения для прыжка (нужно ${jumpCost} фут.)`, 'info')].slice(-LOG_MAX) };
  }

  // Jump onto a tree?
  if (toX !== undefined && toY !== undefined) {
    const cell = state.grid[toY]?.[toX];
    if (cell && cell.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0) {
      const dist = chebyshevDist(unit.data.gridX, unit.data.gridY, toX, toY);
      if (dist > 1) return { ...state, log: [...state.log, mkLog(`❌ Слишком далеко для прыжка на дерево!`, 'info')].slice(-LOG_MAX) };

      const newOnTree = new Set(state.unitsOnTree);
      newOnTree.add(unitId);
      const newState = updateUnit(state, unitId, u => ({
        ...u, data: { ...u.data, hasBonusAction: false, movementLeft: u.data.movementLeft - jumpCost, gridX: toX, gridY: toY, onTree: true } as typeof u.data
      }));
      return {
        ...newState, unitsOnTree: newOnTree,
        log: [...state.log, mkLog(`🌲 ${unit.data.name} запрыгивает на дерево! Ближними атаками не достать.`, 'special')].slice(-LOG_MAX),
        animQueue: [...state.animQueue, mkAnim('move', unitId, 250, { fromX: unit.data.gridX, fromY: unit.data.gridY, toX, toY })],
      };
    }

    // Прыжок на клетку в пределах 15 ft (3 клетки)
    const dist = euclideanDist(unit.data.gridX, unit.data.gridY, toX, toY);
    if (dist * CELL_FT > jumpCost) {
      return { ...state, log: [...state.log, mkLog(`❌ Слишком далеко для прыжка (макс ${jumpCost} фут.)`, 'info')].slice(-LOG_MAX) };
    }
    const targetCell = state.grid[toY]?.[toX];
    if (!targetCell || targetCell.terrain === 'blocked') return state;
    const isOccupied = state.units.some(u => u.data.id !== unitId && u.data.gridX === toX && u.data.gridY === toY && !u.data.isUnconscious);
    if (isOccupied) return { ...state, log: [...state.log, mkLog(`❌ Клетка занята!`, 'info')].slice(-LOG_MAX) };

    const newState = updateUnit(state, unitId, u => ({
      ...u, data: { ...u.data, hasBonusAction: false, movementLeft: u.data.movementLeft - jumpCost, gridX: toX, gridY: toY } as typeof u.data
    }));
    return {
      ...newState,
      log: [...state.log, mkLog(`${unit.data.name}: Прыжок (−${jumpCost} фут. движения)`, 'info')].slice(-LOG_MAX),
      animQueue: [...state.animQueue, mkAnim('move', unitId, 300, { fromX: unit.data.gridX, fromY: unit.data.gridY, toX, toY })],
    };
  }

  // Regular: just halve movement
  const newState = updateUnit(state, unitId, u => ({
    ...u, data: { ...u.data, hasBonusAction: false, movementLeft: u.data.movementLeft - jumpCost } as typeof u.data
  }));
  return { ...newState, log: [...state.log, mkLog(`${unit.data.name}: Прыжок (движение −${jumpCost} фут.)`, 'info')].slice(-LOG_MAX) };
};

/** Push: bonus action, str contest */
export const doPush = (state: BattleState, pusherId: string, targetId: string): BattleState => {
  const pusher = getUnitById(state, pusherId);
  const target = getUnitById(state, targetId);
  if (!pusher || !target || !pusher.data.hasBonusAction) return state;

  const pRoll = rollDieN(20) + getModifier(pusher.data.abilityScores.str);
  const tRoll = rollDieN(20) + getModifier(target.data.abilityScores.str);
  const logs: BattleLog[] = [mkLog(`🤜 ${pusher.data.name} толкает ${target.data.name}! ${pRoll} vs ${tRoll}`, 'info')];

  let newState = updateUnit(state, pusherId, u => ({ ...u, data: { ...u.data, hasBonusAction: false } as typeof u.data }));

  if (pRoll > tRoll) {
    const dx = Math.sign(target.data.gridX - pusher.data.gridX);
    const dy = Math.sign(target.data.gridY - pusher.data.gridY);
    const nx = target.data.gridX + dx;
    const ny = target.data.gridY + dy;
    const cell = state.grid[ny]?.[nx];
    if (cell && cell.terrain !== 'blocked') {
      const free = findFreeCell(newState, nx, ny, target.data.id);
      if (free) {
        newState = updateUnit(newState, targetId, u => ({ ...u, data: { ...u.data, gridX: free.x, gridY: free.y } as typeof u.data }));
        logs.push(mkLog(`${pusher.data.name} побеждает — ${target.data.name} отброшен!`, 'hit'));
      }
    }
  } else {
    logs.push(mkLog(`${target.data.name} устоял!`, 'miss'));
  }

  return { ...newState, log: [...state.log, ...logs].slice(-LOG_MAX) };
};

/** Call Cola: action, religion save */
export const doCallCola = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.hasAction) return state;

  const roll = rollDieN(20);
  const logs: BattleLog[] = [mkLog(`🥤 Призыв Колы! Спасбросок религии: [${roll}]`, 'info',
    { rolls: [roll], total: roll, mod: 0, die: 'd20' })];

  let heal = 0;
  if (roll === 20) { heal = 2; logs.push(mkLog('✨ 20! Эффект удваивается — +2 HP!', 'special')); }
  else if (roll >= 10) { heal = 1; logs.push(mkLog('✅ Кола появилась! +1 HP', 'heal')); }
  else { logs.push(mkLog('❌ Кола не появилась...', 'miss')); }

  const newState = updateUnit(state, unitId, u => ({
    ...u, data: { ...u.data, hasAction: false, hp: Math.min(u.data.maxHp, u.data.hp + heal) } as typeof u.data
  }));
  return { ...newState, log: [...state.log, ...logs].slice(-LOG_MAX) };
};

/** Catch breath: тратит действие + бонусное действие + движение.
 *  Годжо: восстанавливает 1-2 ячейки проклятой энергии.
 *  Итадори (нет ячеек): недоступно.
 */
export const doCatchBreath = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.hasAction) return state;
  const charData = unit.kind === 'player' ? unit.data : null;

  if (charData && charData.maxCursedEnergy === 0) {
    return { ...state, log: [...state.log, mkLog(`❌ ${charData.name} не имеет ячеек — отдышка недоступна!`, 'info')].slice(-LOG_MAX) };
  }
  if (charData && charData.cursedEnergy >= charData.maxCursedEnergy) {
    return { ...state, log: [...state.log, mkLog(`❌ Ячейки уже полны (${charData.cursedEnergy}/${charData.maxCursedEnergy})`, 'info')].slice(-LOG_MAX) };
  }

  const score = unit.data.abilityScores.con;
  const roll = rollDieN(20);
  const total = roll + getModifier(score);
  const success = roll === 20 || (roll !== 1 && total >= 14);
  const perfect = roll === 20;
  const logs: BattleLog[] = [mkLog(`💨 Отдышка! [${roll}]+${getModifier(score)}=${total} vs СЛ14 — ${success ? 'УСПЕХ' : 'ПРОВАЛ'}`, 'save',
    { rolls: [roll], total, mod: getModifier(score), die: 'd20' })];

  let restored = 0;
  if (success) restored = perfect ? 2 : 1;

  const newState = updateUnit(state, unitId, u => {
    if (u.kind !== 'player') return u;
    const ch = u.data as Character;
    if (restored > 0) {
      const newCE = Math.min(ch.maxCursedEnergy, ch.cursedEnergy + restored);
      logs.push(mkLog(`✅ Восстановлено ${newCE - ch.cursedEnergy} ячеек (${newCE}/${ch.maxCursedEnergy})`, 'heal'));
      return {
        ...u, data: {
          ...ch,
          hasAction: false,
          hasBonusAction: false,
          movementLeft: 0,
          cursedEnergy: newCE
        } as typeof u.data
      };
    } else {
      logs.push(mkLog('❌ Не удалось отдышаться', 'miss'));
      return { ...u, data: { ...ch, hasAction: false, hasBonusAction: false, movementLeft: 0 } as typeof u.data };
    }
  });
  return { ...newState, log: [...state.log, ...logs].slice(-LOG_MAX), reachableCells: [], movementMode: false };
};

/** Death save */
export const doDeathSave = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.isUnconscious) return state;

  const alreadyUsed = unit.data.deathSaves.successes > 0 || unit.data.deathSaves.failures > 0;
  if (alreadyUsed) {
    return { ...state, log: [...state.log, mkLog(`❌ ${unit.data.name} уже использовал спасбросок от смерти!`, 'info')].slice(-LOG_MAX) };
  }

  const roll = rollDieN(20);
  const logs: BattleLog[] = [mkLog(`💀 ${unit.data.name} бросает к20 от смерти: [${roll}] vs СЛ10`, 'save', { rolls: [roll], total: roll, mod: 0, die: 'd20' })];

  let newHp = 0;
  let isUnconscious = true;
  let isDead = false;
  const successes = 1;
  let failures = 0;

  if (roll === 20) {
    newHp = 2; isUnconscious = false;
    logs.push(mkLog(`🌟 КРИТ 20! ${unit.data.name} встаёт с 2 HP!`, 'special'));
  } else if (roll >= 10) {
    newHp = 1; isUnconscious = false;
    logs.push(mkLog(`✅ Успех! ${unit.data.name} встаёт с 1 HP!`, 'heal'));
  } else {
    isDead = true; isUnconscious = true; failures = 1;
    logs.push(mkLog(`☠ Провал! ${unit.data.name} погибает!`, 'death'));
  }

  const newState = updateUnit(state, unitId, u => ({
    ...u, data: { ...u.data, hp: newHp, isUnconscious, isDead, deathSaves: { successes, failures } } as typeof u.data
  }));
  const winTeam = checkWin(newState.units);
  return {
    ...newState,
    log: [...state.log, ...logs].slice(-LOG_MAX),
    phase: winTeam !== null ? (winTeam === 0 ? 'victory' : 'defeat') : 'active',
    winTeam: winTeam ?? undefined,
  };
};

// ─── END TURN ─────────────────────────────────────────────────────────────
export const endTurn = (state: BattleState): BattleState => {
  const cur = getCurrentUnit(state);
  const logs: BattleLog[] = [];

  let newState = updateUnit(state, cur.data.id, u => {
    const newFX = u.data.statusEffects
      .map(e => ({ ...e, duration: e.duration - 1 }))
      .filter(e => e.duration > 0);
    let hp = u.data.hp;
    u.data.statusEffects.forEach(e => {
      if (e.type === 'bleed' && e.value > 0) {
        hp = Math.max(0, hp - e.value);
        logs.push(mkLog(`🩸 ${u.data.name} кровотечение: −${e.value} HP`, 'system'));
      }
    });
    return { ...u, data: { ...u.data, hp, statusEffects: newFX } as typeof u.data };
  });

  // Tick skill cooldowns
  const tickCd = (arr: Skill[]) => arr.map(s => ({
    ...s, currentCooldown: Math.max(0, s.currentCooldown - 1)
  }));
  newState = updateUnit(newState, cur.data.id, u => {
    if (u.kind === 'player') {
      const ch = u.data as Character;
      return { ...u, data: { ...ch, unlockedSkills: tickCd(ch.unlockedSkills) } as typeof u.data };
    }
    const en = u.data as Enemy;
    return { ...u, data: { ...en, skills: tickCd(en.skills) } as typeof u.data };
  });

  const alive = newState.units.filter(u => !u.data.isUnconscious && !u.data.isDead);
  if (alive.length === 0) return { ...newState, phase: 'defeat' };

  let nextIdx = (state.currentUnitIndex + 1) % newState.units.length;
  let safetyCounter = 0;
  while ((newState.units[nextIdx].data.isUnconscious || newState.units[nextIdx].data.isDead) && safetyCounter < newState.units.length) {
    nextIdx = (nextIdx + 1) % newState.units.length;
    safetyCounter++;
  }

  const newRound = nextIdx <= state.currentUnitIndex ? state.round + 1 : state.round;
  const nextUnit = newState.units[nextIdx];

  newState = updateUnit(newState, nextUnit.data.id, u => ({
    ...u, data: {
      ...u.data,
      hasAction: true, hasBonusAction: true, hasReaction: true,
      movementLeft: u.data.speed
    } as typeof u.data
  }));

  const newDisengage = new Set<string>();

  logs.push(mkLog(`─── Ход: ${nextUnit.data.name} (инициатива: ${nextUnit.turnIndex}, раунд ${newRound}) ───`, 'system'));

  return {
    ...newState,
    currentUnitIndex: nextIdx,
    round: newRound,
    disengage: newDisengage,
    unitsOnTree: newState.unitsOnTree,
    selectedSkill: null,
    movementMode: false,
    reachableCells: [],
    targetableCells: [],
    log: [...state.log, ...logs].slice(-LOG_MAX),
  };
};

// ─── ENEMY AI ──────────────────────────────────────────────────────────────
export const runEnemyTurn = (state: BattleState): BattleState => {
  const cur = getCurrentUnit(state);
  if (cur.kind !== 'enemy') return state;

  const enemy = cur.data as Enemy;
  if (enemy.isUnconscious || enemy.isDead) return endTurn(state);

  const playerUnits = state.units.filter(u => u.teamId === 0 && !u.data.isUnconscious);
  if (playerUnits.length === 0) return endTurn(state);

  const nearest = playerUnits.reduce((best, u) => {
    const d = chebyshevDist(enemy.gridX, enemy.gridY, u.data.gridX, u.data.gridY);
    const bd = chebyshevDist(enemy.gridX, enemy.gridY, best.data.gridX, best.data.gridY);
    return d < bd ? u : best;
  }, playerUnits[0]);

  let newState = state;
  const target = nearest;

  const enemySkillPool: Skill[] = (enemy as Enemy).skills?.length
    ? (enemy as Enemy).skills
    : ((cur.data as unknown as { unlockedSkills: Skill[] }).unlockedSkills ?? []);
  if (enemySkillPool.length === 0) return endTurn(newState);
  const available = enemySkillPool.filter(s => s.currentCooldown === 0 && s.actionCost === 'action');
  const skill = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : enemySkillPool[0];

  const movesLeft = Math.floor(enemy.movementLeft / CELL_FT);
  for (let step = 0; step < movesLeft; step++) {
    const curEn = getUnitById(newState, enemy.id)?.data ?? enemy;
    const curDist = distFeet(curEn.gridX, curEn.gridY, target.data.gridX, target.data.gridY);
    if (curDist <= skill.range) break;

    const dx = Math.sign(target.data.gridX - curEn.gridX);
    const dy = Math.sign(target.data.gridY - curEn.gridY);

    const candidates = [
      { x: curEn.gridX + dx, y: curEn.gridY + dy },
      { x: curEn.gridX + dx, y: curEn.gridY },
      { x: curEn.gridX,      y: curEn.gridY + dy },
    ];

    let moved = false;
    for (const cand of candidates) {
      if (cand.x < 1 || cand.x >= GRID_COLS - 1 || cand.y < 1 || cand.y >= GRID_ROWS - 1) continue;
      const cell = newState.grid[cand.y]?.[cand.x];
      if (!cell || cell.terrain === 'blocked') continue;
      const occupied = newState.units.some(u => u.data.id !== enemy.id && u.data.gridX === cand.x && u.data.gridY === cand.y && !u.data.isUnconscious);
      if (occupied) continue;
      newState = moveUnit(newState, enemy.id, cand.x, cand.y);
      moved = true;
      break;
    }
    if (!moved) break;
  }

  const curEnemy = getUnitById(newState, enemy.id);
  if (!curEnemy || !curEnemy.data.hasAction) return endTurn(newState);

  const distNow = distFeet(curEnemy.data.gridX, curEnemy.data.gridY, target.data.gridX, target.data.gridY);
  if (distNow <= skill.range || skill.aoe) {
    newState = executeAttack(newState, enemy.id, skill, target.data.id);
  }

  return endTurn(newState);
};

// ─── UNARMED ATTACK ────────────────────────────────────────────────────────
/** Безоружный удар: action, d20+STR+prof vs AC. Damage 1 (или 1к2 для острой энергии) */
export const doUnarmedAttack = (state: BattleState, attackerId: string, targetId: string): BattleState => {
  const attacker = getUnitById(state, attackerId);
  const targetUnit = getUnitById(state, targetId);
  if (!attacker || !targetUnit || !attacker.data.hasAction) return state;

  const atk = attacker.data;
  const tgt = targetUnit.data;
  const distFt = distFeet(atk.gridX, atk.gridY, tgt.gridX, tgt.gridY);
  if (distFt > 5) {
    return { ...state, log: [...state.log, mkLog(`❌ Безоружный удар: цель вне досягаемости!`, 'info')].slice(-LOG_MAX) };
  }

  const atkMod = getModifier(atk.abilityScores.str) + atk.proficiencyBonus;
  const roll = attackRoll20(atkMod, tgt.armorClass);
  const logs: BattleLog[] = [];
  const anims: AnimEvent[] = [mkAnim('attack', attackerId, 250, { toX: tgt.gridX, toY: tgt.gridY, skillName: 'Безоружный удар' })];

  logs.push(mkLog(`🥊 ${atk.name} — безоружный [${roll.roll}]+${atkMod}=${roll.total} vs КБ${tgt.armorClass}`, 'info', { rolls: [roll.roll], total: roll.total, mod: atkMod, die: 'd20' }));

  let ns = updateUnit(state, attackerId, u => ({ ...u, data: { ...u.data, hasAction: false } as typeof u.data }));

  if (!roll.hit) {
    logs.push(mkLog(`💨 Безоружный удар — ПРОМАХ!`, 'miss'));
    anims.push(mkAnim('miss', targetId, 200));
  } else {
    // Острая энергия: vessel and gambler roll 1d2 instead of 1
    const hasSharpEnergy = atk.id === 'vessel' || atk.id === 'gambler' || (attacker.kind === 'player' && (atk as Character).passiveBonus?.includes('Острая'));
    const dmg = hasSharpEnergy ? rollDie('d2') : 1;
    const finalDmg = roll.crit ? dmg * 2 : dmg;
    logs.push(mkLog(`👊 Безоружный удар${roll.crit ? ' КРИТ!' : ''}: ${finalDmg} урона → ${tgt.name}`, roll.crit ? 'critical' : 'hit', { rolls: [finalDmg], total: finalDmg, mod: 0, die: 'd2' }));
    anims.push(mkAnim('hit', targetId, 300, { isCrit: roll.crit }));
    const damaged = applyDamage(tgt, finalDmg);
    ns = updateUnit(ns, targetId, u => ({ ...u, data: damaged as typeof u.data }));
    if (damaged.isUnconscious) {
      logs.push(mkLog(`💀 ${tgt.name} повержен!`, 'death'));
      anims.push(mkAnim('death', targetId, 400));
    }
  }

  const winTeam = checkWin(ns.units);
  return {
    ...ns,
    log: [...state.log, ...logs].slice(-LOG_MAX),
    animQueue: [...state.animQueue, ...anims],
    phase: winTeam !== null ? (winTeam === 0 ? 'victory' : 'defeat') : 'active',
    winTeam: winTeam ?? undefined,
  };
};

// ─── OPPORTUNITY ATTACK (атака отхода) ─────────────────────────────────────
/** Реакция: когда враг уходит из 5-футовой зоны. Тратит реакцию, при попадании — цель теряет всё движение */
export const doOpportunityAttack = (state: BattleState, reactorId: string, targetId: string): BattleState => {
  const reactor = getUnitById(state, reactorId);
  const targetUnit = getUnitById(state, targetId);
  if (!reactor || !targetUnit || !reactor.data.hasReaction) return state;

  const atk = reactor.data;
  const tgt = targetUnit.data;
  const atkMod = getModifier(atk.abilityScores.str) + atk.proficiencyBonus;
  const roll = attackRoll20(atkMod, tgt.armorClass);
  const logs: BattleLog[] = [];
  const anims: AnimEvent[] = [mkAnim('attack', reactorId, 250, { toX: tgt.gridX, toY: tgt.gridY, skillName: 'Атака отхода' })];

  logs.push(mkLog(`⚡ ${atk.name} — атака отхода! [${roll.roll}]+${atkMod}=${roll.total} vs КБ${tgt.armorClass}`, 'info', { rolls: [roll.roll], total: roll.total, mod: atkMod, die: 'd20' }));

  let ns = updateUnit(state, reactorId, u => ({ ...u, data: { ...u.data, hasReaction: false } as typeof u.data }));

  if (!roll.hit) {
    logs.push(mkLog(`💨 Атака отхода — ПРОМАХ`, 'miss'));
    anims.push(mkAnim('miss', targetId, 200));
  } else {
    const hasSharpEnergy = atk.id === 'vessel' || atk.id === 'gambler';
    const dmg = hasSharpEnergy ? rollDie('d2') : 1;
    logs.push(mkLog(`👊 Атака отхода: ${dmg} урона → ${tgt.name}. Цель останавливается!`, 'hit', { rolls: [dmg], total: dmg, mod: 0, die: 'd2' }));
    anims.push(mkAnim('hit', targetId, 300));
    const damaged = applyDamage(tgt, dmg);
    // Цель теряет всё движение
    ns = updateUnit(ns, targetId, u => ({ ...u, data: { ...damaged, movementLeft: 0 } as typeof u.data }));
    if (damaged.isUnconscious) {
      logs.push(mkLog(`💀 ${tgt.name} повержен!`, 'death'));
      anims.push(mkAnim('death', targetId, 400));
    }
  }

  const winTeam = checkWin(ns.units);
  return {
    ...ns,
    log: [...state.log, ...logs].slice(-LOG_MAX),
    animQueue: [...state.animQueue, ...anims],
    phase: winTeam !== null ? (winTeam === 0 ? 'victory' : 'defeat') : 'active',
    winTeam: winTeam ?? undefined,
  };
};

// ─── PROBABILITY SHIFT (Хакари: Изменение вероятностей) ───────────────────
export const doProbabilityShift = (state: BattleState, unitId: string, choice: 'ac' | 'hp' | 'attack'): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.hasBonusAction) return state;
  const data = unit.data;
  const logs: BattleLog[] = [];

  let ns = updateUnit(state, unitId, u => ({ ...u, data: { ...u.data, hasBonusAction: false } as typeof u.data }));

  if (choice === 'ac') {
    const roll = rollDieN(20);
    logs.push(mkLog(`🎲 Изменение вероятностей (КБ): выпало [${roll}] — КБ становится ${roll} до следующего хода!`, 'special', { rolls: [roll], total: roll, mod: 0, die: 'd20' }));
    // Сохраняем как empowered с value = новый КБ
    const newFX: StatusEffect[] = [...data.statusEffects.filter(e => e.type !== 'empowered'), { type: 'empowered', duration: 1, value: roll, source: 'probability_ac' }];
    ns = updateUnit(ns, unitId, u => ({ ...u, data: { ...u.data, armorClass: roll, statusEffects: newFX } as typeof u.data }));
  } else if (choice === 'hp') {
    const roll = rollDie('d2');
    if (roll === 1) {
      logs.push(mkLog(`🎲 Изменение вероятностей (HP): выпало 1 → −1 HP!`, 'hit', { rolls: [roll], total: roll, mod: 0, die: 'd2' }));
      const newHp = Math.max(1, data.hp - 1);
      ns = updateUnit(ns, unitId, u => ({ ...u, data: { ...u.data, hp: newHp } as typeof u.data }));
    } else {
      logs.push(mkLog(`🎲 Изменение вероятностей (HP): выпало 2 → +1 HP!`, 'heal', { rolls: [roll], total: roll, mod: 0, die: 'd2' }));
      const newHp = Math.min(data.maxHp, data.hp + 1);
      ns = updateUnit(ns, unitId, u => ({ ...u, data: { ...u.data, hp: newHp } as typeof u.data }));
    }
  } else {
    const roll = rollDie('d2');
    if (roll === 1) {
      logs.push(mkLog(`🎲 Изменение вероятностей (Атака): выпало 1 → ПОМЕХА на следующую атаку!`, 'special', { rolls: [roll], total: roll, mod: 0, die: 'd2' }));
      const newFX: StatusEffect[] = [...data.statusEffects.filter(e => e.type !== 'disadvantage_atk' && e.type !== 'advantage_atk'), { type: 'disadvantage_atk', duration: 1, value: 0, source: 'probability_atk' }];
      ns = updateUnit(ns, unitId, u => ({ ...u, data: { ...u.data, statusEffects: newFX } as typeof u.data }));
    } else {
      logs.push(mkLog(`🎲 Изменение вероятностей (Атака): выпало 2 → ПРЕИМУЩЕСТВО на следующую атаку!`, 'special', { rolls: [roll], total: roll, mod: 0, die: 'd2' }));
      const newFX: StatusEffect[] = [...data.statusEffects.filter(e => e.type !== 'disadvantage_atk' && e.type !== 'advantage_atk'), { type: 'advantage_atk', duration: 1, value: 0, source: 'probability_atk' }];
      ns = updateUnit(ns, unitId, u => ({ ...u, data: { ...u.data, statusEffects: newFX } as typeof u.data }));
    }
  }

  return { ...ns, log: [...state.log, ...logs].slice(-LOG_MAX) };
};

// ─── ENEMY MOVE (для пошагового бота) ─────────────────────────────────────
export const runEnemyMove = (state: BattleState): BattleState => {
  const cur = getCurrentUnit(state);
  if (cur.kind !== 'enemy' && cur.teamId !== 1) return state;
  const enemy = cur.data;
  if (enemy.isUnconscious || enemy.isDead) return state;

  const playerUnits = state.units.filter(u => u.teamId !== cur.teamId && !u.data.isUnconscious);
  if (playerUnits.length === 0) return state;

  const nearest = playerUnits.reduce((best, u) => {
    const d = chebyshevDist(enemy.gridX, enemy.gridY, u.data.gridX, u.data.gridY);
    const bd = chebyshevDist(enemy.gridX, enemy.gridY, best.data.gridX, best.data.gridY);
    return d < bd ? u : best;
  }, playerUnits[0]);

  const enemySkillPool: Skill[] = (enemy as Enemy).skills?.length
    ? (enemy as Enemy).skills
    : ((cur.data as unknown as { unlockedSkills: Skill[] }).unlockedSkills ?? []);
  const available = enemySkillPool.filter(s => s.currentCooldown === 0 && s.actionCost === 'action');
  const skill = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : (enemySkillPool[0] ?? null);

  let newState = state;
  const movesLeft = Math.floor(enemy.movementLeft / CELL_FT);
  for (let step = 0; step < movesLeft; step++) {
    const curEn = getUnitById(newState, enemy.id)?.data ?? enemy;
    const curDist = distFeet(curEn.gridX, curEn.gridY, nearest.data.gridX, nearest.data.gridY);
    if (skill && curDist <= skill.range) break;

    const dx = Math.sign(nearest.data.gridX - curEn.gridX);
    const dy = Math.sign(nearest.data.gridY - curEn.gridY);
    const candidates = [
      { x: curEn.gridX + dx, y: curEn.gridY + dy },
      { x: curEn.gridX + dx, y: curEn.gridY },
      { x: curEn.gridX,      y: curEn.gridY + dy },
    ];
    let moved = false;
    for (const cand of candidates) {
      if (cand.x < 1 || cand.x >= GRID_COLS - 1 || cand.y < 1 || cand.y >= GRID_ROWS - 1) continue;
      const cell = newState.grid[cand.y]?.[cand.x];
      if (!cell || cell.terrain === 'blocked') continue;
      const occupied = newState.units.some(u => u.data.id !== enemy.id && u.data.gridX === cand.x && u.data.gridY === cand.y && !u.data.isUnconscious);
      if (occupied) continue;
      newState = moveUnit(newState, enemy.id, cand.x, cand.y);
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return newState;
};

// ─── ENEMY ATTACK (для пошагового бота) ────────────────────────────────────
export const runEnemyAttack = (state: BattleState): BattleState => {
  const cur = getCurrentUnit(state);
  if (cur.kind !== 'enemy' && cur.teamId !== 1) return state;
  const enemy = getUnitById(state, cur.data.id);
  if (!enemy || !enemy.data.hasAction) return state;

  const playerUnits = state.units.filter(u => u.teamId !== cur.teamId && !u.data.isUnconscious);
  if (playerUnits.length === 0) return state;

  const nearest = playerUnits.reduce((best, u) => {
    const d = chebyshevDist(enemy.data.gridX, enemy.data.gridY, u.data.gridX, u.data.gridY);
    const bd = chebyshevDist(enemy.data.gridX, enemy.data.gridY, best.data.gridX, best.data.gridY);
    return d < bd ? u : best;
  }, playerUnits[0]);

  const enemySkillPool: Skill[] = (enemy.data as Enemy).skills?.length
    ? (enemy.data as Enemy).skills
    : ((enemy.data as unknown as { unlockedSkills: Skill[] }).unlockedSkills ?? []);
  if (enemySkillPool.length === 0) return state;
  const available = enemySkillPool.filter(s => s.currentCooldown === 0 && s.actionCost === 'action');
  const skill = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : enemySkillPool[0];

  const distNow = distFeet(enemy.data.gridX, enemy.data.gridY, nearest.data.gridX, nearest.data.gridY);

  if (skill.id === 'reversal_red' || skill.aoe) {
    const ns = executeReversalRed(state, cur.data.id, nearest.data.gridX, nearest.data.gridY);
    return ns;
  }
  if (skill.id === 'lapse_blue') {
    return executeAttack(state, cur.data.id, skill, nearest.data.id);
  }
  if (distNow <= skill.range || skill.aoe) {
    return executeAttack(state, cur.data.id, skill, nearest.data.id);
  }
  return state;
};

// ─── UI helpers ────────────────────────────────────────────────────────────
export const selectUnit = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit) return { ...state, selectedUnitId: null, selectedSkill: null, reachableCells: [], targetableCells: [], movementMode: false };
  return {
    ...state,
    selectedUnitId: unitId,
    selectedSkill: null,
    movementMode: false,
    reachableCells: unit.data.movementLeft > 0 ? getReachable(unit.data.gridX, unit.data.gridY, unit.data.movementLeft, state.grid) : [],
    targetableCells: [],
  };
};

export const selectSkill = (state: BattleState, skill: Skill, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit) return state;
  return {
    ...state,
    selectedSkill: skill,
    movementMode: false,
    targetableCells: getTargetable(unit.data.gridX, unit.data.gridY, skill.range, state.grid),
    reachableCells: [],
  };
};

export const toggleMovement = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit) return state;
  const next = !state.movementMode;
  return {
    ...state,
    movementMode: next,
    selectedSkill: next ? null : state.selectedSkill,
    reachableCells: next ? getReachable(unit.data.gridX, unit.data.gridY, unit.data.movementLeft, state.grid) : [],
    targetableCells: [],
  };
};
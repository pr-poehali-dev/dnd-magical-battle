import {
  BattleState, BattleUnit, BattleLog, Character, Enemy, Skill,
  GridCell, StatusEffect, AnimEvent, GRID_COLS, GRID_ROWS, CELL_FT
} from './types';
import {
  attackRoll20, savingThrow20, rollDice, rollDoubled, rollDie, rollDieN,
  getModifier, getReachable, getTargetable, distFeet, chebyshevDist,
  generateForestGrid
} from './dndUtils';

let _logId = 0;
let _animId = 0;
const mkLog = (text: string, type: BattleLog['type'], dice?: BattleLog['diceResult']): BattleLog =>
  ({ id: String(_logId++), text, type, diceResult: dice });
const mkAnim = (type: AnimEvent['type'], unitId: string, dur: number, extra: Partial<AnimEvent> = {}): AnimEvent =>
  ({ id: String(_animId++), type, unitId, duration: dur, startTime: Date.now(), ...extra });

// ─── INIT ──────────────────────────────────────────────────────────────────
export const initBattle = (
  playerChars: Character[],
  enemies: Enemy[],
): BattleState => {
  // Roll initiative for all
  const allUnits: BattleUnit[] = [
    ...playerChars.map((c, i): BattleUnit => ({
      kind: 'player', data: { ...c, gridX: 1 + i, gridY: 4 + (i % 3), statusEffects: [], hasAction: true, hasBonusAction: true, hasReaction: true, movementLeft: c.speed },
      teamId: 0, turnIndex: rollDieN(20) + getModifier(c.abilityScores.dex),
    })),
    ...enemies.map((e, i): BattleUnit => ({
      kind: 'enemy', data: { ...e, gridX: GRID_COLS - 2 - (i % 3), gridY: 4 + i, statusEffects: [], hasAction: true, hasBonusAction: true, hasReaction: true, movementLeft: e.speed },
      teamId: 1, turnIndex: rollDieN(20) + getModifier(e.abilityScores.dex),
    })),
  ].sort((a, b) => b.turnIndex - a.turnIndex);

  const grid = generateForestGrid();

  return {
    units: allUnits,
    currentUnitIndex: 0,
    round: 1,
    grid,
    log: [mkLog('⚔ Бой начался! Ходит: ' + allUnits[0].data.name, 'system')],
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

const updateData = <T extends Character | Enemy>(
  u: BattleUnit & { kind: 'player'; data: T }
  | BattleUnit & { kind: 'enemy'; data: T },
  patch: Partial<T>
): BattleUnit => ({ ...u, data: { ...u.data, ...patch } } as BattleUnit);

const applyDamage = (target: Character | Enemy, dmg: number): Character | Enemy => {
  let rem = dmg;
  let tempHp = target.tempHp;
  if (tempHp > 0) {
    const abs = Math.min(tempHp, rem);
    tempHp -= abs;
    rem -= abs;
  }
  const newHp = Math.max(0, target.hp - rem);
  return { ...target, hp: newHp, tempHp, isUnconscious: newHp <= 0, isDead: newHp <= 0 };
};

const applyHeal = (target: Character | Enemy, amt: number): Character | Enemy => ({
  ...target, hp: Math.min(target.maxHp, target.hp + amt),
});

/** Check if any team has all members dead/unconscious */
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
export const TREE_HP = 3; // hits to destroy a tree

const isTreeCell = (cell: GridCell | undefined): boolean =>
  !!cell && cell.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0;

/** Check if a unit is in/on a tree cell */
const unitInTree = (state: BattleState, unitId: string): boolean => {
  const u = getUnitById(state, unitId);
  if (!u) return false;
  const cell = state.grid[u.data.gridY]?.[u.data.gridX];
  return isTreeCell(cell);
};

/** Damage a tree cell, returns new grid */
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

// ─── MOVE ──────────────────────────────────────────────────────────────────
export const moveUnit = (state: BattleState, unitId: string, toX: number, toY: number): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit) return state;

  const { data } = unit;
  const cell = state.grid[toY]?.[toX];
  if (!cell) return state;

  // Trees can be entered normally (unit hides in foliage, gains/causes disadvantage)
  // onTree = jumped ON TOP (doJump with treeX/treeY); entering normally is just walking into the tree cell

  // Can't move to cell occupied by another upright unit
  const occupied = state.units.some(u =>
    u.data.id !== unitId &&
    u.data.gridX === toX && u.data.gridY === toY &&
    !u.data.isUnconscious && !u.data.onTree
  );
  if (occupied) return state;

  const dist = chebyshevDist(data.gridX, data.gridY, toX, toY);
  const ftCost = (cell.terrain === 'difficult' ? dist * 2 : dist) * CELL_FT;
  if (ftCost > data.movementLeft) return state;

  const newData = { ...data, gridX: toX, gridY: toY, movementLeft: data.movementLeft - ftCost, onTree: false };
  const anims = [mkAnim('move', unitId, 300, { fromX: data.gridX, fromY: data.gridY, toX, toY })];

  // If leaving a tree cell, remove from onTree set
  const newOnTree = new Set(state.unitsOnTree);
  newOnTree.delete(unitId);

  return {
    ...updateUnit(state, unitId, u => ({ ...u, data: newData as typeof u.data })),
    unitsOnTree: newOnTree,
    log: [...state.log, mkLog(`${data.name} перемещается (осталось ${newData.movementLeft} фут.)`, 'info')].slice(-30),
    animQueue: [...state.animQueue, ...anims],
    reachableCells: getReachable(toX, toY, newData.movementLeft, state.grid),
  };
};

// ─── ATTACK ────────────────────────────────────────────────────────────────
export const executeAttack = (state: BattleState, attackerId: string, skill: Skill, targetId: string): BattleState => {
  const attacker = getUnitById(state, attackerId);
  const targetUnit = getUnitById(state, targetId);
  if (!attacker || !targetUnit) return state;

  const atk = attacker.data;
  const tgt = targetUnit.data;

  // Range check
  const distFt = distFeet(atk.gridX, atk.gridY, tgt.gridX, tgt.gridY);
  // Range check: melee = exactly 5 ft (adjacent), ranged = up to skill.range ft
  const maxRange = skill.range; // range is exact, no bonus
  if (distFt > maxRange && !skill.aoe) {
    return { ...state, log: [...state.log, mkLog(`❌ ${skill.name}: цель вне досягаемости (${distFt}/${maxRange} фут.)`, 'info')].slice(-30) };
  }

  // Consume action
  const actionPatch: Partial<Character & Enemy> = {};
  if (skill.actionCost === 'action') actionPatch.hasAction = false;
  if (skill.actionCost === 'bonus_action') actionPatch.hasBonusAction = false;
  if (skill.actionCost === 'reaction') actionPatch.hasReaction = false;

  let newState = updateUnit(state, attackerId, u => ({ ...u, data: { ...u.data, ...actionPatch } as typeof u.data }));

  const logs: BattleLog[] = [];
  const anims: AnimEvent[] = [mkAnim('attack', attackerId, 250, { toX: tgt.gridX, toY: tgt.gridY, skillName: skill.name })];

  // Advantage / disadvantage
  // Tree rule: attacker OR target standing in tree = disadvantage (они на дереве = помеха для атак и против них)
  const unitCellIsTree = (u: BattleUnit) => {
    const cell = state.grid[u.data.gridY]?.[u.data.gridX];
    return !!(cell && cell.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0);
  };
  const atkInTree = unitCellIsTree(attacker);
  const tgtInTree = unitCellIsTree(targetUnit);
  // Unit ON TOP of tree can't attack unless target is also on that tree or special case
  const atkOnTree = state.unitsOnTree.has(attackerId);
  const tgtOnTree = state.unitsOnTree.has(targetId);
  if (atkOnTree && !tgtOnTree) {
    // On tree and can't attack ground units unless AoE reaches
    if (!skill.aoe) {
      return { ...state, log: [...state.log, mkLog(`❌ ${atk.name} на дереве — не может атаковать наземные цели!`, 'info')].slice(-30) };
    }
  }
  const hasAdv = hasStatusEffect(attacker, 'advantage_atk');
  const hasDisAdv = hasStatusEffect(attacker, 'disadvantage_atk') || atkInTree || tgtInTree;

  // ── 100% attack ──
  if (skill.is100pct) {
    const dmgRoll = rollDice(skill.damageDice);
    const dmg = dmgRoll.total;
    logs.push(mkLog(`💥 ${atk.name} — «${skill.name}» (100% попадание)! Урон: ${dmg}`,
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
      `🎲 ${atk.name} бросает d20 [${roll.roll}]+${atkMod} = ${roll.total} vs КБ ${tgt.armorClass}`,
      'info', { rolls: [roll.roll], total: roll.total, mod: atkMod, die: 'd20' }
    ));

    if (!roll.hit) {
      logs.push(mkLog(`💨 «${skill.name}» — ПРОМАХ!`, 'miss'));
      anims.push(mkAnim('miss', targetId, 200));
    } else {
      // Check Black Flash (Divergent's Fist: 18-20 triggers blackFlash)
      let finalDice = skill.damageDice;
      let isBlackFlash = false;
      if (skill.blackFlash && roll.roll >= 18) {
        finalDice = skill.blackFlash.damageDice;
        isBlackFlash = true;
        logs.push(mkLog('⚡ ЧЁРНАЯ МОЛНИЯ! (18-20) 1к6 вместо 1к2!', 'special'));
      }

      // Crit: double dice (but for Divergent's Fist: roll BOTH 1к6 AND 1к2)
      let dmgRoll: { rolls: number[]; total: number };
      if (roll.crit) {
        if (skill.blackFlash && isBlackFlash) {
          // Special: roll 1к6 AND 1к2 separately
          const r6 = rollDice(skill.blackFlash.damageDice);
          const r2 = rollDice(skill.damageDice);
          dmgRoll = { rolls: [...r6.rolls, ...r2.rolls], total: r6.total + r2.total };
          logs.push(mkLog(`💥 КРИТ + ЧЁРНАЯ МОЛНИЯ! 1к6+1к2 = ${dmgRoll.total}`, 'critical'));
        } else {
          dmgRoll = rollDoubled(finalDice);
          logs.push(mkLog(`💥 КРИТИЧЕСКОЕ ПОПАДАНИЕ! Урон удваивается!`, 'critical'));
        }
        anims.push(mkAnim('flash', attackerId, 400, { isCrit: true }));
      } else {
        dmgRoll = rollDice(finalDice);
      }

      let dmg = dmgRoll.total;

      // Resistance / vulnerability
      if (hasStatusEffect(targetUnit, 'resistance_all')) dmg = Math.floor(dmg / 2);
      if (hasStatusEffect(targetUnit, 'vulnerability_all')) dmg = dmg * 2;

      logs.push(mkLog(
        `${roll.crit ? '💥' : '⚔'} «${skill.name}» попадает в ${tgt.name}! Урон: ${dmg}`,
        roll.crit ? 'critical' : 'hit',
        { rolls: dmgRoll.rolls, total: dmg, mod: 0, die: finalDice.die }
      ));

      anims.push(mkAnim('hit', targetId, 300, { isCrit: roll.crit }));

      // Saving throw
      let newTarget = applyDamage(tgt, dmg);
      let newStatusFX = [...(newTarget.statusEffects ?? [])];

      if (skill.savingThrow && skill.statusEffect) {
        const saveScore = tgt.abilityScores[skill.savingThrow.stat];
        const sv = savingThrow20(saveScore, skill.savingThrow.dc);
        logs.push(mkLog(
          `🎲 Спасбросок ${skill.savingThrow.stat.toUpperCase()} [${sv.roll}]+${getModifier(saveScore)}=${sv.total} vs СЛ${skill.savingThrow.dc} — ${sv.perfect ? 'ИДЕАЛЬНЫЙ!' : sv.success ? 'УСПЕХ' : 'ПРОВАЛ'}`,
          'save', { rolls: [sv.roll], total: sv.total, mod: getModifier(saveScore), die: 'd20' }
        ));
        if (!sv.success) {
          newStatusFX = [...newStatusFX, { ...skill.statusEffect }];
          logs.push(mkLog(`🌀 ${tgt.name}: эффект «${skill.statusEffect.type}» (${skill.statusEffect.duration}р)`, 'system'));
        } else if (sv.perfect) {
          logs.push(mkLog(`✨ Идеальный спасбросок — урон не нанесён!`, 'special'));
          newTarget = applyHeal(tgt, dmg) as typeof newTarget; // refund
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

  // Tick skill cooldown on attacker
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

  // Tree damage: if target is in a tree, hitting the tree damages it too
  let finalGrid = newState.grid;
  const tgtCell = state.grid[tgt.gridY]?.[tgt.gridX];
  if (tgtCell?.prop === 'tree' && (tgtCell.treeHp ?? TREE_HP) > 0) {
    finalGrid = damageTree(newState.grid, tgt.gridX, tgt.gridY);
    const newTreeHp = (finalGrid[tgt.gridY]?.[tgt.gridX]?.treeHp ?? 0);
    if (newTreeHp <= 0) {
      logs.push(mkLog(`🌲💥 Дерево разрушено!`, 'special'));
      // Eject anyone on tree
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
    log: [...state.log, ...logs].slice(-30),
    animQueue: [...state.animQueue, ...anims],
    phase: winTeam !== null ? (winTeam === 0 ? 'victory' : 'defeat') : 'active',
    winTeam: winTeam ?? undefined,
  };
};

// ─── BASE ACTIONS ──────────────────────────────────────────────────────────

/** Dash: consume action, refill movement */
export const doDash = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.hasAction) return state;
  const newState = updateUnit(state, unitId, u => ({
    ...u, data: { ...u.data, hasAction: false, movementLeft: u.data.movementLeft + u.data.speed } as typeof u.data
  }));
  return { ...newState, log: [...state.log, mkLog(`${unit.data.name}: Рывок — движение удвоено!`, 'info')].slice(-30) };
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
  return { ...newState, disengage: newDisengage, log: [...state.log, mkLog(`${unit.data.name}: Отход — не провоцирует атаки!`, 'info')].slice(-30) };
};

/** Jump: bonus action, costs half movement (does NOT add movement).
 *  If toX/toY points to a tree cell — jump ON TOP of tree.
 *  On a tree: can't attack ground, hidden, attacks against you with disadvantage.
 */
export const doJump = (state: BattleState, unitId: string, toX?: number, toY?: number): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.hasBonusAction) return state;

  const half = Math.floor(unit.data.movementLeft / 2);

  // Jump onto a tree?
  if (toX !== undefined && toY !== undefined) {
    const cell = state.grid[toY]?.[toX];
    if (cell && cell.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0) {
      // Must be adjacent (within 5ft)
      const dist = chebyshevDist(unit.data.gridX, unit.data.gridY, toX, toY);
      if (dist > 1) return { ...state, log: [...state.log, mkLog(`❌ Слишком далеко для прыжка на дерево!`, 'info')].slice(-30) };

      const newOnTree = new Set(state.unitsOnTree);
      newOnTree.add(unitId);
      const newState = updateUnit(state, unitId, u => ({
        ...u, data: { ...u.data, hasBonusAction: false, movementLeft: half, gridX: toX, gridY: toY, onTree: true } as typeof u.data
      }));
      return {
        ...newState, unitsOnTree: newOnTree,
        log: [...state.log, mkLog(`🌲 ${unit.data.name} запрыгивает на дерево! Атаки по нему — с помехой.`, 'special')].slice(-30),
        animQueue: [...state.animQueue, mkAnim('move', unitId, 250, { fromX: unit.data.gridX, fromY: unit.data.gridY, toX, toY })],
      };
    }
  }

  // Regular jump: costs half movement
  const newState = updateUnit(state, unitId, u => ({
    ...u, data: { ...u.data, hasBonusAction: false, movementLeft: half } as typeof u.data
  }));
  return { ...newState, log: [...state.log, mkLog(`${unit.data.name}: Прыжок (движение уполовинено)`, 'info')].slice(-30) };
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
    // Push target 5 feet away
    const dx = Math.sign(target.data.gridX - pusher.data.gridX);
    const dy = Math.sign(target.data.gridY - pusher.data.gridY);
    const nx = target.data.gridX + dx;
    const ny = target.data.gridY + dy;
    const cell = state.grid[ny]?.[nx];
    if (cell && cell.terrain !== 'blocked') {
      newState = updateUnit(newState, targetId, u => ({ ...u, data: { ...u.data, gridX: nx, gridY: ny } as typeof u.data }));
      logs.push(mkLog(`${pusher.data.name} побеждает — ${target.data.name} отброшен на 5 фут!`, 'hit'));
    }
  } else {
    logs.push(mkLog(`${target.data.name} устоял!`, 'miss'));
  }

  return { ...newState, log: [...state.log, ...logs].slice(-30) };
};

/** Call Cola: action, religion save, drink is free action */
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
  return { ...newState, log: [...state.log, ...logs].slice(-30) };
};

/** Catch breath: action + bonus + movement, CON save DC14.
 *  Требует наличия хотя бы 1 ячейки (cursedEnergy > 0).
 */
export const doCatchBreath = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.hasAction || !unit.data.hasBonusAction) return state;
  // Юджи (cursedEnergy = 0) не может использовать отдышку
  const charData = unit.kind === 'player' ? unit.data : null;
  if (charData && charData.maxCursedEnergy === 0) {
    return { ...state, log: [...state.log, mkLog(`❌ ${charData.name} не имеет ячеек — отдышка недоступна!`, 'info')].slice(-30) };
  }

  const score = unit.data.abilityScores.con;
  const roll = rollDieN(20);
  const total = roll + getModifier(score);
  const success = roll === 20 || (roll !== 1 && total >= 14);
  const perfect = roll === 20;
  const logs: BattleLog[] = [mkLog(`💨 Отдышка! Спасбросок Телосложения [${roll}]+${getModifier(score)}=${total} vs СЛ14 — ${success ? 'УСПЕХ' : 'ПРОВАЛ'}`, 'save',
    { rolls: [roll], total, mod: getModifier(score), die: 'd20' })];

  let heal = 0;
  if (success) {
    heal = perfect ? 2 : 1;
    logs.push(mkLog(`✅ Восстановлено ${heal} HP`, 'heal'));
  } else {
    logs.push(mkLog('❌ Не удалось отдышаться', 'miss'));
  }

  const newState = updateUnit(state, unitId, u => ({
    ...u, data: {
      ...u.data,
      hasAction: false, hasBonusAction: false, movementLeft: 0,
      hp: Math.min(u.data.maxHp, u.data.hp + heal),
    } as typeof u.data
  }));
  return { ...newState, log: [...state.log, ...logs].slice(-30) };
};

/** Death save: d20 vs DC10 */
export const doDeathSave = (state: BattleState, unitId: string): BattleState => {
  const unit = getUnitById(state, unitId);
  if (!unit || !unit.data.isUnconscious) return state;

  const roll = rollDieN(20);
  const logs: BattleLog[] = [mkLog(`💀 Спасбросок от смерти [${roll}]`, 'save', { rolls: [roll], total: roll, mod: 0, die: 'd20' })];
  let { successes, failures } = unit.data.deathSaves;

  let newHp = 0;
  let isUnconscious = true;
  let isDead = false;

  if (roll === 20) {
    newHp = 2;
    isUnconscious = false;
    successes = 0; failures = 0;
    logs.push(mkLog('🌟 20! Встаёт с 2 HP!', 'special'));
  } else if (roll === 1) {
    failures += 2;
    logs.push(mkLog('❌ 1 — два провала!', 'death'));
  } else if (roll >= 10) {
    successes += 1;
    logs.push(mkLog(`✅ Успех ${successes}/3`, 'heal'));
  } else {
    failures += 1;
    logs.push(mkLog(`❌ Провал ${failures}/3`, 'death'));
  }

  if (successes >= 3) { newHp = 1; isUnconscious = false; successes = 0; failures = 0; logs.push(mkLog('💚 Стабилизировался с 1 HP!', 'heal')); }
  if (failures >= 3) { isDead = true; isUnconscious = true; logs.push(mkLog(`☠ ${unit.data.name} мёртв!`, 'death')); }

  const newState = updateUnit(state, unitId, u => ({
    ...u, data: { ...u.data, hp: newHp, isUnconscious, isDead, deathSaves: { successes, failures } } as typeof u.data
  }));
  const winTeam = checkWin(newState.units);
  return { ...newState, log: [...state.log, ...logs].slice(-30), phase: winTeam !== null ? (winTeam === 0 ? 'victory' : 'defeat') : 'active', winTeam: winTeam ?? undefined };
};

// ─── END TURN ─────────────────────────────────────────────────────────────
export const endTurn = (state: BattleState): BattleState => {
  const cur = getCurrentUnit(state);
  const logs: BattleLog[] = [];

  // Tick status effects on current unit
  let newState = updateUnit(state, cur.data.id, u => {
    const newFX = u.data.statusEffects
      .map(e => ({ ...e, duration: e.duration - 1 }))
      .filter(e => e.duration > 0);
    // DoT
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
  newState = updateUnit(newState, cur.data.id, u => {
    const tickCd = (arr: Skill[] | undefined) => (arr ?? []).map(s => ({ ...s, currentCooldown: Math.max(0, s.currentCooldown - 1) }));
    if (u.kind === 'player') {
      const ch = u.data as Character;
      return { ...u, data: { ...ch, unlockedSkills: tickCd(ch.unlockedSkills) } as typeof u.data };
    }
    const en = u.data as Enemy;
    const skillsKey = en.skills ? 'skills' : 'unlockedSkills';
    const skillArr = (en as unknown as Record<string, Skill[]>)[skillsKey] ?? [];
    return { ...u, data: { ...en, [skillsKey]: tickCd(skillArr) } as typeof u.data };
  });

  // Advance turn
  const alive = newState.units.filter(u => !u.data.isUnconscious && !u.data.isDead);
  if (alive.length === 0) return { ...newState, phase: 'defeat' };

  let nextIdx = (state.currentUnitIndex + 1) % newState.units.length;
  // Skip dead/unconscious
  let safetyCounter = 0;
  while ((newState.units[nextIdx].data.isUnconscious || newState.units[nextIdx].data.isDead) && safetyCounter < newState.units.length) {
    nextIdx = (nextIdx + 1) % newState.units.length;
    safetyCounter++;
  }

  const newRound = nextIdx === 0 ? state.round + 1 : state.round;
  const nextUnit = newState.units[nextIdx];

  // Reset actions for next unit
  newState = updateUnit(newState, nextUnit.data.id, u => ({
    ...u, data: { ...u.data, hasAction: true, hasBonusAction: true, hasReaction: true, movementLeft: u.data.speed } as typeof u.data
  }));

  // Clear disengage
  const newDisengage = new Set<string>();

  logs.push(mkLog(`─── Ход: ${nextUnit.data.name} (раунд ${newRound}) ───`, 'system'));

  return {
    ...newState,
    currentUnitIndex: nextIdx,
    round: newRound,
    disengage: newDisengage,
    unitsOnTree: newState.unitsOnTree, // preserve across turns
    selectedSkill: null,
    movementMode: false,
    reachableCells: [],
    targetableCells: [],
    log: [...state.log, ...logs].slice(-30),
  };
};

// ─── ENEMY AI ──────────────────────────────────────────────────────────────
export const runEnemyTurn = (state: BattleState): BattleState => {
  const cur = getCurrentUnit(state);
  if (cur.kind !== 'enemy') return state;

  const enemy = cur.data as Enemy;
  if (enemy.isUnconscious || enemy.isDead) return endTurn(state);

  // Find nearest player unit
  const playerUnits = state.units.filter(u => u.teamId === 0 && !u.data.isUnconscious);
  if (playerUnits.length === 0) return endTurn(state);

  const nearest = playerUnits.reduce((best, u) => {
    const d = chebyshevDist(enemy.gridX, enemy.gridY, u.data.gridX, u.data.gridY);
    const bd = chebyshevDist(enemy.gridX, enemy.gridY, best.data.gridX, best.data.gridY);
    return d < bd ? u : best;
  }, playerUnits[0]);

  let newState = state;
  const target = nearest;

  // Pick skill first to know required range
  const enemySkillPool: Skill[] = (enemy as Enemy).skills?.length
    ? (enemy as Enemy).skills
    : ((cur.data as unknown as { unlockedSkills: Skill[] }).unlockedSkills ?? []);
  if (enemySkillPool.length === 0) return endTurn(newState);
  const available = enemySkillPool.filter(s => s.currentCooldown === 0 && s.actionCost === 'action');
  const skill = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : enemySkillPool[0];

  // Move towards target until within skill range
  // Use all movement budget step by step
  const movesLeft = Math.floor(enemy.movementLeft / CELL_FT);
  for (let step = 0; step < movesLeft; step++) {
    const curEn = getUnitById(newState, enemy.id)?.data ?? enemy;
    const curDist = distFeet(curEn.gridX, curEn.gridY, target.data.gridX, target.data.gridY);
    if (curDist <= skill.range) break; // already in range

    const dx = Math.sign(target.data.gridX - curEn.gridX);
    const dy = Math.sign(target.data.gridY - curEn.gridY);

    // Try diagonal, then cardinal directions
    const candidates = [
      { x: curEn.gridX + dx, y: curEn.gridY + dy },
      { x: curEn.gridX + dx, y: curEn.gridY },
      { x: curEn.gridX,      y: curEn.gridY + dy },
    ];

    let moved = false;
    for (const cand of candidates) {
      if (cand.x < 0 || cand.x >= GRID_COLS || cand.y < 0 || cand.y >= GRID_ROWS) continue;
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
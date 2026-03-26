import {
  BattleState, Character, Enemy, Skill, BattleLog,
  GridCell, TurnActions, GRID_COLS, GRID_ROWS, BASE_SPEED_FT, StatusEffect
} from './types';
import {
  rollDie, rollDice, getModifier, attackRoll, savingThrow,
  getReachableCells, getAttackRangeCells, distanceFeet
} from './dndUtils';

let logId = 0;
const log = (text: string, type: BattleLog['type'], diceResult?: BattleLog['diceResult']): BattleLog => ({
  id: String(logId++), text, type, diceResult
});

// ─── GRID GENERATION ───────────────────────────────────────────────────────
export const generateGrid = (biome: string): GridCell[][] => {
  const grid: GridCell[][] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      let terrain: GridCell['terrain'] = 'open';
      let decoration: string | undefined;

      const r = Math.random();

      if (biome === 'forest') {
        if (r < 0.12) { terrain = 'blocked'; decoration = '🌲'; }
        else if (r < 0.22) { terrain = 'difficult'; decoration = '🌿'; }
        else if (r < 0.26) decoration = '🍄';
      } else if (biome === 'urban') {
        if (r < 0.08) { terrain = 'blocked'; decoration = '🏢'; }
        else if (r < 0.15) { terrain = 'blocked'; decoration = '🚗'; }
        else if (r < 0.20) decoration = '💡';
      } else if (biome === 'dungeon') {
        if (r < 0.15) { terrain = 'blocked'; decoration = '🪨'; }
        else if (r < 0.22) { terrain = 'difficult'; decoration = '⛓️'; }
        else if (r < 0.25) { terrain = 'hazard'; decoration = '🕳️'; }
      } else if (biome === 'ocean') {
        if (r < 0.10) { terrain = 'difficult'; decoration = '🌊'; }
        else if (r < 0.15) decoration = '⚓';
      } else if (biome === 'void') {
        if (r < 0.10) { terrain = 'hazard'; decoration = '💀'; }
        else if (r < 0.18) { terrain = 'difficult'; decoration = '🌀'; }
      } else if (biome === 'palace') {
        if (r < 0.08) { terrain = 'blocked'; decoration = '🏛️'; }
        else if (r < 0.14) decoration = '🕯️';
      } else if (biome === 'prison') {
        if (r < 0.12) { terrain = 'blocked'; decoration = '🔒'; }
        else if (r < 0.18) { terrain = 'difficult'; decoration = '⛓️'; }
      }

      row.push({ x, y, terrain, decoration });
    }
    grid.push(row);
  }
  // Clear starting positions
  grid[3][2] = { x: 2, y: 3, terrain: 'open' };
  grid[3][3] = { x: 3, y: 3, terrain: 'open' };
  grid[4][9] = { x: 9, y: 4, terrain: 'open' };
  grid[4][8] = { x: 8, y: 4, terrain: 'open' };
  return grid;
};

const freshTurnActions = (speedFt: number): TurnActions => ({
  hasAction: true,
  hasBonusAction: true,
  hasReaction: true,
  movementLeft: speedFt,
});

// ─── INITIATIVE ────────────────────────────────────────────────────────────
export const rollInitiative = (
  player: Character,
  enemy: Enemy
): BattleState['initiative'] => {
  const playerRoll = rollDie(20) + getModifier(player.abilityScores.dex) + player.initiative;
  const enemyRoll = rollDie(20) + getModifier(enemy.abilityScores.dex);
  // Player class head_of_hei always wins
  const playerFirst = player.class === 'head_of_hei' || playerRoll >= enemyRoll;
  return {
    order: playerFirst ? ['player', 'enemy'] : ['enemy', 'player'],
    currentIndex: 0,
  };
};

// ─── BATTLE INIT ───────────────────────────────────────────────────────────
export const initBattle = (player: Character, enemy: Enemy, biome = 'urban'): BattleState => {
  const initiative = rollInitiative(player, enemy);
  const grid = generateGrid(biome);
  const first = initiative.order[0];
  return {
    player: { ...player, gridX: 2, gridY: 3 },
    enemy: { ...enemy, gridX: 9, gridY: 4 },
    initiative,
    turn: first,
    round: 1,
    log: [
      log(`⚔ Инициатива! ${first === 'player' ? player.name : enemy.name} ходит первым!`, 'system'),
    ],
    phase: first === 'player' ? 'player_turn' : 'enemy_turn',
    playerActions: freshTurnActions(player.speed),
    enemyActions: freshTurnActions(enemy.speed),
    grid,
    playerStatusEffects: [],
    enemyStatusEffects: [],
    selectedSkill: null,
    movementMode: false,
  };
};

// ─── MOVEMENT ──────────────────────────────────────────────────────────────
export const movePlayer = (state: BattleState, toX: number, toY: number): BattleState => {
  if (state.turn !== 'player' || state.playerActions.movementLeft <= 0) return state;
  const cell = state.grid[toY]?.[toX];
  if (!cell || cell.terrain === 'blocked') return state;
  if (toX === state.enemy.gridX && toY === state.enemy.gridY) return state;

  const dist = distanceFeet(state.player.gridX, state.player.gridY, toX, toY);
  const cost = cell.terrain === 'difficult' ? dist * 2 : dist;

  if (cost > state.playerActions.movementLeft) return state;

  const logs: BattleLog[] = [];
  if (cell.terrain === 'hazard') {
    const dmg = rollDie(4);
    logs.push(log(`${state.player.name} ступает в опасную зону! ${dmg} урона.`, 'system'));
    return {
      ...state,
      player: { ...state.player, gridX: toX, gridY: toY, hp: Math.max(0, state.player.hp - dmg) },
      playerActions: { ...state.playerActions, movementLeft: state.playerActions.movementLeft - cost },
      movementMode: false,
      log: [...state.log, ...logs].slice(-25),
    };
  }

  return {
    ...state,
    player: { ...state.player, gridX: toX, gridY: toY },
    playerActions: { ...state.playerActions, movementLeft: state.playerActions.movementLeft - cost },
    movementMode: false,
    log: [...state.log,
      log(`${state.player.name} перемещается (осталось ${state.playerActions.movementLeft - cost} фут.)`, 'system')
    ].slice(-25),
  };
};

// ─── SKILL EXECUTION ───────────────────────────────────────────────────────
export const executeSkill = (state: BattleState, skill: Skill): BattleState => {
  if (state.turn !== 'player') return state;
  if (skill.currentCooldown > 0) return state;
  if (state.player.cursedEnergy < skill.energyCost) return state;

  // Check action availability
  if (skill.actionCost === 'action' && !state.playerActions.hasAction) return state;
  if (skill.actionCost === 'bonus_action' && !state.playerActions.hasBonusAction) return state;
  if (skill.actionCost === 'reaction' && !state.playerActions.hasReaction) return state;

  // Check range
  const distToEnemy = distanceFeet(
    state.player.gridX, state.player.gridY,
    state.enemy.gridX, state.enemy.gridY
  );
  if (distToEnemy > skill.range + 5) {
    return {
      ...state,
      log: [...state.log,
        log(`❌ ${skill.name}: враг слишком далеко! (${distToEnemy} фут., нужно ≤${skill.range} фут.)`, 'system')
      ].slice(-25),
    };
  }

  const logs: BattleLog[] = [];
  const newPlayer = {
    ...state.player,
    cursedEnergy: state.player.cursedEnergy - skill.energyCost,
    unlockedSkills: state.player.unlockedSkills.map(s =>
      s.id === skill.id ? { ...s, currentCooldown: s.cooldownRounds } : s
    ),
  };

  // Consume action
  const newPlayerActions: TurnActions = {
    ...state.playerActions,
    hasAction: skill.actionCost === 'action' ? false : state.playerActions.hasAction,
    hasBonusAction: skill.actionCost === 'bonus_action' ? false : state.playerActions.hasBonusAction,
    hasReaction: skill.actionCost === 'reaction' ? false : state.playerActions.hasReaction,
  };

  if (skill.isHeal) {
    // Healing skill
    const healRoll = rollDice(skill.damageDice);
    const healed = Math.min(newPlayer.maxHp - newPlayer.hp, healRoll.total);
    newPlayer.hp = Math.min(newPlayer.maxHp, newPlayer.hp + healRoll.total);
    newPlayer.tempHp = skill.id === 'blood_armor'
      ? rollDie(10) * 2 + getModifier(newPlayer.abilityScores.con)
      : newPlayer.tempHp;

    logs.push(log(
      `💚 ${newPlayer.name} использует «${skill.name}» — восстанавливает ${healRoll.total} HP`,
      'player', { rolls: healRoll.rolls, total: healRoll.total, die: skill.damageDice.die }
    ));

    if (skill.statusEffect) {
      logs.push(log(`✨ Эффект «${skill.statusEffect.type}» применён!`, 'system'));
    }

    return {
      ...state, player: newPlayer, playerActions: newPlayerActions,
      playerStatusEffects: skill.statusEffect
        ? [...state.playerStatusEffects, skill.statusEffect]
        : state.playerStatusEffects,
      log: [...state.log, ...logs].slice(-25),
    };
  }

  // Attack Roll: d20 + DEX or STR mod + proficiency
  const abilityMod = skill.element === 'physical' || skill.element === 'blood'
    ? getModifier(newPlayer.abilityScores.str)
    : getModifier(newPlayer.abilityScores.int);
  const atk = attackRoll(abilityMod, newPlayer.proficiencyBonus, state.enemy.armorClass);

  logs.push(log(
    `🎲 ${newPlayer.name} бросает d20 [${atk.roll}] + ${abilityMod + newPlayer.proficiencyBonus} = ${atk.total} vs КБ ${state.enemy.armorClass}`,
    'player', { rolls: [atk.roll], total: atk.total, die: 'd20' }
  ));

  if (!atk.hit) {
    logs.push(log(`💨 «${skill.name}» — ПРОМАХ!`, 'miss'));
    return {
      ...state, player: newPlayer, playerActions: newPlayerActions,
      log: [...state.log, ...logs].slice(-25),
      attackRollResult: atk,
    };
  }

  // Damage roll
  const dmgRoll = rollDice(skill.damageDice);
  let totalDmg = dmgRoll.total;
  if (atk.crit) totalDmg += rollDice(skill.damageDice).total; // crit = double dice

  // Apply status buffs
  const empowered = state.playerStatusEffects.find(e => e.type === 'empowered');
  if (empowered) totalDmg += empowered.value;

  // Passive bonus: Vessel (Sukuna) on round multiples
  if (state.player.class === 'vessel' && state.round % 3 === 0) {
    const bonus = rollDie(10) + 5;
    totalDmg += bonus;
    logs.push(log(`👹 Сукуна берёт контроль! +${bonus} урона`, 'combo'));
  }

  // Apply to enemy (accounting for tempHP)
  let enemyTempHp = state.enemy.tempHp;
  let actualDmg = totalDmg;
  if (enemyTempHp > 0) {
    const absorbed = Math.min(enemyTempHp, actualDmg);
    enemyTempHp -= absorbed;
    actualDmg -= absorbed;
    if (absorbed > 0) logs.push(log(`🛡 Временный HP поглотил ${absorbed} урона`, 'system'));
  }

  const newEnemyHp = Math.max(0, state.enemy.hp - actualDmg);

  logs.push(log(
    `${atk.crit ? '💥 КРИТ! ' : ''}«${skill.name}» попадает! Урон: ${actualDmg}${atk.crit ? ' (критический)' : ''}`,
    atk.crit ? 'critical' : 'player',
    { rolls: dmgRoll.rolls, total: totalDmg, die: skill.damageDice.die }
  ));

  // Saving throw
  let enemyStatusEffects = [...state.enemyStatusEffects];
  if (skill.savingThrow && skill.statusEffect) {
    const save = savingThrow(state.enemy.abilityScores[skill.savingThrow.stat], skill.savingThrow.dc);
    logs.push(log(
      `🎲 Спасбросок ${skill.savingThrow.stat.toUpperCase()} [${save.roll}] = ${save.total} vs СЛ ${skill.savingThrow.dc} — ${save.success ? 'УСПЕХ' : 'ПРОВАЛ'}`,
      'save', { rolls: [save.roll], total: save.total, die: 'd20' }
    ));
    if (!save.success) {
      enemyStatusEffects = [...enemyStatusEffects, { ...skill.statusEffect }];
      logs.push(log(`🌀 Эффект «${skill.statusEffect.type}» применён к ${state.enemy.name}`, 'system'));
    }
  } else if (skill.statusEffect && !skill.savingThrow) {
    enemyStatusEffects = [...enemyStatusEffects, { ...skill.statusEffect }];
  }

  return {
    ...state,
    player: newPlayer,
    enemy: { ...state.enemy, hp: newEnemyHp, tempHp: enemyTempHp },
    playerActions: newPlayerActions,
    enemyStatusEffects,
    log: [...state.log, ...logs].slice(-25),
    attackRollResult: atk,
  };
};

// ─── END PLAYER TURN ───────────────────────────────────────────────────────
export const endPlayerTurn = (state: BattleState): BattleState => {
  const logs: BattleLog[] = [log('─── Ход врага ───', 'system')];

  // Tick player status effects
  const newPlayerFX = state.playerStatusEffects
    .map(e => ({ ...e, duration: e.duration - 1 }))
    .filter(e => e.duration > 0);

  return {
    ...state,
    turn: 'enemy',
    phase: 'enemy_turn',
    playerStatusEffects: newPlayerFX,
    playerActions: freshTurnActions(state.player.speed),
    // Tick skill cooldowns
    player: {
      ...state.player,
      unlockedSkills: state.player.unlockedSkills.map(s =>
        ({ ...s, currentCooldown: Math.max(0, s.currentCooldown - 1) })
      ),
    },
    log: [...state.log, ...logs].slice(-25),
  };
};

// ─── ENEMY AI TURN ─────────────────────────────────────────────────────────
export const enemyTurn = (state: BattleState): BattleState => {
  if (state.turn !== 'enemy') return state;

  const logs: BattleLog[] = [];
  let newState = { ...state };

  // Check stun
  const stunned = state.enemyStatusEffects.some(e => e.type === 'stun' || e.type === 'grappled');
  if (stunned) {
    logs.push(log(`${state.enemy.name} скован и пропускает ход!`, 'system'));
    const newEnemyFX = state.enemyStatusEffects
      .map(e => ({ ...e, duration: e.duration - 1 }))
      .filter(e => e.duration > 0);

    return {
      ...newState,
      turn: 'player',
      phase: 'player_turn',
      round: state.round + 1,
      enemyStatusEffects: newEnemyFX,
      enemyActions: freshTurnActions(state.enemy.speed),
      log: [...state.log, ...logs].slice(-25),
    };
  }

  // Move towards player if not adjacent
  const dist = distanceFeet(
    state.enemy.gridX, state.enemy.gridY,
    state.player.gridX, state.player.gridY
  );

  let newEnemyX = state.enemy.gridX;
  let newEnemyY = state.enemy.gridY;

  if (dist > 10) {
    const dx = state.player.gridX - state.enemy.gridX;
    const dy = state.player.gridY - state.enemy.gridY;
    const stepX = newEnemyX + Math.sign(dx);
    const stepY = newEnemyY + Math.sign(dy);

    // Try to move in X then Y
    const cellX = state.grid[newEnemyY]?.[stepX];
    const cellY = state.grid[stepY]?.[newEnemyX];

    if (cellX && cellX.terrain !== 'blocked' && !(stepX === state.player.gridX && newEnemyY === state.player.gridY)) {
      newEnemyX = stepX;
    } else if (cellY && cellY.terrain !== 'blocked' && !(newEnemyX === state.player.gridX && stepY === state.player.gridY)) {
      newEnemyY = stepY;
    }
    logs.push(log(`${state.enemy.name} двигается к ${state.player.name}`, 'enemy'));
  }

  // Pick skill
  const availSkills = state.enemy.skills.filter(s => s.currentCooldown === 0);
  const pickedSkill = availSkills.length > 0
    ? availSkills[Math.floor(Math.random() * availSkills.length)]
    : state.enemy.skills[0];

  const newDist = distanceFeet(newEnemyX, newEnemyY, state.player.gridX, state.player.gridY);

  if (newDist <= pickedSkill.range + 5) {
    // Attack
    const atkMod = getModifier(state.enemy.abilityScores.str);
    const atk = attackRoll(atkMod, 2, state.player.armorClass);

    logs.push(log(
      `🎲 ${state.enemy.name} бросает d20 [${atk.roll}] + ${atkMod + 2} = ${atk.total} vs КБ ${state.player.armorClass}`,
      'enemy', { rolls: [atk.roll], total: atk.total, die: 'd20' }
    ));

    if (!atk.hit) {
      logs.push(log(`💨 «${pickedSkill.name}» — ПРОМАХ!`, 'miss'));
    } else {
      const dmgRoll = rollDice(pickedSkill.damageDice);
      let dmg = dmgRoll.total;
      if (atk.crit) dmg += rollDice(pickedSkill.damageDice).total;

      // Weakened effect reduces damage
      const weakened = state.playerStatusEffects.find(e => e.type === 'weakened');
      if (weakened) dmg = Math.max(1, dmg - weakened.value);

      let playerTempHp = state.player.tempHp;
      let actualDmg = dmg;
      if (playerTempHp > 0) {
        const abs = Math.min(playerTempHp, actualDmg);
        playerTempHp -= abs;
        actualDmg -= abs;
        if (abs > 0) logs.push(log(`🛡 TempHP поглотил ${abs} урона`, 'system'));
      }

      const newHp = Math.max(0, state.player.hp - actualDmg);

      logs.push(log(
        `${atk.crit ? '💥 КРИТ! ' : ''}«${pickedSkill.name}» попадает в ${state.player.name}! Урон: ${actualDmg}`,
        atk.crit ? 'critical' : 'enemy',
        { rolls: dmgRoll.rolls, total: dmg, die: pickedSkill.damageDice.die }
      ));

      newState = {
        ...newState,
        player: { ...newState.player, hp: newHp, tempHp: playerTempHp },
      };
    }

    // Tick skill cooldown
    newState = {
      ...newState,
      enemy: {
        ...newState.enemy,
        gridX: newEnemyX, gridY: newEnemyY,
        skills: newState.enemy.skills.map(s =>
          s.id === pickedSkill.id ? { ...s, currentCooldown: s.cooldownRounds } : { ...s, currentCooldown: Math.max(0, s.currentCooldown - 1) }
        ),
      },
    };
  } else {
    newState = { ...newState, enemy: { ...newState.enemy, gridX: newEnemyX, gridY: newEnemyY } };
    logs.push(log(`${state.enemy.name} не может достать ${state.player.name}`, 'enemy'));
  }

  // Tick enemy status effects
  const newEnemyFX = state.enemyStatusEffects
    .map(e => ({ ...e, duration: e.duration - 1 }))
    .filter(e => e.duration > 0);

  // Bleed / burn / curse DoT
  let enemyBleedDmg = 0;
  state.enemyStatusEffects.forEach(e => {
    if ((e.type === 'bleed' || e.type === 'burn' || e.type === 'curse') && e.value > 0) {
      enemyBleedDmg += e.value;
    }
  });
  if (enemyBleedDmg > 0) {
    newState = { ...newState, enemy: { ...newState.enemy, hp: Math.max(0, newState.enemy.hp - enemyBleedDmg) } };
    logs.push(log(`🩸 ${state.enemy.name} получает ${enemyBleedDmg} урона от статус-эффектов`, 'system'));
  }

  return {
    ...newState,
    turn: 'player',
    phase: 'player_turn',
    round: state.round + 1,
    enemyStatusEffects: newEnemyFX,
    enemyActions: freshTurnActions(state.enemy.speed),
    playerActions: freshTurnActions(state.player.speed),
    log: [...state.log, ...logs].slice(-25),
  };
};

// ─── DEATH SAVES ───────────────────────────────────────────────────────────
export const makeDeathSave = (state: BattleState): { state: BattleState; result: 'stable' | 'dead' | 'continue' } => {
  const roll = rollDie(20);
  const logs: BattleLog[] = [
    log(`💀 СПАСБРОСОК ОТ СМЕРТИ: [${roll}]`, 'system', { rolls: [roll], total: roll, die: 'd20' })
  ];

  let { successes, failures } = state.player.deathSaves;

  if (roll === 20) {
    logs.push(log('🌟 Натуральная 20 — немедленная стабилизация с 1 HP!', 'critical'));
    const newState = {
      ...state,
      player: { ...state.player, hp: 1, deathSaves: { successes: 0, failures: 0 } },
      log: [...state.log, ...logs].slice(-25),
    };
    return { state: newState, result: 'stable' };
  }

  if (roll === 1) {
    failures += 2; // nat 1 = 2 failures
    logs.push(log('💀 Натуральная 1 — два провала!', 'enemy'));
  } else if (roll >= 10) {
    successes += 1;
    logs.push(log(`✅ Успех [${roll}] — ${successes}/3`, 'player'));
  } else {
    failures += 1;
    logs.push(log(`❌ Провал [${roll}] — ${failures}/3`, 'enemy'));
  }

  const newDeathSaves = { successes, failures };

  if (successes >= 3) {
    logs.push(log(`${state.player.name} стабилизируется!`, 'system'));
    const ns = { ...state, player: { ...state.player, hp: 0, deathSaves: { successes: 0, failures: 0 } }, log: [...state.log, ...logs].slice(-25) };
    return { state: ns, result: 'stable' };
  }
  if (failures >= 3) {
    logs.push(log(`💀 ${state.player.name} мёртв...`, 'enemy'));
    const ns = { ...state, player: { ...state.player, deathSaves: newDeathSaves }, log: [...state.log, ...logs].slice(-25) };
    return { state: ns, result: 'dead' };
  }

  const ns = { ...state, player: { ...state.player, deathSaves: newDeathSaves }, log: [...state.log, ...logs].slice(-25) };
  return { state: ns, result: 'continue' };
};

// ─── REST ───────────────────────────────────────────────────────────────────
export const shortRest = (char: Character): Character => {
  const available = char.hitDice.total - char.hitDice.used;
  if (available <= 0) return char;
  const { rolls, total } = rollDice({ count: 1, die: char.hitDice.die, modifier: getModifier(char.abilityScores.con) });
  const healed = Math.min(char.maxHp - char.hp, total);
  return {
    ...char,
    hp: char.hp + healed,
    hitDice: { ...char.hitDice, used: char.hitDice.used + 1 },
    cursedEnergy: Math.min(char.maxCursedEnergy, char.cursedEnergy + Math.floor(char.maxCursedEnergy / 2)),
  };
};

export const longRest = (char: Character): Character => ({
  ...char,
  hp: char.maxHp,
  tempHp: 0,
  cursedEnergy: char.maxCursedEnergy,
  hitDice: { ...char.hitDice, used: 0 },
  deathSaves: { successes: 0, failures: 0 },
  unlockedSkills: char.unlockedSkills.map(s => ({ ...s, currentCooldown: 0 })),
});

// ─── WIN / LOSS CHECK ──────────────────────────────────────────────────────
export const checkBattleEnd = (state: BattleState): 'player_win' | 'player_dying' | 'enemy_win' | null => {
  if (state.enemy.hp <= 0) return 'player_win';
  if (state.player.hp <= 0) return 'player_dying'; // trigger death saves
  return null;
};

// ─── USE ITEM IN BATTLE ───────────────────────────────────────────────────
export const applyItemInBattle = (state: BattleState, effect: string): BattleState => {
  const logs: BattleLog[] = [];
  const newPlayer = { ...state.player };

  if (effect === 'heal_80') {
    const healed = Math.min(newPlayer.maxHp - newPlayer.hp, 80);
    newPlayer.hp += healed;
    logs.push(log(`🩹 Использован бинт — восстановлено ${healed} HP`, 'system'));
  } else if (effect === 'mana_50') {
    const ce = Math.min(newPlayer.maxCursedEnergy - newPlayer.cursedEnergy, 5);
    newPlayer.cursedEnergy += ce;
    logs.push(log(`💎 Использован кристалл — восстановлено ${ce} Проклятой Энергии`, 'system'));
  } else if (effect === 'buff_attack') {
    logs.push(log(`⚗ Эликсир активирован — усиление на 3 раунда`, 'system'));
  }

  return { ...state, player: newPlayer, log: [...state.log, ...logs].slice(-25) };
};

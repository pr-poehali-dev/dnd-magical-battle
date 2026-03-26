import { BattleState, Character, Enemy, Skill, BattleLog, StatusEffect } from './types';

let logIdCounter = 0;
const makeLog = (text: string, type: BattleLog['type']): BattleLog => ({
  id: String(logIdCounter++), text, type
});

const calcDamage = (attacker: { attack: number }, skill: Skill, defender: { defense: number }, isCritical: boolean, isCombo: boolean): number => {
  const base = skill.damage + attacker.attack * 0.3 - defender.defense * 0.2;
  const crit = isCritical ? 1.8 : 1;
  const combo = isCombo ? 1.4 : 1;
  return Math.max(1, Math.floor(base * crit * combo + (Math.random() * 10 - 5)));
};

const applyStatusEffects = (state: BattleState): { state: BattleState; logs: BattleLog[] } => {
  const logs: BattleLog[] = [];
  const newState = { ...state };

  newState.playerStatusEffects = state.playerStatusEffects
    .map(e => ({ ...e, duration: e.duration - 1 }))
    .filter(e => e.duration > 0);

  newState.enemyStatusEffects = state.enemyStatusEffects
    .map(e => {
      if (e.type === 'bleed' || e.type === 'burn' || e.type === 'curse') {
        const dmg = e.value;
        newState.enemy = { ...newState.enemy, hp: Math.max(0, newState.enemy.hp - dmg) };
        logs.push(makeLog(`${newState.enemy.name} получает ${dmg} урона от эффекта ${e.type === 'bleed' ? 'кровотечения' : e.type === 'burn' ? 'ожога' : 'проклятия'}`, 'system'));
      }
      return { ...e, duration: e.duration - 1 };
    })
    .filter(e => e.duration > 0);

  return { state: newState, logs };
};

export const playerAttack = (state: BattleState, skill: Skill): BattleState => {
  if (state.turn !== 'player' || state.phase !== 'select') return state;
  if (skill.currentCooldown > 0) return state;
  if (state.player.mana < skill.manaCost) return state;

  const logs: BattleLog[] = [];
  const isCritical = Math.random() < 0.2;
  const isCombo = state.lastSkillId !== null && state.comboCount > 0;
  const damage = calcDamage(state.player, skill, state.enemy, isCritical, isCombo);

  const newPlayer = {
    ...state.player,
    mana: state.player.mana - skill.manaCost,
    skills: state.player.skills.map(s =>
      s.id === skill.id ? { ...s, currentCooldown: s.cooldown } : { ...s, currentCooldown: Math.max(0, s.currentCooldown - 1) }
    )
  };

  const newEnemy = { ...state.enemy, hp: Math.max(0, state.enemy.hp - damage) };

  let logText = `${state.player.name} использует «${skill.name}»`;
  if (isCritical) logText += ' — КРИТИЧЕСКИЙ УДАР!';
  if (isCombo) logText += ` — КОМБО x${state.comboCount + 1}!`;
  logText += ` Урон: ${damage}`;

  logs.push(makeLog(logText, isCritical ? 'critical' : isCombo ? 'combo' : 'player'));

  const enemyStatusEffects = [...state.enemyStatusEffects];
  if (skill.statusEffect) {
    enemyStatusEffects.push({ ...skill.statusEffect });
    logs.push(makeLog(`${newEnemy.name} поражён эффектом: ${skill.statusEffect.type}`, 'system'));
  }

  // Passive: Vessel - Sukuna every 3 turns
  if (state.player.class === 'vessel' && (state.round % 3 === 0)) {
    const bonusDmg = Math.floor(damage * 0.5);
    newEnemy.hp = Math.max(0, newEnemy.hp - bonusDmg);
    logs.push(makeLog(`Сукуна берёт контроль! Дополнительный урон: ${bonusDmg}`, 'critical'));
  }

  // Passive: Gambler - jackpot
  if (state.player.class === 'gambler' && Math.random() < 0.15) {
    const healAmount = 50;
    newPlayer.hp = Math.min(newPlayer.maxHp, newPlayer.hp + healAmount);
    logs.push(makeLog(`🎰 ДЖЕКПОТ! Восстановлено ${healAmount} HP!`, 'combo'));
  }

  const newComboCount = state.lastSkillId ? state.comboCount + 1 : 0;
  const newState: BattleState = {
    ...state,
    player: newPlayer,
    enemy: newEnemy,
    turn: 'enemy',
    round: state.round + 1,
    log: [...state.log, ...logs].slice(-20),
    phase: 'animation',
    comboCount: newComboCount,
    lastSkillId: skill.id,
    enemyStatusEffects,
  };

  return newState;
};

export const enemyAttack = (state: BattleState): BattleState => {
  if (state.turn !== 'enemy') return state;
  if (state.enemy.hp <= 0) return state;

  const logs: BattleLog[] = [];
  const stunned = state.enemyStatusEffects.some(e => e.type === 'stun');

  if (stunned) {
    logs.push(makeLog(`${state.enemy.name} оглушён и пропускает ход!`, 'system'));
    return {
      ...state,
      turn: 'player',
      phase: 'select',
      log: [...state.log, ...logs].slice(-20),
    };
  }

  const availableSkills = state.enemy.skills.filter(s => s.currentCooldown === 0);
  const skill = availableSkills.length > 0
    ? availableSkills[Math.floor(Math.random() * availableSkills.length)]
    : state.enemy.skills[0];

  const isCritical = Math.random() < 0.15;
  const damage = calcDamage(state.enemy, skill, state.player, isCritical, false);
  const actualDamage = state.isPlayerDefending ? Math.floor(damage * 0.4) : damage;

  const newPlayer = { ...state.player, hp: Math.max(0, state.player.hp - actualDamage) };
  const newEnemySkills = state.enemy.skills.map(s =>
    s.id === skill.id ? { ...s, currentCooldown: s.cooldown } : { ...s, currentCooldown: Math.max(0, s.currentCooldown - 1) }
  );

  let logText = `${state.enemy.name} атакует «${skill.name}»`;
  if (isCritical) logText += ' — КРИТИЧЕСКИЙ УДАР!';
  if (state.isPlayerDefending) logText += ' (заблокировано!)';
  logText += ` Урон: ${actualDamage}`;
  logs.push(makeLog(logText, isCritical ? 'critical' : 'enemy'));

  const { state: afterStatus, logs: statusLogs } = applyStatusEffects(state);
  logs.push(...statusLogs);

  return {
    ...afterStatus,
    player: newPlayer,
    enemy: { ...afterStatus.enemy, skills: newEnemySkills },
    turn: 'player',
    phase: 'select',
    isPlayerDefending: false,
    log: [...state.log, ...logs].slice(-20),
  };
};

export const playerDefend = (state: BattleState): BattleState => {
  if (state.turn !== 'player') return state;
  const logs = [makeLog(`${state.player.name} принимает оборонительную стойку!`, 'system')];
  return {
    ...state,
    isPlayerDefending: true,
    turn: 'enemy',
    phase: 'animation',
    comboCount: 0,
    lastSkillId: null,
    log: [...state.log, ...logs].slice(-20),
  };
};

export const initBattle = (player: Character, enemy: Enemy): BattleState => ({
  player: { ...player },
  enemy: { ...enemy },
  turn: 'player',
  round: 1,
  log: [makeLog(`Бой начался! ${player.name} против ${enemy.name}!`, 'system')],
  phase: 'select',
  comboCount: 0,
  lastSkillId: null,
  playerStatusEffects: [],
  enemyStatusEffects: [],
  isPlayerDefending: false,
});

export const checkBattleEnd = (state: BattleState): 'player_win' | 'enemy_win' | null => {
  if (state.enemy.hp <= 0) return 'player_win';
  if (state.player.hp <= 0) return 'enemy_win';
  return null;
};

export const useItem = (state: BattleState, itemEffect: string): BattleState => {
  const logs: BattleLog[] = [];
  const newPlayer = { ...state.player };

  if (itemEffect === 'heal_80') {
    newPlayer.hp = Math.min(newPlayer.maxHp, newPlayer.hp + 80);
    logs.push(makeLog('Использован бинт! Восстановлено 80 HP', 'system'));
  } else if (itemEffect === 'mana_50') {
    newPlayer.mana = Math.min(newPlayer.maxMana, newPlayer.mana + 50);
    logs.push(makeLog('Использован кристалл! Восстановлено 50 маны', 'system'));
  } else if (itemEffect === 'buff_attack') {
    logs.push(makeLog('Использован эликсир! Атака +5 на 3 хода', 'system'));
  }

  return { ...state, player: newPlayer, log: [...state.log, ...logs].slice(-20) };
};

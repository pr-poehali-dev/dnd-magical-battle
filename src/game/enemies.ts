import { Enemy, Skill, AbilityScores } from './types';

const avgScores: AbilityScores = { str: 12, dex: 12, con: 12, int: 8, wis: 10, cha: 6 };
const bossScores: AbilityScores = { str: 20, dex: 14, con: 18, int: 14, wis: 12, cha: 12 };

const eSkill = (id: string, name: string, count: number, die: Skill['damageDice']['die'], mod: number, range: number, element: Skill['element'], cdRounds = 0): Skill => ({
  id, name, description: '', damageDice: { count, die, modifier: mod }, range,
  actionCost: 'action', energyCost: 0, element, requiresLevel: 1,
  cooldownRounds: cdRounds, currentCooldown: 0,
});

const base = (overrides: Partial<Enemy>): Enemy => ({
  id: 'base', name: 'Enemy', color: '#888', glowColor: '#aaa',
  hp: 10, maxHp: 10, tempHp: 0, armorClass: 10, speed: 30, initiative: 0, proficiencyBonus: 2,
  abilityScores: avgScores,
  statusEffects: [],
  hasAction: true, hasBonusAction: true, hasReaction: true, movementLeft: 30,
  deathSaves: { successes: 0, failures: 0 },
  isUnconscious: false, isDead: false,
  onTree: false,
  gridX: 12, gridY: 5,
  attack: 4, challengeRating: 1,
  skills: [], exp: 50, loot: [], description: '',
  isBoss: false, aiType: 'aggressive',
  ...overrides,
});

export const ENEMIES: Record<string, Enemy> = {
  small_curse: base({
    id: 'small_curse', name: 'Малое проклятие', color: '#555', glowColor: '#777',
    hp: 6, maxHp: 6, armorClass: 11, speed: 30,
    challengeRating: 0.25, exp: 50,
    abilityScores: { ...avgScores, str: 10, dex: 12 },
    skills: [eSkill('scratch', 'Царапина', 1, 'd4', 0, 5, 'cursed')],
    description: 'Слабое проклятое существо.',
  }),
  medium_curse: base({
    id: 'medium_curse', name: 'Среднее проклятие', color: '#666', glowColor: '#888',
    hp: 16, maxHp: 16, armorClass: 13, speed: 30,
    challengeRating: 1, exp: 100,
    abilityScores: { ...avgScores, str: 14, con: 14 },
    skills: [
      eSkill('curse_bite', 'Проклятый укус', 1, 'd6', 2, 5, 'cursed'),
      eSkill('dark_wave', 'Тёмная волна', 1, 'd4', 1, 20, 'cursed', 2),
    ],
    description: 'Проклятие уровня C.',
  }),
  rogue_sorcerer: base({
    id: 'rogue_sorcerer', name: 'Чародей-отступник', color: '#7c4a9e', glowColor: '#a67bc9',
    hp: 18, maxHp: 18, armorClass: 13, speed: 30,
    challengeRating: 2, exp: 150,
    abilityScores: { ...avgScores, int: 14, wis: 12 },
    skills: [
      eSkill('curse_tech', 'Проклятая техника', 1, 'd6', 2, 20, 'cursed'),
    ],
    description: 'Чародей, выбравший путь тьмы.',
    aiType: 'ranged',
  }),
  grade1_curse: base({
    id: 'grade1_curse', name: 'Проклятие 1 ранга', color: '#444', glowColor: '#666',
    hp: 28, maxHp: 28, armorClass: 15, speed: 35,
    challengeRating: 5, exp: 300,
    abilityScores: { ...avgScores, str: 18, con: 18 },
    skills: [
      eSkill('curse_blast', 'Проклятый взрыв', 2, 'd6', 3, 20, 'cursed', 2),
    ],
    description: 'Проклятие уровня A.',
  }),
  jogo: base({
    id: 'jogo', name: 'Джого', color: '#b45309', glowColor: '#d97706',
    hp: 60, maxHp: 60, armorClass: 17, speed: 30,
    challengeRating: 12, isBoss: true, exp: 1100,
    abilityScores: { ...bossScores, str: 22, con: 20 },
    skills: [
      eSkill('ember_insects', 'Огненные насекомые', 2, 'd6', 3, 20, 'cursed'),
      eSkill('meteor', 'Метеор', 3, 'd8', 4, 30, 'cursed', 3),
    ],
    description: 'Особый дух — воплощение стихийной катастрофы.',
  }),
};

export const getEnemyById = (id: string): Enemy => {
  const base = ENEMIES[id] ?? ENEMIES['small_curse'];
  return { ...base, hp: base.maxHp, tempHp: 0, statusEffects: [], hasAction: true, hasBonusAction: true, hasReaction: true, movementLeft: base.speed, isUnconscious: false, isDead: false, onTree: false, deathSaves: { successes: 0, failures: 0 }, gridX: 12, gridY: 5, currentCooldown: 0 } as Enemy;
};
import { Enemy, Skill, AbilityScores } from './types';

const avgScores: AbilityScores = { str: 12, dex: 12, con: 12, int: 8, wis: 10, cha: 6 };
const bossScores: AbilityScores = { str: 20, dex: 14, con: 18, int: 14, wis: 12, cha: 12 };
const legendaryScores: AbilityScores = { str: 28, dex: 16, con: 24, int: 18, wis: 16, cha: 18 };

const eSkill = (id: string, name: string, count: number, die: Skill['damageDice']['die'], mod: number, range: number, element: Skill['element'], energyCost = 0): Skill => ({
  id, name, description: '', damageDice: { count, die, modifier: mod }, range,
  actionCost: 'action', energyCost, element, requiresLevel: 1,
  cooldownRounds: energyCost > 0 ? 2 : 0, currentCooldown: 0,
});

export const ENEMIES: Record<string, Enemy> = {
  small_curse: {
    id: 'small_curse', name: 'Малое проклятие', emoji: '👾',
    hp: 22, maxHp: 22, tempHp: 0, armorClass: 11, speed: 30,
    attack: 4, challengeRating: 0.25,
    abilityScores: { ...avgScores, str: 10, dex: 12 },
    skills: [eSkill('scratch', 'Царапина', 1, 'd6', 1, 5, 'cursed')],
    exp: 50, loot: [], description: 'Слабое проклятое существо из негативных эмоций.',
    gridX: 9, gridY: 4,
  },
  medium_curse: {
    id: 'medium_curse', name: 'Среднее проклятие', emoji: '👹',
    hp: 45, maxHp: 45, tempHp: 0, armorClass: 13, speed: 30,
    attack: 6, challengeRating: 1,
    abilityScores: { ...avgScores, str: 14, con: 14 },
    skills: [
      eSkill('curse_bite', 'Проклятый укус', 1, 'd8', 3, 5, 'cursed'),
      eSkill('dark_wave', 'Тёмная волна', 2, 'd6', 2, 30, 'cursed', 2),
    ],
    exp: 100, loot: [], description: 'Проклятие уровня C — опасно для обычных людей.',
    gridX: 9, gridY: 4,
  },
  grade2_curse: {
    id: 'grade2_curse', name: 'Проклятие 2 ранга', emoji: '🐲',
    hp: 75, maxHp: 75, tempHp: 0, armorClass: 14, speed: 30,
    attack: 8, challengeRating: 3,
    abilityScores: { ...avgScores, str: 16, con: 16 },
    skills: [
      eSkill('curse_wave', 'Волна проклятия', 2, 'd8', 3, 30, 'cursed'),
      eSkill('dark_fist', 'Тёмный кулак', 2, 'd10', 4, 5, 'cursed', 2),
    ],
    exp: 175, loot: [], description: 'Проклятие уровня B — требует чародея 2 ранга.',
    gridX: 9, gridY: 4,
  },
  grade1_curse: {
    id: 'grade1_curse', name: 'Проклятие 1 ранга', emoji: '🦠',
    hp: 110, maxHp: 110, tempHp: 0, armorClass: 15, speed: 35,
    attack: 10, challengeRating: 5,
    abilityScores: { ...avgScores, str: 18, con: 18, int: 10 },
    skills: [
      eSkill('domain_pressure', 'Давление домена', 2, 'd10', 4, 30, 'cursed'),
      eSkill('curse_blast', 'Проклятый взрыв', 3, 'd8', 5, 30, 'cursed', 3),
    ],
    exp: 300, loot: [], description: 'Проклятие уровня A — смертельная угроза.',
    gridX: 9, gridY: 4,
  },
  special_grade_curse: {
    id: 'special_grade_curse', name: 'Проклятие особого ранга', emoji: '💀',
    hp: 170, maxHp: 170, tempHp: 0, armorClass: 17, speed: 35,
    attack: 12, challengeRating: 8, isBoss: true,
    abilityScores: { ...bossScores },
    skills: [
      eSkill('soul_crush', 'Дробление души', 3, 'd10', 5, 5, 'cursed'),
      eSkill('domain_expansion', 'Расширение домена', 4, 'd10', 6, 60, 'domain', 4),
    ],
    exp: 600, loot: [], description: 'Редчайшее существо. Способно уничтожить целый город.',
    gridX: 9, gridY: 4,
  },
  rogue_sorcerer: {
    id: 'rogue_sorcerer', name: 'Чародей-отступник', emoji: '🧙',
    hp: 52, maxHp: 52, tempHp: 0, armorClass: 13, speed: 30,
    attack: 7, challengeRating: 2,
    abilityScores: { ...avgScores, int: 14, wis: 12 },
    skills: [
      eSkill('curse_tech', 'Проклятая техника', 2, 'd8', 3, 30, 'cursed'),
      eSkill('barrier', 'Барьер', 1, 'd6', 2, 5, 'divine', 2),
    ],
    exp: 150, loot: [], description: 'Чародей, выбравший путь тьмы.',
    gridX: 9, gridY: 4,
  },
  jogo: {
    id: 'jogo', name: 'Джого', emoji: '🌋',
    hp: 230, maxHp: 230, tempHp: 0, armorClass: 17, speed: 30,
    attack: 14, challengeRating: 12, isBoss: true,
    abilityScores: { ...bossScores, str: 22, con: 20 },
    skills: [
      eSkill('ember_insects', 'Огненные насекомые', 3, 'd8', 5, 30, 'cursed'),
      eSkill('maximum_meteor', 'Максимум: Метеор', 6, 'd10', 8, 60, 'cursed', 5),
    ],
    exp: 1100, loot: [], description: 'Особый проклятый дух — воплощение природной катастрофы.',
    gridX: 9, gridY: 4,
  },
  hanami: {
    id: 'hanami', name: 'Ханами', emoji: '🌸',
    hp: 200, maxHp: 200, tempHp: 0, armorClass: 18, speed: 30,
    attack: 12, challengeRating: 10, isBoss: true,
    abilityScores: { ...bossScores, con: 20 },
    skills: [
      eSkill('wooden_limbs', 'Деревянные конечности', 3, 'd8', 4, 10, 'cursed'),
      eSkill('flower_domain', 'Цветочный домен', 5, 'd10', 6, 60, 'domain', 5),
    ],
    exp: 900, loot: [], description: 'Особый дух без глаз. Любит жизнь, ненавидит людей.',
    gridX: 9, gridY: 4,
  },
  choso_clone: {
    id: 'choso_clone', name: 'Теневой Чосо', emoji: '🩸',
    hp: 160, maxHp: 160, tempHp: 0, armorClass: 15, speed: 30,
    attack: 11, challengeRating: 8, isBoss: true,
    abilityScores: { ...bossScores, str: 18, con: 20 },
    skills: [
      eSkill('blood_shower', 'Кровавый ливень', 3, 'd8', 4, 30, 'blood'),
      eSkill('piercing_max', 'Максимум: Пронизывающая кровь', 4, 'd10', 6, 60, 'blood', 4),
    ],
    exp: 750, loot: [], description: 'Кровяной дух — копия Чосо из прошлого.',
    gridX: 9, gridY: 4,
  },
  sukuna: {
    id: 'sukuna', name: 'Рёмэн Сукуна', emoji: '👑',
    hp: 500, maxHp: 500, tempHp: 50, armorClass: 22, speed: 40,
    attack: 18, challengeRating: 30, isBoss: true,
    abilityScores: { ...legendaryScores },
    skills: [
      eSkill('dismantle', 'Разбор', 4, 'd10', 8, 10, 'void'),
      eSkill('cleave', 'Рассечение', 5, 'd12', 10, 30, 'void'),
      eSkill('malevolent_shrine', 'Храм злобы', 8, 'd10', 12, 60, 'domain', 6),
    ],
    exp: 5000, loot: [], description: 'Король проклятий. Величайшее существо за всю историю.',
    gridX: 9, gridY: 4,
  },
};

export const getEnemyById = (id: string): Enemy => {
  const base = ENEMIES[id] ?? ENEMIES['small_curse'];
  return {
    ...base,
    hp: base.maxHp,
    tempHp: base.tempHp ?? 0,
    skills: base.skills.map(s => ({ ...s, currentCooldown: 0 })),
    gridX: 9, gridY: 4,
  };
};

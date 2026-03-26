import { Enemy, Skill } from './types';

const eSkill = (id: string, name: string, damage: number, manaCost: number, element: Skill['element'], statusEffect?: Skill['statusEffect']): Skill => ({
  id, name, description: '', damage, manaCost, element,
  cooldown: 2, currentCooldown: 0, isUltimate: false,
});

export const ENEMIES: Record<string, Enemy> = {
  small_curse: {
    id: 'small_curse', name: 'Малое проклятие', emoji: '👾', hp: 80, maxHp: 80,
    attack: 25, defense: 10,
    skills: [eSkill('scratch', 'Царапина', 20, 0, 'cursed')],
    exp: 30, loot: [], description: 'Слабое проклятое существо из негативных эмоций людей.'
  },
  medium_curse: {
    id: 'medium_curse', name: 'Среднее проклятие', emoji: '👹', hp: 150, maxHp: 150,
    attack: 40, defense: 20,
    skills: [eSkill('curse_bite', 'Проклятый укус', 35, 0, 'cursed'), eSkill('dark_wave', 'Тёмная волна', 50, 15, 'cursed')],
    exp: 60, loot: [], description: 'Проклятие уровня C — опасно для обычных людей.'
  },
  grade2_curse: {
    id: 'grade2_curse', name: 'Проклятие 2 ранга', emoji: '🐲', hp: 220, maxHp: 220,
    attack: 55, defense: 30,
    skills: [eSkill('curse_wave', 'Волна проклятия', 45, 0, 'cursed'), eSkill('dark_fist', 'Тёмный кулак', 65, 20, 'cursed')],
    exp: 100, loot: [], description: 'Проклятие уровня B — требует чародея 2 ранга.'
  },
  grade1_curse: {
    id: 'grade1_curse', name: 'Проклятие 1 ранга', emoji: '🦠', hp: 320, maxHp: 320,
    attack: 72, defense: 45,
    skills: [eSkill('domain_pressure', 'Давление домена', 65, 0, 'cursed'), eSkill('curse_blast', 'Проклятый взрыв', 90, 30, 'cursed')],
    exp: 160, loot: [], description: 'Проклятие уровня A — смертельная угроза.'
  },
  special_grade_curse: {
    id: 'special_grade_curse', name: 'Проклятие особого ранга', emoji: '💀', hp: 480, maxHp: 480,
    attack: 95, defense: 60, isBoss: true,
    skills: [
      eSkill('soul_crush', 'Дробление души', 80, 0, 'cursed'),
      eSkill('domain_expansion', 'Расширение домена', 120, 50, 'domain'),
    ],
    exp: 300, loot: [], description: 'Редчайшее существо. Способно уничтожить целый город.'
  },
  rogue_sorcerer: {
    id: 'rogue_sorcerer', name: 'Чародей-отступник', emoji: '🧙', hp: 180, maxHp: 180,
    attack: 50, defense: 35,
    skills: [eSkill('curse_tech', 'Проклятая техника', 45, 10, 'cursed'), eSkill('barrier', 'Барьер', 30, 20, 'divine')],
    exp: 80, loot: [], description: 'Чародей, выбравший путь тьмы.'
  },
  jogo: {
    id: 'jogo', name: 'Джого', emoji: '🌋', hp: 600, maxHp: 600,
    attack: 110, defense: 70, isBoss: true,
    skills: [
      eSkill('ember_insects', 'Огненные насекомые', 90, 0, 'cursed'),
      eSkill('maximum_meteor', 'Максимум: Метеор', 160, 60, 'cursed'),
    ],
    exp: 500, loot: [], description: 'Особый проклятый дух — воплощение природной катастрофы.'
  },
  hanami: {
    id: 'hanami', name: 'Ханами', emoji: '🌸', hp: 550, maxHp: 550,
    attack: 100, defense: 80, isBoss: true,
    skills: [
      eSkill('wooden_limbs', 'Деревянные конечности', 80, 0, 'cursed'),
      eSkill('flower_domain', 'Цветочный домен', 140, 55, 'domain'),
    ],
    exp: 450, loot: [], description: 'Особый дух без глаз. Любит жизнь, ненавидит людей.'
  },
  choso_clone: {
    id: 'choso_clone', name: 'Теневой Чосо', emoji: '🩸', hp: 400, maxHp: 400,
    attack: 85, defense: 55, isBoss: true,
    skills: [
      eSkill('blood_shower', 'Кровавый ливень', 75, 0, 'blood'),
      eSkill('piercing_blood_max', 'Максимум: Пронизывающая кровь', 120, 45, 'blood'),
    ],
    exp: 350, loot: [], description: 'Кровяной дух — копия Чосо из прошлого.'
  },
  sukuna: {
    id: 'sukuna', name: 'Рёмэн Сукуна', emoji: '👑', hp: 1200, maxHp: 1200,
    attack: 150, defense: 100, isBoss: true,
    skills: [
      eSkill('dismantle', 'Разбор', 120, 0, 'void'),
      eSkill('cleave', 'Рассечение', 150, 40, 'void'),
      eSkill('malevolent_shrine', 'Храм злобы', 220, 80, 'domain'),
    ],
    exp: 1000, loot: [], description: 'Король проклятий. Величайшее существо за всю историю.'
  },
};

export const getEnemyById = (id: string): Enemy => {
  const base = ENEMIES[id];
  return { ...base, hp: base.maxHp, skills: base.skills.map(s => ({ ...s, currentCooldown: 0 })) };
};

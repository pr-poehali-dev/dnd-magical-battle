import { Character, Skill, DiceRoll, AbilityScores } from './types';
import { getProficiencyBonus, getModifier, XP_THRESHOLDS } from './dndUtils';

const d = (count: number, die: Skill['damageDice']['die'], modifier = 0): DiceRoll =>
  ({ count, die, modifier });

const sk = (
  id: string, name: string, description: string,
  dmg: DiceRoll, range: number, cost: Skill['actionCost'],
  energy: number, el: Skill['element'], lvl: number,
  opts: Partial<Skill> = {}
): Skill => ({
  id, name, description, damageDice: dmg, range,
  actionCost: cost, energyCost: energy, element: el,
  requiresLevel: lvl, isUltimate: lvl >= 7,
  cooldownRounds: opts.cooldownRounds ?? 0,
  currentCooldown: 0,
  ...opts,
});

const buildChar = (raw: {
  id: string; class: Character['class']; name: string; title: string;
  description: string; lore: string; passiveBonus: string;
  color: string; glowColor: string; spriteColor: string;
  hitDie: Skill['damageDice']['die']; hpPerLevel: number;
  scores: AbilityScores; speed: number;
  cursedEnergy: number;
  allSkills: Skill[];
}): Character => {
  const prof = getProficiencyBonus(1);
  const conMod = getModifier(raw.scores.con);
  const dexMod = getModifier(raw.scores.dex);
  // HP = hpPerLevel (fixed as per user spec, not random dice)
  const maxHp = raw.hpPerLevel; // level 1 HP
  return {
    id: raw.id, class: raw.class, name: raw.name, title: raw.title,
    description: raw.description, lore: raw.lore, passiveBonus: raw.passiveBonus,
    color: raw.color, glowColor: raw.glowColor, spriteColor: raw.spriteColor,
    hp: maxHp, maxHp, tempHp: 0,
    armorClass: 10 + dexMod,
    initiative: dexMod,
    speed: raw.speed,
    proficiencyBonus: prof,
    abilityScores: raw.scores,
    hitDice: { die: raw.hitDie, total: 1, used: 0 },
    cursedEnergy: raw.cursedEnergy, maxCursedEnergy: raw.cursedEnergy,
    level: 1, exp: 0, expToNext: XP_THRESHOLDS[1],
    allSkills: raw.allSkills,
    unlockedSkills: raw.allSkills.filter(s => s.requiresLevel <= 1),
    statusEffects: [],
    hasAction: true, hasBonusAction: true, hasReaction: true,
    movementLeft: raw.speed,
    deathSaves: { successes: 0, failures: 0 },
    isUnconscious: false, isDead: false,
    onTree: false,
    gridX: 2, gridY: 5,
  };
};

// ─── ИТАДОРИ ЮДЖИ (Vessel) ─────────────────────────────────────────────────
// 0 ячеек заклинаний (cursedEnergy = 0) — отдышка недоступна
// Все 4 способности открыты с 1 уровня
const VESSEL = buildChar({
  id: 'vessel', class: 'vessel',
  name: 'Итадори Юджи', title: 'Сосуд', color: '#EF4444', glowColor: '#FF6666', spriteColor: '#EF4444',
  description: 'Физически совершенный человек. Вместилище Рёмэн Сукуны.',
  lore: 'Поедатель проклятых объектов. Его тело — нерушимый сосуд для величайшего проклятия.',
  passiveBonus: 'Стальное тело: спасброски от смерти с преимуществом',
  hitDie: 'd6', hpPerLevel: 12,
  scores: { str: 18, dex: 16, con: 16, int: 10, wis: 12, cha: 14 },
  speed: 30,
  cursedEnergy: 0, // нет ячеек — отдышка недоступна
  allSkills: [
    sk('cursed_strikes', 'Cursed Strikes',
      'Серия проклятых ударов кулаком. Базовая атака ближнего боя.',
      d(1,'d4'), 5, 'action', 0, 'cursed', 1),
    sk('crushing_blow', 'Crushing Blow',
      'Мощный удар, вбивающий противника в землю.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),
    sk('divergent_fist', "Divergent's Fist",
      'Удар с задержкой проклятой энергии. При броске 18-20 на попадание — Чёрная Молния: урон 1к6 вместо 1к2. При крите — бросаются и 1к6, и 1к2.',
      d(1,'d2'), 5, 'action', 0, 'cursed', 1,
      { blackFlash: { damageDice: d(1,'d6') } }),
    sk('manji_kick', 'Manji Kick',
      'Реакция на ближнюю атаку противника. Перезарядка каждые 3 хода (в конце хода, когда не заряжена).',
      d(1,'d2'), 5, 'reaction', 0, 'physical', 1,
      { reactionTrigger: 'melee_attack_received', cooldownRounds: 3 }),
  ],
});

// ─── ГОДЖО САТОРУ (Honored One) ────────────────────────────────────────────
const HONORED_ONE = buildChar({
  id: 'honored_one', class: 'honored_one',
  name: 'Годжо Сатору', title: 'Почитаемый', color: '#06B6D4', glowColor: '#67E8F9', spriteColor: '#06B6D4',
  description: 'Сильнейший чародей. Шесть глаз и бесконечность.',
  lore: 'Бесконечность делает его неприкосновенным. Может уничтожить мир в одиночку.',
  passiveBonus: 'Бесконечность: 20% шанс отразить атаку до хода',
  hitDie: 'd6', hpPerLevel: 10,
  scores: { str: 12, dex: 18, con: 14, int: 20, wis: 18, cha: 20 },
  speed: 30, cursedEnergy: 8,
  allSkills: [
    sk('infinity_tap', 'Удар бесконечностью', 'Мягкий удар через бесконечность',
      d(1,'d4'), 5, 'action', 0, 'void', 1),
    sk('blue', 'Синий', 'Притяжение. Враги в 10 фут. притягиваются к точке.',
      d(1,'d6'), 30, 'action', 2, 'void', 1, { aoe: true, aoeRadius: 10 }),
    sk('red', 'Красный', 'Отталкивание. Взрывная волна 15 фут.',
      d(1,'d8'), 30, 'action', 2, 'divine', 2, { aoe: true, aoeRadius: 15 }),
    sk('hollow_purple', 'Пустотный пурпур', 'Луч стирает всё. Без броска на попадание.',
      d(3,'d6'), 60, 'action', 5, 'void', 5, { is100pct: true }),
  ],
});

// ─── МЕГУМИ (Ten Shadows) ──────────────────────────────────────────────────
const TEN_SHADOWS = buildChar({
  id: 'ten_shadows', class: 'ten_shadows',
  name: 'Фусигуро Мегуми', title: 'Десять теней', color: '#8B5CF6', glowColor: '#A78BFA', spriteColor: '#8B5CF6',
  description: 'Техника Десяти теней — призыв проклятых духов.',
  lore: 'Призывает Священных псов, Нуэ и неукрощаемого Маорагу.',
  passiveBonus: 'Тени: духи поглощают 1 ед. урона за хозяина (1 раз/раунд)',
  hitDie: 'd6', hpPerLevel: 10,
  scores: { str: 12, dex: 16, con: 14, int: 16, wis: 16, cha: 12 },
  speed: 30, cursedEnergy: 6,
  allSkills: [
    sk('shadow_strike', 'Удар из тени', 'Быстрый удар сквозь тень',
      d(1,'d4'), 5, 'action', 0, 'shadow', 1),
    sk('divine_dogs', 'Священные псы', 'Два духа-пса атакуют. Блид при попадании.',
      d(1,'d6'), 20, 'action', 2, 'shadow', 1,
      { statusEffect: { type: 'bleed', duration: 2, value: 1 } }),
    sk('nue', 'Нуэ', 'Удар молнии. Спасбросок Ловкости СЛ 14 — иначе оглушение.',
      d(1,'d8'), 30, 'action', 3, 'shadow', 3,
      { savingThrow: { stat: 'dex', dc: 14 }, statusEffect: { type: 'stun', duration: 1, value: 0 } }),
  ],
});

// ─── НАНАМИ (Salaryman) ────────────────────────────────────────────────────
const SALARYMAN = buildChar({
  id: 'salaryman', class: 'salaryman',
  name: 'Нанами Кенто', title: 'Офисный работник', color: '#10B981', glowColor: '#34D399', spriteColor: '#10B981',
  description: 'Техника соотношения 7:3. Точные удары по слабым точкам.',
  lore: 'Ненавидит сверхурочную работу. Но всегда доводит дело до конца.',
  passiveBonus: 'Сверхурочные: после 5-го раунда +1 к броскам урона',
  hitDie: 'd6', hpPerLevel: 12,
  scores: { str: 18, dex: 14, con: 16, int: 14, wis: 16, cha: 12 },
  speed: 30, cursedEnergy: 3,
  allSkills: [
    sk('blunt_strike', 'Удар дубиной', 'Простой удар рукояткой',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),
    sk('ratio_73', 'Соотношение 7:3', 'Точка слабого сочленения. -2 к КБ цели при расчёте.',
      d(1,'d6'), 5, 'action', 1, 'physical', 1),
    sk('collapse', 'Обрушение', 'Разрушает структуру тела. Блид 2 раунда.',
      d(1,'d8'), 5, 'action', 2, 'physical', 3,
      { statusEffect: { type: 'bleed', duration: 2, value: 2 } }),
  ],
});

// ─── ХАКАРИ (Gambler) ──────────────────────────────────────────────────────
const GAMBLER = buildChar({
  id: 'gambler', class: 'gambler',
  name: 'Хакари Кинто', title: 'Неугомонный игрок', color: '#F59E0B', glowColor: '#FCD34D', spriteColor: '#F59E0B',
  description: 'Пулевой клуб. Джекпот — временное бессмертие.',
  lore: 'Живёт ради кайфа. Техника раскрывается постепенно.',
  passiveBonus: 'Удача: при 18+ на d20 — следующий спасбросок с преимуществом',
  hitDie: 'd6', hpPerLevel: 12,
  scores: { str: 16, dex: 18, con: 16, int: 12, wis: 10, cha: 18 },
  speed: 30, cursedEnergy: 4,
  allSkills: [
    sk('pachinko', 'Выстрел патинко', 'Случайный шарик. 1-3: промах, 4-6: попадание.',
      d(1,'d6'), 20, 'action', 0, 'cursed', 1),
    sk('jackpot', 'Джекпот!', 'Бонусное действие: бросок d20. 15+ — следующая атака с преимуществом.',
      d(0,'d4',0), 0, 'bonus_action', 2, 'cursed', 1,
      { isHeal: false }),
    sk('ricochet', 'Рикошет', 'Шарик отскакивает до 2 раз. Бьёт разных врагов.',
      d(1,'d4'), 20, 'action', 2, 'cursed', 3),
  ],
});

// ─── ЧОСО (Blood Manipulator) ─────────────────────────────────────────────
const BLOOD_MANIPULATOR = buildChar({
  id: 'blood_manipulator', class: 'blood_manipulator',
  name: 'Камо Чосо', title: 'Манипулятор крови', color: '#DC2626', glowColor: '#F87171', spriteColor: '#DC2626',
  description: 'Получеловек. Кровь — его оружие и броня.',
  lore: 'Брат Юджи по крови Сукуны. Его любовь к братьям сильнее смерти.',
  passiveBonus: 'Кровь: 5 HP → +3 КБ (реакция)',
  hitDie: 'd6', hpPerLevel: 12,
  scores: { str: 16, dex: 14, con: 18, int: 12, wis: 12, cha: 10 },
  speed: 30, cursedEnergy: 4,
  allSkills: [
    sk('blood_blade', 'Кровяной клинок', 'Клинок из уплотнённой крови',
      d(1,'d4'), 10, 'action', 0, 'blood', 1),
    sk('piercing_blood', 'Пронизывающая кровь', 'Снаряд из крови. Игнорирует половину КБ.',
      d(1,'d6'), 30, 'action', 1, 'blood', 1),
    sk('supernova', 'Сверхновая', 'Взрыв шаров. Все в 15 фут. Спасбросок Ловкости СЛ 14.',
      d(1,'d8'), 15, 'action', 3, 'blood', 3,
      { aoe: true, aoeRadius: 15, savingThrow: { stat: 'dex', dc: 14 },
        statusEffect: { type: 'bleed', duration: 2, value: 2 } }),
  ],
});

export const CHARACTERS: Character[] = [
  VESSEL, HONORED_ONE, TEN_SHADOWS, SALARYMAN, GAMBLER, BLOOD_MANIPULATOR,
];

export const getCharacterById = (id: string) => CHARACTERS.find(c => c.id === id);

export const applyLevelUp = (char: Character): Character => {
  const newLevel = Math.min(char.level + 1, 10);
  const prof = getProficiencyBonus(newLevel);
  // HP per level as per spec (e.g. vessel = 6 per level after 1)
  const hpPerLevelMap: Record<string, number> = {
    vessel: 6, honored_one: 5, ten_shadows: 5, salaryman: 6,
    gambler: 6, blood_manipulator: 6,
  };
  const hpGain = hpPerLevelMap[char.class] ?? 5;
  const newMaxHp = char.maxHp + hpGain;
  const newUnlocked = char.allSkills.filter(s => s.requiresLevel <= newLevel);
  const newMaxCE = char.maxCursedEnergy + 1;
  return {
    ...char,
    level: newLevel,
    maxHp: newMaxHp,
    hp: newMaxHp,
    proficiencyBonus: prof,
    cursedEnergy: newMaxCE,
    maxCursedEnergy: newMaxCE,
    unlockedSkills: newUnlocked,
    exp: char.exp - char.expToNext,
    expToNext: newLevel < 10 ? XP_THRESHOLDS[newLevel] - XP_THRESHOLDS[newLevel - 1] : 999999,
  };
};
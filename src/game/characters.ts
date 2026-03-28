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
  const dexMod = getModifier(raw.scores.dex);
  const maxHp = raw.hpPerLevel;
  return {
    id: raw.id, class: raw.class, name: raw.name, title: raw.title,
    description: raw.description, lore: raw.lore, passiveBonus: raw.passiveBonus,
    color: raw.color, glowColor: raw.glowColor, spriteColor: raw.spriteColor,
    hp: maxHp, maxHp, tempHp: 0,
    armorClass: 10,
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
// СИЛ 16 | ЛОВ 14 | ТЕЛ 18 | ИНТ 8 | МУД 10 | ХАР 12
const VESSEL = buildChar({
  id: 'vessel', class: 'vessel',
  name: 'Итадори Юджи', title: 'Сосуд', color: '#EF4444', glowColor: '#FF6666', spriteColor: '#EF4444',
  description: 'Физически совершенный человек. Вместилище Рёмэн Сукуны.',
  lore: 'Поедатель проклятых объектов. Его тело — нерушимый сосуд для величайшего проклятия.',
  passiveBonus: 'Стальное тело: спасброски от смерти с преимуществом',
  hitDie: 'd8', hpPerLevel: 12,
  scores: { str: 16, dex: 14, con: 18, int: 8, wis: 10, cha: 12 },
  speed: 30,
  cursedEnergy: 0,
  allSkills: [
    // 1. Cursed Strikes — серия ударов, движет обоих вперёд на 1 клетку
    sk('cursed_strikes', 'Cursed Strikes',
      'Серия ударов кулаком с проклятой энергией. Толкает противника на 1 клетку вперёд.',
      d(1,'d4'), 5, 'action', 0, 'cursed', 1),

    // 2. Crushing Blow — удар сверху вниз, вбивает врага в землю
    sk('crushing_blow', 'Crushing Blow',
      'Мощный удар сверху вниз, вбивающий врага в землю.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),

    // 3. Divergent's Fist — задержка проклятой энергии, Чёрная Молния на 18-20
    sk('divergent_fist', "Divergent's Fist",
      'Удар с задержкой проклятой энергии. При броске 18-20 — Чёрная Молния: 1к6 вместо 1к2.',
      d(1,'d2'), 5, 'action', 0, 'cursed', 1,
      { blackFlash: { damageDice: d(1,'d6') } }),

    // 4. Manji Kick — реакция на БЛИЖНЮЮ атаку противника, уклонение + контратака
    sk('manji_kick', 'Manji Kick',
      'Реакция на ближнюю атаку — уклонение и контратака. Урон по Итадори отменяется.',
      d(1,'d4'), 5, 'reaction', 0, 'physical', 1,
      { reactionTrigger: 'melee_attack_received', cooldownRounds: 0 }),
  ],
});

// ─── ГОДЖО САТОРУ (Honored One) ────────────────────────────────────────────
// СИЛ 10 | ЛОВ 16 | ТЕЛ 12 | ИНТ 18 | МУД 14 | ХАР 20
const HONORED_ONE = buildChar({
  id: 'honored_one', class: 'honored_one',
  name: 'Годжо Сатору', title: 'Почитаемый', color: '#06B6D4', glowColor: '#67E8F9', spriteColor: '#06B6D4',
  description: 'Сильнейший чародей. Шесть глаз и бесконечность.',
  lore: 'Бесконечность делает его неприкосновенным. Может уничтожить мир в одиночку.',
  passiveBonus: 'Бесконечность: 20% шанс полного отражения входящего урона',
  hitDie: 'd8', hpPerLevel: 8,
  scores: { str: 10, dex: 16, con: 12, int: 18, wis: 14, cha: 20 },
  speed: 30, cursedEnergy: 3,
  allSkills: [
    // 1. Lapse Blue — притягивает врага, бьёт ногой, игрок выбирает куда отбросить; дальность 35 ft
    sk('lapse_blue', 'Lapse Blue',
      '100% попадание. Синяя волна: притягивает врага к Годжо, Годжо бьёт его ногой и ты выбираешь куда отбросить. Дальность 35 фут. Спасбросок ТЕЛ СЛ10.',
      d(1,'d4'), 35, 'action', 1, 'void', 1,
      { savingThrow: { stat: 'con', dc: 10 }, cooldownRounds: 0 }),

    // 2. Reversal Red — красный шарик летит в точку, взрыв радиус 2 кл, откидывает на 5 ft; дальность 35 ft
    sk('reversal_red', 'Reversal Red',
      '100% попадание. Красный шарик летит в выбранную точку — взрыв радиусом 2 кл. Откидывает врагов на 5 футов от центра взрыва. Ломает деревья. Дальность 35 фут.',
      d(1,'d4'), 35, 'action', 1, 'cursed', 1,
      { aoe: true, aoeRadius: 2, savingThrow: { stat: 'dex', dc: 10 }, cooldownRounds: 0 }),

    // 3. Rapid Punches — серия ударов, каждый толкает врага на 5 ft, если возможно
    sk('gojo_rapid_punches', 'Rapid Punches',
      'Серия быстрых ударов. Годжо движется в сторону атаки, толкая врага на 5 футов.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),

    // 4. Twofold Kick — подбрасывает врага вверх
    sk('gojo_twofold_kick', 'Twofold Kick',
      'Мощный удар ногой, подбрасывающий врага в воздух.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),

    // 5. Infinity Step (R) — телепортация бонусным действием; не наносит урон сам по себе
    // Используется как комбо +R после атак (добавляет 1к2 доп. урона)
    sk('gojo_blink', 'Infinity Step',
      'Мгновенная телепортация к цели (до 5 клеток). Используй как +R после атаки за бонусное действие — ещё один бросок на попадание, при успехе 1к2 доп. урона.',
      d(1,'d2'), 25, 'bonus_action', 0, 'void', 1,
      { cooldownRounds: 0 }),
  ],
});

export const CHARACTERS: Character[] = [VESSEL, HONORED_ONE];

export function applyLevelUp(char: Character): Character {
  const newLevel = char.level + 1;
  const prof = getProficiencyBonus(newLevel);
  const conMod = getModifier(char.abilityScores.con);
  const hpGain = (char.hitDice.die === 'd8' ? 5 : 4) + conMod;
  const newMaxHp = char.maxHp + hpGain;
  const newMaxCE = char.maxCursedEnergy + (char.maxCursedEnergy > 0 ? 1 : 0);
  const newUnlocked = char.allSkills.filter(s => s.requiresLevel <= newLevel);
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
}

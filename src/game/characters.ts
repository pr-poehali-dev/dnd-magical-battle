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
    armorClass: 10, // КД 10 для всех
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
const VESSEL = buildChar({
  id: 'vessel', class: 'vessel',
  name: 'Итадори Юджи', title: 'Сосуд', color: '#EF4444', glowColor: '#FF6666', spriteColor: '#EF4444',
  description: 'Физически совершенный человек. Вместилище Рёмэн Сукуны.',
  lore: 'Поедатель проклятых объектов. Его тело — нерушимый сосуд для величайшего проклятия.',
  passiveBonus: 'Стальное тело: спасброски от смерти с преимуществом',
  hitDie: 'd8', hpPerLevel: 12,
  scores: { str: 18, dex: 16, con: 16, int: 10, wis: 12, cha: 14 },
  speed: 30,
  cursedEnergy: 0,
  allSkills: [
    sk('rapid_punches', 'Rapid Punches',
      'Серия быстрых ударов кулаком ближнего боя.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),
    sk('twofold_kick', 'Twofold Kick',
      'Мощный сдвоенный удар ногой.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),
    sk('divergent_fist', "Divergent's Fist",
      'Удар с задержкой проклятой энергии. При броске 18-20 — Чёрная Молния: 1к6 вместо 1к2.',
      d(1,'d2'), 5, 'action', 0, 'cursed', 1,
      { blackFlash: { damageDice: d(1,'d6') } }),
    sk('manji_kick', 'Manji Kick',
      'Реакция на ближнюю атаку противника — уклонение + контратака. КД 3 хода.',
      d(1,'d2'), 5, 'reaction', 0, 'physical', 1,
      { reactionTrigger: 'melee_attack_received', cooldownRounds: 3 }),
  ],
});

// ─── ГОДЖО САТОРУ (Honored One) ────────────────────────────────────────────
// Спец. скилл (R) — телепортация бонусным действием до 5 клеток к цели
const HONORED_ONE = buildChar({
  id: 'honored_one', class: 'honored_one',
  name: 'Годжо Сатору', title: 'Почитаемый', color: '#06B6D4', glowColor: '#67E8F9', spriteColor: '#06B6D4',
  description: 'Сильнейший чародей. Шесть глаз и бесконечность.',
  lore: 'Бесконечность делает его неприкосновенным. Может уничтожить мир в одиночку.',
  passiveBonus: 'Бесконечность: 20% шанс полного отражения входящего урона',
  hitDie: 'd8', hpPerLevel: 8,
  scores: { str: 12, dex: 18, con: 14, int: 20, wis: 18, cha: 20 },
  speed: 30, cursedEnergy: 3,
  allSkills: [
    // 1. Lapse Blue — притягивает врага до 5 клеток, бьёт и отбрасывает на 5 клеток; Спасбросок Тел СЛ10
    sk('lapse_blue', 'Lapse Blue',
      'Синяя волна притяжения. Враг притягивается, получает урон и отбрасывается на 5 клеток. Спасбросок телосложения СЛ10 (половина урона при успехе). +R: бонусным действием телепортируйся к летящему врагу и добей ногой.',
      d(1,'d4'), 25, 'action', 1, 'void', 1,
      { savingThrow: { stat: 'con', dc: 10 }, cooldownRounds: 0 }),

    // 2. Reversal Red — взрыв радиусом 2 клетки до 5 клеток; Спасбросок Лов СЛ10
    sk('reversal_red', 'Reversal Red',
      'Красный снаряд отталкивания. Летит до 5 клеток, взрывается радиусом 2 клетки. Спасбросок ловкости СЛ10 (половина урона при успехе).',
      d(1,'d4'), 25, 'action', 1, 'cursed', 1,
      { aoe: true, aoeRadius: 2, savingThrow: { stat: 'dex', dc: 10 }, cooldownRounds: 0 }),

    // 3. Rapid Punches — ближний бой
    sk('gojo_rapid_punches', 'Rapid Punches',
      'Серия быстрых ударов вблизи.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),

    // 4. Twofold Kick — мощный удар ногой
    sk('gojo_twofold_kick', 'Twofold Kick',
      'Мощный удар ногой.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),

    // 5. Special (R) — телепортация бонусным действием к цели в 5 клетках
    sk('gojo_blink', 'Infinity Step',
      'Реакция/Бонус: мгновенная телепортация к цели (до 5 клеток). Используй как "+R" при атаке для дополнительного броска 1к2.',
      d(1,'d2'), 25, 'bonus_action', 0, 'void', 1,
      { reactionTrigger: undefined, cooldownRounds: 0 }),
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

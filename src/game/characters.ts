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
const VESSEL = buildChar({
  id: 'vessel', class: 'vessel',
  name: 'Итадори Юджи', title: 'Сосуд', color: '#EF4444', glowColor: '#FF6666', spriteColor: '#EF4444',
  description: 'Физически совершенный человек. Вместилище Рёмэн Сукуны.',
  lore: 'Поедатель проклятых объектов. Его тело — нерушимый сосуд для величайшего проклятия.',
  passiveBonus: 'Стальное тело: спасброски от смерти с преимуществом. Острая энергия: безоружные атаки наносят 1к2 вместо 1.',
  hitDie: 'd8', hpPerLevel: 12,
  scores: { str: 16, dex: 14, con: 18, int: 8, wis: 10, cha: 12 },
  speed: 30,
  cursedEnergy: 0,
  allSkills: [
    sk('cursed_strikes', 'Cursed Strikes',
      'Серия ударов кулаком с проклятой энергией. Толкает противника на 1 клетку вперёд.',
      d(1,'d4'), 5, 'action', 0, 'cursed', 1),
    sk('crushing_blow', 'Crushing Blow',
      'Мощный удар сверху вниз, вбивающий врага в землю.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),
    sk('divergent_fist', "Divergent's Fist",
      'Удар с задержкой проклятой энергии. При броске 18-20 — Чёрная Молния: 1к6 вместо 1к2.',
      d(1,'d2'), 5, 'action', 0, 'cursed', 1,
      { blackFlash: { damageDice: d(1,'d6') } }),
    sk('manji_kick', 'Manji Kick',
      'Реакция на ближнюю атаку — уклонение и контратака. Урон по Итадори отменяется.',
      d(1,'d4'), 5, 'reaction', 0, 'physical', 1,
      { reactionTrigger: 'melee_attack_received', cooldownRounds: 0 }),
    sk('unarmed_itadori', 'Безоружный удар',
      'Простой удар кулаком. Особенность: наносит 1к2 (Острая энергия).',
      d(1,'d2'), 5, 'action', 0, 'physical', 1),
  ],
});

// ─── ГОДЖО САТОРУ (Honored One) ────────────────────────────────────────────
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
    sk('lapse_blue', 'Lapse Blue',
      '100% попадание. Синяя волна: притягивает врага к Годжо, бьёт ногой и игрок выбирает куда отбросить. Дальность 35 фут. Спасбросок ТЕЛ СЛ10.',
      d(1,'d4'), 35, 'action', 1, 'void', 1,
      { savingThrow: { stat: 'con', dc: 10 }, cooldownRounds: 0 }),
    sk('reversal_red', 'Reversal Red',
      '100% попадание. Красный шарик летит к цели (25 фут), взрыв откидывает врагов на 5 футов. Дальность 25 фут.',
      d(1,'d4'), 25, 'action', 1, 'cursed', 1,
      { aoe: true, aoeRadius: 2, savingThrow: { stat: 'dex', dc: 10 }, cooldownRounds: 0 }),
    sk('gojo_rapid_punches', 'Rapid Punches',
      'Серия быстрых ударов. Годжо движется в сторону атаки, толкая врага на 5 футов.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),
    sk('gojo_twofold_kick', 'Twofold Kick',
      'Мощный удар ногой, подбрасывающий врага в воздух.',
      d(1,'d4'), 5, 'action', 0, 'physical', 1),
    sk('gojo_blink', 'Infinity Step',
      'Мгновенная телепортация к цели (до 5 клеток). Используй как +R после атаки — ещё бросок на попадание, при успехе 1к2 доп. урона.',
      d(1,'d2'), 25, 'bonus_action', 0, 'void', 1,
      { cooldownRounds: 0 }),
    sk('unarmed_gojo', 'Безоружный удар',
      'Простой удар кулаком. Урон 1.',
      d(1,'d2'), 5, 'action', 0, 'physical', 1),
  ],
});

// ─── ХАКАРИ КИНТО (Restless Gambler) ──────────────────────────────────────
// СИЛ 14 | ЛОВ 16 | ТЕЛ 14 | ИНТ 10 | МУД 8 | ХАР 16
const GAMBLER = buildChar({
  id: 'gambler', class: 'gambler',
  name: 'Хакари Кинто', title: 'Неугомонный Игрок', color: '#22c55e', glowColor: '#4ade80', spriteColor: '#22c55e',
  description: 'Экстравагантный боец с непредсказуемой техникой. Джекпот решает всё.',
  lore: 'Его проклятая техника — азартная игра. Если выпадает джекпот — он бессмертен. До этого момента — просто очень опасный парень.',
  passiveBonus: 'Острая энергия: безоружные атаки наносят 1к2. Изменение вероятностей (бонусное действие): бросить к20 → это новый КБ до следующего хода; или к2 → 1=−1HP/2=+1HP; или к2 → 1=помеха на 1 атаку/2=преимущество на 1 атаку.',
  hitDie: 'd8', hpPerLevel: 9,
  scores: { str: 14, dex: 16, con: 14, int: 10, wis: 8, cha: 16 },
  speed: 30, cursedEnergy: 4,
  allSkills: [
    // 1. Reserve Balls — дальняя атака шариком
    sk('reserve_balls', 'Reserve Balls',
      'Бросает шарик по прямой (50 фут). При попадании 1к4 урона. Если цель в 5 футах — бросок с помехой, но урон 1к6.',
      d(1,'d4'), 50, 'action', 1, 'cursed', 1, { cooldownRounds: 0 }),
    // 2. Shutted Doors — двери схлопываются
    sk('shutted_doors', 'Shutted Doors',
      'Горизонтальные двери схлопываются вокруг цели (10 фут). 1к2 урона. Спасбросок ТЕЛ СЛ12: при провале полный урон + лишается реакции.',
      d(1,'d2'), 10, 'action', 1, 'cursed', 1,
      { savingThrow: { stat: 'con', dc: 12 }, cooldownRounds: 0,
        statusEffect: { type: 'no_movement', duration: 1, value: 0 } }),
    // 3. Rough Energy — откидывающий удар 25ft с зелёной энергией
    sk('rough_energy', 'Rough Energy',
      'Мощный замах с зелёной энергией, откидывающий врага на 25 футов от тебя.',
      d(1,'d2'), 5, 'action', 1, 'cursed', 1, { cooldownRounds: 0 }),
    // 4. Fever Breaker — создаёт двери сзади цели и пробивает насквозь
    sk('fever_breaker', 'Fever Breaker',
      'Создаёт двери сзади цели, пробивает их насквозь — Хакари летит 10 клеток вперёд, цель отлетает на 25 футов.',
      d(1,'d2'), 5, 'action', 1, 'cursed', 1, { cooldownRounds: 0 }),
    // 5. Изменение вероятностей (free bonus action)
    sk('probability_shift', 'Изменение вероятностей',
      'Бонусное действие (бесплатно). Выбери: 1) к20 → новый КБ до следующего хода; 2) к2 → ±1 HP; 3) к2 → преимущество или помеха на 1 атаку.',
      d(1,'d2'), 0, 'bonus_action', 0, 'void', 1,
      { is100pct: true, cooldownRounds: 0 }),
    // 6. Безоружный удар
    sk('unarmed_gambler', 'Безоружный удар',
      'Удар кулаком. Острая энергия: 1к2 урона.',
      d(1,'d2'), 5, 'action', 0, 'physical', 1),
  ],
});

export const CHARACTERS: Character[] = [VESSEL, HONORED_ONE, GAMBLER];

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

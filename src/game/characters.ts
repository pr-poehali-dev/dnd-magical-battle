import { Character, Skill, AbilityScores, DiceRoll } from './types';
import { getProficiencyBonus, getModifier, XP_THRESHOLDS } from './dndUtils';

// Helper to build a skill
const skill = (
  id: string, name: string, description: string,
  damageDice: DiceRoll, range: number,
  actionCost: Skill['actionCost'], energyCost: number,
  element: Skill['element'], requiresLevel: number,
  opts: Partial<Skill> = {}
): Skill => ({
  id, name, description, damageDice, range, actionCost, energyCost, element, requiresLevel,
  isUltimate: requiresLevel >= 9,
  cooldownRounds: requiresLevel >= 9 ? 3 : requiresLevel >= 5 ? 2 : 0,
  currentCooldown: 0,
  ...opts,
});

const d = (count: number, die: Skill['damageDice']['die'], modifier = 0): DiceRoll => ({ count, die, modifier });

// Derived stats from ability scores
const deriveStats = (scores: AbilityScores, level: number, hitDie: Skill['damageDice']['die']) => {
  const conMod = getModifier(scores.con);
  const dexMod = getModifier(scores.dex);
  const prof = getProficiencyBonus(level);
  // HP: max at level 1, average roll at higher levels
  const dieSides = { d6: 6, d8: 8, d10: 10, d12: 12, d4: 4, d20: 20 };
  const sides = dieSides[hitDie];
  const avgRoll = Math.floor(sides / 2) + 1;
  const maxHp = sides + conMod + (level - 1) * (avgRoll + conMod);
  return {
    maxHp: Math.max(1, maxHp),
    armorClass: 10 + dexMod,
    initiative: dexMod,
    proficiencyBonus: prof,
  };
};

// Unlock skills by level
const getUnlocked = (all: Skill[], level: number) =>
  all.filter(s => s.requiresLevel <= level);

const buildChar = (base: Omit<Character, 'hp' | 'maxHp' | 'armorClass' | 'initiative' | 'proficiencyBonus' | 'unlockedSkills' | 'tempHp' | 'deathSaves' | 'gridX' | 'gridY' | 'exp' | 'expToNext'>): Character => {
  const { abilityScores, level, hitDice, allSkills } = base;
  const derived = deriveStats(abilityScores, level, hitDice.die);
  return {
    ...base,
    ...derived,
    hp: derived.maxHp,
    tempHp: 0,
    exp: 0,
    expToNext: XP_THRESHOLDS[1], // 300 xp to level 2
    deathSaves: { successes: 0, failures: 0 },
    unlockedSkills: getUnlocked(allSkills, level),
    gridX: 2,
    gridY: 3,
  };
};

export const CHARACTERS: Character[] = [

  // ── ИТАДОРИ ЮДЖИ ──────────────────────────────────────────
  buildChar({
    id: 'vessel', class: 'vessel',
    name: 'Итадори Юджи', title: 'Сосуд', emoji: '👊',
    color: '#FF6B6B', glowColor: '#FF0000',
    description: 'Физически совершенный человек — вместилище Рёмэн Сукуны.',
    lore: 'Поедатель проклятых объектов. Его тело — нерушимый сосуд для величайшего проклятия.',
    passiveBonus: 'Стальное тело: при провале спасброска от смерти получает 1 успех автоматически',
    hitDice: { die: 'd10', total: 1, used: 0 },
    abilityScores: { str: 20, dex: 16, con: 18, int: 10, wis: 12, cha: 14 },
    level: 1, cursedEnergy: 4, maxCursedEnergy: 4, speed: 35,
    comboPairs: ['switcher'],
    allSkills: [
      skill('strike', 'Удар кулаком', 'Мощный физический удар', d(1,'d8',3), 5, 'action', 0, 'physical', 1),
      skill('divergent_fist', 'Дивергентный кулак',
        'Удар с задержкой проклятой энергии. Вторичная волна наносит доп. урон.',
        d(2,'d6',4), 5, 'action', 1, 'cursed', 1,
        { statusEffect: { type: 'weakened', duration: 1, value: 2 } }),
      skill('rush', 'Рывок', 'Передвижься до 15 футов и атакуй — бонусным действием',
        d(1,'d6',3), 5, 'bonus_action', 0, 'physical', 2),
      skill('black_flash', 'Чёрная вспышка',
        'Концентрация проклятой энергии в момент удара. Бросай урон дважды — берёшь больший.',
        d(3,'d8',5), 5, 'action', 2, 'cursed', 3,
        { savingThrow: { stat: 'con', dc: 14 } }),
      skill('divergent_rush', 'Дивергентный рывок',
        'Серия ударов: атакуй 3 цели или бей одного трижды.',
        d(2,'d6',3), 5, 'action', 2, 'cursed', 5),
      skill('soul_punch', 'Удар по душе',
        'Атака проникает сквозь броню — игнорирует КБ, спасбросок Телосложения СЛ 15 или оглушение.',
        d(3,'d10',4), 5, 'action', 3, 'cursed', 7,
        { savingThrow: { stat: 'con', dc: 15 }, statusEffect: { type: 'stun', duration: 1, value: 0 } }),
      skill('sukuna_slash', 'Разрез Сукуны',
        'Сукуна ненадолго берёт контроль. Атака задевает всех в радиусе 10 фут.',
        d(6,'d10',8), 10, 'action', 4, 'void', 9,
        { aoe: true, aoeRadius: 10, isUltimate: true,
          statusEffect: { type: 'curse', duration: 2, value: 8 } }),
    ],
  }),

  // ── ГОДЖО САТОРУ ──────────────────────────────────────────
  buildChar({
    id: 'honored_one', class: 'honored_one',
    name: 'Годжо Сатору', title: 'Почитаемый', emoji: '♾️',
    color: '#00D4FF', glowColor: '#00FFFF',
    description: 'Сильнейший чародей современности. Шесть глаз и бесконечность.',
    lore: 'Бесконечность делает его неприкосновенным. Говорят — он мог бы уничтожить мир.',
    passiveBonus: 'Бесконечность: в начале каждого хода 20% шанс автоматически отразить следующую атаку врага',
    hitDice: { die: 'd8', total: 1, used: 0 },
    abilityScores: { str: 14, dex: 18, con: 16, int: 20, wis: 18, cha: 20 },
    level: 1, cursedEnergy: 10, maxCursedEnergy: 10, speed: 30,
    allSkills: [
      skill('infinity_push', 'Отталкивание бесконечности',
        'Лёгкая атака — выталкивает врага на 10 фут.',
        d(1,'d6',4), 15, 'action', 1, 'void', 1),
      skill('blue', 'Синий — притяжение',
        'Создаёт зону отрицательной массы. Все в 15 фут. притягиваются к центру.',
        d(2,'d8',4), 60, 'action', 2, 'void', 1,
        { aoe: true, aoeRadius: 15 }),
      skill('red', 'Красный — отталкивание',
        'Обратный метод. Взрывная волна отбрасывает врага на 20 фут. Спасбросок Телосложения СЛ 16.',
        d(3,'d8',5), 60, 'action', 2, 'divine', 3,
        { savingThrow: { stat: 'con', dc: 16 } }),
      skill('domain_amplify', 'Усиление бесконечностью',
        'Бонусное действие — все техники до конца хода получают +2d6 урона.',
        d(2,'d6',0), 0, 'bonus_action', 2, 'void', 5,
        { statusEffect: { type: 'empowered', duration: 1, value: 12 }, isHeal: false }),
      skill('blue_red_combo', 'Синий + Красный: взрыв',
        'Мгновенно применяет обе техники. Колоссальный взрыв: 4d10 всем в 20 фут.',
        d(4,'d10',6), 20, 'action', 4, 'void', 7,
        { aoe: true, aoeRadius: 20 }),
      skill('hollow_purple', 'Пустотный пурпур',
        'Абсолютное слияние. Луч стирает всё на пути. Непреодолимый — спасброска нет.',
        d(8,'d10',10), 120, 'action', 6, 'void', 9,
        { isUltimate: true, aoe: false }),
    ],
  }),

  // ── ХАКАРИ КИНТО ──────────────────────────────────────────
  buildChar({
    id: 'gambler', class: 'gambler',
    name: 'Хакари Кинто', title: 'Неугомонный игрок', emoji: '🎰',
    color: '#FFD700', glowColor: '#FFA500',
    description: 'Чародей с техникой Пулевого клуба. Джекпот = бессмертие.',
    lore: 'Живёт ради кайфа. Его техника накапливается — и взрывается.',
    passiveBonus: 'Удача: при броске 18+ на d20 — один спасбросок смерти автоматически успешен',
    hitDice: { die: 'd10', total: 1, used: 0 },
    abilityScores: { str: 16, dex: 18, con: 16, int: 12, wis: 10, cha: 18 },
    level: 1, cursedEnergy: 6, maxCursedEnergy: 6, speed: 30,
    allSkills: [
      skill('pachinko', 'Выстрел патинко',
        'Проклятые шарики в случайном направлении. Бросок d6: 1-2 промах, 3-6 попадание.',
        d(1,'d8',2), 30, 'action', 0, 'cursed', 1),
      skill('jackpot_probe', 'Прощупать удачу',
        'Бонусное действие: бросок d20. 15+ — следующая атака с преимуществом.',
        d(0,'d4',0), 0, 'bonus_action', 0, 'cursed', 1),
      skill('ricochet', 'Рикошет',
        'Шарик отскакивает между целями до 3 раз. Каждый отскок -1d4 урона.',
        d(3,'d6',2), 30, 'action', 2, 'cursed', 3),
      skill('jackpot', 'Джекпот!',
        'Активация техники! Бросок d20: 10+ — исцеляешься на 2d8 и следующая атака с преимуществом.',
        d(2,'d8',0), 0, 'bonus_action', 3, 'cursed', 5,
        { isHeal: true, statusEffect: { type: 'empowered', duration: 2, value: 10 } }),
      skill('death_loop', 'Петля смерти',
        'Если HP упадёт до 0 в этот ход — вместо этого восстанови 3d6 HP (1 раз в бой).',
        d(3,'d6',0), 0, 'reaction', 3, 'cursed', 7,
        { isHeal: true }),
      skill('domain_lottery', 'Домен: Пулевой клуб',
        'Полное раскрытие. Все враги делают спасброски Ловкости СЛ 16 каждый ход иначе 4d8 урона.',
        d(4,'d8',6), 60, 'action', 6, 'domain', 9,
        { isUltimate: true, aoe: true, aoeRadius: 60, savingThrow: { stat: 'dex', dc: 16 } }),
    ],
  }),

  // ── ФУСИГУРО МЕГУМИ ──────────────────────────────────────
  buildChar({
    id: 'ten_shadows', class: 'ten_shadows',
    name: 'Фусигуро Мегуми', title: 'Десять теней', emoji: '🐉',
    color: '#9B59B6', glowColor: '#6C3483',
    description: 'Техника Десяти теней — призыв проклятых духов через тени.',
    lore: 'Призывает Восьмидесятиногого, Жабу, Нуэ и непобедимого Маорагу.',
    passiveBonus: 'Хранитель теней: духи поглощают 1d4 урона за тебя (1 раз в раунд)',
    hitDice: { die: 'd8', total: 1, used: 0 },
    abilityScores: { str: 12, dex: 16, con: 14, int: 16, wis: 16, cha: 12 },
    level: 1, cursedEnergy: 8, maxCursedEnergy: 8, speed: 30,
    allSkills: [
      skill('shadow_strike', 'Удар тени',
        'Из тени наносит быстрый удар. Не требует видимости.',
        d(1,'d6',3), 10, 'action', 0, 'shadow', 1),
      skill('divine_dogs', 'Священные псы',
        'Два духа-пса атакуют цель. Бросай урон дважды. Если оба попали — блeed.',
        d(2,'d6',3), 30, 'action', 2, 'shadow', 1,
        { statusEffect: { type: 'bleed', duration: 2, value: 4 } }),
      skill('toad_bind', 'Жаба: захват',
        'Призванная жаба захватывает врага. Спасбросок Силы СЛ 14 или grappled 2 раунда.',
        d(1,'d8',2), 20, 'action', 2, 'shadow', 3,
        { savingThrow: { stat: 'str', dc: 14 }, statusEffect: { type: 'grappled', duration: 2, value: 0 } }),
      skill('nue_lightning', 'Нуэ: удар молнии',
        'Крылатый дух пронзает молнией. Цель делает спасбросок Ловкости СЛ 15 — урон пополам.',
        d(3,'d8',4), 60, 'action', 3, 'shadow', 5,
        { savingThrow: { stat: 'dex', dc: 15 }, statusEffect: { type: 'stun', duration: 1, value: 0 } }),
      skill('chimera_shadow', 'Химерная тень',
        'Объединяет двух духов — создаёт химеру. Атакует дважды в ход как реакция.',
        d(3,'d8',5), 15, 'action', 4, 'shadow', 7),
      skill('mahoraga', 'Восемь рукоятей — Маорага',
        'Призыв неукрощаемого духа. Адаптируется к каждой атаке: каждый раунд +1 к КБ.',
        d(5,'d10',8), 10, 'action', 6, 'domain', 9,
        { isUltimate: true, aoe: true, aoeRadius: 10 }),
    ],
  }),

  // ── МАХИТО ────────────────────────────────────────────────
  buildChar({
    id: 'perfection', class: 'perfection',
    name: 'Махито', title: 'Воплощение', emoji: '🔮',
    color: '#00FF88', glowColor: '#00CC66',
    description: 'Проклятый дух ненависти. Праздная трансформация — изменение душ.',
    lore: 'Считает людей просто телами для экспериментов. Воплощение человеческой ненависти.',
    passiveBonus: 'Трансформация: каждая атака снижает КБ врага на 1 до конца боя',
    hitDice: { die: 'd8', total: 1, used: 0 },
    abilityScores: { str: 14, dex: 18, con: 14, int: 18, wis: 14, cha: 16 },
    level: 1, cursedEnergy: 9, maxCursedEnergy: 9, speed: 30,
    allSkills: [
      skill('soul_touch', 'Касание души',
        'Прикосновение искажает форму тела. Спасбросок Мудрости СЛ 13.',
        d(1,'d8',2), 5, 'action', 1, 'cursed', 1,
        { savingThrow: { stat: 'wis', dc: 13 }, statusEffect: { type: 'weakened', duration: 2, value: 3 } }),
      skill('body_repel', 'Взрыв формы',
        'Моментально деформирует часть тела — взрыв изнутри.',
        d(2,'d8',3), 5, 'action', 2, 'cursed', 1),
      skill('reshape', 'Переформирование',
        'Бонусное действие: восстанавливает 1d8+3 HP — перестраивает собственное тело.',
        d(1,'d8',3), 0, 'bonus_action', 2, 'cursed', 3,
        { isHeal: true }),
      skill('transfigure_army', 'Армия трансформаций',
        'Создаёт 3 деформированных тела. Каждое атакует как бонусное действие (1d4+2).',
        d(1,'d4',2), 15, 'action', 3, 'cursed', 5,
        { aoe: false }),
      skill('self_embodiment', 'Самовоплощение',
        'Полная трансформация себя: +4 к КБ, следующие 2 атаки с преимуществом.',
        d(3,'d8',5), 5, 'action', 3, 'cursed', 7,
        { statusEffect: { type: 'empowered', duration: 2, value: 15 } }),
      skill('soul_multiplicity', 'Множественность душ',
        'Домен воплощения: все в 30 фут. делают спасбросок Мудрости СЛ 17 или тело деформируется.',
        d(6,'d8',8), 30, 'action', 6, 'domain', 9,
        { isUltimate: true, aoe: true, aoeRadius: 30, savingThrow: { stat: 'wis', dc: 17 } }),
    ],
  }),

  // ── КАМО ЧОСО ─────────────────────────────────────────────
  buildChar({
    id: 'blood_manipulator', class: 'blood_manipulator',
    name: 'Камо Чосо', title: 'Манипулятор крови', emoji: '🩸',
    color: '#C0392B', glowColor: '#922B21',
    description: 'Получеловек-полупроклятый. Кровь — его оружие и броня.',
    lore: 'Брат Юджи по крови Сукуны. Его любовь к братьям сильнее смерти.',
    passiveBonus: 'Кровяная броня: 1 раз в ход может потратить 5 HP чтобы добавить +3 к КБ (реакция)',
    hitDice: { die: 'd10', total: 1, used: 0 },
    abilityScores: { str: 16, dex: 14, con: 18, int: 12, wis: 12, cha: 10 },
    level: 1, cursedEnergy: 6, maxCursedEnergy: 6, speed: 30,
    allSkills: [
      skill('blood_blade', 'Кровяной клинок',
        'Создаёт острый клинок из уплотнённой крови.',
        d(1,'d8',4), 10, 'action', 0, 'blood', 1),
      skill('piercing_blood', 'Пронизывающая кровь',
        'Сгущённая кровь летит как снаряд. Пробивает броню — игнорирует половину КБ.',
        d(2,'d8',3), 60, 'action', 1, 'blood', 1),
      skill('blood_pool', 'Кровяная лужа',
        'Разливает кровь в зоне 10 фут. — труднопроходимая местность. 1d4 урона при движении.',
        d(1,'d4',0), 20, 'bonus_action', 1, 'blood', 3,
        { aoe: true, aoeRadius: 10 }),
      skill('supernova', 'Сверхновая',
        'Взрывает несколько кровяных шаров вокруг себя. Все в 15 фут. — спасбросок Ловкости СЛ 15.',
        d(4,'d8',5), 15, 'action', 3, 'blood', 5,
        { aoe: true, aoeRadius: 15, savingThrow: { stat: 'dex', dc: 15 },
          statusEffect: { type: 'bleed', duration: 3, value: 6 } }),
      skill('blood_armor', 'Кровяная броня',
        'Покрывает себя загустевшей кровью. +5 КБ и tempHP = 2d10+CON на 1 минуту.',
        d(2,'d10',0), 0, 'action', 2, 'blood', 7,
        { isHeal: true }),
      skill('flowing_red_scale', 'Красная чешуя потока',
        'Кипятит собственную кровь для сверхскорости. Атакует 4 раза, +15 фут. скорости.',
        d(2,'d8',5), 5, 'action', 5, 'blood', 9,
        { isUltimate: true }),
    ],
  }),

  // ── ТОДО АОИ ──────────────────────────────────────────────
  buildChar({
    id: 'switcher', class: 'switcher',
    name: 'Тодо Аои', title: 'Переключатель', emoji: '🔄',
    color: '#E67E22', glowColor: '#CA6F1E',
    description: 'Книжный червь — мгновенная смена позиций хлопком ладоней.',
    lore: 'Задаёт странный вопрос про тип девушки. Настоящий бро. Сильнейший из 3-го курса.',
    passiveBonus: 'Бро: если в партии есть Сосуд — оба получают +1d6 к урону',
    hitDice: { die: 'd10', total: 1, used: 0 },
    abilityScores: { str: 22, dex: 14, con: 18, int: 12, wis: 10, cha: 16 },
    level: 1, cursedEnergy: 4, maxCursedEnergy: 4, speed: 35,
    comboPairs: ['vessel'],
    allSkills: [
      skill('heavy_strike', 'Тяжёлый удар',
        'Сокрушительный удар кулаком с огромной силой.',
        d(1,'d10',6), 5, 'action', 0, 'physical', 1),
      skill('boogie_woogie', 'Буги-вуги',
        'Хлопок — ты и враг меняются местами. Следующая атака с преимуществом.',
        d(1,'d6',4), 5, 'bonus_action', 1, 'physical', 1),
      skill('diverge_step', 'Дивергентный шаг',
        'Реакция: когда тебя атакуют — меняешься местами с врагом. Атака промахивается.',
        d(0,'d4',0), 5, 'reaction', 1, 'physical', 3),
      skill('wrestling_throw', 'Бросок борьбы',
        'Захватываешь и бросаешь врага. Спасбросок Силы СЛ 16 — или grappled + prone.',
        d(2,'d8',6), 5, 'action', 1, 'physical', 5,
        { savingThrow: { stat: 'str', dc: 16 }, statusEffect: { type: 'grappled', duration: 1, value: 0 } }),
      skill('boogiewoogie_mass', 'Массовый буги-вуги',
        'Хлопок — меняет местами всех существ в 30 фут. случайным образом.',
        d(2,'d6',4), 30, 'action', 3, 'physical', 7,
        { aoe: true, aoeRadius: 30 }),
      skill('bro_combo', 'Комбо братанов',
        'Совместная атака с Юджи. Урон удваивается, враг делает 2 спасброска Телосложения СЛ 15.',
        d(5,'d10',8), 5, 'action', 4, 'physical', 9,
        { isUltimate: true, savingThrow: { stat: 'con', dc: 15 } }),
    ],
  }),

  // ── ХИГУРУМА ХИРОМИ ───────────────────────────────────────
  buildChar({
    id: 'defense_attorney', class: 'defense_attorney',
    name: 'Хигурума Хироми', title: 'Адвокат защиты', emoji: '⚖️',
    color: '#BDC3C7', glowColor: '#85929E',
    description: 'Бывший адвокат. Домен — идеальный зал суда.',
    lore: 'Разочаровался в правосудии. Теперь создаёт собственный суд над проклятиями.',
    passiveBonus: 'Вердикт: при критическом попадании — враг лишается одного действия в следующий ход',
    hitDice: { die: 'd8', total: 1, used: 0 },
    abilityScores: { str: 12, dex: 14, con: 14, int: 18, wis: 16, cha: 18 },
    level: 1, cursedEnergy: 8, maxCursedEnergy: 8, speed: 30,
    allSkills: [
      skill('gavel_strike', 'Удар молотком',
        'Удар проклятым молотком судьи.',
        d(1,'d8',2), 5, 'action', 0, 'cursed', 1),
      skill('judgeman', 'Судья',
        'Призывает духа-судью. Тот оценивает "вину" врага и накладывает штраф -2 к атакам.',
        d(1,'d10',3), 20, 'action', 2, 'cursed', 1,
        { statusEffect: { type: 'weakened', duration: 3, value: 4 } }),
      skill('objection', 'Возражение!',
        'Реакция: когда союзник под атакой — перехватываешь её на себя с половиной урона.',
        d(0,'d4',0), 10, 'reaction', 1, 'cursed', 3),
      skill('confiscation', 'Конфискация',
        'Изымает одно умение врага. Враг не может использовать своё лучшее умение 2 раунда.',
        d(2,'d8',3), 30, 'action', 3, 'cursed', 5,
        { savingThrow: { stat: 'wis', dc: 16 }, statusEffect: { type: 'weakened', duration: 2, value: 0 } }),
      skill('penalty', 'Высшая мера',
        'После вынесения вердикта — удвоенный урон против "виновного" (если стоит эффект слабости).',
        d(4,'d10',5), 30, 'action', 4, 'cursed', 7),
      skill('death_sentence', 'Смертный приговор',
        'Домен — полный суд. Враг делает спасбросок Мудрости СЛ 18 или получает эффект "приговора": -5 к атакам и КБ.',
        d(6,'d10',8), 60, 'action', 6, 'domain', 9,
        { isUltimate: true, savingThrow: { stat: 'wis', dc: 18 },
          statusEffect: { type: 'frightened', duration: 3, value: 5 } }),
    ],
  }),

  // ── УТА ОРИМЕ ─────────────────────────────────────────────
  buildChar({
    id: 'cursed_partners', class: 'cursed_partners',
    name: 'Ута Ориме', title: 'Проклятые партнёры', emoji: '🗡️',
    color: '#1ABC9C', glowColor: '#17A589',
    description: 'Копирует техники и использует силу духа Рики.',
    lore: 'Обещание Рике. Носит силу любимой как оружие. Сильнейший первого курса.',
    passiveBonus: 'Копирование: после получения урона 25% шанс запомнить атаку и использовать её',
    hitDice: { die: 'd8', total: 1, used: 0 },
    abilityScores: { str: 14, dex: 18, con: 14, int: 16, wis: 14, cha: 18 },
    level: 1, cursedEnergy: 8, maxCursedEnergy: 8, speed: 30,
    allSkills: [
      skill('rika_claw', 'Коготь Рики',
        'Рика атакует когтями из-за плеча.',
        d(1,'d8',3), 10, 'action', 0, 'cursed', 1),
      skill('copy_strike', 'Скопированный удар',
        'Повторяет последнее умение врага с уроном -2.',
        d(2,'d6',2), 30, 'action', 1, 'cursed', 1),
      skill('rika_shield', 'Щит Рики',
        'Рика встаёт между тобой и атакой. Реакция: поглощает до 2d8+5 урона.',
        d(2,'d8',5), 0, 'reaction', 2, 'cursed', 3,
        { isHeal: true }),
      skill('cursed_speech', 'Проклятая речь',
        'Слово-команда. Враг делает спасбросок Мудрости СЛ 16 или следует команде 1 ход.',
        d(2,'d8',3), 30, 'action', 3, 'cursed', 5,
        { savingThrow: { stat: 'wis', dc: 16 }, statusEffect: { type: 'stun', duration: 1, value: 0 } }),
      skill('rika_rampage', 'Бешенство Рики',
        'Рика атакует беспрерывно — 3 атаки за действие.',
        d(3,'d8',4), 10, 'action', 4, 'cursed', 7),
      skill('true_rika', 'Истинная Рика',
        'Полное освобождение духа Рики. Безграничная мощь — 6d10+10, игнорирует КБ.',
        d(6,'d10',10), 15, 'action', 6, 'domain', 9,
        { isUltimate: true, aoe: true, aoeRadius: 15 }),
    ],
  }),

  // ── НАНАМИ КЕНТО ──────────────────────────────────────────
  buildChar({
    id: 'salaryman', class: 'salaryman',
    name: 'Нанами Кенто', title: 'Офисный работник', emoji: '💼',
    color: '#2ECC71', glowColor: '#27AE60',
    description: 'Профессиональный чародей с техникой Соотношения 7:3.',
    lore: 'Ненавидит сверхурочную работу. Но всегда доводит дело до конца.',
    passiveBonus: 'Сверхурочные: после раунда 5 все атаки получают +1d6 (рабочий энтузиазм)',
    hitDice: { die: 'd10', total: 1, used: 0 },
    abilityScores: { str: 18, dex: 14, con: 16, int: 14, wis: 16, cha: 12 },
    level: 1, cursedEnergy: 5, maxCursedEnergy: 5, speed: 30,
    allSkills: [
      skill('blunt_strike', 'Тупой удар',
        'Удар рукоятью дубины — сбивает с ног.',
        d(1,'d8',5), 5, 'action', 0, 'physical', 1),
      skill('ratio_73', 'Соотношение 7:3',
        'Удар в точку слабого сочленения тела. Проникающий — -2 к КБ цели при расчёте.',
        d(2,'d8',5), 5, 'action', 1, 'physical', 1),
      skill('binding_slash', 'Связующий разрез',
        'Чертит линию и ударяет — враг замедляется. Спасбросок Телосложения СЛ 14.',
        d(2,'d8',4), 10, 'action', 2, 'physical', 3,
        { savingThrow: { stat: 'con', dc: 14 }, statusEffect: { type: 'grappled', duration: 2, value: 0 } }),
      skill('collapse', 'Обрушение',
        'Разрушает структурную точку тела. Спасбросок Телосложения СЛ 15 или блeed + -2 к атакам.',
        d(3,'d8',5), 5, 'action', 2, 'physical', 5,
        { savingThrow: { stat: 'con', dc: 15 }, statusEffect: { type: 'bleed', duration: 3, value: 8 } }),
      skill('overtime_mode', 'Режим сверхурочных',
        'Активирует предел возможностей. +2 атаки в следующие 3 раунда.',
        d(3,'d8',5), 5, 'action', 3, 'physical', 7,
        { statusEffect: { type: 'empowered', duration: 3, value: 8 } }),
      skill('overtime_final', 'Конец рабочего дня',
        'Финальный сокрушительный удар всей накопленной силой. Если враг ниже 50% HP — x2 урон.',
        d(6,'d10',8), 5, 'action', 5, 'physical', 9,
        { isUltimate: true }),
    ],
  }),

  // ── ЗЕНИН НАОЯ ────────────────────────────────────────────
  buildChar({
    id: 'head_of_hei', class: 'head_of_hei',
    name: 'Зенин Наоя', title: 'Глава рода Хэй', emoji: '⚡',
    color: '#F39C12', glowColor: '#D68910',
    description: 'Техника пространственно-пропорционального насилия. Сверхскорость.',
    lore: 'Высокомерный и смертоносный. Самый быстрый чародей — ходит всегда первым.',
    passiveBonus: 'Скорость света: всегда выигрывает инициативу, +10 фут. скорости',
    hitDice: { die: 'd8', total: 1, used: 0 },
    abilityScores: { str: 14, dex: 22, con: 14, int: 14, wis: 12, cha: 16 },
    level: 1, cursedEnergy: 6, maxCursedEnergy: 6, speed: 40,
    allSkills: [
      skill('speed_strike', 'Молниеносный удар',
        'Настолько быстрый, что враг не видит атаки. +2 к броску попадания.',
        d(1,'d8',5), 5, 'action', 0, 'physical', 1),
      skill('propulsion', 'Пропульсия',
        'Ускоряет себя до сверхскорости. Пролетает 60 фут. и атакует — враг не может использовать реакцию.',
        d(2,'d8',4), 60, 'action', 1, 'physical', 1),
      skill('afterimage', 'Фантомный образ',
        'Движется так быстро, что оставляет призрак. Атака врага с 50% промахом до следующего хода.',
        d(0,'d4',0), 0, 'bonus_action', 1, 'physical', 3,
        { statusEffect: { type: 'blessed', duration: 1, value: 5 } }),
      skill('spatial_warp', 'Пространственное искажение',
        'Создаёт зону деформации вокруг себя — все атаки по нему с помехой на 1 раунд.',
        d(2,'d8',4), 15, 'action', 2, 'physical', 5,
        { aoe: true, aoeRadius: 15, statusEffect: { type: 'weakened', duration: 2, value: 5 } }),
      skill('ratio_violence', 'Пропорциональное насилие',
        'Скорость конвертируется в чистый урон — чем дальше прошёл, тем больше урон (+5 за каждые 10 фут.).',
        d(3,'d10',5), 5, 'action', 3, 'physical', 7),
      skill('zenin_domain', 'Домен клана Зенин',
        'Запирает врага в пространстве абсолютной скорости. Все атаки автопопадание на 2 раунда.',
        d(5,'d10',8), 60, 'action', 6, 'domain', 9,
        { isUltimate: true }),
    ],
  }),

  // ── ЦУКИМО ЮКИ ────────────────────────────────────────────
  buildChar({
    id: 'star_rage', class: 'star_rage',
    name: 'Цукимо Юки', title: 'Звёздная ярость', emoji: '⭐',
    color: '#E91E63', glowColor: '#C2185B',
    description: 'Особый чародей с техникой звёздной массы. Гравитация как оружие.',
    lore: 'Свободный дух. Ищет способ победить проклятия не порождая новых.',
    passiveBonus: 'Накопление массы: каждая атака увеличивает следующую на 1d4',
    hitDice: { die: 'd8', total: 1, used: 0 },
    abilityScores: { str: 16, dex: 16, con: 16, int: 18, wis: 16, cha: 18 },
    level: 1, cursedEnergy: 8, maxCursedEnergy: 8, speed: 30,
    allSkills: [
      skill('gravity_punch', 'Гравитационный удар',
        'Удар с массой небесного тела. Враг отлетает на 10 фут.',
        d(1,'d8',4), 5, 'action', 0, 'divine', 1),
      skill('star_mass', 'Звёздная масса',
        'Концентрирует гравитацию вокруг кулака. Проникающий урон.',
        d(2,'d8',4), 10, 'action', 1, 'divine', 1),
      skill('gravity_well', 'Гравитационный колодец',
        'Зона притяжения 15 фут. — все враги втягиваются к центру. Спасбросок Силы СЛ 15.',
        d(2,'d8',3), 30, 'action', 2, 'divine', 3,
        { aoe: true, aoeRadius: 15, savingThrow: { stat: 'str', dc: 15 },
          statusEffect: { type: 'grappled', duration: 1, value: 0 } }),
      skill('stellar_shield', 'Звёздный щит',
        'Поле гравитации: реакция, поглощает урон до 3d8.',
        d(3,'d8',0), 0, 'reaction', 2, 'divine', 5,
        { isHeal: true }),
      skill('quasar_strike', 'Удар квазара',
        'Вкладывает массу звезды в одну точку. Критическое попадание при 17+.',
        d(4,'d10',6), 10, 'action', 4, 'divine', 7),
      skill('black_hole_domain', 'Домен: чёрная дыра',
        'Коллапс пространства. Все в 60 фут. делают спасбросок Силы СЛ 18 или 8d10 урона и оглушение.',
        d(8,'d10',10), 60, 'action', 6, 'domain', 9,
        { isUltimate: true, aoe: true, aoeRadius: 60,
          savingThrow: { stat: 'str', dc: 18 }, statusEffect: { type: 'stun', duration: 2, value: 0 } }),
    ],
  }),
];

export const getCharacterById = (id: string) => CHARACTERS.find(c => c.id === id);

/** Apply level up to a character (DnD rules) */
export const applyLevelUp = (char: Character): Character => {
  const newLevel = char.level + 1;
  const prof = getProficiencyBonus(newLevel);
  const conMod = getModifier(char.abilityScores.con);
  const dieSides = { d6: 6, d8: 8, d10: 10, d12: 12, d4: 4, d20: 20 };
  const sides = dieSides[char.hitDice.die];
  // Roll new hit die or take average
  const newHpGain = Math.floor(sides / 2) + 1 + conMod;
  const newMaxHp = char.maxHp + newHpGain;

  // CE increases by level
  const newMaxCE = char.maxCursedEnergy + 1;

  const newUnlocked = char.allSkills.filter(s => s.requiresLevel <= newLevel);

  return {
    ...char,
    level: newLevel,
    maxHp: newMaxHp,
    hp: newMaxHp, // fully heal on level up
    tempHp: 0,
    cursedEnergy: newMaxCE,
    maxCursedEnergy: newMaxCE,
    proficiencyBonus: prof,
    hitDice: { ...char.hitDice, total: char.hitDice.total + 1 },
    unlockedSkills: newUnlocked,
    exp: char.exp - char.expToNext,
    expToNext: getExpToNext(newLevel),
  };
};

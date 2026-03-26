import { Quest, Item } from './types';

export const ITEMS: Item[] = [
  { id: 'cursed_bandage', name: 'Проклятый бинт', description: 'Восстанавливает HP', type: 'consumable', rarity: 'common', usable: true, effect: 'heal_80', quantity: 3 },
  { id: 'mana_crystal', name: 'Кристалл ПЭ', description: 'Восстанавливает ПЭ', type: 'consumable', rarity: 'common', usable: true, effect: 'mana_50', quantity: 2 },
  { id: 'elixir', name: 'Эликсир силы', description: 'Усиление', type: 'consumable', rarity: 'rare', usable: true, effect: 'buff_attack', quantity: 1 },
  { id: 'sukuna_finger', name: 'Палец Сукуны', description: 'Легендарный объект', type: 'cursed_object', rarity: 'legendary', stats: { hp: 4 } },
  { id: 'wooden_sword', name: 'Деревянный меч', description: 'Простое оружие', type: 'weapon', rarity: 'common', stats: { ac: 1 } },
  { id: 'cursed_blade', name: 'Проклятый клинок', description: 'Наполнен энергией', type: 'weapon', rarity: 'rare', stats: { ac: 2 } },
  { id: 'school_uniform', name: 'Форма учеников', description: 'Защита', type: 'armor', rarity: 'common', stats: { ac: 1 } },
  { id: 'cursed_armor', name: 'Проклятая броня', description: 'Броня из проклятых волокон', type: 'armor', rarity: 'epic', stats: { ac: 3, hp: 2 } },
  { id: 'divergent_scroll', name: 'Свиток дивергенции', description: 'Усиливает технику', type: 'scroll', rarity: 'rare' },
  { id: 'six_eyes_blindfold', name: 'Повязка Годжо', description: 'Сдерживает бесконечность', type: 'armor', rarity: 'legendary', stats: { ac: 5 } },
];

export const QUESTS: Quest[] = [
  {
    id: 'first_mission', title: 'Первое задание', grade: 'D',
    description: 'Устрани проклятия.',
    objective: 'Победи 3 врага',
    progress: 0, required: 3,
    reward: { exp: 150, gold: 100, items: [ITEMS[0]] },
    completed: false, active: true, type: 'kill',
  },
];

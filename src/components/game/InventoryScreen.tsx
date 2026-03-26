import React, { useState } from 'react';
import { Item, Character } from '@/game/types';

interface Props {
  inventory: Item[];
  character: Character;
  gold: number;
  onBack: () => void;
  onEquip?: (item: Item) => void;
}

const RARITY_COLORS = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

const RARITY_LABELS = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
};

export default function InventoryScreen({ inventory, character, gold, onBack, onEquip }: Props) {
  const [selected, setSelected] = useState<Item | null>(null);
  const [filter, setFilter] = useState<Item['type'] | 'all'>('all');

  const filtered = filter === 'all' ? inventory : inventory.filter(i => i.type === filter);

  const filters: { label: string; value: Item['type'] | 'all' }[] = [
    { label: 'Все', value: 'all' },
    { label: '⚔ Оружие', value: 'weapon' },
    { label: '🛡 Броня', value: 'armor' },
    { label: '⚗ Расходники', value: 'consumable' },
    { label: '☠ Проклятые', value: 'cursed_object' },
    { label: '📜 Свитки', value: 'technique_scroll' },
  ];

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* Header */}
      <div className="border-b border-purple-900/40 px-6 py-3 flex items-center gap-4">
        <button onClick={onBack} className="text-purple-400 hover:text-white text-sm font-mono tracking-widest transition-colors">
          ← НАЗАД
        </button>
        <h2 className="text-white font-black text-xl tracking-widest uppercase">🎒 Инвентарь</h2>
        <div className="ml-auto text-yellow-400 font-bold font-mono">💰 {gold} золота</div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 flex gap-2 border-b border-purple-900/20 overflow-x-auto">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-150"
            style={{
              backgroundColor: filter === f.value ? '#7c3aed' : 'transparent',
              color: filter === f.value ? 'white' : '#7c3aed',
              border: `1px solid ${filter === f.value ? '#7c3aed' : '#7c3aed40'}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Items grid */}
        <div className="flex-1 p-4 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-600 mt-16">
              <div className="text-4xl mb-3">📦</div>
              <div className="text-lg">Инвентарь пуст</div>
              <div className="text-sm mt-1">Победи врагов, чтобы получить предметы</div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelected(selected?.id === item.id ? null : item)}
                  className="relative p-3 rounded-xl border text-left transition-all duration-200 hover:scale-105"
                  style={{
                    borderColor: selected?.id === item.id
                      ? RARITY_COLORS[item.rarity]
                      : `${RARITY_COLORS[item.rarity]}40`,
                    backgroundColor: selected?.id === item.id
                      ? `${RARITY_COLORS[item.rarity]}15`
                      : 'rgba(255,255,255,0.03)',
                    boxShadow: selected?.id === item.id
                      ? `0 0 15px ${RARITY_COLORS[item.rarity]}30`
                      : 'none',
                  }}
                >
                  <div className="text-3xl mb-2 text-center">{item.emoji}</div>
                  <div className="text-white text-xs font-bold text-center leading-tight">{item.name}</div>
                  <div className="text-center mt-1">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-bold"
                      style={{
                        backgroundColor: `${RARITY_COLORS[item.rarity]}20`,
                        color: RARITY_COLORS[item.rarity],
                      }}
                    >
                      {RARITY_LABELS[item.rarity]}
                    </span>
                  </div>
                  {item.quantity && item.quantity > 1 && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-purple-600 rounded-full text-white text-xs flex items-center justify-center font-bold">
                      {item.quantity}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Item detail panel */}
        {selected && (
          <div className="w-72 border-l border-purple-900/40 p-5 flex flex-col gap-4 overflow-y-auto">
            <div className="text-center">
              <div className="text-6xl mb-3">{selected.emoji}</div>
              <h3 className="text-white font-black text-xl">{selected.name}</h3>
              <span
                className="text-sm px-3 py-1 rounded-lg font-bold"
                style={{
                  backgroundColor: `${RARITY_COLORS[selected.rarity]}20`,
                  color: RARITY_COLORS[selected.rarity],
                }}
              >
                {RARITY_LABELS[selected.rarity]}
              </span>
            </div>

            <p className="text-gray-400 text-sm text-center">{selected.description}</p>

            {selected.stats && (
              <div className="p-3 bg-white/5 rounded-xl space-y-2">
                <div className="text-purple-400 text-xs font-mono tracking-widest uppercase">Характеристики</div>
                {selected.stats.attack && (
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400">⚔ Атака</span>
                    <span className="text-white font-bold">+{selected.stats.attack}</span>
                  </div>
                )}
                {selected.stats.defense && (
                  <div className="flex justify-between text-sm">
                    <span className="text-yellow-400">🛡 Защита</span>
                    <span className="text-white font-bold">+{selected.stats.defense}</span>
                  </div>
                )}
                {selected.stats.hp && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-400">❤ HP</span>
                    <span className="text-white font-bold">+{selected.stats.hp}</span>
                  </div>
                )}
                {selected.stats.mana && (
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-400">💧 Мана</span>
                    <span className="text-white font-bold">+{selected.stats.mana}</span>
                  </div>
                )}
              </div>
            )}

            {selected.type !== 'consumable' && onEquip && (
              <button
                onClick={() => { onEquip(selected); setSelected(null); }}
                className="w-full py-3 rounded-xl font-black text-white tracking-widest text-sm"
                style={{
                  background: `linear-gradient(135deg, ${RARITY_COLORS[selected.rarity]}80, ${RARITY_COLORS[selected.rarity]}40)`,
                  border: `1px solid ${RARITY_COLORS[selected.rarity]}`,
                }}
              >
                ЭКИПИРОВАТЬ
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

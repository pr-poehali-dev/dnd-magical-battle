import React, { useState } from 'react';
import { Character } from '@/game/types';
import { CHARACTERS } from '@/game/characters';

interface Props {
  onSelect: (character: Character) => void;
  onBack: () => void;
}

const RARITY_COLORS: Record<string, string> = {
  vessel: '#FF6B6B', honored_one: '#00D4FF', gambler: '#FFD700',
  ten_shadows: '#9B59B6', perfection: '#00FF88', blood_manipulator: '#C0392B',
  switcher: '#E67E22', defense_attorney: '#BDC3C7', cursed_partners: '#1ABC9C',
  puppet_master: '#8E44AD', head_of_hei: '#F39C12', salaryman: '#2ECC71',
  locust: '#27AE60', star_rage: '#E91E63',
};

const STAT_BAR = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
    <div
      className="h-full rounded-full transition-all duration-500"
      style={{ width: `${(value / max) * 100}%`, backgroundColor: color }}
    />
  </div>
);

export default function CharacterSelect({ onSelect, onBack }: Props) {
  const [selected, setSelected] = useState<Character | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const char = selected ?? CHARACTERS[0];

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* Header */}
      <div className="relative border-b border-purple-900/50 px-6 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-purple-400 hover:text-white transition-colors text-sm font-mono tracking-widest"
        >
          ← НАЗАД
        </button>
        <h2 className="text-white font-black text-xl tracking-[0.3em] uppercase">
          Выбор чародея
        </h2>
        <div className="ml-auto text-purple-500 text-xs font-mono">
          {CHARACTERS.length} персонажей доступно
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Characters grid */}
        <div className="w-64 border-r border-purple-900/40 overflow-y-auto p-3 flex flex-col gap-2">
          {CHARACTERS.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
              className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 text-left"
              style={{
                borderColor: selected?.id === c.id ? c.color : 'transparent',
                backgroundColor: selected?.id === c.id
                  ? `${c.color}15`
                  : hovered === c.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                boxShadow: selected?.id === c.id ? `0 0 16px ${c.color}30` : 'none',
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                style={{ backgroundColor: `${c.color}20`, border: `1px solid ${c.color}50` }}
              >
                {c.emoji}
              </div>
              <div className="min-w-0">
                <div className="text-white text-sm font-bold truncate">{c.name}</div>
                <div className="text-xs truncate" style={{ color: c.color }}>{c.title}</div>
              </div>
              {selected?.id === c.id && (
                <div className="ml-auto text-white text-xs">▶</div>
              )}
            </button>
          ))}
        </div>

        {/* Character details */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
          <div className="flex gap-8">
            {/* Character avatar */}
            <div className="flex-shrink-0">
              <div
                className="w-36 h-36 rounded-2xl flex items-center justify-center text-7xl relative"
                style={{
                  backgroundColor: `${char.color}15`,
                  border: `2px solid ${char.color}60`,
                  boxShadow: `0 0 40px ${char.color}30, inset 0 0 30px ${char.color}10`,
                }}
              >
                {char.emoji}
                <div
                  className="absolute inset-0 rounded-2xl animate-pulse opacity-20"
                  style={{ background: `radial-gradient(circle at center, ${char.color}, transparent)` }}
                />
              </div>
              <div className="mt-3 text-center">
                <div className="text-2xl font-black text-white">{char.name}</div>
                <div className="text-sm font-semibold" style={{ color: char.color }}>{char.title}</div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex-1">
              <p className="text-purple-300 text-sm mb-4 leading-relaxed italic">
                "{char.lore}"
              </p>
              <p className="text-gray-400 text-xs mb-4">{char.description}</p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'HP', value: char.maxHp, max: 500, color: '#22c55e' },
                  { label: 'МАНА', value: char.maxMana, max: 220, color: '#3b82f6' },
                  { label: 'АТАКА', value: char.attack, max: 100, color: '#ef4444' },
                  { label: 'ЗАЩИТА', value: char.defense, max: 100, color: '#f59e0b' },
                  { label: 'СКОРОСТЬ', value: char.speed, max: 100, color: '#a855f7' },
                ].map(stat => (
                  <div key={stat.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 font-mono">{stat.label}</span>
                      <span className="text-white font-bold">{stat.value}</span>
                    </div>
                    <STAT_BAR value={stat.value} max={stat.max} color={stat.color} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Skills */}
          <div>
            <h3 className="text-purple-400 font-black text-xs tracking-widest uppercase mb-3">
              — Техники и способности —
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {char.skills.map(skill => (
                <div
                  key={skill.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-purple-900/30 bg-white/3"
                >
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div
                      className="text-xs font-bold px-2 py-0.5 rounded text-black"
                      style={{ backgroundColor: char.color }}
                    >
                      {skill.isUltimate ? 'УЛЬТ' : 'АКТ'}
                    </div>
                    <div className="text-blue-400 text-xs font-mono">{skill.manaCost}MP</div>
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm">{skill.name}</div>
                    <div className="text-gray-400 text-xs">{skill.description}</div>
                    <div className="text-red-400 text-xs font-mono mt-0.5">⚔ {skill.damage} урона</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Passive */}
          <div className="p-3 rounded-xl border border-yellow-900/30 bg-yellow-500/5">
            <div className="text-yellow-400 text-xs font-black tracking-widest uppercase mb-1">⭐ Пассивная способность</div>
            <div className="text-yellow-200 text-sm">{char.passiveBonus}</div>
          </div>

          {/* Confirm button */}
          <button
            onClick={() => onSelect(char)}
            className="w-full py-4 rounded-xl font-black text-xl tracking-widest text-white uppercase transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: `linear-gradient(135deg, ${char.color}cc, ${char.color}66)`,
              boxShadow: `0 8px 30px ${char.color}40`,
              border: `1px solid ${char.color}80`,
            }}
          >
            {char.emoji} Выбрать {char.name}
          </button>
        </div>
      </div>
    </div>
  );
}

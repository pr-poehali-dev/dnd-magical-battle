import React, { useState } from 'react';
import { Character } from '@/game/types';
import { CHARACTERS } from '@/game/characters';
import { getModifier, abilityName } from '@/game/dndUtils';

interface Props {
  onSelect: (character: Character) => void;
  onBack: () => void;
}

const STAT_BAR = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
  </div>
);

const MOD = (score: number) => {
  const m = getModifier(score);
  return <span className={m >= 0 ? 'text-green-400' : 'text-red-400'}>{m >= 0 ? '+' : ''}{m}</span>;
};

export default function CharacterSelect({ onSelect, onBack }: Props) {
  const [selected, setSelected] = useState<Character>(CHARACTERS[0]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tab, setTab] = useState<'stats' | 'skills' | 'lore'>('stats');

  const char = selected;

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* Header */}
      <div className="border-b border-purple-900/40 px-6 py-3 flex items-center gap-4">
        <button onClick={onBack} className="text-purple-400 hover:text-white text-sm font-mono tracking-widest transition-colors">
          ← НАЗАД
        </button>
        <h2 className="text-white font-black text-xl tracking-[0.3em] uppercase">Выбор чародея</h2>
        <div className="ml-auto text-purple-500 text-xs font-mono">{CHARACTERS.length} персонажей</div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT: Character list ─── */}
        <div className="w-60 border-r border-purple-900/30 overflow-y-auto p-2 flex flex-col gap-1">
          {CHARACTERS.map(c => (
            <button key={c.id}
              onClick={() => setSelected(c)}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-left"
              style={{
                borderColor: selected.id === c.id ? c.color : 'transparent',
                backgroundColor: selected.id === c.id ? `${c.color}15` : hovered === c.id ? 'rgba(255,255,255,0.04)' : 'transparent',
                boxShadow: selected.id === c.id ? `0 0 12px ${c.color}25` : 'none',
              }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                style={{ backgroundColor: `${c.color}20`, border: `1px solid ${c.color}40` }}>
                {c.emoji}
              </div>
              <div className="min-w-0">
                <div className="text-white text-xs font-bold truncate">{c.name}</div>
                <div className="text-xs truncate" style={{ color: c.color }}>{c.title}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ─── RIGHT: Details ─── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Character header */}
          <div className="p-5 border-b border-purple-900/20 flex gap-5 items-start">
            <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-5xl flex-shrink-0 relative"
              style={{
                backgroundColor: `${char.color}15`,
                border: `2px solid ${char.color}50`,
                boxShadow: `0 0 30px ${char.color}25`,
              }}>
              {char.emoji}
              <div className="absolute inset-0 rounded-2xl animate-pulse opacity-10"
                style={{ background: `radial-gradient(circle, ${char.color}, transparent)` }} />
            </div>
            <div className="flex-1">
              <div className="text-2xl font-black text-white">{char.name}</div>
              <div className="font-bold mb-2" style={{ color: char.color }}>{char.title}</div>
              <div className="text-gray-400 text-sm">{char.description}</div>
              <div className="flex gap-3 mt-3 text-xs font-mono">
                <div className="px-2 py-1 rounded bg-white/5 border border-white/10">
                  <span className="text-gray-500">КБ </span><span className="text-white font-bold">{char.armorClass}</span>
                </div>
                <div className="px-2 py-1 rounded bg-white/5 border border-white/10">
                  <span className="text-gray-500">HP </span><span className="text-green-400 font-bold">{char.maxHp}</span>
                </div>
                <div className="px-2 py-1 rounded bg-white/5 border border-white/10">
                  <span className="text-gray-500">ПЭ </span><span className="text-purple-400 font-bold">{char.maxCursedEnergy}</span>
                </div>
                <div className="px-2 py-1 rounded bg-white/5 border border-white/10">
                  <span className="text-gray-500">Скор. </span><span className="text-blue-400 font-bold">{char.speed}фут</span>
                </div>
                <div className="px-2 py-1 rounded bg-white/5 border border-white/10">
                  <span className="text-gray-500">Кость хитов: </span><span className="text-yellow-400 font-bold">1{char.hitDice.die}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-purple-900/20">
            {(['stats', 'skills', 'lore'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-5 py-2.5 text-xs font-black tracking-widest uppercase transition-all"
                style={{
                  color: tab === t ? char.color : '#555',
                  borderBottom: tab === t ? `2px solid ${char.color}` : '2px solid transparent',
                }}>
                {t === 'stats' ? '⚔ Характеристики' : t === 'skills' ? '✨ Техники' : '📖 Лор'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">

            {/* ─── STATS TAB ─── */}
            {tab === 'stats' && (
              <div className="space-y-5">
                {/* Ability scores */}
                <div>
                  <div className="text-purple-400 text-xs font-mono tracking-widest uppercase mb-3">— Характеристики (DnD) —</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(char.abilityScores) as [keyof typeof char.abilityScores, number][]).map(([key, val]) => (
                      <div key={key} className="p-2.5 rounded-xl border border-white/8 bg-white/3 text-center">
                        <div className="text-gray-500 text-xs font-mono uppercase">{abilityName[key]}</div>
                        <div className="text-white font-black text-xl">{val}</div>
                        <div className="text-xs font-mono">{MOD(val)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Combat stats */}
                <div>
                  <div className="text-purple-400 text-xs font-mono tracking-widest uppercase mb-3">— Боевые показатели —</div>
                  <div className="space-y-2">
                    {[
                      { label: 'HP', value: char.maxHp, max: 200, color: '#22c55e' },
                      { label: 'Скорость', value: char.speed, max: 50, color: '#3b82f6' },
                      { label: 'Инициатива', value: char.initiative + 10, max: 20, color: '#f59e0b' },
                    ].map(s => (
                      <div key={s.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500 font-mono">{s.label}</span>
                          <span className="text-white font-bold">{s.value}</span>
                        </div>
                        <STAT_BAR value={s.value} max={s.max} color={s.color} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Passive */}
                <div className="p-3 rounded-xl border border-yellow-900/30 bg-yellow-500/5">
                  <div className="text-yellow-400 text-xs font-black tracking-widest uppercase mb-1">⭐ Пассивная способность</div>
                  <div className="text-yellow-200 text-sm">{char.passiveBonus}</div>
                </div>
              </div>
            )}

            {/* ─── SKILLS TAB ─── */}
            {tab === 'skills' && (
              <div className="space-y-2">
                <div className="text-purple-400 text-xs font-mono tracking-widest uppercase mb-3">
                  — Все техники класса (открываются по уровням) —
                </div>
                {char.allSkills.map(sk => {
                  const locked = sk.requiresLevel > 1;
                  return (
                    <div key={sk.id}
                      className="p-3 rounded-xl border transition-all"
                      style={{
                        borderColor: locked ? '#ffffff10' : `${char.color}30`,
                        backgroundColor: locked ? 'rgba(255,255,255,0.02)' : `${char.color}08`,
                        opacity: locked ? 0.6 : 1,
                      }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="text-white text-sm font-black">{sk.name}</div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          {locked && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono border border-white/10">
                              🔒 Ур.{sk.requiresLevel}
                            </span>
                          )}
                          {sk.isUltimate && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 font-bold border border-yellow-700/30">
                              УЛЬТ
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-gray-400 text-xs mb-2">{sk.description}</div>
                      <div className="flex gap-3 text-xs font-mono flex-wrap">
                        <span className="text-red-400">
                          ⚔ {sk.damageDice.count}к{sk.damageDice.die.slice(1)}
                          {sk.damageDice.modifier > 0 ? `+${sk.damageDice.modifier}` : ''}
                          {sk.isHeal ? ' исц.' : ''}
                        </span>
                        <span className="text-gray-500">{sk.range === 0 ? 'на себя' : `${sk.range} фут.`}</span>
                        {sk.energyCost > 0 && <span className="text-purple-400">{sk.energyCost} ПЭ</span>}
                        <span className="text-gray-600">
                          {sk.actionCost === 'action' ? '1 действие' : sk.actionCost === 'bonus_action' ? 'бонус. действие' : sk.actionCost === 'reaction' ? 'реакция' : 'свободно'}
                        </span>
                        {sk.savingThrow && (
                          <span className="text-cyan-400">СЛ {sk.savingThrow.dc} {sk.savingThrow.stat.toUpperCase()}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ─── LORE TAB ─── */}
            {tab === 'lore' && (
              <div className="space-y-4">
                <blockquote className="text-purple-200 text-lg italic leading-relaxed border-l-2 pl-4"
                  style={{ borderColor: char.color }}>
                  "{char.lore}"
                </blockquote>
                <div className="text-gray-400 text-sm leading-relaxed">
                  {char.description}
                </div>
                <div className="p-3 rounded-xl border border-purple-900/30 bg-purple-900/10">
                  <div className="text-purple-400 text-xs font-mono uppercase mb-2">Кость хитов</div>
                  <div className="text-white text-sm">
                    {char.hitDice.die} за уровень + модификатор Телосложения ({getModifier(char.abilityScores.con) >= 0 ? '+' : ''}{getModifier(char.abilityScores.con)})
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-blue-900/30 bg-blue-900/10">
                  <div className="text-blue-400 text-xs font-mono uppercase mb-2">Прокачка</div>
                  <div className="text-gray-300 text-sm">
                    Уровни растут медленно — как в DnD. Для 2-го уровня нужно 300 EXP, 3-го — 900 EXP. 
                    Каждый уровень открывает новые техники.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Select button */}
          <div className="p-4 border-t border-purple-900/20">
            <button
              onClick={() => onSelect(char)}
              className="w-full py-3.5 rounded-xl font-black text-xl tracking-widest text-white uppercase transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${char.color}cc, ${char.color}66)`,
                boxShadow: `0 8px 30px ${char.color}40`,
                border: `1px solid ${char.color}80`,
              }}>
              {char.emoji} Выбрать {char.name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

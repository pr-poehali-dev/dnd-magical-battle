import React, { useState } from 'react';
import { Character } from '@/game/types';
import { CHARACTERS } from '@/game/characters';
import { getModifier, abilityName } from '@/game/dndUtils';

interface Props {
  onSelect: (character: Character) => void;
  onBack: () => void;
  title?: string;
  subtitle?: string;
}

const STAT_BAR = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100,(value / max) * 100)}%`, backgroundColor: color }} />
  </div>
);

const Mod = ({ score }: { score: number }) => {
  const m = getModifier(score);
  return <span className={m >= 0 ? 'text-green-400' : 'text-red-400'}>{m >= 0 ? '+' : ''}{m}</span>;
};

export default function CharacterSelect({ onSelect, onBack, title = 'Выбор чародея', subtitle }: Props) {
  const [selected, setSelected] = useState<Character>(CHARACTERS[0]);
  const [tab, setTab] = useState<'stats' | 'skills' | 'lore'>('stats');

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      <div className="border-b border-purple-900/30 px-5 py-3 flex items-center gap-4">
        <button onClick={onBack} className="text-purple-400 hover:text-white text-sm font-mono transition-colors">← НАЗАД</button>
        <div>
          <h2 className="text-white font-black text-xl tracking-widest uppercase">{title}</h2>
          {subtitle && <div className="text-purple-400 text-xs font-mono">{subtitle}</div>}
        </div>
        <div className="ml-auto text-gray-600 text-xs font-mono">{CHARACTERS.length} персонажей</div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* List */}
        <div className="w-52 border-r border-purple-900/20 overflow-y-auto p-2 flex flex-col gap-1">
          {CHARACTERS.map(c => (
            <button key={c.id} onClick={() => setSelected(c)}
              className="flex items-center gap-2 px-2 py-2 rounded-xl border text-left transition-all"
              style={{
                borderColor: selected.id === c.id ? c.color : 'transparent',
                backgroundColor: selected.id === c.id ? `${c.color}15` : 'transparent',
              }}>
              {/* Sprite circle */}
              <div className="w-9 h-9 rounded-full flex-shrink-0 border-2"
                style={{ backgroundColor: `${c.color}30`, borderColor: `${c.color}80`,
                  background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4) 5%, ${c.color} 50%, ${c.color}88)` }} />
              <div className="min-w-0">
                <div className="text-white text-xs font-black truncate">{c.name}</div>
                <div className="text-xs truncate font-mono" style={{ color: c.color }}>{c.title}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-purple-900/15 flex gap-4">
            {/* Sprite */}
            <div className="w-20 h-20 rounded-2xl flex-shrink-0 relative"
              style={{
                background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5) 5%, ${selected.color} 45%, ${selected.color}99 80%)`,
                border: `2px solid ${selected.color}80`,
                boxShadow: `0 0 24px ${selected.color}40`,
              }}>
              {/* Simple face indicator */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full" style={{
                  background: `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.6) 10%, ${selected.color} 50%, rgba(0,0,0,0.3) 100%)`,
                }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-2xl font-black text-white">{selected.name}</div>
              <div className="font-bold mb-1" style={{ color: selected.color }}>{selected.title}</div>
              <div className="text-gray-400 text-sm leading-relaxed">{selected.description}</div>
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-white/5 border border-white/10">
                  <span className="text-green-400">HP</span> {selected.maxHp}
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-white/5 border border-white/10">
                  <span className="text-yellow-400">КБ</span> {selected.armorClass}
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-white/5 border border-white/10">
                  <span className="text-blue-400">Скор.</span> {selected.speed}ф
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-white/5 border border-white/10">
                  <span className="text-purple-400">ПЭ</span> {selected.maxCursedEnergy}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-purple-900/15">
            {(['stats','skills','lore'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-5 py-2 text-xs font-black tracking-widest uppercase transition-all"
                style={{ color: tab === t ? selected.color : '#555', borderBottom: tab === t ? `2px solid ${selected.color}` : '2px solid transparent' }}>
                {t === 'stats' ? '⚔ Статы' : t === 'skills' ? '✨ Техники' : '📖 Лор'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'stats' && (
              <div className="space-y-4">
                <div>
                  <div className="text-purple-400 text-xs font-mono uppercase mb-2">Характеристики</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(selected.abilityScores) as [keyof typeof selected.abilityScores, number][]).map(([k, v]) => (
                      <div key={k} className="p-2 rounded-xl border border-white/8 bg-white/3 text-center">
                        <div className="text-gray-500 text-xs uppercase">{abilityName[k]}</div>
                        <div className="text-white font-black text-xl">{v}</div>
                        <Mod score={v} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-yellow-900/30 bg-yellow-500/5">
                  <div className="text-yellow-400 text-xs font-black uppercase mb-1">⭐ Пассивная способность</div>
                  <div className="text-yellow-200 text-sm">{selected.passiveBonus}</div>
                </div>
              </div>
            )}

            {tab === 'skills' && (
              <div className="space-y-2">
                <div className="text-gray-500 text-xs mb-2">Открываются по уровням. Сейчас доступно: {selected.unlockedSkills.length} из {selected.allSkills.length}</div>
                {selected.allSkills.map(sk => {
                  const locked = sk.requiresLevel > selected.level;
                  return (
                    <div key={sk.id} className="p-3 rounded-xl border transition-all"
                      style={{
                        borderColor: locked ? '#ffffff10' : `${selected.color}30`,
                        backgroundColor: locked ? 'rgba(255,255,255,0.02)' : `${selected.color}08`,
                        opacity: locked ? 0.5 : 1,
                      }}>
                      <div className="flex justify-between items-start mb-1">
                        <div className="text-white text-sm font-black">{sk.name}</div>
                        <div className="flex gap-1">
                          {locked && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 font-mono border border-white/10">🔒 Ур.{sk.requiresLevel}</span>}
                          {sk.isUltimate && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-400 border border-yellow-700/30">УЛЬТ</span>}
                          {sk.is100pct && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-700/30">100%</span>}
                        </div>
                      </div>
                      <div className="text-gray-400 text-xs mb-1">{sk.description}</div>
                      <div className="flex gap-3 text-xs font-mono flex-wrap">
                        <span className="text-red-400">⚔ {sk.damageDice.count}к{sk.damageDice.die.slice(1)}{sk.damageDice.modifier > 0 ? `+${sk.damageDice.modifier}` : ''}</span>
                        <span className="text-gray-500">{sk.range === 5 ? 'ближний' : `${sk.range}фт`}</span>
                        <span className="text-yellow-500">{sk.actionCost === 'action' ? '1 действие' : sk.actionCost === 'bonus_action' ? 'бонус' : sk.actionCost === 'reaction' ? 'реакция' : 'свободно'}</span>
                        {sk.cooldownRounds > 0 && <span className="text-orange-400">КД {sk.cooldownRounds}р</span>}
                        {sk.blackFlash && <span className="text-purple-400">⚡Чёрная молния (18-20)</span>}
                        {sk.savingThrow && <span className="text-cyan-400">СЛ{sk.savingThrow.dc} {sk.savingThrow.stat}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'lore' && (
              <div className="space-y-4">
                <blockquote className="text-purple-200 text-base italic leading-relaxed border-l-2 pl-4" style={{ borderColor: selected.color }}>
                  "{selected.lore}"
                </blockquote>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-purple-900/15">
            <button onClick={() => onSelect(selected)}
              className="w-full py-3.5 rounded-xl font-black text-xl tracking-widest text-white uppercase hover:scale-[1.02] transition-all"
              style={{ background: `linear-gradient(135deg, ${selected.color}cc, ${selected.color}55)`, border: `1px solid ${selected.color}80`, boxShadow: `0 8px 28px ${selected.color}35` }}>
              Выбрать {selected.name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

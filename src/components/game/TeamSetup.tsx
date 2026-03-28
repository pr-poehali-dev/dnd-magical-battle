import React, { useState } from 'react';
import { Character } from '@/game/types';
import { CHARACTERS } from '@/game/characters';

export type SlotConfig = {
  kind: 'player' | 'bot' | 'empty';
  characterId: string | null; // null = random
};

export type TeamConfig = [SlotConfig, SlotConfig]; // 2 команды по 1 слоту

interface TeamSetupProps {
  onStart: (team0: Character, team1: Character) => void;
  onBack: () => void;
}

const CharPortrait = ({ char, selected, onClick }: { char: Character; selected: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="relative p-3 rounded-xl border-2 text-left transition-all hover:scale-105"
    style={{
      borderColor: selected ? char.color : '#ffffff18',
      backgroundColor: selected ? `${char.color}20` : '#ffffff05',
      boxShadow: selected ? `0 0 18px ${char.color}50` : 'none',
    }}
  >
    {/* Sprite canvas placeholder */}
    <div className="w-12 h-14 rounded-lg mb-1 flex items-center justify-center text-3xl"
      style={{ background: `radial-gradient(circle at 40% 30%, ${char.color}40 0%, ${char.color}15 60%, transparent 100%)`, border: `1px solid ${char.color}30` }}>
      {char.id === 'vessel' ? '👊' : char.id === 'honored_one' ? '😎' : '🎰'}
    </div>
    <div className="text-white font-black text-xs leading-tight">{char.name.split(' ')[0]}</div>
    <div className="text-xs mt-0.5" style={{ color: char.color }}>{char.title}</div>
    <div className="text-gray-500 text-xs mt-0.5 font-mono">{char.maxHp} HP</div>
  </button>
);

export default function TeamSetup({ onStart, onBack }: TeamSetupProps) {
  const [slots, setSlots] = useState<[SlotConfig, SlotConfig]>([
    { kind: 'player', characterId: null },
    { kind: 'bot', characterId: null },
  ]);
  const [selectingSlot, setSelectingSlot] = useState<0 | 1 | null>(null);

  const updateSlot = (idx: 0 | 1, patch: Partial<SlotConfig>) => {
    setSlots(s => {
      const copy: [SlotConfig, SlotConfig] = [{ ...s[0] }, { ...s[1] }];
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  };

  const handleStart = () => {
    const resolve = (cfg: SlotConfig, preferNot?: string): Character => {
      if (cfg.characterId) {
        const found = CHARACTERS.find(c => c.id === cfg.characterId);
        if (found) return { ...found };
      }
      // Случайный
      const pool = CHARACTERS.filter(c => c.id !== preferNot);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { ...pick };
    };

    const c0 = resolve(slots[0]);
    const c1 = resolve(slots[1]); // бот может взять ЛЮБОГО, даже занятого
    onStart(c0, c1);
  };

  const TEAM_COLORS = ['#3b82f6', '#ef4444'];
  const TEAM_LABELS = ['Команда 1', 'Команда 2'];

  return (
    <div className="min-h-screen bg-[#06040f] flex flex-col items-center justify-center p-6"
      style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* Back */}
      <button onClick={onBack} className="absolute top-4 left-4 text-gray-500 hover:text-white text-sm font-mono transition-colors">
        ← Назад
      </button>

      <h2 className="text-4xl font-black text-white tracking-widest mb-2"
        style={{ textShadow: '0 0 20px #a855f7' }}>
        SIMPLY FIGHT
      </h2>
      <div className="text-purple-400 font-mono text-sm mb-8 tracking-widest">Создай своих бойцов</div>

      <div className="flex gap-12 items-start justify-center w-full max-w-2xl">
        {([0, 1] as const).map(si => {
          const slot = slots[si];
          const teamColor = TEAM_COLORS[si];
          return (
            <div key={si} className="flex-1 flex flex-col items-center gap-4"
              style={{
                animation: `slideIn${si === 0 ? 'Left' : 'Right'} 0.5s ease forwards`,
              }}>
              {/* Team header */}
              <div className="px-4 py-1.5 rounded-full font-black text-sm border"
                style={{ borderColor: teamColor, color: teamColor, backgroundColor: teamColor + '18' }}>
                {TEAM_LABELS[si]}
              </div>

              {/* Slot card */}
              <div className="w-full p-4 rounded-2xl border"
                style={{ borderColor: teamColor + '40', backgroundColor: teamColor + '08' }}>
                {/* Player / Bot toggle */}
                <div className="flex gap-2 mb-4">
                  {(['player', 'bot'] as const).map(k => (
                    <button key={k}
                      onClick={() => updateSlot(si, { kind: k })}
                      className="flex-1 py-2 rounded-xl text-xs font-black border transition-all"
                      style={{
                        borderColor: slot.kind === k ? teamColor : '#ffffff18',
                        backgroundColor: slot.kind === k ? teamColor + '25' : 'transparent',
                        color: slot.kind === k ? teamColor : '#6b7280',
                      }}>
                      {k === 'player' ? '👤 Игрок' : '🤖 Бот'}
                    </button>
                  ))}
                </div>

                {/* Character selection */}
                <div className="mb-3">
                  <div className="text-gray-400 text-xs font-mono mb-2">
                    {si === 1 && slot.kind === 'bot' ? 'Бот (может взять любого):' : 'Персонаж:'}
                  </div>

                  {/* Random option */}
                  <button
                    onClick={() => updateSlot(si, { characterId: null })}
                    className="w-full py-2 rounded-lg border text-xs font-bold mb-2 transition-all"
                    style={{
                      borderColor: slot.characterId === null ? teamColor : '#ffffff15',
                      backgroundColor: slot.characterId === null ? teamColor + '20' : 'transparent',
                      color: slot.characterId === null ? teamColor : '#6b7280',
                    }}>
                    🎲 Случайный
                  </button>

                  {/* Character grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {CHARACTERS.map(char => (
                      <CharPortrait key={char.id} char={char}
                        selected={slot.characterId === char.id}
                        onClick={() => updateSlot(si, { characterId: char.id })} />
                    ))}
                  </div>
                </div>

                {/* Preview of selection */}
                {slot.characterId && (() => {
                  const ch = CHARACTERS.find(c => c.id === slot.characterId)!;
                  return (
                    <div className="p-2 rounded-lg border text-xs"
                      style={{ borderColor: ch.color + '30', backgroundColor: ch.color + '10' }}>
                      <div className="font-black" style={{ color: ch.color }}>{ch.name}</div>
                      <div className="text-gray-400 mt-0.5">{ch.description}</div>
                    </div>
                  );
                })()}
                {!slot.characterId && (
                  <div className="text-gray-600 text-xs text-center mt-1">Выберут случайного бойца</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* VS divider */}
      <div className="my-6 text-4xl font-black text-white/20 select-none"
        style={{ textShadow: '0 0 30px #a855f740' }}>
        VS
      </div>

      {/* Start button */}
      <button onClick={handleStart}
        className="px-16 py-4 rounded-2xl font-black text-white text-xl tracking-widest border transition-all hover:scale-105"
        style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #dc2626 100%)',
          border: '1px solid #a855f7',
          boxShadow: '0 0 40px #7c3aed50, 0 0 80px #dc262620',
        }}>
        ⚔ НАЧАТЬ БОЙ
      </button>

      <style>{`
        @keyframes slideInLeft { from { opacity:0; transform:translateX(-40px); } to { opacity:1; transform:translateX(0); } }
        @keyframes slideInRight { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }
      `}</style>
    </div>
  );
}
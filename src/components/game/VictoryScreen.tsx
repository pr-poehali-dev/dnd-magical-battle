import React, { useEffect, useState } from 'react';
import { Character, Enemy, Item } from '@/game/types';

interface Props {
  character: Character;
  enemy: Enemy;
  expGained: number;
  goldGained: number;
  loot: Item[];
  leveledUp: boolean;
  onContinue: () => void;
}

export default function VictoryScreen({ character, enemy, expGained, goldGained, loot, leveledUp, onContinue }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setTimeout(() => setShow(true), 100);
  }, []);

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center relative overflow-hidden" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* Victory particles */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              backgroundColor: ['#ffd700', '#ff6b35', '#a855f7', '#00d4ff'][i % 4],
              animation: `float ${2 + Math.random() * 2}s ease-in-out ${Math.random() * 2}s infinite alternate`,
              opacity: 0.6,
            }}
          />
        ))}
      </div>

      <div
        className="relative z-10 flex flex-col items-center gap-6 max-w-lg w-full px-6"
        style={{
          opacity: show ? 1 : 0,
          transform: show ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(30px)',
          transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Victory header */}
        <div className="text-center">
          <div className="text-7xl mb-3">🏆</div>
          <h1 className="text-5xl font-black text-white tracking-widest mb-2"
            style={{ textShadow: '0 0 30px #ffd700, 0 0 60px #ff6b35' }}>
            ПОБЕДА!
          </h1>
          <p className="text-yellow-400 text-lg font-bold">
            {enemy.name} повержен!
          </p>
        </div>

        {/* Enemy emoji */}
        <div className="text-6xl opacity-50 line-through">{enemy.emoji}</div>

        {/* Rewards */}
        <div className="w-full p-5 bg-gradient-to-b from-yellow-900/20 to-transparent border border-yellow-700/30 rounded-2xl space-y-3">
          <h3 className="text-yellow-400 font-black text-sm tracking-widest uppercase text-center">— Награды —</h3>

          <div className="flex justify-around">
            <div className="text-center">
              <div className="text-3xl font-black text-yellow-300">+{expGained}</div>
              <div className="text-yellow-600 text-xs font-mono">EXP</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-yellow-400">+{goldGained}</div>
              <div className="text-yellow-600 text-xs font-mono">ЗОЛОТО</div>
            </div>
          </div>

          {loot.length > 0 && (
            <div>
              <div className="text-gray-400 text-xs font-mono text-center mb-2">Выпавшие предметы:</div>
              <div className="flex justify-center gap-2">
                {loot.map(item => (
                  <div
                    key={item.id}
                    className="flex flex-col items-center p-2 bg-white/5 rounded-xl border border-purple-700/30"
                  >
                    <div className="text-2xl">{item.emoji}</div>
                    <div className="text-white text-xs font-bold mt-1">{item.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Level up */}
        {leveledUp && (
          <div className="w-full p-4 bg-purple-900/30 border border-purple-500/50 rounded-2xl text-center"
            style={{ boxShadow: '0 0 30px #a855f740' }}>
            <div className="text-3xl mb-1">⬆️</div>
            <div className="text-purple-300 font-black text-xl tracking-widest">УРОВЕНЬ ПОВЫШЕН!</div>
            <div className="text-purple-400 text-sm mt-1">
              {character.name} достиг {character.level} уровня!
            </div>
          </div>
        )}

        <button
          onClick={onContinue}
          className="w-full py-4 rounded-xl font-black text-white text-lg tracking-widest uppercase transition-all duration-200 hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
            border: '1px solid #a855f7',
            boxShadow: '0 8px 30px #7c3aed40',
          }}
        >
          ▶ Продолжить
        </button>
      </div>

      <style>{`
        @keyframes float {
          from { transform: translateY(0) rotate(0deg); }
          to { transform: translateY(-30px) rotate(180deg); }
        }
      `}</style>
    </div>
  );
}

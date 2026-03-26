import React, { useEffect, useState } from 'react';
import { Character, Enemy } from '@/game/types';

interface Props {
  character: Character;
  enemy: Enemy;
  onRetry: () => void;
  onReturnToMap: () => void;
}

export default function DefeatScreen({ character, enemy, onRetry, onReturnToMap }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setTimeout(() => setShow(true), 100);
  }, []);

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center relative overflow-hidden" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-radial from-red-900/20 via-transparent to-transparent" />
      </div>

      <div
        className="relative z-10 flex flex-col items-center gap-6 max-w-lg w-full px-6 text-center"
        style={{
          opacity: show ? 1 : 0,
          transform: show ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.6s ease',
        }}
      >
        <div className="text-7xl grayscale opacity-60">{character.emoji}</div>

        <div>
          <h1 className="text-5xl font-black text-red-500 tracking-widest mb-2"
            style={{ textShadow: '0 0 30px #ef4444' }}>
            ПОРАЖЕНИЕ
          </h1>
          <p className="text-gray-400 text-lg">
            {character.name} был побеждён {enemy.name}
          </p>
        </div>

        <div className="w-full p-5 bg-red-900/10 border border-red-800/30 rounded-2xl">
          <p className="text-red-300/70 text-sm italic">
            "Истинная сила рождается из поражений. Попробуй снова — и стань сильнее."
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={onRetry}
            className="w-full py-4 rounded-xl font-black text-white text-lg tracking-widest uppercase transition-all duration-200 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
              border: '1px solid #ef4444',
              boxShadow: '0 8px 30px #ef444430',
            }}
          >
            🔄 Попробовать снова
          </button>
          <button
            onClick={onReturnToMap}
            className="w-full py-3 rounded-xl font-bold text-purple-300 text-base tracking-widest uppercase transition-all duration-200 hover:bg-purple-900/30"
            style={{ border: '1px solid #7c3aed50' }}
          >
            ← Карта мира
          </button>
        </div>
      </div>

      <style>{`
        .bg-gradient-radial {
          background: radial-gradient(circle at center, var(--tw-gradient-stops));
        }
      `}</style>
    </div>
  );
}

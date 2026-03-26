import React, { useEffect, useState } from 'react';

interface MainMenuProps {
  onNewGame: () => void;
  onContinue: () => void;
  onPvP?: () => void;
  hasSave: boolean;
}

const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 4 + 1,
  duration: Math.random() * 3 + 2,
  delay: Math.random() * 3,
}));

export default function MainMenu({ onNewGame, onContinue, onPvP, hasSave }: MainMenuProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setTimeout(() => setShow(true), 100);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050510] flex flex-col items-center justify-center overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        {PARTICLES.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full bg-purple-500 opacity-30"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-radial from-purple-900/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-red-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-violet-600/10 rounded-full blur-3xl" />

        {/* Hex grid */}
        <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hex" width="50" height="43.4" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
              <polygon points="25,0 50,12.5 50,37.5 25,50 0,37.5 0,12.5" fill="none" stroke="#7c3aed" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex)" />
        </svg>
      </div>

      {/* Main content */}
      <div
        className="relative z-10 flex flex-col items-center gap-8"
        style={{ opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.8s ease' }}
      >
        {/* Logo area */}
        <div className="text-center mb-4">
          <div className="text-7xl mb-4 animate-pulse">⛩️</div>
          <h1 className="font-title text-6xl font-black text-white tracking-wider mb-2"
            style={{ textShadow: '0 0 40px #a855f7, 0 0 80px #7c3aed' }}>
            呪術廻戦
          </h1>
          <h2 className="font-title text-2xl font-bold tracking-[0.3em] text-purple-300 uppercase">
            Jujutsu Chronicles
          </h2>
          <p className="text-blue-400 text-sm tracking-widest mt-2 font-mono">
            — ПОШАГОВАЯ РПГ —
          </p>
        </div>

        {/* Grade badge */}
        <div className="flex gap-3 mb-2">
          {['S', 'A', 'B', 'C', 'D'].map((g, i) => (
            <div
              key={g}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black border"
              style={{
                borderColor: ['#ff0040', '#ff6b35', '#ffd700', '#00d4ff', '#888'][i],
                color: ['#ff0040', '#ff6b35', '#ffd700', '#00d4ff', '#888'][i],
                boxShadow: `0 0 8px ${['#ff0040', '#ff6b35', '#ffd700', '#00d4ff', '#888'][i]}40`,
                animation: `pulse ${1 + i * 0.2}s ease-in-out infinite alternate`
              }}
            >
              {g}
            </div>
          ))}
        </div>

        {/* Menu buttons */}
        <div className="flex flex-col gap-4 w-72">
          <button
            onClick={onNewGame}
            className="group relative py-4 px-8 bg-gradient-to-r from-violet-900 to-purple-800 border border-purple-500 rounded-xl font-title font-bold text-white text-lg tracking-widest hover:from-violet-700 hover:to-purple-600 transition-all duration-300"
            style={{ boxShadow: '0 0 20px #7c3aed40' }}
          >
            <span className="relative z-10">⚔️ НОВАЯ ИГРА</span>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/0 to-blue-500/0 group-hover:from-purple-500/20 group-hover:to-blue-500/20 transition-all duration-300" />
          </button>

          {hasSave && (
            <button
              onClick={onContinue}
              className="group py-4 px-8 bg-gradient-to-r from-blue-900 to-cyan-900 border border-cyan-500 rounded-xl font-title font-bold text-cyan-300 text-lg tracking-widest hover:from-blue-700 hover:to-cyan-700 transition-all duration-300"
              style={{ boxShadow: '0 0 20px #06b6d440' }}
            >
              ▶ ПРОДОЛЖИТЬ
            </button>
          )}

          {onPvP && (
            <button
              onClick={onPvP}
              className="group py-4 px-8 bg-gradient-to-r from-red-900 to-orange-900 border border-red-500 rounded-xl font-title font-bold text-red-300 text-lg tracking-widest hover:from-red-700 hover:to-orange-700 transition-all duration-300"
              style={{ boxShadow: '0 0 20px #ef444440' }}
            >
              ⚔ PvP — Чародей vs Чародей
            </button>
          )}

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent h-px top-1/2" />
          </div>

          <div className="text-center text-purple-500/60 text-xs font-mono tracking-widest mt-2">
            Выбери своего чародея. Уничтожь проклятия.<br />
            Стань сильнейшим — или умри.
          </div>
        </div>

        {/* Bottom credits */}
        <div className="text-center text-purple-800 text-xs font-mono mt-8">
          JJK Chronicles v1.0 · Based on Jujutsu Kaisen by Gege Akutami
        </div>
      </div>

      <style>{`
        @keyframes float {
          from { transform: translateY(0px) scale(1); }
          to { transform: translateY(-20px) scale(1.5); }
        }
        .bg-gradient-radial {
          background: radial-gradient(circle at center, var(--tw-gradient-stops));
        }
      `}</style>
    </div>
  );
}
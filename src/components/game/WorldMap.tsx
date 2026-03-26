import React, { useState } from 'react';
import { Location, Character } from '@/game/types';
import { WORLD_LOCATIONS } from '@/game/worldData';
import { getEnemyById } from '@/game/enemies';
import { Enemy } from '@/game/types';

interface Props {
  character: Character;
  visitedLocations: string[];
  onEnterLocation: (location: Location, enemies: Enemy[], biome: string) => void;
  onOpenInventory: () => void;
  onOpenQuests: () => void;
  gold: number;
}

// Biome decorations: background elements around each node
const BIOME_DECOR: Record<string, { bg: string; particles: string[]; ambientColor: string; fogColor: string }> = {
  school:  { bg: '#0a0f1a', particles: ['📚','✏️','🏫'], ambientColor: '#1a2a4a', fogColor: '#0a1530' },
  urban:   { bg: '#0a0d15', particles: ['🏙️','💡','🚗','🏢'], ambientColor: '#1a1f30', fogColor: '#0a0f20' },
  forest:  { bg: '#050f05', particles: ['🌲','🌿','🍂','🍄','🌳'], ambientColor: '#0a200a', fogColor: '#051005' },
  dungeon: { bg: '#0f050f', particles: ['🕸️','🦇','🪨','⛓️'], ambientColor: '#200a20', fogColor: '#100510' },
  prison:  { bg: '#0f0f05', particles: ['⛓️','🔒','🚧'], ambientColor: '#1f1f0a', fogColor: '#0f0f05' },
  void:    { bg: '#050508', particles: ['💀','🌀','☠️','✨'], ambientColor: '#0a0a1a', fogColor: '#050508' },
  ocean:   { bg: '#050a15', particles: ['🌊','⚓','🐟','💧'], ambientColor: '#0a1a2a', fogColor: '#050a15' },
  palace:  { bg: '#150a05', particles: ['👑','🕯️','🏛️','💎'], ambientColor: '#2a1505', fogColor: '#150a05' },
};

// Large decorative sprites around each node on the map
const NODE_DECOR: Record<string, { surrounding: string[]; glow: string }> = {
  jujutsu_high:    { surrounding: ['🏫','📚','⛩️','🌸'], glow: '#3b82f6' },
  shibuya_outskirts: { surrounding: ['🏙️','🚗','💡','🏢'], glow: '#6b7280' },
  detention_center:  { surrounding: ['⛓️','🔒','🚧'], glow: '#92400e' },
  shibuya_center:    { surrounding: ['🏙️','💥','🌆','🔥'], glow: '#dc2626' },
  yokohama_port:     { surrounding: ['⚓','🌊','🐟','🚢'], glow: '#0369a1' },
  cursed_forest:     { surrounding: ['🌲','🌲','🌿','🍄','🌳','🌲'], glow: '#15803d' },
  underground_prison:{ surrounding: ['⛓️','🔒','🕸️','🦇'], glow: '#7f1d1d' },
  death_painting_lair: { surrounding: ['🖼️','💀','🕯️','🎭'], glow: '#7c3aed' },
  gojo_prison:       { surrounding: ['📦','♾️','🌀','✨'], glow: '#0891b2' },
  kings_palace:      { surrounding: ['👑','💎','🏛️','👹','🔥'], glow: '#b91c1c' },
};

// Animated background particles for the whole map
const AMBIENT_COUNT = 40;
const AMBIENT = Array.from({ length: AMBIENT_COUNT }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  emoji: ['✨','💫','·','•','○','◦'][Math.floor(Math.random() * 6)],
  size: Math.random() * 8 + 6,
  dur: Math.random() * 4 + 3,
  delay: Math.random() * 4,
  opacity: Math.random() * 0.25 + 0.05,
}));

export default function WorldMap({ character, visitedLocations, onEnterLocation, onOpenInventory, onOpenQuests, gold }: Props) {
  const [selectedLoc, setSelectedLoc] = useState<Location | null>(null);
  const [hoveredLoc, setHoveredLoc] = useState<string | null>(null);

  const locations = WORLD_LOCATIONS.map(loc => ({
    ...loc,
    unlocked: loc.minLevel <= character.level || loc.unlocked,
  }));

  const handleEnter = (loc: Location) => {
    if (!loc.unlocked) return;
    const enemies = (loc.enemyIds ?? []).map(eId => getEnemyById(eId));
    if (loc.bossId) enemies.push(getEnemyById(loc.bossId));
    onEnterLocation(loc, enemies, loc.biome);
  };

  const hpPct = (character.hp / character.maxHp) * 100;
  const expPct = (character.exp / character.expToNext) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-[#050510] overflow-hidden" style={{ fontFamily: 'Rajdhani, sans-serif' }}>

      {/* ─── TOP HUD ─── */}
      <div className="border-b border-purple-900/30 px-4 py-2 flex items-center gap-4 flex-wrap z-10 bg-[#050510]/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: `${character.color}20`, border: `1px solid ${character.color}60` }}>
            {character.emoji}
          </div>
          <div>
            <div className="text-white font-black text-sm">{character.name}
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded font-mono" style={{ color: character.color, backgroundColor: `${character.color}20` }}>
                Ур.{character.level}
              </span>
            </div>
            <div className="flex gap-3 mt-0.5">
              <div className="flex items-center gap-1">
                <span className="text-xs text-green-400 font-mono">HP</span>
                <div className="w-20 h-1.5 bg-white/10 rounded-full">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${hpPct}%` }} />
                </div>
                <span className="text-xs text-white font-mono">{character.hp}/{character.maxHp}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-yellow-400 font-mono">EXP</span>
                <div className="w-20 h-1.5 bg-white/10 rounded-full">
                  <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${expPct}%` }} />
                </div>
                <span className="text-xs text-gray-400 font-mono">{character.exp}/{character.expToNext}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-yellow-400 font-bold font-mono text-sm">💰 {gold}</div>
          <button onClick={onOpenInventory}
            className="px-3 py-1.5 bg-purple-900/40 border border-purple-700/40 text-purple-300 rounded-lg text-xs font-bold hover:bg-purple-800/60 transition-colors">
            🎒 Инвентарь
          </button>
          <button onClick={onOpenQuests}
            className="px-3 py-1.5 bg-blue-900/40 border border-blue-700/40 text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-800/60 transition-colors">
            📋 Задания
          </button>
        </div>
      </div>

      {/* ─── MAP ─── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Deep background */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, #0d0520 0%, #050510 50%, #020208 100%)' }} />

        {/* Animated ambient particles */}
        {AMBIENT.map(p => (
          <div key={p.id} className="absolute pointer-events-none select-none"
            style={{
              left: `${p.x}%`, top: `${p.y}%`,
              fontSize: p.size,
              opacity: p.opacity,
              animation: `float-ambient ${p.dur}s ease-in-out ${p.delay}s infinite alternate`,
            }}>
            {p.emoji}
          </div>
        ))}

        {/* Fog / atmosphere blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/3 w-80 h-80 rounded-full blur-3xl opacity-10" style={{ backgroundColor: '#7c3aed' }} />
          <div className="absolute bottom-1/3 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-8" style={{ backgroundColor: '#dc2626' }} />
          <div className="absolute top-1/2 left-1/2 w-96 h-96 rounded-full blur-3xl opacity-5" style={{ backgroundColor: '#0891b2' }} />
        </div>

        {/* SVG for connections and biome areas */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Connection lines */}
          {locations.map(loc =>
            loc.connectedTo.map(targetId => {
              const target = locations.find(l => l.id === targetId);
              if (!target) return null;
              const both = loc.unlocked && target.unlocked;
              const nodeDecor = NODE_DECOR[loc.id];
              return (
                <g key={`${loc.id}-${targetId}`}>
                  {/* Shadow line */}
                  <line
                    x1={`${loc.x}%`} y1={`${loc.y}%`}
                    x2={`${target.x}%`} y2={`${target.y}%`}
                    stroke={both ? (nodeDecor?.glow ?? '#7c3aed') : '#1a1a2e'}
                    strokeWidth={both ? 3 : 1}
                    opacity={both ? 0.15 : 0.08}
                    filter={both ? 'url(#glow)' : undefined}
                  />
                  {/* Main line */}
                  <line
                    x1={`${loc.x}%`} y1={`${loc.y}%`}
                    x2={`${target.x}%`} y2={`${target.y}%`}
                    stroke={both ? (nodeDecor?.glow ?? '#7c3aed') : '#333'}
                    strokeWidth={both ? 1.5 : 0.5}
                    strokeDasharray={both ? undefined : '4,6'}
                    opacity={both ? 0.5 : 0.15}
                  />
                </g>
              );
            })
          )}
        </svg>

        {/* Location nodes with biome decorations */}
        {locations.map(loc => {
          const isUnlocked = loc.unlocked;
          const isVisited = visitedLocations.includes(loc.id);
          const isSelected = selectedLoc?.id === loc.id;
          const isHovered = hoveredLoc === loc.id;
          const decor = NODE_DECOR[loc.id] ?? { surrounding: [], glow: '#7c3aed' };
          const biome = BIOME_DECOR[loc.biome] ?? BIOME_DECOR.urban;

          return (
            <div key={loc.id}
              className="absolute"
              style={{ left: `${loc.x}%`, top: `${loc.y}%`, transform: 'translate(-50%, -50%)' }}>

              {/* Biome ambient glow */}
              {isUnlocked && (
                <div className="absolute pointer-events-none"
                  style={{
                    width: 120, height: 120,
                    top: -60, left: -60,
                    borderRadius: '50%',
                    backgroundColor: decor.glow,
                    opacity: isHovered ? 0.12 : 0.05,
                    filter: 'blur(20px)',
                    transition: 'opacity 0.3s',
                  }} />
              )}

              {/* Surrounding decorations */}
              {isUnlocked && decor.surrounding.map((emoji, i) => {
                const angle = (i / decor.surrounding.length) * Math.PI * 2;
                const r = 38;
                const ex = Math.cos(angle) * r;
                const ey = Math.sin(angle) * r;
                return (
                  <div key={i} className="absolute pointer-events-none select-none"
                    style={{
                      left: `calc(50% + ${ex}px)`, top: `calc(50% + ${ey}px)`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: 14,
                      opacity: isHovered ? 0.9 : 0.5,
                      transition: 'all 0.3s',
                      animation: `float-ambient ${2.5 + i * 0.4}s ease-in-out ${i * 0.3}s infinite alternate`,
                      filter: isHovered ? `drop-shadow(0 0 4px ${decor.glow})` : 'none',
                    }}>
                    {emoji}
                  </div>
                );
              })}

              {/* Main node button */}
              <button
                onClick={() => isUnlocked && setSelectedLoc(isSelected ? null : loc)}
                onMouseEnter={() => setHoveredLoc(loc.id)}
                onMouseLeave={() => setHoveredLoc(null)}
                className="relative flex flex-col items-center gap-1"
              >
                {/* Node hexagon */}
                <div
                  className="w-14 h-14 flex items-center justify-center text-2xl rounded-2xl transition-all duration-300"
                  style={{
                    backgroundColor: !isUnlocked ? '#0a0a0a'
                      : loc.bossId ? `${decor.glow}25`
                      : `${decor.glow}15`,
                    border: `2px solid ${!isUnlocked ? '#222'
                      : isSelected ? decor.glow
                      : isHovered ? `${decor.glow}cc`
                      : `${decor.glow}60`}`,
                    boxShadow: isSelected
                      ? `0 0 24px ${decor.glow}80, 0 0 48px ${decor.glow}30`
                      : isHovered && isUnlocked
                      ? `0 0 16px ${decor.glow}60`
                      : 'none',
                    opacity: isUnlocked ? 1 : 0.25,
                    transform: isHovered && isUnlocked ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  {isUnlocked ? loc.emoji : '🔒'}

                  {/* Boss crown */}
                  {loc.bossId && isUnlocked && (
                    <div className="absolute -top-2 -right-2 text-base animate-bounce">👑</div>
                  )}
                  {/* Visited check */}
                  {isVisited && isUnlocked && (
                    <div className="absolute -bottom-1 -right-1 text-xs bg-green-600 rounded-full w-4 h-4 flex items-center justify-center">✓</div>
                  )}
                </div>

                {/* Label */}
                <div className="text-center" style={{ maxWidth: 90 }}>
                  <div className="text-xs font-bold leading-tight text-center"
                    style={{ color: isUnlocked ? 'white' : '#444', textShadow: isUnlocked ? `0 0 8px ${decor.glow}60` : 'none' }}>
                    {loc.name}
                  </div>
                  {loc.bossId && isUnlocked && (
                    <div className="text-red-400 text-xs font-mono animate-pulse">⚠ БОСС</div>
                  )}
                  {!isUnlocked && (
                    <div className="text-gray-600 text-xs font-mono">Ур.{loc.minLevel}+</div>
                  )}
                </div>
              </button>
            </div>
          );
        })}

        {/* ─── LOCATION DETAIL PANEL ─── */}
        {selectedLoc && (
          <div className="absolute right-4 top-4 bottom-4 w-72 rounded-2xl border overflow-y-auto flex flex-col"
            style={{
              borderColor: `${NODE_DECOR[selectedLoc.id]?.glow ?? '#7c3aed'}50`,
              backgroundColor: '#050510f0',
              backdropFilter: 'blur(12px)',
              boxShadow: `0 0 40px ${NODE_DECOR[selectedLoc.id]?.glow ?? '#7c3aed'}20`,
            }}>
            {/* Header */}
            <div className="p-4 border-b" style={{ borderColor: '#ffffff10' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-3xl mb-1">{selectedLoc.emoji}</div>
                  <div className="text-white font-black text-lg">{selectedLoc.name}</div>
                  <div className="text-xs font-mono uppercase mt-0.5"
                    style={{ color: NODE_DECOR[selectedLoc.id]?.glow ?? '#7c3aed' }}>
                    {selectedLoc.biome}
                  </div>
                </div>
                <button onClick={() => setSelectedLoc(null)}
                  className="text-gray-500 hover:text-white text-xl transition-colors">×</button>
              </div>
            </div>

            {/* Info */}
            <div className="p-4 space-y-4 flex-1">
              <p className="text-gray-400 text-sm leading-relaxed">{selectedLoc.description}</p>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-purple-400">Мин. уровень</span>
                  <span className={`font-bold ${character.level >= selectedLoc.minLevel ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedLoc.minLevel}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-purple-400">Врагов</span>
                  <span className="text-white font-bold">{(selectedLoc.enemyIds ?? []).length}</span>
                </div>
                {selectedLoc.bossId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400">Босс</span>
                    <span className="text-red-300 font-bold">⚠ Присутствует</span>
                  </div>
                )}
              </div>

              {/* Biome decorations preview */}
              <div className="p-3 rounded-xl border" style={{ borderColor: '#ffffff08', backgroundColor: '#ffffff04' }}>
                <div className="text-xs text-gray-500 font-mono mb-2 uppercase">Окружение</div>
                <div className="flex gap-2 flex-wrap">
                  {(NODE_DECOR[selectedLoc.id]?.surrounding ?? []).map((e, i) => (
                    <span key={i} className="text-xl">{e}</span>
                  ))}
                </div>
              </div>

              {selectedLoc.bossId && (
                <div className="p-3 bg-red-900/20 border border-red-700/30 rounded-xl">
                  <div className="text-red-400 font-bold text-sm mb-1">⚠ Внимание — босс!</div>
                  <div className="text-red-300/70 text-xs">Подготовь предметы перед входом</div>
                </div>
              )}

              {character.level < selectedLoc.minLevel && (
                <div className="p-3 bg-orange-900/20 border border-orange-700/30 rounded-xl">
                  <div className="text-orange-400 font-bold text-sm">
                    Нужен {selectedLoc.minLevel} уровень
                  </div>
                  <div className="text-orange-300/70 text-xs">Прокачайся в других локациях</div>
                </div>
              )}
            </div>

            {/* Enter button */}
            <div className="p-4">
              <button
                onClick={() => handleEnter(selectedLoc)}
                disabled={character.level < selectedLoc.minLevel || !selectedLoc.unlocked}
                className="w-full py-3.5 rounded-xl font-black text-white tracking-widest uppercase text-sm transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: selectedLoc.bossId
                    ? 'linear-gradient(135deg, #7f1d1d, #b91c1c)'
                    : `linear-gradient(135deg, ${NODE_DECOR[selectedLoc.id]?.glow ?? '#7c3aed'}80, ${NODE_DECOR[selectedLoc.id]?.glow ?? '#7c3aed'}40)`,
                  border: `1px solid ${NODE_DECOR[selectedLoc.id]?.glow ?? '#7c3aed'}`,
                  boxShadow: `0 8px 24px ${NODE_DECOR[selectedLoc.id]?.glow ?? '#7c3aed'}30`,
                }}
              >
                {selectedLoc.bossId ? '⚔ Войти (Босс!)' : '▶ Войти в локацию'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes float-ambient {
          from { transform: translateY(0px) rotate(0deg); opacity: inherit; }
          to { transform: translateY(-12px) rotate(10deg); opacity: inherit; }
        }
      `}</style>
    </div>
  );
}

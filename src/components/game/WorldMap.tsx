import React, { useState } from 'react';
import { Location, Character } from '@/game/types';
import { WORLD_LOCATIONS } from '@/game/worldData';
import { getEnemyById } from '@/game/enemies';
import { Enemy } from '@/game/types';

interface Props {
  character: Character;
  visitedLocations: string[];
  onEnterLocation: (location: Location, enemies: Enemy[]) => void;
  onOpenInventory: () => void;
  onOpenQuests: () => void;
  gold: number;
}

export default function WorldMap({ character, visitedLocations, onEnterLocation, onOpenInventory, onOpenQuests, gold }: Props) {
  const [hoveredLoc, setHoveredLoc] = useState<string | null>(null);
  const [selectedLoc, setSelectedLoc] = useState<Location | null>(null);

  const locations = WORLD_LOCATIONS.map(loc => ({
    ...loc,
    unlocked: loc.minLevel <= character.level || loc.unlocked,
  }));

  const handleEnter = (loc: Location) => {
    if (!loc.unlocked) return;
    const enemies = loc.enemies.map(eId => getEnemyById(eId as string));
    if (loc.boss) {
      const boss = getEnemyById((loc.boss as unknown as string));
      enemies.push(boss);
    }
    onEnterLocation(loc, enemies);
  };

  const hovered = hoveredLoc ? locations.find(l => l.id === hoveredLoc) : null;

  const hpPercent = (character.hp / character.maxHp) * 100;
  const expPercent = (character.exp / character.expToNext) * 100;

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col overflow-hidden" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* Top HUD */}
      <div className="border-b border-purple-900/40 px-4 py-2 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: `${character.color}20`, border: `1px solid ${character.color}60` }}
          >
            {character.emoji}
          </div>
          <div>
            <div className="text-white text-sm font-bold">{character.name}</div>
            <div className="text-xs" style={{ color: character.color }}>{character.title} · Ур. {character.level}</div>
          </div>
        </div>

        <div className="flex gap-4 ml-4">
          <div className="flex flex-col gap-0.5 w-28">
            <div className="flex justify-between text-xs">
              <span className="text-green-400 font-mono">HP</span>
              <span className="text-white font-mono">{character.hp}/{character.maxHp}</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${hpPercent}%` }} />
            </div>
          </div>
          <div className="flex flex-col gap-0.5 w-28">
            <div className="flex justify-between text-xs">
              <span className="text-blue-400 font-mono">МАНА</span>
              <span className="text-white font-mono">{character.mana}/{character.maxMana}</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(character.mana / character.maxMana) * 100}%` }} />
            </div>
          </div>
          <div className="flex flex-col gap-0.5 w-28">
            <div className="flex justify-between text-xs">
              <span className="text-yellow-400 font-mono">EXP</span>
              <span className="text-white font-mono">{character.exp}/{character.expToNext}</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full">
              <div className="h-full bg-yellow-500 rounded-full transition-all" style={{ width: `${expPercent}%` }} />
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-yellow-400 font-bold font-mono text-sm">💰 {gold}</div>
          <button
            onClick={onOpenInventory}
            className="px-3 py-1.5 bg-purple-900/40 border border-purple-700/50 text-purple-300 rounded-lg text-xs font-bold tracking-widest hover:bg-purple-800/60 transition-colors"
          >
            🎒 ИНВЕНТАРЬ
          </button>
          <button
            onClick={onOpenQuests}
            className="px-3 py-1.5 bg-blue-900/40 border border-blue-700/50 text-blue-300 rounded-lg text-xs font-bold tracking-widest hover:bg-blue-800/60 transition-colors"
          >
            📋 ЗАДАНИЯ
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Map area */}
        <div className="relative flex-1 overflow-hidden">
          {/* Map background */}
          <div className="absolute inset-0">
            <div className="w-full h-full bg-gradient-to-br from-[#0a0520] via-[#050510] to-[#0a0520]" />
            <svg className="absolute inset-0 w-full h-full opacity-5">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#7c3aed" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          {/* Connection lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {locations.map(loc =>
              loc.connectedTo.map(targetId => {
                const target = locations.find(l => l.id === targetId);
                if (!target) return null;
                const isActive = loc.unlocked && target.unlocked;
                return (
                  <line
                    key={`${loc.id}-${targetId}`}
                    x1={`${loc.x}%`} y1={`${loc.y}%`}
                    x2={`${target.x}%`} y2={`${target.y}%`}
                    stroke={isActive ? '#7c3aed' : '#1a1a2e'}
                    strokeWidth={isActive ? 1.5 : 1}
                    strokeDasharray={isActive ? 'none' : '5,5'}
                    opacity={isActive ? 0.5 : 0.2}
                  />
                );
              })
            )}
          </svg>

          {/* Location nodes */}
          {locations.map(loc => {
            const isUnlocked = loc.unlocked;
            const isHovered = hoveredLoc === loc.id;
            const isVisited = visitedLocations.includes(loc.id);

            return (
              <button
                key={loc.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 group"
                style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
                onClick={() => isUnlocked && setSelectedLoc(loc)}
                onMouseEnter={() => setHoveredLoc(loc.id)}
                onMouseLeave={() => setHoveredLoc(null)}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all duration-200"
                  style={{
                    backgroundColor: isUnlocked
                      ? (loc.boss ? '#1a0520' : '#0a1020')
                      : '#0a0a0a',
                    border: `2px solid ${isUnlocked
                      ? (loc.boss ? '#ff0040' : isVisited ? '#22c55e50' : '#7c3aed')
                      : '#333'}`,
                    boxShadow: isHovered && isUnlocked
                      ? `0 0 20px ${loc.boss ? '#ff004060' : '#7c3aed60'}`
                      : 'none',
                    opacity: isUnlocked ? 1 : 0.3,
                    transform: isHovered && isUnlocked ? 'scale(1.2)' : 'scale(1)',
                  }}
                >
                  {isUnlocked ? loc.emoji : '🔒'}
                </div>
                <div
                  className="text-xs font-bold text-center max-w-20 leading-tight"
                  style={{ color: isUnlocked ? 'white' : '#555' }}
                >
                  {loc.name.length > 15 ? loc.name.substring(0, 13) + '…' : loc.name}
                </div>
                {loc.boss && isUnlocked && (
                  <div className="text-red-400 text-xs font-mono animate-pulse">БОСС</div>
                )}
                {isVisited && (
                  <div className="text-green-400 text-xs">✓</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Location details panel */}
        {selectedLoc && (
          <div className="w-72 border-l border-purple-900/40 p-4 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-black text-lg">{selectedLoc.emoji} {selectedLoc.name}</h3>
              <button
                onClick={() => setSelectedLoc(null)}
                className="text-gray-500 hover:text-white text-xl"
              >×</button>
            </div>

            <p className="text-gray-400 text-sm">{selectedLoc.description}</p>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-purple-400">Мин. уровень</span>
                <span className="text-white font-bold">{selectedLoc.minLevel}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-purple-400">Врагов</span>
                <span className="text-white font-bold">{selectedLoc.enemies.length}</span>
              </div>
              {selectedLoc.boss && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-400">Босс</span>
                  <span className="text-red-300 font-bold">⚠ Есть</span>
                </div>
              )}
            </div>

            {selectedLoc.boss && (
              <div className="p-3 bg-red-900/20 border border-red-700/30 rounded-xl">
                <div className="text-red-400 font-bold text-sm mb-1">⚠ Опасно — босс локации!</div>
                <div className="text-red-300/70 text-xs">Подготовься к бою перед входом</div>
              </div>
            )}

            {character.level < selectedLoc.minLevel && (
              <div className="p-3 bg-orange-900/20 border border-orange-700/30 rounded-xl">
                <div className="text-orange-400 font-bold text-sm">
                  Нужен {selectedLoc.minLevel} уровень
                </div>
                <div className="text-orange-300/70 text-xs">
                  Прокачайся в других локациях
                </div>
              </div>
            )}

            <button
              onClick={() => handleEnter(selectedLoc)}
              disabled={character.level < selectedLoc.minLevel}
              className="w-full py-3 rounded-xl font-black text-white tracking-widest uppercase transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
              style={{
                background: selectedLoc.boss
                  ? 'linear-gradient(135deg, #7f1d1d, #991b1b)'
                  : 'linear-gradient(135deg, #4c1d95, #6d28d9)',
                border: `1px solid ${selectedLoc.boss ? '#ef4444' : '#7c3aed'}`,
                boxShadow: `0 8px 20px ${selectedLoc.boss ? '#ef444430' : '#7c3aed30'}`,
              }}
            >
              {selectedLoc.boss ? '⚔️ Войти (Босс!)' : '▶ Войти в локацию'}
            </button>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {hovered && !selectedLoc && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-purple-950/90 border border-purple-700/50 rounded-xl text-white text-sm font-bold pointer-events-none">
          {hovered.emoji} {hovered.name} · Ур. {hovered.minLevel}+
        </div>
      )}
    </div>
  );
}

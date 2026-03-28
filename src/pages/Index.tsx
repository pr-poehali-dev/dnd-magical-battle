import React, { useState, useCallback } from 'react';
import { Character, BattleState, Enemy } from '@/game/types';
import { initBattle } from '@/game/battleEngine';
import { getModifier } from '@/game/dndUtils';

import MainMenu from '@/components/game/MainMenu';
import TeamSetup from '@/components/game/TeamSetup';
import BattleScreen from '@/components/game/BattleScreen';

type Screen = 'mainMenu' | 'teamSetup' | 'battle' | 'result';

/** Превращает Character в Enemy (для команды бота) */
function charAsEnemy(char: Character, startX: number, startY: number): Enemy {
  return {
    id: char.id + '_bot_' + Math.random().toString(36).slice(2),
    name: char.name,
    color: char.color,
    glowColor: char.glowColor,
    hp: char.maxHp,
    maxHp: char.maxHp,
    tempHp: 0,
    armorClass: char.armorClass,
    speed: char.speed,
    initiative: getModifier(char.abilityScores.dex),
    proficiencyBonus: char.proficiencyBonus,
    abilityScores: char.abilityScores,
    statusEffects: [],
    hasAction: true,
    hasBonusAction: true,
    hasReaction: true,
    movementLeft: char.speed,
    deathSaves: { successes: 0, failures: 0 },
    isUnconscious: false,
    isDead: false,
    onTree: false,
    gridX: startX,
    gridY: startY,
    challengeRating: char.level,
    skills: char.unlockedSkills,
    exp: 100,
    loot: [],
    description: char.description,
    isBoss: false,
    aiType: 'aggressive',
  };
}

export default function Index() {
  const [screen, setScreen] = useState<Screen>('mainMenu');
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [resultWinner, setResultWinner] = useState<string>('');
  const [resultLoser, setResultLoser] = useState<string>('');

  const handleStartFight = useCallback((char0: Character, char1: Character) => {
    // char0 = игрок (team 0), char1 = бот (team 1, Enemy)
    const p1: Character = { ...char0, gridX: 2, gridY: 8 };
    const bot: Enemy = charAsEnemy({ ...char1 }, 21, 8);

    const state = initBattle([p1], [bot]);
    setBattleState(state);
    setScreen('battle');
  }, []);

  const handleVictory = useCallback((state: BattleState) => {
    const winner = state.units.find(u => !u.data.isUnconscious && !u.data.isDead);
    const loser = state.units.find(u => u.data.isUnconscious || u.data.isDead);
    setResultWinner(winner?.data.name ?? 'Неизвестный');
    setResultLoser(loser?.data.name ?? '');
    setScreen('result');
  }, []);

  const handleDefeat = useCallback(() => {
    setResultWinner('Бот');
    setResultLoser('');
    setScreen('result');
  }, []);

  const handleBattleEnd = useCallback(() => {
    // Кнопка "Завершить битву" — определяем победителя из текущего состояния
    if (!battleState) { setScreen('mainMenu'); return; }
    const winner = battleState.units.find(u => !u.data.isUnconscious && !u.data.isDead);
    setResultWinner(winner?.data.name ?? 'Неизвестный');
    setResultLoser('');
    setScreen('result');
  }, [battleState]);

  return (
    <div className="min-h-screen" style={{ fontFamily: 'Rajdhani, sans-serif' }}>

      {screen === 'mainMenu' && (
        <MainMenu onSimplyFight={() => setScreen('teamSetup')} />
      )}

      {screen === 'teamSetup' && (
        <TeamSetup
          onStart={handleStartFight}
          onBack={() => setScreen('mainMenu')}
        />
      )}

      {screen === 'battle' && battleState && (
        <BattleScreen
          battleState={battleState}
          onBattleUpdate={setBattleState}
          onVictory={handleVictory}
          onDefeat={handleDefeat}
          onBattleEnd={handleBattleEnd}
          isLocalPvp={false}
        />
      )}

      {screen === 'result' && (
        <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center gap-6 relative overflow-hidden">
          {/* Анимированный фон */}
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="absolute rounded-full"
                style={{
                  width: Math.random() * 4 + 1,
                  height: Math.random() * 4 + 1,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  backgroundColor: `hsl(${260 + Math.random() * 80},100%,70%)`,
                  opacity: Math.random() * 0.5 + 0.2,
                  animation: `float${i % 3} ${3 + Math.random() * 4}s ease-in-out infinite alternate`,
                }} />
            ))}
          </div>

          <div className="text-6xl mb-2">🏆</div>
          <h1 className="text-5xl font-black text-white tracking-widest"
            style={{ textShadow: '0 0 30px #ffd700, 0 0 60px #ffd70050' }}>
            ПОБЕДА!
          </h1>
          {resultWinner && (
            <div className="text-2xl font-black tracking-wide" style={{ color: '#fbbf24' }}>
              {resultWinner}
            </div>
          )}
          {resultLoser && (
            <div className="text-gray-500 text-sm font-mono">побеждает над {resultLoser}</div>
          )}

          <div className="flex gap-4 mt-6">
            <button onClick={() => setScreen('teamSetup')}
              className="px-8 py-3 rounded-xl font-black text-white tracking-widest bg-purple-700 border border-purple-500 hover:bg-purple-600 transition-all hover:scale-105">
              🔄 Реванш
            </button>
            <button onClick={() => setScreen('mainMenu')}
              className="px-8 py-3 rounded-xl font-black text-white tracking-widest bg-gray-800 border border-gray-600 hover:bg-gray-700 transition-all">
              ← Меню
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
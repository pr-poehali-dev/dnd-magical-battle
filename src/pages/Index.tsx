import React, { useState, useCallback } from 'react';
import { Character, BattleState, Enemy, Item } from '@/game/types';
import { CHARACTERS, applyLevelUp } from '@/game/characters';
import { initBattle } from '@/game/battleEngine';
import { getEnemyById } from '@/game/enemies';
import { ITEMS } from '@/game/worldData';

import MainMenu from '@/components/game/MainMenu';
import CharacterSelect from '@/components/game/CharacterSelect';
import BattleScreen from '@/components/game/BattleScreen';

type Screen = 'mainMenu' | 'characterSelect' | 'battle' | 'pvpSelect' | 'pvpBattle' | 'victory' | 'defeat';

/** Convert a Character into an Enemy-shaped unit for the AI side of PvP */
function charAsEnemy(char: Character, slot: number): Enemy {
  return {
    id: char.id + '_bot',
    name: char.name + ' (Бот)',
    color: '#ef4444',
    glowColor: '#f87171',
    hp: char.maxHp,
    maxHp: char.maxHp,
    tempHp: 0,
    armorClass: char.armorClass,
    speed: char.speed,
    initiative: char.initiative,
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
    gridX: 13,
    gridY: 3 + slot * 2,
    attack: char.abilityScores.str,
    challengeRating: char.level,
    // Use the character's unlocked skills as the enemy skill pool
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
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [pvpP1, setPvpP1] = useState<Character | null>(null);

  // ── Story mode ──
  const handleSelectCharacter = (char: Character) => {
    setSelectedChar({ ...char });
    const enemy1 = { ...getEnemyById('medium_curse'), gridX: 12, gridY: 4 };
    const enemy2 = { ...getEnemyById('small_curse'), gridX: 13, gridY: 6 };
    const state = initBattle([{ ...char }], [enemy1, enemy2]);
    setBattleState(state);
    setScreen('battle');
  };

  const handleVictory = useCallback((state: BattleState) => {
    if (!selectedChar) return;
    const expGained = 150;
    let updatedChar = { ...selectedChar, exp: selectedChar.exp + expGained };
    if (updatedChar.exp >= updatedChar.expToNext) updatedChar = applyLevelUp(updatedChar);
    setSelectedChar(updatedChar);
    setScreen('victory');
  }, [selectedChar]);

  const handleDefeat = useCallback(() => {
    setScreen('defeat');
  }, []);

  // ── PvP mode (player picks 1 char, bot picks randomly from remaining) ──
  const handlePvpStart = () => {
    setPvpP1(null);
    setScreen('pvpSelect');
  };

  const handlePvpSelectP1 = (char: Character) => {
    const p1 = { ...char, gridX: 2, gridY: 5 };
    setPvpP1(p1);

    // Bot picks a random character (excluding chosen one)
    const botOptions = CHARACTERS.filter(c => c.id !== char.id);
    const botChar = botOptions[Math.floor(Math.random() * botOptions.length)];
    const botEnemy = charAsEnemy(botChar, 0);

    const state = initBattle([p1], [botEnemy]);
    setBattleState(state);
    setScreen('pvpBattle');
  };

  const handlePvpVictory = useCallback((state: BattleState) => {
    setScreen('victory');
  }, []);

  const handlePvpDefeat = useCallback(() => {
    setScreen('defeat');
  }, []);

  return (
    <div className="min-h-screen" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {screen === 'mainMenu' && (
        <MainMenu
          onNewGame={() => setScreen('characterSelect')}
          onContinue={() => setScreen('characterSelect')}
          onPvP={handlePvpStart}
          hasSave={false}
        />
      )}

      {screen === 'characterSelect' && (
        <CharacterSelect
          onSelect={handleSelectCharacter}
          onBack={() => setScreen('mainMenu')}
          title="Выбери чародея"
        />
      )}

      {/* PvP — player picks their char, bot chosen automatically */}
      {screen === 'pvpSelect' && (
        <CharacterSelect
          onSelect={handlePvpSelectP1}
          onBack={() => setScreen('mainMenu')}
          title="PvP — Выбери чародея"
          subtitle="Противника выберет бот"
        />
      )}

      {(screen === 'battle' || screen === 'pvpBattle') && battleState && (
        <BattleScreen
          battleState={battleState}
          onBattleUpdate={setBattleState}
          onVictory={screen === 'pvpBattle' ? handlePvpVictory : handleVictory}
          onDefeat={screen === 'pvpBattle' ? handlePvpDefeat : handleDefeat}
        />
      )}

      {screen === 'victory' && (
        <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center gap-6">
          <div className="text-6xl">🏆</div>
          <h1 className="text-5xl font-black text-white tracking-widest" style={{ textShadow: '0 0 30px #ffd700' }}>ПОБЕДА!</h1>
          <div className="flex gap-4 mt-4">
            <button onClick={() => setScreen('characterSelect')}
              className="px-8 py-3 rounded-xl font-black text-white tracking-widest bg-purple-700 border border-purple-500 hover:bg-purple-600">
              ▶ Ещё раз
            </button>
            <button onClick={() => setScreen('mainMenu')}
              className="px-8 py-3 rounded-xl font-bold text-gray-400 border border-white/20 hover:bg-white/5">
              Меню
            </button>
          </div>
        </div>
      )}

      {screen === 'defeat' && (
        <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center gap-6">
          <div className="text-6xl grayscale opacity-60">💀</div>
          <h1 className="text-5xl font-black text-red-500 tracking-widest" style={{ textShadow: '0 0 30px #ef4444' }}>ПОРАЖЕНИЕ</h1>
          <div className="flex gap-4 mt-4">
            <button onClick={() => setScreen('characterSelect')}
              className="px-8 py-3 rounded-xl font-black text-white tracking-widest bg-red-900 border border-red-600 hover:bg-red-800">
              🔄 Снова
            </button>
            <button onClick={() => setScreen('mainMenu')}
              className="px-8 py-3 rounded-xl font-bold text-gray-400 border border-white/20 hover:bg-white/5">
              Меню
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

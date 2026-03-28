import React, { useState, useCallback } from 'react';
import { Character, BattleState, Enemy } from '@/game/types';
import { CHARACTERS, applyLevelUp } from '@/game/characters';
import { initBattle, initLocalPvP } from '@/game/battleEngine';
import { getEnemyById } from '@/game/enemies';

import MainMenu from '@/components/game/MainMenu';
import CharacterSelect from '@/components/game/CharacterSelect';
import BattleScreen from '@/components/game/BattleScreen';

type Screen =
  | 'mainMenu'
  | 'characterSelect'
  | 'battle'
  | 'pvpSelect'       // старый PvP vs бот
  | 'pvpBattle'
  | 'localPvpP1'      // локальный PvP — выбор 1-го игрока
  | 'localPvpP2'      // локальный PvP — выбор 2-го игрока
  | 'localPvpBattle'
  | 'victory'
  | 'defeat';

function charAsEnemy(char: Character, slot: number): Enemy {
  return {
    id: char.id + '_bot',
    name: char.name + ' (Бот)',
    color: char.color,
    glowColor: char.glowColor,
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
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [localP1, setLocalP1] = useState<Character | null>(null);
  const [winnerName, setWinnerName] = useState<string>('');

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
    setWinnerName('');
    setScreen('victory');
  }, [selectedChar]);

  const handleDefeat = useCallback(() => {
    setWinnerName('');
    setScreen('defeat');
  }, []);

  // ── PvP vs бот ──
  const handlePvpSelectP1 = (char: Character) => {
    const p1 = { ...char, gridX: 2, gridY: 5 };
    const botOptions = CHARACTERS.filter(c => c.id !== char.id);
    const botChar = botOptions[Math.floor(Math.random() * botOptions.length)];
    const botEnemy = charAsEnemy(botChar, 0);
    const state = initBattle([p1], [botEnemy]);
    setBattleState(state);
    setScreen('pvpBattle');
  };

  // ── Локальный PvP ──
  const handleLocalPvpP1 = (char: Character) => {
    setLocalP1({ ...char });
    setScreen('localPvpP2');
  };

  const handleLocalPvpP2 = (char: Character) => {
    if (!localP1) return;
    const state = initLocalPvP({ ...localP1 }, { ...char });
    setBattleState(state);
    setScreen('localPvpBattle');
  };

  const handleLocalPvpEnd = useCallback((state: BattleState) => {
    // Определяем победителя по выжившей команде
    const winner = state.units.find(u => !u.data.isUnconscious && !u.data.isDead);
    setWinnerName(winner ? winner.data.name : '');
    setScreen('victory');
  }, []);

  const isLocalPvp = screen === 'localPvpBattle';

  return (
    <div className="min-h-screen" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {screen === 'mainMenu' && (
        <MainMenu
          onNewGame={() => setScreen('characterSelect')}
          onContinue={() => setScreen('characterSelect')}
          onPvP={() => setScreen('pvpSelect')}
          onLocalPvP={() => setScreen('localPvpP1')}
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

      {screen === 'pvpSelect' && (
        <CharacterSelect
          onSelect={handlePvpSelectP1}
          onBack={() => setScreen('mainMenu')}
          title="PvP vs Бот — Выбери чародея"
          subtitle="Противника выберет бот"
        />
      )}

      {screen === 'localPvpP1' && (
        <CharacterSelect
          onSelect={handleLocalPvpP1}
          onBack={() => setScreen('mainMenu')}
          title="Игрок 1 — Выбери чародея"
          subtitle="Локальный мультиплеер"
        />
      )}

      {screen === 'localPvpP2' && (
        <CharacterSelect
          onSelect={handleLocalPvpP2}
          onBack={() => setScreen('localPvpP1')}
          title="Игрок 2 — Выбери чародея"
          subtitle={`Против: ${localP1?.name}`}
          excludeId={localP1?.id}
        />
      )}

      {(screen === 'battle' || screen === 'pvpBattle' || screen === 'localPvpBattle') && battleState && (
        <BattleScreen
          battleState={battleState}
          onBattleUpdate={setBattleState}
          onVictory={isLocalPvp ? handleLocalPvpEnd : handleVictory}
          onDefeat={handleDefeat}
          isLocalPvp={isLocalPvp}
        />
      )}

      {screen === 'victory' && (
        <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center gap-6">
          <div className="text-6xl">🏆</div>
          {winnerName && (
            <div className="text-cyan-400 text-xl font-mono tracking-widest">{winnerName}</div>
          )}
          <h1 className="text-5xl font-black text-white tracking-widest" style={{ textShadow: '0 0 30px #ffd700' }}>ПОБЕДА!</h1>
          <div className="flex gap-4 mt-4">
            <button onClick={() => setScreen('mainMenu')}
              className="px-8 py-3 rounded-xl font-black text-white tracking-widest bg-purple-700 border border-purple-500 hover:bg-purple-600">
              В меню
            </button>
          </div>
        </div>
      )}

      {screen === 'defeat' && (
        <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center gap-6">
          <div className="text-6xl grayscale opacity-60">💀</div>
          <h1 className="text-5xl font-black text-red-500 tracking-widest" style={{ textShadow: '0 0 30px #ef4444' }}>ПОРАЖЕНИЕ</h1>
          <div className="flex gap-4 mt-4">
            <button onClick={() => setScreen('mainMenu')}
              className="px-8 py-3 rounded-xl font-black text-white tracking-widest bg-red-900 border border-red-600 hover:bg-red-800">
              В меню
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
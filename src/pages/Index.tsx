import React, { useState, useCallback } from 'react';
import { Character, BattleState, Item } from '@/game/types';
import { CHARACTERS, applyLevelUp } from '@/game/characters';
import { initBattle } from '@/game/battleEngine';
import { getEnemyById } from '@/game/enemies';
import { ITEMS } from '@/game/worldData';

import MainMenu from '@/components/game/MainMenu';
import CharacterSelect from '@/components/game/CharacterSelect';
import BattleScreen from '@/components/game/BattleScreen';

type Screen = 'mainMenu' | 'characterSelect' | 'battle' | 'pvpSelect' | 'pvpBattle' | 'victory' | 'defeat';

export default function Index() {
  const [screen, setScreen] = useState<Screen>('mainMenu');
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [gold, setGold] = useState(50);
  const [inventory, setInventory] = useState<Item[]>([{ ...ITEMS[0], quantity: 3 }, { ...ITEMS[1], quantity: 2 }]);
  const [pvpP1, setPvpP1] = useState<Character | null>(null);
  const [pvpP2, setPvpP2] = useState<Character | null>(null);
  const [pvpStep, setPvpStep] = useState<1 | 2>(1);
  const [lastResult, setLastResult] = useState<'victory' | 'defeat' | null>(null);

  // ── Story mode ──
  const handleSelectCharacter = (char: Character) => {
    setSelectedChar({ ...char });
    // Fight 2 weak enemies as first encounter
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
    setGold(g => g + 40);
    setLastResult('victory');
    setScreen('victory');
  }, [selectedChar]);

  const handleDefeat = useCallback(() => {
    setLastResult('defeat');
    setScreen('defeat');
  }, []);

  // ── PvP mode ──
  const handlePvpStart = () => {
    setPvpStep(1);
    setPvpP1(null);
    setPvpP2(null);
    setScreen('pvpSelect');
  };

  const handlePvpSelectP1 = (char: Character) => {
    setPvpP1({ ...char });
    setPvpStep(2);
  };

  const handlePvpSelectP2 = (char: Character) => {
    if (!pvpP1) return;
    const p2 = { ...char, id: char.id + '_p2', color: '#ef4444', gridX: 13, gridY: 5 };
    setPvpP2(p2 as Character);
    const state = initBattle([{ ...pvpP1 }], [{ ...p2, abilityScores: char.abilityScores, skills: char.unlockedSkills, exp: 0, loot: [], challengeRating: 1, isBoss: false, description: '', aiType: 'aggressive' as const } as import('@/game/types').Enemy]);
    setBattleState(state);
    setScreen('pvpBattle');
  };

  return (
    <div className="min-h-screen" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* MAIN MENU */}
      {screen === 'mainMenu' && (
        <MainMenu
          onNewGame={() => setScreen('characterSelect')}
          onContinue={() => setScreen('characterSelect')}
          onPvP={handlePvpStart}
          hasSave={false}
        />
      )}

      {/* CHARACTER SELECT — story */}
      {screen === 'characterSelect' && (
        <CharacterSelect
          onSelect={handleSelectCharacter}
          onBack={() => setScreen('mainMenu')}
          title="Выбери чародея"
        />
      )}

      {/* PvP SELECT */}
      {screen === 'pvpSelect' && (
        <CharacterSelect
          onSelect={pvpStep === 1 ? handlePvpSelectP1 : handlePvpSelectP2}
          onBack={() => setScreen('mainMenu')}
          title={pvpStep === 1 ? 'PvP — Игрок 1' : 'PvP — Игрок 2'}
          subtitle={pvpStep === 1 ? undefined : `Игрок 1: ${pvpP1?.name}`}
        />
      )}

      {/* BATTLE */}
      {(screen === 'battle' || screen === 'pvpBattle') && battleState && (
        <BattleScreen
          battleState={battleState}
          onBattleUpdate={setBattleState}
          onVictory={handleVictory}
          onDefeat={handleDefeat}
        />
      )}

      {/* VICTORY */}
      {screen === 'victory' && (
        <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center gap-6">
          <div className="text-6xl">🏆</div>
          <h1 className="text-5xl font-black text-white tracking-widest" style={{ textShadow: '0 0 30px #ffd700' }}>ПОБЕДА!</h1>
          <div className="text-yellow-400 font-bold">+150 EXP · +40 золота</div>
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

      {/* DEFEAT */}
      {screen === 'defeat' && (
        <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center gap-6">
          <div className="text-6xl grayscale opacity-60">💀</div>
          <h1 className="text-5xl font-black text-red-500 tracking-widest" style={{ textShadow: '0 0 30px #ef4444' }}>ПОРАЖЕНИЕ</h1>
          <div className="flex gap-4 mt-4">
            <button onClick={() => setScreen('characterSelect')}
              className="px-8 py-3 rounded-xl font-black text-white tracking-widest bg-red-900 border border-red-600 hover:bg-red-800">
              🔄 Попробовать снова
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
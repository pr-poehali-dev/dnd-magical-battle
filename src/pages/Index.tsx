import React, { useState, useCallback } from 'react';
import { Character, Location, Enemy, Item, BattleState, Quest } from '@/game/types';
import { initBattle, longRest } from '@/game/battleEngine';
import { applyLevelUp } from '@/game/characters';
import { ITEMS, QUESTS } from '@/game/worldData';
import { XP_THRESHOLDS } from '@/game/dndUtils';

import MainMenu from '@/components/game/MainMenu';
import CharacterSelect from '@/components/game/CharacterSelect';
import WorldMap from '@/components/game/WorldMap';
import BattleScreen from '@/components/game/BattleScreen';
import InventoryScreen from '@/components/game/InventoryScreen';
import QuestsScreen from '@/components/game/QuestsScreen';
import VictoryScreen from '@/components/game/VictoryScreen';
import DefeatScreen from '@/components/game/DefeatScreen';

type Screen = 'mainMenu' | 'characterSelect' | 'worldMap' | 'battle' | 'inventory' | 'quests' | 'victory' | 'defeat';

interface VictoryData {
  enemy: Enemy;
  expGained: number;
  goldGained: number;
  loot: Item[];
  leveledUp: boolean;
  newLevel?: number;
}

const INITIAL_INVENTORY: Item[] = [
  { ...ITEMS[0], quantity: 3 },
  { ...ITEMS[1], quantity: 2 },
  { ...ITEMS[4] },
];

export default function Index() {
  const [screen, setScreen] = useState<Screen>('mainMenu');
  const [character, setCharacter] = useState<Character | null>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [inventory, setInventory] = useState<Item[]>(INITIAL_INVENTORY);
  const [quests, setQuests] = useState<Quest[]>(QUESTS);
  const [gold, setGold] = useState(50);
  const [visitedLocations, setVisitedLocations] = useState<string[]>([]);
  const [locationEnemies, setLocationEnemies] = useState<Enemy[]>([]);
  const [currentEnemyIndex, setCurrentEnemyIndex] = useState(0);
  const [victoryData, setVictoryData] = useState<VictoryData | null>(null);
  const [currentBiome, setCurrentBiome] = useState('urban');

  const handleNewGame = () => setScreen('characterSelect');

  const handleSelectCharacter = (char: Character) => {
    setCharacter({ ...char });
    setScreen('worldMap');
  };

  const handleEnterLocation = useCallback((location: Location, enemies: Enemy[], biome: string) => {
    setCurrentBiome(biome);
    setLocationEnemies(enemies);
    setCurrentEnemyIndex(0);
    if (!visitedLocations.includes(location.id)) {
      setVisitedLocations(prev => [...prev, location.id]);
    }
    if (enemies.length > 0 && character) {
      const state = initBattle({ ...character }, enemies[0], biome);
      setBattleState(state);
      setScreen('battle');
    }
  }, [character, visitedLocations]);

  const handleBattleUpdate = useCallback((state: BattleState) => {
    setBattleState(state);
  }, []);

  const handleVictory = useCallback((expGained: number) => {
    if (!character || !battleState) return;
    const goldGained = Math.floor(expGained * 0.3 + Math.random() * 20);
    const loot: Item[] = [];
    if (Math.random() < 0.45) {
      const idx = Math.floor(Math.random() * (ITEMS.length - 2));
      loot.push({ ...ITEMS[idx], quantity: 1 });
    }

    let updatedChar = {
      ...character,
      exp: character.exp + expGained,
      hp: Math.min(character.maxHp, battleState.player.hp),
      cursedEnergy: battleState.player.cursedEnergy,
      unlockedSkills: battleState.player.unlockedSkills,
    };

    // DnD slow level up
    const didLevelUp = updatedChar.exp >= updatedChar.expToNext && updatedChar.level < 20;
    let newLevel = updatedChar.level;
    if (didLevelUp) {
      updatedChar = applyLevelUp(updatedChar);
      newLevel = updatedChar.level;
    }

    // Quest progress
    const updatedQuests = quests.map(q => {
      if (!q.active || q.completed) return q;
      if (q.type === 'kill') {
        const newProgress = q.progress + 1;
        const completed = newProgress >= q.required;
        if (completed) {
          updatedChar = { ...updatedChar, exp: updatedChar.exp + q.reward.exp };
          setGold(g => g + q.reward.gold);
        }
        return { ...q, progress: newProgress, completed };
      }
      return q;
    });

    if (loot.length > 0) {
      setInventory(prev => {
        const existing = prev.find(i => i.id === loot[0].id);
        if (existing) return prev.map(i => i.id === loot[0].id ? { ...i, quantity: (i.quantity ?? 1) + 1 } : i);
        return [...prev, loot[0]];
      });
    }

    setGold(g => g + goldGained);
    setCharacter(updatedChar);
    setQuests(updatedQuests);
    setVictoryData({
      enemy: battleState.enemy,
      expGained, goldGained, loot,
      leveledUp: didLevelUp,
      newLevel: didLevelUp ? newLevel : undefined,
    });
    setCurrentEnemyIndex(prev => prev + 1);
    setScreen('victory');
  }, [character, battleState, quests]);

  const handleDefeat = useCallback(() => {
    setScreen('defeat');
  }, []);

  const handleVictoryContinue = () => {
    if (!character) return;
    const idx = currentEnemyIndex;
    if (locationEnemies[idx]) {
      const state = initBattle({ ...character }, locationEnemies[idx], currentBiome);
      setBattleState(state);
      setScreen('battle');
    } else {
      // Long rest between locations
      const rested = longRest(character);
      setCharacter(rested);
      setScreen('worldMap');
    }
  };

  const handleRetry = () => {
    if (!character || !locationEnemies.length) return;
    const idx = Math.max(0, currentEnemyIndex - 1);
    const state = initBattle({ ...character }, locationEnemies[idx], currentBiome);
    setBattleState(state);
    setScreen('battle');
  };

  const handleUseItemInBattle = (item: Item) => {
    setInventory(prev =>
      prev.map(i => i.id === item.id ? { ...i, quantity: (i.quantity ?? 1) - 1 } : i)
        .filter(i => (i.quantity ?? 1) > 0)
    );
  };

  const handleEquipItem = (item: Item) => {
    if (!character || !item.stats) return;
    setCharacter({
      ...character,
      attack: character.armorClass + (item.stats.attack ?? 0), // store in AC for now
      armorClass: character.armorClass + (item.stats.defense ?? 0),
      maxHp: character.maxHp + (item.stats.hp ?? 0),
      hp: Math.min(character.maxHp + (item.stats.hp ?? 0), character.hp + (item.stats.hp ?? 0)),
      maxCursedEnergy: character.maxCursedEnergy + Math.floor((item.stats.mana ?? 0) / 20),
    });
    setInventory(prev => prev.filter(i => i.id !== item.id));
  };

  return (
    <div className="min-h-screen" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {screen === 'mainMenu' && (
        <MainMenu onNewGame={handleNewGame} onContinue={() => setScreen('worldMap')} hasSave={character !== null} />
      )}
      {screen === 'characterSelect' && (
        <CharacterSelect onSelect={handleSelectCharacter} onBack={() => setScreen('mainMenu')} />
      )}
      {screen === 'worldMap' && character && (
        <WorldMap
          character={character}
          visitedLocations={visitedLocations}
          onEnterLocation={handleEnterLocation}
          onOpenInventory={() => setScreen('inventory')}
          onOpenQuests={() => setScreen('quests')}
          gold={gold}
        />
      )}
      {screen === 'battle' && battleState && character && (
        <BattleScreen
          battleState={battleState}
          onBattleUpdate={handleBattleUpdate}
          onVictory={handleVictory}
          onDefeat={handleDefeat}
          inventory={inventory.filter(i => i.usable)}
          onUseItem={handleUseItemInBattle}
        />
      )}
      {screen === 'inventory' && character && (
        <InventoryScreen
          inventory={inventory}
          character={character}
          gold={gold}
          onBack={() => setScreen('worldMap')}
          onEquip={handleEquipItem}
        />
      )}
      {screen === 'quests' && (
        <QuestsScreen quests={quests} onBack={() => setScreen('worldMap')} />
      )}
      {screen === 'victory' && victoryData && character && (
        <VictoryScreen
          character={character}
          enemy={victoryData.enemy}
          expGained={victoryData.expGained}
          goldGained={victoryData.goldGained}
          loot={victoryData.loot}
          leveledUp={victoryData.leveledUp}
          onContinue={handleVictoryContinue}
        />
      )}
      {screen === 'defeat' && battleState && character && (
        <DefeatScreen
          character={character}
          enemy={battleState.enemy}
          onRetry={handleRetry}
          onReturnToMap={() => setScreen('worldMap')}
        />
      )}
    </div>
  );
}

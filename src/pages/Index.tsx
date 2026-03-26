import React, { useState, useCallback } from 'react';
import { Character, Location, Enemy, Item, BattleState, Quest } from '@/game/types';
import { initBattle } from '@/game/battleEngine';
import { ITEMS, QUESTS } from '@/game/worldData';

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
}

const INITIAL_INVENTORY: Item[] = [
  { ...ITEMS[0], quantity: 3 },
  { ...ITEMS[1], quantity: 2 },
  { ...ITEMS[4] },
];

const levelUp = (char: Character): Character => {
  const newLevel = char.level + 1;
  return {
    ...char,
    level: newLevel,
    exp: char.exp - char.expToNext,
    expToNext: Math.floor(char.expToNext * 1.4),
    maxHp: char.maxHp + 20,
    hp: char.maxHp + 20,
    maxMana: char.maxMana + 10,
    mana: char.maxMana + 10,
    attack: char.attack + 3,
    defense: char.defense + 2,
    speed: char.speed + 1,
  };
};

export default function Index() {
  const [screen, setScreen] = useState<Screen>('mainMenu');
  const [character, setCharacter] = useState<Character | null>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [inventory, setInventory] = useState<Item[]>(INITIAL_INVENTORY);
  const [quests, setQuests] = useState<Quest[]>(QUESTS);
  const [gold, setGold] = useState(100);
  const [visitedLocations, setVisitedLocations] = useState<string[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [locationEnemies, setLocationEnemies] = useState<Enemy[]>([]);
  const [currentEnemyIndex, setCurrentEnemyIndex] = useState(0);
  const [victoryData, setVictoryData] = useState<VictoryData | null>(null);

  const handleNewGame = () => setScreen('characterSelect');

  const handleSelectCharacter = (char: Character) => {
    setCharacter({ ...char });
    setScreen('worldMap');
  };

  const handleEnterLocation = useCallback((location: Location, enemies: Enemy[]) => {
    setCurrentLocation(location);
    setLocationEnemies(enemies);
    setCurrentEnemyIndex(0);
    if (!visitedLocations.includes(location.id)) {
      setVisitedLocations(prev => [...prev, location.id]);
    }
    if (enemies.length > 0 && character) {
      const state = initBattle({ ...character }, enemies[0]);
      setBattleState(state);
      setScreen('battle');
    }
  }, [character, visitedLocations]);

  const handleBattleUpdate = useCallback((state: BattleState) => {
    setBattleState(state);
  }, []);

  const handleVictory = useCallback((expGained: number) => {
    if (!character || !battleState) return;
    const goldGained = Math.floor(expGained * 0.4);
    const loot: Item[] = [];
    if (Math.random() < 0.5) {
      const randItem = ITEMS[Math.floor(Math.random() * (ITEMS.length - 2))];
      loot.push({ ...randItem, quantity: 1 });
    }

    let updatedChar = {
      ...character,
      exp: character.exp + expGained,
      hp: Math.min(character.maxHp, character.hp + 30),
      mana: Math.min(character.maxMana, character.mana + 20),
    };
    const didLevelUp = updatedChar.exp >= updatedChar.expToNext;
    if (didLevelUp) updatedChar = levelUp(updatedChar);

    const updatedQuests = quests.map(q => {
      if (!q.active || q.completed) return q;
      if (q.type === 'kill') {
        const newProgress = q.progress + 1;
        const completed = newProgress >= q.required;
        if (completed) {
          updatedChar = { ...updatedChar, exp: updatedChar.exp + q.reward.exp };
          setGold(g => g + goldGained + q.reward.gold);
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
    setVictoryData({ enemy: battleState.enemy, expGained, goldGained, loot, leveledUp: didLevelUp });
    setCurrentEnemyIndex(prev => prev + 1);
    setScreen('victory');
  }, [character, battleState, quests]);

  const handleDefeat = useCallback(() => {
    setScreen('defeat');
  }, []);

  const handleVictoryContinue = () => {
    if (!character) return;
    if (locationEnemies[currentEnemyIndex]) {
      const state = initBattle({ ...character }, locationEnemies[currentEnemyIndex]);
      setBattleState(state);
      setScreen('battle');
    } else {
      setScreen('worldMap');
    }
  };

  const handleRetry = () => {
    if (!character || !locationEnemies.length) return;
    const idx = Math.max(0, currentEnemyIndex - 1);
    const state = initBattle({ ...character }, locationEnemies[idx]);
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
      attack: character.attack + (item.stats.attack ?? 0),
      defense: character.defense + (item.stats.defense ?? 0),
      maxHp: character.maxHp + (item.stats.hp ?? 0),
      hp: Math.min(character.maxHp + (item.stats.hp ?? 0), character.hp + (item.stats.hp ?? 0)),
      maxMana: character.maxMana + (item.stats.mana ?? 0),
      mana: Math.min(character.maxMana + (item.stats.mana ?? 0), character.mana + (item.stats.mana ?? 0)),
    });
    setInventory(prev => prev.filter(i => i.id !== item.id));
  };

  return (
    <div className="min-h-screen" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {screen === 'mainMenu' && (
        <MainMenu
          onNewGame={handleNewGame}
          onContinue={() => setScreen('worldMap')}
          hasSave={character !== null}
        />
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

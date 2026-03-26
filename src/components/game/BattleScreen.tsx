import React, { useEffect, useRef, useState } from 'react';
import { BattleState, Character, Enemy, Skill, Item } from '@/game/types';
import { playerAttack, enemyAttack, playerDefend, checkBattleEnd, useItem as applyItem } from '@/game/battleEngine';

interface Props {
  battleState: BattleState;
  onBattleUpdate: (state: BattleState) => void;
  onVictory: (expGained: number) => void;
  onDefeat: () => void;
  inventory: Item[];
  onUseItem: (item: Item) => void;
}

const HP_BAR = ({ hp, maxHp, color, label }: { hp: number; maxHp: number; color: string; label: string }) => {
  const pct = Math.max(0, (hp / maxHp) * 100);
  const barColor = pct > 60 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span style={{ color }}>{label}</span>
        <span className="text-white font-bold">{hp}/{maxHp}</span>
      </div>
      <div className="h-3 bg-white/10 rounded-full overflow-hidden border border-white/10">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: barColor, boxShadow: `0 0 8px ${barColor}` }}
        />
      </div>
    </div>
  );
};

const MANA_BAR = ({ mana, maxMana }: { mana: number; maxMana: number }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs font-mono">
      <span className="text-blue-400">МАНА</span>
      <span className="text-white font-bold">{mana}/{maxMana}</span>
    </div>
    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
      <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${(mana / maxMana) * 100}%` }} />
    </div>
  </div>
);

const SKILL_BUTTON = ({
  skill, color, onUse, disabled, playerMana
}: { skill: Skill; color: string; onUse: () => void; disabled: boolean; playerMana: number }) => {
  const canAfford = playerMana >= skill.manaCost;
  const onCooldown = skill.currentCooldown > 0;
  const isDisabled = disabled || !canAfford || onCooldown;

  return (
    <button
      onClick={onUse}
      disabled={isDisabled}
      className="relative flex flex-col p-2 rounded-xl border text-left transition-all duration-150 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
      style={{
        borderColor: isDisabled ? '#333' : (skill.isUltimate ? '#ff0040' : color),
        backgroundColor: skill.isUltimate ? '#1a0010' : `${color}10`,
        boxShadow: !isDisabled && skill.isUltimate ? '0 0 15px #ff004030' : 'none',
      }}
    >
      {skill.isUltimate && !isDisabled && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center animate-pulse">!</div>
      )}
      <div className="flex justify-between items-start gap-1 mb-0.5">
        <span className="text-white text-xs font-bold leading-tight">{skill.name}</span>
        {onCooldown && (
          <span className="text-orange-400 text-xs font-mono flex-shrink-0">⏱{skill.currentCooldown}</span>
        )}
      </div>
      <div className="flex gap-2 text-xs font-mono">
        <span className="text-red-400">⚔{skill.damage}</span>
        <span className={canAfford ? 'text-blue-400' : 'text-red-600'}>{skill.manaCost}MP</span>
        {skill.isUltimate && <span className="text-yellow-400">УЛЬТ</span>}
      </div>
    </button>
  );
};

export default function BattleScreen({ battleState, onBattleUpdate, onVictory, onDefeat, inventory, onUseItem }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [animating, setAnimating] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [shakePlayer, setShakePlayer] = useState(false);
  const [shakeEnemy, setShakeEnemy] = useState(false);
  const [prevEnemyHp, setPrevEnemyHp] = useState(battleState.enemy.hp);
  const [prevPlayerHp, setPrevPlayerHp] = useState(battleState.player.hp);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [battleState.log]);

  useEffect(() => {
    if (battleState.enemy.hp < prevEnemyHp) {
      setShakeEnemy(true);
      setTimeout(() => setShakeEnemy(false), 400);
    }
    if (battleState.player.hp < prevPlayerHp) {
      setShakePlayer(true);
      setTimeout(() => setShakePlayer(false), 400);
    }
    setPrevEnemyHp(battleState.enemy.hp);
    setPrevPlayerHp(battleState.player.hp);
  }, [battleState.enemy.hp, battleState.player.hp]);

  useEffect(() => {
    if (battleState.turn === 'enemy' && battleState.phase === 'animation') {
      setAnimating(true);
      const timer = setTimeout(() => {
        const result = checkBattleEnd(battleState);
        if (result === 'enemy_win') { onDefeat(); return; }
        const newState = enemyAttack(battleState);
        const endResult = checkBattleEnd(newState);
        setAnimating(false);
        if (endResult === 'player_win') {
          onBattleUpdate(newState);
          setTimeout(() => onVictory(battleState.enemy.exp), 600);
        } else if (endResult === 'enemy_win') {
          onBattleUpdate(newState);
          setTimeout(() => onDefeat(), 600);
        } else {
          onBattleUpdate(newState);
        }
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [battleState.turn, battleState.phase]);

  const handleSkill = (skill: Skill) => {
    if (animating || battleState.turn !== 'player') return;
    const newState = playerAttack(battleState, skill);
    if (newState === battleState) return;
    const result = checkBattleEnd(newState);
    if (result === 'player_win') {
      onBattleUpdate(newState);
      setTimeout(() => onVictory(battleState.enemy.exp), 800);
    } else {
      onBattleUpdate({ ...newState, phase: 'animation' });
    }
  };

  const handleDefend = () => {
    if (animating || battleState.turn !== 'player') return;
    const newState = playerDefend(battleState);
    onBattleUpdate({ ...newState, phase: 'animation' });
  };

  const handleItem = (item: Item) => {
    if (!item.effect) return;
    const newState = applyItem(battleState, item.effect);
    onBattleUpdate(newState);
    onUseItem(item);
    setShowInventory(false);
  };

  const { player, enemy } = battleState;
  const isPlayerTurn = battleState.turn === 'player' && !animating;

  const logColors: Record<string, string> = {
    player: '#60a5fa', enemy: '#f87171', system: '#a78bfa',
    combo: '#fbbf24', critical: '#ff4757'
  };

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* Battle header */}
      <div className="border-b border-purple-900/40 px-4 py-2 flex items-center justify-between">
        <div className="text-purple-400 font-mono text-xs tracking-widest">
          ⚔ РАУНд {battleState.round} · {battleState.turn === 'player' ? 'ВАШ ХОД' : 'АТАКА ВРАГА'}
        </div>
        {battleState.comboCount > 1 && (
          <div className="text-yellow-400 font-black text-sm animate-pulse">
            🔥 КОМБО ×{battleState.comboCount}
          </div>
        )}
        <div className="text-purple-600 text-xs font-mono">
          {enemy.isBoss ? '👑 БОСС' : ''}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-4 p-4">
        {/* Battle arena */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Combatants */}
          <div className="flex gap-4">
            {/* Player */}
            <div
              className="flex-1 p-4 rounded-2xl border transition-all duration-300"
              style={{
                borderColor: `${player.color}50`,
                backgroundColor: `${player.color}08`,
                boxShadow: isPlayerTurn ? `0 0 20px ${player.color}20` : 'none',
                transform: shakePlayer ? 'translateX(-8px)' : 'translateX(0)',
                transition: shakePlayer ? 'transform 0.1s' : 'transform 0.3s',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"
                  style={{
                    backgroundColor: `${player.color}20`,
                    border: `1px solid ${player.color}60`,
                  }}
                >
                  {player.emoji}
                </div>
                <div>
                  <div className="text-white font-black">{player.name}</div>
                  <div className="text-xs" style={{ color: player.color }}>Ур. {player.level}</div>
                  {battleState.isPlayerDefending && (
                    <div className="text-cyan-400 text-xs font-bold">🛡 ЗАЩИТА</div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <HP_BAR hp={player.hp} maxHp={player.maxHp} color="#22c55e" label="HP" />
                <MANA_BAR mana={player.mana} maxMana={player.maxMana} />
              </div>
              {battleState.playerStatusEffects.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {battleState.playerStatusEffects.map((e, i) => (
                    <span key={i} className="text-xs px-1.5 py-0.5 bg-purple-900/50 rounded text-purple-300 border border-purple-700/30">
                      {e.type} {e.duration}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* VS */}
            <div className="flex items-center justify-center px-2">
              <div className="text-purple-500 font-black text-xl">VS</div>
            </div>

            {/* Enemy */}
            <div
              className="flex-1 p-4 rounded-2xl border transition-all duration-300"
              style={{
                borderColor: enemy.isBoss ? '#ff004050' : '#7f1d1d50',
                backgroundColor: enemy.isBoss ? '#1a000810' : '#0a000510',
                boxShadow: !isPlayerTurn && animating ? '0 0 20px #ff000020' : 'none',
                transform: shakeEnemy ? 'translateX(8px)' : 'translateX(0)',
                transition: shakeEnemy ? 'transform 0.1s' : 'transform 0.3s',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"
                  style={{
                    backgroundColor: '#1a0008',
                    border: `1px solid ${enemy.isBoss ? '#ff0040' : '#7f1d1d'}`,
                    boxShadow: enemy.isBoss ? '0 0 15px #ff004030' : 'none',
                  }}
                >
                  {enemy.emoji}
                </div>
                <div>
                  <div className="text-white font-black">{enemy.name}</div>
                  {enemy.isBoss && <div className="text-red-400 text-xs font-bold animate-pulse">ОСОБЫЙ РАНГ</div>}
                  <div className="text-red-500/70 text-xs">{enemy.description.substring(0, 40)}...</div>
                </div>
              </div>
              <HP_BAR hp={enemy.hp} maxHp={enemy.maxHp} color="#ef4444" label="HP" />
              {battleState.enemyStatusEffects.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {battleState.enemyStatusEffects.map((e, i) => (
                    <span key={i} className="text-xs px-1.5 py-0.5 bg-red-900/50 rounded text-red-300 border border-red-700/30">
                      {e.type} {e.duration}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Skills area */}
          <div className="p-4 bg-white/3 rounded-2xl border border-purple-900/30">
            <div className="flex items-center justify-between mb-3">
              <div className="text-purple-400 text-xs font-mono tracking-widest uppercase">
                {isPlayerTurn ? '— ВЫБЕРИ ДЕЙСТВИЕ —' : '— ОЖИДАНИЕ —'}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDefend}
                  disabled={!isPlayerTurn}
                  className="px-3 py-1.5 bg-cyan-900/40 border border-cyan-700/50 text-cyan-300 rounded-lg text-xs font-bold hover:bg-cyan-800/60 transition-colors disabled:opacity-40"
                >
                  🛡 Защита
                </button>
                <button
                  onClick={() => setShowInventory(!showInventory)}
                  className="px-3 py-1.5 bg-green-900/40 border border-green-700/50 text-green-300 rounded-lg text-xs font-bold hover:bg-green-800/60 transition-colors"
                >
                  🎒 Предметы
                </button>
              </div>
            </div>

            {showInventory ? (
              <div>
                <div className="text-gray-400 text-xs mb-2">Использовать предмет:</div>
                <div className="grid grid-cols-3 gap-2">
                  {inventory.filter(i => i.usable).map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleItem(item)}
                      className="p-2 bg-green-900/20 border border-green-700/30 rounded-xl text-left hover:bg-green-800/40 transition-colors"
                    >
                      <div className="text-lg">{item.emoji}</div>
                      <div className="text-green-300 text-xs font-bold">{item.name}</div>
                      <div className="text-gray-500 text-xs">×{item.quantity}</div>
                    </button>
                  ))}
                  {inventory.filter(i => i.usable).length === 0 && (
                    <div className="col-span-3 text-gray-600 text-sm text-center py-4">
                      Нет расходников
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {player.skills.map(skill => (
                  <SKILL_BUTTON
                    key={skill.id}
                    skill={skill}
                    color={player.color}
                    onUse={() => handleSkill(skill)}
                    disabled={!isPlayerTurn}
                    playerMana={player.mana}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Battle log */}
        <div className="w-64 flex flex-col">
          <div className="text-purple-400 text-xs font-mono tracking-widest uppercase mb-2 px-2">
            — ЛОГ БИТВЫ —
          </div>
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto space-y-1 pr-1"
            style={{ maxHeight: '500px' }}
          >
            {battleState.log.map(log => (
              <div
                key={log.id}
                className="text-xs px-2 py-1.5 rounded-lg border border-transparent"
                style={{
                  color: logColors[log.type] ?? '#888',
                  backgroundColor: log.type === 'critical' ? '#ff000015' : log.type === 'combo' ? '#fbbf2415' : 'transparent',
                  borderColor: log.type === 'critical' ? '#ff000030' : log.type === 'combo' ? '#fbbf2430' : 'transparent',
                }}
              >
                {log.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Enemy animation indicator */}
      {animating && battleState.turn === 'enemy' && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-10">
          <div className="text-6xl animate-bounce opacity-60">{enemy.emoji}</div>
        </div>
      )}
    </div>
  );
}
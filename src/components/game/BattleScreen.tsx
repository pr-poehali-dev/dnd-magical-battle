import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BattleState, Skill, Item, GRID_COLS, GRID_ROWS } from '@/game/types';
import {
  movePlayer, executeSkill, endPlayerTurn, enemyTurn,
  checkBattleEnd, makeDeathSave, applyItemInBattle
} from '@/game/battleEngine';
import { getReachableCells, getAttackRangeCells, getModifier } from '@/game/dndUtils';

interface Props {
  battleState: BattleState;
  onBattleUpdate: (state: BattleState) => void;
  onVictory: (expGained: number) => void;
  onDefeat: () => void;
  inventory: Item[];
  onUseItem: (item: Item) => void;
}

const BIOME_COLORS: Record<string, { bg: string; grid: string; accent: string }> = {
  urban:   { bg: '#0a0f1a', grid: '#1a2a3a', accent: '#2a4a6a' },
  forest:  { bg: '#0a1a0a', grid: '#1a2a1a', accent: '#2a4a2a' },
  dungeon: { bg: '#1a0a1a', grid: '#2a1a2a', accent: '#4a2a4a' },
  prison:  { bg: '#1a1a0a', grid: '#2a2a1a', accent: '#4a4a2a' },
  void:    { bg: '#05050f', grid: '#0f0f20', accent: '#1f1f40' },
  palace:  { bg: '#1a0a05', grid: '#2a1a05', accent: '#4a2a08' },
  ocean:   { bg: '#050f1a', grid: '#0a1f3a', accent: '#0a304a' },
  school:  { bg: '#0f0f0f', grid: '#1a1a2a', accent: '#2a2a4a' },
};

const ACTION_COLORS = {
  action: '#ef4444',
  bonus_action: '#f59e0b',
  reaction: '#6366f1',
  free: '#6b7280',
};

const EFFECT_COLORS: Record<string, string> = {
  stun: '#fbbf24', bleed: '#ef4444', curse: '#a855f7',
  weakened: '#f97316', grappled: '#6b7280', blessed: '#22c55e',
  empowered: '#00d4ff', frightened: '#ec4899', burn: '#ff6b35',
};

const rollVisual = (rolls: number[], die: string, total: number) =>
  `[${rolls.join('+')}]=${total} (${die})`;

export default function BattleScreen({
  battleState, onBattleUpdate, onVictory, onDefeat, inventory, onUseItem
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [movementMode, setMovementMode] = useState(false);
  const [reachable, setReachable] = useState<{ x: number; y: number }[]>([]);
  const [attackRange, setAttackRange] = useState<{ x: number; y: number }[]>([]);
  const [showInventory, setShowInventory] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [deathSaveMode, setDeathSaveMode] = useState(false);
  const [biome, setBiome] = useState('urban');
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);

  const colors = BIOME_COLORS[biome] ?? BIOME_COLORS.urban;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battleState.log]);

  // Compute reachable / attack range cells when mode changes
  useEffect(() => {
    if (movementMode) {
      const cells = getReachableCells(
        battleState.player.gridX, battleState.player.gridY,
        battleState.playerActions.movementLeft,
        GRID_COLS, GRID_ROWS
      ).filter(c => !(c.x === battleState.player.gridX && c.y === battleState.player.gridY));
      setReachable(cells);
      setAttackRange([]);
    } else if (selectedSkill) {
      const cells = getAttackRangeCells(
        battleState.player.gridX, battleState.player.gridY,
        selectedSkill.range, GRID_COLS, GRID_ROWS
      );
      setAttackRange(cells);
      setReachable([]);
    } else {
      setReachable([]);
      setAttackRange([]);
    }
  }, [movementMode, selectedSkill, battleState.player.gridX, battleState.player.gridY, battleState.playerActions.movementLeft]);

  // Enemy turn automation
  useEffect(() => {
    if (battleState.turn !== 'enemy' || processing) return;
    setProcessing(true);
    const timer = setTimeout(() => {
      const result = checkBattleEnd(battleState);
      if (result === 'player_win') { onVictory(battleState.enemy.exp); setProcessing(false); return; }
      if (result === 'player_dying') { setDeathSaveMode(true); setProcessing(false); return; }

      const newState = enemyTurn(battleState);
      const endResult = checkBattleEnd(newState);
      onBattleUpdate(newState);
      setProcessing(false);

      if (endResult === 'player_win') { setTimeout(() => onVictory(newState.enemy.exp), 400); }
      else if (endResult === 'player_dying') { setDeathSaveMode(true); }
      else if (endResult === 'enemy_win') { onDefeat(); }
    }, 1200);
    return () => clearTimeout(timer);
  }, [battleState.turn]);

  const handleCellClick = (x: number, y: number) => {
    if (battleState.turn !== 'player' || processing) return;

    if (movementMode) {
      const isReachable = reachable.some(c => c.x === x && c.y === y);
      if (isReachable) {
        onBattleUpdate(movePlayer(battleState, x, y));
        setMovementMode(false);
      }
      return;
    }

    if (selectedSkill) {
      // If clicking on enemy cell — execute skill
      if (x === battleState.enemy.gridX && y === battleState.enemy.gridY) {
        const newState = executeSkill(battleState, selectedSkill);
        const endResult = checkBattleEnd(newState);
        onBattleUpdate(newState);
        setSelectedSkill(null);
        if (endResult === 'player_win') { setTimeout(() => onVictory(newState.enemy.exp), 400); }
      }
    }
  };

  const handleSkillClick = (skill: Skill) => {
    if (battleState.turn !== 'player' || processing) return;
    if (selectedSkill?.id === skill.id) {
      setSelectedSkill(null);
      setMovementMode(false);
    } else {
      setSelectedSkill(skill);
      setMovementMode(false);
    }
  };

  const handleEndTurn = () => {
    if (battleState.turn !== 'player' || processing) return;
    setSelectedSkill(null);
    setMovementMode(false);
    onBattleUpdate(endPlayerTurn(battleState));
  };

  const handleDeathSave = () => {
    const { state: newState, result } = makeDeathSave(battleState);
    onBattleUpdate(newState);
    if (result === 'dead') { setDeathSaveMode(false); onDefeat(); }
    else if (result === 'stable') { setDeathSaveMode(false); }
  };

  const handleItemUse = (item: Item) => {
    if (!item.effect) return;
    onBattleUpdate(applyItemInBattle(battleState, item.effect));
    onUseItem(item);
    setShowInventory(false);
  };

  const { player, enemy, playerActions } = battleState;
  const isPlayerTurn = battleState.turn === 'player' && !processing;
  const hpPct = (hp: number, max: number) => Math.max(0, (hp / max) * 100);

  const CELL_PX = 56;
  const gridW = GRID_COLS * CELL_PX;
  const gridH = GRID_ROWS * CELL_PX;

  const logColors: Record<string, string> = {
    player: '#60a5fa', enemy: '#f87171', system: '#9ca3af',
    combo: '#fbbf24', critical: '#ff4757', miss: '#6b7280', save: '#a855f7'
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.bg, fontFamily: 'Rajdhani, sans-serif' }}>

      {/* ─── TOP HUD ─── */}
      <div className="border-b px-4 py-2 flex items-center gap-4 flex-wrap"
        style={{ borderColor: '#ffffff10', backgroundColor: '#ffffff05' }}>

        {/* Player stats */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${player.color}20`, border: `1px solid ${player.color}60` }}>
            {player.emoji}
          </div>
          <div className="space-y-1">
            <div className="flex gap-2 items-center">
              <span className="text-white font-black text-sm">{player.name}</span>
              <span className="text-xs px-1 rounded font-mono" style={{ color: player.color, backgroundColor: `${player.color}20` }}>
                Ур.{player.level}
              </span>
            </div>
            {/* HP bar */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-green-400 w-6">HP</span>
              <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${hpPct(player.hp, player.maxHp)}%`,
                    backgroundColor: player.hp / player.maxHp > 0.5 ? '#22c55e' : player.hp / player.maxHp > 0.25 ? '#f59e0b' : '#ef4444' }} />
              </div>
              <span className="text-xs text-white font-mono">{player.hp}/{player.maxHp}</span>
              {player.tempHp > 0 && <span className="text-xs text-cyan-400 font-mono">+{player.tempHp}</span>}
            </div>
            {/* CE bar */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-purple-400 w-6">ПЭ</span>
              <div className="flex gap-0.5">
                {Array.from({ length: player.maxCursedEnergy }).map((_, i) => (
                  <div key={i} className="w-3 h-3 rounded-sm border transition-colors"
                    style={{ backgroundColor: i < player.cursedEnergy ? '#a855f7' : 'transparent', borderColor: '#a855f740' }} />
                ))}
              </div>
              <span className="text-xs text-purple-400 font-mono">{player.cursedEnergy}/{player.maxCursedEnergy}</span>
            </div>
          </div>
        </div>

        {/* Action tracker */}
        <div className="flex gap-2 items-center ml-2">
          <div className={`px-2 py-1 rounded text-xs font-bold border transition-all ${playerActions.hasAction ? 'border-red-500 text-red-400' : 'border-white/10 text-white/20 line-through'}`}>
            ⚔ ДЕЙСТВИЕ
          </div>
          <div className={`px-2 py-1 rounded text-xs font-bold border transition-all ${playerActions.hasBonusAction ? 'border-yellow-500 text-yellow-400' : 'border-white/10 text-white/20 line-through'}`}>
            ✨ БОНУС
          </div>
          <div className={`px-2 py-1 rounded text-xs font-bold border transition-all ${playerActions.hasReaction ? 'border-indigo-500 text-indigo-400' : 'border-white/10 text-white/20 line-through'}`}>
            🛡 РЕАКЦИЯ
          </div>
          <div className="px-2 py-1 rounded text-xs font-bold border border-blue-500/50 text-blue-400">
            👟 {playerActions.movementLeft} фут.
          </div>
        </div>

        {/* Round / turn */}
        <div className="ml-auto flex items-center gap-3">
          <div className="text-purple-400 font-mono text-xs">Раунд {battleState.round}</div>
          <div className={`px-3 py-1 rounded-lg text-xs font-black tracking-widest ${isPlayerTurn ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50' : 'bg-red-600/30 text-red-300 border border-red-500/50'}`}>
            {isPlayerTurn ? '▶ ВАШ ХОД' : '⚔ ХОД ВРАГА'}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── GRID ─── */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
          <div className="relative" style={{ width: gridW, height: gridH }}>
            {battleState.grid.map((row, y) =>
              row.map((cell, x) => {
                const isPlayer = x === player.gridX && y === player.gridY;
                const isEnemy = x === enemy.gridX && y === enemy.gridY;
                const isReach = reachable.some(c => c.x === x && c.y === y);
                const isRange = attackRange.some(c => c.x === x && c.y === y);
                const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;
                const isEnemyInRange = isRange && isEnemy;

                return (
                  <div
                    key={`${x}-${y}`}
                    className="absolute cursor-pointer transition-all duration-100 flex items-center justify-center text-lg select-none"
                    style={{
                      left: x * CELL_PX, top: y * CELL_PX,
                      width: CELL_PX, height: CELL_PX,
                      backgroundColor: isPlayer ? `${player.color}25`
                        : isEnemy ? '#ef444415'
                        : isReach ? '#3b82f620'
                        : isEnemyInRange ? '#ef444420'
                        : isRange ? '#f59e0b10'
                        : cell.terrain === 'hazard' ? '#ff000020'
                        : cell.terrain === 'difficult' ? '#f59e0b08'
                        : 'transparent',
                      border: `1px solid ${
                        isPlayer ? `${player.color}60`
                        : isEnemy ? '#ef444450'
                        : isEnemyInRange ? '#ef444470'
                        : isReach ? '#3b82f650'
                        : isRange ? '#f59e0b30'
                        : isHovered ? '#ffffff20'
                        : colors.grid + '80'
                      }`,
                      boxShadow: isPlayer ? `0 0 12px ${player.color}40` : isEnemy && battleState.enemyStatusEffects.length > 0 ? '0 0 12px #a855f740' : 'none',
                      transform: isHovered && (isReach || isEnemyInRange) ? 'scale(1.05)' : 'scale(1)',
                    }}
                    onClick={() => handleCellClick(x, y)}
                    onMouseEnter={() => setHoveredCell({ x, y })}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    {isPlayer ? (
                      <span style={{ fontSize: 22, filter: `drop-shadow(0 0 6px ${player.color})` }}>{player.emoji}</span>
                    ) : isEnemy ? (
                      <div className="flex flex-col items-center gap-0">
                        <span style={{ fontSize: 22, filter: enemy.isBoss ? 'drop-shadow(0 0 8px #ff0040)' : 'none' }}>{enemy.emoji}</span>
                        <div className="w-8 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-red-500" style={{ width: `${hpPct(enemy.hp, enemy.maxHp)}%` }} />
                        </div>
                      </div>
                    ) : cell.decoration ? (
                      <span className="text-base opacity-70">{cell.decoration}</span>
                    ) : null}

                    {/* Move indicator */}
                    {isReach && !isPlayer && !isEnemy && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-blue-400 opacity-60" />
                      </div>
                    )}
                    {/* Attack indicator */}
                    {isEnemyInRange && (
                      <div className="absolute inset-0 rounded flex items-center justify-center pointer-events-none">
                        <div className="text-red-400 text-xs font-bold animate-pulse">⚔</div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Grid legend */}
            <div className="absolute -bottom-6 left-0 text-xs font-mono opacity-40 text-white">
              1 клетка = 5 фут.
            </div>
          </div>
        </div>

        {/* ─── RIGHT PANEL ─── */}
        <div className="w-72 border-l flex flex-col overflow-hidden" style={{ borderColor: '#ffffff10', backgroundColor: '#ffffff03' }}>

          {/* Enemy info */}
          <div className="p-3 border-b" style={{ borderColor: '#ffffff10' }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: 24, filter: enemy.isBoss ? 'drop-shadow(0 0 6px #ff0040)' : 'none' }}>{enemy.emoji}</span>
              <div>
                <div className="text-white font-black text-sm">{enemy.name}</div>
                <div className="text-xs font-mono" style={{ color: enemy.isBoss ? '#ff4040' : '#888' }}>
                  {enemy.isBoss ? '👑 ОСОБЫЙ РАНГ' : `CR ${enemy.challengeRating}`} · КБ {enemy.armorClass}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-red-400">HP</span>
                <span className="text-white">{enemy.hp}/{enemy.maxHp}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${hpPct(enemy.hp, enemy.maxHp)}%`,
                    backgroundColor: enemy.hp / enemy.maxHp > 0.5 ? '#ef4444' : '#991b1b',
                    boxShadow: enemy.hp / enemy.maxHp < 0.3 ? '0 0 8px #ef4444' : 'none' }} />
              </div>
            </div>
            {battleState.enemyStatusEffects.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-2">
                {battleState.enemyStatusEffects.map((e, i) => (
                  <span key={i} className="text-xs px-1.5 py-0.5 rounded font-bold"
                    style={{ backgroundColor: `${EFFECT_COLORS[e.type] ?? '#888'}20`, color: EFFECT_COLORS[e.type] ?? '#888' }}>
                    {e.type} {e.duration}р
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Skills */}
          {!showInventory ? (
            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
              <div className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">
                — Техники ({player.unlockedSkills.length}/{player.allSkills.length}) —
              </div>

              {player.unlockedSkills.map(sk => {
                const canAfford = player.cursedEnergy >= sk.energyCost;
                const onCd = sk.currentCooldown > 0;
                const actionAvail = sk.actionCost === 'action' ? playerActions.hasAction
                  : sk.actionCost === 'bonus_action' ? playerActions.hasBonusAction
                  : sk.actionCost === 'reaction' ? playerActions.hasReaction
                  : true;
                const isActive = selectedSkill?.id === sk.id;
                const isDisabled = !isPlayerTurn || !canAfford || onCd || !actionAvail;

                return (
                  <button
                    key={sk.id}
                    onClick={() => handleSkillClick(sk)}
                    disabled={isDisabled}
                    className="w-full p-2.5 rounded-xl border text-left transition-all duration-150 hover:scale-[1.02] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:scale-100"
                    style={{
                      borderColor: isActive ? player.color : sk.isUltimate ? '#ff004050' : '#ffffff15',
                      backgroundColor: isActive ? `${player.color}20` : sk.isUltimate ? '#1a000810' : '#ffffff05',
                      boxShadow: isActive ? `0 0 12px ${player.color}40` : 'none',
                    }}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="text-white text-xs font-black leading-tight">{sk.name}</span>
                      <div className="flex gap-1 flex-shrink-0">
                        <span className="text-xs px-1 rounded font-bold"
                          style={{ backgroundColor: `${ACTION_COLORS[sk.actionCost]}20`, color: ACTION_COLORS[sk.actionCost] }}>
                          {sk.actionCost === 'action' ? 'Д' : sk.actionCost === 'bonus_action' ? 'Б' : sk.actionCost === 'reaction' ? 'Р' : 'С'}
                        </span>
                        {onCd && <span className="text-orange-400 text-xs font-mono">⏱{sk.currentCooldown}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs font-mono flex-wrap">
                      <span className="text-red-400">
                        {sk.damageDice.count}к{sk.damageDice.die.slice(1)}
                        {sk.damageDice.modifier > 0 ? `+${sk.damageDice.modifier}` : ''}
                        {sk.isHeal ? ' исц' : ''}
                      </span>
                      <span className="text-gray-500">{sk.range === 0 ? 'на себя' : `${sk.range} фут`}</span>
                      {sk.energyCost > 0 && (
                        <span className={canAfford ? 'text-purple-400' : 'text-red-600'}>{sk.energyCost}ПЭ</span>
                      )}
                      {sk.isUltimate && <span className="text-yellow-400">УЛЬТ</span>}
                      {sk.aoe && <span className="text-cyan-400">зона</span>}
                    </div>
                    {isActive && (
                      <div className="text-xs text-gray-400 mt-1 leading-tight">{sk.description}</div>
                    )}
                  </button>
                );
              })}

              {/* Locked skills hint */}
              {player.allSkills.filter(s => s.requiresLevel > player.level).length > 0 && (
                <div className="text-xs text-gray-600 text-center py-2 border border-dashed border-white/5 rounded-lg">
                  🔒 Ещё {player.allSkills.filter(s => s.requiresLevel > player.level).length} техник — откроются с уровнем
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 p-3 overflow-y-auto">
              <div className="text-xs font-mono text-green-400 tracking-widest uppercase mb-2">— Предметы —</div>
              {inventory.filter(i => i.usable).map(item => (
                <button key={item.id} onClick={() => handleItemUse(item)}
                  className="w-full p-2 mb-2 rounded-xl border border-green-700/30 bg-green-900/10 text-left hover:bg-green-800/20 transition-colors flex items-center gap-2">
                  <span className="text-xl">{item.emoji}</span>
                  <div>
                    <div className="text-green-300 text-xs font-bold">{item.name}</div>
                    <div className="text-gray-500 text-xs">×{item.quantity}</div>
                  </div>
                </button>
              ))}
              {inventory.filter(i => i.usable).length === 0 && (
                <div className="text-gray-600 text-sm text-center py-4">Нет расходников</div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="p-3 border-t space-y-2" style={{ borderColor: '#ffffff10' }}>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setMovementMode(!movementMode); setSelectedSkill(null); }}
                disabled={!isPlayerTurn || playerActions.movementLeft <= 0}
                className="py-2 rounded-lg text-xs font-bold border transition-all disabled:opacity-30"
                style={{
                  borderColor: movementMode ? '#3b82f6' : '#3b82f640',
                  backgroundColor: movementMode ? '#3b82f620' : 'transparent',
                  color: movementMode ? '#60a5fa' : '#3b82f6',
                }}>
                👟 Движение
              </button>
              <button
                onClick={() => { setShowInventory(!showInventory); setSelectedSkill(null); setMovementMode(false); }}
                className="py-2 rounded-lg text-xs font-bold border border-green-700/40 text-green-400 hover:bg-green-900/20 transition-all">
                🎒 Предметы
              </button>
            </div>
            <button
              onClick={handleEndTurn}
              disabled={!isPlayerTurn}
              className="w-full py-2.5 rounded-xl text-xs font-black tracking-widest uppercase border border-purple-700/50 text-purple-300 hover:bg-purple-900/30 disabled:opacity-30 transition-all">
              ⏭ Завершить ход
            </button>
          </div>
        </div>

        {/* ─── LOG ─── */}
        <div className="w-56 border-l flex flex-col" style={{ borderColor: '#ffffff10' }}>
          <div className="px-3 py-2 text-xs font-mono text-purple-400 tracking-widest border-b" style={{ borderColor: '#ffffff10' }}>
            — ЛОГ БИТВЫ —
          </div>
          <div ref={logRef} className="flex-1 overflow-y-auto p-2 space-y-1">
            {battleState.log.map(entry => (
              <div key={entry.id}
                className="text-xs px-2 py-1 rounded leading-tight"
                style={{
                  color: logColors[entry.type] ?? '#888',
                  backgroundColor: entry.type === 'critical' ? '#ff000015' : entry.type === 'combo' ? '#fbbf2415' : 'transparent',
                }}>
                {entry.text}
                {entry.diceResult && (
                  <div className="text-gray-600 font-mono text-xs mt-0.5">
                    {rollVisual(entry.diceResult.rolls, entry.diceResult.die, entry.diceResult.total)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Player status effects bar */}
      {battleState.playerStatusEffects.length > 0 && (
        <div className="px-4 py-1.5 border-t flex gap-2" style={{ borderColor: '#ffffff10' }}>
          <span className="text-xs text-gray-500 font-mono">Эффекты на тебе:</span>
          {battleState.playerStatusEffects.map((e, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 rounded font-bold"
              style={{ backgroundColor: `${EFFECT_COLORS[e.type] ?? '#888'}20`, color: EFFECT_COLORS[e.type] ?? '#888' }}>
              {e.type} {e.duration}р
            </span>
          ))}
        </div>
      )}

      {/* ─── DEATH SAVES OVERLAY ─── */}
      {deathSaveMode && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="p-8 rounded-2xl border border-red-700/50 bg-[#0a0000] text-center max-w-sm w-full"
            style={{ boxShadow: '0 0 60px #ef444440' }}>
            <div className="text-5xl mb-4">💀</div>
            <h2 className="text-red-400 font-black text-2xl tracking-widest mb-2">НА ГРАНИ СМЕРТИ</h2>
            <p className="text-gray-400 text-sm mb-4">
              {player.name} без сознания!<br />
              Успехов: {'●'.repeat(player.deathSaves.successes)}{'○'.repeat(3 - player.deathSaves.successes)} &nbsp;
              Провалов: {'●'.repeat(player.deathSaves.failures)}{'○'.repeat(3 - player.deathSaves.failures)}
            </p>
            <p className="text-gray-500 text-xs mb-6">Бросок d20: 10+ — успех, 1-9 — провал, 1 — два провала, 20 — стабилизация</p>
            <button
              onClick={handleDeathSave}
              className="w-full py-4 rounded-xl font-black text-white text-lg tracking-widest"
              style={{ background: 'linear-gradient(135deg, #7f1d1d, #991b1b)', border: '1px solid #ef4444' }}>
              🎲 Бросить кость
            </button>
          </div>
        </div>
      )}

      {/* Enemy turn overlay */}
      {processing && battleState.turn === 'enemy' && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-20">
          <div className="text-6xl animate-bounce opacity-40">{enemy.emoji}</div>
        </div>
      )}
    </div>
  );
}

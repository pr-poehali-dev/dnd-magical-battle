import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  BattleState, BattleUnit, Skill, Item, GRID_COLS, GRID_ROWS, CELL_PX, GridCell
} from '@/game/types';
import {
  moveUnit, executeAttack, doDash, doDisengage, doJump, doPush,
  doCallCola, doCatchBreath, doDeathSave, endTurn, runEnemyTurn,
  getCurrentUnit, selectSkill, toggleMovement
} from '@/game/battleEngine';
import { distFeet, chebyshevDist } from '@/game/dndUtils';

interface Props {
  battleState: BattleState;
  onBattleUpdate: (s: BattleState) => void;
  onVictory: (state: BattleState) => void;
  onDefeat: () => void;
  playerUnitId?: string; // for PvP
}

// ─── CANVAS RENDERER ────────────────────────────────────────────────────────
// Colours per biome/terrain
const TILE_COLORS = ['#2d4a1e', '#2a461c', '#31501f', '#294219'];
const TILE_DARK   = ['#1e3214', '#1c2e12', '#213616', '#1b2c10'];
const TREE_TRUNK  = '#5c3a1e';
const TREE_FOLIAGE= ['#1a5c1a','#1e6b1e','#185418','#22721e'];
const BUSH_COLOR  = '#2d7a1e';
const ROCK_COLOR  = '#7a7a7a';
const WATER_COLOR = '#1a4a8c';

function drawCell(ctx: CanvasRenderingContext2D, cell: GridCell, highlighted: 'move'|'attack'|'none', selected: boolean) {
  const px = cell.x * CELL_PX;
  const py = cell.y * CELL_PX;
  const v = cell.tileVariant;

  // Base tile
  if (cell.terrain === 'blocked' && cell.prop === 'tree') {
    ctx.fillStyle = TILE_DARK[v];
  } else if (cell.terrain === 'difficult' && cell.prop === 'water') {
    ctx.fillStyle = '#0d2a4a';
  } else {
    ctx.fillStyle = TILE_COLORS[v];
  }
  ctx.fillRect(px, py, CELL_PX, CELL_PX);

  // Grass texture lines
  if (cell.terrain !== 'blocked') {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      const gx = px + 8 + (v * 3 + i * 12) % (CELL_PX - 16);
      const gy = py + 6 + i * 14;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 5, gy - 4);
      ctx.stroke();
    }
  }

  // Highlight
  if (highlighted === 'move') {
    ctx.fillStyle = 'rgba(59,130,246,0.22)';
    ctx.fillRect(px, py, CELL_PX, CELL_PX);
  } else if (highlighted === 'attack') {
    ctx.fillStyle = 'rgba(239,68,68,0.22)';
    ctx.fillRect(px, py, CELL_PX, CELL_PX);
  }
  if (selected) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(px, py, CELL_PX, CELL_PX);
  }

  // Props
  if (cell.prop === 'tree') {
    // Trunk
    ctx.fillStyle = TREE_TRUNK;
    ctx.fillRect(px + CELL_PX/2 - 4, py + CELL_PX/2, 8, CELL_PX/2);
    // Foliage — circle
    ctx.fillStyle = TREE_FOLIAGE[v];
    ctx.beginPath();
    ctx.ellipse(px + CELL_PX/2, py + CELL_PX/2 - 2, 16, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // Dark overlay on foliage
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(px + CELL_PX/2 + 4, py + CELL_PX/2 + 2, 10, 12, 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (cell.prop === 'bush') {
    ctx.fillStyle = BUSH_COLOR;
    ctx.beginPath();
    ctx.ellipse(px + CELL_PX/2, py + CELL_PX*0.62, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,100,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px + CELL_PX/2 + 3, py + CELL_PX*0.58, 10, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (cell.prop === 'rock') {
    ctx.fillStyle = ROCK_COLOR;
    ctx.beginPath();
    ctx.ellipse(px + CELL_PX/2, py + CELL_PX*0.58, 13, 9, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.ellipse(px + CELL_PX/2 - 3, py + CELL_PX*0.52, 5, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (cell.prop === 'water') {
    ctx.fillStyle = WATER_COLOR;
    ctx.fillRect(px + 2, py + 2, CELL_PX - 4, CELL_PX - 4);
    ctx.fillStyle = 'rgba(100,180,255,0.15)';
    ctx.fillRect(px + 4, py + CELL_PX*0.3, CELL_PX - 10, 4);
    ctx.fillRect(px + 8, py + CELL_PX*0.55, CELL_PX - 16, 3);
  }

  // Grid line
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.25, py + 0.25, CELL_PX - 0.5, CELL_PX - 0.5);

  // Highlighted border
  if (highlighted !== 'none') {
    ctx.strokeStyle = highlighted === 'move' ? 'rgba(59,130,246,0.7)' : 'rgba(239,68,68,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 1, py + 1, CELL_PX - 2, CELL_PX - 2);
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, unit: BattleUnit, isSelected: boolean, isCurrent: boolean, animOffset: {x:number;y:number} = {x:0,y:0}, shake = false) {
  const { data, teamId } = unit;
  const cx = data.gridX * CELL_PX + CELL_PX / 2 + animOffset.x;
  const cy = data.gridY * CELL_PX + CELL_PX / 2 + animOffset.y + (shake ? Math.sin(Date.now()/50)*3 : 0);

  if (data.isUnconscious || data.isDead) {
    // Fallen unit
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  const color = data.color;
  const r = 16;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r - 2, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body circle
  if (isSelected || isCurrent) {
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Highlight on body
  const grad = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, r);
  grad.addColorStop(0, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Team indicator
  ctx.fillStyle = teamId === 0 ? '#60a5fa' : '#f87171';
  ctx.beginPath();
  ctx.arc(cx + 10, cy - 12, 5, 0, Math.PI * 2);
  ctx.fill();

  // Name label
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(cx - 22, cy + r + 2, 44, 12);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(data.name.split(' ')[0].substring(0,8), cx, cy + r + 11);
  ctx.textAlign = 'left';

  // HP bar under name
  const hpPct = data.hp / data.maxHp;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(cx - 20, cy + r + 15, 40, 5);
  ctx.fillStyle = hpPct > 0.6 ? '#22c55e' : hpPct > 0.3 ? '#f59e0b' : '#ef4444';
  ctx.fillRect(cx - 20, cy + r + 15, 40 * hpPct, 5);

  // Current turn indicator
  if (isCurrent) {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function BattleScreen({ battleState, onBattleUpdate, onVictory, onDefeat, playerUnitId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [animOffsets, setAnimOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [shakingUnit, setShakingUnit] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const [showActions, setShowActions] = useState(false);

  const curUnit = getCurrentUnit(battleState);
  const isPlayerTurn = curUnit.kind === 'player' && !processing;
  const curPlayer = curUnit.kind === 'player' ? curUnit.data : null;

  // Scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battleState.log]);

  // Check end
  useEffect(() => {
    if (battleState.phase === 'victory') { onVictory(battleState); return; }
    if (battleState.phase === 'defeat') { onDefeat(); return; }
  }, [battleState.phase]);

  // Enemy AI
  useEffect(() => {
    if (curUnit.kind !== 'enemy' || processing || battleState.phase !== 'active') return;
    setProcessing(true);
    const t = setTimeout(() => {
      const next = runEnemyTurn(battleState);
      onBattleUpdate(next);
      setProcessing(false);
    }, 900);
    return () => clearTimeout(t);
  }, [curUnit.kind, curUnit.data.id, battleState.round]);

  // Canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all cells
    battleState.grid.forEach(row => row.forEach(cell => {
      const isReach = battleState.reachableCells.some(c => c.x === cell.x && c.y === cell.y);
      const isTarget = battleState.targetableCells.some(c => c.x === cell.x && c.y === cell.y);
      const isHov = hoveredCell?.x === cell.x && hoveredCell?.y === cell.y;
      const hl = isReach && battleState.movementMode ? 'move' : isTarget ? 'attack' : 'none';
      drawCell(ctx, cell, hl, isHov && hl !== 'none');
    }));

    // Draw units
    battleState.units.forEach(unit => {
      const offset = animOffsets[unit.data.id] ?? { x: 0, y: 0 };
      const isSelected = battleState.selectedUnitId === unit.data.id;
      const isCurrent = getCurrentUnit(battleState).data.id === unit.data.id;
      const shake = shakingUnit === unit.data.id;
      drawUnit(ctx, unit, isSelected, isCurrent, offset, shake);
    });
  }, [battleState, animOffsets, shakingUnit, hoveredCell]);

  // Canvas events
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    const cx = Math.floor(((e.clientX - rect.left) * scaleX) / CELL_PX);
    const cy = Math.floor(((e.clientY - rect.top) * scaleY) / CELL_PX);
    if (cx < 0 || cx >= GRID_COLS || cy < 0 || cy >= GRID_ROWS) return;

    if (!isPlayerTurn) return;
    const curId = curUnit.data.id;

    // Movement mode
    if (battleState.movementMode) {
      const isReach = battleState.reachableCells.some(c => c.x === cx && c.y === cy);
      if (isReach) {
        onBattleUpdate(moveUnit(battleState, curId, cx, cy));
      }
      return;
    }

    // Attack mode
    if (battleState.selectedSkill) {
      const tgtUnit = battleState.units.find(u => u.data.gridX === cx && u.data.gridY === cy && !u.data.isUnconscious);
      if (tgtUnit && tgtUnit.teamId !== curUnit.teamId) {
        const isTargetable = battleState.targetableCells.some(c => c.x === cx && c.y === cy);
        if (isTargetable || battleState.selectedSkill.aoe) {
          const next = executeAttack(battleState, curId, battleState.selectedSkill, tgtUnit.data.id);
          onBattleUpdate({ ...next, selectedSkill: null, targetableCells: [] });
          setShakingUnit(tgtUnit.data.id);
          setTimeout(() => setShakingUnit(null), 400);
        }
      }
      return;
    }

    // Select unit
    const clickedUnit = battleState.units.find(u => u.data.gridX === cx && u.data.gridY === cy && !u.data.isUnconscious);
    if (clickedUnit) {
      onBattleUpdate({ ...battleState, selectedUnitId: clickedUnit.data.id, selectedSkill: null, movementMode: false, targetableCells: [] });
    }
  }, [battleState, isPlayerTurn, curUnit]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    const cx = Math.floor(((e.clientX - rect.left) * scaleX) / CELL_PX);
    const cy = Math.floor(((e.clientY - rect.top) * scaleY) / CELL_PX);
    setHoveredCell(cx >= 0 && cx < GRID_COLS && cy >= 0 && cy < GRID_ROWS ? { x: cx, y: cy } : null);
  }, []);

  const handleSkillClick = (sk: Skill) => {
    if (!isPlayerTurn) return;
    if (battleState.selectedSkill?.id === sk.id) {
      onBattleUpdate({ ...battleState, selectedSkill: null, targetableCells: [], movementMode: false });
      return;
    }
    if (sk.actionCost === 'reaction') {
      // Reactions are used differently — just highlight
      onBattleUpdate(selectSkill(battleState, sk, curUnit.data.id));
      return;
    }
    onBattleUpdate({ ...battleState, movementMode: false, ...selectSkill(battleState, sk, curUnit.data.id) });
  };

  const handleEndTurn = () => {
    if (!isPlayerTurn) return;
    onBattleUpdate(endTurn(battleState));
    setShowActions(false);
  };

  const logColors: Record<string, string> = {
    info: '#9ca3af', hit: '#60a5fa', miss: '#6b7280', critical: '#ff4757',
    heal: '#22c55e', death: '#ef4444', system: '#7c3aed', save: '#a78bfa', special: '#fbbf24',
  };

  const ACTION_ICONS: Record<string, string> = {
    action: '⚔', bonus_action: '✨', reaction: '🛡', free: '·'
  };

  const canvasW = GRID_COLS * CELL_PX;
  const canvasH = GRID_ROWS * CELL_PX;

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex flex-col" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* TOP HUD */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-black/40 flex-wrap">
        {/* Initiative order */}
        <div className="flex gap-1.5 items-center">
          <span className="text-gray-500 text-xs font-mono">Инициатива:</span>
          {battleState.units.map((u, i) => (
            <div key={u.data.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border transition-all"
              style={{
                borderColor: i === battleState.currentUnitIndex ? u.data.color : '#333',
                backgroundColor: i === battleState.currentUnitIndex ? `${u.data.color}25` : 'transparent',
                color: u.data.isUnconscious ? '#444' : u.data.color,
                textDecoration: u.data.isUnconscious ? 'line-through' : 'none',
                opacity: u.data.isUnconscious ? 0.5 : 1,
              }}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: u.teamId === 0 ? '#60a5fa' : '#f87171' }} />
              {u.data.name.split(' ')[0]}
              <span className="text-gray-600 text-xs">{u.data.hp}/{u.data.maxHp}</span>
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-purple-400 font-mono text-xs">Раунд {battleState.round}</span>
          <div className={`px-3 py-1 rounded-lg text-xs font-black border ${isPlayerTurn ? 'border-blue-500/50 bg-blue-600/20 text-blue-300' : 'border-red-500/40 bg-red-600/15 text-red-300'}`}>
            {isPlayerTurn ? '▶ ВАШ ХОД' : processing ? '⏳ ИИ ходит...' : '⚔ ХОД ВРАГА'}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* CANVAS MAP */}
        <div className="flex-1 flex items-start justify-center p-3 overflow-auto bg-[#0a1008]">
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            style={{ imageRendering: 'pixelated', cursor: isPlayerTurn ? 'crosshair' : 'default',
              maxWidth: '100%', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoveredCell(null)}
          />
        </div>

        {/* RIGHT PANEL */}
        <div className="w-64 flex flex-col border-l border-white/8 bg-black/30">
          {/* Current unit info */}
          {curPlayer && (
            <div className="p-3 border-b border-white/8">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex-shrink-0 border" style={{ backgroundColor: `${curPlayer.color}25`, borderColor: `${curPlayer.color}60` }}>
                  <div className="w-full h-full rounded-lg" style={{ background: `radial-gradient(circle at 35% 35%, white 8%, ${curPlayer.color} 45%, transparent)` }} />
                </div>
                <div>
                  <div className="text-white font-black text-sm">{curPlayer.name}</div>
                  <div className="text-xs" style={{ color: curPlayer.color }}>{curPlayer.title}</div>
                </div>
              </div>
              {/* HP */}
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-0.5">
                    <span className="text-green-400">HP</span>
                    <span className="text-white">{curPlayer.hp}/{curPlayer.maxHp}{curPlayer.tempHp > 0 ? `+${curPlayer.tempHp}tmp` : ''}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(curPlayer.hp / curPlayer.maxHp) * 100}%`, backgroundColor: curPlayer.hp / curPlayer.maxHp > 0.5 ? '#22c55e' : '#ef4444' }} />
                  </div>
                </div>
                {/* Actions */}
                <div className="flex gap-1.5 flex-wrap mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold border ${curPlayer.hasAction ? 'border-red-500/60 text-red-400' : 'border-white/10 text-white/20 line-through'}`}>⚔Д</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold border ${curPlayer.hasBonusAction ? 'border-yellow-500/60 text-yellow-400' : 'border-white/10 text-white/20 line-through'}`}>✨Б</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold border ${curPlayer.hasReaction ? 'border-indigo-500/60 text-indigo-400' : 'border-white/10 text-white/20 line-through'}`}>🛡Р</span>
                  <span className="text-xs px-1.5 py-0.5 rounded font-bold border border-blue-500/50 text-blue-400">👟{curPlayer.movementLeft}ф</span>
                </div>
              </div>
            </div>
          )}

          {/* Death saves if unconscious player */}
          {curPlayer?.isUnconscious && (
            <div className="p-3 border-b border-red-900/30 bg-red-900/10">
              <div className="text-red-400 font-black text-sm mb-2">💀 СПАСБРОСОК ОТ СМЕРТИ</div>
              <div className="text-xs text-gray-400 mb-2">
                Успехи: {'●'.repeat(curPlayer.deathSaves.successes)}{'○'.repeat(3 - curPlayer.deathSaves.successes)}
                {' '}Провалы: {'●'.repeat(curPlayer.deathSaves.failures)}{'○'.repeat(3 - curPlayer.deathSaves.failures)}
              </div>
              <button onClick={() => onBattleUpdate(doDeathSave(battleState, curUnit.data.id))}
                className="w-full py-2 rounded-lg text-xs font-black text-white bg-red-800/60 border border-red-600/50 hover:bg-red-700/60">
                🎲 Бросить к20
              </button>
            </div>
          )}

          {/* SKILLS */}
          <div className="flex-1 p-2 overflow-y-auto space-y-1">
            <div className="text-purple-400 text-xs font-mono tracking-widest uppercase px-1 mb-1">— Техники —</div>
            {curPlayer && curPlayer.unlockedSkills.map(sk => {
              const isActive = battleState.selectedSkill?.id === sk.id;
              const onCd = sk.currentCooldown > 0;
              const cantAct = sk.actionCost === 'action' && !curPlayer.hasAction;
              const cantBonus = sk.actionCost === 'bonus_action' && !curPlayer.hasBonusAction;
              const cantReact = sk.actionCost === 'reaction' && !curPlayer.hasReaction;
              const disabled = !isPlayerTurn || onCd || cantAct || cantBonus || cantReact || curPlayer.isUnconscious;

              return (
                <button key={sk.id} onClick={() => handleSkillClick(sk)} disabled={disabled}
                  className="w-full p-2 rounded-xl border text-left transition-all duration-100 hover:scale-[1.02] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{
                    borderColor: isActive ? curPlayer.color : sk.isUltimate ? '#ff004040' : '#ffffff15',
                    backgroundColor: isActive ? `${curPlayer.color}20` : sk.isUltimate ? '#1a000808' : '#ffffff05',
                    boxShadow: isActive ? `0 0 10px ${curPlayer.color}40` : 'none',
                  }}>
                  <div className="flex justify-between items-start mb-0.5">
                    <span className="text-white text-xs font-black leading-tight">{sk.name}</span>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className="text-xs px-1 rounded font-bold"
                        style={{ backgroundColor: '#ffffff15', color: sk.actionCost === 'action' ? '#f87171' : sk.actionCost === 'bonus_action' ? '#fbbf24' : '#818cf8' }}>
                        {ACTION_ICONS[sk.actionCost]}
                      </span>
                      {onCd && <span className="text-orange-400 text-xs font-mono">⏱{sk.currentCooldown}</span>}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-gray-500 flex gap-2 flex-wrap">
                    <span className="text-red-400">{sk.damageDice.count}к{sk.damageDice.die.slice(1)}{sk.damageDice.modifier > 0 ? `+${sk.damageDice.modifier}` : ''}</span>
                    <span>{sk.range === 5 ? 'ближний' : `${sk.range}фт`}</span>
                    {sk.is100pct && <span className="text-yellow-400">100%</span>}
                    {sk.aoe && <span className="text-cyan-400">зона</span>}
                    {sk.blackFlash && <span className="text-purple-400">⚡18-20</span>}
                  </div>
                  {isActive && <div className="text-gray-500 text-xs mt-0.5 leading-tight">{sk.description}</div>}
                </button>
              );
            })}

            {/* Base actions */}
            <div className="text-purple-400 text-xs font-mono tracking-widest uppercase px-1 mt-2 mb-1">— Базовые действия —</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { label: 'Движение', icon: '👟', action: () => onBattleUpdate(toggleMovement(battleState, curUnit.data.id)), disabled: !isPlayerTurn || (curPlayer?.movementLeft ?? 0) <= 0, active: battleState.movementMode },
                { label: 'Рывок', icon: '💨', action: () => onBattleUpdate(doDash(battleState, curUnit.data.id)), disabled: !isPlayerTurn || !curPlayer?.hasAction },
                { label: 'Отход', icon: '🚶', action: () => onBattleUpdate(doDisengage(battleState, curUnit.data.id)), disabled: !isPlayerTurn || !curPlayer?.hasAction },
                { label: 'Прыжок', icon: '⬆', action: () => onBattleUpdate(doJump(battleState, curUnit.data.id)), disabled: !isPlayerTurn || !curPlayer?.hasBonusAction },
                { label: 'Кола', icon: '🥤', action: () => onBattleUpdate(doCallCola(battleState, curUnit.data.id)), disabled: !isPlayerTurn || !curPlayer?.hasAction },
                { label: 'Отдышка', icon: '💨', action: () => onBattleUpdate(doCatchBreath(battleState, curUnit.data.id)), disabled: !isPlayerTurn || !curPlayer?.hasAction || !curPlayer?.hasBonusAction },
              ].map(btn => (
                <button key={btn.label} onClick={btn.action} disabled={btn.disabled}
                  className="py-1.5 px-2 rounded-lg border text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed text-left"
                  style={{
                    borderColor: (btn as { active?: boolean }).active ? '#3b82f6' : '#ffffff15',
                    backgroundColor: (btn as { active?: boolean }).active ? '#3b82f620' : '#ffffff05',
                    color: (btn as { active?: boolean }).active ? '#60a5fa' : '#9ca3af',
                  }}>
                  {btn.icon} {btn.label}
                </button>
              ))}
            </div>

            <button onClick={handleEndTurn} disabled={!isPlayerTurn}
              className="w-full py-2 mt-1 rounded-xl text-xs font-black tracking-widest uppercase border border-purple-700/40 text-purple-300 hover:bg-purple-900/20 disabled:opacity-30 transition-all">
              ⏭ Завершить ход
            </button>
          </div>
        </div>

        {/* LOG */}
        <div className="w-52 border-l border-white/8 flex flex-col bg-black/20">
          <div className="px-3 py-2 text-xs font-mono text-purple-400 tracking-widest border-b border-white/8">— ЛОГ —</div>
          <div ref={logRef} className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {battleState.log.map(entry => (
              <div key={entry.id} className="text-xs px-1.5 py-1 rounded leading-tight"
                style={{
                  color: logColors[entry.type] ?? '#888',
                  backgroundColor: entry.type === 'critical' ? '#ff000010' : entry.type === 'special' ? '#fbbf2408' : 'transparent',
                }}>
                {entry.text}
                {entry.diceResult && (
                  <div className="text-gray-600 font-mono text-xs opacity-70">
                    [{entry.diceResult.rolls.join('+')}]={entry.diceResult.total}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

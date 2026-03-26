import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  BattleState, BattleUnit, Skill, GRID_COLS, GRID_ROWS, CELL_PX, GridCell, Character, Enemy
} from '@/game/types';
import {
  moveUnit, executeAttack, doDash, doDisengage, doJump, doPush,
  doCallCola, doCatchBreath, doDeathSave, endTurn, runEnemyTurn,
  getCurrentUnit, selectSkill, toggleMovement, TREE_HP
} from '@/game/battleEngine';
import { chebyshevDist } from '@/game/dndUtils';

interface Props {
  battleState: BattleState;
  onBattleUpdate: (s: BattleState) => void;
  onVictory: (state: BattleState) => void;
  onDefeat: () => void;
}

interface VisualPos { x: number; y: number }
interface MoveAnim { unitId: string; fromX: number; fromY: number; toX: number; toY: number; startTime: number; duration: number }
interface AttackAnim { unitId: string; progress: number }
interface HitAnim { unitId: string; progress: number }

// ─── DRAW TILES ──────────────────────────────────────────────────────────────
const TILE_GRASS = ['#2d4a1e','#2a461c','#31501f','#294219'];
const TILE_DARK  = ['#1c3010','#1a2e0e','#1f3613','#192c0d'];

function drawTile(ctx: CanvasRenderingContext2D, cell: GridCell) {
  const px = cell.x * CELL_PX, py = cell.y * CELL_PX, v = cell.tileVariant;
  ctx.fillStyle = TILE_GRASS[v];
  ctx.fillRect(px, py, CELL_PX, CELL_PX);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 2; i++) {
    const gx = px + 6 + ((v * 5 + i * 11 + cell.x) % (CELL_PX - 14));
    const gy = py + 8 + i * 15;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 4, gy - 5); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.11)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.25, py + 0.25, CELL_PX - 0.5, CELL_PX - 0.5);
}

function drawTree(ctx: CanvasRenderingContext2D, cell: GridCell) {
  const px = cell.x * CELL_PX, py = cell.y * CELL_PX, v = cell.tileVariant;
  const hp = cell.treeHp ?? TREE_HP;
  const cx = px + CELL_PX / 2, cy = py + CELL_PX / 2;
  ctx.fillStyle = TILE_DARK[v];
  ctx.fillRect(px, py, CELL_PX, CELL_PX);
  ctx.strokeStyle = 'rgba(0,0,0,0.11)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.25, py + 0.25, CELL_PX - 0.5, CELL_PX - 0.5);
  if (hp <= 0) {
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(cx - 3, cy - 4, 6, CELL_PX / 2 + 4);
    return;
  }
  const FOLIAGE = ['#1a5c1a','#1e6b1e','#185418','#22721e'];
  const hr = hp / TREE_HP;
  ctx.fillStyle = '#5c3a1e';
  ctx.fillRect(cx - 4, cy + 2, 8, CELL_PX / 2 - 2);
  const fr = (13 + v * 2) * hr;
  ctx.shadowBlur = 5; ctx.shadowColor = 'rgba(0,80,0,0.35)';
  ctx.fillStyle = FOLIAGE[v];
  ctx.beginPath(); ctx.ellipse(cx, cy - 3, fr, fr + 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.ellipse(cx - 4, cy - 7, fr * 0.35, fr * 0.45, -0.5, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < TREE_HP; i++) {
    ctx.fillStyle = i < hp ? '#22c55e' : '#222';
    ctx.beginPath(); ctx.arc(px + 5 + i * 8, py + 4, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawHighlight(ctx: CanvasRenderingContext2D, cell: GridCell, kind: 'move'|'attack'|'jump') {
  const px = cell.x * CELL_PX, py = cell.y * CELL_PX;
  const fills = { move: 'rgba(59,130,246,0.25)', attack: 'rgba(239,68,68,0.25)', jump: 'rgba(168,85,247,0.3)' };
  const strokes = { move: 'rgba(59,130,246,0.75)', attack: 'rgba(239,68,68,0.75)', jump: 'rgba(168,85,247,0.8)' };
  ctx.fillStyle = fills[kind];
  ctx.fillRect(px, py, CELL_PX, CELL_PX);
  ctx.strokeStyle = strokes[kind];
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 0.5, py + 0.5, CELL_PX - 1, CELL_PX - 1);
  if (kind !== 'attack') {
    ctx.fillStyle = strokes[kind];
    ctx.beginPath(); ctx.arc(px + CELL_PX/2, py + CELL_PX/2, 4, 0, Math.PI * 2); ctx.fill();
  }
}

function shadeColor(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

// ─── DRAW UNIT ────────────────────────────────────────────────────────────────
function drawUnit(
  ctx: CanvasRenderingContext2D,
  unit: BattleUnit,
  vx: number, vy: number,
  isCurrent: boolean,
  isSelected: boolean,
  onTree: boolean,
  atkAnim: AttackAnim | null,
  hitAnim: HitAnim | null,
  now: number,
) {
  const { data, teamId } = unit;
  if (data.isDead) return;
  ctx.globalAlpha = data.isUnconscious ? 0.35 : 1;

  const scale = onTree ? 0.72 : 1;
  ctx.save();
  ctx.translate(vx, vy - (onTree ? 8 : 0));
  ctx.scale(scale, scale);

  const C = data.color;
  const isEnemy = teamId === 1;
  const bob = isCurrent ? Math.sin(now / 220) * 1.5 : 0;

  // hit flash: shake
  if (hitAnim && hitAnim.progress < 0.6) {
    const shake = Math.sin(hitAnim.progress * 20) * 4 * (1 - hitAnim.progress);
    ctx.translate(shake, 0);
    ctx.globalAlpha = 0.5 + 0.5 * hitAnim.progress;
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(0, 19, 12, 5, 0, 0, Math.PI * 2); ctx.fill();

  // Legs
  const legBob = isCurrent ? Math.sin(now / 200) * 1.8 : 0;
  ctx.fillStyle = shadeColor(C, -30);
  ctx.fillRect(-8, 6 + legBob, 6, 11);
  ctx.fillRect(2, 6 - legBob, 6, 11);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-9, 15 + legBob, 7, 4);
  ctx.fillRect(1, 15 - legBob, 7, 4);

  // Body
  ctx.fillStyle = C;
  ctx.beginPath(); ctx.roundRect(-10, -12, 20, 19, [3,3,2,2]); ctx.fill();
  // Body shading
  const bg = ctx.createLinearGradient(-10, -12, 10, 7);
  bg.addColorStop(0, 'rgba(255,255,255,0.22)');
  bg.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(-10, -12, 20, 19, [3,3,2,2]); ctx.fill();

  // Attack arm extension
  const armPunch = atkAnim ? Math.sin(atkAnim.progress * Math.PI) * 12 : 0;
  const punchDir = isEnemy ? -1 : 1;

  ctx.fillStyle = shadeColor(C, -10);
  ctx.fillRect(-14, -8, 5, 9); // left arm
  ctx.fillRect(9, -8, 5, 9);    // right arm base
  // Punching arm
  ctx.fillStyle = shadeColor(C, 10);
  ctx.fillRect(9 + punchDir * armPunch, -8, 6, 9);
  // Fist
  ctx.fillStyle = shadeColor(C, 25);
  ctx.beginPath();
  ctx.roundRect(8 + punchDir * armPunch, -2, 8, 7, 2);
  ctx.fill();

  // Head
  ctx.fillStyle = shadeColor(C, 18);
  ctx.beginPath(); ctx.arc(0, -20 + bob, 10, 0, Math.PI * 2); ctx.fill();
  // Head shine
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.arc(-3, -25 + bob, 4, 0, Math.PI * 2); ctx.fill();

  // Eyes
  const eyeColor = isEnemy ? '#ff5555' : 'white';
  ctx.fillStyle = eyeColor;
  ctx.beginPath(); ctx.arc(-4, -21 + bob, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -21 + bob, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isEnemy ? 'white' : '#1a1a2e';
  ctx.beginPath(); ctx.arc(-4, -21 + bob, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -21 + bob, 1.2, 0, Math.PI * 2); ctx.fill();

  // Team dot
  ctx.fillStyle = teamId === 0 ? '#60a5fa' : '#f87171';
  ctx.beginPath(); ctx.arc(10, -11, 3.5, 0, Math.PI * 2); ctx.fill();

  // Selection / current ring
  if (isCurrent || isSelected) {
    ctx.shadowBlur = isCurrent ? 16 : 8;
    ctx.shadowColor = C;
    ctx.strokeStyle = isCurrent ? 'rgba(255,255,255,0.85)' : `${C}cc`;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(0, -1, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }

  // Hit overlay (red flash)
  if (hitAnim && hitAnim.progress < 0.55) {
    ctx.fillStyle = `rgba(255,60,60,${0.65 * (1 - hitAnim.progress / 0.55)})`;
    ctx.beginPath(); ctx.roundRect(-12, -30, 24, 50, 4); ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;

  // HP bar above sprite
  const bY = vy - (onTree ? 8 : 0) - 40 * scale;
  const bW = 42;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(vx - bW/2, bY - 11, bW, 10);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(data.name.split(' ')[0].substring(0, 7), vx, bY - 3);
  ctx.textAlign = 'left';
  const hpF = Math.max(0, data.hp / data.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(vx - bW/2, bY, bW, 4.5);
  ctx.fillStyle = hpF > 0.55 ? '#22c55e' : hpF > 0.28 ? '#f59e0b' : '#ef4444';
  ctx.fillRect(vx - bW/2, bY, bW * hpF, 4.5);

  if (data.isUnconscious) {
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('KO', vx, vy + 10);
    ctx.textAlign = 'left';
  }
  if (onTree) {
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#86efac';
    ctx.fillText('дерево', vx, vy - (onTree ? 8 : 0) - 46 * scale);
    ctx.textAlign = 'left';
  }
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function BattleScreen({ battleState, onBattleUpdate, onVictory, onDefeat }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const nowRef = useRef<number>(Date.now());

  const [visualPos, setVisualPos] = useState<Record<string, VisualPos>>({});
  const [moveAnims, setMoveAnims] = useState<MoveAnim[]>([]);
  const [attackAnims, setAttackAnims] = useState<AttackAnim[]>([]);
  const [hitAnims, setHitAnims] = useState<HitAnim[]>([]);
  const [processing, setProcessing] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const [jumpMode, setJumpMode] = useState(false);

  const curUnit = getCurrentUnit(battleState);
  const isPlayerTurn = curUnit.kind === 'player' && !processing;
  const curPlayer = curUnit.kind === 'player' ? curUnit.data : null;
  const hasCursedEnergy = !!(curPlayer && curPlayer.maxCursedEnergy > 0);

  // Init / sync visual positions
  const prevGridRef = useRef<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    const now = Date.now();
    setVisualPos(prev => {
      const next = { ...prev };
      battleState.units.forEach(u => {
        const id = u.data.id;
        const prevG = prevGridRef.current[id];
        const targetX = u.data.gridX * CELL_PX + CELL_PX / 2;
        const targetY = u.data.gridY * CELL_PX + CELL_PX / 2;
        if (!next[id]) {
          next[id] = { x: targetX, y: targetY };
        }
        if (prevG && (prevG.x !== u.data.gridX || prevG.y !== u.data.gridY)) {
          setMoveAnims(ma => [
            ...ma.filter(a => a.unitId !== id),
            {
              unitId: id,
              fromX: next[id]?.x ?? targetX,
              fromY: next[id]?.y ?? targetY,
              toX: targetX, toY: targetY,
              startTime: now, duration: 300,
            },
          ]);
        }
        prevGridRef.current[id] = { x: u.data.gridX, y: u.data.gridY };
      });
      return next;
    });
  }, [battleState.units.map(u => `${u.data.id}:${u.data.gridX}:${u.data.gridY}`).join()]);

  // Main render loop
  useEffect(() => {
    const loop = (time: number) => {
      nowRef.current = time;
      const now = time;

      // Update move anims
      setVisualPos(prev => {
        const next = { ...prev };
        setMoveAnims(ma => {
          const alive: MoveAnim[] = [];
          ma.forEach(anim => {
            const t = Math.min(1, (now - anim.startTime) / anim.duration);
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            next[anim.unitId] = {
              x: anim.fromX + (anim.toX - anim.fromX) * ease,
              y: anim.fromY + (anim.toY - anim.fromY) * ease,
            };
            if (t < 1) alive.push(anim);
          });
          return alive;
        });
        return next;
      });

      // Tick attack/hit
      setAttackAnims(aa => aa.map(a => ({ ...a, progress: Math.min(1, a.progress + 0.07) })).filter(a => a.progress < 1));
      setHitAnims(ha => ha.map(a => ({ ...a, progress: Math.min(1, a.progress + 0.06) })).filter(a => a.progress < 1));

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Canvas draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Tiles
    battleState.grid.forEach(row => row.forEach(cell => {
      if (cell.prop === 'tree') drawTree(ctx, cell);
      else drawTile(ctx, cell);
    }));

    // Highlights
    const isJumpHL = jumpMode;
    battleState.reachableCells.forEach(c => {
      const cell = battleState.grid[c.y]?.[c.x];
      if (cell) {
        const isTree = cell.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0;
        drawHighlight(ctx, cell, isJumpHL && isTree ? 'jump' : 'move');
      }
    });
    battleState.targetableCells.forEach(c => {
      const cell = battleState.grid[c.y]?.[c.x];
      if (cell) drawHighlight(ctx, cell, 'attack');
    });

    if (hoveredCell) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(hoveredCell.x * CELL_PX + 1, hoveredCell.y * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);
    }

    // Units sorted by Y
    const sorted = [...battleState.units].sort((a, b) => a.data.gridY - b.data.gridY);
    sorted.forEach(unit => {
      const vp = visualPos[unit.data.id];
      if (!vp) return;
      const isCur = getCurrentUnit(battleState).data.id === unit.data.id;
      const isSel = battleState.selectedUnitId === unit.data.id;
      const onTree = battleState.unitsOnTree.has(unit.data.id);
      const atk = attackAnims.find(a => a.unitId === unit.data.id) ?? null;
      const hit = hitAnims.find(a => a.unitId === unit.data.id) ?? null;
      drawUnit(ctx, unit, vp.x, vp.y, isCur, isSel, onTree, atk, hit, nowRef.current);
    });
  }, [battleState, visualPos, attackAnims, hitAnims, hoveredCell, jumpMode]);

  // Log scroll
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [battleState.log]);

  // End check
  useEffect(() => {
    if (battleState.phase === 'victory') { onVictory(battleState); return; }
    if (battleState.phase === 'defeat') { onDefeat(); return; }
  }, [battleState.phase]);

  // Enemy AI
  useEffect(() => {
    if (curUnit.kind !== 'enemy' || processing || battleState.phase !== 'active') return;
    setProcessing(true);
    const t = setTimeout(() => {
      const prevHps = new Map(battleState.units.map(u => [u.data.id, u.data.hp]));
      const next = runEnemyTurn(battleState);
      next.units.forEach(u => {
        const prev = prevHps.get(u.data.id);
        if (prev !== undefined && u.data.hp < prev) {
          setTimeout(() => setHitAnims(ha => [...ha, { unitId: u.data.id, progress: 0 }]), 200);
          setAttackAnims(aa => {
            const attacker = battleState.units.find(a => a.teamId === curUnit.teamId && !a.data.isUnconscious && a.data.id !== u.data.id);
            if (attacker) return [...aa, { unitId: attacker.data.id, progress: 0 }];
            return aa;
          });
        }
      });
      onBattleUpdate(next);
      setProcessing(false);
    }, 850);
    return () => clearTimeout(t);
  }, [curUnit.kind, curUnit.data.id, battleState.round]);

  // Canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = canvasRef.current!.width / rect.width;
    const sy = canvasRef.current!.height / rect.height;
    const cx = Math.floor(((e.clientX - rect.left) * sx) / CELL_PX);
    const cy = Math.floor(((e.clientY - rect.top) * sy) / CELL_PX);
    if (cx < 0 || cx >= GRID_COLS || cy < 0 || cy >= GRID_ROWS || !isPlayerTurn) return;

    const curId = curUnit.data.id;

    if (jumpMode) {
      const cell = battleState.grid[cy]?.[cx];
      if (cell?.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0) {
        onBattleUpdate(doJump(battleState, curId, cx, cy));
      } else {
        onBattleUpdate(doJump(battleState, curId));
      }
      setJumpMode(false);
      return;
    }

    if (battleState.movementMode) {
      if (battleState.reachableCells.some(c => c.x === cx && c.y === cy)) {
        const prevHps = new Map(battleState.units.map(u => [u.data.id, u.data.hp]));
        const next = moveUnit(battleState, curId, cx, cy);
        next.units.forEach(u => {
          const p = prevHps.get(u.data.id);
          if (p !== undefined && u.data.hp < p) setHitAnims(ha => [...ha, { unitId: u.data.id, progress: 0 }]);
        });
        onBattleUpdate(next);
      }
      return;
    }

    if (battleState.selectedSkill) {
      const tgt = battleState.units.find(u => u.data.gridX === cx && u.data.gridY === cy && !u.data.isUnconscious);
      if (tgt && tgt.teamId !== curUnit.teamId) {
        if (battleState.targetableCells.some(c => c.x === cx && c.y === cy) || battleState.selectedSkill.aoe) {
          setAttackAnims(aa => [...aa, { unitId: curId, progress: 0 }]);
          const prevHps = new Map(battleState.units.map(u => [u.data.id, u.data.hp]));
          const next = executeAttack(battleState, curId, battleState.selectedSkill, tgt.data.id);
          next.units.forEach(u => {
            const p = prevHps.get(u.data.id);
            if (p !== undefined && u.data.hp < p) {
              setTimeout(() => setHitAnims(ha => [...ha, { unitId: u.data.id, progress: 0 }]), 200);
            }
          });
          onBattleUpdate({ ...next, selectedSkill: null, targetableCells: [] });
        }
      }
      return;
    }

    const clicked = battleState.units.find(u => u.data.gridX === cx && u.data.gridY === cy && !u.data.isUnconscious);
    if (clicked) onBattleUpdate({ ...battleState, selectedUnitId: clicked.data.id, selectedSkill: null, movementMode: false, targetableCells: [] });
  }, [battleState, isPlayerTurn, curUnit, jumpMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = canvasRef.current!.width / rect.width;
    const sy = canvasRef.current!.height / rect.height;
    const cx = Math.floor(((e.clientX - rect.left) * sx) / CELL_PX);
    const cy = Math.floor(((e.clientY - rect.top) * sy) / CELL_PX);
    setHoveredCell(cx >= 0 && cx < GRID_COLS && cy >= 0 && cy < GRID_ROWS ? { x: cx, y: cy } : null);
  }, []);

  const handleSkillClick = (sk: Skill) => {
    if (!isPlayerTurn) return;
    if (battleState.selectedSkill?.id === sk.id) {
      onBattleUpdate({ ...battleState, selectedSkill: null, targetableCells: [], movementMode: false });
      return;
    }
    setJumpMode(false);
    onBattleUpdate({ ...battleState, movementMode: false, ...selectSkill(battleState, sk, curUnit.data.id) });
  };

  const handleEndTurn = () => {
    if (!isPlayerTurn) return;
    setJumpMode(false);
    onBattleUpdate(endTurn(battleState));
  };

  const ACT_C: Record<string, string> = { action: '#f87171', bonus_action: '#fbbf24', reaction: '#818cf8', free: '#6b7280' };
  const LOG_C: Record<string, string> = {
    info: '#9ca3af', hit: '#60a5fa', miss: '#6b7280', critical: '#ff4757',
    heal: '#22c55e', death: '#ef4444', system: '#7c3aed', save: '#a78bfa', special: '#fbbf24',
  };

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex flex-col" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* TOP */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/8 bg-black/50 flex-wrap">
        <div className="flex gap-1.5 items-center flex-wrap">
          <span className="text-gray-600 text-xs font-mono">Инициатива:</span>
          {battleState.units.map((u, i) => (
            <div key={u.data.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold border"
              style={{
                borderColor: i === battleState.currentUnitIndex ? u.data.color : '#2a2a2a',
                backgroundColor: i === battleState.currentUnitIndex ? `${u.data.color}18` : 'transparent',
                color: u.data.isUnconscious ? '#444' : u.data.color,
                opacity: u.data.isUnconscious ? 0.5 : 1,
              }}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: u.teamId === 0 ? '#60a5fa' : '#f87171' }} />
              {u.data.name.split(' ')[0].substring(0, 6)}
              <span className="text-gray-600 font-mono text-xs">{u.data.hp}</span>
            </div>
          ))}
        </div>
        <div className="ml-auto flex gap-2 items-center">
          <span className="text-purple-600 text-xs font-mono">Р.{battleState.round}</span>
          <div className={`px-2 py-0.5 rounded text-xs font-black border ${isPlayerTurn ? 'border-blue-500/40 bg-blue-600/12 text-blue-300' : 'border-red-500/25 bg-red-600/8 text-red-300'}`}>
            {isPlayerTurn ? '▶ ВАШ ХОД' : processing ? '⏳' : '⚔ ВРАГ'}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* CANVAS */}
        <div className="flex-1 flex items-start justify-center p-2 overflow-auto bg-[#070d07]">
          <canvas
            ref={canvasRef}
            width={GRID_COLS * CELL_PX} height={GRID_ROWS * CELL_PX}
            style={{ imageRendering: 'pixelated', cursor: isPlayerTurn ? 'crosshair' : 'default', maxWidth: '100%', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredCell(null)}
          />
        </div>

        {/* RIGHT */}
        <div className="w-60 flex flex-col border-l border-white/8 bg-black/22">
          {curPlayer && (
            <div className="p-3 border-b border-white/8">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full border-2 flex-shrink-0"
                  style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5) 6%, ${curPlayer.color} 48%)`, borderColor: `${curPlayer.color}70` }} />
                <div>
                  <div className="text-white font-black text-sm">{curPlayer.name}</div>
                  <div className="text-xs font-mono" style={{ color: curPlayer.color }}>Ур.{curPlayer.level} · КБ {curPlayer.armorClass}</div>
                </div>
              </div>
              <div className="flex justify-between text-xs font-mono mb-0.5">
                <span className="text-green-400">HP</span>
                <span className="text-white">{curPlayer.hp}/{curPlayer.maxHp}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1.5">
                <div className="h-full rounded-full transition-all" style={{ width: `${(curPlayer.hp / curPlayer.maxHp) * 100}%`, backgroundColor: curPlayer.hp/curPlayer.maxHp > 0.5 ? '#22c55e' : '#ef4444' }} />
              </div>
              <div className="flex gap-1 flex-wrap">
                <span className={`text-xs px-1 py-0.5 rounded border font-bold ${curPlayer.hasAction ? 'border-red-500/50 text-red-400' : 'border-white/10 text-white/20 line-through'}`}>⚔Д</span>
                <span className={`text-xs px-1 py-0.5 rounded border font-bold ${curPlayer.hasBonusAction ? 'border-yellow-500/50 text-yellow-400' : 'border-white/10 text-white/20 line-through'}`}>✨Б</span>
                <span className={`text-xs px-1 py-0.5 rounded border font-bold ${curPlayer.hasReaction ? 'border-indigo-500/50 text-indigo-400' : 'border-white/10 text-white/20 line-through'}`}>🛡Р</span>
                <span className="text-xs px-1 py-0.5 rounded border border-blue-500/40 text-blue-400 font-bold">{curPlayer.movementLeft}ф</span>
              </div>
            </div>
          )}

          {curPlayer?.isUnconscious && (
            <div className="p-2 border-b border-red-900/25 bg-red-900/8">
              <div className="text-red-400 font-black text-xs mb-1">💀 СПАСБРОСОК ОТ СМЕРТИ</div>
              <div className="text-xs text-gray-500 mb-1.5">✅{curPlayer.deathSaves.successes}/3 ❌{curPlayer.deathSaves.failures}/3</div>
              <button onClick={() => onBattleUpdate(doDeathSave(battleState, curUnit.data.id))}
                className="w-full py-1.5 rounded text-xs font-black text-white bg-red-800/40 border border-red-600/35 hover:bg-red-700/50">🎲 Бросить к20</button>
            </div>
          )}

          <div className="flex-1 p-2 overflow-y-auto space-y-1">
            <div className="text-purple-600 text-xs font-mono tracking-widest uppercase mb-1">— Техники —</div>
            {curPlayer && curPlayer.unlockedSkills.map(sk => {
              const active = battleState.selectedSkill?.id === sk.id;
              const onCd = sk.currentCooldown > 0;
              const noAct = (sk.actionCost === 'action' && !curPlayer.hasAction)
                || (sk.actionCost === 'bonus_action' && !curPlayer.hasBonusAction)
                || (sk.actionCost === 'reaction' && !curPlayer.hasReaction);
              const dis = !isPlayerTurn || onCd || noAct || curPlayer.isUnconscious;
              return (
                <button key={sk.id} onClick={() => handleSkillClick(sk)} disabled={dis}
                  className="w-full p-2 rounded-xl border text-left transition-all hover:scale-[1.02] disabled:opacity-28 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{
                    borderColor: active ? curPlayer.color : '#ffffff10',
                    backgroundColor: active ? `${curPlayer.color}18` : '#ffffff03',
                    boxShadow: active ? `0 0 8px ${curPlayer.color}30` : 'none',
                  }}>
                  <div className="flex justify-between items-start">
                    <span className="text-white text-xs font-black leading-tight">{sk.name}</span>
                    <div className="flex gap-1 ml-1">
                      <span className="text-xs font-bold" style={{ color: ACT_C[sk.actionCost] }}>
                        {sk.actionCost === 'action' ? 'Д' : sk.actionCost === 'bonus_action' ? 'Б' : sk.actionCost === 'reaction' ? 'Р' : 'С'}
                      </span>
                      {onCd && <span className="text-orange-400 text-xs font-mono">⏱{sk.currentCooldown}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs font-mono mt-0.5">
                    <span className="text-red-400">{sk.damageDice.count}к{sk.damageDice.die.slice(1)}{sk.damageDice.modifier > 0 ? `+${sk.damageDice.modifier}` : ''}</span>
                    <span className="text-gray-600">{sk.range === 5 ? 'ближн' : `${sk.range}ф`}</span>
                    {sk.blackFlash && <span className="text-purple-400">⚡18-20</span>}
                    {sk.is100pct && <span className="text-yellow-400">100%</span>}
                  </div>
                  {active && sk.description && <div className="text-gray-500 text-xs mt-0.5 leading-tight">{sk.description}</div>}
                </button>
              );
            })}

            <div className="text-purple-600 text-xs font-mono tracking-widest uppercase mt-2 mb-1">— Действия —</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { label: 'Движение', icon: '👟', active: battleState.movementMode && !jumpMode, disabled: !isPlayerTurn || (curPlayer?.movementLeft ?? 0) <= 0, action: () => { setJumpMode(false); onBattleUpdate(toggleMovement(battleState, curUnit.data.id)); } },
                { label: 'Прыжок', icon: '⬆', active: jumpMode, disabled: !isPlayerTurn || !curPlayer?.hasBonusAction, action: () => { setJumpMode(!jumpMode); onBattleUpdate({ ...battleState, movementMode: !jumpMode, selectedSkill: null, reachableCells: !jumpMode ? battleState.reachableCells : [] }); }, hint: 'Клик на дерево — запрыгнуть' },
                { label: 'Рывок', icon: '💨', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction, action: () => onBattleUpdate(doDash(battleState, curUnit.data.id)) },
                { label: 'Отход', icon: '🚶', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction, action: () => onBattleUpdate(doDisengage(battleState, curUnit.data.id)) },
                { label: 'Кола', icon: '🥤', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction, action: () => onBattleUpdate(doCallCola(battleState, curUnit.data.id)) },
                { label: 'Отдышка', icon: '💨', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction || !curPlayer?.hasBonusAction || !hasCursedEnergy, action: () => onBattleUpdate(doCatchBreath(battleState, curUnit.data.id)), hint: !hasCursedEnergy ? 'Нет ячеек' : undefined },
              ].map(b => (
                <button key={b.label} onClick={b.action} disabled={b.disabled} title={b.hint}
                  className="py-1.5 px-1.5 rounded-lg border text-xs font-bold transition-all disabled:opacity-22 disabled:cursor-not-allowed"
                  style={{ borderColor: b.active ? '#3b82f6' : '#ffffff10', backgroundColor: b.active ? '#3b82f618' : '#ffffff03', color: b.active ? '#60a5fa' : '#9ca3af' }}>
                  {b.icon} {b.label}
                </button>
              ))}
            </div>
            <button onClick={handleEndTurn} disabled={!isPlayerTurn}
              className="w-full py-1.5 mt-1 rounded-xl text-xs font-black tracking-widest uppercase border border-purple-700/25 text-purple-500 hover:bg-purple-900/12 disabled:opacity-22 transition-all">
              ⏭ Завершить ход
            </button>
          </div>
        </div>

        {/* LOG */}
        <div className="w-46 border-l border-white/8 flex flex-col bg-black/12" style={{ minWidth: 180 }}>
          <div className="px-2 py-1.5 text-xs font-mono text-purple-600 border-b border-white/8">— ЛОГ —</div>
          <div ref={logRef} className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {battleState.log.map(e => (
              <div key={e.id} className="text-xs px-1 py-0.5 rounded leading-tight"
                style={{ color: LOG_C[e.type] ?? '#888', backgroundColor: e.type === 'critical' ? '#ff000010' : e.type === 'special' ? '#fbbf2408' : 'transparent' }}>
                {e.text}
                {e.diceResult && <span className="text-gray-700 font-mono"> [{e.diceResult.rolls.join('+')}]={e.diceResult.total}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

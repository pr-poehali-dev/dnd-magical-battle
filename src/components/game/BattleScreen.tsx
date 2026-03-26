import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  BattleState, BattleUnit, Skill, GRID_COLS, GRID_ROWS, CELL_PX, GridCell, Character, Enemy
} from '@/game/types';
import {
  moveUnit, executeAttack, doDash, doDisengage, doJump,
  doCallCola, doCatchBreath, doDeathSave, endTurn, runEnemyTurn,
  getCurrentUnit, selectSkill, toggleMovement, TREE_HP, doInfinityStep
} from '@/game/battleEngine';

interface Props {
  battleState: BattleState;
  onBattleUpdate: (s: BattleState) => void;
  onVictory: (state: BattleState) => void;
  onDefeat: () => void;
}

// ─── ANIM TYPES ──────────────────────────────────────────────────────────────
interface MoveAnim { unitId: string; fromX: number; fromY: number; toX: number; toY: number; startMs: number; durationMs: number }
interface FlashAnim { unitId: string; kind: 'attack' | 'hit' | 'dodge'; startMs: number; durationMs: number }
// Skill effect overlays on canvas (not tied to a unit position)
interface SkillFx { id: string; kind: 'blue_wave' | 'red_explosion' | 'blink'; x: number; y: number; startMs: number; durationMs: number }

// ─── TILE DRAW ────────────────────────────────────────────────────────────────
const TILE_GRASS = ['#2d4a1e','#2a461c','#31501f','#294219'];
const TILE_DARK  = ['#1c3010','#1a2e0e','#1f3613','#192c0d'];

function drawTile(ctx: CanvasRenderingContext2D, cell: GridCell) {
  const px = cell.x * CELL_PX, py = cell.y * CELL_PX, v = cell.tileVariant;
  ctx.fillStyle = TILE_GRASS[v];
  ctx.fillRect(px, py, CELL_PX, CELL_PX);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 2; i++) {
    const gx = px + 6 + ((v * 5 + i * 11 + cell.x) % (CELL_PX - 14));
    const gy = py + 8 + i * 15;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 4, gy - 5); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.25, py + 0.25, CELL_PX - 0.5, CELL_PX - 0.5);
}

function drawTree(ctx: CanvasRenderingContext2D, cell: GridCell) {
  const px = cell.x * CELL_PX, py = cell.y * CELL_PX, v = cell.tileVariant;
  const hp = cell.treeHp ?? TREE_HP;
  const cx2 = px + CELL_PX / 2, cy2 = py + CELL_PX / 2;
  ctx.fillStyle = TILE_DARK[v];
  ctx.fillRect(px, py, CELL_PX, CELL_PX);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.25, py + 0.25, CELL_PX - 0.5, CELL_PX - 0.5);
  if (hp <= 0) {
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(cx2 - 3, cy2 - 4, 6, CELL_PX / 2 + 4);
    return;
  }
  const FOLIAGE = ['#1a5c1a','#1e6b1e','#185418','#22721e'];
  const hr = hp / TREE_HP;
  ctx.fillStyle = '#5c3a1e';
  ctx.fillRect(cx2 - 4, cy2 + 2, 8, CELL_PX / 2 - 2);
  const fr = (13 + v * 2) * hr;
  ctx.shadowBlur = 5; ctx.shadowColor = 'rgba(0,80,0,0.35)';
  ctx.fillStyle = FOLIAGE[v];
  ctx.beginPath(); ctx.ellipse(cx2, cy2 - 3, fr, fr + 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.ellipse(cx2 - 4, cy2 - 7, fr * 0.35, fr * 0.45, -0.5, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < TREE_HP; i++) {
    ctx.fillStyle = i < hp ? '#22c55e' : '#222';
    ctx.beginPath(); ctx.arc(px + 5 + i * 8, py + 4, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawHighlight(ctx: CanvasRenderingContext2D, cell: GridCell, kind: 'move'|'attack'|'jump') {
  const px = cell.x * CELL_PX, py = cell.y * CELL_PX;
  const fills   = { move:'rgba(59,130,246,0.22)', attack:'rgba(239,68,68,0.22)', jump:'rgba(168,85,247,0.28)' };
  const strokes = { move:'rgba(59,130,246,0.7)', attack:'rgba(239,68,68,0.7)', jump:'rgba(168,85,247,0.8)' };
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
  flashAnims: FlashAnim[],
  now: number,
) {
  const { data, teamId } = unit;
  if (data.isDead) return;

  const atkFlash  = flashAnims.find(f => f.unitId === data.id && f.kind === 'attack');
  const hitFlash  = flashAnims.find(f => f.unitId === data.id && f.kind === 'hit');
  const dodgeFlash = flashAnims.find(f => f.unitId === data.id && f.kind === 'dodge');

  const atkT  = atkFlash  ? Math.min(1, (now - atkFlash.startMs)  / atkFlash.durationMs)  : -1;
  const hitT  = hitFlash  ? Math.min(1, (now - hitFlash.startMs)  / hitFlash.durationMs)  : -1;
  const dodgeT = dodgeFlash ? Math.min(1, (now - dodgeFlash.startMs) / dodgeFlash.durationMs) : -1;

  const scale = onTree ? 0.72 : 1;
  const C = data.color;
  const isEnemy = teamId === 1;
  const bob = isCurrent ? Math.sin(now / 220) * 1.5 : 0;

  ctx.save();
  ctx.globalAlpha = data.isUnconscious ? 0.35 : 1;
  ctx.translate(vx, vy - (onTree ? 8 : 0));
  ctx.scale(scale, scale);

  // Shake on hit
  if (hitT >= 0 && hitT < 0.6) {
    const shake = Math.sin(hitT * 25) * 4 * (1 - hitT / 0.6);
    ctx.translate(isEnemy ? shake : -shake, 0);
  }
  // Dodge lean
  if (dodgeT >= 0 && dodgeT < 1) {
    const lean = Math.sin(dodgeT * Math.PI) * 8;
    ctx.translate(isEnemy ? lean : -lean, Math.sin(dodgeT * Math.PI) * -5);
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
  const bg2 = ctx.createLinearGradient(-10, -12, 10, 7);
  bg2.addColorStop(0, 'rgba(255,255,255,0.22)');
  bg2.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = bg2;
  ctx.beginPath(); ctx.roundRect(-10, -12, 20, 19, [3,3,2,2]); ctx.fill();

  // Arm punch animation
  const punchT = atkT >= 0 ? Math.sin(atkT * Math.PI) : 0;
  const punchDir = isEnemy ? -1 : 1;
  ctx.fillStyle = shadeColor(C, -10);
  ctx.fillRect(-14, -8, 5, 9);
  ctx.fillRect(9, -8, 5, 9);
  ctx.fillStyle = shadeColor(C, 15);
  ctx.fillRect(9 + punchDir * punchT * 12, -8, 6, 9);
  ctx.fillStyle = shadeColor(C, 28);
  ctx.beginPath();
  ctx.roundRect(8 + punchDir * punchT * 12, -2, 8, 7, 2);
  ctx.fill();

  // Head
  ctx.fillStyle = shadeColor(C, 18);
  ctx.beginPath(); ctx.arc(0, -20 + bob, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.arc(-3, -25 + bob, 4, 0, Math.PI * 2); ctx.fill();

  // Eyes
  ctx.fillStyle = isEnemy ? '#ff5555' : 'white';
  ctx.beginPath(); ctx.arc(-4, -21 + bob, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -21 + bob, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isEnemy ? 'white' : '#1a1a2e';
  ctx.beginPath(); ctx.arc(-4, -21 + bob, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -21 + bob, 1.2, 0, Math.PI * 2); ctx.fill();

  // Team dot
  ctx.fillStyle = teamId === 0 ? '#60a5fa' : '#f87171';
  ctx.beginPath(); ctx.arc(10, -11, 3.5, 0, Math.PI * 2); ctx.fill();

  // Current / selected ring
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

  // Hit overlay
  if (hitT >= 0 && hitT < 0.55) {
    ctx.fillStyle = `rgba(255,60,60,${0.65 * (1 - hitT / 0.55)})`;
    ctx.beginPath(); ctx.roundRect(-12, -30, 24, 50, 4); ctx.fill();
  }
  // Dodge overlay (yellow)
  if (dodgeT >= 0 && dodgeT < 1) {
    ctx.fillStyle = `rgba(250,204,21,${0.5 * Math.sin(dodgeT * Math.PI)})`;
    ctx.beginPath(); ctx.roundRect(-12, -30, 24, 50, 4); ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;

  // Name + HP bar (in screen coords, above sprite)
  const bY = vy - (onTree ? 8 : 0) - 40 * scale;
  const bW = 44;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(vx - bW/2, bY - 12, bW, 11);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(data.name.split(' ')[0].substring(0, 8), vx, bY - 3);
  ctx.textAlign = 'left';
  const hpF = Math.max(0, data.hp / data.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(vx - bW/2, bY, bW, 5);
  ctx.fillStyle = hpF > 0.55 ? '#22c55e' : hpF > 0.28 ? '#f59e0b' : '#ef4444';
  ctx.fillRect(vx - bW/2, bY, bW * hpF, 5);

  if (data.isUnconscious) {
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('KO', vx, vy + 10);
    ctx.textAlign = 'left';
  }
  if (onTree) {
    ctx.fillStyle = '#86efac';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('на дереве', vx, bY - 15);
    ctx.textAlign = 'left';
  }
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function BattleScreen({ battleState, onBattleUpdate, onVictory, onDefeat }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // All positions stored as refs to avoid stale closures in rAF
  const visualPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const moveAnimsRef = useRef<MoveAnim[]>([]);
  const flashAnimsRef = useRef<FlashAnim[]>([]);
  const skillFxRef = useRef<SkillFx[]>([]);
  const prevGridRef   = useRef<Record<string, { x: number; y: number }>>({});

  // Trigger re-render from rAF
  const [, setTick] = useState(0);

  const [processing, setProcessing] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const [jumpMode, setJumpMode] = useState(false);
  // ── Dice roll animation ───────────────────────────────────────────────────────
  const [diceAnim, setDiceAnim] = useState<{
    value: number; die: string; label: string; phase: 'rolling' | 'result' | 'fading';
  } | null>(null);
  const diceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showDice = (value: number, die: string, label: string) => {
    if (diceTimerRef.current) clearTimeout(diceTimerRef.current);
    setDiceAnim({ value, die, label, phase: 'rolling' });
    diceTimerRef.current = setTimeout(() => {
      setDiceAnim(d => d ? { ...d, phase: 'result' } : null);
      diceTimerRef.current = setTimeout(() => {
        setDiceAnim(d => d ? { ...d, phase: 'fading' } : null);
        diceTimerRef.current = setTimeout(() => setDiceAnim(null), 600);
      }, 900);
    }, 500);
  };

  // Pending Manji Kick reaction
  const [pendingReaction, setPendingReaction] = useState<{
    attackerId: string;
    skillId: string;
    stateWithDamage: BattleState;
    playerHpBefore: number;
    playerId: string;
  } | null>(null);

  const battleRef = useRef(battleState);
  battleRef.current = battleState;

  const curUnit = getCurrentUnit(battleState);
  const isPlayerTurn = curUnit.kind === 'player' && !processing;
  const curPlayer = curUnit.kind === 'player' ? curUnit.data : null;
  const hasCursedEnergy = !!(curPlayer && curPlayer.maxCursedEnergy > 0);

  // ── Sync grid positions → visual positions ──────────────────────────────────
  useEffect(() => {
    battleState.units.forEach(u => {
      const id = u.data.id;
      const tx = u.data.gridX * CELL_PX + CELL_PX / 2;
      const ty = u.data.gridY * CELL_PX + CELL_PX / 2;
      const prevG = prevGridRef.current[id];

      if (!visualPosRef.current[id]) {
        // First time: set immediately
        visualPosRef.current[id] = { x: tx, y: ty };
        prevGridRef.current[id] = { x: u.data.gridX, y: u.data.gridY };
        return;
      }

      if (prevG && (prevG.x !== u.data.gridX || prevG.y !== u.data.gridY)) {
        // Grid changed → start move animation from current visual pos
        const from = visualPosRef.current[id];
        moveAnimsRef.current = [
          ...moveAnimsRef.current.filter(a => a.unitId !== id),
          { unitId: id, fromX: from.x, fromY: from.y, toX: tx, toY: ty, startMs: performance.now(), durationMs: 280 },
        ];
      }

      prevGridRef.current[id] = { x: u.data.gridX, y: u.data.gridY };
    });
  });

  // ── rAF loop: update positions + redraw ─────────────────────────────────────
  useEffect(() => {
    const loop = (now: number) => {
      // Update move animations
      const alive: MoveAnim[] = [];
      moveAnimsRef.current.forEach(anim => {
        const t = Math.min(1, (now - anim.startMs) / anim.durationMs);
        const ease = t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;
        visualPosRef.current[anim.unitId] = {
          x: anim.fromX + (anim.toX - anim.fromX) * ease,
          y: anim.fromY + (anim.toY - anim.fromY) * ease,
        };
        // Snap at end
        if (t >= 1) {
          visualPosRef.current[anim.unitId] = { x: anim.toX, y: anim.toY };
        } else {
          alive.push(anim);
        }
      });
      moveAnimsRef.current = alive;

      // Remove expired flash anims
      flashAnimsRef.current = flashAnimsRef.current.filter(f => now - f.startMs < f.durationMs);
      // Remove expired skill fx
      skillFxRef.current = skillFxRef.current.filter(f => now - f.startMs < f.durationMs);

      // Draw
      const canvas = canvasRef.current;
      const state = battleRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Tiles
          state.grid.forEach(row => row.forEach(cell => {
            if (cell.prop === 'tree') drawTree(ctx, cell);
            else drawTile(ctx, cell);
          }));

          // Highlights — только одна зона за раз: атака ИЛИ движение, не обе
          const hasSkill = !!state.selectedSkill;
          if (!hasSkill) {
            // Нет выбранного скилла — показываем зону движения
            state.reachableCells.forEach(c => {
              const cell = state.grid[c.y]?.[c.x];
              if (cell) drawHighlight(ctx, cell, jumpMode ? 'jump' : 'move');
            });
          } else {
            // Выбран скилл — показываем только зону атаки
            state.targetableCells.forEach(c => {
              const cell = state.grid[c.y]?.[c.x];
              if (cell) drawHighlight(ctx, cell, 'attack');
            });
          }

          // Infinity Step: рисуем круговой радиус досягаемости (5 клеток = 25 футов)
          if (state.selectedSkill?.id === 'gojo_blink') {
            const curU = getCurrentUnit(state);
            const cx2 = curU.data.gridX * CELL_PX + CELL_PX / 2;
            const cy2 = curU.data.gridY * CELL_PX + CELL_PX / 2;
            const radiusPx = 5 * CELL_PX; // 5 клеток в пикселях
            ctx.save();
            ctx.strokeStyle = 'rgba(168,85,247,0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath(); ctx.arc(cx2, cy2, radiusPx, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(168,85,247,0.04)';
            ctx.beginPath(); ctx.arc(cx2, cy2, radiusPx, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }

          if (hoveredCell) {
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1;
            ctx.strokeRect(hoveredCell.x * CELL_PX + 1, hoveredCell.y * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);
          }

          // Units
          const sorted = [...state.units].sort((a, b) => a.data.gridY - b.data.gridY);
          sorted.forEach(unit => {
            const vp = visualPosRef.current[unit.data.id];
            if (!vp) return;
            drawUnit(
              ctx, unit, vp.x, vp.y,
              getCurrentUnit(state).data.id === unit.data.id,
              state.selectedUnitId === unit.data.id,
              state.unitsOnTree.has(unit.data.id),
              flashAnimsRef.current,
              now,
            );
          });

          // ── Skill FX overlays ──────────────────────────────────────────────
          skillFxRef.current.forEach(fx => {
            const t = Math.min(1, (now - fx.startMs) / fx.durationMs);
            const alpha = t < 0.5 ? t * 2 : (1 - t) * 2;
            ctx.save();
            if (fx.kind === 'blue_wave') {
              // Expanding blue ring
              const r = 20 + t * 80;
              const grad = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
              grad.addColorStop(0, `rgba(6,182,212,${alpha * 0.9})`);
              grad.addColorStop(0.4, `rgba(14,116,144,${alpha * 0.5})`);
              grad.addColorStop(1, `rgba(6,182,212,0)`);
              ctx.fillStyle = grad;
              ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
              // Inner bright pulse
              ctx.fillStyle = `rgba(165,243,252,${alpha * 0.8})`;
              ctx.beginPath(); ctx.arc(fx.x, fx.y, 12 * (1 - t), 0, Math.PI * 2); ctx.fill();
            } else if (fx.kind === 'red_explosion') {
              // Expanding red burst
              const r2 = 10 + t * 2 * CELL_PX; // 2 cell radius
              const grad2 = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r2);
              grad2.addColorStop(0, `rgba(251,113,133,${alpha * 0.95})`);
              grad2.addColorStop(0.3, `rgba(239,68,68,${alpha * 0.7})`);
              grad2.addColorStop(0.7, `rgba(185,28,28,${alpha * 0.4})`);
              grad2.addColorStop(1, `rgba(239,68,68,0)`);
              ctx.fillStyle = grad2;
              ctx.beginPath(); ctx.arc(fx.x, fx.y, r2, 0, Math.PI * 2); ctx.fill();
              // Spike lines
              for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2 + t * 2;
                const len = r2 * (0.6 + Math.sin(t * 10 + i) * 0.2);
                ctx.strokeStyle = `rgba(253,186,116,${alpha * 0.7})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(fx.x + Math.cos(ang) * 8, fx.y + Math.sin(ang) * 8);
                ctx.lineTo(fx.x + Math.cos(ang) * len, fx.y + Math.sin(ang) * len);
                ctx.stroke();
              }
            } else if (fx.kind === 'blink') {
              // Purple teleport flash
              const r3 = 30 * (1 - t);
              ctx.fillStyle = `rgba(168,85,247,${alpha * 0.7})`;
              ctx.beginPath(); ctx.arc(fx.x, fx.y, r3 + 5, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = `rgba(216,180,254,${alpha})`;
              ctx.lineWidth = 2;
              ctx.beginPath(); ctx.arc(fx.x, fx.y, r3, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.restore();
          });
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [hoveredCell, jumpMode]); // minimal deps — reads battleRef directly

  // Log scroll
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [battleState.log]);

  // End check
  useEffect(() => {
    if (battleState.phase === 'victory') { onVictory(battleState); return; }
    if (battleState.phase === 'defeat') { onDefeat(); return; }
  }, [battleState.phase]);

  // ── Helper: trigger flash ───────────────────────────────────────────────────
  const flash = (unitId: string, kind: FlashAnim['kind'], durationMs = 400) => {
    flashAnimsRef.current = [
      ...flashAnimsRef.current.filter(f => !(f.unitId === unitId && f.kind === kind)),
      { unitId, kind, startMs: performance.now(), durationMs },
    ];
  };

  // ── Helper: add skill FX on canvas ──────────────────────────────────────────
  const addSkillFx = (kind: SkillFx['kind'], gridX: number, gridY: number, durationMs = 700) => {
    const id = String(Math.random());
    const x = gridX * CELL_PX + CELL_PX / 2;
    const y = gridY * CELL_PX + CELL_PX / 2;
    skillFxRef.current = [...skillFxRef.current, { id, kind, x, y, startMs: performance.now(), durationMs }];
  };

  // ── Enemy AI ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (curUnit.kind !== 'enemy' || processing || battleState.phase !== 'active') return;
    setProcessing(true);
    const t = setTimeout(() => {
      const prevHps = new Map(battleState.units.map(u => [u.data.id, u.data.hp]));
      const stateBeforeAttack = battleState; // snapshot before enemy acts
      const next = runEnemyTurn(battleState);

      // Check if enemy dealt melee damage to a player who has Manji Kick ready
      // Use ORIGINAL positions (before move) to determine if attack was melee
      const enemyUnitAfter = next.units.find(u => u.data.id === curUnit.data.id);
      const attackedPlayerUnit = next.units.find(u => {
        const prev = prevHps.get(u.data.id);
        return u.teamId === 0 && prev !== undefined && u.data.hp < prev;
      });

      if (attackedPlayerUnit && enemyUnitAfter) {
        // Check distance AFTER enemy moved (that's where the attack came from)
        const distCells = Math.max(
          Math.abs(enemyUnitAfter.data.gridX - attackedPlayerUnit.data.gridX),
          Math.abs(enemyUnitAfter.data.gridY - attackedPlayerUnit.data.gridY)
        );
        if (distCells <= 1 && attackedPlayerUnit.kind === 'player') {
          const playerChar = attackedPlayerUnit.data;
          const manjiKick = playerChar.unlockedSkills?.find(
            s => s.id === 'manji_kick' && s.currentCooldown === 0
          );
          if (manjiKick && playerChar.hasReaction) {
            flash(curUnit.data.id, 'attack', 300);
            // Show reaction prompt — pass `next` state but mark that damage should be cancelled
            // We store prev HP so we can restore it if player uses reaction
            setPendingReaction({
              attackerId: enemyUnitAfter.data.id,
              skillId: manjiKick.id,
              stateWithDamage: next,
              playerHpBefore: prevHps.get(attackedPlayerUnit.data.id) ?? attackedPlayerUnit.data.hp,
              playerId: attackedPlayerUnit.data.id,
            });
            setProcessing(false);
            return;
          }
        }
      }

      flash(curUnit.data.id, 'attack', 280);
      next.units.forEach(u => {
        const prev = prevHps.get(u.data.id);
        if (prev !== undefined && u.data.hp < prev) {
          setTimeout(() => flash(u.data.id, 'hit', 400), 200);
        }
      });

      onBattleUpdate(next);
      setProcessing(false);
    }, 850);
    return () => clearTimeout(t);
  }, [curUnit.kind, curUnit.data.id, battleState.round]);

  // ── Canvas click ─────────────────────────────────────────────────────────────
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
        onBattleUpdate(moveUnit(battleState, curId, cx, cy));
      }
      return;
    }

    if (battleState.selectedSkill) {
      const sk = battleState.selectedSkill;
      const tgt = battleState.units.find(u => u.data.gridX === cx && u.data.gridY === cy && !u.data.isUnconscious);

      // Infinity Step — click any unit to teleport to them
      if (sk.id === 'gojo_blink') {
        const anyUnit = battleState.units.find(u => u.data.gridX === cx && u.data.gridY === cy && !u.data.isUnconscious);
        if (anyUnit && anyUnit.data.id !== curId) {
          addSkillFx('blink', curUnit.data.gridX, curUnit.data.gridY, 500);
          addSkillFx('blink', cx, cy, 500);
          const next2 = doInfinityStep(battleState, curId, anyUnit.data.id);
          onBattleUpdate({ ...next2, selectedSkill: null, targetableCells: [] });
        }
        return;
      }

      if (tgt && tgt.teamId !== curUnit.teamId) {
        if (battleState.targetableCells.some(c => c.x === cx && c.y === cy) || sk.aoe) {
          flash(curId, 'attack', 350);

          // Skill-specific FX
          if (sk.id === 'lapse_blue') {
            addSkillFx('blue_wave', curUnit.data.gridX, curUnit.data.gridY, 800);
            setTimeout(() => addSkillFx('blue_wave', tgt.data.gridX, tgt.data.gridY, 600), 200);
          } else if (sk.id === 'reversal_red') {
            addSkillFx('red_explosion', cx, cy, 900);
          }

          const prevHps = new Map(battleState.units.map(u => [u.data.id, u.data.hp]));
          const next = executeAttack(battleState, curId, sk, tgt.data.id);
          // Show dice
          const newLogs = next.log.slice(battleState.log.length);
          const diceLog = newLogs.find(l => l.diceResult);
          if (diceLog?.diceResult) {
            showDice(diceLog.diceResult.total, diceLog.diceResult.die, diceLog.diceResult.die);
          }
          next.units.forEach(u => {
            const p = prevHps.get(u.data.id);
            if (p !== undefined && u.data.hp < p) setTimeout(() => flash(u.data.id, 'hit', 450), 300);
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

  // ── Manji Kick reaction handler ───────────────────────────────────────────────
  const handleManjiReaction = (use: boolean) => {
    if (!pendingReaction) return;
    const { stateWithDamage, playerHpBefore, playerId, attackerId } = pendingReaction;
    setPendingReaction(null);

    if (!use) {
      // Player accepts the hit — apply damage normally
      flash(playerId, 'hit', 400);
      onBattleUpdate(endTurn(stateWithDamage));
      return;
    }

    // Player DODGES — restore HP before damage, then counter
    // Restore player HP (dodge = no damage)
    const dodgedState: BattleState = {
      ...stateWithDamage,
      units: stateWithDamage.units.map(u =>
        u.data.id === playerId
          ? { ...u, data: { ...u.data, hp: playerHpBefore, hasReaction: false } as typeof u.data }
          : u
      ),
      log: [...stateWithDamage.log, {
        id: String(Date.now()),
        text: `⚡ Manji Kick! ${stateWithDamage.units.find(u => u.data.id === playerId)?.data.name} уклоняется — урон отменён!`,
        type: 'special' as const,
      }],
    };

    // Find player and manji kick skill
    const playerUnit = dodgedState.units.find(u => u.data.id === playerId);
    const sk = playerUnit?.kind === 'player'
      ? playerUnit.data.unlockedSkills?.find(s => s.id === 'manji_kick')
      : null;

    flash(playerId, 'dodge', 450);
    setTimeout(() => flash(playerId, 'attack', 320), 350);
    setTimeout(() => flash(attackerId, 'hit', 350), 500);

    if (!playerUnit || !sk) {
      onBattleUpdate(endTurn(dodgedState));
      return;
    }

    // Counter attack
    const counterState = executeAttack(dodgedState, playerId, sk, attackerId);
    onBattleUpdate(endTurn(counterState));
  };

  const handleSkillClick = (sk: Skill) => {
    if (!isPlayerTurn) return;
    if (battleState.selectedSkill?.id === sk.id) {
      onBattleUpdate({ ...battleState, selectedSkill: null, targetableCells: [], movementMode: false });
      return;
    }
    setJumpMode(false);
    // Infinity Step: highlight all units within 5 cells (евклидово)
    if (sk.id === 'gojo_blink') {
      const allTargets = battleState.units
        .filter(u => u.data.id !== curUnit.data.id && !u.data.isUnconscious &&
          Math.sqrt((u.data.gridX - curUnit.data.gridX) ** 2 + (u.data.gridY - curUnit.data.gridY) ** 2) <= 5)
        .map(u => ({ x: u.data.gridX, y: u.data.gridY }));
      onBattleUpdate({ ...battleState, selectedSkill: sk, movementMode: false, targetableCells: allTargets });
      return;
    }
    onBattleUpdate({ ...battleState, movementMode: false, ...selectSkill(battleState, sk, curUnit.data.id) });
  };

  const handleEndTurn = () => {
    if (!isPlayerTurn) return;
    setJumpMode(false);
    onBattleUpdate(endTurn(battleState));
  };

  const ACT_C: Record<string, string> = { action:'#f87171', bonus_action:'#fbbf24', reaction:'#a78bfa', free:'#6b7280' };
  const LOG_C: Record<string, string> = {
    info:'#9ca3af', hit:'#60a5fa', miss:'#6b7280', critical:'#ff4757',
    heal:'#22c55e', death:'#ef4444', system:'#7c3aed', save:'#a78bfa', special:'#fbbf24',
  };

  // Manji Kick available check (for display in pending reaction)
  const hasManjiKick = curPlayer?.unlockedSkills?.some(s => s.id === 'manji_kick' && s.currentCooldown === 0 && curPlayer.hasReaction);

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex flex-col" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      {/* TOP HUD */}
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
          <div className={`px-2 py-0.5 rounded text-xs font-black border ${isPlayerTurn ? 'border-blue-500/40 bg-blue-600/10 text-blue-300' : 'border-red-500/25 bg-red-600/8 text-red-300'}`}>
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
            style={{ cursor: isPlayerTurn ? 'crosshair' : 'default', maxWidth: '100%', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredCell(null)}
          />
        </div>

        {/* RIGHT PANEL */}
        <div className="w-60 flex flex-col border-l border-white/8 bg-black/22">
          {curPlayer && !curPlayer.isUnconscious && (
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
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${(curPlayer.hp/curPlayer.maxHp)*100}%`, backgroundColor: curPlayer.hp/curPlayer.maxHp > 0.5 ? '#22c55e' : '#ef4444' }} />
              </div>
              <div className="flex gap-1 flex-wrap">
                <span className={`text-xs px-1 py-0.5 rounded border font-bold ${curPlayer.hasAction ? 'border-red-500/50 text-red-400' : 'border-white/10 text-white/20 line-through'}`}>⚔Д</span>
                <span className={`text-xs px-1 py-0.5 rounded border font-bold ${curPlayer.hasBonusAction ? 'border-yellow-500/50 text-yellow-400' : 'border-white/10 text-white/20 line-through'}`}>✨Б</span>
                <span className={`text-xs px-1 py-0.5 rounded border font-bold ${curPlayer.hasReaction ? 'border-purple-500/50 text-purple-400' : 'border-white/10 text-white/20 line-through'}`}>🛡Р</span>
                <span className="text-xs px-1 py-0.5 rounded border border-blue-500/40 text-blue-400 font-bold">{curPlayer.movementLeft}ф</span>
              </div>
            </div>
          )}

          {/* Death saves */}
          {curPlayer?.isUnconscious && (
            <div className="p-2 border-b border-red-900/25 bg-red-900/8">
              <div className="text-red-400 font-black text-xs mb-1">💀 СПАСБРОСОК ОТ СМЕРТИ</div>
              {curPlayer.deathSaves.successes > 0 || curPlayer.deathSaves.failures > 0 ? (
                <div className="text-xs text-gray-500">Бросок уже использован в этой битве</div>
              ) : (
                <>
                  <div className="text-xs text-gray-500 mb-1.5">к20 vs СЛ10 · 1 попытка за битву</div>
                  <div className="text-xs text-gray-600 mb-1.5">✅ 10+ = встать с 1 HP · 🌟 20 = встать с 2 HP</div>
                  <button onClick={() => onBattleUpdate(doDeathSave(battleState, curUnit.data.id))}
                    className="w-full py-1.5 rounded text-xs font-black text-white bg-red-800/40 border border-red-600/35 hover:bg-red-700/50">🎲 Бросить к20</button>
                </>
              )}
            </div>
          )}

          {/* Manji Kick Reaction prompt */}
          {pendingReaction && (
            <div className="p-3 border-b border-purple-700/50 bg-purple-900/20 animate-pulse">
              <div className="text-purple-300 font-black text-sm mb-1">⚡ РЕАКЦИЯ!</div>
              <div className="text-gray-300 text-xs mb-2">Враг атакует вблизи — использовать Manji Kick?</div>
              <div className="text-xs text-yellow-400 mb-2">Уклонение + контратака 1к2</div>
              <div className="flex gap-2">
                <button onClick={() => handleManjiReaction(true)}
                  className="flex-1 py-2 rounded font-black text-xs text-white bg-purple-700 border border-purple-500 hover:bg-purple-600">
                  ✅ Да!
                </button>
                <button onClick={() => handleManjiReaction(false)}
                  className="flex-1 py-2 rounded font-bold text-xs text-gray-400 border border-white/15 hover:bg-white/5">
                  Пропустить
                </button>
              </div>
            </div>
          )}

          {/* Skills */}
          <div className="flex-1 p-2 overflow-y-auto space-y-1">
            <div className="text-purple-600 text-xs font-mono tracking-widest uppercase mb-1">— Техники —</div>
            {curPlayer && curPlayer.unlockedSkills.map(sk => {
              // Manji Kick is reaction-only — show separately, not as clickable attack
              if (sk.actionCost === 'reaction') {
                const onCd = sk.currentCooldown > 0;
                return (
                  <div key={sk.id} className="p-2 rounded-xl border border-purple-700/30 bg-purple-900/10">
                    <div className="flex justify-between items-start">
                      <span className="text-purple-300 text-xs font-black">{sk.name}</span>
                      <div className="flex gap-1">
                        <span className="text-xs font-bold text-purple-400">Р</span>
                        {onCd && <span className="text-orange-400 text-xs font-mono">⏱{sk.currentCooldown}</span>}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-gray-500 mt-0.5">
                      <span className="text-red-400">1к2</span> · уклонение + контратака
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">{sk.description}</div>
                    <div className={`text-xs mt-1 font-bold ${!onCd && curPlayer.hasReaction ? 'text-green-400' : 'text-gray-600'}`}>
                      {onCd ? `Перезарядка: ${sk.currentCooldown} хода` : curPlayer.hasReaction ? '✅ Готова' : '❌ Реакция использована'}
                    </div>
                  </div>
                );
              }

              const active = battleState.selectedSkill?.id === sk.id;
              const onCd = sk.currentCooldown > 0;
              const noAct = (sk.actionCost === 'action' && !curPlayer.hasAction)
                || (sk.actionCost === 'bonus_action' && !curPlayer.hasBonusAction);
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
                        {sk.actionCost === 'action' ? 'Д' : sk.actionCost === 'bonus_action' ? 'Б' : 'С'}
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

            {/* Base actions */}
            <div className="text-purple-600 text-xs font-mono tracking-widest uppercase mt-2 mb-1">— Действия —</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { label:'Движение', icon:'👟', active: battleState.movementMode && !jumpMode, disabled: !isPlayerTurn || (curPlayer?.movementLeft ?? 0) <= 0, action: () => { setJumpMode(false); onBattleUpdate(toggleMovement(battleState, curUnit.data.id)); } },
                { label:'Прыжок', icon:'⬆', active: jumpMode, disabled: !isPlayerTurn || !curPlayer?.hasBonusAction, action: () => { setJumpMode(!jumpMode); onBattleUpdate({ ...battleState, movementMode: !jumpMode, selectedSkill: null }); } },
                { label:'Рывок', icon:'💨', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction, action: () => onBattleUpdate(doDash(battleState, curUnit.data.id)) },
                { label:'Отход', icon:'🚶', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction, action: () => onBattleUpdate(doDisengage(battleState, curUnit.data.id)) },
                { label:'Кола', icon:'🥤', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction, action: () => onBattleUpdate(doCallCola(battleState, curUnit.data.id)) },
                { label:'Отдышка', icon:'💨', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction || !curPlayer?.hasBonusAction || !hasCursedEnergy, action: () => onBattleUpdate(doCatchBreath(battleState, curUnit.data.id)), hint: !hasCursedEnergy ? 'Нет ячеек' : undefined },
              ].map(b => (
                <button key={b.label} onClick={b.action} disabled={b.disabled} title={(b as {hint?:string}).hint}
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
        <div className="border-l border-white/8 flex flex-col bg-black/12" style={{ minWidth: 175, maxWidth: 175 }}>
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

      {/* ── DICE ROLL OVERLAY ─────────────────────────────────────────────── */}
      {diceAnim && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50"
          style={{ opacity: diceAnim.phase === 'fading' ? 0 : 1, transition: 'opacity 0.6s ease' }}>
          <div className="flex flex-col items-center gap-3"
            style={{
              animation: diceAnim.phase === 'result' ? 'dice-bounce 0.4s ease-out forwards' : undefined,
              transform: diceAnim.phase === 'rolling' ? 'scale(0.5) rotate(-30deg)' : undefined,
              transition: diceAnim.phase === 'rolling' ? undefined : 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}>
            {/* Die shape */}
            <div className="relative flex items-center justify-center"
              style={{
                width: 96, height: 96,
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
                border: '2px solid #818cf8',
                borderRadius: 16,
                boxShadow: '0 0 40px rgba(129,140,248,0.6), 0 0 80px rgba(129,140,248,0.2)',
                animation: diceAnim.phase === 'rolling' ? 'spin 0.4s linear' : 'none',
              }}>
              <span className="text-4xl font-black text-white" style={{ textShadow: '0 0 20px #a5b4fc' }}>
                {diceAnim.phase === 'rolling' ? '?' : diceAnim.value}
              </span>
              {/* Die dots decoration */}
              <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-indigo-400/40" />
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-400/40" />
              <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-indigo-400/40" />
              <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-indigo-400/40" />
            </div>
            <div className="text-indigo-300 text-sm font-bold tracking-wider bg-black/60 px-3 py-1 rounded-full border border-indigo-500/30">
              {diceAnim.die.toUpperCase()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
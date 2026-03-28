import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  BattleState, BattleUnit, Skill, GRID_COLS, GRID_ROWS, CELL_PX, GridCell
} from '@/game/types';
import {
  moveUnit, executeAttack, executeReversalRed, doDash, doDisengage, doJump,
  doCallCola, doCatchBreath, doDeathSave, endTurn,
  getCurrentUnit, selectSkill, toggleMovement, TREE_HP, doInfinityStep,
  doUnarmedAttack, doProbabilityShift, runEnemyMove, runEnemyAttack
} from '@/game/battleEngine';

interface Props {
  battleState: BattleState;
  onBattleUpdate: (s: BattleState) => void;
  onVictory: (state: BattleState) => void;
  onDefeat: () => void;
  isLocalPvp?: boolean;
  onBattleEnd?: () => void; // кнопка "Завершить битву" вместо onDefeat
}

// ─── ANIM TYPES ──────────────────────────────────────────────────────────────
interface MoveAnim { unitId: string; fromX: number; fromY: number; toX: number; toY: number; startMs: number; durationMs: number }
interface FlashAnim { unitId: string; kind: 'attack' | 'hit' | 'dodge'; startMs: number; durationMs: number }
// Skill effect overlays on canvas (not tied to a unit position)
interface SkillFx {
  id: string;
  kind: 'blue_wave' | 'red_explosion' | 'blink' | 'red_ball';
  x: number; y: number;
  startMs: number; durationMs: number;
  // For red_ball: trajectory from attacker
  fromX?: number; fromY?: number;
}

// ─── TILE DRAW ────────────────────────────────────────────────────────────────
const TILE_GRASS = ['#2d4a1e','#2a461c','#31501f','#294219'];
const TILE_DARK  = ['#1c3010','#1a2e0e','#1f3613','#192c0d'];
const TILE_MOUNTAIN = ['#3a3530','#352f2a','#3d3733','#302a26'];

// Рисует гору в зависимости от позиции (стена слева/справа/сверху/снизу)
function drawMountain(ctx: CanvasRenderingContext2D, cell: GridCell) {
  const px = cell.x * CELL_PX, py = cell.y * CELL_PX;
  const x = cell.x, y = cell.y;
  const v = cell.tileVariant;

  // Тёмный скальный фон
  ctx.fillStyle = TILE_MOUNTAIN[v];
  ctx.fillRect(px, py, CELL_PX, CELL_PX);

  const isTop = y === 0;
  const isBottom = y === GRID_ROWS - 1;
  const isLeft = x === 0;
  const isRight = x === GRID_COLS - 1;

  ctx.save();

  if (isTop) {
    // Верхняя стена — горы торчат вниз
    ctx.fillStyle = '#4a4440';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + CELL_PX / 2 + (v - 1) * 8, py + CELL_PX * 0.85);
    ctx.lineTo(px + CELL_PX, py);
    ctx.closePath(); ctx.fill();
    // Снег сверху
    ctx.fillStyle = 'rgba(230,230,240,0.7)';
    ctx.fillRect(px, py, CELL_PX, 8 + v * 2);
  } else if (isBottom) {
    // Нижняя стена — горы торчат вверх
    ctx.fillStyle = '#4a4440';
    ctx.beginPath();
    ctx.moveTo(px, py + CELL_PX);
    ctx.lineTo(px + CELL_PX / 2 + (v - 1) * 8, py + CELL_PX * 0.15);
    ctx.lineTo(px + CELL_PX, py + CELL_PX);
    ctx.closePath(); ctx.fill();
    // Снег
    ctx.fillStyle = 'rgba(220,220,230,0.6)';
    const sH = 10 + v * 2;
    ctx.beginPath();
    ctx.moveTo(px + CELL_PX / 2 + (v - 1) * 8, py + CELL_PX * 0.15);
    ctx.lineTo(px + CELL_PX / 2 + (v - 1) * 8 - sH, py + CELL_PX * 0.15 + sH);
    ctx.lineTo(px + CELL_PX / 2 + (v - 1) * 8 + sH, py + CELL_PX * 0.15 + sH);
    ctx.closePath(); ctx.fill();
  } else if (isLeft) {
    // Левая стена — горы торчат вправо
    ctx.fillStyle = '#4a4440';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + CELL_PX * 0.85, py + CELL_PX / 2 + (v - 1) * 6);
    ctx.lineTo(px, py + CELL_PX);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(230,230,240,0.6)';
    ctx.fillRect(px, py, 8 + v, CELL_PX);
  } else if (isRight) {
    // Правая стена — горы торчат влево
    ctx.fillStyle = '#4a4440';
    ctx.beginPath();
    ctx.moveTo(px + CELL_PX, py);
    ctx.lineTo(px + CELL_PX * 0.15, py + CELL_PX / 2 + (v - 1) * 6);
    ctx.lineTo(px + CELL_PX, py + CELL_PX);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(220,220,230,0.6)';
    ctx.fillRect(px + CELL_PX - 8 - v, py, 8 + v, CELL_PX);
  } else {
    // Угловые клетки
    ctx.fillStyle = '#3d3733';
    ctx.fillRect(px, py, CELL_PX, CELL_PX);
    ctx.fillStyle = 'rgba(220,220,230,0.5)';
    ctx.fillRect(px, py, CELL_PX / 2, CELL_PX / 2);
  }

  // Тёмный контур клетки
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px, py, CELL_PX, CELL_PX);
  ctx.restore();
}

function drawTile(ctx: CanvasRenderingContext2D, cell: GridCell) {
  const px = cell.x * CELL_PX, py = cell.y * CELL_PX, v = cell.tileVariant;
  // Mountains on edge (blocked cells)
  if (cell.terrain === 'blocked') {
    drawMountain(ctx, cell);
    return;
  }
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
  // Лёгкий тёмно-зелёный фон (без сильного затемнения)
  ctx.fillStyle = ['#243518','#223216','#26381a','#203014'][v];
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
  attackDirX: number = 1, // +1 = facing right (player), -1 = facing left (enemy)
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
  const facingDir = attackDirX; // +1 facing right, -1 facing left

  ctx.save();
  ctx.globalAlpha = data.isUnconscious ? 0.35 : 1;
  ctx.translate(vx, vy - (onTree ? 8 : 0));
  ctx.scale(scale * facingDir, scale); // flip horizontally based on facing

  // Shake on hit
  if (hitT >= 0 && hitT < 0.6) {
    const shake = Math.sin(hitT * 25) * 4 * (1 - hitT / 0.6);
    ctx.translate(-shake, 0); // always shake left in local space
  }
  // Dodge lean
  if (dodgeT >= 0 && dodgeT < 1) {
    const lean = Math.sin(dodgeT * Math.PI) * 8;
    ctx.translate(-lean, Math.sin(dodgeT * Math.PI) * -5);
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 20, 13, 5, 0, 0, Math.PI * 2); ctx.fill();

  // Legs — more detailed with knees
  const legBob = isCurrent ? Math.sin(now / 200) * 2 : 0;
  // Left leg
  ctx.fillStyle = shadeColor(C, -40);
  ctx.beginPath(); ctx.roundRect(-9, 5 + legBob, 7, 8, 2); ctx.fill();
  ctx.fillStyle = shadeColor(C, -55);
  ctx.beginPath(); ctx.roundRect(-9, 11 + legBob, 7, 8, [0,0,2,2]); ctx.fill();
  // Shoe left
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.roundRect(-10, 17 + legBob, 9, 4, 2); ctx.fill();
  // Right leg
  ctx.fillStyle = shadeColor(C, -35);
  ctx.beginPath(); ctx.roundRect(2, 5 - legBob, 7, 8, 2); ctx.fill();
  ctx.fillStyle = shadeColor(C, -50);
  ctx.beginPath(); ctx.roundRect(2, 11 - legBob, 7, 8, [0,0,2,2]); ctx.fill();
  // Shoe right
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.roundRect(1, 17 - legBob, 9, 4, 2); ctx.fill();

  // Belt
  ctx.fillStyle = shadeColor(C, -60);
  ctx.beginPath(); ctx.roundRect(-10, 3, 20, 4, 1); ctx.fill();
  // Belt buckle
  ctx.fillStyle = '#e5c97e';
  ctx.beginPath(); ctx.roundRect(-2, 3.5, 4, 3, 1); ctx.fill();

  // Body / torso
  ctx.fillStyle = C;
  ctx.beginPath(); ctx.roundRect(-10, -13, 20, 18, [4,4,2,2]); ctx.fill();
  // Body highlight
  const bodyGrad = ctx.createLinearGradient(-10, -13, 10, 5);
  bodyGrad.addColorStop(0, 'rgba(255,255,255,0.28)');
  bodyGrad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  bodyGrad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.roundRect(-10, -13, 20, 18, [4,4,2,2]); ctx.fill();
  // Collar
  ctx.fillStyle = shadeColor(C, -25);
  ctx.beginPath(); ctx.roundRect(-4, -13, 8, 5, [2,2,0,0]); ctx.fill();

  // ─ Arms ─
  const punchT = atkT >= 0 ? Math.sin(atkT * Math.PI) : 0;
  // Back arm (left in local space)
  ctx.fillStyle = shadeColor(C, -20);
  ctx.beginPath(); ctx.roundRect(-15, -10, 6, 12, 3); ctx.fill();
  ctx.fillStyle = shadeColor(C, -10);
  ctx.beginPath(); ctx.arc(-12, 2, 3.5, 0, Math.PI * 2); ctx.fill();
  // Front arm (punching)
  const armExtend = punchT * 14;
  ctx.fillStyle = shadeColor(C, 10);
  ctx.beginPath(); ctx.roundRect(9, -10, 6, 12, 3); ctx.fill();
  // Fist
  ctx.fillStyle = shadeColor(C, 25);
  ctx.beginPath(); ctx.roundRect(9 + armExtend, -4, 9, 8, 3); ctx.fill();
  // Fist knuckle lines
  ctx.strokeStyle = shadeColor(C, -10);
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(11 + armExtend + k * 2.5, -4);
    ctx.lineTo(11 + armExtend + k * 2.5, 4);
    ctx.stroke();
  }

  // ─ Head ─
  // Neck
  ctx.fillStyle = shadeColor(C, 5);
  ctx.beginPath(); ctx.roundRect(-4, -16, 8, 5, 1); ctx.fill();
  // Head shape
  ctx.fillStyle = shadeColor(C, 20);
  ctx.beginPath(); ctx.roundRect(-11, -30 + bob, 22, 18, 6); ctx.fill();
  // Head top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(-2, -27 + bob, 6, 4, -0.3, 0, Math.PI * 2); ctx.fill();

  // Hair band / headband detail
  if (!isEnemy) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.roundRect(-11, -22 + bob, 22, 3, 1); ctx.fill();
  } else {
    // Enemy: spiky hair effect
    for (let s = 0; s < 3; s++) {
      ctx.fillStyle = shadeColor(C, 35);
      ctx.beginPath();
      ctx.moveTo(-8 + s * 6, -30 + bob);
      ctx.lineTo(-5 + s * 6, -38 + bob);
      ctx.lineTo(-2 + s * 6, -30 + bob);
      ctx.closePath(); ctx.fill();
    }
  }

  // Eyes — more expressive
  const eyeY = -23 + bob;
  // Eye whites
  ctx.fillStyle = isEnemy ? '#330000' : 'white';
  ctx.beginPath(); ctx.ellipse(-5, eyeY, 3.5, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5, eyeY, 3.5, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  // Iris
  ctx.fillStyle = isEnemy ? '#cc0000' : data.color;
  ctx.beginPath(); ctx.arc(-5, eyeY, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, eyeY, 2.2, 0, Math.PI * 2); ctx.fill();
  // Pupil
  ctx.fillStyle = isEnemy ? '#ff3333' : '#000';
  ctx.beginPath(); ctx.arc(-5, eyeY, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, eyeY, 1.1, 0, Math.PI * 2); ctx.fill();
  // Eye shine
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(-4.2, eyeY - 1, 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5.8, eyeY - 1, 0.8, 0, Math.PI * 2); ctx.fill();

  // Mouth / expression
  if (atkT >= 0 && atkT < 0.7) {
    // Determined expression during attack
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-4, -17 + bob); ctx.lineTo(4, -17 + bob); ctx.stroke();
  }

  // Team indicator — убрана видимая точка (прозрачная)

  // Character-specific details based on color
  const isGojo = data.color === '#06B6D4' || data.id.includes('honored');
  if (isGojo) {
    // Gojo blindfold
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.roundRect(-11, -25 + bob, 22, 4, 2); ctx.fill();
    // Six eyes glow
    ctx.shadowBlur = 10; ctx.shadowColor = '#06b6d4';
    ctx.fillStyle = 'rgba(6,182,212,0.55)';
    ctx.beginPath(); ctx.roundRect(-11, -25 + bob, 22, 4, 2); ctx.fill();
    ctx.shadowBlur = 0;
    // White hair detail
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.roundRect(-11, -30 + bob, 22, 6, [4,4,0,0]); ctx.fill();
  }

  // Current / selected ring
  if (isCurrent || isSelected) {
    ctx.save();
    ctx.scale(1, 1); // ensure no flip for ring
    ctx.shadowBlur = isCurrent ? 18 : 10;
    ctx.shadowColor = C;
    ctx.strokeStyle = isCurrent ? 'rgba(255,255,255,0.9)' : `${C}cc`;
    ctx.lineWidth = isCurrent ? 2.5 : 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.arc(0, -5, 24, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Hit overlay
  if (hitT >= 0 && hitT < 0.55) {
    ctx.fillStyle = `rgba(255,50,50,${0.65 * (1 - hitT / 0.55)})`;
    ctx.beginPath(); ctx.roundRect(-13, -32, 26, 56, 4); ctx.fill();
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
export default function BattleScreen({ battleState, onBattleUpdate, onVictory, onDefeat, isLocalPvp = false, onBattleEnd }: Props) {
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
  // Lapse Blue: после выбора цели — ждём куда кинуть
  const [lapseBlueTargetId, setLapseBlueTargetId] = useState<string | null>(null);
  // R-combo: после атаки Годжо — предложить Infinity Step
  const [rComboState, setRComboState] = useState<{ afterState: BattleState; targetId: string } | null>(null);
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

  const getUnitAfterUpdate = (state: BattleState, id: string) =>
    state.units.find(u => u.data.id === id);

  const curUnit = getCurrentUnit(battleState);
  // В localPvP оба юнита — player, поэтому всегда isPlayerTurn
  const isPlayerTurn = curUnit.kind === 'player' && !processing;
  const curPlayer = curUnit.kind === 'player' ? curUnit.data : null;
  const hasCursedEnergy = !!(curPlayer && curPlayer.maxCursedEnergy > 0);
  // Имя текущего игрока в localPvP
  const localPvpPlayerLabel = isLocalPvp ? `Игрок ${curUnit.teamId + 1}` : null;

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
            // Determine facing: find nearest enemy and face them
            const enemies = state.units.filter(u => u.teamId !== unit.teamId && !u.data.isUnconscious);
            let facingDir = unit.teamId === 0 ? 1 : -1;
            if (enemies.length > 0) {
              const nearest = enemies.reduce((b, e) =>
                Math.abs(e.data.gridX - unit.data.gridX) < Math.abs(b.data.gridX - unit.data.gridX) ? e : b
              , enemies[0]);
              facingDir = nearest.data.gridX >= unit.data.gridX ? 1 : -1;
            }
            drawUnit(
              ctx, unit, vp.x, vp.y,
              getCurrentUnit(state).data.id === unit.data.id,
              state.selectedUnitId === unit.data.id,
              state.unitsOnTree.has(unit.data.id),
              flashAnimsRef.current,
              now,
              facingDir,
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
            } else if (fx.kind === 'red_ball') {
              // Travelling red orb from attacker to target
              const fromX2 = fx.fromX ?? fx.x;
              const fromY2 = fx.fromY ?? fx.y;
              const ballX = fromX2 + (fx.x - fromX2) * t;
              const ballY = fromY2 + (fx.y - fromY2) * t;
              // Glow trail
              const trailGrad = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, 22);
              trailGrad.addColorStop(0, `rgba(255,80,60,${alpha})`);
              trailGrad.addColorStop(0.5, `rgba(220,30,10,${alpha * 0.5})`);
              trailGrad.addColorStop(1, 'rgba(180,0,0,0)');
              ctx.fillStyle = trailGrad;
              ctx.beginPath(); ctx.arc(ballX, ballY, 22, 0, Math.PI * 2); ctx.fill();
              // Core ball
              ctx.shadowBlur = 20; ctx.shadowColor = '#ff4444';
              ctx.fillStyle = `rgba(255,120,80,${alpha})`;
              ctx.beginPath(); ctx.arc(ballX, ballY, 8, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = `rgba(255,220,200,${alpha * 0.9})`;
              ctx.beginPath(); ctx.arc(ballX - 2, ballY - 2, 3, 0, Math.PI * 2); ctx.fill();
              ctx.shadowBlur = 0;
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

  // End check — автоматически вызываем только для победы в story-mode
  // Для defeat (PvP бот) — ждём нажатия кнопки "Завершить битву"
  useEffect(() => {
    if (battleState.phase === 'victory' && !isLocalPvp && !onBattleEnd) {
      onVictory(battleState); return;
    }
    if (battleState.phase === 'defeat' && isLocalPvp) {
      onVictory(battleState); return;
    }
    // В режиме с onBattleEnd (Simply Fight) — не вызываем автоматически
  }, [battleState.phase]);

  // ── Helper: trigger flash ───────────────────────────────────────────────────
  const flash = (unitId: string, kind: FlashAnim['kind'], durationMs = 400) => {
    flashAnimsRef.current = [
      ...flashAnimsRef.current.filter(f => !(f.unitId === unitId && f.kind === kind)),
      { unitId, kind, startMs: performance.now(), durationMs },
    ];
  };

  // ── Helper: add skill FX on canvas ──────────────────────────────────────────
  const addSkillFx = (kind: SkillFx['kind'], gridX: number, gridY: number, durationMs = 700, fromGridX?: number, fromGridY?: number) => {
    const id = String(Math.random());
    const x = gridX * CELL_PX + CELL_PX / 2;
    const y = gridY * CELL_PX + CELL_PX / 2;
    const fromX = fromGridX !== undefined ? fromGridX * CELL_PX + CELL_PX / 2 : undefined;
    const fromY = fromGridY !== undefined ? fromGridY * CELL_PX + CELL_PX / 2 : undefined;
    skillFxRef.current = [...skillFxRef.current, { id, kind, x, y, startMs: performance.now(), durationMs, fromX, fromY }];
  };

  // ── Enemy AI: пошаговый — сначала движение, потом атака с задержкой ──────────
  useEffect(() => {
    if (isLocalPvp || curUnit.kind !== 'enemy' || processing || battleState.phase !== 'active') return;
    setProcessing(true);

    // Шаг 1: движение (с задержкой для видимости)
    const t1 = setTimeout(() => {
      const afterMove = runEnemyMove(battleState);
      // Показываем анимацию движения
      flash(curUnit.data.id, 'attack', 150);
      onBattleUpdate(afterMove);

      // Шаг 2: атака с задержкой 700мс (чтобы анимация движения успела сыграть)
      const t2 = setTimeout(() => {
        const prevHps = new Map(afterMove.units.map(u => [u.data.id, u.data.hp]));
        const afterAttack = runEnemyAttack(afterMove);

        // Проверяем Manji Kick реакцию у любого юнита противоположной команды
        const enemyUnitAfter = afterAttack.units.find(u => u.data.id === curUnit.data.id);
        const attackedUnit = afterAttack.units.find(u => {
          const prev = prevHps.get(u.data.id);
          return u.teamId !== curUnit.teamId && prev !== undefined && u.data.hp < prev;
        });

        if (attackedUnit && enemyUnitAfter) {
          const distCells = Math.max(
            Math.abs(enemyUnitAfter.data.gridX - attackedUnit.data.gridX),
            Math.abs(enemyUnitAfter.data.gridY - attackedUnit.data.gridY)
          );
          if (distCells <= 1 && attackedUnit.kind === 'player') {
            const playerChar = attackedUnit.data;
            const manjiKick = playerChar.unlockedSkills?.find(
              s => s.id === 'manji_kick' && s.currentCooldown === 0
            );
            if (manjiKick && playerChar.hasReaction) {
              flash(curUnit.data.id, 'attack', 300);
              addSkillFx('blink', enemyUnitAfter.data.gridX, enemyUnitAfter.data.gridY, 400);
              setPendingReaction({
                attackerId: enemyUnitAfter.data.id,
                skillId: manjiKick.id,
                stateWithDamage: afterAttack,
                playerHpBefore: prevHps.get(attackedUnit.data.id) ?? attackedUnit.data.hp,
                playerId: attackedUnit.data.id,
              });
              setProcessing(false);
              return;
            }
          }
        }

        flash(curUnit.data.id, 'attack', 320);
        afterAttack.units.forEach(u => {
          const prev = prevHps.get(u.data.id);
          if (prev !== undefined && u.data.hp < prev) {
            setTimeout(() => flash(u.data.id, 'hit', 450), 200);
          }
        });

        // Шаг 3: завершаем ход после 600мс (анимация атаки успевает сыграть)
        const t3 = setTimeout(() => {
          const finalState = endTurn(afterAttack);
          onBattleUpdate(finalState);
          setProcessing(false);
        }, 600);
        return () => clearTimeout(t3);
      }, 700);
      return () => clearTimeout(t2);
    }, 500);
    return () => clearTimeout(t1);
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
      // Прыжок: клик на любую клетку в радиусе 15ft (3 клетки евклид)
      const cell = battleState.grid[cy]?.[cx];
      const dist = Math.sqrt((cx - curUnit.data.gridX)**2 + (cy - curUnit.data.gridY)**2);
      const jumpCells = (curUnit.data.speed / 2) / 5; // 3 клетки (15ft / 5ft)
      if (dist <= jumpCells + 0.5 || (cell?.prop === 'tree' && (cell.treeHp ?? TREE_HP) > 0)) {
        onBattleUpdate(doJump(battleState, curId, cx, cy));
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

      // ── Infinity Step: телепортация только в пределах targetableCells ──
      if (sk.id === 'gojo_blink') {
        const inRange = battleState.targetableCells.some(c => c.x === cx && c.y === cy);
        if (!inRange) return; // цель за радиусом — игнорируем клик
        const anyUnit = battleState.units.find(u => u.data.gridX === cx && u.data.gridY === cy && !u.data.isUnconscious && u.data.id !== curId);
        if (anyUnit) {
          addSkillFx('blink', curUnit.data.gridX, curUnit.data.gridY, 500);
          addSkillFx('blink', cx, cy, 500);
          const next2 = doInfinityStep(battleState, curId, anyUnit.data.id);
          onBattleUpdate({ ...next2, selectedSkill: null, targetableCells: [], movementMode: false });
        }
        return;
      }

      // ── Reversal Red: клик по любой клетке в зоне атаки (AOE по местности) ──
      if (sk.id === 'reversal_red') {
        const inRange = battleState.targetableCells.some(c => c.x === cx && c.y === cy);
        if (!inRange) return;
        flash(curId, 'attack', 350);
        // Сначала летит красный шарик, потом взрыв
        const travelDist = Math.sqrt((cx - curUnit.data.gridX)**2 + (cy - curUnit.data.gridY)**2);
        const travelMs = Math.max(250, travelDist * 60);
        addSkillFx('red_ball', cx, cy, travelMs, curUnit.data.gridX, curUnit.data.gridY);
        setTimeout(() => addSkillFx('red_explosion', cx, cy, 900), travelMs - 50);
        const prevHps = new Map(battleState.units.map(u => [u.data.id, u.data.hp]));
        const next = executeReversalRed(battleState, curId, cx, cy);
        const newLogs = next.log.slice(battleState.log.length);
        const diceLog = newLogs.find(l => l.diceResult);
        if (diceLog?.diceResult) showDice(diceLog.diceResult.total, diceLog.diceResult.die, diceLog.diceResult.die);
        next.units.forEach(u => {
          const p = prevHps.get(u.data.id);
          if (p !== undefined && u.data.hp < p) setTimeout(() => flash(u.data.id, 'hit', 450), travelMs + 200);
        });
        onBattleUpdate({ ...next, selectedSkill: null, targetableCells: [], movementMode: false });
        return;
      }

      // ── Lapse Blue, этап 2: выбираем куда бросить ──
      if (sk.id === 'lapse_blue' && lapseBlueTargetId) {
        // Click anywhere to choose throw destination
        flash(curId, 'attack', 350);
        addSkillFx('blue_wave', curUnit.data.gridX, curUnit.data.gridY, 900);
        const tgtUnit = battleState.units.find(u => u.data.id === lapseBlueTargetId);
        if (tgtUnit) {
          setTimeout(() => addSkillFx('blue_wave', tgtUnit.data.gridX, tgtUnit.data.gridY, 600), 250);
        }
        const prevHps = new Map(battleState.units.map(u => [u.data.id, u.data.hp]));
        const next = executeAttack(battleState, curId, sk, lapseBlueTargetId, isLocalPvp, cx, cy);
        const newLogs = next.log.slice(battleState.log.length);
        const diceLog = newLogs.find(l => l.diceResult);
        if (diceLog?.diceResult) showDice(diceLog.diceResult.total, diceLog.diceResult.die, diceLog.diceResult.die);
        next.units.forEach(u => {
          const p = prevHps.get(u.data.id);
          if (p !== undefined && u.data.hp < p) setTimeout(() => flash(u.data.id, 'hit', 450), 400);
        });
        setLapseBlueTargetId(null);
        onBattleUpdate({ ...next, selectedSkill: null, targetableCells: [], movementMode: false });
        return;
      }

      // ── Обычные атаки: клик по вражескому юниту ──
      const tgt = battleState.units.find(u => u.data.gridX === cx && u.data.gridY === cy && !u.data.isUnconscious);
      if (tgt && tgt.teamId !== curUnit.teamId) {
        if (battleState.targetableCells.some(c => c.x === cx && c.y === cy)) {
          // Unarmed attack
          if (sk.id === 'unarmed') {
            flash(curId, 'attack', 300);
            setTimeout(() => flash(tgt.data.id, 'hit', 350), 250);
            onBattleUpdate({ ...doUnarmedAttack(battleState, curId, tgt.data.id), selectedSkill: null, targetableCells: [] });
            return;
          }

          // Lapse Blue этап 1: выбор цели → потом ждём клик куда бросить
          if (sk.id === 'lapse_blue') {
            setLapseBlueTargetId(tgt.data.id);
            // Покрасим доступные клетки для броска
            onBattleUpdate({
              ...battleState,
              targetableCells: [],
              reachableCells: [],
            });
            return;
          }

          flash(curId, 'attack', 350);
          const prevHps = new Map(battleState.units.map(u => [u.data.id, u.data.hp]));
          const next = executeAttack(battleState, curId, sk, tgt.data.id, isLocalPvp);
          const newLogs = next.log.slice(battleState.log.length);
          const diceLog = newLogs.find(l => l.diceResult);
          if (diceLog?.diceResult) showDice(diceLog.diceResult.total, diceLog.diceResult.die, diceLog.diceResult.die);
          next.units.forEach(u => {
            const p = prevHps.get(u.data.id);
            if (p !== undefined && u.data.hp < p) setTimeout(() => flash(u.data.id, 'hit', 450), 300);
          });

          // R-combo: после атаки Годжо (не lapse_blue, не reversal_red) — предложить Infinity Step
          const isGojoAttack = sk.id === 'gojo_rapid_punches' || sk.id === 'gojo_twofold_kick';
          const gojoUnit = getUnitAfterUpdate(next, curId);
          if (isGojoAttack && gojoUnit?.data.hasBonusAction) {
            setRComboState({ afterState: next, targetId: tgt.data.id });
            onBattleUpdate({ ...next, selectedSkill: null, targetableCells: [], movementMode: false });
          } else {
            onBattleUpdate({ ...next, selectedSkill: null, targetableCells: [], movementMode: false });
          }
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
              <span className="text-yellow-600 font-mono text-xs">({u.turnIndex})</span>
              <span className="text-gray-600 font-mono text-xs">{u.data.hp}HP</span>
            </div>
          ))}
        </div>
        <div className="ml-auto flex gap-2 items-center">
          <span className="text-purple-600 text-xs font-mono">Р.{battleState.round}</span>
          <div className={`px-2 py-0.5 rounded text-xs font-black border`}
            style={{
              borderColor: isLocalPvp ? `${curUnit.data.color}60` : isPlayerTurn ? '#3b82f680' : '#ef444440',
              backgroundColor: isLocalPvp ? `${curUnit.data.color}15` : isPlayerTurn ? '#2563eb10' : '#ef444410',
              color: isLocalPvp ? curUnit.data.color : isPlayerTurn ? '#93c5fd' : '#fca5a5',
            }}>
            {isLocalPvp
              ? `▶ ${localPvpPlayerLabel}: ${curUnit.data.name}`
              : isPlayerTurn ? '▶ ВАШ ХОД' : processing ? '⏳' : '⚔ ВРАГ'}
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
              {/* Cursed Energy cells (Gojo only) */}
              {curPlayer.maxCursedEnergy > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-mono mb-1" style={{ color: curPlayer.id === 'gambler' ? '#4ade80' : '#06b6d4' }}>
                    {curPlayer.id === 'gambler' ? '🎰 Ставки' : '⚡ Ячейки'}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: curPlayer.maxCursedEnergy }).map((_, i) => {
                      const active = i < curPlayer.cursedEnergy;
                      const isGambler = curPlayer.id === 'gambler';
                      return (
                        <div key={i}
                          className="flex items-center justify-center font-black text-xs"
                          style={{
                            width: 22, height: 22,
                            border: `2px solid ${active ? (isGambler ? '#22c55e' : '#06b6d4') : (isGambler ? '#14532d' : '#1e3a3a')}`,
                            borderRadius: isGambler ? 4 : '50%',
                            backgroundColor: active ? (isGambler ? '#22c55e20' : '#06b6d420') : 'transparent',
                            color: active ? (isGambler ? '#4ade80' : '#67e8f9') : '#333',
                            textShadow: active ? `0 0 8px ${isGambler ? '#22c55e' : '#06b6d4'}` : 'none',
                            transform: isGambler ? 'skewX(-5deg)' : 'none',
                          }}>
                          {isGambler ? '7' : (active ? '●' : '○')}
                        </div>
                      );
                    })}
                    <span className="text-xs font-mono ml-1 self-center" style={{ color: curPlayer.id === 'gambler' ? '#4ade80' : '#06b6d4' }}>
                      {curPlayer.cursedEnergy}/{curPlayer.maxCursedEnergy}
                    </span>
                  </div>
                </div>
              )}
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

          {/* Lapse Blue: выбор куда бросить */}
          {lapseBlueTargetId && (
            <div className="p-3 border-b border-cyan-700/50 bg-cyan-900/20">
              <div className="text-cyan-300 font-black text-sm mb-1">🔵 LAPSE BLUE</div>
              <div className="text-gray-300 text-xs mb-1">Цель притянута! Выбери клетку куда отбросить врага.</div>
              <div className="text-xs text-cyan-400 mb-2">Кликни на любую клетку карты</div>
              <button onClick={() => setLapseBlueTargetId(null)}
                className="w-full py-1.5 rounded text-xs font-bold text-gray-400 border border-white/15 hover:bg-white/5">
                Отмена
              </button>
            </div>
          )}

          {/* R-combo: Infinity Step после атаки */}
          {rComboState && (
            <div className="p-3 border-b border-purple-700/50 bg-purple-900/20">
              <div className="text-purple-300 font-black text-sm mb-1">⚡ +R COMBO</div>
              <div className="text-gray-300 text-xs mb-1">Добавить Infinity Step за бонусное действие?</div>
              <div className="text-xs text-yellow-400 mb-2">Ещё бросок на попадание → 1к2 урона</div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!rComboState) return;
                    const { afterState, targetId } = rComboState;
                    const blinkSk = (curUnit.kind === 'player' ? curUnit.data.unlockedSkills : []).find(s => s.id === 'gojo_blink');
                    if (!blinkSk) { setRComboState(null); return; }
                    // Use Infinity Step as bonus action with extra damage
                    const next = executeAttack(afterState, curUnit.data.id, blinkSk, targetId, isLocalPvp);
                    flash(curUnit.data.id, 'attack', 300);
                    addSkillFx('blink', curUnit.data.gridX, curUnit.data.gridY, 500);
                    setRComboState(null);
                    onBattleUpdate({ ...next, selectedSkill: null, targetableCells: [] });
                  }}
                  className="flex-1 py-2 rounded font-black text-xs text-white bg-purple-700 border border-purple-500 hover:bg-purple-600">
                  ⚡ Да!
                </button>
                <button
                  onClick={() => { onBattleUpdate({ ...rComboState.afterState, selectedSkill: null, targetableCells: [] }); setRComboState(null); }}
                  className="flex-1 py-2 rounded font-bold text-xs text-gray-400 border border-white/15 hover:bg-white/5">
                  Пропустить
                </button>
              </div>
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
                      <span className="text-red-400">{sk.damageDice.count}к{sk.damageDice.die.slice(1)}</span> · уклонение + контратака
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">{sk.description}</div>
                    <div className={`text-xs mt-1 font-bold ${curPlayer.hasReaction ? 'text-green-400' : 'text-gray-600'}`}>
                      {curPlayer.hasReaction ? '✅ Готова (ждёт ближней атаки)' : '❌ Реакция использована'}
                    </div>
                  </div>
                );
              }

              const active = battleState.selectedSkill?.id === sk.id;
              const onCd = sk.currentCooldown > 0;
              const noAct = (sk.actionCost === 'action' && !curPlayer.hasAction)
                || (sk.actionCost === 'bonus_action' && !curPlayer.hasBonusAction);
              const noEnergy = sk.energyCost > 0 && curPlayer.cursedEnergy < sk.energyCost;
              const dis = !isPlayerTurn || onCd || noAct || noEnergy || curPlayer.isUnconscious;

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

            {/* Probability Shift (Хакари) */}
            {curPlayer?.id === 'gambler' && (
              <div className="mt-2 p-2 rounded-xl border border-green-700/40 bg-green-900/10">
                <div className="text-green-400 text-xs font-black mb-1">🎰 Изменение вероятностей</div>
                <div className="text-gray-500 text-xs mb-1.5">Бонусное действие (бесплатно)</div>
                <div className="grid grid-cols-3 gap-1">
                  {([['ac','к20→КБ','#3b82f6'],['hp','к2 HP','#22c55e'],['attack','к2 Атк','#a855f7']] as [string,string,string][]).map(([c,l,col]) => (
                    <button key={c}
                      disabled={!isPlayerTurn || !curPlayer.hasBonusAction}
                      onClick={() => onBattleUpdate(doProbabilityShift(battleState, curPlayer.id, c as 'ac'|'hp'|'attack'))}
                      className="py-1 rounded text-xs font-black border disabled:opacity-30 transition-all hover:opacity-90"
                      style={{ borderColor: col, color: col, backgroundColor: col + '18' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Безоружный удар */}
            {curPlayer && (
              <button
                disabled={!isPlayerTurn || !curPlayer.hasAction}
                onClick={() => {
                  // Выбираем ближайшего врага в 5ft
                  const targets = battleState.units.filter(u =>
                    u.teamId !== curUnit.teamId && !u.data.isUnconscious &&
                    Math.max(Math.abs(u.data.gridX - curPlayer.gridX), Math.abs(u.data.gridY - curPlayer.gridY)) <= 1
                  );
                  if (targets.length === 1) {
                    flash(curUnit.data.id, 'attack', 300);
                    setTimeout(() => flash(targets[0].data.id, 'hit', 350), 250);
                    onBattleUpdate(doUnarmedAttack(battleState, curPlayer.id, targets[0].data.id));
                  } else {
                    // Включить режим выбора цели
                    onBattleUpdate({
                      ...battleState,
                      selectedSkill: { id: 'unarmed', name: 'Безоружный удар', description: '', damageDice: { count: 1, die: 'd2', modifier: 0 }, range: 5, actionCost: 'action', energyCost: 0, element: 'physical', requiresLevel: 1, cooldownRounds: 0, currentCooldown: 0 },
                      targetableCells: battleState.units.filter(u => u.teamId !== curUnit.teamId && !u.data.isUnconscious && Math.max(Math.abs(u.data.gridX - curPlayer.gridX), Math.abs(u.data.gridY - curPlayer.gridY)) <= 1).map(u => ({ x: u.data.gridX, y: u.data.gridY })),
                    });
                  }
                }}
                className="w-full py-1 rounded-lg border text-xs font-bold transition-all disabled:opacity-22"
                style={{ borderColor: '#ffffff15', color: '#9ca3af', backgroundColor: '#ffffff04' }}>
                👊 Безоружный удар
              </button>
            )}

            {/* Base actions */}
            <div className="text-purple-600 text-xs font-mono tracking-widest uppercase mt-2 mb-1">— Действия —</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { label:'Движение', icon:'👟', active: battleState.movementMode && !jumpMode, disabled: !isPlayerTurn || (curPlayer?.movementLeft ?? 0) <= 0, action: () => { setJumpMode(false); onBattleUpdate(toggleMovement(battleState, curUnit.data.id)); } },
                { label:'Прыжок', icon:'⬆', active: jumpMode, disabled: !isPlayerTurn || !curPlayer?.hasBonusAction, action: () => { setJumpMode(!jumpMode); onBattleUpdate({ ...battleState, movementMode: !jumpMode, selectedSkill: null }); } },
                { label:'Рывок', icon:'💨', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction, action: () => onBattleUpdate(doDash(battleState, curUnit.data.id)) },
                { label:'Отход', icon:'🚶', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction, action: () => onBattleUpdate(doDisengage(battleState, curUnit.data.id)) },
                { label:'Кола', icon:'🥤', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction, action: () => onBattleUpdate(doCallCola(battleState, curUnit.data.id)) },
                { label:'Отдышка', icon:'🌀', active: false, disabled: !isPlayerTurn || !curPlayer?.hasAction || !hasCursedEnergy || (curPlayer?.cursedEnergy ?? 0) >= (curPlayer?.maxCursedEnergy ?? 0), action: () => onBattleUpdate(doCatchBreath(battleState, curUnit.data.id)), hint: !hasCursedEnergy ? 'Нет ячеек' : undefined },
              ].map(b => (
                <button key={b.label} onClick={b.action} disabled={b.disabled} title={(b as {hint?:string}).hint}
                  className="py-1.5 px-1.5 rounded-lg border text-xs font-bold transition-all disabled:opacity-22 disabled:cursor-not-allowed"
                  style={{ borderColor: b.active ? '#3b82f6' : '#ffffff10', backgroundColor: b.active ? '#3b82f618' : '#ffffff03', color: b.active ? '#60a5fa' : '#9ca3af' }}>
                  {b.icon} {b.label}
                </button>
              ))}
            </div>
            {battleState.phase === 'defeat' ? (
              <button onClick={() => onBattleEnd ? onBattleEnd() : onDefeat()}
                className="w-full py-2 mt-1 rounded-xl text-sm font-black tracking-widest uppercase border border-red-700/60 text-red-400 bg-red-900/20 hover:bg-red-900/30 transition-all animate-pulse">
                ☠ Завершить битву
              </button>
            ) : battleState.phase === 'victory' ? (
              <button onClick={() => onVictory(battleState)}
                className="w-full py-2 mt-1 rounded-xl text-sm font-black tracking-widest uppercase border border-yellow-600/60 text-yellow-400 bg-yellow-900/20 hover:bg-yellow-900/30 transition-all animate-pulse">
                🏆 Завершить битву
              </button>
            ) : (
              <button onClick={handleEndTurn} disabled={!isPlayerTurn}
                className="w-full py-1.5 mt-1 rounded-xl text-xs font-black tracking-widest uppercase border border-purple-700/25 text-purple-500 hover:bg-purple-900/12 disabled:opacity-22 transition-all">
                ⏭ Завершить ход
              </button>
            )}
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
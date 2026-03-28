export type GameScreen = 'mainMenu' | 'characterSelect' | 'worldMap' | 'battle' | 'pvp' | 'inventory' | 'quests';
export type GameMode = 'story' | 'pvp' | 'skirmish';

export type CharacterClass =
  | 'vessel' | 'honored_one' | 'gambler' | 'ten_shadows'
  | 'perfection' | 'blood_manipulator' | 'switcher' | 'defense_attorney'
  | 'cursed_partners' | 'puppet_master' | 'head_of_hei' | 'salaryman'
  | 'locust' | 'star_rage';

export type ElementType = 'cursed' | 'divine' | 'blood' | 'shadow' | 'domain' | 'physical' | 'void';
export type ActionType = 'action' | 'bonus_action' | 'reaction' | 'free';
export type DiceType = 'd2' | 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

export interface DiceRoll {
  count: number;
  die: DiceType;
  modifier: number;
}

// ─── SKILL ────────────────────────────────────────────────────────────────
export interface Skill {
  id: string;
  name: string;
  description: string;
  damageDice: DiceRoll;
  range: number; // feet, 5 = melee
  actionCost: ActionType;
  energyCost: number;        // cursed energy / resource cost
  element: ElementType;
  requiresLevel: number;
  isUltimate?: boolean;
  isHeal?: boolean;
  aoe?: boolean;
  aoeRadius?: number;
  /** If true: no attack roll needed, damage always lands */
  is100pct?: boolean;
  /** If set: triggers on 18-20 attack roll */
  blackFlash?: { damageDice: DiceRoll };
  /** Cooldown in rounds (0 = no cooldown) */
  cooldownRounds: number;
  currentCooldown: number;
  savingThrow?: { stat: keyof AbilityScores; dc: number };
  statusEffect?: StatusEffect;
  /** For reactions: triggered by what */
  reactionTrigger?: 'melee_attack_received' | 'any_attack_received' | 'ally_attacked';
  isReady?: boolean; // for reaction tracking
}

// ─── STATUS EFFECTS ────────────────────────────────────────────────────────
export interface StatusEffect {
  type: 'stun' | 'bleed' | 'curse' | 'weakened' | 'empowered' | 'grappled'
      | 'frightened' | 'blessed' | 'sanctuary' | 'no_movement' | 'resistance_all'
      | 'vulnerability_all' | 'disadvantage_atk' | 'advantage_atk';
  duration: number; // rounds remaining
  value: number;    // damage per round for DoT, or modifier value
  source?: string;
}

// ─── ABILITY SCORES ────────────────────────────────────────────────────────
export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

// ─── HIT DICE ──────────────────────────────────────────────────────────────
export interface HitDice {
  die: DiceType;
  total: number;
  used: number;
}

// ─── COMBATANT (shared between Character and Enemy) ─────────────────────────
export interface Combatant {
  id: string;
  name: string;
  color: string;
  glowColor: string;

  hp: number;
  maxHp: number;
  tempHp: number;
  armorClass: number;
  speed: number;          // feet per turn
  initiative: number;
  proficiencyBonus: number;

  abilityScores: AbilityScores;
  statusEffects: StatusEffect[];

  gridX: number;
  gridY: number;

  // Which actions remain this turn
  hasAction: boolean;
  hasBonusAction: boolean;
  hasReaction: boolean;
  movementLeft: number;

  deathSaves: { successes: number; failures: number };
  isUnconscious: boolean;
  isDead: boolean;
  /** currently on top of a tree */
  onTree: boolean;
}

// ─── CHARACTER ─────────────────────────────────────────────────────────────
export interface Character extends Combatant {
  class: CharacterClass;
  title: string;
  description: string;
  lore: string;
  passiveBonus: string;

  hitDice: HitDice;
  cursedEnergy: number;
  maxCursedEnergy: number;

  level: number;
  exp: number;
  expToNext: number;

  allSkills: Skill[];
  unlockedSkills: Skill[];

  // visual
  spriteColor: string; // for canvas rendering
}

// ─── ENEMY / NPC ──────────────────────────────────────────────────────────
export interface Enemy extends Combatant {
  challengeRating: number;
  skills: Skill[];
  exp: number;
  loot: Item[];
  isBoss?: boolean;
  description: string;
  aiType: 'aggressive' | 'defensive' | 'ranged' | 'support';
}

// ─── BATTLE UNIT (player or enemy in a fight) ───────────────────────────────
export type BattleUnit = ({ kind: 'player'; data: Character } | { kind: 'enemy'; data: Enemy }) & {
  teamId: 0 | 1; // team 0 = player side, team 1 = enemy side
  turnIndex: number;
};

// ─── GRID ──────────────────────────────────────────────────────────────────
export const GRID_COLS = 24;
export const GRID_ROWS = 16;
export const CELL_PX   = 52;  // pixels per cell in render
export const CELL_FT   = 5;   // feet per cell

export type TerrainType = 'open' | 'difficult' | 'blocked' | 'hazard' | 'cover';

export interface GridCell {
  x: number;
  y: number;
  terrain: TerrainType;
  /** 'tree' | 'rock' | undefined */
  prop?: 'tree' | 'rock';
  /** ground variant: 0-3 for tile variety */
  tileVariant: number;
  /** tree health: 0 = destroyed, undefined = no tree */
  treeHp?: number;
}

// ─── ACTION TYPES ──────────────────────────────────────────────────────────
export type BattleActionKind =
  | 'move'
  | 'attack'           // use a skill
  | 'dash'             // Рывок: double movement
  | 'disengage'        // Отход: move without provoking
  | 'dodge'            // defensive stance
  | 'push'             // Толкнуть: bonus action
  | 'jump'             // Прыжок: bonus action, half movement
  | 'call_cola'        // Призыв Колы
  | 'catch_breath'     // Отдышка
  | 'death_save'       // Спасбросок от смерти
  | 'end_turn'
  | 'reaction';

// ─── BATTLE LOG ────────────────────────────────────────────────────────────
export interface BattleLog {
  id: string;
  text: string;
  type: 'info' | 'hit' | 'miss' | 'critical' | 'heal' | 'death' | 'system' | 'save' | 'special';
  diceResult?: { rolls: number[]; total: number; mod: number; die: DiceType };
}

// ─── ANIMATION QUEUE ───────────────────────────────────────────────────────
export type AnimType = 'move' | 'attack' | 'hit' | 'miss' | 'death' | 'heal' | 'flash' | 'reaction';

export interface AnimEvent {
  id: string;
  type: AnimType;
  unitId: string;
  fromX?: number; fromY?: number;
  toX?: number;   toY?: number;
  duration: number; // ms
  startTime: number;
  skillName?: string;
  isCrit?: boolean;
}

// ─── BATTLE STATE ──────────────────────────────────────────────────────────
export interface BattleState {
  units: BattleUnit[];           // all combatants in order of initiative
  currentUnitIndex: number;      // whose turn it is
  round: number;
  grid: GridCell[][];
  log: BattleLog[];
  animQueue: AnimEvent[];
  phase: 'setup' | 'active' | 'victory' | 'defeat';
  winTeam?: 0 | 1;

  // UI selection state
  selectedUnitId: string | null;
  selectedSkill: Skill | null;
  movementMode: boolean;
  reachableCells: { x: number; y: number }[];
  targetableCells: { x: number; y: number }[];

  disengage: Set<string>; // unit IDs that used Disengage this turn
  /** unit IDs currently ON TOP of a tree (jumped up) */
  unitsOnTree: Set<string>;
  pendingReaction?: {
    unitId: string;
    skill: Skill;
    targetId: string;
  };
}

// ─── ITEMS ─────────────────────────────────────────────────────────────────
export interface Item {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'armor' | 'consumable' | 'cursed_object' | 'scroll';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  stats?: { ac?: number; hp?: number; speed?: number };
  quantity?: number;
  usable?: boolean;
  effect?: string;
}

// ─── QUESTS / WORLD ────────────────────────────────────────────────────────
export interface Quest {
  id: string;
  title: string;
  description: string;
  objective: string;
  progress: number;
  required: number;
  reward: { exp: number; items: Item[]; gold: number };
  completed: boolean;
  active: boolean;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  type: 'kill' | 'collect' | 'explore' | 'reach';
}

export interface WorldNode {
  id: string;
  name: string;
  description: string;
  x: number; y: number; // % of map
  biome: 'forest' | 'urban' | 'dungeon' | 'void' | 'palace' | 'school';
  minLevel: number;
  enemyGroups: EnemyGroup[];
  connections: string[];
  unlocked: boolean;
  events?: WorldEvent[]; // random events, shops, etc.
}

export interface EnemyGroup {
  id: string;
  name: string;
  enemies: string[];   // enemy IDs
  repeatable: boolean;
  defeated: boolean;
}

export interface WorldEvent {
  id: string;
  type: 'shop' | 'rest' | 'story' | 'challenge';
  label: string;
  available: boolean;
}
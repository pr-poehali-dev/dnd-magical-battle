export type GameScreen = 'mainMenu' | 'characterSelect' | 'worldMap' | 'battle' | 'inventory' | 'quests' | 'levelUp';

export type CharacterClass =
  | 'vessel' | 'honored_one' | 'gambler' | 'ten_shadows'
  | 'perfection' | 'blood_manipulator' | 'switcher' | 'defense_attorney'
  | 'cursed_partners' | 'puppet_master' | 'head_of_hei' | 'salaryman'
  | 'locust' | 'star_rage' | 'six_eyes' | 'heavenly_restriction';

export type ElementType = 'cursed' | 'divine' | 'blood' | 'shadow' | 'domain' | 'physical' | 'void';

export type ActionType = 'action' | 'bonus_action' | 'reaction' | 'free';

// --- DnD dice ---
export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

export interface DiceRoll {
  count: number;
  die: DiceType;
  modifier: number;
}

// --- Skill (Technique) ---
export interface Skill {
  id: string;
  name: string;
  description: string;
  /** Dice damage e.g. {count:2, die:'d6', modifier:3} */
  damageDice: DiceRoll;
  /** Range in feet (5 = melee, 30/60 = ranged) */
  range: number;
  /** How many action points it costs */
  actionCost: ActionType;
  /** Spell slot / cursed energy cost (0 = free) */
  energyCost: number;
  element: ElementType;
  isUltimate?: boolean;
  requiresLevel: number;
  savingThrow?: { stat: 'str' | 'dex' | 'con' | 'wis'; dc: number };
  statusEffect?: StatusEffect;
  aoe?: boolean;
  aoeRadius?: number;
  /** Healing instead of damage */
  isHeal?: boolean;
  cooldownRounds: number;
  currentCooldown: number;
}

// --- Status effects ---
export interface StatusEffect {
  type: 'burn' | 'stun' | 'bleed' | 'curse' | 'blessed' | 'weakened' | 'empowered' | 'grappled' | 'frightened';
  duration: number;
  value: number;
  source?: string;
}

// --- DnD Ability Scores ---
export interface AbilityScores {
  str: number; // Strength
  dex: number; // Dexterity
  con: number; // Constitution
  int: number; // Intelligence
  wis: number; // Wisdom
  cha: number; // Charisma
}

// --- Hit Dice (DnD style) ---
export interface HitDice {
  die: DiceType;
  total: number;
  used: number;
}

// --- Character ---
export interface Character {
  id: string;
  class: CharacterClass;
  name: string;
  title: string;
  description: string;
  emoji: string;
  color: string;
  glowColor: string;

  // DnD HP system
  hp: number;
  maxHp: number;
  tempHp: number;
  hitDice: HitDice;
  deathSaves: { successes: number; failures: number };

  // Cursed Energy (replaces mana/spell slots)
  cursedEnergy: number;
  maxCursedEnergy: number;

  // DnD Ability Scores
  abilityScores: AbilityScores;

  // Combat stats (derived from abilities)
  armorClass: number;
  initiative: number;
  speed: number; // in feet

  // Proficiency bonus (based on level, DnD formula)
  proficiencyBonus: number;

  // Level & Progression (DnD-slow)
  level: number;
  exp: number;
  expToNext: number;

  // Skills (unlocked by level)
  allSkills: Skill[];       // all possible skills for this class
  unlockedSkills: Skill[];  // currently available

  passiveBonus: string;
  lore: string;
  comboPairs?: CharacterClass[];

  // Position on battle grid
  gridX: number;
  gridY: number;
}

// --- Enemy ---
export interface Enemy {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  maxHp: number;
  tempHp: number;
  armorClass: number;
  speed: number;
  attack: number;
  challengeRating: number; // CR instead of "level"
  skills: Skill[];
  exp: number;
  loot: Item[];
  isBoss?: boolean;
  description: string;
  gridX: number;
  gridY: number;
  abilityScores: AbilityScores;
}

// --- Items ---
export interface Item {
  id: string;
  name: string;
  description: string;
  emoji: string;
  type: 'weapon' | 'armor' | 'consumable' | 'cursed_object' | 'technique_scroll';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  stats?: { attack?: number; defense?: number; hp?: number; mana?: number; speed?: number };
  quantity?: number;
  usable?: boolean;
  effect?: string;
}

// --- Quest ---
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
  type: 'kill' | 'collect' | 'explore';
}

// --- Location ---
export interface Location {
  id: string;
  name: string;
  description: string;
  emoji: string;
  biome: 'urban' | 'forest' | 'dungeon' | 'prison' | 'void' | 'school' | 'ocean' | 'palace';
  x: number;
  y: number;
  minLevel: number;
  enemyIds: string[];
  bossId?: string;
  unlocked: boolean;
  cleared: boolean;
  connectedTo: string[];
}

// --- Battle Grid ---
export const GRID_COLS = 12;
export const GRID_ROWS = 8;
export const CELL_SIZE_FT = 5; // each cell = 5 feet
export const BASE_SPEED_FT = 30; // default movement per turn

export interface GridCell {
  x: number;
  y: number;
  terrain: 'open' | 'difficult' | 'blocked' | 'hazard';
  decoration?: string; // emoji
}

// --- Action Points ---
export interface TurnActions {
  hasAction: boolean;
  hasBonusAction: boolean;
  hasReaction: boolean;
  movementLeft: number; // feet remaining
}

// --- Battle Log ---
export interface BattleLog {
  id: string;
  text: string;
  type: 'player' | 'enemy' | 'system' | 'combo' | 'critical' | 'miss' | 'save';
  diceResult?: { rolls: number[]; total: number; die: DiceType };
}

// --- Battle State (DnD) ---
export interface BattleState {
  player: Character;
  enemy: Enemy;
  initiative: { order: ('player' | 'enemy')[]; currentIndex: number };
  turn: 'player' | 'enemy';
  round: number;
  log: BattleLog[];
  phase: 'initiative' | 'player_turn' | 'enemy_turn' | 'animation' | 'result';
  playerActions: TurnActions;
  enemyActions: TurnActions;
  grid: GridCell[][];
  playerStatusEffects: StatusEffect[];
  enemyStatusEffects: StatusEffect[];
  selectedSkill: Skill | null;
  movementMode: boolean;
  attackRollResult?: { roll: number; total: number; hit: boolean };
}

// --- Game State ---
export interface GameState {
  screen: GameScreen;
  selectedCharacter: Character | null;
  currentLocation: Location | null;
  gold: number;
  inventory: Item[];
  quests: Quest[];
  battleState: BattleState | null;
  defeatedEnemies: number;
  visitedLocations: string[];
}

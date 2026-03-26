export type GameScreen = 'mainMenu' | 'characterSelect' | 'worldMap' | 'battle' | 'inventory' | 'quests' | 'levelUp';

export type CharacterClass =
  | 'vessel' | 'honored_one' | 'gambler' | 'ten_shadows'
  | 'perfection' | 'blood_manipulator' | 'switcher' | 'defense_attorney'
  | 'cursed_partners' | 'puppet_master' | 'head_of_hei' | 'salaryman'
  | 'locust' | 'star_rage' | 'six_eyes' | 'heavenly_restriction';

export type ElementType = 'cursed' | 'divine' | 'blood' | 'shadow' | 'domain' | 'physical' | 'void';

export interface Skill {
  id: string;
  name: string;
  description: string;
  damage: number;
  manaCost: number;
  cooldown: number;
  currentCooldown: number;
  element: ElementType;
  isUltimate?: boolean;
  comboId?: string;
  statusEffect?: StatusEffect;
  aoe?: boolean;
}

export interface StatusEffect {
  type: 'burn' | 'stun' | 'bleed' | 'curse' | 'blessed' | 'weakened' | 'empowered';
  duration: number;
  value: number;
}

export interface Character {
  id: string;
  class: CharacterClass;
  name: string;
  title: string;
  description: string;
  emoji: string;
  color: string;
  glowColor: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  attack: number;
  defense: number;
  speed: number;
  level: number;
  exp: number;
  expToNext: number;
  skills: Skill[];
  passiveBonus: string;
  lore: string;
  comboPairs?: CharacterClass[];
}

export interface Enemy {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  skills: Skill[];
  exp: number;
  loot: Item[];
  isBoss?: boolean;
  description: string;
}

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

export interface Location {
  id: string;
  name: string;
  description: string;
  emoji: string;
  x: number;
  y: number;
  minLevel: number;
  enemies: Enemy[];
  boss?: Enemy;
  unlocked: boolean;
  cleared: boolean;
  connectedTo: string[];
}

export interface BattleLog {
  id: string;
  text: string;
  type: 'player' | 'enemy' | 'system' | 'combo' | 'critical';
}

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

export interface BattleState {
  player: Character;
  enemy: Enemy;
  turn: 'player' | 'enemy';
  round: number;
  log: BattleLog[];
  phase: 'select' | 'animation' | 'result';
  comboCount: number;
  lastSkillId: string | null;
  playerStatusEffects: StatusEffect[];
  enemyStatusEffects: StatusEffect[];
  isPlayerDefending: boolean;
}

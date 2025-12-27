// Player types
export interface Player {
  id: string;
  name: string;
  email: string;
  photoURL: string | null;
  team: Team | null;
  role: Role | null;
  isOnline: boolean;
  lastSeen: number;
}

export type Team = 'red' | 'blue';
export type Role = 'spymaster' | 'operative';
export type CardType = 'red' | 'blue' | 'neutral' | 'assassin';
export type GamePhase = 'clue' | 'guess';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

// Card type
export interface Card {
  id: number;
  word: string;
  type: CardType;
  revealed: boolean;
  revealedBy: string | null;
}

// Clue type
export interface Clue {
  word: string;
  number: number;
  guessesRemaining: number;
}

// Score tracking
export interface TeamScore {
  found: number;
  total: number;
}

// Game log entry
export interface GameLogEntry {
  timestamp: number;
  type: 'clue' | 'guess' | 'pass' | 'game_over';
  team: Team;
  playerId: string;
  playerName: string;
  data: {
    clueWord?: string;
    clueNumber?: number;
    guessedWord?: string;
    cardType?: CardType;
    winner?: Team;
    winReason?: 'all_found' | 'assassin';
  };
}

// Game state
export interface GameState {
  board: Card[];
  currentTurn: Team;
  startingTeam: Team;
  phase: GamePhase;
  currentClue: Clue | null;
  scores: {
    red: TeamScore;
    blue: TeamScore;
  };
  winner: Team | null;
  winReason: 'all_found' | 'assassin' | null;
  log: GameLogEntry[];
}

// Team structure in room
export interface TeamData {
  spymaster: string | null;
  operatives: string[];
}

// Room type
export interface Room {
  roomCode: string;
  createdAt: number;
  createdBy: string;
  status: RoomStatus;
  teams: {
    red: TeamData;
    blue: TeamData;
  };
  players: Record<string, Player>;
  game: GameState | null;
}

// Auth user type
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../utils/cn';
import { generateBoard, getRandomStartingTeam } from '../utils/generateBoard';
import type { Room, Card, GameState, GameLogEntry } from '../types';

export function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clueWord, setClueWord] = useState('');
  const [clueNumber, setClueNumber] = useState(1);
  const [showGameOver, setShowGameOver] = useState(false);

  useEffect(() => {
    if (!roomCode || !user) return;

    const roomRef = ref(db, `rooms/${roomCode}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const roomData = snapshot.val() as Room;
        setRoom(roomData);

        // Show game over modal when winner is set
        if (roomData.game?.winner && !showGameOver) {
          setShowGameOver(true);
        }
      } else {
        navigate('/');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [roomCode, user, navigate, showGameOver]);

  if (isLoading || !room || !room.game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-team" />
      </div>
    );
  }

  const { game } = room;
  const currentPlayer = room.players[user?.uid || ''];
  const isSpymaster = currentPlayer?.role === 'spymaster';
  const myTeam = currentPlayer?.team;
  const isMyTurn = game.currentTurn === myTeam;
  const isCluePhase = game.phase === 'clue';
  const isGuessPhase = game.phase === 'guess';
  const canGiveClue = isSpymaster && isMyTurn && isCluePhase;
  const canGuess = !isSpymaster && isMyTurn && isGuessPhase;

  const submitClue = async () => {
    if (!roomCode || !user || !canGiveClue) return;
    if (!clueWord.trim() || clueNumber < 1) return;

    const logEntry: GameLogEntry = {
      timestamp: Date.now(),
      type: 'clue',
      team: game.currentTurn,
      playerId: user.uid,
      playerName: currentPlayer?.name || 'Unknown',
      data: {
        clueWord: clueWord.trim().toUpperCase(),
        clueNumber,
      },
    };

    await update(ref(db), {
      [`rooms/${roomCode}/game/phase`]: 'guess',
      [`rooms/${roomCode}/game/currentClue`]: {
        word: clueWord.trim().toUpperCase(),
        number: clueNumber,
        guessesRemaining: clueNumber + 1, // Can guess one extra
      },
      [`rooms/${roomCode}/game/log`]: [...(game.log || []), logEntry],
    });

    setClueWord('');
    setClueNumber(1);
  };

  const guessCard = async (cardIndex: number) => {
    if (!roomCode || !user || !canGuess) return;

    const card = game.board[cardIndex];
    if (card.revealed) return;

    const updates: Record<string, unknown> = {};
    const newBoard = [...game.board];
    newBoard[cardIndex] = {
      ...card,
      revealed: true,
      revealedBy: user.uid,
    };
    updates[`rooms/${roomCode}/game/board`] = newBoard;

    // Update scores if team card
    const newScores = { ...game.scores };
    if (card.type === 'red' || card.type === 'blue') {
      newScores[card.type] = {
        ...newScores[card.type],
        found: newScores[card.type].found + 1,
      };
      updates[`rooms/${roomCode}/game/scores`] = newScores;
    }

    // Log the guess
    const logEntry: GameLogEntry = {
      timestamp: Date.now(),
      type: 'guess',
      team: game.currentTurn,
      playerId: user.uid,
      playerName: currentPlayer?.name || 'Unknown',
      data: {
        guessedWord: card.word,
        cardType: card.type,
      },
    };
    updates[`rooms/${roomCode}/game/log`] = [...(game.log || []), logEntry];

    // Check win conditions
    if (card.type === 'assassin') {
      // Guessing team loses
      const winner = game.currentTurn === 'red' ? 'blue' : 'red';
      updates[`rooms/${roomCode}/game/winner`] = winner;
      updates[`rooms/${roomCode}/game/winReason`] = 'assassin';
      updates[`rooms/${roomCode}/status`] = 'finished';
    } else if (newScores.red.found === newScores.red.total) {
      updates[`rooms/${roomCode}/game/winner`] = 'red';
      updates[`rooms/${roomCode}/game/winReason`] = 'all_found';
      updates[`rooms/${roomCode}/status`] = 'finished';
    } else if (newScores.blue.found === newScores.blue.total) {
      updates[`rooms/${roomCode}/game/winner`] = 'blue';
      updates[`rooms/${roomCode}/game/winReason`] = 'all_found';
      updates[`rooms/${roomCode}/status`] = 'finished';
    } else if (card.type !== game.currentTurn) {
      // Wrong guess - end turn
      updates[`rooms/${roomCode}/game/currentTurn`] =
        game.currentTurn === 'red' ? 'blue' : 'red';
      updates[`rooms/${roomCode}/game/phase`] = 'clue';
      updates[`rooms/${roomCode}/game/currentClue`] = null;
    } else {
      // Correct guess - decrement remaining
      const remaining = (game.currentClue?.guessesRemaining || 1) - 1;
      if (remaining <= 0) {
        updates[`rooms/${roomCode}/game/currentTurn`] =
          game.currentTurn === 'red' ? 'blue' : 'red';
        updates[`rooms/${roomCode}/game/phase`] = 'clue';
        updates[`rooms/${roomCode}/game/currentClue`] = null;
      } else {
        updates[`rooms/${roomCode}/game/currentClue`] = {
          ...game.currentClue,
          guessesRemaining: remaining,
        };
      }
    }

    await update(ref(db), updates);
  };

  const endTurn = async () => {
    if (!roomCode || !canGuess) return;

    const logEntry: GameLogEntry = {
      timestamp: Date.now(),
      type: 'pass',
      team: game.currentTurn,
      playerId: user?.uid || '',
      playerName: currentPlayer?.name || 'Unknown',
      data: {},
    };

    await update(ref(db), {
      [`rooms/${roomCode}/game/currentTurn`]:
        game.currentTurn === 'red' ? 'blue' : 'red',
      [`rooms/${roomCode}/game/phase`]: 'clue',
      [`rooms/${roomCode}/game/currentClue`]: null,
      [`rooms/${roomCode}/game/log`]: [...(game.log || []), logEntry],
    });
  };

  const playAgain = async () => {
    if (!roomCode) return;

    const startingTeam = getRandomStartingTeam();
    const board = generateBoard(startingTeam);

    const newGameState: GameState = {
      board,
      currentTurn: startingTeam,
      startingTeam,
      phase: 'clue',
      currentClue: null,
      scores: {
        red: { found: 0, total: startingTeam === 'red' ? 9 : 8 },
        blue: { found: 0, total: startingTeam === 'blue' ? 9 : 8 },
      },
      winner: null,
      winReason: null,
      log: [],
    };

    await update(ref(db), {
      [`rooms/${roomCode}/status`]: 'playing',
      [`rooms/${roomCode}/game`]: newGameState,
    });

    setShowGameOver(false);
  };

  const getCardColor = (card: Card): string => {
    if (card.revealed || isSpymaster) {
      switch (card.type) {
        case 'red':
          return card.revealed ? 'bg-red-team' : 'bg-red-team/20 border-red-team';
        case 'blue':
          return card.revealed ? 'bg-blue-team' : 'bg-blue-team/20 border-blue-team';
        case 'neutral':
          return card.revealed ? 'bg-neutral-card' : 'bg-neutral-card/20 border-neutral-card';
        case 'assassin':
          return card.revealed ? 'bg-assassin' : 'bg-assassin/20 border-assassin';
      }
    }
    return 'bg-white hover:bg-gray-50';
  };

  const getCardTextColor = (card: Card): string => {
    if (card.revealed) {
      return card.type === 'assassin' ? 'text-white' : 'text-white';
    }
    if (isSpymaster) {
      switch (card.type) {
        case 'red':
          return 'text-red-team';
        case 'blue':
          return 'text-blue-team';
        case 'assassin':
          return 'text-assassin';
        default:
          return 'text-gray-700';
      }
    }
    return 'text-gray-900';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-gray-900">CODENAMES</h1>
            <span className="font-mono text-gray-500">{roomCode}</span>
          </div>

          {/* Score */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-team" />
              <span className="font-bold text-red-team">
                {game.scores.red.found}/{game.scores.red.total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-team" />
              <span className="font-bold text-blue-team">
                {game.scores.blue.found}/{game.scores.blue.total}
              </span>
            </div>
          </div>

          {/* Player Info */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'px-3 py-1 rounded-full text-sm font-medium text-white',
                myTeam === 'red' ? 'bg-red-team' : 'bg-blue-team'
              )}
            >
              {isSpymaster ? 'Spymaster' : 'Operative'}
            </span>
          </div>
        </div>
      </header>

      {/* Turn Indicator */}
      <div
        className={cn(
          'py-3 text-center text-white font-semibold',
          game.currentTurn === 'red' ? 'bg-red-team' : 'bg-blue-team'
        )}
      >
        {game.winner ? (
          <span>Game Over!</span>
        ) : (
          <span>
            {game.currentTurn === 'red' ? 'Red' : 'Blue'} Team's Turn
            {isMyTurn && ' (Your Turn!)'}
          </span>
        )}
      </div>

      {/* Main Game Area */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Game Board */}
          <div className="lg:col-span-3">
            {/* Clue Display */}
            {game.currentClue && (
              <div className="mb-4 p-4 bg-white rounded-xl shadow-lg text-center">
                <p className="text-sm text-gray-500 mb-1">Current Clue</p>
                <p className="text-2xl font-bold">
                  {game.currentClue.word}{' '}
                  <span className="text-gray-500">({game.currentClue.number})</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {game.currentClue.guessesRemaining} guesses remaining
                </p>
              </div>
            )}

            {/* Board Grid */}
            <div className="grid grid-cols-5 gap-3">
              {game.board.map((card, index) => (
                <button
                  key={card.id}
                  onClick={() => guessCard(index)}
                  disabled={!canGuess || card.revealed}
                  className={cn(
                    'aspect-[4/3] p-2 rounded-xl font-bold text-sm md:text-base transition-all duration-200',
                    'border-2 shadow-md',
                    getCardColor(card),
                    getCardTextColor(card),
                    canGuess && !card.revealed && 'cursor-pointer hover:scale-105 hover:shadow-lg',
                    (!canGuess || card.revealed) && 'cursor-default',
                    isSpymaster && !card.revealed && 'border-2'
                  )}
                >
                  <span className="break-words leading-tight">{card.word}</span>
                </button>
              ))}
            </div>

            {/* Clue Input */}
            {canGiveClue && (
              <div className="mt-6 p-4 bg-white rounded-xl shadow-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Give a Clue</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={clueWord}
                    onChange={(e) => setClueWord(e.target.value)}
                    placeholder="One-word clue"
                    className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-team focus:outline-none uppercase"
                  />
                  <input
                    type="number"
                    value={clueNumber}
                    onChange={(e) => setClueNumber(Math.max(1, parseInt(e.target.value) || 1))}
                    min="1"
                    max="9"
                    className="w-20 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-team focus:outline-none text-center"
                  />
                  <button
                    onClick={submitClue}
                    disabled={!clueWord.trim()}
                    className={cn(
                      'px-6 py-3 rounded-xl font-semibold text-white transition-colors',
                      myTeam === 'red'
                        ? 'bg-red-team hover:bg-red-hover'
                        : 'bg-blue-team hover:bg-blue-hover',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}

            {/* End Turn Button */}
            {canGuess && (
              <div className="mt-4 text-center">
                <button
                  onClick={endTurn}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                >
                  End Turn
                </button>
              </div>
            )}

            {/* Waiting Message */}
            {!isMyTurn && !game.winner && (
              <div className="mt-4 text-center text-gray-500">
                Waiting for {game.currentTurn === 'red' ? 'Red' : 'Blue'} team...
              </div>
            )}
          </div>

          {/* Sidebar - Game Log */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-4 max-h-[600px] overflow-y-auto">
              <h3 className="font-semibold text-gray-900 mb-3">Game Log</h3>
              {game.log && game.log.length > 0 ? (
                <div className="space-y-2">
                  {[...game.log].reverse().map((entry, index) => (
                    <div
                      key={index}
                      className={cn(
                        'p-2 rounded-lg text-sm',
                        entry.team === 'red' ? 'bg-red-light' : 'bg-blue-light'
                      )}
                    >
                      <span className="font-medium">{entry.playerName}</span>
                      {entry.type === 'clue' && (
                        <span>
                          {' '}
                          gave clue:{' '}
                          <strong>
                            {entry.data.clueWord} ({entry.data.clueNumber})
                          </strong>
                        </span>
                      )}
                      {entry.type === 'guess' && (
                        <span>
                          {' '}
                          guessed{' '}
                          <strong
                            className={cn(
                              entry.data.cardType === 'red' && 'text-red-team',
                              entry.data.cardType === 'blue' && 'text-blue-team',
                              entry.data.cardType === 'assassin' && 'text-assassin'
                            )}
                          >
                            {entry.data.guessedWord}
                          </strong>
                        </span>
                      )}
                      {entry.type === 'pass' && <span> ended their turn</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No moves yet</p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Game Over Modal */}
      {showGameOver && game.winner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <div
              className={cn(
                'w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center',
                game.winner === 'red' ? 'bg-red-team' : 'bg-blue-team'
              )}
            >
              <span className="text-4xl">
                {game.winReason === 'assassin' ? '💀' : '🏆'}
              </span>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {game.winner === 'red' ? 'Red' : 'Blue'} Team Wins!
            </h2>
            <p className="text-gray-600 mb-6">
              {game.winReason === 'assassin'
                ? 'The other team found the assassin!'
                : 'All team words were found!'}
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={playAgain}
                className={cn(
                  'px-6 py-3 rounded-xl font-semibold text-white transition-colors',
                  'bg-gradient-to-r from-red-team to-blue-team hover:opacity-90'
                )}
              >
                Play Again
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-3 rounded-xl font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
              >
                Leave Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

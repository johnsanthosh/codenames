import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../utils/cn';
import { generateBoard, getRandomStartingTeam } from '../utils/generateBoard';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
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
  const [showBoardInspect, setShowBoardInspect] = useState(false);
  const [confettiFired, setConfettiFired] = useState(false);

  const fireConfetti = useCallback(() => {
    const duration = 3000;
    const end = Date.now() + duration;

    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }, []);

  useEffect(() => {
    if (!roomCode || !user) return;

    const roomRef = ref(db, `rooms/${roomCode}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const roomData = snapshot.val() as Room;
        setRoom(roomData);

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

  // Fire confetti for the winning team
  useEffect(() => {
    if (!room?.game?.winner || !room?.players || confettiFired) return;

    const currentPlayer = room.players[user?.uid || ''];
    const isWinner = currentPlayer?.team === room.game.winner;
    const isAssassinLoss = room.game.winReason === 'assassin';

    // Fire confetti only for winners (not assassin loss for the losing team)
    if (isWinner && !isAssassinLoss) {
      fireConfetti();
      setConfettiFired(true);
    } else if (isWinner && isAssassinLoss) {
      // Winner due to opponent hitting assassin - still celebrate!
      fireConfetti();
      setConfettiFired(true);
    }
  }, [room?.game?.winner, room?.game?.winReason, room?.players, user?.uid, confettiFired, fireConfetti]);

  if (isLoading || !room || !room.game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const { game } = room;
  const currentPlayer = room.players?.[user?.uid || ''];
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
        guessesRemaining: clueNumber + 1,
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

    const newScores = { ...game.scores };
    if (card.type === 'red' || card.type === 'blue') {
      newScores[card.type] = {
        ...newScores[card.type],
        found: newScores[card.type].found + 1,
      };
      updates[`rooms/${roomCode}/game/scores`] = newScores;
    }

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

    if (card.type === 'assassin') {
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
      updates[`rooms/${roomCode}/game/currentTurn`] =
        game.currentTurn === 'red' ? 'blue' : 'red';
      updates[`rooms/${roomCode}/game/phase`] = 'clue';
      updates[`rooms/${roomCode}/game/currentClue`] = null;
    } else {
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
    setShowBoardInspect(false);
    setConfettiFired(false);
  };

  const getCardStyles = (card: Card) => {
    const baseStyles = 'relative overflow-hidden';

    if (card.revealed) {
      switch (card.type) {
        case 'red':
          return `${baseStyles} bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/30`;
        case 'blue':
          return `${baseStyles} bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30`;
        case 'neutral':
          return `${baseStyles} bg-gradient-to-br from-amber-600 to-amber-700 shadow-lg shadow-amber-600/30`;
        case 'assassin':
          return `${baseStyles} bg-gradient-to-br from-slate-800 to-slate-900 shadow-lg shadow-slate-900/50`;
      }
    }

    if (isSpymaster) {
      switch (card.type) {
        case 'red':
          return `${baseStyles} bg-gradient-to-br from-red-500/30 to-red-600/20 ring-4 ring-red-500 ring-inset shadow-lg shadow-red-500/20`;
        case 'blue':
          return `${baseStyles} bg-gradient-to-br from-blue-500/30 to-blue-600/20 ring-4 ring-blue-500 ring-inset shadow-lg shadow-blue-500/20`;
        case 'neutral':
          return `${baseStyles} bg-gradient-to-br from-amber-500/30 to-amber-600/20 ring-4 ring-amber-500 ring-inset shadow-lg shadow-amber-500/20`;
        case 'assassin':
          return `${baseStyles} bg-gradient-to-br from-slate-900 to-black ring-4 ring-white ring-inset shadow-lg shadow-black/50`;
      }
    }

    return `${baseStyles} bg-slate-800/80 hover:bg-slate-700/80`;
  };

  const getTextColor = (card: Card) => {
    if (card.revealed) return 'text-white';
    if (isSpymaster) {
      switch (card.type) {
        case 'red': return 'text-red-400';
        case 'blue': return 'text-blue-400';
        case 'assassin': return 'text-slate-300';
        default: return 'text-amber-400';
      }
    }
    return 'text-white';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={cn(
          "absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl transition-colors duration-1000",
          game.currentTurn === 'red' ? 'bg-red-500/20' : 'bg-blue-500/20'
        )} />
        <div className={cn(
          "absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-3xl transition-colors duration-1000",
          game.currentTurn === 'red' ? 'bg-red-500/10' : 'bg-blue-500/10'
        )} />
      </div>

      {/* Header */}
      <header className="relative backdrop-blur-md bg-slate-900/50 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Codenames" className="w-8 h-8 rounded-lg" />
            <span className="font-mono text-slate-400 bg-slate-800 px-3 py-1 rounded-lg">{roomCode}</span>
          </div>

          {/* Score */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-red-500 to-red-600 shadow shadow-red-500/50" />
              <span className="font-bold text-red-400 text-lg">
                {game.scores.red.found}/{game.scores.red.total}
              </span>
            </div>
            <div className="w-px h-6 bg-slate-700" />
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-500 to-blue-600 shadow shadow-blue-500/50" />
              <span className="font-bold text-blue-400 text-lg">
                {game.scores.blue.found}/{game.scores.blue.total}
              </span>
            </div>
          </div>

          {/* Role Badge */}
          <div className={cn(
            "px-4 py-2 rounded-xl font-medium text-sm",
            myTeam === 'red'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          )}>
            {isSpymaster ? '🕵️ Spymaster' : '🔍 Operative'}
          </div>
        </div>
      </header>

      {/* Turn Indicator */}
      <motion.div
        layout
        className={cn(
          "py-3 text-center font-semibold transition-colors duration-500",
          game.currentTurn === 'red'
            ? 'bg-gradient-to-r from-red-500/20 via-red-500/30 to-red-500/20 text-red-400'
            : 'bg-gradient-to-r from-blue-500/20 via-blue-500/30 to-blue-500/20 text-blue-400'
        )}
      >
        {game.winner ? (
          <span className="text-white">🎉 Game Over!</span>
        ) : (
          <span>
            {game.currentTurn === 'red' ? '🔴 Red' : '🔵 Blue'} Team's Turn
            {isMyTurn && <span className="ml-2 animate-pulse">— Your Move!</span>}
          </span>
        )}
      </motion.div>

      {/* Main Game Area */}
      <main className="relative max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Game Board */}
          <div className="lg:col-span-3 space-y-4">
            {/* Clue Display */}
            <AnimatePresence>
              {game.currentClue && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={cn(
                    "p-6 rounded-2xl text-center backdrop-blur-xl border",
                    game.currentTurn === 'red'
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-blue-500/10 border-blue-500/30'
                  )}
                >
                  <p className="text-slate-400 text-sm mb-2">Current Clue</p>
                  <p className="text-4xl font-black text-white tracking-wide">
                    {game.currentClue.word}
                    <span className={cn(
                      "ml-3 text-2xl",
                      game.currentTurn === 'red' ? 'text-red-400' : 'text-blue-400'
                    )}>
                      {game.currentClue.number}
                    </span>
                  </p>
                  <p className="text-slate-400 text-sm mt-2">
                    {game.currentClue.guessesRemaining} guesses remaining
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Board Grid */}
            <div className="grid grid-cols-5 gap-3">
              {game.board.map((card, index) => (
                <motion.button
                  key={card.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.02 }}
                  whileHover={canGuess && !card.revealed ? { scale: 1.05, y: -4 } : {}}
                  whileTap={canGuess && !card.revealed ? { scale: 0.98 } : {}}
                  onClick={() => guessCard(index)}
                  disabled={!canGuess || card.revealed}
                  className={cn(
                    'aspect-[4/3] rounded-xl font-bold text-sm md:text-base transition-all duration-300',
                    'border border-white/10',
                    getCardStyles(card),
                    canGuess && !card.revealed ? 'cursor-pointer hover:ring-2 hover:ring-white/50' : 'cursor-not-allowed opacity-90'
                  )}
                >
                  {/* Spymaster corner indicator */}
                  {isSpymaster && !card.revealed && (
                    <div className={cn(
                      "absolute top-1 right-1 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold",
                      card.type === 'red' && 'bg-red-500 text-white',
                      card.type === 'blue' && 'bg-blue-500 text-white',
                      card.type === 'neutral' && 'bg-amber-500 text-white',
                      card.type === 'assassin' && 'bg-black text-white border border-white'
                    )}>
                      {card.type === 'red' && 'R'}
                      {card.type === 'blue' && 'B'}
                      {card.type === 'neutral' && 'N'}
                      {card.type === 'assassin' && '☠'}
                    </div>
                  )}
                  <span className={cn(
                    "relative z-10 break-words leading-tight px-2",
                    getTextColor(card),
                    card.revealed && card.type === 'assassin' && 'flex items-center justify-center gap-1'
                  )}>
                    {card.revealed && card.type === 'assassin' && <span>💀</span>}
                    {card.word}
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Clue Input */}
            <AnimatePresence>
              {canGiveClue && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="p-6 backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10"
                >
                  <h3 className="font-semibold text-white mb-4">Give a Clue</h3>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={clueWord}
                      onChange={(e) => setClueWord(e.target.value)}
                      placeholder="One-word clue"
                      className="flex-1 px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none uppercase font-medium"
                    />
                    <input
                      type="number"
                      value={clueNumber}
                      onChange={(e) => setClueNumber(Math.max(1, parseInt(e.target.value) || 1))}
                      min="1"
                      max="9"
                      className="w-20 px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white text-center focus:border-blue-500 focus:outline-none font-bold"
                    />
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={submitClue}
                      disabled={!clueWord.trim()}
                      className={cn(
                        'px-8 py-3 rounded-xl font-semibold text-white cursor-pointer',
                        myTeam === 'red'
                          ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-500/25'
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-500/25',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      Submit
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* End Turn Button */}
            {canGuess && (
              <div className="text-center">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={endTurn}
                  className="px-8 py-3 bg-slate-700 text-white rounded-xl font-semibold hover:bg-slate-600 transition-colors cursor-pointer"
                >
                  End Turn
                </motion.button>
              </div>
            )}

            {/* Waiting Message - Other team's turn */}
            {!isMyTurn && !game.winner && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-slate-400 py-4 flex items-center justify-center gap-2"
              >
                <motion.span
                  animate={{ rotate: [0, 180, 180, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-block"
                >
                  ⏳
                </motion.span>
                Waiting for {game.currentTurn === 'red' ? 'Red' : 'Blue'} team...
              </motion.div>
            )}

            {/* Waiting Message - My team's turn, waiting for spymaster */}
            {isMyTurn && isCluePhase && !isSpymaster && !game.winner && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  "text-center py-4 flex items-center justify-center gap-2",
                  myTeam === 'red' ? 'text-red-400' : 'text-blue-400'
                )}
              >
                <motion.span
                  animate={{ rotate: [0, 180, 180, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-block"
                >
                  ⏳
                </motion.span>
                Waiting for your Spymaster to give a clue...
              </motion.div>
            )}
          </div>

          {/* Sidebar - Game Log */}
          <div className="lg:col-span-1">
            <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4 max-h-[600px] overflow-y-auto">
              <h3 className="font-semibold text-white mb-4">Game Log</h3>
              {game.log && game.log.length > 0 ? (
                <div className="space-y-2">
                  {[...game.log].reverse().map((entry, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        'p-3 rounded-xl text-sm',
                        entry.team === 'red' ? 'bg-red-500/10 border border-red-500/20' : 'bg-blue-500/10 border border-blue-500/20'
                      )}
                    >
                      <span className="font-medium text-white">{entry.playerName}</span>
                      {entry.type === 'clue' && (
                        <span className="text-slate-300">
                          {' '}
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded font-medium',
                            entry.team === 'red' ? 'bg-red-500/30 text-red-300' : 'bg-blue-500/30 text-blue-300'
                          )}>
                            {entry.team === 'red' ? 'Red' : 'Blue'} Spymaster
                          </span>
                          {' '}gave clue:{' '}
                          <strong className="text-white">{entry.data.clueWord} ({entry.data.clueNumber})</strong>
                        </span>
                      )}
                      {entry.type === 'guess' && (
                        <span className="text-slate-300">
                          {' '}
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded font-medium',
                            entry.team === 'red' ? 'bg-red-500/30 text-red-300' : 'bg-blue-500/30 text-blue-300'
                          )}>
                            {entry.team === 'red' ? 'Red' : 'Blue'} Operative
                          </span>
                          {' '}guessed{' '}
                          <strong className={cn(
                            entry.data.cardType === 'red' && 'text-red-400',
                            entry.data.cardType === 'blue' && 'text-blue-400',
                            entry.data.cardType === 'neutral' && 'text-amber-400',
                            entry.data.cardType === 'assassin' && 'text-slate-300'
                          )}>
                            {entry.data.guessedWord}
                          </strong>
                        </span>
                      )}
                      {entry.type === 'pass' && <span className="text-slate-300"> ended turn</span>}
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No moves yet</p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Game Over Modal */}
      <AnimatePresence>
        {showGameOver && game.winner && (() => {
          const isWinner = myTeam === game.winner;
          const isAssassinLoss = game.winReason === 'assassin';
          const losingTeam = game.winner === 'red' ? 'blue' : 'red';
          const didWeHitAssassin = isAssassinLoss && myTeam === losingTeam;

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className={cn(
                  "max-w-lg w-full rounded-3xl p-8 text-center border",
                  isWinner
                    ? game.winner === 'red'
                      ? 'bg-gradient-to-br from-red-900/90 to-slate-900/90 border-red-500/30'
                      : 'bg-gradient-to-br from-blue-900/90 to-slate-900/90 border-blue-500/30'
                    : 'bg-gradient-to-br from-slate-900/95 to-slate-800/95 border-slate-500/30'
                )}
              >
                {/* Winner/Loser Icon */}
                {didWeHitAssassin ? (
                  <motion.div className="mb-4">
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.2, type: 'spring', stiffness: 150 }}
                      className="text-8xl mb-2"
                    >
                      💀
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="text-6xl font-black text-slate-400 tracking-widest"
                      style={{ fontFamily: 'serif' }}
                    >
                      R.I.P.
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="text-slate-500 mt-2"
                    >
                      You found the assassin...
                    </motion.div>
                  </motion.div>
                ) : isWinner ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                    className="text-7xl mb-4"
                  >
                    🏆
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                    className="text-7xl mb-4"
                  >
                    😔
                  </motion.div>
                )}

                {/* Title */}
                <h2 className={cn(
                  "text-4xl font-black mb-2",
                  isWinner ? 'text-white' : 'text-slate-300'
                )}>
                  {isWinner ? 'Victory!' : didWeHitAssassin ? 'Game Over' : 'Defeat'}
                </h2>
                <p className={cn(
                  "mb-6",
                  isWinner ? 'text-slate-300' : 'text-slate-400'
                )}>
                  {isWinner
                    ? isAssassinLoss
                      ? 'The other team found the assassin!'
                      : 'Your team found all the words!'
                    : isAssassinLoss
                      ? 'Your team hit the assassin...'
                      : 'The other team found all their words.'}
                </p>

                {/* Scores */}
                <div className="flex justify-center gap-8 mb-6 p-4 bg-black/30 rounded-2xl">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <div className="w-4 h-4 rounded bg-red-500" />
                      <span className="text-red-400 font-semibold">Red</span>
                    </div>
                    <div className="text-3xl font-black text-white">
                      {game.scores.red.found}/{game.scores.red.total}
                    </div>
                  </div>
                  <div className="w-px bg-slate-600" />
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <div className="w-4 h-4 rounded bg-blue-500" />
                      <span className="text-blue-400 font-semibold">Blue</span>
                    </div>
                    <div className="text-3xl font-black text-white">
                      {game.scores.blue.found}/{game.scores.blue.total}
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3 justify-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={playAgain}
                      className={cn(
                        "px-8 py-3 rounded-xl font-semibold text-white cursor-pointer",
                        game.winner === 'red'
                          ? 'bg-gradient-to-r from-red-500 to-orange-500'
                          : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                      )}
                    >
                      Play Again
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => navigate('/')}
                      className="px-8 py-3 rounded-xl font-semibold bg-slate-700 text-white hover:bg-slate-600 cursor-pointer"
                    >
                      Leave
                    </motion.button>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowBoardInspect(true)}
                    className="px-6 py-2 rounded-xl font-medium bg-white/10 text-slate-300 hover:bg-white/20 cursor-pointer transition-colors"
                  >
                    🔍 Inspect Board
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Board Inspection Modal */}
      <AnimatePresence>
        {showBoardInspect && game.winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowBoardInspect(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-4xl w-full rounded-3xl p-6 bg-slate-900/95 border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Board Review</h2>
                <button
                  onClick={() => setShowBoardInspect(false)}
                  className="p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-6 mb-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-500" />
                  <span className="text-slate-300">Red ({game.scores.red.found}/{game.scores.red.total})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-500" />
                  <span className="text-slate-300">Blue ({game.scores.blue.found}/{game.scores.blue.total})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-amber-600" />
                  <span className="text-slate-300">Neutral</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-slate-800 border border-white/30" />
                  <span className="text-slate-300">Assassin</span>
                </div>
              </div>

              {/* Full Board */}
              <div className="grid grid-cols-5 gap-2">
                {game.board.map((card) => (
                  <div
                    key={card.id}
                    className={cn(
                      'aspect-[4/3] rounded-xl font-bold text-sm flex items-center justify-center text-center p-2 border transition-all',
                      card.type === 'red' && 'bg-gradient-to-br from-red-500 to-red-600 border-red-400/50',
                      card.type === 'blue' && 'bg-gradient-to-br from-blue-500 to-blue-600 border-blue-400/50',
                      card.type === 'neutral' && 'bg-gradient-to-br from-amber-600 to-amber-700 border-amber-500/50',
                      card.type === 'assassin' && 'bg-gradient-to-br from-slate-800 to-black border-white/30',
                      card.revealed && 'ring-2 ring-white/50 ring-offset-2 ring-offset-slate-900'
                    )}
                  >
                    <span className="text-white break-words leading-tight">
                      {card.type === 'assassin' && '💀 '}
                      {card.word}
                      {card.revealed && ' ✓'}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-center text-slate-500 text-sm mt-4">
                ✓ indicates cards that were revealed during the game
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

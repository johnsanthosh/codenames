import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { generateBoard, getRandomStartingTeam } from '../utils/generateBoard';
import { cn } from '../utils/cn';
import { motion } from 'framer-motion';
import type { Room, Team, Role, GameState } from '../types';

export function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!roomCode || !user) return;

    const roomRef = ref(db, `rooms/${roomCode}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const roomData = snapshot.val() as Room;
        setRoom(roomData);

        if (roomData.status === 'playing' && roomData.game) {
          navigate(`/room/${roomCode}/play`);
        }
      } else {
        navigate('/');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [roomCode, user, navigate]);

  const currentPlayer = room?.players?.[user?.uid || ''];
  const isHost = room?.createdBy === user?.uid;

  const joinTeam = async (team: Team) => {
    if (!roomCode || !user || !room) return;

    const currentTeam = currentPlayer?.team;
    const updates: Record<string, unknown> = {};
    const roomTeams = room.teams || { red: { spymaster: null, operatives: [] }, blue: { spymaster: null, operatives: [] } };

    if (currentTeam) {
      const currentTeamData = roomTeams[currentTeam] || { spymaster: null, operatives: [] };
      if (currentTeamData.spymaster === user.uid) {
        updates[`rooms/${roomCode}/teams/${currentTeam}/spymaster`] = null;
      } else {
        const newOperatives = (currentTeamData.operatives || []).filter(
          (id) => id !== user.uid
        );
        updates[`rooms/${roomCode}/teams/${currentTeam}/operatives`] = newOperatives;
      }
    }

    const targetTeamData = roomTeams[team] || { spymaster: null, operatives: [] };
    const newOperatives = [...(targetTeamData.operatives || [])];
    if (!newOperatives.includes(user.uid)) {
      newOperatives.push(user.uid);
    }
    updates[`rooms/${roomCode}/teams/${team}/operatives`] = newOperatives;
    updates[`rooms/${roomCode}/players/${user.uid}/team`] = team;
    updates[`rooms/${roomCode}/players/${user.uid}/role`] = 'operative';

    await update(ref(db), updates);
  };

  const selectRole = async (role: Role) => {
    if (!roomCode || !user || !room || !currentPlayer?.team) return;

    const team = currentPlayer.team;
    const updates: Record<string, unknown> = {};
    const roomTeams = room.teams || { red: { spymaster: null, operatives: [] }, blue: { spymaster: null, operatives: [] } };
    const teamData = roomTeams[team] || { spymaster: null, operatives: [] };

    if (role === 'spymaster') {
      if (teamData.spymaster && teamData.spymaster !== user.uid) {
        return;
      }

      const newOperatives = (teamData.operatives || []).filter(
        (id) => id !== user.uid
      );
      updates[`rooms/${roomCode}/teams/${team}/operatives`] = newOperatives;
      updates[`rooms/${roomCode}/teams/${team}/spymaster`] = user.uid;
    } else {
      if (teamData.spymaster === user.uid) {
        updates[`rooms/${roomCode}/teams/${team}/spymaster`] = null;
      }
      const newOperatives = [...(teamData.operatives || [])];
      if (!newOperatives.includes(user.uid)) {
        newOperatives.push(user.uid);
      }
      updates[`rooms/${roomCode}/teams/${team}/operatives`] = newOperatives;
    }

    updates[`rooms/${roomCode}/players/${user.uid}/role`] = role;
    await update(ref(db), updates);
  };

  const startGame = async () => {
    if (!roomCode || !room) return;

    const roomTeams = room.teams || { red: { spymaster: null, operatives: [] }, blue: { spymaster: null, operatives: [] } };

    if (!roomTeams.red?.spymaster || !roomTeams.blue?.spymaster) {
      return;
    }

    setIsStarting(true);

    const startingTeam = getRandomStartingTeam();
    const board = generateBoard(startingTeam);

    const gameState: GameState = {
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
      [`rooms/${roomCode}/game`]: gameState,
    });
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = () => {
    navigate('/');
  };

  if (isLoading) {
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

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <p className="text-slate-400">Room not found</p>
      </div>
    );
  }

  const teams = room.teams || {
    red: { spymaster: null, operatives: [] },
    blue: { spymaster: null, operatives: [] },
  };
  const redTeam = teams.red || { spymaster: null, operatives: [] };
  const blueTeam = teams.blue || { spymaster: null, operatives: [] };

  const canStart =
    redTeam.spymaster &&
    blueTeam.spymaster &&
    ((redTeam.operatives?.length || 0) > 0 || (blueTeam.operatives?.length || 0) > 0);

  const players = room.players || {};

  const getPlayersForTeam = (team: Team) => {
    return Object.values(players).filter((p) => p.team === team);
  };

  const renderTeamPanel = (team: Team) => {
    const teamPlayers = getPlayersForTeam(team);
    const teamData = team === 'red' ? redTeam : blueTeam;
    const spymasterId = teamData.spymaster;
    const spymaster = spymasterId ? players[spymasterId] : null;
    const operatives = teamPlayers.filter((p) => p.role === 'operative');
    const isMyTeam = currentPlayer?.team === team;

    const teamColor = team === 'red' ? {
      bg: 'from-red-500/20 to-red-600/10',
      border: 'border-red-500/30',
      accent: 'text-red-400',
      button: 'from-red-500 to-red-600',
      shadow: 'shadow-red-500/25',
      ring: 'ring-red-500',
    } : {
      bg: 'from-blue-500/20 to-blue-600/10',
      border: 'border-blue-500/30',
      accent: 'text-blue-400',
      button: 'from-blue-500 to-blue-600',
      shadow: 'shadow-blue-500/25',
      ring: 'ring-blue-500',
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: team === 'red' ? 0.1 : 0.2 }}
        className={cn(
          'backdrop-blur-xl rounded-3xl overflow-hidden border',
          `bg-gradient-to-br ${teamColor.bg}`,
          teamColor.border
        )}
      >
        <div className={cn(
          'px-6 py-4 border-b',
          teamColor.border
        )}>
          <h2 className={cn('text-2xl font-bold', teamColor.accent)}>
            {team === 'red' ? '🔴 Red Team' : '🔵 Blue Team'}
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Spymaster Section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              🕵️ Spymaster
            </h3>
            {spymaster ? (
              <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
                {spymaster.photoURL && (
                  <img
                    src={spymaster.photoURL}
                    alt={spymaster.name}
                    className={cn('w-12 h-12 rounded-full ring-2', teamColor.ring)}
                  />
                )}
                <div>
                  <span className="font-medium text-white">
                    {spymaster.name}
                  </span>
                  {spymaster.id === user?.uid && (
                    <span className="ml-2 text-xs bg-white/10 px-2 py-0.5 rounded-full text-slate-300">You</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 border-2 border-dashed border-white/10 rounded-xl text-slate-500 text-center flex items-center justify-center gap-2">
                <motion.span
                  animate={{ rotate: [0, 180, 180, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-block"
                >
                  ⏳
                </motion.span>
                Waiting for spymaster...
              </div>
            )}
            {isMyTeam && currentPlayer?.role !== 'spymaster' && !spymaster && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => selectRole('spymaster')}
                className={cn(
                  'mt-3 w-full py-3 px-4 rounded-xl font-medium text-white cursor-pointer',
                  `bg-gradient-to-r ${teamColor.button} shadow-lg ${teamColor.shadow}`
                )}
              >
                Become Spymaster
              </motion.button>
            )}
          </div>

          {/* Operatives Section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              🔍 Operatives
            </h3>
            {operatives.length > 0 ? (
              <div className="space-y-2">
                {operatives.map((op) => (
                  <div
                    key={op.id}
                    className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10"
                  >
                    {op.photoURL && (
                      <img
                        src={op.photoURL}
                        alt={op.name}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                    <span className="font-medium text-white">
                      {op.name}
                      {op.id === user?.uid && (
                        <span className="ml-2 text-xs bg-white/10 px-2 py-0.5 rounded-full text-slate-300">You</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 border-2 border-dashed border-white/10 rounded-xl text-slate-500 text-center">
                No operatives yet
              </div>
            )}
            {isMyTeam && currentPlayer?.role === 'spymaster' && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => selectRole('operative')}
                className="mt-3 w-full py-2 px-4 rounded-xl font-medium bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
              >
                Switch to Operative
              </motion.button>
            )}
          </div>

          {/* Join Team Button */}
          {!isMyTeam && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => joinTeam(team)}
              className={cn(
                'w-full py-4 px-4 rounded-xl font-semibold text-white cursor-pointer',
                `bg-gradient-to-r ${teamColor.button} shadow-lg ${teamColor.shadow}`
              )}
            >
              Join {team === 'red' ? 'Red' : 'Blue'} Team
            </motion.button>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative backdrop-blur-md bg-slate-900/50 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Codenames" className="w-10 h-10 rounded-lg" />
            <h1 className="text-2xl font-bold text-white">Game Lobby</h1>
          </div>
          <div className="flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={copyRoomCode}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors border border-white/10 cursor-pointer"
            >
              <span className="font-mono font-bold text-lg text-white">{roomCode}</span>
              <span className="text-sm text-slate-400">
                {copied ? '✓ Copied!' : 'Copy'}
              </span>
            </motion.button>
            <button
              onClick={leaveRoom}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Leave
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-6xl mx-auto px-4 py-8">
        {/* Room Code Display */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <p className="text-slate-400 mb-3">Share this code with your friends</p>
          <div className="inline-flex items-center gap-3 px-8 py-4 backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10">
            <span className="font-mono font-black text-4xl tracking-[0.3em] text-white">
              {roomCode}
            </span>
          </div>
        </motion.div>

        {/* Team Panels */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {renderTeamPanel('red')}
          {renderTeamPanel('blue')}
        </div>

        {/* Start Game Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          {isHost && (
            <>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startGame}
                disabled={!canStart || isStarting}
                className={cn(
                  'px-12 py-5 rounded-2xl font-bold text-xl text-white cursor-pointer',
                  'bg-gradient-to-r from-red-500 via-purple-500 to-blue-500',
                  'shadow-xl shadow-purple-500/25',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isStarting ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
                    />
                    Starting...
                  </span>
                ) : (
                  '🚀 Start Game'
                )}
              </motion.button>
              {!canStart && (
                <p className="mt-4 text-slate-400">
                  Both teams need a spymaster and at least one operative total
                </p>
              )}
            </>
          )}

          {!isHost && (
            <div className="backdrop-blur-xl bg-white/5 rounded-2xl px-8 py-6 inline-block border border-white/10">
              <p className="text-slate-300 flex items-center gap-2">
                <motion.span
                  animate={{ rotate: [0, 180, 180, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-block"
                >
                  ⏳
                </motion.span>
                Waiting for the host to start the game...
              </p>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

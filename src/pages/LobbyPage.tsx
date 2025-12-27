import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { generateBoard, getRandomStartingTeam } from '../utils/generateBoard';
import { cn } from '../utils/cn';
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

        // Redirect to game if already playing
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

    // Remove from current team
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

    // Add to new team as operative by default
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
      // Check if spymaster slot is taken
      if (teamData.spymaster && teamData.spymaster !== user.uid) {
        return; // Slot taken
      }

      // Remove from operatives
      const newOperatives = (teamData.operatives || []).filter(
        (id) => id !== user.uid
      );
      updates[`rooms/${roomCode}/teams/${team}/operatives`] = newOperatives;
      updates[`rooms/${roomCode}/teams/${team}/spymaster`] = user.uid;
    } else {
      // Moving to operative
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

    // Validate both teams have spymasters
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-team" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-gray-600">Room not found</p>
      </div>
    );
  }

  // Ensure teams structure exists (Firebase may not store empty objects)
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

    return (
      <div
        className={cn(
          'bg-white rounded-2xl shadow-lg overflow-hidden',
          team === 'red' ? 'border-t-4 border-red-team' : 'border-t-4 border-blue-team'
        )}
      >
        <div
          className={cn(
            'px-6 py-4',
            team === 'red' ? 'bg-red-light' : 'bg-blue-light'
          )}
        >
          <h2
            className={cn(
              'text-xl font-bold',
              team === 'red' ? 'text-red-team' : 'text-blue-team'
            )}
          >
            {team === 'red' ? 'Red Team' : 'Blue Team'}
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Spymaster Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Spymaster
            </h3>
            {spymaster ? (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                {spymaster.photoURL && (
                  <img
                    src={spymaster.photoURL}
                    alt={spymaster.name}
                    className="w-10 h-10 rounded-full"
                  />
                )}
                <span className="font-medium text-gray-900">
                  {spymaster.name}
                  {spymaster.id === user?.uid && ' (You)'}
                </span>
              </div>
            ) : (
              <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-center">
                Waiting for spymaster...
              </div>
            )}
            {isMyTeam && currentPlayer?.role !== 'spymaster' && !spymaster && (
              <button
                onClick={() => selectRole('spymaster')}
                className={cn(
                  'mt-2 w-full py-2 px-4 rounded-lg font-medium text-white transition-colors',
                  team === 'red'
                    ? 'bg-red-team hover:bg-red-hover'
                    : 'bg-blue-team hover:bg-blue-hover'
                )}
              >
                Become Spymaster
              </button>
            )}
          </div>

          {/* Operatives Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Operatives
            </h3>
            {operatives.length > 0 ? (
              <div className="space-y-2">
                {operatives.map((op) => (
                  <div
                    key={op.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    {op.photoURL && (
                      <img
                        src={op.photoURL}
                        alt={op.name}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                    <span className="font-medium text-gray-900">
                      {op.name}
                      {op.id === user?.uid && ' (You)'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-center">
                No operatives yet
              </div>
            )}
            {isMyTeam && currentPlayer?.role === 'spymaster' && (
              <button
                onClick={() => selectRole('operative')}
                className="mt-2 w-full py-2 px-4 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
              >
                Switch to Operative
              </button>
            )}
          </div>

          {/* Join Team Button */}
          {!isMyTeam && (
            <button
              onClick={() => joinTeam(team)}
              className={cn(
                'w-full py-3 px-4 rounded-xl font-semibold text-white transition-colors',
                team === 'red'
                  ? 'bg-red-team hover:bg-red-hover'
                  : 'bg-blue-team hover:bg-blue-hover'
              )}
            >
              Join {team === 'red' ? 'Red' : 'Blue'} Team
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Game Lobby</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={copyRoomCode}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <span className="font-mono font-bold text-lg">{roomCode}</span>
              <span className="text-sm text-gray-500">
                {copied ? 'Copied!' : 'Copy'}
              </span>
            </button>
            <button
              onClick={leaveRoom}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              Leave
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Room Code Display */}
        <div className="text-center mb-8">
          <p className="text-gray-600 mb-2">Share this code with your friends:</p>
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-xl shadow-lg">
            <span className="font-mono font-bold text-3xl tracking-widest">
              {roomCode}
            </span>
          </div>
        </div>

        {/* Team Panels */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {renderTeamPanel('red')}
          {renderTeamPanel('blue')}
        </div>

        {/* Start Game Button */}
        {isHost && (
          <div className="text-center">
            <button
              onClick={startGame}
              disabled={!canStart || isStarting}
              className={cn(
                'px-8 py-4 rounded-xl font-bold text-xl text-white transition-all duration-200',
                'bg-gradient-to-r from-red-team to-blue-team',
                'hover:shadow-lg hover:scale-105',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'
              )}
            >
              {isStarting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                  Starting...
                </span>
              ) : (
                'Start Game'
              )}
            </button>
            {!canStart && (
              <p className="mt-3 text-gray-500">
                Both teams need a spymaster and at least one operative total
              </p>
            )}
          </div>
        )}

        {!isHost && (
          <div className="text-center">
            <p className="text-gray-600">
              Waiting for the host to start the game...
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

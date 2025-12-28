import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, remove, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../utils/cn';
import { isAdmin } from '../utils/isAdmin';
import type { Room, Player } from '../types';

export function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Record<string, Room>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const userIsAdmin = isAdmin(user?.email);

  useEffect(() => {
    if (!userIsAdmin) {
      navigate('/');
      return;
    }

    const roomsRef = ref(db, 'rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      if (snapshot.exists()) {
        setRooms(snapshot.val());
      } else {
        setRooms({});
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [userIsAdmin, navigate]);

  const deleteRoom = async (roomCode: string) => {
    if (!confirm(`Delete room ${roomCode}? This cannot be undone.`)) return;

    try {
      await remove(ref(db, `rooms/${roomCode}`));
      setSelectedRoom(null);
    } catch (error) {
      console.error('Error deleting room:', error);
      alert('Failed to delete room');
    }
  };

  const kickPlayer = async (roomCode: string, playerId: string) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players?.[playerId];
    if (!confirm(`Kick ${player?.name || 'player'}?`)) return;

    try {
      const updates: Record<string, unknown> = {};

      // Remove from players
      updates[`rooms/${roomCode}/players/${playerId}`] = null;

      // Remove from team
      const playerTeam = player?.team;
      if (playerTeam && room.teams) {
        const teamData = room.teams[playerTeam];
        if (teamData?.spymaster === playerId) {
          updates[`rooms/${roomCode}/teams/${playerTeam}/spymaster`] = null;
        }
        if (teamData?.operatives) {
          const newOperatives = teamData.operatives.filter((id: string) => id !== playerId);
          updates[`rooms/${roomCode}/teams/${playerTeam}/operatives`] = newOperatives;
        }
      }

      await update(ref(db), updates);
    } catch (error) {
      console.error('Error kicking player:', error);
      alert('Failed to kick player');
    }
  };

  const resetGame = async (roomCode: string) => {
    if (!confirm(`Reset game in room ${roomCode}?`)) return;

    try {
      await update(ref(db), {
        [`rooms/${roomCode}/status`]: 'waiting',
        [`rooms/${roomCode}/game`]: null,
      });
    } catch (error) {
      console.error('Error resetting game:', error);
      alert('Failed to reset game');
    }
  };

  const endGame = async (roomCode: string) => {
    if (!confirm(`End game in room ${roomCode}?`)) return;

    try {
      await update(ref(db), {
        [`rooms/${roomCode}/status`]: 'finished',
      });
    } catch (error) {
      console.error('Error ending game:', error);
      alert('Failed to end game');
    }
  };

  if (!userIsAdmin) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-team" />
      </div>
    );
  }

  const roomList = Object.entries(rooms);
  const selectedRoomData = selectedRoom ? rooms[selectedRoom] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Back to Home
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Room List */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Active Rooms ({roomList.length})
            </h2>

            {roomList.length === 0 ? (
              <p className="text-gray-500">No active rooms</p>
            ) : (
              <div className="space-y-3">
                {roomList.map(([code, room]) => {
                  const playerCount = Object.keys(room.players || {}).length;
                  return (
                    <div
                      key={code}
                      onClick={() => setSelectedRoom(code)}
                      className={cn(
                        'p-4 rounded-xl border-2 cursor-pointer transition-all',
                        selectedRoom === code
                          ? 'border-blue-team bg-blue-light'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold text-lg">{code}</span>
                          <span
                            className={cn(
                              'ml-3 px-2 py-1 rounded text-xs font-medium',
                              room.status === 'waiting' && 'bg-yellow-100 text-yellow-800',
                              room.status === 'playing' && 'bg-green-100 text-green-800',
                              room.status === 'finished' && 'bg-gray-100 text-gray-800'
                            )}
                          >
                            {room.status}
                          </span>
                        </div>
                        <span className="text-gray-500">{playerCount} players</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Room Details */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            {selectedRoomData ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    Room: {selectedRoom}
                  </h2>
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-medium',
                      selectedRoomData.status === 'waiting' && 'bg-yellow-100 text-yellow-800',
                      selectedRoomData.status === 'playing' && 'bg-green-100 text-green-800',
                      selectedRoomData.status === 'finished' && 'bg-gray-100 text-gray-800'
                    )}
                  >
                    {selectedRoomData.status}
                  </span>
                </div>

                {/* Players */}
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-700 mb-3">Players</h3>
                  <div className="space-y-2">
                    {Object.values(selectedRoomData.players || {}).map((player: Player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {player.photoURL && (
                            <img
                              src={player.photoURL}
                              alt={player.name}
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{player.name}</p>
                            <p className="text-xs text-gray-500">
                              {player.team ? (
                                <span className={player.team === 'red' ? 'text-red-600' : 'text-blue-600'}>
                                  {player.team} - {player.role}
                                </span>
                              ) : (
                                'No team'
                              )}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => kickPlayer(selectedRoom!, player.id)}
                          className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                        >
                          Kick
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Game Info */}
                {selectedRoomData.game && (
                  <div className="mb-6">
                    <h3 className="font-semibold text-gray-700 mb-3">Game State</h3>
                    <div className="p-3 bg-gray-50 rounded-lg text-sm">
                      <p>Turn: <span className={selectedRoomData.game.currentTurn === 'red' ? 'text-red-600' : 'text-blue-600'}>{selectedRoomData.game.currentTurn}</span></p>
                      <p>Phase: {selectedRoomData.game.phase}</p>
                      <p>Red: {selectedRoomData.game.scores?.red?.found || 0}/{selectedRoomData.game.scores?.red?.total || 0}</p>
                      <p>Blue: {selectedRoomData.game.scores?.blue?.found || 0}/{selectedRoomData.game.scores?.blue?.total || 0}</p>
                      {selectedRoomData.game.winner && (
                        <p className="font-bold mt-2">Winner: {selectedRoomData.game.winner}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-700">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedRoomData.status === 'playing' && (
                      <>
                        <button
                          onClick={() => resetGame(selectedRoom!)}
                          className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                        >
                          Reset Game
                        </button>
                        <button
                          onClick={() => endGame(selectedRoom!)}
                          className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200"
                        >
                          End Game
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => deleteRoom(selectedRoom!)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Delete Room
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-500">Select a room to view details</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

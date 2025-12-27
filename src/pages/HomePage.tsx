import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, get } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { generateRoomCode } from '../utils/generateRoomCode';
import type { Room } from '../types';
import { cn } from '../utils/cn';

// Admin email - only this user can create games
// Security is enforced by Firebase Database Rules, not this constant
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';

export function HomePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = user?.email === ADMIN_EMAIL;

  const createRoom = async () => {
    if (!user) return;

    setIsCreating(true);
    setError('');

    try {
      const roomCode = generateRoomCode();
      const roomRef = ref(db, `rooms/${roomCode}`);

      const newRoom: Room = {
        roomCode,
        createdAt: Date.now(),
        createdBy: user.uid,
        status: 'waiting',
        teams: {
          red: { spymaster: null, operatives: [] },
          blue: { spymaster: null, operatives: [] },
        },
        players: {
          [user.uid]: {
            id: user.uid,
            name: user.displayName || 'Anonymous',
            email: user.email || '',
            photoURL: user.photoURL,
            team: null,
            role: null,
            isOnline: true,
            lastSeen: Date.now(),
          },
        },
        game: null,
      };

      await set(roomRef, newRoom);
      navigate(`/room/${roomCode}`);
    } catch (err) {
      console.error('Error creating room:', err);
      setError('Failed to create room. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = async () => {
    if (!user || !joinCode.trim()) return;

    setIsJoining(true);
    setError('');

    const code = joinCode.toUpperCase().trim();

    try {
      const roomRef = ref(db, `rooms/${code}`);
      const snapshot = await get(roomRef);

      if (!snapshot.exists()) {
        setError('Room not found. Check the code and try again.');
        return;
      }

      const room = snapshot.val() as Room;

      if (room.status === 'finished') {
        setError('This game has already ended.');
        return;
      }

      // Add player to room if not already present
      if (!room.players[user.uid]) {
        const playerRef = ref(db, `rooms/${code}/players/${user.uid}`);
        await set(playerRef, {
          id: user.uid,
          name: user.displayName || 'Anonymous',
          email: user.email || '',
          photoURL: user.photoURL,
          team: null,
          role: null,
          isOnline: true,
          lastSeen: Date.now(),
        });
      }

      navigate(`/room/${code}`);
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join room. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">CODENAMES</h1>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="px-3 py-1 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700"
              >
                Admin
              </button>
            )}
            {user?.photoURL && (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="w-10 h-10 rounded-full"
              />
            )}
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">
                {user?.displayName}
              </p>
              <button
                onClick={signOut}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className={cn(
          'grid gap-8',
          isAdmin ? 'md:grid-cols-2' : 'max-w-md mx-auto'
        )}>
          {/* Create Room - Admin Only */}
          {isAdmin && (
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Create a Game
              </h2>
              <p className="text-gray-600 mb-6">
                Start a new game and invite your friends with a room code.
              </p>
              <button
                onClick={createRoom}
                disabled={isCreating}
                className={cn(
                  'w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200',
                  'bg-blue-team hover:bg-blue-hover',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    Creating...
                  </span>
                ) : (
                  'Create New Game'
                )}
              </button>
            </div>
          )}

          {/* Join Room */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Join a Game
            </h2>
            <p className="text-gray-600 mb-6">
              Enter a room code to join an existing game.
            </p>
            <div className="space-y-4">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                maxLength={6}
                className={cn(
                  'w-full py-4 px-6 rounded-xl border-2 text-center text-2xl font-mono tracking-widest uppercase',
                  'border-gray-200 focus:border-red-team focus:outline-none',
                  'transition-colors duration-200'
                )}
              />
              <button
                onClick={joinRoom}
                disabled={isJoining || !joinCode.trim()}
                className={cn(
                  'w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200',
                  'bg-red-team hover:bg-red-hover',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isJoining ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    Joining...
                  </span>
                ) : (
                  'Join Game'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
            {error}
          </div>
        )}

        {/* How to Play */}
        <div className="mt-12 bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">How to Play</h2>
          <div className="grid md:grid-cols-2 gap-6 text-gray-600">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Teams</h3>
              <p>
                Two teams compete: Red and Blue. Each team has one Spymaster and
                one or more Operatives.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">The Board</h3>
              <p>
                25 words are displayed. Each word belongs to Red, Blue, is
                neutral, or is the Assassin.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Giving Clues</h3>
              <p>
                Spymasters give one-word clues and a number indicating how many
                words relate to that clue.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Winning</h3>
              <p>
                Find all your team's words first to win. But beware the
                Assassin - guess it and you lose!
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

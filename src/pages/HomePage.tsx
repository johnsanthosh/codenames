import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, get } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { generateRoomCode } from '../utils/generateRoomCode';
import { isAdmin } from '../utils/isAdmin';
import type { Room } from '../types';
import { cn } from '../utils/cn';
import { motion } from 'framer-motion';

export function HomePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const userIsAdmin = isAdmin(user?.email);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative backdrop-blur-md bg-slate-900/50 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Codenames" className="w-10 h-10 rounded-lg" />
            <h1 className="text-2xl font-bold text-white">CODENAMES</h1>
          </div>
          <div className="flex items-center gap-4">
            {userIsAdmin && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/admin')}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-purple-500/25 cursor-pointer"
              >
                Admin
              </motion.button>
            )}
            <div className="flex items-center gap-3">
              {user?.photoURL && (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-10 h-10 rounded-full ring-2 ring-white/20"
                />
              )}
              <div className="text-right">
                <p className="text-sm font-medium text-white">
                  {user?.displayName}
                </p>
                <button
                  onClick={signOut}
                  className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-5xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className={cn(
            'grid gap-8',
            userIsAdmin ? 'md:grid-cols-2' : 'max-w-md mx-auto'
          )}
        >
          {/* Create Room - Admin Only */}
          {userIsAdmin && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="backdrop-blur-xl bg-white/5 rounded-3xl p-8 border border-white/10 shadow-2xl"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/25">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Create a Game
              </h2>
              <p className="text-slate-400 mb-6">
                Start a new game and invite your friends with a room code.
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={createRoom}
                disabled={isCreating}
                className={cn(
                  'w-full py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-200 cursor-pointer',
                  'bg-gradient-to-r from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25',
                  'hover:shadow-xl hover:shadow-blue-500/30',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                    />
                    Creating...
                  </span>
                ) : (
                  'Create New Game'
                )}
              </motion.button>
            </motion.div>
          )}

          {/* Join Room */}
          <motion.div
            initial={{ opacity: 0, x: userIsAdmin ? 20 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="backdrop-blur-xl bg-white/5 rounded-3xl p-8 border border-white/10 shadow-2xl"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-red-500/25">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Join a Game
            </h2>
            <p className="text-slate-400 mb-6">
              Enter a room code to join an existing game.
            </p>
            <div className="space-y-4">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                maxLength={6}
                className={cn(
                  'w-full py-4 px-6 rounded-2xl text-center text-2xl font-mono tracking-[0.3em] uppercase',
                  'bg-white/10 border border-white/20 text-white placeholder-slate-500',
                  'focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none',
                  'transition-all duration-200'
                )}
              />
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={joinRoom}
                disabled={isJoining || !joinCode.trim()}
                className={cn(
                  'w-full py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-200 cursor-pointer',
                  'bg-gradient-to-r from-red-500 to-orange-500 shadow-lg shadow-red-500/25',
                  'hover:shadow-xl hover:shadow-red-500/30',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isJoining ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                    />
                    Joining...
                  </span>
                ) : (
                  'Join Game'
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 backdrop-blur-xl bg-red-500/20 border border-red-500/30 rounded-2xl text-red-200 text-center max-w-md mx-auto"
          >
            {error}
          </motion.div>
        )}

        {/* How to Play */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 backdrop-blur-xl bg-white/5 rounded-3xl p-8 border border-white/10"
        >
          <h2 className="text-2xl font-bold text-white mb-6 text-center">How to Play</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: '👥',
                title: 'Teams',
                desc: 'Two teams compete: Red and Blue. Each has a Spymaster and Operatives.',
              },
              {
                icon: '🎯',
                title: 'The Board',
                desc: '25 words displayed. Each belongs to Red, Blue, neutral, or the Assassin.',
              },
              {
                icon: '💡',
                title: 'Giving Clues',
                desc: 'Spymasters give one-word clues and a number for how many words relate.',
              },
              {
                icon: '🏆',
                title: 'Winning',
                desc: 'Find all your words first! But beware the Assassin - guess it and you lose!',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl mb-3">{item.icon}</div>
                <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}

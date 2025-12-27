import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';

export function LoginPage() {
  const { user, isLoading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !isLoading) {
      navigate('/');
    }
  }, [user, isLoading, navigate]);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-team" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Logo/Title */}
        <div>
          <h1 className="text-5xl font-bold text-gray-900 tracking-tight">
            CODENAMES
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            The ultimate word association game
          </p>
        </div>

        {/* Game Preview */}
        <div className="flex justify-center gap-2 my-8">
          <div className="w-16 h-16 bg-red-team rounded-lg shadow-lg" />
          <div className="w-16 h-16 bg-blue-team rounded-lg shadow-lg" />
          <div className="w-16 h-16 bg-neutral-card rounded-lg shadow-lg" />
          <div className="w-16 h-16 bg-assassin rounded-lg shadow-lg" />
        </div>

        {/* Sign In Button */}
        <button
          onClick={handleSignIn}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border border-gray-300 rounded-xl shadow-sm hover:shadow-md hover:bg-gray-50 transition-all duration-200"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span className="text-gray-700 font-medium">
            Sign in with Google
          </span>
        </button>

        <p className="text-sm text-gray-500">
          Sign in to create or join game rooms
        </p>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { ClipboardCheck, Eye, EyeOff, Loader, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AuthPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { user, signIn, signUp, resetPassword } = useAuth();

  // Redirect if already authenticated
  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let result;
      if (isSignUp) {
        result = await signUp(email, password, fullName);
        if (!result.error) {
          setSuccess('Account created! Please check your email to verify your account.');
        }
      } else {
        result = await signIn(email, password);
      }

      if (result.error) {
        setError(result.error.message);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await resetPassword(email);
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Password reset email sent! Check your inbox.');
      }
    } catch (err) {
      setError('Failed to send password reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
              <ClipboardCheck className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">
            CheckinAI
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            AI-powered client check-in analysis and coaching platform
          </p>
        </div>

        {/* Auth Form */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="mb-6">
            <div className="flex rounded-lg bg-slate-100 dark:bg-slate-700 p-1">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  !isSignUp
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  isSignUp
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Sign Up
              </button>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-green-700 dark:text-green-300 text-sm">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                  placeholder="Enter your full name"
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
              )}
            </button>
          </form>

          {!isSignUp && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Forgot your password?
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Secure client check-in management with AI insights
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
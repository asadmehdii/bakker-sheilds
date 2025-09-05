import React from 'react';
import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import CheckinAIApp from './pages/CheckinAIApp';
import CheckinDetailPage from './pages/CheckinDetailPage';
import AuthPage from './pages/AuthPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import ClientsDashboard from './pages/ClientsDashboard';
import ClientProfile from './pages/ClientProfile';
import ClientForm from './pages/ClientForm';
import { logService } from './lib/supabase';

function App() {
  useEffect(() => {
    // Global error handler for unhandled errors
    const handleError = (event: ErrorEvent) => {
      logService.logError(new Error(event.message), 'frontend', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        url: window.location.href
      });
    };

    // Global handler for unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logService.logError(
        new Error(`Unhandled Promise Rejection: ${event.reason}`), 
        'frontend',
        {
          reason: event.reason,
          url: window.location.href
        }
      );
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/account-settings" element={
              <ProtectedRoute>
                <AccountSettingsPage />
              </ProtectedRoute>
            } />
            {/* Clients Routes - Primary Interface */}
            <Route path="/" element={
              <ProtectedRoute>
                <ClientsDashboard />
              </ProtectedRoute>
            } />
            <Route path="/clients" element={
              <ProtectedRoute>
                <ClientsDashboard />
              </ProtectedRoute>
            } />
            <Route path="/clients/new" element={
              <ProtectedRoute>
                <ClientForm />
              </ProtectedRoute>
            } />
            <Route path="/client/:clientId" element={
              <ProtectedRoute>
                <ClientProfile />
              </ProtectedRoute>
            } />
            <Route path="/client/:clientId/edit" element={
              <ProtectedRoute>
                <ClientForm />
              </ProtectedRoute>
            } />
            
            {/* Check-ins Routes */}
            <Route path="/checkin/:checkinId" element={
              <ProtectedRoute>
                <CheckinDetailPage />
              </ProtectedRoute>
            } />
            
            {/* Legacy Check-ins View - still available but not primary */}
            <Route path="/checkins" element={
              <ProtectedRoute>
                <CheckinAIApp />
              </ProtectedRoute>
            } />
            <Route path="/checkins/client/:clientId" element={
              <ProtectedRoute>
                <CheckinAIApp />
              </ProtectedRoute>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
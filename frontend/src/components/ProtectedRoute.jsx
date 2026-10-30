import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="flex h-dvh items-center justify-center bg-canvas text-ink-muted"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center gap-2">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand-600" aria-hidden="true" />
          Loading...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Carry the intended route to /login so a successful sign-in returns the
    // user exactly where they were heading (Login reads location.state.from).
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

export default ProtectedRoute;

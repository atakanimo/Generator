import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/hooks';
import { GetAuthState } from '@/store';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, checking } = useAppSelector(GetAuthState);
  const location = useLocation();

  if (checking) return null;
  if (!isAuthenticated) return <Navigate to='/login' replace state={{ from: location.pathname }} />;
  return <>{children}</>;
};

export default ProtectedRoute;

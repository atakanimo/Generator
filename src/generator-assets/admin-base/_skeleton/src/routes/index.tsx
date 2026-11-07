import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './guards/ProtectedRoute';
import { ProtectedRoutes } from './routes';
import Login from '@/pages/Login';
import MainLayout from '@/layout/MainLayout';
import { useAppSelector } from '@/hooks';
import { GetAuthState } from '@/store';
import { APP_CONFIG } from '@/config/app';

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAppSelector(GetAuthState);
  const location = useLocation();
  /** `ProtectedRoute`'un `/login`'e gönderdiği sayfa; varsayılan `APP_CONFIG.homePath`. */
  const from = (location.state as { from?: string } | null)?.from;
  const afterLogin = from && from !== '/login' ? from : APP_CONFIG.homePath;

  return (
    <Routes>
      <Route path='/login' element={isAuthenticated ? <Navigate to={afterLogin} replace /> : <Login />} />

      {ProtectedRoutes.map(route => (
        <Route
          key={route.path}
          path={route.path}
          element={
            <ProtectedRoute>
              <MainLayout>
                <route.element />
              </MainLayout>
            </ProtectedRoute>
          }
        />
      ))}

      <Route path='*' element={<Navigate to={APP_CONFIG.homePath} replace />} />
    </Routes>
  );
};

export default AppRoutes;

import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useAppDispatch, useAppSelector } from './redux';
import { toggleTheme } from '@/store/slices/theme.slice';
import { useMediaQuery } from '@mui/material';

export const DRAWER_WIDTH = 304;

/**
 * Custom hook that provides theme-related functionality
 * @returns Object containing theme, current mode, and toggle function
 */
export const useTheme = () => {
  const muiTheme = useMuiTheme();
  const dispatch = useAppDispatch();
  const { mode } = useAppSelector(state => state.theme);

  const handleToggleTheme = () => {
    dispatch(toggleTheme());
  };

  return {
    theme: muiTheme,
    mode,
    toggleTheme: handleToggleTheme,
    isDark: mode === 'dark',
    isLight: mode === 'light'
  };
};

export const useIsSmallScreen = () => {
  const { theme } = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
};

export const useIsMediumScreen = () => {
  const { theme } = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
};

export const useIsMobile = () => {
  const { theme } = useTheme();
  return useMediaQuery(theme.breakpoints.down('lg'));
};

export const AVAILABLE_WIDTH = (isMobile: boolean, isDrawerOpen: boolean) => {
  return isMobile
    ? window.innerWidth - 64 // Mobile: sadece padding
    : isDrawerOpen
    ? window.innerWidth - DRAWER_WIDTH - 64 // Desktop açık: drawer + padding
    : window.innerWidth - 64; // Desktop kapalı: sadece padding
};

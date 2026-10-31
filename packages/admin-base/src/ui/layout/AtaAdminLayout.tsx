import { useState, type ComponentType, type ReactNode } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { AccountCircle, Brightness4, Brightness7, Language, Logout, Menu as MenuIcon, Sync } from '@mui/icons-material';
import { NavLink } from 'react-router-dom';
import { adminBaseTexts, fallbackTranslate, type AdminTextKey, type Translate } from '../texts.js';

export const ATA_DRAWER_WIDTH = 304;
export const ATA_TOOLBAR_HEIGHT = 64;

export interface AtaAdminNavItem {
  /** React key; verilmezse `path`. */
  id?: string;
  path: string;
  label: string;
  icon: ComponentType<{ fontSize?: 'small' }>;
  /** NavLink `end`: yalnız tam eşleşmede aktif. */
  end?: boolean;
}

export interface AtaAdminLayoutProps {
  /** App bar başlığı. */
  title: ReactNode;
  navItems: readonly AtaAdminNavItem[];
  /** Sidebar üst satırı (ör. ortam etiketi); varsayılan `Sync` ikonu + `title`. */
  sidebarTitle?: ReactNode;
  /** Sidebar alt satırı (ör. `v1.2.3`); verilmezse satır gösterilmez. */
  version?: string;
  user?: { email?: string | null; roleLabel?: string } | null;
  onLogout: () => void;
  onToggleLanguage?: () => void;
  onToggleTheme?: () => void;
  themeMode?: 'light' | 'dark';
  /** Kontrollü drawer (host state'i, ör. redux). Verilmezse layout kendi tutar. */
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  /** Host'un i18next `t`'si; anahtarlar `ataAdmin.layout*`. */
  t?: Translate;
  children?: ReactNode;
}

const labelBase = { fontSize: '0.9375rem', lineHeight: '1.375rem' } as const;

/**
 * Admin kabuğu: sabit app bar, drawer (lg altı temporary), tam yükseklik `main`.
 * `main` her zaman dikey kayar; sayfaların md+ ekranı doldurması `AtaAdminPage` sözleşmesiyle olur.
 */
export function AtaAdminLayout(props: AtaAdminLayoutProps) {
  const { title, navItems, sidebarTitle, version, user, onLogout, onToggleLanguage, onToggleTheme, themeMode, t = fallbackTranslate, children } = props;
  const text = (key: AdminTextKey) => t(`ataAdmin.${key}`, { defaultValue: adminBaseTexts.ataAdmin[key] });
  const theme = useTheme();
  // noSsr: ilk render'da gerçek değer (yoksa mobilde iç state drawer'ı açık başlatır)
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'), { noSsr: true });
  const [ownOpen, setOwnOpen] = useState(() => !isMobile);
  const drawerOpen = props.drawerOpen ?? ownOpen;
  const setDrawerOpen = (open: boolean) => {
    setOwnOpen(open);
    props.onDrawerOpenChange?.(open);
  };
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const userMenuOpen = Boolean(anchorEl);
  const email = user?.email ?? null;
  const initial = email ? email.charAt(0).toUpperCase() : <AccountCircle />;
  const roleLabel = user?.roleLabel ?? text('layoutAdminUser');

  const handleLogout = () => {
    setAnchorEl(null);
    onLogout();
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', '@supports (height: 100dvh)': { height: '100dvh' }, width: '100%', m: 0, overflow: 'hidden' }}>
      <AppBar
        position='fixed'
        elevation={0}
        sx={{
          zIndex: z => z.zIndex.drawer + 1,
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen
          }),
          ...(drawerOpen &&
            !isMobile && {
              marginLeft: `${ATA_DRAWER_WIDTH}px`,
              width: `calc(100% - ${ATA_DRAWER_WIDTH}px)`,
              transition: theme.transitions.create(['width', 'margin'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen
              })
            })
        }}
      >
        <Toolbar sx={{ minHeight: ATA_TOOLBAR_HEIGHT, pl: { xs: 2, sm: 3 }, pr: 2 }}>
          <IconButton color='inherit' edge='start' onClick={() => setDrawerOpen(!drawerOpen)} aria-label={text('layoutNavigation')} sx={{ mr: 1.5 }}>
            <MenuIcon />
          </IconButton>
          <Typography noWrap component='div' sx={{ color: 'inherit', flexGrow: 1, fontSize: '1.0625rem', lineHeight: '1.5rem', fontWeight: 600 }}>
            {title}
          </Typography>
          {onToggleLanguage ? (
            <IconButton color='inherit' onClick={onToggleLanguage} aria-label={text('layoutToggleLanguage')}>
              <Language />
            </IconButton>
          ) : null}
          {onToggleTheme ? (
            <IconButton color='inherit' onClick={onToggleTheme} aria-label={text('layoutToggleTheme')}>
              {themeMode === 'dark' ? <Brightness7 /> : <Brightness4 />}
            </IconButton>
          ) : null}
          <IconButton
            onClick={e => setAnchorEl(e.currentTarget)}
            sx={{ ml: 0.5 }}
            aria-controls={userMenuOpen ? 'ata-admin-user-menu' : undefined}
            aria-haspopup='true'
            aria-expanded={userMenuOpen ? 'true' : undefined}
            aria-label={text('layoutUserMenu')}
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.dark', fontSize: 14 }}>{initial}</Avatar>
          </IconButton>
        </Toolbar>
      </AppBar>

      <Menu
        id='ata-admin-user-menu'
        anchorEl={anchorEl}
        open={userMenuOpen}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { elevation: 3, sx: { mt: 1.5, minWidth: 220 } } }}
      >
        <MenuItem disabled sx={{ opacity: '1 !important', cursor: 'default' }}>
          <Avatar sx={{ width: 32, height: 32, mr: 1.5, bgcolor: 'primary.main' }}>{initial}</Avatar>
          <Box>
            <Typography component='div' sx={{ ...labelBase, fontWeight: 600 }}>
              {roleLabel}
            </Typography>
            <Typography component='div' sx={{ ...labelBase, color: 'text.secondary' }}>
              {email || '—'}
            </Typography>
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <Logout fontSize='small' sx={{ mr: 1.5 }} />
          {text('layoutLogout')}
        </MenuItem>
      </Menu>

      <Drawer
        variant={isMobile ? 'temporary' : 'persistent'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: ATA_DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: ATA_DRAWER_WIDTH, boxSizing: 'border-box', borderRight: 1, borderColor: 'divider' }
        }}
      >
        <Box component='nav' aria-label={text('layoutNavigation')} sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <Toolbar sx={{ gap: 1, minHeight: ATA_TOOLBAR_HEIGHT }}>
            {sidebarTitle ?? (
              <>
                <Sync color='primary' />
                <Typography component='div' sx={{ fontSize: '1.0625rem', lineHeight: '1.5rem', fontWeight: 700, color: 'primary.main' }}>
                  {title}
                </Typography>
              </>
            )}
          </Toolbar>
          <Divider />

          {email ? (
            <>
              <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main' }}>{initial}</Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component='div' noWrap sx={{ ...labelBase, fontWeight: 600 }}>
                    {roleLabel}
                  </Typography>
                  <Typography component='div' noWrap sx={{ ...labelBase, color: 'text.secondary' }}>
                    {email}
                  </Typography>
                </Box>
              </Box>
              <Divider />
            </>
          ) : null}

          <List disablePadding sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <ListItemButton
                  key={item.id ?? item.path}
                  component={NavLink}
                  to={item.path}
                  end={item.end}
                  // Dar ekranda drawer sayfayı kaplar: gezinince kapat
                  onClick={() => (isMobile ? setDrawerOpen(false) : undefined)}
                  sx={{
                    mx: 1,
                    mb: 0.25,
                    borderRadius: 1,
                    py: 1.25,
                    '&.active': {
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': { bgcolor: 'primary.dark' },
                      '& .MuiListItemIcon-root': { color: 'primary.contrastText' }
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Icon fontSize='small' />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    slotProps={{ primary: { sx: { fontSize: '1rem', fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word' } } }}
                  />
                </ListItemButton>
              );
            })}
          </List>

          {version ? (
            <>
              <Divider />
              <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                <Typography component='span' sx={{ ...labelBase, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {version}
                </Typography>
              </Box>
            </>
          ) : null}
        </Box>
      </Drawer>

      <Box
        component='main'
        sx={{
          flexGrow: 1,
          width: '100%',
          minWidth: 0,
          minHeight: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          p: { xs: 2, sm: 3 },
          paddingTop: { xs: `calc(${ATA_TOOLBAR_HEIGHT}px + 16px)`, sm: `calc(${ATA_TOOLBAR_HEIGHT}px + 24px)` },
          bgcolor: 'background.default',
          // Sözleşme: main her zaman dikey kayar (md altında sayfa doğal yüksekliğinde uzar), yatay taşma yok
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          transition: theme.transitions.create('margin', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen
          }),
          marginLeft: isMobile ? 0 : drawerOpen ? 0 : `-${ATA_DRAWER_WIDTH}px`
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

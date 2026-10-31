import { Box, type BoxProps, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * Scroll sözleşmesi (AtaAdminLayout `main` ile birlikte):
 * - md+: sayfa `main`'i doldurur, uzun içerik (tablo, log paneli) kendi içinde kayar.
 * - md altı: sayfa doğal yüksekliğinde uzar, `main` kayar. Filtreler tek sütuna dizildiğinde tablo kırpılmaz.
 */
export const ataAdminPageSx = {
  display: 'flex',
  flexDirection: 'column',
  flex: { xs: '1 0 auto', md: 1 },
  minHeight: { xs: 'auto', md: 0 },
  minWidth: 0,
  width: '100%',
  overflow: { xs: 'visible', md: 'hidden' }
} as const;

/** Uzun içerikli sayfa (dashboard, form): her ekranda doğal yüksekliğinde uzar, `main` kayar. */
export const ataAdminScrollPageSx = {
  display: 'flex',
  flexDirection: 'column',
  flex: '1 0 auto',
  minWidth: 0,
  width: '100%'
} as const;

/** Sayfanın kalan yüksekliğini dolduran blok (tablo, log listesi): md+ esner, md altında sabit yükseklik. */
export const ataAdminFillSx = {
  flex: { xs: 'none', md: 1 },
  height: { xs: '75vh', md: 'auto' },
  minHeight: 0,
  minWidth: 0,
  width: '100%',
  display: 'flex',
  flexDirection: 'column'
} as const;

export type AtaAdminFillProps = { children?: ReactNode; sx?: SxProps<Theme> } & Omit<BoxProps, 'children' | 'sx'>;

export type AtaAdminPageProps = AtaAdminFillProps & {
  /** `true` (varsayılan): md+ ekranı doldurur, içerik içeride kayar. `false`: her ekranda uzar, `main` kayar. */
  fill?: boolean;
};

/** Admin sayfa gövdesi; `sx` ile boşluk (varsayılan `gap: 2`) vb. değişir, scroll sözleşmesi ezilmez. */
export function AtaAdminPage({ children, sx, fill = true, ...rest }: AtaAdminPageProps) {
  return (
    <Box {...rest} sx={[{ gap: 2 }, ...(Array.isArray(sx) ? sx : [sx]), fill ? ataAdminPageSx : ataAdminScrollPageSx]}>
      {children}
    </Box>
  );
}

/** `ataAdminFillSx` uygulanmış kutu. */
export function AtaAdminFill({ children, sx, ...rest }: AtaAdminFillProps) {
  return (
    <Box {...rest} sx={[ataAdminFillSx, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </Box>
  );
}

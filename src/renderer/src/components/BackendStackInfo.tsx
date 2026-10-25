import { useState, type MouseEvent } from 'react';
import { Box, Chip, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import type { BackendStackInfo, StackFileOwner } from '@shared/backendStacks';

const OWNER_COLOR: Record<StackFileOwner, 'primary' | 'success' | 'default'> = { G: 'primary', K: 'success', asset: 'default' };
const OWNER_HELP = 'G: Generator her generate\'te yeniden yazar · K: bir kez oluşturulur, sonra sizin · asset: Generator core dosyası, yoksa yazılır';

/** Info icon next to a "Yeni … projesi" button: folder tree (G / K / asset), technologies, run commands, doc (PY9). */
const BackendStackInfoButton = ({ info }: { info: BackendStackInfo }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { label, summary, technologies, tree, placeholders, runCommands, doc } = info;

  return (
    <>
      <Tooltip title={`${label}: yapı ve teknolojiler`}>
        <IconButton size='small' aria-label={`${label} bilgi`} onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}>
          <InfoOutlined fontSize='small' />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 2, maxWidth: 640, maxHeight: '80vh' } } }}
      >
        <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
          {summary}
        </Typography>

        <Typography variant='subtitle2'>Teknolojiler</Typography>
        <Box component='table' sx={{ mb: 1.5, borderSpacing: 0, '& td': { py: 0.25, pr: 2, verticalAlign: 'top', fontSize: 13 } }}>
          <tbody>
            {technologies.map(({ label: name, value }) => (
              <tr key={name}>
                <Box component='td' sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  {name}
                </Box>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </Box>

        <Typography variant='subtitle2'>Klasör yapısı</Typography>
        <Typography variant='caption' color='text.secondary' component='div' sx={{ mb: 0.5 }}>
          {OWNER_HELP}. {placeholders}.
        </Typography>
        <Box sx={{ mb: 1.5, fontFamily: 'monospace', fontSize: 12 }}>
          {tree.map(({ depth, name, owner, note }) => (
            <Box key={`${depth}:${name}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: depth * 2, minHeight: 22 }}>
              <span>{name}</span>
              {owner && <Chip size='small' label={owner} color={OWNER_COLOR[owner]} variant='outlined' sx={{ height: 18, fontSize: 11 }} />}
              {note && (
                <Typography variant='caption' color='text.secondary'>
                  {note}
                </Typography>
              )}
            </Box>
          ))}
        </Box>

        <Typography variant='subtitle2'>Kurulumdan sonra</Typography>
        <Box component='pre' sx={{ mt: 0.5, mb: 1.5, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: 12, overflowX: 'auto' }}>
          {runCommands.map(({ command, comment }) => `${command}${comment ? `   # ${comment}` : ''}`).join('\n')}
        </Box>

        <Typography variant='body2'>
          Ayrıntı: <code>{doc}</code> (Generator reposu)
        </Typography>
      </Popover>
    </>
  );
};

export default BackendStackInfoButton;

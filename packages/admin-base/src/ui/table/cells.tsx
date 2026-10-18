import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Box, IconButton, Link, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import type { FieldConfig } from '../../schema/fields.js';
import { relationLabel } from '../../schema/relation.js';
import type { ResourceSchema } from '../../schema/resource.js';
import { formatDateTime, isEmptyValue, shortId, valueSummary } from '../format.js';
import { fieldLabelKey, useAdminTexts } from '../useAdminTexts.js';

const cellTextSx = { fontSize: '0.875rem', minWidth: 0 } as const;

function EmptyCell() {
  return (
    <Typography sx={{ ...cellTextSx, color: 'text.disabled' }} component='span'>
      –
    </Typography>
  );
}

function TextCell({ text }: { text: string }) {
  return (
    <Typography sx={cellTextSx} noWrap title={text} component='span'>
      {text}
    </Typography>
  );
}

/** `component: 'image'`: küçük resim; URL başlıkta. */
function ImageCell({ url }: { url: string }) {
  return (
    <Box component='img' src={url} alt='' title={url}
      sx={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 0.5, display: 'block' }} />
  );
}

export function IdCell({ id }: { id: string }) {
  const { text } = useAdminTexts();
  const [status, setStatus] = useState<'idle' | 'copied' | 'copyFailed'>('idle');
  if (!id) return <EmptyCell />;
  const label = status === 'idle' ? text('copy') : text(status);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <Typography sx={cellTextSx} noWrap title={id} component='span'>
        {shortId(id)}
      </Typography>
      <Tooltip title={label} onClose={() => setStatus('idle')}>
        <IconButton
          size='small'
          aria-label={text('copy')}
          onClick={event => {
            event.stopPropagation();
            // Pencere odakta değilse ya da izin yoksa `writeText` reddeder; yakalanmamış hata bırakma.
            Promise.resolve()
              .then(() => navigator.clipboard.writeText(id))
              .then(() => setStatus('copied'), () => setStatus('copyFailed'));
          }}
        >
          <ContentCopyIcon fontSize='inherit' />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export interface ValueCellProps {
  resource: ResourceSchema;
  field: FieldConfig;
  value: unknown;
  onOpenJson: (title: string, value: unknown) => void;
}

/** Alan türüne göre varsayılan hücre; `extensions.fields.<ad>.cell` bunun yerine geçebilir. */
export function ValueCell({ resource, field, value, onOpenJson }: ValueCellProps) {
  const { enumLabel, fieldLabel, text } = useAdminTexts();
  if (isEmptyValue(value)) return <EmptyCell />;
  const list = Array.isArray(value) ? value : [value];

  switch (field.kind) {
    case 'relation':
      return <TextCell text={list.map(v => relationLabel(v, field)).join(', ')} />;
    case 'enum':
      return <TextCell text={list.map(v => enumLabel(resource, field.name, String(v))).join(', ')} />;
    case 'boolean':
      return value ? <CheckIcon fontSize='small' color='success' /> : <CloseIcon fontSize='small' color='disabled' />;
    case 'datetime':
      return <TextCell text={list.map(formatDateTime).join(', ')} />;
    case 'object':
    case 'map':
    case 'json':
      return (
        <Link
          component='button'
          underline='hover'
          sx={{ ...cellTextSx, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onClick={event => {
            event.stopPropagation();
            onOpenJson(fieldLabel(fieldLabelKey(resource, [field.name]), field), value);
          }}
        >
          {valueSummary(value, count => text('itemCount', { count }))}
        </Link>
      );
    default:
      if (field.component === 'image' && typeof value === 'string') return <ImageCell url={value} />;
      return <TextCell text={list.map(String).join(', ')} />;
  }
}

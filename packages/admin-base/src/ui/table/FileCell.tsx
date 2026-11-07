import { Box, Link } from '@mui/material';
import { useState, type MouseEvent } from 'react';
import { useResourceApi, useResourceFileUrl } from '../../react/hooks.js';
import type { AnyResource, FilePreviewOptions } from '../../schema/extend.js';

export interface FileCellProps {
  resource: AnyResource;
  row: { id: string } & Record<string, unknown>;
  /** Gösterilen dosya adı (alan değeri). */
  name: string;
  options: FilePreviewOptions<any>;
}

/** Dosya adı + isteğe bağlı küçük resim; ada tıklamak dosyayı yeni sekmede açar (`extensions.fields.<ad>.file`). */
export function FileCell({ resource, row, name, options }: FileCellProps) {
  const api = useResourceApi(resource);
  const { path, thumbnailVariant, openVariant } = options;
  const wantsThumbnail = Boolean(thumbnailVariant) && (options.hasThumbnail?.(row) ?? true);
  // Küçük resim yüklenemezse (süre doldu ya da küçük resim yok) bir kez açılan varyanta düşülür; o da olmazsa gizlenir.
  const [stage, setStage] = useState<'thumbnail' | 'fallback' | 'hidden'>('thumbnail');
  const variant = stage === 'thumbnail' ? thumbnailVariant : openVariant;
  const { data: url } = useResourceFileUrl(resource, row.id, { path, variant }, { enabled: wantsThumbnail && stage !== 'hidden' });

  const open = (event: MouseEvent) => {
    event.stopPropagation();
    // Pencere tıklama anında açılır: await sonrası açılan pencereyi tarayıcı engelleyebilir. noopener verilince null döner;
    // bazı gömülü tarayıcılar sekmeyi açıp yine null döner, o zaman adres gelince açılır.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    api.fileUrl(row.id, { path, variant: openVariant }).then(
      next => {
        if (!next) win?.close();
        else if (win) win.location.href = next;
        else window.open(next, '_blank', 'noopener');
      },
      // Hata host interceptor'ında toast olarak gösterildi.
      () => win?.close()
    );
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%', minWidth: 0 }}>
      {wantsThumbnail && url && stage !== 'hidden' ? (
        <Box component='img' src={url} alt={name}
          onError={() => setStage(stage === 'thumbnail' && openVariant !== thumbnailVariant ? 'fallback' : 'hidden')}
          sx={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }} />
      ) : null}
      <Link component='button' variant='body2' underline='hover' onClick={open} title={name}
        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
        {name}
      </Link>
    </Box>
  );
}

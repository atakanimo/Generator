import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { FormProvider, useForm } from 'react-hook-form';
import type { AnyResource } from '../../schema/extend.js';
import { useAdminTexts } from '../useAdminTexts.js';
import { FormFields } from './FormFields.js';
import { formValuesToBody, initialFormValues, type FormMode } from './values.js';
import { useAtaAdmin } from '../../react/context.js';

export interface ResourceFormDrawerProps {
  resource: AnyResource;
  open: boolean;
  mode: FormMode;
  /** Edit'te satır (populate edilmiş ilişkiler dahil). */
  row?: Record<string, unknown>;
  onClose: () => void;
  /** Hata fırlatırsa form açık kalır; mesajı host interceptor'ı toast olarak gösterir. */
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
}

/** Create / edit formu — sağdan açılan Drawer (karar 16.10.2026). */
export function ResourceFormDrawer(props: ResourceFormDrawerProps) {
  return (
    // Modal form: above host app bars (they often sit at `zIndex.drawer + 1` for a clipped side menu).
    <Drawer anchor='right' open={props.open} onClose={props.onClose} sx={{ zIndex: theme => theme.zIndex.modal }}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 } } } }}>
      {props.open ? <FormBody {...props} /> : null}
    </Drawer>
  );
}

function FormBody({ resource, mode, row, onClose, onSubmit }: ResourceFormDrawerProps) {
  const texts = useAdminTexts();
  const { getCurrentUserId } = useAtaAdmin();
  const methods = useForm({ defaultValues: initialFormValues(resource.fields, mode, row, { getCurrentUserId }) });
  const { isSubmitting } = methods.formState;

  const submit = methods.handleSubmit(async values => {
    try {
      await onSubmit(formValuesToBody(resource.fields, values, mode));
      onClose();
    } catch {
      // API hatası: host interceptor toast gösterir, girilen veri korunur.
    }
  });

  const title = texts.text(mode === 'create' ? 'createTitle' : 'editTitle', { resource: texts.resourceTitle(resource) });

  return (
    <FormProvider {...methods}>
      <Box component='form' noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction='row' alignItems='center' sx={{ px: 2, py: 1.5 }}>
          <Typography sx={{ flex: 1, fontSize: '1.125rem', fontWeight: 600 }}>{title}</Typography>
          <IconButton size='small' onClick={onClose} aria-label={texts.text('close')}>
            <CloseIcon fontSize='small' />
          </IconButton>
        </Stack>
        <Divider />
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <FormFields resource={resource} fields={resource.fields} mode={mode} />
        </Box>
        <Divider />
        <Stack direction='row' spacing={1} justifyContent='flex-end' sx={{ px: 2, py: 1.5 }}>
          <Button variant='text' onClick={onClose}>
            {texts.text('cancel')}
          </Button>
          <Button variant='contained' type='submit' disabled={isSubmitting}>
            {texts.text('save')}
          </Button>
        </Stack>
      </Box>
    </FormProvider>
  );
}

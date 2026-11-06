import React from 'react';
import { Backdrop, CircularProgress, Typography } from '@mui/material';

const LoadingOverlay: React.FC = () => {
  return (
    <Backdrop
      sx={{
        color: '#fff',
        zIndex: (theme) => theme.zIndex.drawer + 2,
        flexDirection: 'column',
        gap: 2,
      }}
      open={true}
    >
      <CircularProgress color="inherit" />
      <Typography variant="body1" color="inherit">
        Yükleniyor...
      </Typography>
    </Backdrop>
  );
};

export default LoadingOverlay; 
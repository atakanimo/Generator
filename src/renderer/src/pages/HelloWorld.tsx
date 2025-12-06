import { Container, Typography, Box, Paper } from '@mui/material';
import { useAppSelector } from '../store/hooks';

const HelloWorld = () => {
  const appState = useAppSelector((state) => state.app);

  // Log to verify Redux is working
  console.log('Redux Store State:', appState);

  return (
    <Container maxWidth="md">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 3,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            textAlign: 'center',
            bgcolor: 'background.paper',
          }}
        >
          <Typography variant="h3" component="h1" gutterBottom>
            Hello World
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Universal Code Generator
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Redux Store Connected: {appState.initialized ? '✓' : '✗'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Version: {appState.version}
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default HelloWorld;


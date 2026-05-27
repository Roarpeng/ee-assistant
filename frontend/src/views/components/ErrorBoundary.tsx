import { Component, type ReactNode, type ErrorInfo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Best-effort report to backend
    fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
      }),
    }).catch(() => {});
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: 2,
            p: 4,
            bgcolor: 'background.default',
            color: 'text.primary',
          }}
        >
          <Typography variant="h5" fontWeight={600}>
            Something went wrong
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 600, textAlign: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem' }}
          >
            {this.state.error.message}
          </Typography>
          <Button variant="outlined" onClick={this.handleReset}>
            Try Again
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

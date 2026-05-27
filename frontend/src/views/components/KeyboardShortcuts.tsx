import { useState, useEffect, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

const SHORTCUTS = [
  { keys: ['?'], desc: 'Show keyboard shortcuts' },
  { keys: ['Enter'], desc: 'Send message (in chat input)' },
  { keys: ['Shift', 'Enter'], desc: 'New line (in chat input)' },
  { keys: ['Escape'], desc: 'Close dialog / cancel' },
];

export function useKeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only trigger on '?' when not in an input/textarea
    if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { open, setOpen };
}

export function KeyboardShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid="keyboard-shortcuts-dialog">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', fontSize: '0.95rem', fontWeight: 700, pb: 1 }}>
        Keyboard Shortcuts
        <IconButton onClick={onClose} size="small" sx={{ ml: 'auto' }} aria-label="Close shortcuts dialog">
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {SHORTCUTS.map((s, i) => (
          <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: i < SHORTCUTS.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{s.desc}</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {s.keys.map((k) => (
                <Typography
                  key={k}
                  component="kbd"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                    color: 'text.primary',
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {k}
                </Typography>
              ))}
            </Box>
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
}

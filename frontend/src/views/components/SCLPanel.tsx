import { Box, Paper, Typography, Button } from '@mui/material';
import { FileDownload as FileDownloadIcon } from '@mui/icons-material';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import Editor from '@monaco-editor/react';

export function SCLPanel() {
  const code = useStore((s) => s.sclCode);
  const language = useStore((s) => s.language);
  const tr = t(language);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        p: 4,
        borderRadius: 5,
      }}
    >
      {/* Decorative blur */}
      <Box
        sx={(theme) => ({
          position: 'absolute',
          right: -80,
          top: -80,
          width: 320,
          height: 320,
          bgcolor: 'rgba(79, 70, 229, 0.1)',
          borderRadius: '50%',
          filter: 'blur(100px)',
          pointerEvents: 'none',
        })}
      />

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, position: 'relative', zIndex: 10 }}>
        <Box>
          <Box
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.5,
              bgcolor: 'rgba(99, 102, 241, 0.1)',
              border: 1,
              borderColor: 'rgba(99, 102, 241, 0.2)',
              borderRadius: 999,
              mb: 1.5,
            })}
          >
            <Typography
              variant="labelSmall"
              sx={{
                color: 'primary.light',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {tr.scl.target}
            </Typography>
          </Box>
          <Typography variant="headlineMedium" sx={{ fontWeight: 700 }}>
            {tr.scl.title}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="inherit"
          startIcon={<FileDownloadIcon />}
          sx={{
            bgcolor: 'common.white',
            color: 'common.black',
            '&:hover': {
              bgcolor: 'grey.200',
            },
            mt: 4,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {tr.scl.download}
        </Button>
      </Box>

      {/* Monaco Editor container */}
      <Paper
        variant="outlined"
        sx={(theme) => ({
          flex: 1,
          overflow: 'hidden',
          borderRadius: 4,
          position: 'relative',
          zIndex: 10,
          bgcolor: theme.palette.mode === 'dark' ? '#0a0a0a' : 'background.default',
        })}
      >
        <Editor
          height="100%"
          defaultLanguage="pascal"
          value={code}
          theme="vs-dark"
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
          }}
          loading={
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.disabled' }}>
              {tr.scl.loading}
            </Box>
          }
        />
      </Paper>
    </Box>
  );
}

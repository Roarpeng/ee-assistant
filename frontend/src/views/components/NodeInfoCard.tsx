import { Card, CardContent, Typography, Box, Chip, IconButton, alpha } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';

const STATUS_COLORS: Record<string, string> = {
  ok: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
};

export function NodeInfoCard() {
  const topology = useStore((s) => s.topology);
  const previewNodeId = useStore((s) => s.previewNodeId);
  const setPreviewNodeId = useStore((s) => s.setPreviewNodeId);
  const setChatContext = useStore((s) => s.setChatContext);
  const language = useStore((s) => s.language);
  const tr = t(language);

  if (!previewNodeId) return null;

  const node = topology.nodes.find((n) => n.id === previewNodeId);
  if (!node) return null;

  const nodeTypeLabel = (node.type || 'COMPONENT').replace(/_/g, ' ').toUpperCase();
  const statusColor = STATUS_COLORS[node.status || 'ok'] || STATUS_COLORS.ok;

  const handleDetailChat = () => {
    setChatContext({ nodeIds: [node.id], mode: 'single' });
    setPreviewNodeId(null);
  };

  return (
    <Card
      sx={(theme) => ({
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 40,
        width: 288,
        bgcolor: alpha(theme.palette.background.paper, 0.95),
        backdropFilter: 'blur(8px)',
        borderRadius: 3,
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        border: 1,
        borderColor: 'divider',
      })}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: statusColor,
                boxShadow: `0 0 6px ${statusColor}`,
                flexShrink: 0,
              }}
            />
            <Chip
              label={nodeTypeLabel}
              size="small"
              variant="outlined"
              sx={{
                height: 20,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.05em',
                fontFamily: '"JetBrains Mono", monospace',
                borderColor: 'divider',
                color: 'text.disabled',
              }}
            />
          </Box>
          <IconButton
            size="small"
            onClick={() => setPreviewNodeId(null)}
            sx={{ color: 'text.disabled' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Typography variant="titleSmall" sx={{ fontWeight: 700, mb: 1.5 }}>
          {node.label}
        </Typography>

        {node.details && Object.keys(node.details).length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            {Object.entries(node.details)
              .slice(0, 6)
              .map(([k, v]) => (
                <Box
                  key={k}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    py: 0.25,
                  }}
                >
                  <Typography variant="caption" color="text.disabled">
                    {k}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    {v}
                  </Typography>
                </Box>
              ))}
          </Box>
        )}

        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: 'block', mb: 2 }}
        >
          ID: <Box component="code" sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'text.secondary' }}>{node.id}</Box> &middot; ({node.x}, {node.y})
        </Typography>

        <Box
          component="button"
          onClick={handleDetailChat}
          sx={(theme) => ({
            width: '100%',
            py: 1.25,
            px: 2,
            bgcolor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            border: 'none',
            borderRadius: 2,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background-color 200ms',
            '&:hover': {
              bgcolor: theme.palette.primary.dark,
            },
          })}
        >
          {tr.canvas.detailChat}
        </Box>
      </CardContent>
    </Card>
  );
}

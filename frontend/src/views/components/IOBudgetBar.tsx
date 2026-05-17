import { Box, Typography, alpha } from '@mui/material';
import type { BudgetResult } from '../../services/budget';

interface Props {
  budget: BudgetResult | null;
}

const LABELS = {
  di: 'DI',
  do_: 'DO',
  ai: 'AI',
  ao: 'AO',
} as const;

export function IOBudgetBar({ budget }: Props) {
  if (!budget) return null;
  const channels = ['di', 'do_', 'ai', 'ao'] as const;
  return (
    <Box
      sx={(theme) => ({
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        gap: 2,
        bgcolor: alpha(theme.palette.background.paper, 0.9),
        backdropFilter: 'blur(8px)',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        px: 2,
        py: 1.5,
        pointerEvents: 'none',
      })}
      role="status"
      aria-label="I/O budget"
    >
      {channels.map((ch) => {
        const b = budget[ch];
        const pct =
          b.total === 0 ? (b.used > 0 ? 100 : 0) : Math.min(100, (b.used / b.total) * 100);
        const fillColor = b.over
          ? 'error.main'
          : pct > 80
            ? 'warning.main'
            : 'success.main';
        return (
          <Box
            key={ch}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 78 }}
          >
            <Typography
              variant="labelSmall"
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'text.disabled',
                width: 24,
              }}
            >
              {LABELS[ch]}
            </Typography>
            <Box
              sx={(theme) => ({
                flex: 1,
                height: 6,
                bgcolor: theme.palette.surfaceContainerHighest || theme.palette.action.hover,
                borderRadius: 3,
                overflow: 'hidden',
              })}
            >
              <Box
                sx={(theme) => ({
                  height: '100%',
                  borderRadius: 3,
                  width: `${pct}%`,
                  transition: 'width 300ms',
                  bgcolor: fillColor,
                })}
              />
            </Box>
            <Typography
              variant="labelSmall"
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                fontVariantNumeric: 'tabular-nums',
                color: b.over ? 'error.main' : 'text.secondary',
              }}
            >
              {b.used}/{b.total}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

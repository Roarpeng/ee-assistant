import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
} from '@mui/material';

// M2 memory-flywheel hook (Track C):
//   When inline editing of wire spec / terminal / signal lands, call
//   `postEditFeedback(projectId, { target: 'wiring', before, after })`
//   from `services/feedback`. The current WiringPanel is read-only (no
//   inline editor exists), so the hook is intentionally NOT wired here
//   yet — adding edit UI just to fire the hook would be premature.
//   See `docs/superpowers/plans/2026-05-14-memory-flywheel-m2-plan.md`
//   §C4 for the full pattern.
// TODO(memory-M2): wire postEditFeedback when wiring inline-edit lands.

export interface WiringItem {
  tag: string;
  signal: string;
  from: string;
  to: string;
  wire: string;
}

interface Props {
  ioItems: WiringItem[];
}

export function WiringPanel({ ioItems }: Props) {
  if (ioItems.length === 0) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.disabled',
          typography: 'bodyMedium',
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        未生成接线表 — 完成选型后将自动产出 I/O 端子表。
      </Box>
    );
  }
  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }} className="custom-scrollbar">
      <Typography
        variant="labelSmall"
        sx={{
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '0.1em',
          color: 'text.disabled',
          textTransform: 'uppercase',
          mb: 1,
          display: 'block',
        }}
      >
        [ fig.04 ] terminal &middot; wiring list
      </Typography>
      <Typography variant="headlineSmall" sx={{ mb: 3, fontWeight: 700 }}>
        接线表
      </Typography>
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ borderRadius: 2 }}
      >
        <Table size="small" sx={{ fontFamily: '"JetBrains Mono", monospace' }}>
          <TableHead>
            <TableRow
              sx={(theme) => ({
                bgcolor: theme.palette.surfaceContainer || 'action.hover',
                '& th': {
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'text.secondary',
                  fontWeight: 700,
                  fontSize: 11,
                  px: 2,
                  py: 1.5,
                },
              })}
            >
              <TableCell>Tag</TableCell>
              <TableCell>Signal</TableCell>
              <TableCell>From</TableCell>
              <TableCell>To</TableCell>
              <TableCell>Wire</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ioItems.map((item, idx) => (
              <TableRow
                key={`${item.tag}-${idx}`}
                sx={{
                  bgcolor: idx % 2 === 0 ? 'background.paper' : 'action.hover',
                  '& td': {
                    px: 2,
                    py: 1,
                    fontSize: 12,
                    fontFamily: '"JetBrains Mono", monospace',
                    borderBottom: 1,
                    borderColor: 'divider',
                  },
                }}
              >
                <TableCell>{item.tag}</TableCell>
                <TableCell>{item.signal}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>
                  {item.from}
                </TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>
                  {item.to}
                </TableCell>
                <TableCell sx={{ color: 'text.disabled' }}>
                  {item.wire}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

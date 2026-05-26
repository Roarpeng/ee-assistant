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
  Button,
  Chip,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { downloadWiringExcel } from '../../services/spreadsheet';
import { t } from '../../services/i18n';
import { useStore } from '../../models/store';

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
  const language = useStore((s) => s.language);
  const project = useStore((s) => s.project);
  const tr = t(language);

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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2 }}>
        <Typography variant="headlineSmall" sx={{ fontWeight: 700 }}>
          接线表
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Chip label={tr.wiring.rowCount(ioItems.length)} size="small" variant="outlined" />
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => {
              const base = (project?.name ?? 'wiring').replace(/[^\w\u4e00-\u9fff-]+/g, '_');
              downloadWiringExcel(ioItems, `${base || 'wiring'}.xlsx`);
            }}
          >
            {tr.wiring.export}
          </Button>
        </Box>
      </Box>
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ borderRadius: 2, maxHeight: 'calc(100% - 120px)' }}
      >
        <Table size="small" stickyHeader sx={{ fontFamily: '"JetBrains Mono", monospace' }}>
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

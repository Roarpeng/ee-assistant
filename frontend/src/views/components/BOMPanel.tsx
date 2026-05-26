import { useState } from 'react';
import {
  FileDownload as FileDownloadIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Info as InfoIcon,
  OpenInNew as OpenInNewIcon,
  ThumbDown as ThumbDownAltIcon,
} from '@mui/icons-material';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Typography,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  alpha,
} from '@mui/material';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import { buildProcurementUrl } from '../../services/procurement';
import {
  postNegativeFeedback,
  postEditFeedback,
  type EditFeedback,
} from '../../services/feedback';
import { MemorySourcePopover } from './MemorySourcePopover';
import { downloadBomExcel } from '../../services/spreadsheet';

/**
 * Maps a BOMItem onto the (category, manufacturer, model) triple the
 * memory-flywheel API expects. We use `name` as the component category
 * because the upstream BOM payload (TopologyPanel.handleConfirmTopology)
 * sets `name` from NODE_TYPE_TO_BOM, e.g. "PLC", "HMI", "变频器".
 */
function bomTriple(item: { name: string; mfg: string; pn: string }) {
  return { category: item.name, manufacturer: item.mfg, model: item.pn };
}

export function BOMPanel() {
  const bomData = useStore((s) => s.bom);
  const project = useStore((s) => s.project);
  const language = useStore((s) => s.language);
  const tr = t(language);

  const [popoverFor, setPopoverFor] = useState<{
    category: string;
    manufacturer: string;
    model: string;
  } | null>(null);
  const [negativeBusyId, setNegativeBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const projectId = project?.id ?? null;

  const q = search.trim().toLowerCase();
  const visibleBom = bomData.filter((item) => {
    if (activeOnly && item.active === false) return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.mfg.toLowerCase().includes(q) ||
      item.pn.toLowerCase().includes(q) ||
      item.specs.toLowerCase().includes(q)
    );
  });

  function handleExportExcel() {
    if (visibleBom.length === 0) return;
    const base = (project?.name ?? 'bom').replace(/[^\w\u4e00-\u9fff-]+/g, '_');
    downloadBomExcel(visibleBom, `${base || 'bom'}.xlsx`);
  }

  // Future-proof: inline BOM-row edits (qty / specs override) should call
  // this helper so they're captured as `bom_edit` decisions for the
  // selection_supervisor. No inline editor exists in BOMPanel today, so
  // this is wired but not yet invoked from any UI element. Track-A's
  // backend route is still in flight, so we swallow errors to avoid
  // breaking the table when the endpoint isn't mounted yet.
  async function recordBomEdit(before: EditFeedback['before'], after: EditFeedback['after']) {
    if (!projectId) return;
    try {
      await postEditFeedback(projectId, { target: 'bom', before, after });
    } catch {
      // Non-fatal — the table itself has already updated locally.
    }
  }
  // Mark intentional unused-export-style retention so tsc --noUnusedLocals
  // (if ever enabled) doesn't strip this scaffolding.
  void recordBomEdit;

  async function handleNegative(item: { id: string; name: string; mfg: string; pn: string }) {
    if (!projectId || negativeBusyId) return;
    setNegativeBusyId(item.id);
    try {
      await postNegativeFeedback(projectId, {
        target: 'bom_row',
        context: bomTriple(item),
      });
    } catch {
      // Non-fatal: backend route may not exist yet during M2 staged rollout.
    } finally {
      setNegativeBusyId(null);
    }
  }

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 4,
        overflow: 'hidden',
        borderRadius: 5,
        position: 'relative',
      }}
    >
      {/* Decorative blur */}
      <Box
        sx={{
          position: 'absolute',
          right: -80,
          bottom: -80,
          width: 320,
          height: 320,
          bgcolor: 'rgba(79, 70, 229, 0.1)',
          borderRadius: '50%',
          filter: 'blur(100px)',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 4,
          position: 'relative',
          zIndex: 10,
        }}
      >
        <Box>
          <Box
            sx={{
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
            }}
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
              {tr.bom.title}
            </Typography>
          </Box>
          <Typography variant="headlineMedium" sx={{ fontWeight: 700 }}>
            {tr.bom.title}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="inherit"
          startIcon={<FileDownloadIcon />}
          disabled={visibleBom.length === 0}
          onClick={handleExportExcel}
          sx={{
            bgcolor: 'common.white',
            color: 'common.black',
            '&:hover': { bgcolor: 'grey.200' },
            mt: 3,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {tr.bom.export}
        </Button>
      </Box>

      {/* Search / Filter Bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 2,
          mb: 3,
          position: 'relative',
          zIndex: 10,
        }}
      >
        <Button
          variant={activeOnly ? 'contained' : 'outlined'}
          startIcon={<FilterListIcon />}
          onClick={() => setActiveOnly((v) => !v)}
          sx={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 13,
            borderColor: 'divider',
            color: activeOnly ? 'primary.contrastText' : 'text.secondary',
          }}
        >
          {tr.bom.filter}
        </Button>
        <TextField
          placeholder={tr.bom.search}
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.disabled', fontSize: 16 }} />
              </InputAdornment>
            ),
            sx: {
              borderRadius: 4,
              bgcolor: 'action.hover',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'divider',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'text.disabled',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'primary.main',
              },
              fontSize: 14,
              fontWeight: 500,
            },
          }}
          sx={{ width: 288 }}
        />
      </Box>

      {/* Table */}
      <Paper
        variant="outlined"
        sx={(theme) => ({
          flex: 1,
          overflow: 'hidden',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 10,
          bgcolor: theme.palette.mode === 'dark' ? '#0a0a0a' : 'background.default',
        })}
      >
        <TableContainer sx={{ flex: 1, overflow: 'auto' }} className="custom-scrollbar">
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow
                sx={(theme) => ({
                  bgcolor: theme.palette.mode === 'dark' ? '#171717' : 'grey.100',
                  '& th': {
                    px: 3,
                    py: 1.5,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'primary.light',
                    borderBottom: 1,
                    borderColor: 'divider',
                    bgcolor: theme.palette.mode === 'dark' ? '#171717' : 'grey.100',
                  },
                })}
              >
                <TableCell>{tr.bom.itemNo}</TableCell>
                <TableCell>{tr.bom.component}</TableCell>
                <TableCell>{tr.bom.manufacturer}</TableCell>
                <TableCell>{tr.bom.partNo}</TableCell>
                <TableCell>{tr.bom.qty}</TableCell>
                <TableCell>{tr.bom.specs}</TableCell>
                <TableCell>采购</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleBom.map((item) => {
                const proc = buildProcurementUrl({ manufacturer: item.mfg, model: item.pn });
                return (
                  <TableRow
                    key={item.id}
                    sx={(theme) => ({
                      bgcolor: item.active
                        ? theme.palette.mode === 'dark'
                          ? alpha(theme.palette.common.white, 0.04)
                          : alpha(theme.palette.common.black, 0.02)
                        : 'transparent',
                      '&:hover': {
                        bgcolor:
                          theme.palette.mode === 'dark'
                            ? alpha(theme.palette.common.white, 0.06)
                            : alpha(theme.palette.common.black, 0.04),
                      },
                      transition: 'background-color 200ms',
                      '& td': {
                        px: 3,
                        py: 1.5,
                        borderBottom: 1,
                        borderColor: 'divider',
                        fontSize: 13,
                      },
                    })}
                  >
                    {/* Item No / Info button */}
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton
                          size="small"
                          onClick={() => setPopoverFor(bomTriple(item))}
                          disabled={!projectId}
                          data-testid={`bom-info-${item.id}`}
                          sx={{
                            color: 'text.disabled',
                            '&:hover': { color: 'primary.light' },
                            '&.Mui-disabled': { opacity: 0.3 },
                          }}
                          title="查看记忆来源 — 为什么 AI 推荐了这个型号"
                        >
                          <InfoIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <Typography
                          variant="bodyMedium"
                          sx={{ color: 'primary.light', fontWeight: 700 }}
                        >
                          {item.id}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Component name */}
                    <TableCell>
                      <Typography variant="bodyMedium" sx={{ fontWeight: 500 }}>
                        {item.name}
                      </Typography>
                    </TableCell>

                    {/* Manufacturer */}
                    <TableCell>
                      <Typography variant="bodyMedium" color="text.secondary">
                        {item.mfg}
                      </Typography>
                    </TableCell>

                    {/* Part number chip */}
                    <TableCell>
                      <Chip
                        label={item.pn}
                        size="small"
                        sx={{
                          bgcolor: alpha('#10b981', 0.1),
                          color: '#34d399',
                          fontWeight: 700,
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: 12,
                          borderRadius: 1,
                          height: 24,
                        }}
                      />
                    </TableCell>

                    {/* Qty chip */}
                    <TableCell>
                      <Chip
                        label={item.qty}
                        size="small"
                        sx={{
                          bgcolor: alpha('#6366f1', 0.2),
                          color: 'primary.light',
                          fontWeight: 700,
                          borderRadius: 1,
                          height: 28,
                        }}
                      />
                    </TableCell>

                    {/* Specs */}
                    <TableCell>
                      <Typography variant="bodyMedium" color="text.secondary">
                        {item.specs}
                      </Typography>
                    </TableCell>

                    {/* Procurement + Negative feedback */}
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {proc ? (
                          <Box
                            component="a"
                            href={proc}
                            target="_blank"
                            rel="noreferrer"
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              color: 'primary.main',
                              fontSize: 12,
                              fontFamily: '"JetBrains Mono", monospace',
                              textDecoration: 'none',
                              '&:hover': { color: 'primary.dark' },
                            }}
                            title={`在供应商目录中查找 ${item.pn}`}
                          >
                            查询
                            <OpenInNewIcon sx={{ fontSize: 12 }} />
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            &mdash;
                          </Typography>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleNegative(item)}
                          disabled={!projectId || negativeBusyId === item.id}
                          data-testid={`bom-negative-${item.id}`}
                          sx={{
                            color: 'text.disabled',
                            '&:hover': { color: 'error.light' },
                            '&.Mui-disabled': { opacity: 0.3 },
                          }}
                          title="这个选错了 — 让 AI 下次别再推荐"
                        >
                          <ThumbDownAltIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Memory source popover */}
      {popoverFor && projectId && (
        <MemorySourcePopover
          projectId={projectId}
          category={popoverFor.category}
          manufacturer={popoverFor.manufacturer}
          model={popoverFor.model}
          onClose={() => setPopoverFor(null)}
        />
      )}
    </Box>
  );
}

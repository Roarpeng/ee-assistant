import React, { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SchemaIcon from '@mui/icons-material/Schema';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import { KIND_LABELS, SchematicPageInfo } from '../../services/schematic';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

/**
 * Circuit-level schematic viewer: one tab per derived page (power/control/io),
 * server-rendered A3 SVG sheets with pan/zoom and regenerate. Pages come from
 * the store — either fetched from `/schematic/pages` or pushed progressively
 * by the graph (then re-fetched rendered when the project id is known).
 */
export function SchematicPanel() {
  const project = useStore((s) => s.project);
  const pages = useStore((s) => s.schematicPages);
  const loading = useStore((s) => s.schematicLoading);
  const language = useStore((s) => s.language);
  const loadSchematicPages = useStore((s) => s.loadSchematicPages);
  const regenerateSchematic = useStore((s) => s.regenerateSchematic);
  const setActiveCanvasTab = useStore((s) => s.setActiveCanvasTab);
  const tr = t(language);

  const [tab, setTab] = useState(0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (project?.id && pages.length === 0 && !loading) {
      loadSchematicPages(project.id);
    }
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pages arrived via graph payload without rendered SVGs → fetch rendered.
  useEffect(() => {
    if (project?.id && pages.length > 0 && pages.every((p) => !p.svg)) {
      loadSchematicPages(project.id);
    }
  }, [pages, project?.id, loadSchematicPages]);

  useEffect(() => {
    if (tab >= pages.length) setTab(0);
  }, [pages.length, tab]);

  const page: SchematicPageInfo | undefined = pages[tab];

  const notes = useMemo(() => (page?.notes ?? []).slice(0, 6), [page]);

  function wheel(e: React.WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + (e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP))));
  }

  if (loading && pages.length === 0) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <CircularProgress size={28} />
        <Typography variant="body2" color="text.secondary">{tr.schematic.loading}</Typography>
      </Box>
    );
  }

  if (pages.length === 0) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 4 }}>
        <SchemaIcon sx={{ fontSize: 56, opacity: 0.25 }} />
        <Typography variant="h6">{tr.schematic.emptyTitle}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, textAlign: 'center' }}>
          {tr.schematic.emptyHint}
        </Typography>
        <Tooltip title={tr.schematic.regenerate}>
          <IconButton color="primary" onClick={() => regenerateSchematic()} disabled={!project?.id}>
            <RestartAltIcon />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', px: 1, flexShrink: 0 }}>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ flex: 1, minHeight: 40 }}>
          {pages.map((p) => (
            <Tab
              key={p.page_no}
              label={`P${p.page_no} · ${KIND_LABELS[p.kind] ?? p.kind}`}
              sx={{ minHeight: 40, fontSize: '0.78rem' }}
            />
          ))}
        </Tabs>
        <Tooltip title={tr.schematic.regenerate}>
          <IconButton size="small" aria-label="regenerate schematic" onClick={() => regenerateSchematic()} disabled={!project?.id || loading}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton size="small" aria-label="zoom in" onClick={() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))}>
          <ZoomInIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="zoom out" onClick={() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP))}>
          <ZoomOutIcon fontSize="small" />
        </IconButton>
      </Box>

      {notes.length > 0 && (
        <Box sx={{ px: 2, py: 0.5, bgcolor: 'action.hover', flexShrink: 0 }}>
          {notes.map((n, i) => (
            <Typography key={i} variant="caption" sx={{ display: 'block', color: 'warning.main' }}>※ {n}</Typography>
          ))}
        </Box>
      )}

      <Box
        sx={{ flex: 1, overflow: 'auto', position: 'relative', cursor: 'grab', bgcolor: 'background.default' }}
        onWheel={wheel}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const start = { x: e.clientX - pan.x, y: e.clientY - pan.y };
          const move = (ev: MouseEvent) => setPan({ x: ev.clientX - start.x, y: ev.clientY - start.y });
          const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
          };
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        }}
        onClick={() => setActiveCanvasTab('schematic')}
      >
        {page?.svg ? (
          <Box
            data-testid="schematic-sheet"
            style={{
              width: 'fit-content',
              margin: 16,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'top left',
            }}
            sx={{ '& svg': { display: 'block', bgcolor: '#fff', boxShadow: 3, borderRadius: 1 } }}
            dangerouslySetInnerHTML={{ __html: page.svg }}
          />
        ) : (
          <Box sx={{ p: 4, color: 'text.secondary' }}>{tr.schematic.pageNotRendered}</Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * Memory-flywheel M3 Track C: organization-scoped memory tab.
 *
 * Rendered inside OrgSettingsPanel when the "记忆" tab is active. On mount
 * fetches the org's recent episodic memories + weekly consolidation
 * reports. The "立即整合" button kicks off an on-demand
 * /api/admin/consolidate-memory pass and re-fetches the reports list.
 *
 * Styling intentionally matches the engineering-theme used in
 * `WiringPanel` and `OrgSettingsPanel` (border-app-border, text-app-text-*,
 * monospace headers). No charts — just compact tables so backend output
 * stays the visible source of truth.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  fetchEpisodes,
  fetchReports,
  consolidateNow,
  type Episode,
  type Report,
} from '../../services/memory';
import {
  Paper,
  Typography,
  Chip,
  Box,
  List,
  ListItem,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';

type Status = 'idle' | 'loading' | 'ok' | 'error';

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function MemoryTab() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [consolidating, setConsolidating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadAll = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [eps, reps] = await Promise.all([fetchEpisodes(20, 0), fetchReports(10)]);
      setEpisodes(eps);
      setReports(reps);
      setStatus('ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setStatus('error');
    }
  }, []);

  const reloadReports = useCallback(async () => {
    try {
      const reps = await fetchReports(10);
      setReports(reps);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载周报失败');
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleConsolidate() {
    if (consolidating) return;
    setConsolidating(true);
    setToast(null);
    try {
      await consolidateNow(7);
      await reloadReports();
      setToast('已生成新周报');
    } catch (e) {
      setToast(e instanceof Error ? `整合失败 — ${e.message}` : '整合失败');
    } finally {
      setConsolidating(false);
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <Box data-testid="memory-tab" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {status === 'loading' && (
        <Typography
          data-testid="memory-loading"
          variant="body2"
          color="text.disabled"
          sx={{
            textAlign: 'center',
            py: 4,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.75rem',
          }}
        >
          读取记忆中…
        </Typography>
      )}

      {status === 'error' && (
        <Paper
          data-testid="memory-error"
          variant="outlined"
          sx={{
            px: 2,
            py: 1.5,
            borderColor: 'error.main',
            borderOpacity: 0.4,
            bgcolor: 'error.main',
            bgcolorOpacity: 0.1,
            color: 'error.main',
            fontSize: '0.75rem',
            borderRadius: 2,
          }}
        >
          读取失败 — {error ?? '后端记忆服务暂未可用。'}
        </Paper>
      )}

      {/* Episodes section */}
      <Box data-testid="memory-episodes-section">
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
          <Box>
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              [ memory · episodes ]
            </Typography>
            <Typography variant="subtitle2" fontWeight={700} color="text.primary" sx={{ mt: 0.25 }}>
              工程经验
              <Typography
                component="span"
                variant="caption"
                color="text.disabled"
                sx={{ ml: 1, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem' }}
              >
                (最近 {episodes.length})
              </Typography>
            </Typography>
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow
                  sx={{ bgcolor: 'surfaceContainerHigh', '& th': { borderBottom: 1, borderColor: 'divider' } }}
                >
                  <TableCell
                    sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem', color: 'text.disabled', px: 1.5, py: 1, width: 112 }}
                  >
                    日期
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem', color: 'text.disabled', px: 1.5, py: 1 }}
                  >
                    摘要
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem', color: 'text.disabled', px: 1.5, py: 1, width: 80 }}
                  >
                    决策
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem', color: 'text.disabled', px: 1.5, py: 1, width: 64 }}
                  >
                    评分
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {episodes.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      data-testid="memory-episodes-empty"
                      sx={{ textAlign: 'center', py: 4, color: 'text.disabled', fontSize: '0.75rem' }}
                    >
                      暂无工程经验。完成一次完整分析后将自动记录。
                    </TableCell>
                  </TableRow>
                )}
                {episodes.map((ep) => (
                  <TableRow
                    key={ep.id}
                    data-testid={`memory-episode-row-${ep.id}`}
                    hover
                    sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <TableCell
                      sx={{
                        fontFamily: '"JetBrains Mono", monospace',
                        color: 'text.disabled',
                        fontSize: '0.625rem',
                        px: 1.5,
                        py: 1,
                      }}
                    >
                      {formatDate(ep.created_at)}
                    </TableCell>
                    <TableCell sx={{ color: 'text.primary', fontSize: '0.75rem', px: 1.5, py: 1 }}>
                      {ep.summary || '(无摘要)'}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: '"JetBrains Mono", monospace',
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                        px: 1.5,
                        py: 1,
                      }}
                    >
                      {(ep.key_decisions || []).length}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: '"JetBrains Mono", monospace',
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                        px: 1.5,
                        py: 1,
                      }}
                    >
                      {ep.score.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* Reports section */}
      <Box data-testid="memory-reports-section">
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
          <Box>
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              [ memory · weekly reports ]
            </Typography>
            <Typography variant="subtitle2" fontWeight={700} color="text.primary" sx={{ mt: 0.25 }}>
              周报
              <Typography
                component="span"
                variant="caption"
                color="text.disabled"
                sx={{ ml: 1, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem' }}
              >
                (最近 {reports.length})
              </Typography>
            </Typography>
          </Box>
          <Button
            type="button"
            data-testid="memory-consolidate-now"
            onClick={handleConsolidate}
            disabled={consolidating}
            size="small"
            variant="outlined"
            startIcon={
              consolidating ? (
                <CircularProgress size={12} sx={{ color: 'inherit' }} />
              ) : undefined
            }
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              borderColor: 'divider',
              color: 'primary.main',
              bgcolor: 'primary.main',
              bgcolorOpacity: 0.1,
              '&:hover': { bgcolor: 'primary.main', bgcolorOpacity: 0.2 },
            }}
          >
            {consolidating ? '整合中…' : '立即整合'}
          </Button>
        </Box>

        {toast && (
          <Paper
            data-testid="memory-consolidate-toast"
            variant="outlined"
            sx={{
              mb: 1.5,
              px: 2,
              py: 1,
              fontSize: '0.6875rem',
              color: 'text.secondary',
              borderRadius: 1,
            }}
          >
            {toast}
          </Paper>
        )}

        <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
          {reports.length === 0 ? (
            <Typography
              data-testid="memory-reports-empty"
              variant="body2"
              color="text.disabled"
              sx={{ textAlign: 'center', py: 4, fontSize: '0.75rem' }}
            >
              暂无周报。点击「立即整合」生成第一份。
            </Typography>
          ) : (
            <List disablePadding sx={{ '& > .MuiListItem-root': { borderBottom: 1, borderColor: 'divider', borderBottomOpacity: 0.6 } }}>
              {reports.map((rep) => {
                const open = !!expanded[rep.id];
                const ruleCount = (rep.new_rules || []).length;
                const revCount = (rep.revisions || []).length;
                const gapCount = (rep.gaps || []).length;
                return (
                  <ListItem key={rep.id} disablePadding sx={{ flexDirection: 'column', alignItems: 'stretch' }} data-testid={`memory-report-row-${rep.id}`}>
                    <Button
                      type="button"
                      onClick={() => toggleExpanded(rep.id)}
                      aria-expanded={open}
                      data-testid={`memory-report-toggle-${rep.id}`}
                      fullWidth
                      sx={{
                        textTransform: 'none',
                        justifyContent: 'space-between',
                        px: 2,
                        py: 1,
                        borderRadius: 0,
                        color: 'text.primary',
                        fontSize: '0.75rem',
                        fontWeight: 400,
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, overflow: 'hidden' }}>
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: '0.625rem',
                            flexShrink: 0,
                          }}
                        >
                          {formatDate(rep.period_start)} → {formatDate(rep.period_end)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          候选规则 {ruleCount} 条 · 修订 {revCount} 次 · 缺口 {gapCount} 条
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: '0.625rem',
                          flexShrink: 0,
                          ml: 1,
                        }}
                      >
                        {open ? '▾ 收起' : '▸ 展开详情'}
                      </Typography>
                    </Button>
                    {open && (
                      <Box
                        data-testid={`memory-report-detail-${rep.id}`}
                        sx={{
                          px: 2,
                          pb: 2,
                          pt: 0.5,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          bgcolor: 'action.hover',
                          bgcolorOpacity: 0.5,
                        }}
                      >
                        <ReportSubTable
                          title="候选规则 new_rules"
                          rows={rep.new_rules}
                          emptyText="无候选规则"
                          testid={`memory-report-rules-${rep.id}`}
                        />
                        <ReportSubTable
                          title="修订 revisions"
                          rows={rep.revisions}
                          emptyText="无修订"
                          testid={`memory-report-revisions-${rep.id}`}
                        />
                        <ReportSubTable
                          title="缺口 gaps"
                          rows={rep.gaps}
                          emptyText="无缺口"
                          testid={`memory-report-gaps-${rep.id}`}
                        />
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: '0.625rem',
                          }}
                        >
                          metrics ·{' '}
                          {Object.entries(rep.metrics || {}).map(([k, v], idx, arr) => (
                            <Typography component="span" key={k} variant="caption" color="text.disabled" sx={{ fontSize: '0.625rem' }}>
                              {k}={String(v)}
                              {idx < arr.length - 1 ? ' · ' : ''}
                            </Typography>
                          ))}
                          {Object.keys(rep.metrics || {}).length === 0 && '—'}
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.disabled"
                            sx={{ ml: 1, fontSize: '0.625rem' }}
                          >
                            created {formatDateTime(rep.created_at)}
                          </Typography>
                        </Typography>
                      </Box>
                    )}
                  </ListItem>
                );
              })}
            </List>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

function ReportSubTable({
  title,
  rows,
  emptyText,
  testid,
}: {
  title: string;
  rows: Array<Record<string, unknown>> | null | undefined;
  emptyText: string;
  testid: string;
}) {
  const data = rows || [];
  if (data.length === 0) {
    return (
      <Box data-testid={testid}>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{
            fontFamily: '"JetBrains Mono", monospace',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: '0.625rem',
            mb: 0.5,
            display: 'block',
          }}
        >
          {title}
        </Typography>
        <Typography variant="body2" color="text.disabled" fontStyle="italic" sx={{ fontSize: '0.6875rem' }}>
          {emptyText}
        </Typography>
      </Box>
    );
  }
  const cols = Array.from(
    new Set(data.flatMap((row) => Object.keys(row || {}))),
  );
  return (
    <Box data-testid={testid}>
      <Typography
        variant="caption"
        color="text.disabled"
        sx={{
          fontFamily: '"JetBrains Mono", monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: '0.625rem',
          mb: 0.5,
          display: 'block',
        }}
      >
        {title}
      </Typography>
      <Table size="small" sx={{ border: 1, borderColor: 'divider', borderOpacity: 0.5 }}>
        <TableHead>
          <TableRow
            sx={{
              '& th': {
                color: 'text.disabled',
                textTransform: 'uppercase',
                letterSpacing: '0.025em',
                fontSize: '0.625rem',
                fontWeight: 700,
                px: 1,
                py: 0.5,
                borderBottom: 1,
                borderColor: 'divider',
                borderBottomOpacity: 0.5,
                bgcolor: 'action.hover',
                bgcolorOpacity: 0.5,
              },
            }}
          >
            {cols.map((c) => (
              <TableCell key={c} sx={{ textAlign: 'left' }}>
                {c}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow key={idx} sx={{ bgcolor: 'background.paper' }}>
              {cols.map((c) => {
                const v = (row as Record<string, unknown>)[c];
                let display: string;
                if (v === null || v === undefined) display = '—';
                else if (typeof v === 'object') display = JSON.stringify(v);
                else display = String(v);
                return (
                  <TableCell
                    key={c}
                    sx={{
                      px: 1,
                      py: 0.5,
                      borderBottom: 1,
                      borderColor: 'divider',
                      color: 'text.secondary',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '0.65rem',
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {display}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

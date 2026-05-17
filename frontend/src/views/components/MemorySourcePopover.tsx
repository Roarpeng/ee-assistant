/**
 * Memory-flywheel M2: "为什么选 X" transparency popover.
 *
 * Renders next to a BOM row when the user clicks the ⓘ button. On mount
 * fetches GET /api/projects/{pid}/memory-sources/{cat}/{mfg}/{model} and
 * displays the four signal sources:
 *
 *   组织偏好     org_pref_match
 *   历史采纳     selection_weight
 *   工程经验     similar_episodes_count   (M3 fills this)
 *   知识库       kb_doc_hits              (M3 fills this)
 *
 * The   button POSTs a `negative` decision with `target: 'bom_row'` and
 * the (cat, mfg, model) triple in `context`, then closes. The backend
 * route may not exist yet (Track A runs in parallel), so we tolerate any
 * fetch failure silently — UX must not break if M2-A hasn't landed.
 */
import { useEffect, useState } from 'react';
import {
  fetchMemorySources,
  postNegativeFeedback,
  type MemorySources,
} from '../../services/feedback';
import {
  Popover,
  Typography,
  Chip,
  Box,
  Button,
  CircularProgress,
} from '@mui/material';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';

interface Props {
  projectId: string;
  category: string;
  manufacturer: string;
  model: string;
  onClose: () => void;
}

type Status = 'loading' | 'ok' | 'error';

export function MemorySourcePopover({
  projectId,
  category,
  manufacturer,
  model,
  onClose,
}: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [sources, setSources] = useState<MemorySources | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchMemorySources(projectId, category, manufacturer, model)
      .then((s) => {
        if (cancelled) return;
        setSources(s);
        setStatus('ok');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, category, manufacturer, model]);

  async function handleNegative() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await postNegativeFeedback(projectId, {
        target: 'bom_row',
        context: { category, manufacturer, model },
      });
    } catch {
      // Non-fatal: backend may not be wired yet; we still close so the
      // user isn't stuck on a stale popover.
    } finally {
      setSubmitting(false);
      onClose();
    }
  }

  return (
    <Popover
      open
      anchorReference="none"
      onClose={onClose}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
          },
        },
        paper: {
          sx: (theme) => ({
            width: 420,
            maxWidth: '92vw',
            borderRadius: 3,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'surfaceContainer',
            p: 3,
            boxShadow: theme.shadows[8],
          }),
        },
      }}
    >
      <Box data-testid="memory-source-overlay">
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontFamily: '"JetBrains Mono", monospace',
            mb: 1,
          }}
        >
          [ memory · sources ]
        </Typography>
        <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 3 }}>
          为什么选 {manufacturer} {model}?
        </Typography>

        {status === 'loading' && (
          <Box
            data-testid="memory-source-loading"
            sx={{
              display: 'flex',
              justifyContent: 'center',
              py: 4,
              color: 'text.disabled',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.875rem',
            }}
          >
            <CircularProgress size={20} sx={{ mr: 1.5 }} />
            读取记忆信号中…
          </Box>
        )}

        {status === 'error' && (
          <Typography
            data-testid="memory-source-error"
            variant="body2"
            color="error.main"
            sx={{
              textAlign: 'center',
              py: 4,
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            读取失败 — 后端记忆服务暂未可用。
          </Typography>
        )}

        {status === 'ok' && sources && (
          <Box
            data-testid="memory-source-list"
            sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <SignalRow
              label="组织偏好"
              value={
                sources.org_pref_match ? '本组织有相关偏好' : '本组织暂无相关偏好'
              }
              active={sources.org_pref_match}
            />
            <SignalRow
              label="历史采纳"
              value={
                sources.selection_weight > 0
                  ? `${formatWeight(sources.selection_weight)} 次手动选过此型号`
                  : '尚未被手动选过'
              }
              active={sources.selection_weight > 0}
            />
            <SignalRow
              label="工程经验"
              value={`${sources.similar_episodes_count} 个相似项目案例`}
              active={sources.similar_episodes_count > 0}
              hint="M3 时填实数"
            />
            <SignalRow
              label="知识库"
              value={`${sources.kb_doc_hits} 条 RAG 命中`}
              active={sources.kb_doc_hits > 0}
              hint="M3 时填实数"
            />
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{
                pt: 1.5,
                mt: 0.5,
                borderTop: 1,
                borderColor: 'divider',
                fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              累计信号 · {sources.total_signals}
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
            mt: 4,
          }}
        >
          <Button
            type="button"
            onClick={handleNegative}
            disabled={submitting}
            data-testid="memory-source-negative"
            variant="outlined"
            color="error"
            size="small"
            startIcon={<ThumbDownIcon />}
            sx={{
              borderColor: 'error.main',
              opacity: 0.6,
              '&:hover': { opacity: 1 },
            }}
          >
            这个选错了
          </Button>
          <Button
            type="button"
            onClick={onClose}
            data-testid="memory-source-close"
            variant="outlined"
            size="small"
            sx={{
              borderColor: 'divider',
              color: 'text.secondary',
              bgcolor: 'surfaceContainerHigh',
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            关闭
          </Button>
        </Box>
      </Box>
    </Popover>
  );
}

function formatWeight(w: number): string {
  return Number.isInteger(w) ? String(w) : w.toFixed(1);
}

function SignalRow({
  label,
  value,
  active,
  hint,
}: {
  label: string;
  value: string;
  active: boolean;
  hint?: string;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Chip
            label={label}
            size="small"
            variant="outlined"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 700,
              fontSize: '0.65rem',
              color: 'text.secondary',
              borderColor: 'divider',
              height: 20,
            }}
          />
          {hint && (
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem' }}
            >
              {hint}
            </Typography>
          )}
        </Box>
        <Typography
          variant="body2"
          sx={{
            mt: 0.25,
            fontFamily: '"JetBrains Mono", monospace',
            color: active ? 'text.primary' : 'text.disabled',
          }}
        >
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

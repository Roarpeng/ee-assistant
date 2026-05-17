import { useMemo, useState } from 'react';
import { useStore } from '../../models/store';
import {
  orgApi,
  clearStoredToken,
  PREF_KEYS,
  type OrgPreference,
  type PrefKey,
} from '../../services/orgClient';
import { MemoryTab } from './MemoryTab';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Button,
  IconButton,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Select,
  MenuItem,
  LinearProgress,
  FormControl,
  InputLabel,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface Props {
  open: boolean;
  onClose: () => void;
}

type TabKey = 'preferences' | 'memory';

interface DraftState {
  /** undefined = no draft open; null/PrefKey = draft for that (new) key */
  key: PrefKey | '';
  valueJson: string;
  /** When editing an existing row, lock the key dropdown. */
  isEdit: boolean;
  error: string | null;
}

const EMPTY_DRAFT: DraftState = { key: '', valueJson: '', isEdit: false, error: null };

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatTimestamp(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          width: 64,
          height: 6,
          borderRadius: 3,
          bgcolor: 'surfaceContainerHigh',
          '& .MuiLinearProgress-bar': {
            bgcolor: 'primary.main',
            borderRadius: 3,
          },
        }}
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.625rem' }}
      >
        {value.toFixed(2)}
      </Typography>
    </Box>
  );
}

export function OrgSettingsPanel({ open, onClose }: Props) {
  const org = useStore((s) => s.org);
  const preferences = useStore((s) => s.preferences);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('preferences');

  const sortedPrefs = useMemo(() => {
    return [...preferences].sort((a, b) => a.key.localeCompare(b.key));
  }, [preferences]);

  async function refresh() {
    await useStore.getState().refreshPreferences();
  }

  function startAdd() {
    setDraft({ ...EMPTY_DRAFT });
  }

  function startEdit(p: OrgPreference) {
    setDraft({
      key: p.key as PrefKey,
      valueJson: JSON.stringify(p.value, null, 2),
      isEdit: true,
      error: null,
    });
  }

  function cancelDraft() {
    setDraft(null);
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.key) {
      setDraft({ ...draft, error: '请选择偏好键' });
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      const v = JSON.parse(draft.valueJson || '{}');
      if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        throw new Error('value 必须是 JSON 对象');
      }
      parsed = v as Record<string, unknown>;
    } catch (e) {
      setDraft({
        ...draft,
        error: e instanceof Error ? e.message : 'JSON 解析失败',
      });
      return;
    }
    setBusyKey(draft.key);
    try {
      await orgApi.upsertPreference(draft.key, parsed, { source: 'admin' });
      await refresh();
      setDraft(null);
    } catch (e) {
      setDraft({
        ...draft,
        error: e instanceof Error ? e.message : '保存失败',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function deletePref(key: string) {
    setBusyKey(key);
    try {
      await orgApi.deletePreference(key);
      await refresh();
    } catch {
      // Surface as a soft toast in future; M1 stays silent.
    } finally {
      setBusyKey(null);
    }
  }

  function confirmReset() {
    clearStoredToken();
    try {
      window.location.reload();
    } catch {}
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      data-testid="org-settings-overlay"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'surfaceContainer',
            maxHeight: '90vh',
            overflow: 'hidden',
          },
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          px: 3,
          py: 2.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
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
            ORGANIZATION
          </Typography>
          <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mt: 0.5 }}>
            {org?.name ?? '未连接'}
          </Typography>
          {org?.code && (
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontFamily: '"JetBrains Mono", monospace', mt: 0.25, display: 'block' }}
            >
              code · {org.code}
            </Typography>
          )}
        </Box>
        <IconButton aria-label="关闭" onClick={onClose} size="small" sx={{ color: 'text.disabled', '&:hover': { color: 'text.primary' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, val: TabKey) => setActiveTab(val)}
        aria-label="设置面板"
        sx={{
          px: 3,
          pt: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
          bgcolor: 'surfaceContainer',
          minHeight: 40,
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.75rem',
            minHeight: 36,
            py: 0.75,
            px: 2,
            color: 'text.disabled',
            '&.Mui-selected': {
              color: 'primary.main',
            },
          },
          '& .MuiTabs-indicator': {
            bgcolor: 'primary.main',
          },
        }}
      >
        <Tab label="偏好" value="preferences" data-testid="org-tab-preferences" />
        <Tab label="记忆" value="memory" data-testid="org-tab-memory" />
      </Tabs>

      {/* Body */}
      <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {activeTab === 'memory' ? (
          <MemoryTab />
        ) : (
          <PreferencesTabBody
            sortedPrefs={sortedPrefs}
            draft={draft}
            busyKey={busyKey}
            startAdd={startAdd}
            startEdit={startEdit}
            cancelDraft={cancelDraft}
            saveDraft={saveDraft}
            deletePref={deletePref}
            setDraft={setDraft}
          />
        )}
      </DialogContent>

      {/* Footer */}
      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: 1,
          borderColor: 'divider',
          flexShrink: 0,
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6875rem' }}>
          X-Volta-Org-Token 已存储于本机 localStorage。
        </Typography>
        {!showResetConfirm ? (
          <Button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            size="small"
            sx={{
              color: 'error.main',
              fontSize: '0.6875rem',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              '&:hover': { color: 'error.light' },
            }}
          >
            重置组织
          </Button>
        ) : (
          <Box data-testid="reset-confirm" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem' }}>
              清除本机 token 并刷新?
            </Typography>
            <Button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              size="small"
              variant="outlined"
              sx={{
                fontSize: '0.6875rem',
                py: 0.25,
                px: 1,
                borderColor: 'divider',
                color: 'text.secondary',
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={confirmReset}
              size="small"
              variant="outlined"
              color="error"
              sx={{
                fontSize: '0.6875rem',
                py: 0.25,
                px: 1,
              }}
            >
              确认重置
            </Button>
          </Box>
        )}
      </DialogActions>
    </Dialog>
  );
}

interface PreferencesTabBodyProps {
  sortedPrefs: OrgPreference[];
  draft: DraftState | null;
  busyKey: string | null;
  startAdd: () => void;
  startEdit: (p: OrgPreference) => void;
  cancelDraft: () => void;
  saveDraft: () => void | Promise<void>;
  deletePref: (key: string) => void | Promise<void>;
  setDraft: (d: DraftState) => void;
}

function PreferencesTabBody({
  sortedPrefs,
  draft,
  busyKey,
  startAdd,
  startEdit,
  cancelDraft,
  saveDraft,
  deletePref,
  setDraft,
}: PreferencesTabBodyProps) {
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
        组织偏好将在新对话中自动应用。confidence ≥ 0.6 时会跳过对应的澄清问题。
      </Typography>

      <TableContainer
        component={Box}
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow
              sx={{
                bgcolor: 'surfaceContainerHigh',
                '& th': { borderBottom: 1, borderColor: 'divider', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.disabled', fontSize: '0.65rem', px: 1.5, py: 1 },
              }}
            >
              <TableCell>偏好键</TableCell>
              <TableCell>值</TableCell>
              <TableCell>置信度</TableCell>
              <TableCell>来源</TableCell>
              <TableCell>更新时间</TableCell>
              <TableCell sx={{ width: 80 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedPrefs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  sx={{ textAlign: 'center', py: 4, color: 'text.disabled', fontSize: '0.75rem' }}
                  data-testid="prefs-empty"
                >
                  暂无偏好。点击下方"添加偏好"开始记录。
                </TableCell>
              </TableRow>
            )}
            {sortedPrefs.map((p) => (
              <TableRow
                key={p.key}
                data-testid={`pref-row-${p.key}`}
                hover
                sx={{ '&:hover': { bgcolor: 'action.hover' } }}
              >
                <TableCell sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'text.primary', fontSize: '0.75rem', px: 1.5, py: 1 }}>
                  {p.key}
                </TableCell>
                <TableCell
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    px: 1.5,
                    py: 1,
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatJson(p.value)}
                </TableCell>
                <TableCell sx={{ px: 1.5, py: 1 }}>
                  <ConfidenceBar value={p.confidence} />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', px: 1.5, py: 1 }}>
                  {p.source}
                </TableCell>
                <TableCell sx={{ color: 'text.disabled', fontSize: '0.625rem', px: 1.5, py: 1 }}>
                  {formatTimestamp(p.updated_at)}
                </TableCell>
                <TableCell sx={{ px: 1.5, py: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <IconButton
                      type="button"
                      aria-label={`编辑 ${p.key}`}
                      onClick={() => startEdit(p)}
                      disabled={busyKey === p.key}
                      size="small"
                      sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
                    >
                      <Typography variant="caption" sx={{ fontSize: '0.875rem' }}>✎</Typography>
                    </IconButton>
                    <IconButton
                      type="button"
                      aria-label={`删除 ${p.key}`}
                      onClick={() => deletePref(p.key)}
                      disabled={busyKey === p.key}
                      size="small"
                      sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                    >
                      <Typography variant="caption" sx={{ fontSize: '0.875rem' }}>🗑</Typography>
                    </IconButton>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {draft === null ? (
        <Button
          type="button"
          onClick={startAdd}
          fullWidth
          variant="outlined"
          sx={{
            py: 1.25,
            borderStyle: 'dashed',
            borderColor: 'divider',
            color: 'text.secondary',
            fontWeight: 700,
            fontSize: '0.75rem',
            '&:hover': {
              borderColor: 'primary.main',
              color: 'primary.main',
            },
          }}
        >
          + 添加偏好
        </Button>
      ) : (
        <Box
          data-testid="pref-draft-form"
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                width: 80,
                flexShrink: 0,
              }}
            >
              KEY
            </Typography>
            <FormControl size="small" fullWidth>
              <Select
                aria-label="偏好键"
                value={draft.key}
                disabled={draft.isEdit}
                onChange={(e) =>
                  setDraft({ ...draft, key: e.target.value as PrefKey | '', error: null })
                }
                displayEmpty
                sx={{
                  fontSize: '0.75rem',
                  bgcolor: 'surfaceContainer',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'divider',
                  },
                }}
              >
                <MenuItem value="">— 请选择 —</MenuItem>
                {PREF_KEYS.map((k) => (
                  <MenuItem key={k} value={k} sx={{ fontSize: '0.75rem' }}>
                    {k}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                width: 80,
                flexShrink: 0,
                pt: 0.75,
              }}
            >
              VALUE
            </Typography>
            <TextField
              aria-label="偏好值 JSON"
              multiline
              rows={4}
              value={draft.valueJson}
              onChange={(e) =>
                setDraft({ ...draft, valueJson: e.target.value, error: null })
              }
              placeholder='{"family": "S7-1200"}'
              fullWidth
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.75rem',
                  bgcolor: 'surfaceContainer',
                },
              }}
            />
          </Box>
          {draft.error && (
            <Typography
              variant="caption"
              color="error.main"
              data-testid="pref-draft-error"
              sx={{ fontSize: '0.6875rem' }}
            >
              {draft.error}
            </Typography>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, pt: 0.5 }}>
            <Button
              type="button"
              onClick={cancelDraft}
              size="small"
              variant="outlined"
              sx={{
                fontSize: '0.75rem',
                fontWeight: 700,
                borderColor: 'divider',
                color: 'text.secondary',
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={saveDraft}
              disabled={busyKey !== null}
              size="small"
              variant="contained"
              sx={{ fontSize: '0.75rem', fontWeight: 700 }}
            >
              保存
            </Button>
          </Box>
        </Box>
      )}
    </>
  );
}

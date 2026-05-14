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
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-app-bg-tertiary overflow-hidden">
        <div
          className="h-full bg-app-accent transition-all"
          style={{ width: `${pct}%` }}
          data-testid="confidence-bar-fill"
        />
      </div>
      <span className="font-mono text-[10px] text-app-text-secondary tabular-nums">
        {value.toFixed(2)}
      </span>
    </div>
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

  if (!open) return null;

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
    <div
      data-testid="org-settings-overlay"
      className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="组织设置"
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-app-border bg-app-bg-secondary shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-app-border shrink-0">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-app-text-tertiary">
              ORGANIZATION
            </div>
            <h2 className="text-lg font-bold text-app-text-primary mt-1">
              {org?.name ?? '未连接'}
            </h2>
            {org?.code && (
              <div className="text-[10px] font-mono text-app-text-tertiary mt-0.5">
                code · {org.code}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="text-app-text-tertiary hover:text-app-text-primary text-lg leading-none px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="设置面板"
          className="flex items-center gap-1 px-5 pt-3 border-b border-app-border shrink-0 bg-app-bg-secondary"
        >
          <TabButton
            label="偏好"
            active={activeTab === 'preferences'}
            onClick={() => setActiveTab('preferences')}
            testid="org-tab-preferences"
          />
          <TabButton
            label="记忆"
            active={activeTab === 'memory'}
            onClick={() => setActiveTab('memory')}
            testid="org-tab-memory"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
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
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-app-border shrink-0 flex items-center justify-between text-[11px]">
          <span className="text-app-text-tertiary">
            X-Volta-Org-Token 已存储于本机 localStorage。
          </span>
          {!showResetConfirm ? (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="text-rose-400 hover:text-rose-300 underline-offset-2 hover:underline"
            >
              重置组织
            </button>
          ) : (
            <div
              data-testid="reset-confirm"
              className="flex items-center gap-2 text-app-text-secondary"
            >
              <span>清除本机 token 并刷新?</span>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-2 py-0.5 rounded border border-app-border hover:bg-app-bg-tertiary"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmReset}
                className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30"
              >
                确认重置
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  testid,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testid}
      onClick={onClick}
      className={`px-3 py-1.5 -mb-px text-xs font-bold border-b-2 transition-colors ${
        active
          ? 'border-app-accent text-app-text-primary'
          : 'border-transparent text-app-text-tertiary hover:text-app-text-secondary'
      }`}
    >
      {label}
    </button>
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
      <div className="text-xs text-app-text-secondary">
        组织偏好将在新对话中自动应用。confidence ≥ 0.6 时会跳过对应的澄清问题。
      </div>

      <div className="rounded-xl border border-app-border overflow-hidden bg-app-bg-primary">
        <table className="w-full text-left text-xs">
          <thead className="bg-app-bg-tertiary text-app-text-tertiary border-b border-app-border">
            <tr>
              <th className="px-3 py-2 font-bold uppercase tracking-wider">偏好键</th>
              <th className="px-3 py-2 font-bold uppercase tracking-wider">值</th>
              <th className="px-3 py-2 font-bold uppercase tracking-wider">置信度</th>
              <th className="px-3 py-2 font-bold uppercase tracking-wider">来源</th>
              <th className="px-3 py-2 font-bold uppercase tracking-wider">更新时间</th>
              <th className="px-3 py-2 font-bold uppercase tracking-wider w-20">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border/60">
            {sortedPrefs.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-app-text-tertiary"
                  data-testid="prefs-empty"
                >
                  暂无偏好。点击下方"添加偏好"开始记录。
                </td>
              </tr>
            )}
            {sortedPrefs.map((p) => (
              <tr
                key={p.key}
                data-testid={`pref-row-${p.key}`}
                className="hover:bg-app-bg-tertiary/50"
              >
                <td className="px-3 py-2 font-mono text-app-text-primary">{p.key}</td>
                <td className="px-3 py-2 font-mono text-app-text-secondary truncate max-w-[180px]">
                  {formatJson(p.value)}
                </td>
                <td className="px-3 py-2">
                  <ConfidenceBar value={p.confidence} />
                </td>
                <td className="px-3 py-2 text-app-text-secondary">{p.source}</td>
                <td className="px-3 py-2 text-app-text-tertiary text-[10px]">
                  {formatTimestamp(p.updated_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`编辑 ${p.key}`}
                      onClick={() => startEdit(p)}
                      disabled={busyKey === p.key}
                      className="text-app-text-tertiary hover:text-app-accent disabled:opacity-40"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label={`删除 ${p.key}`}
                      onClick={() => deletePref(p.key)}
                      disabled={busyKey === p.key}
                      className="text-app-text-tertiary hover:text-rose-400 disabled:opacity-40"
                    >
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft === null ? (
        <button
          type="button"
          onClick={startAdd}
          className="w-full py-2 rounded-xl border border-dashed border-app-border text-xs font-bold text-app-text-secondary hover:border-app-accent hover:text-app-accent transition-colors"
        >
          + 添加偏好
        </button>
      ) : (
        <div
          data-testid="pref-draft-form"
          className="rounded-xl border border-app-border bg-app-bg-primary p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-app-text-tertiary w-20 shrink-0">
              KEY
            </label>
            <select
              aria-label="偏好键"
              value={draft.key}
              disabled={draft.isEdit}
              onChange={(e) =>
                setDraft({ ...draft, key: e.target.value as PrefKey | '', error: null })
              }
              className="flex-1 rounded-md bg-app-bg-secondary border border-app-border px-2 py-1.5 text-xs text-app-text-primary focus:outline-none focus:border-app-accent disabled:opacity-60"
            >
              <option value="">— 请选择 —</option>
              {PREF_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-start gap-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-app-text-tertiary w-20 shrink-0 pt-1.5">
              VALUE
            </label>
            <textarea
              aria-label="偏好值 JSON"
              rows={4}
              value={draft.valueJson}
              onChange={(e) =>
                setDraft({ ...draft, valueJson: e.target.value, error: null })
              }
              placeholder='{"family": "S7-1200"}'
              className="flex-1 rounded-md bg-app-bg-secondary border border-app-border px-2 py-1.5 text-xs font-mono text-app-text-primary focus:outline-none focus:border-app-accent"
            />
          </div>
          {draft.error && (
            <div className="text-[11px] text-rose-400" data-testid="pref-draft-error">
              {draft.error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancelDraft}
              className="px-3 py-1.5 text-xs font-bold rounded-md border border-app-border text-app-text-secondary hover:bg-app-bg-tertiary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={busyKey !== null}
              className="px-3 py-1.5 text-xs font-bold rounded-md bg-app-accent hover:bg-app-accent-hover text-app-text-primary disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      )}
    </>
  );
}

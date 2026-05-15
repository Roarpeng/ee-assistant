/**
 * Memory-flywheel M2: "为什么选 X" transparency popover.
 *
 * Renders next to a BOM row when the user clicks the ⓘ button. On mount
 * fetches GET /api/projects/{pid}/memory-sources/{cat}/{mfg}/{model} and
 * displays the four signal sources:
 *
 *   📋 组织偏好     org_pref_match
 *   🔁 历史采纳     selection_weight
 *   🧠 工程经验     similar_episodes_count   (M3 fills this)
 *   📚 知识库       kb_doc_hits              (M3 fills this)
 *
 * The 👎 button POSTs a `negative` decision with `target: 'bom_row'` and
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
    <div
      data-testid="memory-source-overlay"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="memory sources"
        className="w-[420px] max-w-[92vw] rounded-3xl border border-app-border bg-app-bg-secondary p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] font-mono tracking-widest text-app-text-tertiary uppercase mb-2">
          [ memory · sources ]
        </div>
        <h3 className="text-lg font-bold text-app-text-primary mb-4">
          为什么选 {manufacturer} {model}?
        </h3>

        {status === 'loading' && (
          <div
            data-testid="memory-source-loading"
            className="text-sm text-app-text-tertiary py-6 text-center font-mono"
          >
            读取记忆信号中…
          </div>
        )}

        {status === 'error' && (
          <div
            data-testid="memory-source-error"
            className="text-sm text-rose-400 py-6 text-center font-mono"
          >
            读取失败 — 后端记忆服务暂未可用。
          </div>
        )}

        {status === 'ok' && sources && (
          <ul className="space-y-3 text-sm" data-testid="memory-source-list">
            <SignalRow
              icon="📋"
              label="组织偏好"
              value={
                sources.org_pref_match ? '本组织有相关偏好' : '本组织暂无相关偏好'
              }
              active={sources.org_pref_match}
            />
            <SignalRow
              icon="🔁"
              label="历史采纳"
              value={
                sources.selection_weight > 0
                  ? `${formatWeight(sources.selection_weight)} 次手动选过此型号`
                  : '尚未被手动选过'
              }
              active={sources.selection_weight > 0}
            />
            <SignalRow
              icon="🧠"
              label="工程经验"
              value={`${sources.similar_episodes_count} 个相似项目案例`}
              active={sources.similar_episodes_count > 0}
              hint="M3 时填实数"
            />
            <SignalRow
              icon="📚"
              label="知识库"
              value={`${sources.kb_doc_hits} 条 RAG 命中`}
              active={sources.kb_doc_hits > 0}
              hint="M3 时填实数"
            />
            <li className="pt-2 text-[11px] font-mono text-app-text-tertiary uppercase tracking-wider border-t border-app-border-light">
              累计信号 · {sources.total_signals}
            </li>
          </ul>
        )}

        <div className="mt-6 flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={handleNegative}
            disabled={submitting}
            data-testid="memory-source-negative"
            className="px-3 py-2 rounded-xl text-xs font-bold border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
          >
            这个选错了 👎
          </button>
          <button
            type="button"
            onClick={onClose}
            data-testid="memory-source-close"
            className="px-4 py-2 rounded-xl text-xs font-bold border border-app-border bg-app-bg-tertiary text-app-text-secondary hover:bg-app-bg-tertiary/80 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function formatWeight(w: number): string {
  return Number.isInteger(w) ? String(w) : w.toFixed(1);
}

function SignalRow({
  icon,
  label,
  value,
  active,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  active: boolean;
  hint?: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="text-base leading-6 select-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-app-text-secondary text-xs uppercase tracking-wider">
            {label}
          </span>
          {hint && (
            <span className="font-mono text-[10px] text-app-text-tertiary">
              {hint}
            </span>
          )}
        </div>
        <div
          className={`text-sm font-mono ${
            active ? 'text-app-text-primary' : 'text-app-text-tertiary'
          }`}
        >
          {value}
        </div>
      </div>
    </li>
  );
}

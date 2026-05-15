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
    <div data-testid="memory-tab" className="space-y-6">
      {status === 'loading' && (
        <div
          data-testid="memory-loading"
          className="text-center py-6 font-mono text-xs text-app-text-tertiary"
        >
          读取记忆中…
        </div>
      )}

      {status === 'error' && (
        <div
          data-testid="memory-error"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
        >
          读取失败 — {error ?? '后端记忆服务暂未可用。'}
        </div>
      )}

      {/* Episodes section */}
      <section data-testid="memory-episodes-section">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-app-text-tertiary">
              [ memory · episodes ]
            </div>
            <h3 className="text-sm font-bold text-app-text-primary mt-0.5">
              工程经验
              <span className="ml-2 font-mono text-[10px] text-app-text-tertiary">
                (最近 {episodes.length})
              </span>
            </h3>
          </div>
        </div>

        <div className="rounded-xl border border-app-border overflow-hidden bg-app-bg-primary">
          <table className="w-full text-left text-xs">
            <thead className="bg-app-bg-tertiary text-app-text-tertiary border-b border-app-border">
              <tr>
                <th className="px-3 py-2 font-bold uppercase tracking-wider w-28">日期</th>
                <th className="px-3 py-2 font-bold uppercase tracking-wider">摘要</th>
                <th className="px-3 py-2 font-bold uppercase tracking-wider w-20">决策</th>
                <th className="px-3 py-2 font-bold uppercase tracking-wider w-16">评分</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border/60">
              {episodes.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    data-testid="memory-episodes-empty"
                    className="px-3 py-6 text-center text-app-text-tertiary"
                  >
                    暂无工程经验。完成一次完整分析后将自动记录。
                  </td>
                </tr>
              )}
              {episodes.map((ep) => (
                <tr
                  key={ep.id}
                  data-testid={`memory-episode-row-${ep.id}`}
                  className="hover:bg-app-bg-tertiary/50"
                >
                  <td className="px-3 py-2 font-mono text-app-text-tertiary text-[10px]">
                    {formatDate(ep.created_at)}
                  </td>
                  <td className="px-3 py-2 text-app-text-primary">
                    {ep.summary || '(无摘要)'}
                  </td>
                  <td className="px-3 py-2 font-mono text-app-text-secondary tabular-nums">
                    {(ep.key_decisions || []).length}
                  </td>
                  <td className="px-3 py-2 font-mono text-app-text-secondary tabular-nums">
                    {ep.score.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reports section */}
      <section data-testid="memory-reports-section">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-app-text-tertiary">
              [ memory · weekly reports ]
            </div>
            <h3 className="text-sm font-bold text-app-text-primary mt-0.5">
              周报
              <span className="ml-2 font-mono text-[10px] text-app-text-tertiary">
                (最近 {reports.length})
              </span>
            </h3>
          </div>
          <button
            type="button"
            data-testid="memory-consolidate-now"
            onClick={handleConsolidate}
            disabled={consolidating}
            className="px-3 py-1.5 rounded-md text-[11px] font-bold border border-app-border bg-app-accent/10 text-app-accent hover:bg-app-accent/20 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
          >
            {consolidating && (
              <span
                data-testid="memory-consolidate-spinner"
                aria-hidden="true"
                className="inline-block h-3 w-3 animate-spin rounded-full border border-app-accent/40 border-t-app-accent"
              />
            )}
            {consolidating ? '整合中…' : '立即整合'}
          </button>
        </div>

        {toast && (
          <div
            data-testid="memory-consolidate-toast"
            className="mb-2 rounded-md border border-app-border bg-app-bg-primary px-3 py-1.5 text-[11px] text-app-text-secondary"
          >
            {toast}
          </div>
        )}

        <div className="rounded-xl border border-app-border overflow-hidden bg-app-bg-primary">
          {reports.length === 0 ? (
            <div
              data-testid="memory-reports-empty"
              className="px-3 py-6 text-center text-xs text-app-text-tertiary"
            >
              暂无周报。点击「立即整合」生成第一份。
            </div>
          ) : (
            <ul className="divide-y divide-app-border/60">
              {reports.map((rep) => {
                const open = !!expanded[rep.id];
                const ruleCount = (rep.new_rules || []).length;
                const revCount = (rep.revisions || []).length;
                const gapCount = (rep.gaps || []).length;
                return (
                  <li
                    key={rep.id}
                    data-testid={`memory-report-row-${rep.id}`}
                    className="text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(rep.id)}
                      aria-expanded={open}
                      data-testid={`memory-report-toggle-${rep.id}`}
                      className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-app-bg-tertiary/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-app-text-tertiary text-[10px] shrink-0">
                          {formatDate(rep.period_start)} → {formatDate(rep.period_end)}
                        </span>
                        <span className="text-app-text-secondary truncate">
                          候选规则 {ruleCount} 条 · 修订 {revCount} 次 · 缺口 {gapCount} 条
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-app-text-tertiary shrink-0">
                        {open ? '▾ 收起' : '▸ 展开详情'}
                      </span>
                    </button>
                    {open && (
                      <div
                        data-testid={`memory-report-detail-${rep.id}`}
                        className="px-3 pb-3 pt-1 space-y-3 bg-app-bg-secondary/40"
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
                        <div className="text-[10px] font-mono text-app-text-tertiary">
                          metrics ·{' '}
                          {Object.entries(rep.metrics || {}).map(([k, v], idx, arr) => (
                            <span key={k}>
                              {k}={v}
                              {idx < arr.length - 1 ? ' · ' : ''}
                            </span>
                          ))}
                          {Object.keys(rep.metrics || {}).length === 0 && '—'}
                          <span className="ml-2">created {formatDateTime(rep.created_at)}</span>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
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
      <div data-testid={testid} className="text-[11px]">
        <div className="font-mono uppercase tracking-widest text-app-text-tertiary text-[10px] mb-1">
          {title}
        </div>
        <div className="text-app-text-tertiary italic">{emptyText}</div>
      </div>
    );
  }
  const cols = Array.from(
    new Set(data.flatMap((row) => Object.keys(row || {}))),
  );
  return (
    <div data-testid={testid} className="text-[11px]">
      <div className="font-mono uppercase tracking-widest text-app-text-tertiary text-[10px] mb-1">
        {title}
      </div>
      <table className="w-full border border-app-border-light">
        <thead>
          <tr className="bg-app-bg-tertiary/50 text-app-text-tertiary uppercase tracking-wider text-[10px]">
            {cols.map((c) => (
              <th key={c} className="text-left px-2 py-1 border-b border-app-border-light">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="bg-app-bg-primary">
              {cols.map((c) => {
                const v = (row as Record<string, unknown>)[c];
                let display: string;
                if (v === null || v === undefined) display = '—';
                else if (typeof v === 'object') display = JSON.stringify(v);
                else display = String(v);
                return (
                  <td
                    key={c}
                    className="px-2 py-1 border-b border-app-border-light text-app-text-secondary font-mono truncate max-w-[160px]"
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryTab } from './MemoryTab';
import * as memory from '../../services/memory';

const EPISODE = {
  id: 'ep-1',
  project_id: 'proj-1',
  org_id: 'org-1',
  summary: '滑台 (SIL2) 用 CPU 1215C — 2 处手动选型',
  key_decisions: [
    { cat: 'PLC_CPU', after: '1215C', type: 'manual_select' },
    { cat: 'HMI', after: 'MT8071iE', type: 'manual_select' },
  ],
  score: 0.6,
  created_at: '2026-05-14T08:00:00Z',
};

const REPORT = {
  id: 'rep-1',
  org_id: 'org-1',
  period_start: '2026-05-07T00:00:00Z',
  period_end: '2026-05-14T00:00:00Z',
  new_rules: [
    { cat: 'PLC_CPU', manufacturer: 'Siemens', model: '1215C', occurrences: 4 },
  ],
  revisions: [{ target: 'bom', occurrences: 2 }],
  gaps: [],
  metrics: { decisions_scanned: 12, candidate_rules: 1 },
  created_at: '2026-05-14T00:00:00Z',
};

describe('MemoryTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty-state copy when both lists are empty', async () => {
    vi.spyOn(memory, 'fetchEpisodes').mockResolvedValue([]);
    vi.spyOn(memory, 'fetchReports').mockResolvedValue([]);

    render(<MemoryTab />);

    await waitFor(() =>
      expect(screen.getByTestId('memory-episodes-empty')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('memory-reports-empty')).toBeInTheDocument();
    expect(screen.getByText(/暂无工程经验/)).toBeInTheDocument();
    expect(screen.getByText(/暂无周报/)).toBeInTheDocument();
  });

  it('renders populated episodes: one row per episode with summary + decision count', async () => {
    vi.spyOn(memory, 'fetchEpisodes').mockResolvedValue([EPISODE]);
    vi.spyOn(memory, 'fetchReports').mockResolvedValue([]);

    render(<MemoryTab />);

    await waitFor(() =>
      expect(screen.getByTestId('memory-episode-row-ep-1')).toBeInTheDocument(),
    );
    const row = screen.getByTestId('memory-episode-row-ep-1');
    expect(row.textContent).toContain('滑台 (SIL2)');
    expect(row.textContent).toContain('1215C');
    // 2 key_decisions → cell shows "2"
    expect(row.textContent).toContain('2');
    // score 0.6 formatted
    expect(row.textContent).toContain('0.60');
  });

  it('renders populated reports: row summary + expandable detail with new_rules table', async () => {
    vi.spyOn(memory, 'fetchEpisodes').mockResolvedValue([]);
    vi.spyOn(memory, 'fetchReports').mockResolvedValue([REPORT]);

    render(<MemoryTab />);

    await waitFor(() =>
      expect(screen.getByTestId('memory-report-row-rep-1')).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/候选规则 1 条 · 修订 1 次 · 缺口 0 条/),
    ).toBeInTheDocument();
    // detail collapsed by default
    expect(screen.queryByTestId('memory-report-detail-rep-1')).toBeNull();
    fireEvent.click(screen.getByTestId('memory-report-toggle-rep-1'));
    expect(screen.getByTestId('memory-report-detail-rep-1')).toBeInTheDocument();
    expect(screen.getByTestId('memory-report-rules-rep-1')).toBeInTheDocument();
    // candidate-rules sub-table contains the (cat, mfg, model, occurrences) values
    const rules = screen.getByTestId('memory-report-rules-rep-1');
    expect(rules.textContent).toContain('PLC_CPU');
    expect(rules.textContent).toContain('Siemens');
    expect(rules.textContent).toContain('1215C');
    expect(rules.textContent).toContain('4');
    // metrics row shows decisions_scanned=12
    expect(
      screen.getByTestId('memory-report-detail-rep-1').textContent,
    ).toContain('decisions_scanned=12');
  });

  it('"立即整合" calls consolidateNow then re-fetches reports', async () => {
    const fetchEpsSpy = vi
      .spyOn(memory, 'fetchEpisodes')
      .mockResolvedValue([]);
    const fetchRepsSpy = vi
      .spyOn(memory, 'fetchReports')
      .mockResolvedValueOnce([]) // initial mount
      .mockResolvedValueOnce([REPORT]); // after consolidate
    const consolidateSpy = vi
      .spyOn(memory, 'consolidateNow')
      .mockResolvedValue({
        report_id: 'rep-1',
        summary: { new_rules: REPORT.new_rules, metrics: REPORT.metrics },
      });

    render(<MemoryTab />);

    await waitFor(() =>
      expect(screen.getByTestId('memory-reports-empty')).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('memory-consolidate-now'));
    });

    expect(consolidateSpy).toHaveBeenCalledWith(7);
    // initial load called fetchReports once, then re-fetch makes it 2
    expect(fetchRepsSpy).toHaveBeenCalledTimes(2);
    // episodes are NOT re-fetched on consolidate (only reports refresh)
    expect(fetchEpsSpy).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByTestId('memory-report-row-rep-1')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('memory-consolidate-toast').textContent).toContain(
      '已生成新周报',
    );
  });
});

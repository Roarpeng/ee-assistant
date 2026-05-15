import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemorySourcePopover } from './MemorySourcePopover';
import * as feedback from '../../services/feedback';

const ZERO = {
  org_pref_match: false,
  selection_weight: 0,
  similar_episodes_count: 0,
  kb_doc_hits: 0,
  total_signals: 0,
};

const FULL = {
  org_pref_match: true,
  selection_weight: 3,
  similar_episodes_count: 4,
  kb_doc_hits: 5,
  total_signals: 4,
};

describe('MemorySourcePopover', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders zero-signal state with "no preference" copy', async () => {
    vi.spyOn(feedback, 'fetchMemorySources').mockResolvedValue(ZERO);
    render(
      <MemorySourcePopover
        projectId="p1"
        category="PLC_CPU"
        manufacturer="Siemens"
        model="1215C"
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: /memory sources/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/为什么选 Siemens 1215C/)).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId('memory-source-list')).toBeInTheDocument(),
    );
    expect(screen.getByText(/本组织暂无相关偏好/)).toBeInTheDocument();
    expect(screen.getByText(/尚未被手动选过/)).toBeInTheDocument();
    expect(screen.getByText(/累计信号 · 0/)).toBeInTheDocument();
  });

  it('renders all-signals-present state with the weight count and totals', async () => {
    vi.spyOn(feedback, 'fetchMemorySources').mockResolvedValue(FULL);
    render(
      <MemorySourcePopover
        projectId="p1"
        category="PLC_CPU"
        manufacturer="Siemens"
        model="1215C"
        onClose={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/本组织有相关偏好/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/3 次手动选过此型号/)).toBeInTheDocument();
    expect(screen.getByText(/4 个相似项目案例/)).toBeInTheDocument();
    expect(screen.getByText(/5 条 RAG 命中/)).toBeInTheDocument();
    expect(screen.getByText(/累计信号 · 4/)).toBeInTheDocument();
  });

  it('clicking 👎 POSTs a negative-feedback decision and calls onClose', async () => {
    vi.spyOn(feedback, 'fetchMemorySources').mockResolvedValue(ZERO);
    const negSpy = vi
      .spyOn(feedback, 'postNegativeFeedback')
      .mockResolvedValue({ decision_id: 'd-neg' });
    const onClose = vi.fn();

    render(
      <MemorySourcePopover
        projectId="proj-9"
        category="HMI"
        manufacturer="Weintek"
        model="MT8071iE"
        onClose={onClose}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('memory-source-list')).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('memory-source-negative'));
    });

    expect(negSpy).toHaveBeenCalledWith('proj-9', {
      target: 'bom_row',
      context: { category: 'HMI', manufacturer: 'Weintek', model: 'MT8071iE' },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button + backdrop both call onClose; dialog body click does not', async () => {
    vi.spyOn(feedback, 'fetchMemorySources').mockResolvedValue(ZERO);
    const onClose = vi.fn();
    render(
      <MemorySourcePopover
        projectId="p1"
        category="PLC_CPU"
        manufacturer="Siemens"
        model="1215C"
        onClose={onClose}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('memory-source-list')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('memory-source-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('memory-source-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

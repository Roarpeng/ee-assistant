import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BOMPanel } from './BOMPanel';
import { useStore, type BOMItem } from '../../models/store';
import * as feedback from '../../services/feedback';

const ROW: BOMItem = {
  id: '1',
  name: 'PLC',
  mfg: 'Siemens',
  pn: '6ES7215-1AG40-0XB0',
  qty: 1,
  specs: 'CPU 1215C, 14DI/10DO',
};

function seed({ project, bom }: { project?: { id: string; name: string } | null; bom?: BOMItem[] }) {
  useStore.setState({
    project: project === undefined ? { id: 'proj-1', name: 'demo' } : project,
    bom: bom ?? [ROW],
  });
}

describe('BOMPanel — memory-flywheel hooks', () => {
  beforeEach(() => {
    seed({});
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an ⓘ and a 👎 button per row, both enabled when a project is loaded', () => {
    render(<BOMPanel />);
    const info = screen.getByTestId('bom-info-1');
    const neg = screen.getByTestId('bom-negative-1');
    expect(info).toBeInTheDocument();
    expect(neg).toBeInTheDocument();
    expect((info as HTMLButtonElement).disabled).toBe(false);
    expect((neg as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables ⓘ + 👎 when no project is loaded (cold-boot guard)', () => {
    seed({ project: null });
    render(<BOMPanel />);
    expect((screen.getByTestId('bom-info-1') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('bom-negative-1') as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking ⓘ opens MemorySourcePopover with the row triple', async () => {
    const fetchSpy = vi
      .spyOn(feedback, 'fetchMemorySources')
      .mockResolvedValue({
        org_pref_match: false,
        selection_weight: 0,
        similar_episodes_count: 0,
        kb_doc_hits: 0,
        total_signals: 0,
      });

    render(<BOMPanel />);
    fireEvent.click(screen.getByTestId('bom-info-1'));

    expect(
      await screen.findByTestId('memory-source-overlay'),
    ).toBeInTheDocument();
    expect(screen.getByText(/为什么选 Siemens 6ES7215-1AG40-0XB0/)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      'proj-1',
      'PLC',
      'Siemens',
      '6ES7215-1AG40-0XB0',
    );
  });

  it('clicking 👎 POSTs a bom_row negative-feedback decision', async () => {
    const negSpy = vi
      .spyOn(feedback, 'postNegativeFeedback')
      .mockResolvedValue({ decision_id: 'd-7' });

    render(<BOMPanel />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('bom-negative-1'));
    });

    await waitFor(() => expect(negSpy).toHaveBeenCalledTimes(1));
    expect(negSpy).toHaveBeenCalledWith('proj-1', {
      target: 'bom_row',
      context: { category: 'PLC', manufacturer: 'Siemens', model: '6ES7215-1AG40-0XB0' },
    });
  });
});

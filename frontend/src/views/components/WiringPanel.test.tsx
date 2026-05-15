import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WiringPanel } from './WiringPanel';

describe('WiringPanel', () => {
  it('renders one row per IO item', () => {
    render(
      <WiringPanel
        ioItems={[
          { tag: 'PLC.DI0', signal: 'EmergencyStop', from: 'X1.1', to: 'PLC.DI0', wire: '0.75 mm² 黑' },
          { tag: 'PLC.DI1', signal: 'StartBtn', from: 'X1.2', to: 'PLC.DI1', wire: '0.75 mm² 黑' },
        ]}
      />
    );
    expect(screen.getByText('EmergencyStop')).toBeInTheDocument();
    expect(screen.getByText('StartBtn')).toBeInTheDocument();
    // PLC.DI0 appears in both Tag and To columns of the same row
    expect(screen.getAllByText('PLC.DI0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PLC.DI1').length).toBeGreaterThanOrEqual(1);
  });

  it('shows column headers', () => {
    render(<WiringPanel ioItems={[{ tag: 'A', signal: 'B', from: 'C', to: 'D', wire: 'E' }]} />);
    expect(screen.getByText(/Tag/i)).toBeInTheDocument();
    expect(screen.getByText(/Signal/i)).toBeInTheDocument();
    expect(screen.getByText(/From/i)).toBeInTheDocument();
    expect(screen.getByText(/To/i)).toBeInTheDocument();
    expect(screen.getByText(/Wire/i)).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    render(<WiringPanel ioItems={[]} />);
    expect(screen.getByText(/未生成接线/)).toBeInTheDocument();
  });
});

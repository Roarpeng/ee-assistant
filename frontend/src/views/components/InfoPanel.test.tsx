import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoPanel } from './InfoPanel';

describe('InfoPanel', () => {
  it('shows project name, safety level, and BOM cost when provided', () => {
    render(
      <InfoPanel
        projectName="水箱控制"
        safetyLevel="PLd"
        bomCost={12450}
        components={[{ id: '1', label: 'PLC', type: 'plc' }]}
        nodes={[{ id: 'n1' }]}
      />
    );
    expect(screen.getByText(/水箱控制/)).toBeInTheDocument();
    expect(screen.getByText(/PLd/)).toBeInTheDocument();
    expect(screen.getByText(/12,450/)).toBeInTheDocument();
  });

  it('renders a row per component', () => {
    render(
      <InfoPanel
        projectName="X"
        components={[
          { id: '1', label: 'PLC-A', type: 'plc' },
          { id: '2', label: 'VFD-B', type: 'vfd' },
        ]}
        nodes={[]}
      />
    );
    expect(screen.getByText('PLC-A')).toBeInTheDocument();
    expect(screen.getByText('VFD-B')).toBeInTheDocument();
  });

  it('shows empty hint when nothing is generated yet', () => {
    render(<InfoPanel projectName="" components={[]} nodes={[]} />);
    expect(screen.getByText(/尚未生成/)).toBeInTheDocument();
  });

  it('formats numbers with locale separators', () => {
    render(
      <InfoPanel
        projectName="X"
        bomCost={1234567}
        components={[]}
        nodes={[]}
      />
    );
    expect(screen.getByText(/1,234,567/)).toBeInTheDocument();
  });
});

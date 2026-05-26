import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopologyPanel } from './TopologyPanel';
import { useStore } from '../../models/store';

describe('TopologyPanel', () => {
  beforeEach(() => {
    useStore.setState({
      project: { id: 'p1', name: 'demo' },
      topology: { nodes: [], edges: [] },
      language: 'zh',
    });
  });

  it('shows empty-state hint when no topology nodes', () => {
    render(<TopologyPanel />);
    expect(screen.getByText(/暂无拓扑图/)).toBeInTheDocument();
  });
});

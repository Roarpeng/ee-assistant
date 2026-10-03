import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SchematicPanel } from './SchematicPanel';
import { useStore } from '../../models/store';

const SVG_A = '<svg viewBox="0 0 420 297"><title>power sheet</title></svg>';
const SVG_B = '<svg viewBox="0 0 420 297"><title>control sheet</title></svg>';

function seed(pages: ReturnType<typeof useStore.getState>['schematicPages']) {
  useStore.setState({
    project: { id: 'p1', name: 'Demo' },
    schematicPages: pages,
    schematicLoading: false,
  });
}

describe('SchematicPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useStore.setState({
      project: { id: 'p1', name: 'Demo' },
      schematicPages: [],
      schematicLoading: false,
      // keep tests hermetic: the empty state would otherwise kick off a fetch
      loadSchematicPages: async () => {},
      regenerateSchematic: async () => {},
    });
  });

  it('renders one tab per page and switches pages', () => {
    seed([
      { page_no: 1, kind: 'power', title_zh: '主回路', svg: SVG_A },
      { page_no: 2, kind: 'control', title_zh: '控制回路', svg: SVG_B, notes: ['SIL2 双通道'] },
    ]);
    render(<SchematicPanel />);
    expect(screen.getByText('P1 · 主回路')).toBeInTheDocument();
    expect(screen.getByText('P2 · 控制回路')).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeTruthy();

    fireEvent.click(screen.getByText('P2 · 控制回路'));
    expect(screen.getByText(/SIL2 双通道/)).toBeInTheDocument();
  });

  it('shows notes under the toolbar when present', () => {
    seed([{ page_no: 1, kind: 'power', title_zh: '主回路', svg: SVG_A, notes: ['默认主断路器已添加'] }]);
    render(<SchematicPanel />);
    expect(screen.getByText(/默认主断路器已添加/)).toBeInTheDocument();
  });

  it('shows the empty hint with regenerate action when no pages exist', () => {
    seed([]);
    render(<SchematicPanel />);
    expect(screen.getByText(/尚无电路级原理图/)).toBeInTheDocument();
  });

  it('zoom buttons adjust scale of the rendered sheet', () => {
    seed([{ page_no: 1, kind: 'io', title_zh: '端子与 IO 回路', svg: SVG_A }]);
    render(<SchematicPanel />);
    const sheet = screen.getByTestId('schematic-sheet');
    expect(sheet.style.transform).toContain('scale(1)');
    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(sheet.style.transform).toContain('scale(1.25)');
  });
});

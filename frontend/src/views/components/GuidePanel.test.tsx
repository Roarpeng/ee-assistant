import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidePanel } from './GuidePanel';

describe('GuidePanel', () => {
  it('renders each step title', () => {
    render(
      <GuidePanel
        steps={[
          { title: '上电前检查', body: '断路器全断' },
          { title: '强制 I/O 测试', body: '用 TIA Portal 强制 DI0' },
        ]}
      />
    );
    expect(screen.getByText(/上电前检查/)).toBeInTheDocument();
    expect(screen.getByText(/强制 I\/O 测试/)).toBeInTheDocument();
  });

  it('renders step bodies', () => {
    render(<GuidePanel steps={[{ title: 'A', body: '断路器全断' }]} />);
    expect(screen.getByText('断路器全断')).toBeInTheDocument();
  });

  it('numbers steps 01, 02, ...', () => {
    render(
      <GuidePanel
        steps={[
          { title: 'A', body: '' },
          { title: 'B', body: '' },
        ]}
      />
    );
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
  });

  it('shows empty hint when no steps', () => {
    render(<GuidePanel steps={[]} />);
    expect(screen.getByText(/未生成调试/)).toBeInTheDocument();
  });
});

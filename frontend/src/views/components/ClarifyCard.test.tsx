import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClarifyCard } from './ClarifyCard';

describe('ClarifyCard', () => {
  it('renders a label and each choice as a button', () => {
    render(
      <ClarifyCard
        groups={[
          {
            key: 'voltage',
            label: '主电源',
            choices: ['AC 220V', 'AC 380V', 'DC 24V'],
          },
        ]}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText('主电源')).toBeInTheDocument();
    expect(screen.getByText('AC 220V')).toBeInTheDocument();
    expect(screen.getByText('AC 380V')).toBeInTheDocument();
    expect(screen.getByText('DC 24V')).toBeInTheDocument();
  });

  it('fires onSelect with (key, choice) when clicked', () => {
    const fn = vi.fn();
    render(
      <ClarifyCard
        groups={[{ key: 'voltage', label: '主电源', choices: ['AC 380V'] }]}
        onSelect={fn}
      />
    );
    fireEvent.click(screen.getByText('AC 380V'));
    expect(fn).toHaveBeenCalledWith('voltage', 'AC 380V');
  });

  it('marks selected choice with aria-pressed', () => {
    render(
      <ClarifyCard
        groups={[
          { key: 'voltage', label: '主电源', choices: ['AC 220V', 'AC 380V'] },
        ]}
        selected={{ voltage: 'AC 380V' }}
        onSelect={() => {}}
      />
    );
    const picked = screen.getByText('AC 380V');
    expect(picked).toHaveAttribute('aria-pressed', 'true');
    const other = screen.getByText('AC 220V');
    expect(other).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders multiple groups', () => {
    render(
      <ClarifyCard
        groups={[
          { key: 'voltage', label: '主电源', choices: ['AC 380V'] },
          { key: 'safety', label: '安全等级', choices: ['PLd'] },
        ]}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText('主电源')).toBeInTheDocument();
    expect(screen.getByText('安全等级')).toBeInTheDocument();
  });
});

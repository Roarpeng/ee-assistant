import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroLanding } from './HeroLanding';

describe('HeroLanding', () => {
  it('renders the prompt input and example chips', () => {
    render(<HeroLanding onSubmit={() => {}} examples={['e1', 'e2']} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('e1')).toBeInTheDocument();
    expect(screen.getByText('e2')).toBeInTheDocument();
  });

  it('fires onSubmit with the typed text', () => {
    const fn = vi.fn();
    render(<HeroLanding onSubmit={fn} examples={[]} />);
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '3 轴伺服' } });
    fireEvent.click(screen.getByRole('button', { name: /开始/ }));
    expect(fn).toHaveBeenCalledWith('3 轴伺服');
  });

  it('fires onSubmit when an example chip is clicked', () => {
    const fn = vi.fn();
    render(<HeroLanding onSubmit={fn} examples={['传送带 VFD']} />);
    fireEvent.click(screen.getByText('传送带 VFD'));
    expect(fn).toHaveBeenCalledWith('传送带 VFD');
  });

  it('ignores empty submissions', () => {
    const fn = vi.fn();
    render(<HeroLanding onSubmit={fn} examples={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /开始/ }));
    expect(fn).not.toHaveBeenCalled();
  });
});

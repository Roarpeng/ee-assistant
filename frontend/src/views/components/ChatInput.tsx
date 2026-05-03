import { useState } from 'react';

export function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setValue('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-[var(--color-border)] p-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe your control requirements..."
          disabled={disabled}
          className="flex-1 rounded-app-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:bg-[var(--color-bg-tertiary)]"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="rounded-app-lg bg-[var(--color-accent)] px-4 py-2 text-sm text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  );
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { OrgSettingsPanel } from './OrgSettingsPanel';
import { useStore } from '../../models/store';
import * as orgClient from '../../services/orgClient';

function seedStore(overrides: Partial<{ org: any; preferences: any[] }>) {
  useStore.setState({
    org: overrides.org ?? { id: 'org-1', name: 'Acme', code: 'acme-xyz' },
    preferences: overrides.preferences ?? [],
  });
}

/** MUI v6 renders the backdrop with this class; clicking it triggers Dialog.onClose. */
function clickBackdrop() {
  const backdrop = document.querySelector('.MuiBackdrop-root');
  if (!backdrop) throw new Error('MUI backdrop not found in DOM');
  fireEvent.click(backdrop);
}

/** MUI Select is not a native <select>; open it via mouseDown on role="combobox". */
function openMuiSelect(testId: string) {
  const selectRoot = screen.getByTestId(testId);
  fireEvent.mouseDown(within(selectRoot).getByRole('combobox'));
}

describe('OrgSettingsPanel', () => {
  beforeEach(() => {
    seedStore({ preferences: [] });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns nothing when open=false', () => {
    const { container } = render(<OrgSettingsPanel open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders org name + code in the header', () => {
    seedStore({ org: { id: 'o1', name: 'Volta Industries', code: 'volta-abcd' } });
    render(<OrgSettingsPanel open onClose={() => {}} />);
    expect(screen.getByText('Volta Industries')).toBeInTheDocument();
    expect(screen.getByText(/volta-abcd/)).toBeInTheDocument();
  });

  it('shows the empty-state row when there are no preferences', () => {
    render(<OrgSettingsPanel open onClose={() => {}} />);
    expect(screen.getByTestId('prefs-empty')).toBeInTheDocument();
  });

  it('renders one row per preference', () => {
    seedStore({
      preferences: [
        {
          key: 'preferred_plc_family',
          value: { family: 'S7-1200' },
          confidence: 0.8,
          source: 'clarify',
          updated_at: '2026-05-14T08:00:00Z',
        },
        {
          key: 'default_safety_level',
          value: { level: 'SIL2' },
          confidence: 0.6,
          source: 'admin',
          updated_at: '2026-05-14T08:01:00Z',
        },
      ],
    });
    render(<OrgSettingsPanel open onClose={() => {}} />);
    expect(screen.getByTestId('pref-row-preferred_plc_family')).toBeInTheDocument();
    expect(screen.getByTestId('pref-row-default_safety_level')).toBeInTheDocument();
    expect(screen.getByText('{"family":"S7-1200"}')).toBeInTheDocument();
    expect(screen.getByText('clarify')).toBeInTheDocument();
  });

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(<OrgSettingsPanel open onClose={onClose} />);
    clickBackdrop();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the ✕ button calls onClose but clicking the dialog body does not', () => {
    const onClose = vi.fn();
    render(<OrgSettingsPanel open onClose={onClose} />);
    // Clicking the dialog paper should NOT close it.
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    // The explicit close button closes.
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"添加偏好" opens the inline editor with key dropdown', async () => {
    render(<OrgSettingsPanel open onClose={() => {}} />);
    fireEvent.click(screen.getByText('+ 添加偏好'));
    expect(screen.getByTestId('pref-draft-form')).toBeInTheDocument();

    // Open the MUI Select and verify it contains the expected keys.
    openMuiSelect('pref-key-select');
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('preferred_plc_family');
    expect(options).toContain('default_safety_level');
    expect(options).toContain('voltage_standard');
  });

  it('save flow: calls upsertPreference + refreshPreferences', async () => {
    const upsertSpy = vi
      .spyOn(orgClient.orgApi, 'upsertPreference')
      .mockResolvedValue({
        key: 'preferred_plc_family',
        value: { family: 'S7-1200' },
        confidence: 0.5,
        source: 'admin',
        updated_at: '2026-05-14T09:00:00Z',
      });
    const listSpy = vi.spyOn(orgClient.orgApi, 'listPreferences').mockResolvedValue([]);

    render(<OrgSettingsPanel open onClose={() => {}} />);
    fireEvent.click(screen.getByText('+ 添加偏好'));

    // Select key via MUI Select mouseDown + MenuItem click.
    openMuiSelect('pref-key-select');
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('preferred_plc_family'));

    // Type JSON value into the textarea.
    fireEvent.change(screen.getByRole('textbox', { name: '偏好值 JSON' }), {
      target: { value: '{"family": "S7-1200"}' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
    });

    expect(upsertSpy).toHaveBeenCalledWith(
      'preferred_plc_family',
      { family: 'S7-1200' },
      { source: 'admin' },
    );
    expect(listSpy).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByTestId('pref-draft-form')).not.toBeInTheDocument(),
    );
  });

  it('save flow rejects invalid JSON without calling the API', async () => {
    const upsertSpy = vi.spyOn(orgClient.orgApi, 'upsertPreference');
    render(<OrgSettingsPanel open onClose={() => {}} />);
    fireEvent.click(screen.getByText('+ 添加偏好'));

    // Select key via MUI Select.
    openMuiSelect('pref-key-select');
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('preferred_plc_family'));

    // Type invalid JSON.
    fireEvent.change(screen.getByRole('textbox', { name: '偏好值 JSON' }), {
      target: { value: 'not-json' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
    });
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('pref-draft-error')).toBeInTheDocument();
  });

  it('delete-button calls deletePreference + refreshPreferences', async () => {
    seedStore({
      preferences: [
        {
          key: 'preferred_plc_family',
          value: { family: 'S7-1200' },
          confidence: 0.8,
          source: 'clarify',
          updated_at: '2026-05-14T08:00:00Z',
        },
      ],
    });
    const deleteSpy = vi
      .spyOn(orgClient.orgApi, 'deletePreference')
      .mockResolvedValue(undefined);
    const listSpy = vi.spyOn(orgClient.orgApi, 'listPreferences').mockResolvedValue([]);

    render(<OrgSettingsPanel open onClose={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('删除 preferred_plc_family'));
    });

    expect(deleteSpy).toHaveBeenCalledWith('preferred_plc_family');
    expect(listSpy).toHaveBeenCalled();
  });

  it('edit-button locks the key dropdown and pre-fills the value JSON', () => {
    seedStore({
      preferences: [
        {
          key: 'default_safety_level',
          value: { level: 'SIL2' },
          confidence: 0.7,
          source: 'admin',
          updated_at: '2026-05-14T08:00:00Z',
        },
      ],
    });
    render(<OrgSettingsPanel open onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('编辑 default_safety_level'));

    // MUI Select: disabled state and displayed value.
    const selectRoot = screen.getByTestId('pref-key-select');
    const selectButton = within(selectRoot).getByRole('combobox');
    expect(selectButton.getAttribute('aria-disabled')).toBe('true');
    const displayValue = within(selectRoot).getByText('default_safety_level');
    expect(displayValue).toBeInTheDocument();

    // TextField should contain the JSON representation.
    const textarea = screen.getByRole('textbox', { name: '偏好值 JSON' }) as HTMLTextAreaElement;
    expect(textarea.value).toContain('"level"');
    expect(textarea.value).toContain('SIL2');
  });

  it('"重置组织" → confirm clears token and reloads the page', async () => {
    localStorage.setItem('volta-org-token', 'tok-to-clear');
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
    render(<OrgSettingsPanel open onClose={() => {}} />);
    fireEvent.click(screen.getByText('重置组织'));
    expect(screen.getByTestId('reset-confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByText('确认重置'));
    expect(localStorage.getItem('volta-org-token')).toBeNull();
    expect(reloadSpy).toHaveBeenCalled();
  });
});

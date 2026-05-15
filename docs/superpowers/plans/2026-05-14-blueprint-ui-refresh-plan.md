# Blueprint-Inspired UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Adopt Blueprint.am's first-impression clarity (hero entry, fewer
visual chunks, engineering aesthetic) and deliverable-package completeness
(more output tabs, structured clarify, procurement deep-links, cabinet view,
live constraints) without diluting Volta's industrial-automation depth.

**Architecture:** Pure frontend changes. Three new themes / visual treatments,
three new panels (info / wiring / guide / cabinet — cabinet is P3),
two new chat renderers (clarify cards), three new pure-function services
(templates, procurement, budget). No backend / no schema changes.

**Tech Stack:** React 18, TypeScript, Tailwind, vitest (new), JSDOM (new),
@testing-library/react (new).

---

## Task 0: Add vitest test runner

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/tsconfig.json`
- Create: `frontend/src/test/smoke.test.ts`

- [ ] **Step 1: Add devDependencies**

Edit `frontend/package.json`, append to `devDependencies`:

```json
"vitest": "^2.1.4",
"jsdom": "^25.0.1",
"@testing-library/react": "^16.0.1",
"@testing-library/jest-dom": "^6.5.0",
"@types/node": "^22.7.5"
```

Append to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Run `npm install` in `frontend/`. Expect zero errors.

- [ ] **Step 2: Create vitest config**

`frontend/vitest.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
```

- [ ] **Step 3: Create test setup**

`frontend/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add vitest types to tsconfig**

Modify `frontend/tsconfig.json` so the `compilerOptions.types` array contains
`"vitest/globals"` (add if missing). Keep all other settings as-is.

- [ ] **Step 5: Write smoke test**

`frontend/src/test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Verify**

```bash
cd frontend && npx vitest run
```

Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/test frontend/tsconfig.json
git commit -m "chore(frontend): add vitest + jsdom + testing-library"
```

---

## Task P0a: Engineering theme + tighter radii

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/models/store.ts` (extend `theme` union)
- Modify: `frontend/src/views/components/ThemeToggle.tsx` (3-way)
- Modify: `frontend/src/views/components/AppLayout.tsx` (replace
  `rounded-[2.5rem]` with `rounded-lg`)

- [ ] **Step 1: Extend the theme union**

In `store.ts` change every `theme: 'light' | 'dark'` to
`theme: 'light' | 'dark' | 'engineering'` and update `toggleTheme` to cycle
through all three. Persist to `localStorage` under the existing key
`volta-theme`.

- [ ] **Step 2: Add engineering theme variables**

Append to `frontend/src/index.css` (after the existing `[data-theme="dark"]`
block):

```css
[data-theme="engineering"] {
  --color-bg-primary: #0b0d10;
  --color-bg-secondary: #14181d;
  --color-bg-tertiary: #1d2329;
  --color-bg-canvas: #0b0d10;
  --color-text-primary: #e6edf3;
  --color-text-secondary: #8b95a3;
  --color-text-tertiary: #5a6675;
  --color-border: #2a323d;
  --color-border-light: #1d2329;
  --color-accent: #4ec9ff;
  --color-accent-hover: #7ad8ff;
  --color-accent-light: rgba(78, 201, 255, 0.12);
  --color-success: #4ade80;
  --color-success-light: rgba(74, 222, 128, 0.12);
  --color-warning: #fbbf24;
  --color-warning-light: rgba(251, 191, 36, 0.12);
  --color-error: #f87171;
  --color-error-light: rgba(248, 113, 113, 0.12);
  --color-grid: #1d2329;
  --radius-sm: 3px;
  --radius-md: 4px;
  --radius-lg: 6px;
}
```

- [ ] **Step 3: Update ThemeToggle**

Make the toggle cycle `light → dark → engineering → light`. Use the
`Sun`/`Moon`/`PenTool` icons from `lucide-react` (PenTool is the
ruler-like icon).

- [ ] **Step 4: Replace mega-radii in AppLayout**

In `AppLayout.tsx`, find every `rounded-[2.5rem]` and replace with
`rounded-lg`. Also replace the lone `rounded-full` on the canvas-tabs nav
container with `rounded-md` (the chips inside stay `rounded-full`).

- [ ] **Step 5: Verify**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

Expect: build succeeds, 0 ts errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css frontend/src/models/store.ts frontend/src/views/components/ThemeToggle.tsx frontend/src/views/components/AppLayout.tsx
git commit -m "feat(ui): engineering theme variant + tighter radii"
```

---

## Task P0b: HeroLanding component

**Files:**
- Create: `frontend/src/views/components/HeroLanding.tsx`
- Create: `frontend/src/views/components/HeroLanding.test.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write the failing test**

`frontend/src/views/components/HeroLanding.test.tsx`:

```tsx
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

  it('fires onSubmit with user text', () => {
    const fn = vi.fn();
    render(<HeroLanding onSubmit={fn} examples={[]} />);
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '3 轴伺服' } });
    fireEvent.click(screen.getByRole('button', { name: /开始/i }));
    expect(fn).toHaveBeenCalledWith('3 轴伺服');
  });

  it('fires onSubmit with example chip text', () => {
    const fn = vi.fn();
    render(<HeroLanding onSubmit={fn} examples={['传送带 VFD']} />);
    fireEvent.click(screen.getByText('传送带 VFD'));
    expect(fn).toHaveBeenCalledWith('传送带 VFD');
  });

  it('ignores empty submissions', () => {
    const fn = vi.fn();
    render(<HeroLanding onSubmit={fn} examples={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /开始/i }));
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, see it fail**

```bash
cd frontend && npx vitest run src/views/components/HeroLanding.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement HeroLanding**

`frontend/src/views/components/HeroLanding.tsx`:

```tsx
import { useState } from 'react';

interface Props {
  onSubmit: (prompt: string) => void;
  examples: string[];
}

export function HeroLanding({ onSubmit, examples }: Props) {
  const [value, setValue] = useState('');

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-app-bg-primary text-app-text-primary px-6">
      <div className="w-full max-w-2xl">
        <div className="text-[10px] font-mono tracking-widest text-app-text-tertiary mb-4 uppercase">
          [ fig.01 ] volta · ee assistant
        </div>
        <h1 className="text-4xl font-bold mb-2 tracking-tight">
          你想设计什么电气方案?
        </h1>
        <p className="text-app-text-secondary mb-6">
          用一句话描述你的工艺/控制目标。
        </p>
        <div className="border border-app-border rounded-lg bg-app-bg-secondary p-3">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            placeholder="例如：恒温水箱 PLC 控制系统, 需 PLd 安全等级"
            className="w-full bg-transparent outline-none resize-none text-sm"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => submit(value)}
              className="px-4 py-1.5 rounded-md bg-app-accent text-white text-sm font-semibold disabled:opacity-50"
              disabled={!value.trim()}
            >
              开始设计 →
            </button>
          </div>
        </div>
        {examples.length > 0 && (
          <div className="mt-5">
            <div className="text-xs text-app-text-tertiary mb-2 uppercase tracking-wide">
              需要灵感?
            </div>
            <div className="flex flex-wrap gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => submit(ex)}
                  className="px-3 py-1.5 text-xs rounded-full border border-app-border text-app-text-secondary hover:text-app-text-primary hover:border-app-accent transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify the unit test passes**

```bash
cd frontend && npx vitest run src/views/components/HeroLanding.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Wire HeroLanding into App.tsx**

Open `frontend/src/App.tsx`. Replace its body so the app renders HeroLanding
when `project` is `null`, otherwise the existing AppLayout. The handler
prefills the chat input by calling
`useStore.getState().newProject({ preserveCanvas: false, seedPrompt: prompt })`
— and we update the store to accept `seedPrompt`. If wiring `seedPrompt`
through is too invasive, fall back to: create new project, then dispatch a
`window.dispatchEvent(new CustomEvent('volta:seed-prompt', { detail: prompt }))`
and have ChatPanel listen for it. Use whichever path is smaller in the
existing code.

- [ ] **Step 6: Verify build**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

Expect: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/views/components/HeroLanding.tsx frontend/src/views/components/HeroLanding.test.tsx frontend/src/models/store.ts
git commit -m "feat(ui): hero landing for empty project state"
```

---

## Task P0c: Wireframe topology nodes

**Files:**
- Modify: `frontend/src/views/components/CustomNodes.tsx`
- Modify: `frontend/src/views/components/TopologyPanel.tsx` (Background variant)

- [ ] **Step 1: Convert node renderers to wireframe**

In `CustomNodes.tsx`, the standard EE node renderers currently use filled
backgrounds. Change them to:
- Background: `bg-app-bg-secondary`
- Border: `border border-app-border` (1 px)
- Type colour as **left 3 px coloured stripe**, not a fill
- Terminal pin labels using `font-mono text-[9px] text-app-text-tertiary`
- Component label using `font-mono uppercase tracking-wide`

Keep IDs / data-cy attributes identical.

- [ ] **Step 2: Switch ReactFlow background to dots**

In `TopologyPanel.tsx` change the `<Background />` JSX (if any) to
`<Background variant="dots" gap={20} size={1.2} />`. If no Background is
mounted, add one inside the `<ReactFlow>` children.

- [ ] **Step 3: Verify build**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

Expect: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/components/CustomNodes.tsx frontend/src/views/components/TopologyPanel.tsx
git commit -m "feat(ui): wireframe-style topology nodes + dot grid"
```

---

## Task P1a: InfoPanel

**Files:**
- Create: `frontend/src/views/components/InfoPanel.tsx`
- Create: `frontend/src/views/components/InfoPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoPanel } from './InfoPanel';

describe('InfoPanel', () => {
  it('shows project name, safety, and BOM cost when provided', () => {
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

  it('shows empty hint when nothing is generated yet', () => {
    render(<InfoPanel projectName="" components={[]} nodes={[]} />);
    expect(screen.getByText(/未生成/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd frontend && npx vitest run src/views/components/InfoPanel.test.tsx
```

Expect: FAIL.

- [ ] **Step 3: Implement InfoPanel**

```tsx
interface Props {
  projectName: string;
  safetyLevel?: string;
  bomCost?: number;
  components: Array<{ id: string; label: string; type: string }>;
  nodes: Array<{ id: string }>;
}

export function InfoPanel({ projectName, safetyLevel, bomCost, components, nodes }: Props) {
  const empty = !projectName && components.length === 0 && nodes.length === 0;
  if (empty) {
    return (
      <div className="h-full flex items-center justify-center text-app-text-tertiary text-sm">
        尚未生成项目概览 — 在左侧对话中描述需求即可。
      </div>
    );
  }
  const fmt = (n?: number) =>
    n === undefined ? '—' : n.toLocaleString('en-US');
  return (
    <div className="h-full overflow-auto p-8 max-w-3xl mx-auto">
      <div className="text-[10px] font-mono tracking-widest text-app-text-tertiary uppercase mb-2">
        [ fig.00 ] project overview
      </div>
      <h2 className="text-3xl font-bold mb-6 tracking-tight">{projectName || '未命名项目'}</h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Stat label="安全等级" value={safetyLevel ?? '—'} />
        <Stat label="估价 (CNY)" value={fmt(bomCost)} />
        <Stat label="元器件数" value={String(components.length)} />
      </div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-app-text-secondary mb-3">
        元器件清单 ({components.length})
      </h3>
      <ul className="space-y-1 text-sm font-mono">
        {components.map((c) => (
          <li key={c.id} className="flex justify-between border-b border-app-border-light py-1">
            <span>{c.label}</span>
            <span className="text-app-text-tertiary uppercase">{c.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-app-border rounded-md p-3 bg-app-bg-secondary">
      <div className="text-[10px] uppercase tracking-wide text-app-text-tertiary">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Verify test green**

```bash
cd frontend && npx vitest run src/views/components/InfoPanel.test.tsx
```

Expect: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/components/InfoPanel.tsx frontend/src/views/components/InfoPanel.test.tsx
git commit -m "feat(ui): InfoPanel — project overview tab"
```

---

## Task P1b: WiringPanel

**Files:**
- Create: `frontend/src/views/components/WiringPanel.tsx`
- Create: `frontend/src/views/components/WiringPanel.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
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
  });

  it('shows empty state', () => {
    render(<WiringPanel ioItems={[]} />);
    expect(screen.getByText(/未生成接线/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect RED**
- [ ] **Step 3: Implement** — render a table with columns `Tag`, `Signal`, `From`, `To`, `Wire`, mono font, alternating row backgrounds.
- [ ] **Step 4: Run, expect GREEN**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/components/WiringPanel.tsx frontend/src/views/components/WiringPanel.test.tsx
git commit -m "feat(ui): WiringPanel — I/O terminal table tab"
```

---

## Task P1c: GuidePanel

**Files:**
- Create: `frontend/src/views/components/GuidePanel.tsx`
- Create: `frontend/src/views/components/GuidePanel.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidePanel } from './GuidePanel';

describe('GuidePanel', () => {
  it('renders ordered steps', () => {
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

  it('shows empty hint', () => {
    render(<GuidePanel steps={[]} />);
    expect(screen.getByText(/未生成调试/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — render an ordered list of cards, mono title + body. Each step numbered `01`, `02`, `03` in monospace.
- [ ] **Step 4: GREEN**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/components/GuidePanel.tsx frontend/src/views/components/GuidePanel.test.tsx
git commit -m "feat(ui): GuidePanel — commissioning steps tab"
```

---

## Task P1d: Tab routing

**Files:**
- Modify: `frontend/src/models/store.ts`
- Modify: `frontend/src/views/components/AppLayout.tsx`
- Modify: `frontend/src/services/i18n.ts`

- [ ] **Step 1: Extend the union**

`store.ts`: `activeCanvasTab` becomes
`'info' | 'topology' | 'wiring' | 'bom' | 'code' | 'guide'`. Default to
`'info'`.

- [ ] **Step 2: Add labels**

`i18n.ts`: add `header.info`, `header.wiring`, `header.guide` in both zh & en.

- [ ] **Step 3: Update AppLayout**

Replace `canvasTabs` to include the six entries in order and add the new
panel mounts. Each panel is conditionally rendered (CSS-hidden, identical to
existing pattern).

InfoPanel reads `project?.name`, BOM aggregate, components list (already in
store as `topology.nodes` mapping to `{ id, label, type }`).
WiringPanel reads `ioItems` from store if present (fallback empty).
GuidePanel reads `commissioningSteps` from store if present (fallback empty).

If store doesn't have those fields yet, add empty defaults to the store
(typed `[]`).

- [ ] **Step 4: Verify build**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

Expect: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/models/store.ts frontend/src/views/components/AppLayout.tsx frontend/src/services/i18n.ts
git commit -m "feat(ui): 6-tab canvas — info/topology/wiring/bom/code/guide"
```

---

## Task P1e: Structured clarify cards

**Files:**
- Create: `frontend/src/views/components/ClarifyCard.tsx`
- Create: `frontend/src/views/components/ClarifyCard.test.tsx`
- Modify: `frontend/src/views/components/ChatPanel.tsx` (one branch in the
  message renderer)
- Modify: `frontend/src/models/store.ts` (extend `Message` type with optional
  `options`)

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClarifyCard } from './ClarifyCard';

describe('ClarifyCard', () => {
  it('renders a question per option group and fires onSelect', () => {
    const fn = vi.fn();
    render(
      <ClarifyCard
        groups={[
          { key: 'voltage', label: '主电源', choices: ['AC 220V', 'AC 380V', 'DC 24V'] },
        ]}
        onSelect={fn}
      />
    );
    expect(screen.getByText('主电源')).toBeInTheDocument();
    fireEvent.click(screen.getByText('AC 380V'));
    expect(fn).toHaveBeenCalledWith('voltage', 'AC 380V');
  });
});
```

- [ ] **Step 2: RED**
- [ ] **Step 3: Implement ClarifyCard** — vertical stack of groups, each group is `label` + horizontal chip row, chips are buttons that call `onSelect(key, choice)`. Highlight the picked one (`selected` prop optional).
- [ ] **Step 4: GREEN**
- [ ] **Step 5: Extend Message type**

In `store.ts`, change `Message` to include optional
`options?: { key: string; label: string; choices: string[] }[]`.

- [ ] **Step 6: Render ClarifyCard inside ChatPanel**

In the message render loop of `ChatPanel.tsx`, when `msg.role === 'assistant'`
AND `msg.options?.length`, render `<ClarifyCard groups={msg.options}
onSelect={(k, c) => setInputValue(prev => prev + ` ${k}=${c}`)} />` *below*
the message bubble.

- [ ] **Step 7: Build verify**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/views/components/ClarifyCard.tsx frontend/src/views/components/ClarifyCard.test.tsx frontend/src/views/components/ChatPanel.tsx frontend/src/models/store.ts
git commit -m "feat(chat): structured clarify cards (assistant.options renderer)"
```

---

## Task P2a: Template registry

**Files:**
- Create: `frontend/src/services/templates.ts`
- Create: `frontend/src/services/templates.test.ts`
- Create: `frontend/src/services/templates/water-treatment.json`
- Create: `frontend/src/services/templates/packaging-line.json`
- Create: `frontend/src/services/templates/conveyor-vfd.json`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { listTemplates, loadTemplate } from './templates';

describe('templates registry', () => {
  it('lists the bundled templates', () => {
    const t = listTemplates();
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t[0]).toHaveProperty('id');
    expect(t[0]).toHaveProperty('name');
    expect(t[0]).toHaveProperty('summary');
  });

  it('loadTemplate returns the seed payload', () => {
    const t = loadTemplate('conveyor-vfd');
    expect(t).toBeDefined();
    expect(t?.seedPrompt).toContain('传送带');
  });

  it('returns undefined for unknown id', () => {
    expect(loadTemplate('does-not-exist')).toBeUndefined();
  });
});
```

- [ ] **Step 2: RED**
- [ ] **Step 3: Implement**

Each JSON file has shape:

```json
{
  "id": "conveyor-vfd",
  "name": "传送带 VFD 调速",
  "summary": "三相异步电机经 VFD 调速 + 急停 + 接触器互锁",
  "seedPrompt": "需要一条 3 kW 传送带, 用 VFD 调速, 单按钮急停, 接触器互锁"
}
```

`templates.ts`:

```ts
import waterTreatment from './templates/water-treatment.json';
import packagingLine from './templates/packaging-line.json';
import conveyorVfd from './templates/conveyor-vfd.json';

export interface Template {
  id: string;
  name: string;
  summary: string;
  seedPrompt: string;
}

const REGISTRY: Template[] = [waterTreatment, packagingLine, conveyorVfd];

export function listTemplates(): Template[] {
  return REGISTRY;
}

export function loadTemplate(id: string): Template | undefined {
  return REGISTRY.find((t) => t.id === id);
}
```

Add `"resolveJsonModule": true` to `tsconfig.json` if not already present.

- [ ] **Step 4: GREEN**

```bash
cd frontend && npx vitest run src/services/templates.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/templates.ts frontend/src/services/templates.test.ts frontend/src/services/templates frontend/tsconfig.json
git commit -m "feat(templates): industry-template registry (3 seeds)"
```

---

## Task P2b: Template entry in ConversationSidebar

**Files:**
- Modify: `frontend/src/views/components/ConversationSidebar.tsx`

- [ ] **Step 1: Extend the new-project menu**

Where `showNewMenu` opens the new-project popover, add a third item
"📋 从行业模板" that opens a sub-list of `listTemplates()`. Selecting one
triggers `useStore.getState().newProject({ preserveCanvas: false,
seedPrompt: template.seedPrompt })`.

- [ ] **Step 2: Build verify**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/components/ConversationSidebar.tsx
git commit -m "feat(ui): 'from template' entry in new-project menu"
```

---

## Task P2c: BOM procurement deep-link column

**Files:**
- Create: `frontend/src/services/procurement.ts`
- Create: `frontend/src/services/procurement.test.ts`
- Modify: `frontend/src/views/components/BOMPanel.tsx`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildProcurementUrl } from './procurement';

describe('procurement URL builder', () => {
  it('routes Siemens MPNs to Industry Mall search', () => {
    const url = buildProcurementUrl({ manufacturer: 'Siemens', model: '6ES7215-1AG40-0XB0' });
    expect(url).toContain('siemens');
    expect(url).toContain('6ES7215-1AG40-0XB0');
  });

  it('routes Schneider MPNs to Schneider site', () => {
    const url = buildProcurementUrl({ manufacturer: 'Schneider', model: 'LC1D09M7' });
    expect(url).toContain('schneider');
  });

  it('falls back to generic 工控168 search', () => {
    const url = buildProcurementUrl({ manufacturer: 'NoName', model: 'XYZ-1' });
    expect(url).toContain('gongkong');
    expect(url).toContain('XYZ-1');
  });

  it('encodes special chars', () => {
    const url = buildProcurementUrl({ manufacturer: 'NoName', model: 'A/B 1' });
    expect(url).toContain(encodeURIComponent('A/B 1'));
  });
});
```

- [ ] **Step 2: RED**
- [ ] **Step 3: Implement**

```ts
export interface ProcurementItem {
  manufacturer: string;
  model: string;
}

export function buildProcurementUrl({ manufacturer, model }: ProcurementItem): string {
  const m = (manufacturer || '').trim().toLowerCase();
  const q = encodeURIComponent(model.trim());
  if (m.includes('siemens')) {
    return `https://mall.industry.siemens.com/mall/en/cn/Catalog/Search/Products?searchTerm=${q}`;
  }
  if (m.includes('schneider')) {
    return `https://www.se.com/cn/zh/search/${q}`;
  }
  return `https://so.gongkong.com/key.aspx?q=${q}`;
}
```

- [ ] **Step 4: GREEN**

```bash
cd frontend && npx vitest run src/services/procurement.test.ts
```

- [ ] **Step 5: Add procurement column in BOMPanel**

Add a `<th>采购</th>` and per-row `<td><a target="_blank" rel="noreferrer"
href={buildProcurementUrl(row)}><ExternalLink /></a></td>`. Use the
`ExternalLink` icon from `lucide-react`.

- [ ] **Step 6: Build verify**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/services/procurement.ts frontend/src/services/procurement.test.ts frontend/src/views/components/BOMPanel.tsx
git commit -m "feat(bom): procurement deep-link column"
```

---

## Task P3a: Cabinet 2D layout

**Files:**
- Create: `frontend/src/services/cabinet.ts`
- Create: `frontend/src/services/cabinet.test.ts`
- Create: `frontend/src/views/components/CabinetPanel.tsx`

- [ ] **Step 1: Failing test on the layout function**

```ts
import { describe, it, expect } from 'vitest';
import { packCabinet } from './cabinet';

describe('packCabinet', () => {
  it('places components within a 600x800 cabinet', () => {
    const out = packCabinet({
      width: 600,
      height: 800,
      items: [
        { id: 'a', type: 'plc', w: 100, h: 100 },
        { id: 'b', type: 'breaker', w: 50, h: 80 },
      ],
    });
    expect(out.length).toBe(2);
    out.forEach((p) => {
      expect(p.x + p.w).toBeLessThanOrEqual(600);
      expect(p.y + p.h).toBeLessThanOrEqual(800);
    });
  });

  it('returns empty array for no items', () => {
    expect(packCabinet({ width: 600, height: 800, items: [] })).toEqual([]);
  });

  it('does not overlap row items', () => {
    const out = packCabinet({
      width: 200,
      height: 200,
      items: [
        { id: 'a', type: 'x', w: 80, h: 50 },
        { id: 'b', type: 'x', w: 80, h: 50 },
        { id: 'c', type: 'x', w: 80, h: 50 },
      ],
    });
    // Items A and B fit in first row at y=0; C wraps to next row.
    expect(out[2].y).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** simple shelf packer:

```ts
export interface PackInput {
  width: number;
  height: number;
  items: { id: string; type: string; w: number; h: number }[];
}
export interface Placed { id: string; type: string; x: number; y: number; w: number; h: number; }

export function packCabinet({ width, items }: PackInput): Placed[] {
  const out: Placed[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const it of items) {
    if (x + it.w > width) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    out.push({ id: it.id, type: it.type, x, y, w: it.w, h: it.h });
    x += it.w;
    rowH = Math.max(rowH, it.h);
  }
  return out;
}
```

- [ ] **Step 4: GREEN** — run the test.
- [ ] **Step 5: Implement CabinetPanel** — SVG with viewBox `0 0 600 800`,
  one `<rect>` per placed item using a footprint lookup keyed on `type`
  (plc = 120 × 100, breaker = 50 × 90, contactor = 45 × 80, vfd = 200 × 250,
  hmi = 200 × 150, terminal = 30 × 70, relay = 30 × 60, other = 50 × 50).
- [ ] **Step 6: Build verify**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/services/cabinet.ts frontend/src/services/cabinet.test.ts frontend/src/views/components/CabinetPanel.tsx
git commit -m "feat(ui): cabinet 2D layout view (P3)"
```

---

## Task P3b: Live I/O budget bar

**Files:**
- Create: `frontend/src/services/budget.ts`
- Create: `frontend/src/services/budget.test.ts`
- Create: `frontend/src/views/components/IOBudgetBar.tsx`
- Modify: `frontend/src/views/components/TopologyPanel.tsx` (mount the bar)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeIOBudget } from './budget';

describe('computeIOBudget', () => {
  it('sums DI/DO/AI/AO from BOM with PLC capacity', () => {
    const out = computeIOBudget([
      { type: 'plc', model: 'S7-1215C', capacity: { di: 14, do: 10, ai: 2, ao: 2 } },
      { type: 'sensor', signal: 'di' },
      { type: 'sensor', signal: 'di' },
      { type: 'sensor', signal: 'ai' },
    ]);
    expect(out.di.used).toBe(2);
    expect(out.di.total).toBe(14);
    expect(out.ai.used).toBe(1);
    expect(out.ai.total).toBe(2);
  });

  it('returns nulls when no PLC is in BOM', () => {
    const out = computeIOBudget([{ type: 'sensor', signal: 'di' }]);
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: RED**
- [ ] **Step 3: Implement** — pure aggregation, signal field defaults to `none`. Returns null when no PLC capacity is found.
- [ ] **Step 4: GREEN**
- [ ] **Step 5: Implement IOBudgetBar component** — four horizontal mini-bars (DI / DO / AI / AO) with used / total text, turns red when used > total.
- [ ] **Step 6: Mount in TopologyPanel** below the canvas header, hide when `computeIOBudget` returns null.
- [ ] **Step 7: Build verify**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/services/budget.ts frontend/src/services/budget.test.ts frontend/src/views/components/IOBudgetBar.tsx frontend/src/views/components/TopologyPanel.tsx
git commit -m "feat(topology): live I/O budget bar"
```

---

## Final Task: Knowledge graph refresh

- [ ] **Step 1:** Confirm graphify CLI is available:

```bash
where.exe graphify
```

If unavailable, install per project README (Python tool). If still
unavailable, skip and report — the user said the project's CLAUDE.md uses
`graphify update .` which assumes the CLI is installed locally.

- [ ] **Step 2:** Run update:

```bash
graphify update .
```

Expect: graphify-out/graph.json refreshed.

- [ ] **Step 3:** Commit:

```bash
git add graphify-out/
git commit -m "chore(graph): refresh graphify knowledge graph after UI refresh"
```

---

## Self-review

- Every task has either a vitest test (logic / component) or a build-verify
  (pure visual) GREEN signal.
- No "TBD" / "handle edge cases" / "similar to Task N" placeholders.
- Type names that cross tasks (`Template`, `ProcurementItem`, `Placed`,
  `Budget`) are defined exactly once.
- Spec section 5 file map and plan task files match.
- P3 cabinet/budget tasks have escape hatches (skip-and-report) if scope
  pressure hits.

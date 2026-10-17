/**
 * Responsive-layout contracts.
 *
 * This project has no DOM/browser test harness, so these tests guard the
 * responsive behaviour at the source level: viewport setup, the mobile
 * navigation pattern, the leads card/table switch, touch-target sizing,
 * and the absence of arbitrary fixed pixel widths that cause horizontal
 * page overflow on small screens.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8');

/** Every .tsx file under src/ (recursive). */
function sourceFiles(dir = 'src'): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (entry.name.endsWith('.tsx')) files.push(path);
  }
  return files;
}

describe('viewport and safe areas', () => {
  it('declares a mobile viewport with safe-area support', () => {
    const html = read('index.html');
    expect(html).toContain('width=device-width, initial-scale=1.0');
    expect(html).toContain('viewport-fit=cover');
  });

  it('respects bottom safe areas in the shell and top safe areas in the mobile header', () => {
    expect(read('src/App.tsx')).toContain('env(safe-area-inset-bottom)');
    expect(read('src/components/Navigation.tsx')).toContain('env(safe-area-inset-top)');
  });
});

describe('navigation responsiveness', () => {
  const nav = read('src/components/Navigation.tsx');

  it('keeps the sidebar for lg+ and a mobile header below lg', () => {
    expect(nav).toContain('hidden h-screen w-64');
    expect(nav).toContain('lg:flex');
    expect(nav).toContain('lg:hidden');
  });

  it('wraps mobile nav items instead of scrolling the page sideways', () => {
    expect(nav).toContain('flex flex-wrap gap-1 px-2 pb-2');
    expect(nav).not.toContain('overflow-x-auto');
  });

  it('gives nav items and sign-out buttons 44px minimum touch targets', () => {
    expect(nav).toContain('min-h-11');
  });
});

describe('leads page responsiveness', () => {
  const page = read('src/pages/LeadsPage.tsx');

  it('renders a phone card list below sm and the table from sm up', () => {
    expect(page).toContain('className="space-y-3 sm:hidden"');
    expect(page).toContain(
      'hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block',
    );
  });

  it('keeps the status dropdown touch-friendly in both layouts', () => {
    expect(page).toContain('min-h-11');
    expect(page).toContain('aria-label={`Status for lead ${lead.lead_id}`}');
  });

  it('stacks the filter bar on phones and keeps search full-width', () => {
    expect(page).toContain('flex-col gap-3 lg:flex-row');
    expect(page).toContain('min-h-11 w-full rounded-lg border border-slate-300');
  });
});

describe('form and dashboard responsiveness', () => {
  it('uses a single-column form on phones and two columns from sm up', () => {
    const form = read('src/components/LeadForm.tsx');
    expect(form).toContain('grid gap-5 sm:grid-cols-2');
    expect(form).toContain('min-h-11'); // inputs and the submit button
  });

  it('stacks dashboard metrics on phones and expands them on larger screens', () => {
    const dashboard = read('src/pages/DashboardPage.tsx');
    expect(dashboard).toContain('grid-cols-1 gap-4 sm:grid-cols-2');
    expect(dashboard).toContain('grid gap-6 xl:grid-cols-2');
  });

  it('gives the sign-in fields and button 44px minimum touch targets', () => {
    const signIn = read('src/pages/SignInPage.tsx');
    expect(signIn).toContain('min-h-11 w-full rounded-lg');
  });
});

describe('no fixed widths that overflow small screens', () => {
  it('never uses arbitrary fixed pixel widths in components or pages', () => {
    for (const file of sourceFiles()) {
      const source = read(file);
      expect.soft(source, file).not.toMatch(/\b(min-)?w-\[\d/);
      expect.soft(source, file).not.toContain('100vw');
    }
  });

  it('keeps wide tables inside their own horizontal-scroll containers', () => {
    for (const table of [
      'src/pages/LeadsPage.tsx',
      'src/components/SessionLeadsPanel.tsx',
      'src/components/DealerRoster.tsx',
    ]) {
      const source = read(table);
      expect.soft(source, table).toContain('overflow-x-auto');
      expect.soft(source, table).toContain('overflow-hidden');
    }
  });
});

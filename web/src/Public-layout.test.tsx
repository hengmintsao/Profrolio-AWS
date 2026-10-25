import { StrictMode } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { emptyDraft } from './types';

beforeEach(() => {
  history.replaceState({}, '', '/');
  window.PORTFOLIO_CONFIG = { apiBase: '/api' };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.PORTFOLIO_CONFIG = {};
});
const removedLabels = [
  'FULL-STACK ENGINEER · BUSINESS ANALYST',
  'PORTFOLIO / HENRY TSAO',
  'UNDERSTAND THE PROBLEM',
  'BUILD WITH PURPOSE',
  'DELIVER & IMPROVE',
];
async function settleRequests() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('public layout revision', () => {
  it('orders the main navigation around unique homepage sections', async () => {
    render(<App />);
    await settleRequests();
    const links = within(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    ).getAllByRole('link');
    expect(links.slice(0, 3).map((link) => link.textContent)).toEqual([
      'About',
      'Work',
      'Experience',
    ]);
    for (const [index, id] of ['about', 'work', 'experience'].entries()) {
      expect(links[index].getAttribute('href')).toBe('/#' + id);
      expect(document.querySelectorAll('[id="' + id + '"]').length).toBe(1);
      const section = document.getElementById(id)!;
      expect(
        document.getElementById(section.getAttribute('aria-labelledby')!)
          ?.tagName,
      ).toBe('H2');
    }
    expect(
      screen.getByRole('img', { name: 'Henry Tsao seated outdoors in a park' }),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: /All projects/ })).toBeNull();
  });
  it.each(['/projects', '/projects/'])(
    'keeps the legacy gallery %s within homepage Work',
    async (path) => {
      history.replaceState({}, '', path);
      render(<App />);
      await settleRequests();
      expect(location.pathname + location.hash).toBe('/#work');
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(document.getElementById('work')).toBeTruthy();
    },
  );
  it('shows published work even when it is not featured, with a direct case-study link', async () => {
    const project = {
      ...emptyDraft(),
      id: 'published',
      slug: 'published-work',
      title: 'Published work',
      summary: 'A real published project.',
      revision: 1,
      publishedAt: '2026-10-24',
      featured: false,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ items: [project], nextCursor: null }), {
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    render(<App />);
    await settleRequests();
    expect(
      screen
        .getByRole('link', { name: 'Read case study' })
        .getAttribute('href'),
    ).toBe('/projects/published-work');
    expect(
      screen
        .getByRole('link', { name: 'Read case study: Published work' })
        .getAttribute('href'),
    ).toBe('/projects/published-work');
  });

  it('keeps About on the homepage and removes the requested hero labels', async () => {
    render(<App />);
    await settleRequests();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const about = document.getElementById('about');
    expect(about).not.toBeNull();
    expect(about?.getAttribute('aria-labelledby')).toBe('about-title');
    expect(
      document.getElementById('about-title')?.textContent?.trim(),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /^About$/i }).getAttribute('href'),
    ).toBe('/#about');
    for (const label of removedLabels)
      expect(screen.queryByText(label, { exact: false })).toBeNull();
  });
  it.each(['/about', '/about/'])(
    'normalizes legacy %s under StrictMode',
    async (path) => {
      history.replaceState({}, '', path);
      let nextId = 0;
      const pending = new Map<number, FrameRequestCallback>();
      const requestFrame = vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextId;
        pending.set(id, callback);
        return id;
      });
      const cancelFrame = vi.fn((id: number) => {
        pending.delete(id);
      });
      vi.stubGlobal('requestAnimationFrame', requestFrame);
      vi.stubGlobal('cancelAnimationFrame', cancelFrame);
      const view = render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
      await settleRequests();
      expect(location.pathname).toBe('/');
      expect(location.hash).toBe('#about');
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(document.querySelectorAll('#about')).toHaveLength(1);
      expect(cancelFrame).toHaveBeenCalled();
      expect(pending.size).toBe(1);
      view.unmount();
      expect(pending.size).toBe(0);
    },
  );
  it('requests About positioning after a direct homepage fragment is mounted', async () => {
    history.replaceState({}, '', '/#about');
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextId;
        pending.set(id, callback);
        return id;
      }),
    );
    const cancelFrame = vi.fn((id: number) => pending.delete(id));
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const view = render(<App />);
    await settleRequests();
    const about = document.getElementById('about')!,
      scroll = vi.fn();
    Object.defineProperty(about, 'scrollIntoView', { value: scroll });
    expect(pending.size).toBe(1);
    const frameId = [...pending.keys()][0];
    act(() => {
      for (const [id, callback] of [...pending.entries()]) {
        pending.delete(id);
        callback(0);
      }
    });
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(location.pathname + location.hash).toBe('/#about');
    view.unmount();
    expect(pending.size).toBe(0);
    expect(cancelFrame).toHaveBeenCalledWith(frameId);
  });
  it('waits for the project list before positioning a direct Experience fragment', async () => {
    history.replaceState({}, '', '/#experience');
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextId;
        pending.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => pending.delete(id)),
    );
    render(<App />);
    await settleRequests();
    const scroll = vi.fn();
    Object.defineProperty(
      document.getElementById('experience')!,
      'scrollIntoView',
      { value: scroll },
    );
    expect(pending.size).toBe(0);
    await act(async () => {
      finish(
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    expect(pending.size).toBe(1);
    act(() => {
      for (const [id, callback] of [...pending]) {
        pending.delete(id);
        callback(0);
      }
    });
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  });
  it('connects each analysis index entry to a uniquely labelled section', async () => {
    history.replaceState({}, '', '/experience/airline-revenue');
    render(<App />);
    await settleRequests();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const index = screen.getByRole('navigation', { name: 'Analysis approach' }),
      links = within(index).getAllByRole('link');
    expect(links).toHaveLength(4);
    const targets = links.map((link) => link.getAttribute('href'));
    expect(new Set(targets).size).toBe(4);
    for (const href of targets) {
      expect(href?.startsWith('#')).toBe(true);
      const target = document.getElementById(href!.slice(1));
      expect(target?.tagName).toBe('SECTION');
      expect(
        document.querySelectorAll(`[id="${href!.slice(1)}"]`),
      ).toHaveLength(1);
      const labelId = target?.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      const heading = document.getElementById(labelId!);
      expect(heading?.tagName).toBe('H2');
      expect(target?.contains(heading)).toBe(true);
      expect(heading?.textContent?.trim()).toBeTruthy();
    }
    expect(
      screen.getByRole('complementary', { name: 'Experience at a glance' }),
    ).toBeTruthy();
  });
});

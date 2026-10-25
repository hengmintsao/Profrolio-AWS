import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

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

function viewport(initialMobile = true) {
  let mobile = initialMobile;
  const listeners = new Set<() => void>();
  const media = {
    get matches() {
      return mobile;
    },
    media: '(max-width: 800px)',
    addEventListener: (_type: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  return {
    listeners,
    resize(value: boolean) {
      act(() => {
        mobile = value;
        for (const listener of listeners) listener();
      });
    },
  };
}
async function mount() {
  const view = render(<App />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

describe('mobile navigation disclosure', () => {
  it('starts collapsed and exposes the ordered navigation only when opened', async () => {
    viewport();
    await mount();
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const controlled = document.getElementById(
      toggle.getAttribute('aria-controls')!,
    );
    expect(controlled?.hasAttribute('hidden')).toBe(true);
    expect(
      screen.queryByRole('navigation', { name: 'Main navigation' }),
    ).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const navigation = screen.getByRole('navigation', {
      name: 'Main navigation',
    });
    expect(
      within(navigation)
        .getAllByRole('link')
        .slice(0, 3)
        .map((link) => link.textContent),
    ).toEqual(['About', 'Work', 'Experience']);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(controlled?.hasAttribute('hidden')).toBe(true);
  });

  it('closes after selecting a section without replacing the native fragment link', async () => {
    viewport();
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const about = screen.getByRole('link', { name: 'About' });
    expect(about.getAttribute('href')).toBe('/#about');
    const observed = vi.fn();
    about.addEventListener('click', (event) => {
      observed(event.defaultPrevented);
      event.preventDefault();
    });
    fireEvent.click(about);
    expect(observed).toHaveBeenCalledWith(false);
    expect(
      screen.queryByRole('navigation', { name: 'Main navigation' }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Menu' }),
    );
  });

  it('closes with Escape and returns keyboard focus to the toggle', async () => {
    viewport();
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const work = screen.getByRole('link', { name: 'Work' });
    act(() => work.focus());
    fireEvent.keyDown(work, { key: 'Escape' });
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('closes when keyboard focus leaves the header', async () => {
    viewport();
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const work = screen.getByRole('link', { name: 'Work' });
    act(() => work.focus());
    const contentLink = screen.getByRole('link', { name: /Explore my work/ });
    act(() => contentLink.focus());
    expect(
      screen
        .getByRole('button', { name: 'Menu' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    expect(document.activeElement).toBe(contentLink);
  });

  it('keeps desktop links available and resets the disclosure after resizing', async () => {
    const media = viewport(false),
      view = await mount();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    const work = screen.getByRole('link', { name: 'Work' });
    act(() => work.focus());
    media.resize(true);
    expect(
      screen.queryByRole('navigation', { name: 'Main navigation' }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Menu' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    media.resize(false);
    expect(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: 'About' }),
    );
    media.resize(true);
    expect(
      screen
        .getByRole('button', { name: 'Menu' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    expect(media.listeners.size).toBe(1);
    view.unmount();
    expect(media.listeners.size).toBe(0);
  });
});

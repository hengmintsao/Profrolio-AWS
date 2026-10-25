import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { App, Blocks } from './App';
import { api, localMode, safeUrl, setAccessToken } from './api';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken('');
  window.PORTFOLIO_CONFIG = {};
});
beforeEach(() => {
  history.replaceState({}, '', '/');
});
describe('safe content rendering', () => {
  it('renders markup as text and rejects executable links', () => {
    render(
      <Blocks
        blocks={[
          { type: 'paragraph', text: '<img src=x onerror=alert(1)>' },
          { type: 'link', text: 'Unsafe action', url: 'javascript:alert(1)' },
          { type: 'link', text: 'Verified source', url: 'https://example.com' },
        ]}
      />,
    );
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.queryByText('Unsafe action')).toBeNull();
    expect(screen.getByRole('link').getAttribute('rel')).toBe(
      'noopener noreferrer',
    );
  });
  it('allows only HTTPS external links', () => {
    expect(safeUrl('https://example.com')).toBe('https://example.com/');
    expect(safeUrl('//example.com')).toBeNull();
    expect(safeUrl('data:text/html,test')).toBeNull();
    expect(safeUrl('http://example.com')).toBeNull();
    expect(safeUrl('https://user:pass@example.com')).toBeNull();
  });
});
describe('public project states', () => {
  it('reports service failure without presenting an empty successful collection', async () => {
    window.PORTFOLIO_CONFIG = { apiBase: '/api' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'UNAVAILABLE',
              message: 'Projects are temporarily unavailable.',
            },
          }),
          { status: 503 },
        ),
      ),
    );
    history.replaceState({}, '', '/projects');
    render(<App />);
    await screen.findByText(/Project case studies are temporarily unavailable/);
    expect(
      screen.queryByText(
        'Project case studies are being prepared for this new portfolio.',
      ),
    ).toBeNull();
    expect(screen.getByText('Airline-Point Website')).toBeTruthy();
  });
  it('renders public project records independently from earlier work', async () => {
    window.PORTFOLIO_CONFIG = { apiBase: '/api' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'p1',
                slug: 'sample',
                title: 'Verified sample',
                summary: 'A published description.',
                revision: 2,
                publishedAt: '2026-01-01',
                coverMediaId: null,
                coverAlt: '',
                blocks: [],
                tags: [],
                technologies: ['React'],
                demoUrl: '',
                repositoryUrl: '',
                featured: true,
                displayOrder: 0,
              },
            ],
            nextCursor: null,
          }),
          { status: 200 },
        ),
      ),
    );
    history.replaceState({}, '', '/projects');
    render(<App />);
    expect(
      await screen.findByRole('link', { name: 'Verified sample ↗' }),
    ).toBeTruthy();
    expect(screen.getByText('A published description.')).toBeTruthy();
  });
});
describe('authentication boundary', () => {
  it('does not send local-owner with development disabled', async () => {
    window.PORTFOLIO_CONFIG = { apiBase: '/api', localDevelopment: false };
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    expect(localMode()).toBe(false);
    await expect(api('/admin/projects', {}, true)).rejects.toThrow(
      'Please sign in.',
    );
    expect(mock).not.toHaveBeenCalled();
  });
  it('keeps failed contact input on screen', async () => {
    history.replaceState({}, '', '/contact');
    window.PORTFOLIO_CONFIG = { contactUrl: 'https://example.com/contact' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Error('Network unavailable')),
    );
    render(<App />);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Henry' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'henry@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'A useful message for this test.' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Send message ↗' }).closest('form')!,
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Network unavailable',
      ),
    );
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
      'Henry',
    );
  });
});

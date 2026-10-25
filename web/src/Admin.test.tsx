import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  api: apiMock,
  authenticated: () => true,
  localMode: () => true,
}));
import { Admin } from './Admin';
import { emptyDraft } from './types';
beforeEach(() => {
  apiMock.mockReset();
  history.replaceState({}, '', '/admin/projects/new');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('offers display ordering without an inactive featured control', () => {
  render(<Admin />);
  expect(screen.getByLabelText('Display order')).toBeTruthy();
  expect(screen.queryByLabelText('Featured on homepage')).toBeNull();
});
it('locks fields during an in-flight save', async () => {
  apiMock.mockImplementation(() => new Promise(() => {}));
  render(<Admin />);
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Pending draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await screen.findByRole('button', { name: 'Working…' });
  expect(
    (screen.getByLabelText('Title').closest('fieldset') as HTMLFieldSetElement)
      .disabled,
  ).toBe(true);
});
it('replays the same creation intent after an uncertain response instead of making a duplicate', async () => {
  const project = {
    id: '11111111-1111-4111-a111-111111111111',
    revision: 1,
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z',
    trashedAt: null,
    publishedRevision: null,
    draft: { ...emptyDraft(), title: 'Retained draft' },
  };
  apiMock
    .mockRejectedValueOnce(Error('Response lost'))
    .mockResolvedValue({ project });
  render(<Admin />);
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Retained draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await screen.findByRole('button', { name: 'Confirm previous operation' });
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
    'Retained draft',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm previous operation' }),
  );
  await waitFor(() =>
    expect(
      apiMock.mock.calls.filter((call) => call[1]?.method === 'POST'),
    ).toHaveLength(2),
  );
  const requests = apiMock.mock.calls.filter(
    (call) => call[1]?.method === 'POST',
  );
  expect(requests[0][0]).toBe('/admin/projects');
  expect(requests[1][1].body).toBe(requests[0][1].body);
});
it('preserves comma editing and blocks navigation when unsaved changes are not discarded', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Admin />);
  fireEvent.change(screen.getByLabelText('Tags (comma-separated, up to 8)'), {
    target: { value: 'React,' },
  });
  expect(
    (
      screen.getByLabelText(
        'Tags (comma-separated, up to 8)',
      ) as HTMLInputElement
    ).value,
  ).toBe('React,');
  fireEvent.click(screen.getByRole('button', { name: 'All projects' }));
  expect(confirm).toHaveBeenCalled();
  expect(location.pathname).toBe('/admin/projects/new');
  expect(screen.getByRole('heading', { name: 'New project' })).toBeTruthy();
});

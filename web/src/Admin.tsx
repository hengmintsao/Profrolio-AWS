import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  authenticated,
  finishLogin,
  localMode,
  login,
  logout,
  operation,
  safeUrl,
} from './api';
import { Blocks, PrivateImage } from './Content';
import { emptyDraft, type AdminProject, type Block, type Draft } from './types';
type Navigate = (path: string, acknowledgedSave?: boolean) => void;
type Pending = {
  path: string;
  method: string;
  body: object;
  kind: 'save' | 'publish' | 'unpublish' | 'trash' | 'restore';
};
const guardEvent = () => new Event('portfolio:navigate', { cancelable: true });
export function Admin() {
  const [path, setPath] = useState(location.pathname),
    [ready, setReady] = useState(authenticated()),
    [error, setError] = useState('');
  const navigate: Navigate = (url, acknowledgedSave = false) => {
    if (!acknowledgedSave && !dispatchEvent(guardEvent())) return;
    history.pushState({}, '', url);
    setPath(url);
    setError('');
  };
  useEffect(() => {
    const listener = () => {
      if (!dispatchEvent(guardEvent())) history.pushState({}, '', path);
      else setPath(location.pathname);
    };
    addEventListener('popstate', listener);
    return () => removeEventListener('popstate', listener);
  }, [path]);
  useEffect(() => {
    if (location.pathname === '/admin/callback')
      finishLogin()
        .then(() => {
          setReady(true);
          navigate('/admin/projects', true);
        })
        .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a href="/">HT / Portfolio</a>
        <strong>Content management</strong>
        <button
          onClick={() => {
            if (dispatchEvent(guardEvent())) logout();
          }}
        >
          Sign out
        </button>
      </header>
      {localMode() && (
        <p className="local-banner">
          Local preview · Test data lives in memory and is cleared on restart.
          Production AWS is not connected.
        </p>
      )}
      <main id="main">
        {!ready ? (
          <section className="admin-panel">
            <p className="eyebrow">ADMINISTRATOR</p>
            <h1>Administrator sign-in</h1>
            <p>
              Sign in with your configured Cognito account and multi-factor
              authentication. Public registration is not available.
            </p>
            {error && <p role="alert">{error}</p>}
            <button
              className="button"
              onClick={() => login().catch((e) => setError(e.message))}
            >
              Secure sign-in ↗
            </button>
          </section>
        ) : (
          <>
            <nav className="admin-nav" aria-label="Administration">
              <button onClick={() => navigate('/admin/projects')}>
                All projects
              </button>
              <button onClick={() => navigate('/admin/trash')}>Trash</button>
              <button
                className="button"
                onClick={() => navigate('/admin/projects/new')}
              >
                New project +
              </button>
            </nav>
            {path === '/admin/projects/new' ? (
              <Editor key="new" navigate={navigate} />
            ) : path.match(/^\/admin\/projects\/[^/]+\/(edit|preview)$/) ? (
              <Editor
                key={path}
                id={path.split('/')[3]}
                preview={path.endsWith('/preview')}
                navigate={navigate}
              />
            ) : (
              <AdminList
                key={path}
                trash={path === '/admin/trash'}
                navigate={navigate}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
function AdminList({
  trash,
  navigate,
}: {
  trash: boolean;
  navigate: Navigate;
}) {
  const [items, setItems] = useState<AdminProject[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const load = useCallback(
    async (next?: string) => {
      setLoading(true);
      setError('');
      try {
        const r = await api<{
          items: AdminProject[];
          nextCursor: string | null;
        }>(
          `/admin/projects?trash=${trash}${next ? '&cursor=' + encodeURIComponent(next) : ''}`,
          {},
          true,
        );
        setItems((old) => (next ? [...old, ...r.items] : r.items));
        setCursor(r.nextCursor);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [trash],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="admin-panel">
      <p className="eyebrow">CONTENT LIBRARY</p>
      <h1>{trash ? 'Trash' : 'Projects'}</h1>
      <p>
        {trash
          ? 'Projects can be restored as unpublished drafts.'
          : 'Drafts are separate from published versions. Publish saved changes explicitly to make them public.'}
      </p>
      {error && (
        <p role="alert" className="error">
          {error} <button onClick={() => void load()}>Retry</button>
        </p>
      )}
      {items.map((p) => (
        <article className="admin-row" key={p.id}>
          <div>
            <span className="status">
              {trash
                ? 'Trash'
                : p.publishedRevision === null
                  ? 'Draft'
                  : p.publishedRevision === p.revision
                    ? 'Published'
                    : 'Published · New draft changes'}
            </span>
            <h2>{p.draft.title || 'Untitled project'}</h2>
            <small>
              Revision {p.revision} ·{' '}
              {new Date(p.updatedAt).toLocaleString('en-CA')}
            </small>
          </div>
          <button onClick={() => navigate(`/admin/projects/${p.id}/edit`)}>
            {trash ? 'View and restore' : 'Edit →'}
          </button>
        </article>
      ))}
      {!loading && !error && !items.length && (
        <p className="notice">
          {trash
            ? 'No projects in the trash.'
            : 'No projects yet. Select New project to get started.'}
        </p>
      )}
      {loading && <p role="status">Loading…</p>}
      {cursor && (
        <button disabled={loading} onClick={() => void load(cursor)}>
          Load more
        </button>
      )}
    </section>
  );
}
function Editor({
  id,
  preview = false,
  navigate,
}: {
  id?: string;
  preview?: boolean;
  navigate: Navigate;
}) {
  const [project, setProject] = useState<AdminProject>(),
    [draft, setDraft] = useState<Draft>(emptyDraft),
    [tagsText, setTagsText] = useState(''),
    [techText, setTechText] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(!id),
    [confirmAction, setConfirmAction] = useState<Pending['kind'] | ''>('');
  const [pending, setPending] = useState<Pending | null>(null),
    [expired, setExpired] = useState(false),
    [removed, setRemoved] = useState<{ block: Block; index: number } | null>(
      null,
    );
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(project?.draft ?? emptyDraft());
  const locked = busy || pending !== null;
  function accept(p: AdminProject) {
    setProject(p);
    setDraft(p.draft);
    setTagsText(p.draft.tags.join(', '));
    setTechText(p.draft.technologies.join(', '));
  }
  useEffect(() => {
    let active = true;
    if (id)
      api<{ project: AdminProject }>(
        `/admin/projects/${encodeURIComponent(id)}`,
        {},
        true,
      )
        .then((r) => {
          if (active) {
            accept(r.project);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    const guard = (event: Event) => {
      if (busy) {
        event.preventDefault();
        return;
      }
      if (
        (dirty || pending) &&
        !window.confirm(
          'You have unsaved changes or an operation awaiting confirmation. Leave this page?',
        )
      )
        event.preventDefault();
    };
    const before = (event: BeforeUnloadEvent) => {
      if (dirty || busy || pending) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('portfolio:navigate', guard);
    addEventListener('beforeunload', before);
    return () => {
      removeEventListener('portfolio:navigate', guard);
      removeEventListener('beforeunload', before);
    };
  }, [dirty, busy, pending]);
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((old) => ({ ...old, [key]: value }));
    setNotice('');
  }
  async function run(request: Pending) {
    setBusy(true);
    setError('');
    setConfirmAction('');
    try {
      const r = await api<{ project: AdminProject }>(
        request.path,
        { method: request.method, body: JSON.stringify(request.body) },
        true,
      );
      accept(r.project);
      setPending(null);
      setNotice(
        request.kind === 'save'
          ? 'Draft saved. The published version has not changed.'
          : request.kind === 'publish'
            ? 'Publication confirmed. You can view the public version. The list may update later; refresh it if needed.'
            : 'Operation completed.',
      );
      if (!id && request.kind === 'save')
        navigate(`/admin/projects/${r.project.id}/edit`, true);
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        setPending(null);
        if (e.status === 401 || e.status === 403) {
          setExpired(true);
          setError(
            'Your session has expired or access is denied. Your input is preserved. Copy your draft before signing in again, which leaves this page.',
          );
        } else
          setError(
            e.status === 409
              ? 'Revision conflict: your input is preserved. Copy your draft, review the latest version in another tab, and merge your changes.'
              : e.message,
          );
      } else {
        setPending(request);
        setError(
          'The operation outcome is uncertain. Your input is preserved and temporarily locked. Confirm the previous operation to retry safely with the same operation ID.',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function save() {
    void run({
      kind: 'save',
      path: project ? `/admin/projects/${project.id}` : '/admin/projects',
      method: project ? 'PUT' : 'POST',
      body: {
        operationId: operation(),
        ...(project ? { expectedRevision: project.revision } : {}),
        draft,
      },
    });
  }
  function action(name: Pending['kind']) {
    if (!project || dirty || pending) {
      setError('Save your draft and confirm the previous operation first.');
      return;
    }
    void run({
      kind: name,
      path: `/admin/projects/${project.id}/${name}`,
      method: 'POST',
      body: { operationId: operation(), expectedRevision: project.revision },
    });
  }
  async function upload(file: File, cover: boolean) {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size < 1 ||
      file.size > 5 * 1024 * 1024
    ) {
      setError('Only JPEG, PNG, or WebP images up to 5 MiB are accepted.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api<{
        mediaId: string;
        uploadUrl: string;
        headers: Record<string, string>;
      }>(
        '/admin/media',
        {
          method: 'POST',
          body: JSON.stringify({
            operationId: operation(),
            contentType: file.type,
            size: file.size,
          }),
        },
        true,
      );
      const target = new URL(r.uploadUrl, location.origin);
      if (
        !(localMode() && target.origin === location.origin) &&
        !safeUrl(target.href)
      )
        throw Error('Invalid upload URL.');
      const sent = await fetch(target, {
        method: 'PUT',
        headers: r.headers,
        body: file,
      });
      if (!sent.ok) throw Error('Image upload failed.');
      await api(
        `/admin/media/${encodeURIComponent(r.mediaId)}/complete`,
        { method: 'POST', body: '{}' },
        true,
      );
      if (cover) change('coverMediaId', r.mediaId);
      else
        setDraft((old) => ({
          ...old,
          blocks: [
            ...old.blocks,
            { type: 'image', mediaId: r.mediaId, alt: '' },
          ],
        }));
      setNotice('Image verified. Add alternative text and save your draft.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ draft, pending }, null, 2),
      );
      setNotice('Draft copied to the clipboard. Keep your backup secure.');
    } catch {
      setError(
        'The clipboard is unavailable. Select and copy the field contents instead.',
      );
    }
  }
  if (!loaded)
    return (
      <section className="admin-panel">
        <p role={error ? 'alert' : 'status'}>{error || 'Loading project…'}</p>
      </section>
    );
  if (preview)
    return (
      <section className="admin-panel narrow">
        <p className="local-banner">Private draft preview · Not published</p>
        <button onClick={() => navigate(`/admin/projects/${id}/edit`)}>
          ← Back to editor
        </button>
        <h1>{draft.title || 'Untitled project'}</h1>
        <p className="lede">{draft.summary}</p>
        {draft.coverMediaId && (
          <PrivateImage id={draft.coverMediaId} alt={draft.coverAlt} />
        )}
        <Blocks blocks={draft.blocks} />
      </section>
    );
  return (
    <section className="admin-panel">
      <p className="eyebrow">PROJECT EDITOR</p>
      <h1>
        {project?.trashedAt
          ? 'Moved to trash'
          : id
            ? 'Edit project'
            : 'New project'}
      </h1>
      <p>
        Draft revision: {project?.revision ?? 'Not created yet'} · Published
        revision: {project?.publishedRevision ?? 'Unpublished'}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status">
        {dirty ? 'You have unsaved changes. ' : ''}
        {notice}
      </p>
      {pending && (
        <button disabled={busy} onClick={() => void run(pending)}>
          Confirm previous operation
        </button>
      )}
      {expired && (
        <button
          onClick={() => {
            if (window.confirm('Copy your draft first. Sign in again?'))
              void login().catch((e) => setError(e.message));
          }}
        >
          Sign in again
        </button>
      )}
      <button disabled={busy} onClick={() => void copy()}>
        Copy draft backup
      </button>
      {project?.trashedAt ? (
        <>
          <p>Restoring creates an unpublished draft.</p>
          <button
            className="button"
            disabled={locked}
            onClick={() => setConfirmAction('restore')}
          >
            Restore project
          </button>
        </>
      ) : (
        <>
          <fieldset disabled={locked} className="editor-fields">
            <div className="editor-grid">
              <label>
                Title
                <input
                  value={draft.title}
                  maxLength={120}
                  onChange={(e) => change('title', e.target.value)}
                />
              </label>
              <label>
                Slug
                <input
                  value={draft.slug}
                  maxLength={80}
                  disabled={Boolean(
                    project && project.publishedRevision !== null,
                  )}
                  onChange={(e) => change('slug', e.target.value)}
                />
                <small>
                  Use lowercase letters, numbers, and hyphens only. Unpublish
                  before changing a published slug.
                </small>
              </label>
              <label className="full">
                Summary
                <textarea
                  rows={3}
                  maxLength={360}
                  value={draft.summary}
                  onChange={(e) => change('summary', e.target.value)}
                />
              </label>
              <label>
                Tags (comma-separated, up to 8)
                <input
                  value={tagsText}
                  onChange={(e) => {
                    setTagsText(e.target.value);
                    change(
                      'tags',
                      e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    );
                  }}
                />
              </label>
              <label>
                Technologies (comma-separated, up to 16)
                <input
                  value={techText}
                  onChange={(e) => {
                    setTechText(e.target.value);
                    change(
                      'technologies',
                      e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    );
                  }}
                />
              </label>
              <label>
                Demo URL (HTTPS)
                <input
                  type="url"
                  maxLength={2048}
                  value={draft.demoUrl}
                  onChange={(e) => change('demoUrl', e.target.value)}
                />
              </label>
              <label>
                Repository URL (HTTPS)
                <input
                  type="url"
                  maxLength={2048}
                  value={draft.repositoryUrl}
                  onChange={(e) => change('repositoryUrl', e.target.value)}
                />
              </label>
              <label>
                Display order
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={draft.displayOrder}
                  onChange={(e) =>
                    change('displayOrder', Number(e.target.value))
                  }
                />
              </label>
              <div>
                <label>
                  Cover image
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void upload(e.target.files[0], true);
                      e.target.value = '';
                    }}
                  />
                </label>
                {draft.coverMediaId && (
                  <PrivateImage id={draft.coverMediaId} alt={draft.coverAlt} />
                )}
              </div>
              <label>
                Cover alternative text
                <input
                  value={draft.coverAlt}
                  maxLength={240}
                  onChange={(e) => change('coverAlt', e.target.value)}
                />
              </label>
            </div>
            <h2>Content blocks</h2>
            <p>
              Use headings, paragraphs, lists, links, and images. HTML is not
              accepted.
            </p>
            {draft.blocks.map((block, index) => (
              <fieldset className="block-editor" key={index}>
                <legend>
                  Block {index + 1} · {block.type}
                </legend>
                <BlockEditor
                  block={block}
                  onChange={(value) =>
                    change(
                      'blocks',
                      draft.blocks.map((b, i) => (i === index ? value : b)),
                    )
                  }
                />
                <div className="actions">
                  <button
                    disabled={index === 0}
                    onClick={() => {
                      const blocks = [...draft.blocks];
                      [blocks[index - 1], blocks[index]] = [
                        blocks[index],
                        blocks[index - 1],
                      ];
                      change('blocks', blocks);
                    }}
                  >
                    Move up
                  </button>
                  <button
                    disabled={index === draft.blocks.length - 1}
                    onClick={() => {
                      const blocks = [...draft.blocks];
                      [blocks[index], blocks[index + 1]] = [
                        blocks[index + 1],
                        blocks[index],
                      ];
                      change('blocks', blocks);
                    }}
                  >
                    Move down
                  </button>
                  <button
                    onClick={() => {
                      setRemoved({ block, index });
                      change(
                        'blocks',
                        draft.blocks.filter((_, i) => i !== index),
                      );
                    }}
                  >
                    Remove this draft block
                  </button>
                </div>
              </fieldset>
            ))}
            {removed && (
              <button
                disabled={draft.blocks.length >= 40}
                onClick={() => {
                  const blocks = [...draft.blocks];
                  blocks.splice(
                    Math.min(removed.index, blocks.length),
                    0,
                    removed.block,
                  );
                  change('blocks', blocks);
                  setRemoved(null);
                }}
              >
                Undo last block removal
              </button>
            )}
            <div className="actions">
              {(['heading', 'paragraph', 'list', 'link'] as const).map(
                (type) => (
                  <button
                    key={type}
                    disabled={draft.blocks.length >= 40}
                    onClick={() =>
                      change('blocks', [
                        ...draft.blocks,
                        type === 'list'
                          ? { type, items: [''] }
                          : type === 'link'
                            ? { type, text: '', url: '' }
                            : { type, text: '' },
                      ])
                    }
                  >
                    +{' '}
                    {
                      {
                        heading: 'Heading',
                        paragraph: 'Paragraph',
                        list: 'List',
                        link: 'Link',
                      }[type]
                    }
                  </button>
                ),
              )}
              <label className="upload-button">
                + Image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={draft.blocks.length >= 40}
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      void upload(e.target.files[0], false);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </fieldset>
          <div className="editor-actions">
            <button className="button" disabled={locked} onClick={save}>
              {busy ? 'Working…' : 'Save draft'}
            </button>
            {project && (
              <>
                <button
                  disabled={locked || dirty}
                  onClick={() =>
                    navigate(`/admin/projects/${project.id}/preview`)
                  }
                >
                  Preview saved draft
                </button>
                <button
                  disabled={locked || dirty}
                  onClick={() => setConfirmAction('publish')}
                >
                  Publish saved version
                </button>
                {project.publishedRevision !== null && (
                  <button
                    disabled={locked || dirty}
                    onClick={() => setConfirmAction('unpublish')}
                  >
                    Unpublish
                  </button>
                )}
                <button
                  disabled={locked || dirty}
                  onClick={() => setConfirmAction('trash')}
                >
                  Move to trash
                </button>
              </>
            )}
          </div>
        </>
      )}
      {project?.publishedRevision !== null && project && (
        <p>
          <a
            href={'/projects/' + encodeURIComponent(project.draft.slug)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View public version ↗
          </a>
        </p>
      )}
      {confirmAction && (
        <div
          className="confirmation"
          role="region"
          aria-labelledby="confirm-title"
        >
          <h2 id="confirm-title">
            Confirm{' '}
            {
              {
                save: 'Save',
                publish: 'Publish',
                unpublish: 'Unpublish',
                trash: 'Move to trash',
                restore: 'Restore',
              }[confirmAction]
            }
            {' "'}
            {draft.title || 'Untitled project'}
            {'"?'}
          </h2>
          <p>
            {confirmAction === 'publish'
              ? 'This makes the saved version public.'
              : confirmAction === 'restore'
                ? 'The project will be restored as an unpublished draft.'
                : 'This removes the public version while retaining the project data.'}
          </p>
          <button disabled={locked} onClick={() => action(confirmAction)}>
            Confirm action
          </button>
          <button disabled={busy} onClick={() => setConfirmAction('')}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
function BlockEditor({
  block,
  onChange,
}: {
  block: Block;
  onChange: (block: Block) => void;
}) {
  if (block.type === 'heading' || block.type === 'paragraph')
    return (
      <label>
        {block.type === 'heading' ? 'Heading text' : 'Paragraph text'}
        <textarea
          rows={block.type === 'heading' ? 2 : 5}
          maxLength={4000}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      </label>
    );
  if (block.type === 'list')
    return (
      <label>
        List (one item per line, up to 20)
        <textarea
          rows={5}
          value={block.items.join('\n')}
          onChange={(e) =>
            onChange({ ...block, items: e.target.value.split('\n') })
          }
        />
      </label>
    );
  if (block.type === 'link')
    return (
      <>
        <label>
          Link text
          <input
            value={block.text}
            maxLength={4000}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        </label>
        <label>
          HTTPS URL
          <input
            type="url"
            value={block.url}
            maxLength={2048}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
          />
        </label>
      </>
    );
  if (block.type === 'image')
    return (
      <>
        <PrivateImage id={block.mediaId} alt={block.alt} />
        <label>
          Image alternative text
          <input
            value={block.alt}
            maxLength={240}
            onChange={(e) => onChange({ ...block, alt: e.target.value })}
          />
        </label>
      </>
    );
  return null;
}

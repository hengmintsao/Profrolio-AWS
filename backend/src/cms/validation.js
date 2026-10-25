export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const fail = (status, code, message) => {
  throw new ApiError(status, code, message);
};
export const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function object(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    fail(400, 'VALIDATION', 'Unexpected or invalid fields.');
}
function string(value, max) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    // eslint-disable-next-line no-control-regex -- Reject controls while allowing tab and line breaks in authored text.
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    fail(400, 'VALIDATION', 'Invalid text field.');
  return value.trim();
}
function list(value, max, length) {
  if (!Array.isArray(value) || value.length > max)
    fail(400, 'VALIDATION', 'Invalid list.');
  const result = value.map((item) => string(item, length));
  if (new Set(result).size !== result.length)
    fail(400, 'VALIDATION', 'Duplicate list values.');
  return result;
}
function url(value) {
  value = string(value, 2048);
  if (value) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
        throw Error();
    } catch {
      fail(400, 'VALIDATION', 'Links must use HTTPS.');
    }
  }
  return value;
}
const fields = [
  'slug',
  'title',
  'summary',
  'coverMediaId',
  'coverAlt',
  'blocks',
  'tags',
  'technologies',
  'demoUrl',
  'repositoryUrl',
  'featured',
  'displayOrder',
];
export function draft(input) {
  object(input, fields);
  const value = {
    slug: '',
    title: '',
    summary: '',
    coverMediaId: null,
    coverAlt: '',
    blocks: [],
    tags: [],
    technologies: [],
    demoUrl: '',
    repositoryUrl: '',
    featured: false,
    displayOrder: 0,
    ...input,
  };
  for (const [key, max] of [
    ['slug', 80],
    ['title', 120],
    ['summary', 360],
    ['coverAlt', 240],
  ])
    value[key] = string(value[key], max);
  if (value.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug))
    fail(400, 'VALIDATION', 'Invalid slug.');
  if (value.coverMediaId !== null && !uuid(value.coverMediaId))
    fail(400, 'VALIDATION', 'Invalid cover media.');
  value.tags = list(value.tags, 8, 40);
  value.technologies = list(value.technologies, 16, 40);
  value.demoUrl = url(value.demoUrl);
  value.repositoryUrl = url(value.repositoryUrl);
  if (
    typeof value.featured !== 'boolean' ||
    !Number.isInteger(value.displayOrder) ||
    value.displayOrder < 0 ||
    value.displayOrder > 9999
  )
    fail(400, 'VALIDATION', 'Invalid ordering.');
  if (!Array.isArray(value.blocks) || value.blocks.length > 40)
    fail(400, 'VALIDATION', 'Invalid content blocks.');
  value.blocks = value.blocks.map((block) => {
    if (['paragraph', 'heading'].includes(block?.type)) {
      object(block, ['type', 'text']);
      return { type: block.type, text: string(block.text, 4000) };
    }
    if (block?.type === 'list') {
      object(block, ['type', 'items']);
      return { type: 'list', items: list(block.items, 20, 500) };
    }
    if (block?.type === 'link') {
      object(block, ['type', 'text', 'url']);
      return {
        type: 'link',
        text: string(block.text, 4000),
        url: url(block.url),
      };
    }
    if (block?.type === 'image') {
      object(block, ['type', 'mediaId', 'alt']);
      if (!uuid(block.mediaId)) fail(400, 'VALIDATION', 'Invalid image.');
      return {
        type: 'image',
        mediaId: block.mediaId,
        alt: string(block.alt, 240),
      };
    }
    fail(400, 'VALIDATION', 'Unsupported content block.');
  });
  const images = value.blocks
    .filter((block) => block.type === 'image')
    .map((block) => block.mediaId);
  if (new Set(images).size !== images.length)
    fail(400, 'VALIDATION', 'Duplicate image blocks.');
  return value;
}
export const mediaIds = (value) => [
  ...new Set(
    [
      value.coverMediaId,
      ...value.blocks
        .filter((block) => block.type === 'image')
        .map((block) => block.mediaId),
    ].filter(Boolean),
  ),
];
export function publishable(value) {
  const readable = value.blocks.some(
    (block) =>
      (['paragraph', 'heading'].includes(block.type) && block.text) ||
      (block.type === 'list' && block.items.some(Boolean)) ||
      (block.type === 'link' && block.text && block.url),
  );
  if (
    !value.slug ||
    !value.title ||
    !value.summary ||
    !value.coverMediaId ||
    !value.coverAlt ||
    !readable ||
    value.blocks.some((block) => block.type === 'image' && !block.alt)
  )
    fail(
      400,
      'VALIDATION',
      'Publication requires title, slug, summary, cover, readable content and image descriptions.',
    );
}
export function mutation(body, withDraft = false) {
  object(
    body,
    withDraft
      ? ['operationId', 'expectedRevision', 'draft']
      : ['operationId', 'expectedRevision'],
  );
  if (
    !uuid(body.operationId) ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 1
  )
    fail(400, 'VALIDATION', 'Operation ID and expected revision are required.');
}

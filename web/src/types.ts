export type Block =
  | { type: 'heading' | 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'image'; mediaId: string; alt: string }
  | { type: 'link'; text: string; url: string };
export type Draft = {
  slug: string;
  title: string;
  summary: string;
  coverMediaId: string | null;
  coverAlt: string;
  blocks: Block[];
  tags: string[];
  technologies: string[];
  demoUrl: string;
  repositoryUrl: string;
  featured: boolean;
  displayOrder: number;
};
export type AdminProject = {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  publishedRevision: number | null;
  draft: Draft;
};
export type PublicProject = Draft & {
  id: string;
  revision: number;
  publishedAt: string;
};
export const emptyDraft = (): Draft => ({
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
});

import { useEffect, useState, type ReactNode } from 'react';
import { api, publicMedia, safeUrl } from './api';
import type { Block } from './types';

export function External({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  const href = safeUrl(url);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  ) : null;
}
export function PrivateImage({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setUrl('');
    setError('');
    api<{ url: string }>(`/admin/media/${encodeURIComponent(id)}`, {}, true)
      .then((r) => {
        if (active) setUrl(r.url);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return error ? (
    <p role="alert">Image preview failed: {error}</p>
  ) : url ? (
    <img src={url} alt={alt} />
  ) : (
    <p>Loading image…</p>
  );
}
export function Blocks({ blocks, slug }: { blocks: Block[]; slug?: string }) {
  return (
    <div className="prose">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return <h2 key={index}>{block.text}</h2>;
          case 'paragraph':
            return <p key={index}>{block.text}</p>;
          case 'list':
            return (
              <ul key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            );
          case 'link':
            return (
              <p key={index}>
                <External url={block.url}>{block.text}</External>
              </p>
            );
          case 'image':
            return slug ? (
              <figure key={index}>
                <img src={publicMedia(slug, block.mediaId)} alt={block.alt} />
                <figcaption>{block.alt}</figcaption>
              </figure>
            ) : (
              <PrivateImage key={index} id={block.mediaId} alt={block.alt} />
            );
        }
      })}
    </div>
  );
}

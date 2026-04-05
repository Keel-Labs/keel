import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { useIsMobile } from '../../lib/useIsMobile';

type WikiSectionId = 'home' | 'sources' | 'concepts' | 'open-questions' | 'outputs' | 'health' | 'activity-log';

interface WikiBaseSummary {
  path: string;
  slug: string;
  title: string;
  description: string;
}

interface WikiPage {
  path: string;
  relativePath: string;
  section: WikiSectionId;
  title: string;
  summary: string;
  content: string;
  updatedAt: number;
}

interface TreeNode {
  name: string;
  path?: string;
  isDirectory: boolean;
  children?: TreeNode[];
}

interface Props {
  onBack?: () => void;
  showBack?: boolean;
}

const SECTIONS: Array<{ id: WikiSectionId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'sources', label: 'Sources' },
  { id: 'concepts', label: 'Concepts' },
  { id: 'open-questions', label: 'Open Questions' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'health', label: 'Health' },
  { id: 'activity-log', label: 'Activity Log' },
];

function formatTitle(input: string): string {
  return input
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractTitle(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || fallback;
}

function extractSummary(content: string): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!line.startsWith('#') && !line.startsWith('- ') && !line.startsWith('##')) {
      return line;
    }
  }

  return '';
}

function classifySection(relativePath: string): WikiSectionId | null {
  if (relativePath === 'overview.md' || relativePath === 'wiki/index.md') return 'home';
  if (relativePath === 'wiki/log.md') return 'activity-log';
  if (relativePath.startsWith('wiki/sources/')) return 'sources';
  if (relativePath.startsWith('wiki/concepts/')) return 'concepts';
  if (relativePath.startsWith('wiki/open-questions/')) return 'open-questions';
  if (relativePath.startsWith('outputs/')) return 'outputs';
  if (relativePath.startsWith('health/')) return 'health';
  return null;
}

function sortPages(pages: WikiPage[]): WikiPage[] {
  return [...pages].sort((a, b) => a.title.localeCompare(b.title));
}

function buildTree(pages: WikiPage[], section: WikiSectionId): TreeNode[] {
  const sectionPrefix = getSectionPrefix(section);
  const root: TreeNode[] = [];

  for (const page of pages) {
    if (page.section !== section) continue;
    const suffix = sectionPrefix ? page.relativePath.slice(sectionPrefix.length) : page.relativePath;
    const parts = suffix.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let nodes = root;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const isLeaf = index === parts.length - 1;

      let existing = nodes.find((node) => node.name === part);
      if (!existing) {
        existing = {
          name: part,
          isDirectory: !isLeaf,
          path: isLeaf ? page.path : undefined,
          children: !isLeaf ? [] : undefined,
        };
        nodes.push(existing);
        nodes.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      }

      if (!isLeaf) {
        existing.children ||= [];
        nodes = existing.children;
      }
    }
  }

  return root;
}

function getSectionPrefix(section: WikiSectionId): string {
  switch (section) {
    case 'sources':
      return 'wiki/sources/';
    case 'concepts':
      return 'wiki/concepts/';
    case 'open-questions':
      return 'wiki/open-questions/';
    case 'outputs':
      return 'outputs/';
    case 'health':
      return 'health/';
    case 'activity-log':
      return 'wiki/';
    case 'home':
    default:
      return '';
  }
}

function parseMarkdownLinks(content: string): string[] {
  const links: string[] = [];
  const pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    links.push(match[1]);
  }

  return links;
}

function resolveInternalPath(basePath: string, href: string): string | null {
  if (!href || href.startsWith('#') || /^https?:\/\//.test(href)) {
    return null;
  }

  const normalized = href.replace(/^\.?\//, '').replace(/^\/+/, '');
  if (!normalized) return null;
  if (normalized.startsWith('knowledge-bases/')) return normalized;
  return `${basePath}/${normalized}`;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Unknown';
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.round(deltaMs / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

async function listMarkdownFiles(dirPath: string): Promise<Array<{ path: string; updatedAt: number }>> {
  const entries = await window.keel.listFiles(dirPath);
  const files: Array<{ path: string; updatedAt: number }> = [];

  for (const entry of entries) {
    if (entry.isDirectory) {
      const nested = await listMarkdownFiles(entry.path);
      files.push(...nested);
    } else if (entry.path.endsWith('.md')) {
      files.push({ path: entry.path, updatedAt: entry.updatedAt });
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function renderWikiMarkdown(basePath: string, content: string): string {
  const renderer = new marked.Renderer();
  renderer.link = ({ href = '', text }) => {
    const resolved = resolveInternalPath(basePath, href);
    if (resolved) {
      return `<a href="#" data-wiki-path="${encodeURIComponent(resolved)}">${text}</a>`;
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  return marked.parse(content, { breaks: true, gfm: true, renderer }) as string;
}

function TreeItem({
  node,
  depth,
  activePath,
  onOpen,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onOpen: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.isDirectory) {
    return (
      <div>
        <button
          className="wiki-tree__row"
          onClick={() => setExpanded((value) => !value)}
          style={{ paddingLeft: 12 + depth * 14 }}
        >
          <span className="wiki-tree__chevron">{expanded ? '▾' : '▸'}</span>
          <span>{formatTitle(node.name)}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <TreeItem
            key={`${node.name}-${child.name}`}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onOpen={onOpen}
          />
        ))}
      </div>
    );
  }

  const isActive = node.path === activePath;

  return (
    <button
      className={isActive ? 'wiki-tree__row is-active' : 'wiki-tree__row'}
      onClick={() => node.path && onOpen(node.path)}
      style={{ paddingLeft: 12 + depth * 14 }}
    >
      <span className="wiki-tree__dot">•</span>
      <span>{formatTitle(node.name.replace(/\.md$/, ''))}</span>
    </button>
  );
}

export default function WikiWorkspace({ onBack, showBack = true }: Props) {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bases, setBases] = useState<WikiBaseSummary[]>([]);
  const [currentBasePath, setCurrentBasePath] = useState('');
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [activeSection, setActiveSection] = useState<WikiSectionId>('home');
  const [selectedPagePath, setSelectedPagePath] = useState<string | null>(null);

  const loadBaseSummaries = useCallback(async () => {
    await window.keel.ensureBrain();
    const baseEntries = await window.keel.listFiles('knowledge-bases');
    const baseDirs = baseEntries.filter((entry) => entry.isDirectory);

    const summaries = await Promise.all(baseDirs.map(async (entry) => {
      const overviewPath = `${entry.path}/overview.md`;
      let title = formatTitle(entry.name);
      let description = 'LLM-maintained wiki workspace.';

      try {
        const content = await window.keel.readFile(overviewPath);
        title = extractTitle(content, title);
        description = extractSummary(content) || description;
      } catch {
        // Keep fallback labels.
      }

      return {
        path: entry.path,
        slug: entry.name,
        title,
        description,
      };
    }));

    setBases(summaries);
    if (!currentBasePath && summaries[0]) {
      setCurrentBasePath(summaries[0].path);
    }
  }, [currentBasePath]);

  const loadCurrentBase = useCallback(async () => {
    if (!currentBasePath) return;
    const files = await listMarkdownFiles(currentBasePath);
    const visibleFiles = files.filter((file) => !file.path.endsWith('/AGENTS.md') && !file.path.includes('/raw/'));

    const nextPages = await Promise.all(visibleFiles.map(async (file) => {
      const content = await window.keel.readFile(file.path);
      const relativePath = file.path.slice(`${currentBasePath}/`.length);
      const section = classifySection(relativePath);
      if (!section) return null;

      return {
        path: file.path,
        relativePath,
        section,
        title: extractTitle(content, formatTitle(relativePath.replace(/\.md$/, '').split('/').pop() || relativePath)),
        summary: extractSummary(content),
        content,
        updatedAt: file.updatedAt,
      } satisfies WikiPage;
    }));

    const filtered = nextPages.filter(Boolean) as WikiPage[];
    setPages(filtered);

    if (!selectedPagePath) {
      setActiveSection('home');
    } else if (!filtered.some((page) => page.path === selectedPagePath)) {
      setSelectedPagePath(null);
      setActiveSection('home');
    }
  }, [currentBasePath, selectedPagePath]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError('');
        await loadBaseSummaries();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load wiki bases.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBaseSummaries]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!currentBasePath) return;
      try {
        setLoading(true);
        await loadCurrentBase();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load wiki pages.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentBasePath, loadCurrentBase]);

  const currentBase = useMemo(
    () => bases.find((base) => base.path === currentBasePath) || bases[0] || null,
    [bases, currentBasePath]
  );

  const sectionPages = useMemo(
    () => sortPages(pages.filter((page) => page.section === activeSection)),
    [activeSection, pages]
  );

  const selectedPage = useMemo(
    () => pages.find((page) => page.path === selectedPagePath) || null,
    [pages, selectedPagePath]
  );

  const conceptPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'concepts')), [pages]);
  const sourcePages = useMemo(() => sortPages(pages.filter((page) => page.section === 'sources')), [pages]);
  const questionPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'open-questions')), [pages]);
  const outputPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'outputs')), [pages]);

  const sectionTree = useMemo(
    () => buildTree(pages, activeSection),
    [activeSection, pages]
  );

  const renderedPage = useMemo(() => {
    if (!selectedPage || !currentBasePath) return '';
    return renderWikiMarkdown(currentBasePath, selectedPage.content);
  }, [currentBasePath, selectedPage]);

  const outgoingLinks = useMemo(() => {
    if (!selectedPage || !currentBasePath) return [] as WikiPage[];
    const targets = new Set(
      parseMarkdownLinks(selectedPage.content)
        .map((link) => resolveInternalPath(currentBasePath, link))
        .filter(Boolean) as string[]
    );

    return pages.filter((page) => page.path !== selectedPage.path && targets.has(page.path));
  }, [currentBasePath, pages, selectedPage]);

  const backlinks = useMemo(() => {
    if (!selectedPage || !currentBasePath) return [] as WikiPage[];
    return pages.filter((page) => {
      if (page.path === selectedPage.path) return false;
      return parseMarkdownLinks(page.content)
        .map((link) => resolveInternalPath(currentBasePath, link))
        .some((resolved) => resolved === selectedPage.path);
    });
  }, [currentBasePath, pages, selectedPage]);

  const sourceRefs = useMemo(
    () => outgoingLinks.filter((page) => page.section === 'sources'),
    [outgoingLinks]
  );

  const openPage = useCallback((path: string) => {
    const page = pages.find((candidate) => candidate.path === path);
    if (!page) return;
    setActiveSection(page.section);
    setSelectedPagePath(page.path);
  }, [pages]);

  const handleRenderedPageClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a[data-wiki-path]') as HTMLAnchorElement | null;
    if (!anchor) return;
    event.preventDefault();
    const encoded = anchor.dataset.wikiPath;
    if (!encoded) return;
    openPage(decodeURIComponent(encoded));
  }, [openPage]);

  const openSection = useCallback((section: WikiSectionId) => {
    setActiveSection(section);
    setSelectedPagePath(null);

    if (section === 'activity-log') {
      const logPage = pages.find((page) => page.relativePath === 'wiki/log.md');
      if (logPage) {
        setSelectedPagePath(logPage.path);
      }
    }
  }, [pages]);

  const lastUpdatedAt = useMemo(
    () => pages.reduce((latest, page) => Math.max(latest, page.updatedAt), 0),
    [pages]
  );

  const renderHome = () => (
    <div className="wiki-home">
      <div className="wiki-home__hero">
        <div className="wiki-home__badge">Sample Base</div>
        <h1 className="wiki-home__title">{currentBase?.title || 'Wiki'}</h1>
        <p className="wiki-home__description">{currentBase?.description || 'Explore a structured, cross-linked wiki workspace.'}</p>
        <div className="wiki-home__stats">
          <div className="wiki-home__stat"><strong>{sourcePages.length}</strong><span>Sources</span></div>
          <div className="wiki-home__stat"><strong>{conceptPages.length}</strong><span>Concepts</span></div>
          <div className="wiki-home__stat"><strong>{outputPages.length}</strong><span>Outputs</span></div>
          <div className="wiki-home__stat"><strong>{formatRelativeTime(lastUpdatedAt)}</strong><span>Last updated</span></div>
        </div>
      </div>

      <div className="wiki-home__grid">
        <div className="wiki-home__card">
          <div className="wiki-home__card-title">Key Concepts</div>
          {conceptPages.slice(0, 4).map((page) => (
            <button key={page.path} className="wiki-home__link" onClick={() => openPage(page.path)}>
              {page.title}
            </button>
          ))}
        </div>
        <div className="wiki-home__card">
          <div className="wiki-home__card-title">Key Sources</div>
          {sourcePages.slice(0, 4).map((page) => (
            <button key={page.path} className="wiki-home__link" onClick={() => openPage(page.path)}>
              {page.title}
            </button>
          ))}
        </div>
        <div className="wiki-home__card">
          <div className="wiki-home__card-title">Open Questions</div>
          {questionPages.slice(0, 4).map((page) => (
            <button key={page.path} className="wiki-home__link" onClick={() => openPage(page.path)}>
              {page.title}
            </button>
          ))}
        </div>
        <div className="wiki-home__card">
          <div className="wiki-home__card-title">Recent Outputs</div>
          {outputPages.slice(0, 4).map((page) => (
            <button key={page.path} className="wiki-home__link" onClick={() => openPage(page.path)}>
              {page.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderCollection = () => (
    <div className="wiki-collection">
      <div className="wiki-collection__eyebrow">{SECTIONS.find((section) => section.id === activeSection)?.label}</div>
      <h2 className="wiki-collection__title">
        {SECTIONS.find((section) => section.id === activeSection)?.label}
      </h2>
      <div className="wiki-collection__list">
        {sectionPages.map((page) => (
          <button key={page.path} className="wiki-collection__item" onClick={() => openPage(page.path)}>
            <div className="wiki-collection__item-title">{page.title}</div>
            {page.summary && <div className="wiki-collection__item-summary">{page.summary}</div>}
          </button>
        ))}
        {sectionPages.length === 0 && (
          <div className="wiki-collection__empty">No pages in this section yet.</div>
        )}
      </div>
    </div>
  );

  if (loading && !bases.length && !pages.length) {
    return <div className="wiki-shell wiki-shell--loading">Loading wiki...</div>;
  }

  if (error) {
    return <div className="wiki-shell wiki-shell--loading">{error}</div>;
  }

  return (
    <div className="wiki-shell">
      <div className="wiki-shell__header">
        <div className="wiki-shell__header-left">
          {showBack && onBack && isMobile && (
            <button className="wiki-shell__back" onClick={onBack}>←</button>
          )}
          <div className="wiki-shell__eyebrow">Wiki</div>
          <div className="wiki-shell__title-row">
            <select
              className="wiki-shell__base-select"
              value={currentBasePath}
              onChange={(event) => {
                setCurrentBasePath(event.target.value);
                setActiveSection('home');
                setSelectedPagePath(null);
              }}
            >
              {bases.map((base) => (
                <option key={base.path} value={base.path}>{base.title}</option>
              ))}
            </select>
          </div>
          <div className="wiki-shell__subtitle">
            {currentBase?.description || 'LLM-maintained wiki workspace'}
          </div>
        </div>

        <div className="wiki-shell__actions">
          <button className="wiki-shell__action" onClick={() => openSection('sources')}>Add Source</button>
          <button
            className="wiki-shell__action"
            onClick={() => {
              const indexPage = pages.find((page) => page.relativePath === 'wiki/index.md');
              if (indexPage) openPage(indexPage.path);
            }}
          >
            Compile
          </button>
          <button
            className="wiki-shell__action"
            onClick={() => {
              const defaultOutput = outputPages[0];
              if (defaultOutput) openPage(defaultOutput.path);
            }}
          >
            Ask
          </button>
          <button
            className="wiki-shell__action"
            onClick={() => {
              const latestHealth = pages.find((page) => page.relativePath === 'health/latest.md');
              if (latestHealth) openPage(latestHealth.path);
            }}
          >
            Health Check
          </button>
        </div>
      </div>

      <div className={isMobile ? 'wiki-shell__body is-mobile' : 'wiki-shell__body'}>
        <aside className="wiki-shell__nav">
          <div className="wiki-nav__group">
            {SECTIONS.map((section) => {
              const isActive = activeSection === section.id && (section.id === 'home' || !selectedPage || selectedPage.section === section.id);
              return (
                <button
                  key={section.id}
                  className={isActive ? 'wiki-nav__section is-active' : 'wiki-nav__section'}
                  onClick={() => openSection(section.id)}
                >
                  {section.label}
                </button>
              );
            })}
          </div>

          {!isMobile && activeSection !== 'home' && (
            <div className="wiki-nav__tree">
              <div className="wiki-nav__label">Pages</div>
              {sectionTree.map((node) => (
                <TreeItem
                  key={`${activeSection}-${node.name}`}
                  node={node}
                  depth={0}
                  activePath={selectedPagePath}
                  onOpen={openPage}
                />
              ))}
            </div>
          )}
        </aside>

        <main className="wiki-shell__content">
          {activeSection === 'home' && !selectedPage && renderHome()}
          {activeSection !== 'home' && !selectedPage && renderCollection()}
          {selectedPage && (
            <div className="wiki-page">
              <div className="wiki-page__path">{selectedPage.relativePath}</div>
              <h1 className="wiki-page__title">{selectedPage.title}</h1>
              {selectedPage.summary && <p className="wiki-page__summary">{selectedPage.summary}</p>}
              <div
                className="markdown-body wiki-page__body"
                onClick={handleRenderedPageClick}
                dangerouslySetInnerHTML={{ __html: renderedPage }}
              />
            </div>
          )}
        </main>

        {!isMobile && (
          <aside className="wiki-shell__meta">
            {!selectedPage ? (
              <div className="wiki-meta">
                <div className="wiki-meta__label">Current Base</div>
                <div className="wiki-meta__title">{currentBase?.title || 'Wiki'}</div>
                <div className="wiki-meta__text">{currentBase?.description}</div>
              </div>
            ) : (
              <div className="wiki-meta">
                <div className="wiki-meta__label">Page Context</div>
                <div className="wiki-meta__title">{selectedPage.title}</div>
                <div className="wiki-meta__text">Updated {formatRelativeTime(selectedPage.updatedAt)}</div>

                <div className="wiki-meta__section">
                  <div className="wiki-meta__section-title">Backlinks</div>
                  {backlinks.length === 0 && <div className="wiki-meta__empty">No backlinks yet.</div>}
                  {backlinks.map((page) => (
                    <button key={page.path} className="wiki-meta__link" onClick={() => openPage(page.path)}>
                      {page.title}
                    </button>
                  ))}
                </div>

                <div className="wiki-meta__section">
                  <div className="wiki-meta__section-title">Source Refs</div>
                  {sourceRefs.length === 0 && <div className="wiki-meta__empty">No direct source references.</div>}
                  {sourceRefs.map((page) => (
                    <button key={page.path} className="wiki-meta__link" onClick={() => openPage(page.path)}>
                      {page.title}
                    </button>
                  ))}
                </div>

                <div className="wiki-meta__section">
                  <div className="wiki-meta__section-title">Related Pages</div>
                  {outgoingLinks.length === 0 && <div className="wiki-meta__empty">No related pages linked from this page.</div>}
                  {outgoingLinks.map((page) => (
                    <button key={page.path} className="wiki-meta__link" onClick={() => openPage(page.path)}>
                      {page.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

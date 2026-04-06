import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { useIsMobile } from '../../lib/useIsMobile';
import type { WikiJob } from '../../shared/types';
import type { WikiNavId, WikiSidebarBranch, WikiSidebarState } from './Sidebar';

type WikiPageSection = 'home' | 'sources' | 'concepts' | 'open-questions' | 'outputs' | 'health' | 'activity-log';

interface WikiBaseSummary {
  path: string;
  slug: string;
  title: string;
  description: string;
}

interface WikiPage {
  path: string;
  relativePath: string;
  section: WikiPageSection;
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

interface BreadcrumbItem {
  id: string;
  label: string;
  onClick?: () => void;
}

export interface WikiCommand {
  type: 'nav' | 'page';
  target: string;
  nonce: number;
}

interface Props {
  onBack?: () => void;
  showBack?: boolean;
  contextOpen?: boolean;
  command?: WikiCommand | null;
  onSidebarStateChange?: (state: WikiSidebarState) => void;
}

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

function classifySection(relativePath: string): WikiPageSection | null {
  if (relativePath === 'overview.md' || relativePath === 'wiki/index.md') return 'home';
  if (relativePath === 'wiki/log.md') return 'activity-log';
  if (relativePath.startsWith('wiki/sources/')) return 'sources';
  if (relativePath.startsWith('wiki/concepts/')) return 'concepts';
  if (relativePath.startsWith('wiki/open-questions/')) return 'open-questions';
  if (relativePath.startsWith('outputs/')) return 'outputs';
  if (relativePath.startsWith('health/')) return 'health';
  return null;
}

function mapPageSectionToNav(section: WikiPageSection): WikiNavId {
  switch (section) {
    case 'sources':
      return 'sources';
    case 'concepts':
      return 'concepts';
    case 'open-questions':
      return 'open-questions';
    case 'outputs':
      return 'artifacts';
    case 'health':
      return 'health';
    case 'activity-log':
    case 'home':
    default:
      return 'synthesis';
  }
}

function navLabel(nav: WikiNavId): string {
  switch (nav) {
    case 'sources':
      return 'Source';
    case 'concepts':
      return 'Concepts';
    case 'open-questions':
      return 'Open Questions';
    case 'artifacts':
      return 'Artifacts';
    case 'health':
      return 'Health';
    case 'synthesis':
    default:
      return 'Synthesis';
  }
}

function sortPages(pages: WikiPage[]): WikiPage[] {
  return [...pages].sort((a, b) => a.title.localeCompare(b.title));
}

function getTreePrefixForNav(nav: WikiNavId): string | null {
  switch (nav) {
    case 'sources':
      return 'wiki/sources/';
    case 'concepts':
      return 'wiki/concepts/';
    case 'open-questions':
      return 'wiki/open-questions/';
    case 'artifacts':
      return 'outputs/';
    case 'health':
      return 'health/';
    case 'synthesis':
    default:
      return null;
  }
}

function buildTreeForNav(pages: WikiPage[], nav: WikiNavId): TreeNode[] {
  const prefix = getTreePrefixForNav(nav);
  if (!prefix) return [];

  const relevantPages = pages.filter((page) => mapPageSectionToNav(page.section) === nav);
  const root: TreeNode[] = [];

  for (const page of relevantPages) {
    const suffix = page.relativePath.slice(prefix.length);
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

function treeToBranches(nodes: TreeNode[]): WikiSidebarBranch[] {
  return nodes.map((node) => {
    if (!node.isDirectory) {
      return {
        id: node.path || node.name,
        label: formatTitle(node.name.replace(/\.md$/, '')),
        path: node.path,
      };
    }

    return {
      id: node.name,
      label: formatTitle(node.name),
      children: (node.children || [])
        .filter((child) => !child.isDirectory && child.path)
        .map((child) => ({
          path: child.path as string,
          label: formatTitle(child.name.replace(/\.md$/, '')),
        })),
    };
  });
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

function normalizeRelativePath(pathValue: string): string {
  const parts = pathValue.split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }

  return stack.join('/');
}

function resolveWikiHref(basePath: string, currentRelativePath: string, href: string): string | null {
  if (!href || href.startsWith('#') || /^https?:\/\//.test(href)) return null;
  if (href.startsWith('knowledge-bases/')) return href;

  const normalizedHref = href.replace(/^\/+/, '');
  const isBaseRelative =
    normalizedHref === 'overview.md' ||
    normalizedHref.startsWith('wiki/') ||
    normalizedHref.startsWith('outputs/') ||
    normalizedHref.startsWith('health/');

  if (isBaseRelative) {
    return `${basePath}/${normalizeRelativePath(normalizedHref)}`;
  }

  const currentDir = currentRelativePath.includes('/')
    ? currentRelativePath.slice(0, currentRelativePath.lastIndexOf('/') + 1)
    : '';

  return `${basePath}/${normalizeRelativePath(`${currentDir}${normalizedHref}`)}`;
}

function renderWikiMarkdown(basePath: string, currentRelativePath: string, content: string): string {
  const renderer = new marked.Renderer();
  renderer.link = ({ href = '', text }) => {
    const resolved = resolveWikiHref(basePath, currentRelativePath, href);
    if (resolved) {
      return `<button type="button" class="wiki-inline-link" data-wiki-path="${encodeURIComponent(resolved)}">${text}</button>`;
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  return marked.parse(content, { breaks: true, gfm: true, renderer }) as string;
}

function getBranchesForNav(pages: WikiPage[], nav: WikiNavId): WikiSidebarBranch[] {
  if (nav === 'synthesis') {
    return [
      { id: 'overview', label: 'Overview', path: pages.find((page) => page.relativePath === 'overview.md')?.path },
      { id: 'index', label: 'Wiki Index', path: pages.find((page) => page.relativePath === 'wiki/index.md')?.path },
      { id: 'log', label: 'Activity Log', path: pages.find((page) => page.relativePath === 'wiki/log.md')?.path },
    ].filter((branch) => branch.path) as WikiSidebarBranch[];
  }

  return treeToBranches(buildTreeForNav(pages, nav));
}

function getCollectionPrefixForPage(relativePath: string, nav: WikiNavId): string | null {
  const treePrefix = getTreePrefixForNav(nav);
  if (!treePrefix) return null;

  const suffix = relativePath.startsWith(treePrefix)
    ? relativePath.slice(treePrefix.length)
    : relativePath;
  const lastSlashIndex = suffix.lastIndexOf('/');
  if (lastSlashIndex === -1) return null;

  return `${treePrefix}${suffix.slice(0, lastSlashIndex + 1)}`;
}

export default function WikiWorkspace({
  onBack,
  showBack = true,
  contextOpen = false,
  command,
  onSidebarStateChange,
}: Props) {
  const isMobile = useIsMobile();
  const baseMenuRef = useRef<HTMLDivElement | null>(null);
  const handledCommandNonceRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bases, setBases] = useState<WikiBaseSummary[]>([]);
  const [currentBasePath, setCurrentBasePath] = useState('');
  const [baseMenuOpen, setBaseMenuOpen] = useState(false);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [activeNav, setActiveNav] = useState<WikiNavId>('synthesis');
  const [activeCollectionPrefix, setActiveCollectionPrefix] = useState<string | null>(null);
  const [selectedPagePath, setSelectedPagePath] = useState<string | null>(null);
  const [jobs, setJobs] = useState<WikiJob[]>([]);
  const [jobError, setJobError] = useState('');
  const lastTerminalJobRef = useRef<string | null>(null);

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
    if (!currentBasePath) return [] as WikiPage[];
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

    if (selectedPagePath && !filtered.some((page) => page.path === selectedPagePath)) {
      setSelectedPagePath(null);
      setActiveNav('synthesis');
      setActiveCollectionPrefix(null);
    }

    return filtered;
  }, [currentBasePath, selectedPagePath]);

  const loadJobs = useCallback(async () => {
    if (!currentBasePath) {
      setJobs([]);
      return [];
    }

    const nextJobs = await window.keel.listWikiJobs(currentBasePath);
    setJobs(nextJobs);
    return nextJobs;
  }, [currentBasePath]);

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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!currentBasePath) return;
      try {
        const nextJobs = await loadJobs();
        if (cancelled) return;
        const latestTerminal = nextJobs.find((job) => job.status === 'completed' || job.status === 'failed');
        if (latestTerminal && latestTerminal.id !== lastTerminalJobRef.current) {
          lastTerminalJobRef.current = latestTerminal.id;
          await loadCurrentBase();
        }
      } catch (err) {
        if (!cancelled) {
          setJobError(err instanceof Error ? err.message : 'Failed to load wiki jobs.');
        }
      }
    })();

    const interval = window.setInterval(() => {
      loadJobs().catch(() => undefined);
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentBasePath, loadCurrentBase, loadJobs]);

  const currentBase = useMemo(
    () => bases.find((base) => base.path === currentBasePath) || bases[0] || null,
    [bases, currentBasePath]
  );

  const selectedPage = useMemo(
    () => pages.find((page) => page.path === selectedPagePath) || null,
    [pages, selectedPagePath]
  );

  const sourcePages = useMemo(() => sortPages(pages.filter((page) => page.section === 'sources')), [pages]);
  const conceptPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'concepts')), [pages]);
  const questionPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'open-questions')), [pages]);
  const artifactPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'outputs')), [pages]);
  const healthPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'health')), [pages]);

  const currentCollectionPages = useMemo(() => {
    let sectionPages: WikiPage[];

    switch (activeNav) {
      case 'sources':
        sectionPages = sourcePages;
        break;
      case 'concepts':
        sectionPages = conceptPages;
        break;
      case 'open-questions':
        sectionPages = questionPages;
        break;
      case 'artifacts':
        sectionPages = artifactPages;
        break;
      case 'health':
        sectionPages = healthPages;
        break;
      case 'synthesis':
      default:
        sectionPages = [];
        break;
    }

    if (!activeCollectionPrefix) {
      return sectionPages;
    }

    return sectionPages.filter((page) => page.relativePath.startsWith(activeCollectionPrefix));
  }, [activeCollectionPrefix, activeNav, artifactPages, conceptPages, healthPages, questionPages, sourcePages]);

  const lastUpdatedAt = useMemo(
    () => pages.reduce((latest, page) => Math.max(latest, page.updatedAt), 0),
    [pages]
  );

  const activeJob = useMemo(
    () => jobs.find((job) => job.status === 'queued' || job.status === 'running') || null,
    [jobs]
  );

  const latestJob = useMemo(
    () => jobs[0] || null,
    [jobs]
  );

  const renderedPage = useMemo(() => {
    if (!selectedPage || !currentBasePath) return '';
    return renderWikiMarkdown(currentBasePath, selectedPage.relativePath, selectedPage.content);
  }, [currentBasePath, selectedPage]);

  const outgoingLinks = useMemo(() => {
    if (!selectedPage || !currentBasePath) return [] as WikiPage[];
    const targets = new Set(
      parseMarkdownLinks(selectedPage.content)
        .map((link) => resolveWikiHref(currentBasePath, selectedPage.relativePath, link))
        .filter(Boolean) as string[]
    );

    return pages.filter((page) => page.path !== selectedPage.path && targets.has(page.path));
  }, [currentBasePath, pages, selectedPage]);

  const backlinks = useMemo(() => {
    if (!selectedPage || !currentBasePath) return [] as WikiPage[];
    return pages.filter((page) => {
      if (page.path === selectedPage.path) return false;
      return parseMarkdownLinks(page.content)
        .map((link) => resolveWikiHref(currentBasePath, page.relativePath, link))
        .some((resolved) => resolved === selectedPage.path);
    });
  }, [currentBasePath, pages, selectedPage]);

  const sourceRefs = useMemo(
    () => outgoingLinks.filter((page) => page.section === 'sources'),
    [outgoingLinks]
  );

  const branches = useMemo(
    () => getBranchesForNav(pages, activeNav),
    [activeNav, pages]
  );

  const openPage = useCallback((path: string): boolean => {
    const page = pages.find((candidate) => candidate.path === path);
    if (!page) return false;
    const nav = mapPageSectionToNav(page.section);
    setSelectedPagePath(page.path);
    setActiveNav(nav);
    setActiveCollectionPrefix(getCollectionPrefixForPage(page.relativePath, nav));
    setBaseMenuOpen(false);
    return true;
  }, [pages]);

  const startCompile = useCallback(async () => {
    if (!currentBasePath || activeJob) return;
    setJobError('');
    const job = await window.keel.startWikiCompile(currentBasePath);
    setJobs((prev) => [job, ...prev.filter((candidate) => candidate.id !== job.id)]);
  }, [activeJob, currentBasePath]);

  const startHealthCheck = useCallback(async () => {
    if (!currentBasePath || activeJob) return;
    setJobError('');
    const job = await window.keel.startWikiHealthCheck(currentBasePath);
    setJobs((prev) => [job, ...prev.filter((candidate) => candidate.id !== job.id)]);
  }, [activeJob, currentBasePath]);

  const openNav = useCallback((nav: WikiNavId) => {
    setActiveNav(nav);
    setActiveCollectionPrefix(null);
    setSelectedPagePath(null);
    setBaseMenuOpen(false);
  }, []);

  const openCollection = useCallback((nav: WikiNavId, prefix: string | null) => {
    setActiveNav(nav);
    setActiveCollectionPrefix(prefix);
    setSelectedPagePath(null);
    setBaseMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!command) return;
    if (handledCommandNonceRef.current === command.nonce) return;

    if (command.type === 'nav') {
      openNav(command.target as WikiNavId);
      handledCommandNonceRef.current = command.nonce;
      return;
    }

    if (command.type === 'page') {
      const opened = openPage(command.target);
      if (opened) {
        handledCommandNonceRef.current = command.nonce;
      }
    }
  }, [command, openNav, openPage]);

  useEffect(() => {
    onSidebarStateChange?.({
      activeNav,
      selectedPagePath,
      branches,
    });
  }, [activeNav, branches, onSidebarStateChange, selectedPagePath]);

  useEffect(() => {
    if (!baseMenuOpen) return;

    const handleClick = (event: MouseEvent) => {
      if (!baseMenuRef.current?.contains(event.target as Node)) {
        setBaseMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [baseMenuOpen]);

  useEffect(() => {
    const handleFocus = () => {
      loadBaseSummaries().catch(() => undefined);
      loadCurrentBase().catch(() => undefined);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadBaseSummaries, loadCurrentBase]);

  const handleRenderedPageClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const linkTarget = target.closest('[data-wiki-path]') as HTMLElement | null;
    if (!linkTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const encoded = linkTarget.dataset.wikiPath;
    if (!encoded) return;
    openPage(decodeURIComponent(encoded));
  }, [openPage]);

  const pageBreadcrumbs = useMemo(() => {
    if (!selectedPage) return [] as BreadcrumbItem[];

    const nav = mapPageSectionToNav(selectedPage.section);
    const items: BreadcrumbItem[] = [
      {
        id: 'base',
        label: currentBase?.title || 'Wiki',
        onClick: () => openNav('synthesis'),
      },
    ];

    if (!(nav === 'synthesis' && selectedPage.relativePath === 'overview.md')) {
      items.push({
        id: 'nav',
        label: navLabel(nav),
        onClick: () => openNav(nav),
      });
    }

    const treePrefix = getTreePrefixForNav(nav);
    if (treePrefix && selectedPage.relativePath.startsWith(treePrefix)) {
      const suffix = selectedPage.relativePath.slice(treePrefix.length);
      const parts = suffix.split('/').filter(Boolean);
      const folderParts = parts.slice(0, -1);
      let prefixAccumulator = treePrefix;

      folderParts.forEach((part, index) => {
        prefixAccumulator = `${prefixAccumulator}${part}/`;
        items.push({
          id: `folder-${index}-${part}`,
          label: formatTitle(part),
          onClick: () => openCollection(nav, prefixAccumulator),
        });
      });
    }

    const lastLabel = items[items.length - 1]?.label;
    if (lastLabel !== selectedPage.title) {
      items.push({
        id: 'page',
        label: selectedPage.title,
      });
    }

    return items;
  }, [currentBase?.title, openCollection, openNav, selectedPage]);

  const collectionTitle = useMemo(() => {
    if (!activeCollectionPrefix) {
      return navLabel(activeNav);
    }

    const trimmed = activeCollectionPrefix.replace(/\/$/, '');
    const parts = trimmed.split('/');
    return formatTitle(parts[parts.length - 1] || navLabel(activeNav));
  }, [activeCollectionPrefix, activeNav]);

  const renderHome = () => (
    <div className="wiki-home">
      <div className="wiki-home__hero">
        <div className="wiki-home__badge">Sample Base</div>
        <h1 className="wiki-home__title">{currentBase?.title || 'Wiki'}</h1>
        <p className="wiki-home__description">{currentBase?.description || 'Explore a structured, cross-linked wiki workspace.'}</p>
        <div className="wiki-home__stats">
          <div className="wiki-home__stat"><strong>{sourcePages.length}</strong><span>Sources</span></div>
          <div className="wiki-home__stat"><strong>{conceptPages.length}</strong><span>Concepts</span></div>
          <div className="wiki-home__stat"><strong>{artifactPages.length}</strong><span>Artifacts</span></div>
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
          <div className="wiki-home__card-title">Artifacts</div>
          {artifactPages.slice(0, 4).map((page) => (
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
      <div className="wiki-collection__eyebrow">Wiki</div>
      <h2 className="wiki-collection__title">{collectionTitle}</h2>
      <div className="wiki-collection__list">
        {currentCollectionPages.map((page) => (
          <button key={page.path} className="wiki-collection__item" onClick={() => openPage(page.path)}>
            <div className="wiki-collection__item-title">{page.title}</div>
            {page.summary && <div className="wiki-collection__item-summary">{page.summary}</div>}
          </button>
        ))}
        {currentCollectionPages.length === 0 && (
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
            <div className="wiki-base-menu" ref={baseMenuRef}>
              <button
                type="button"
                className={baseMenuOpen ? 'wiki-shell__base-select is-open' : 'wiki-shell__base-select'}
                onClick={() => setBaseMenuOpen((value) => !value)}
              >
                <span>{currentBase?.title || 'Select wiki base'}</span>
                <span className="wiki-base-menu__chevron">{baseMenuOpen ? '▴' : '▾'}</span>
              </button>

              {baseMenuOpen && (
                <div className="wiki-base-menu__popover">
                  {bases.map((base) => {
                    const active = base.path === currentBasePath;
                    return (
                      <button
                        type="button"
                        key={base.path}
                        className={active ? 'wiki-base-menu__option is-active' : 'wiki-base-menu__option'}
                        onClick={() => {
                          setCurrentBasePath(base.path);
                          setActiveNav('synthesis');
                          setSelectedPagePath(null);
                          setBaseMenuOpen(false);
                        }}
                      >
                        <span className="wiki-base-menu__option-title">{base.title}</span>
                        <span className="wiki-base-menu__option-text">{base.description}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="wiki-base-menu__option"
                    onClick={() => {
                      setBaseMenuOpen(false);
                      window.keel.openUtilityWindow('settings', {
                        section: 'knowledge-sources',
                        createBase: '1',
                      }).catch(() => undefined);
                    }}
                  >
                    <span className="wiki-base-menu__option-title">Create New Base</span>
                    <span className="wiki-base-menu__option-text">Open Sources settings and initialize a new wiki base.</span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="wiki-shell__action"
              onClick={() => {
                const query: Record<string, string> = { section: 'knowledge-sources' };
                if (currentBasePath) query.basePath = currentBasePath;
                window.keel.openUtilityWindow('settings', query).catch(() => undefined);
              }}
            >
              Sources
            </button>
            <button
              type="button"
              className="wiki-shell__action"
              disabled={!!activeJob}
              onClick={() => {
                startCompile().catch((err) => {
                  setJobError(err instanceof Error ? err.message : 'Compile failed.');
                });
              }}
            >
              Compile
            </button>
            <button
              type="button"
              className="wiki-shell__action"
              disabled={!!activeJob}
              onClick={() => {
                startHealthCheck().catch((err) => {
                  setJobError(err instanceof Error ? err.message : 'Health check failed.');
                });
              }}
            >
              Health Check
            </button>
          </div>
          <div className="wiki-shell__subtitle">
            {currentBase?.description || 'LLM-maintained wiki workspace'}
          </div>
          {(activeJob || latestJob || jobError) && (
            <div className="wiki-shell__job">
              {jobError ? (
                <>
                  <span className="wiki-shell__job-status is-failed">Issue</span>
                  <span className="wiki-shell__job-detail">{jobError}</span>
                </>
              ) : activeJob ? (
                <>
                  <span className="wiki-shell__job-status is-running">{activeJob.type === 'compile' ? 'Compile running' : 'Health running'}</span>
                  <span className="wiki-shell__job-detail">{activeJob.detail}</span>
                </>
              ) : latestJob ? (
                <>
                  <span className={`wiki-shell__job-status ${latestJob.status === 'failed' ? 'is-failed' : 'is-completed'}`}>
                    {latestJob.status === 'failed' ? 'Last run failed' : latestJob.type === 'compile' ? 'Compile complete' : 'Health complete'}
                  </span>
                  <span className="wiki-shell__job-detail">
                    {latestJob.error || latestJob.detail} · {formatRelativeTime(latestJob.updatedAt)}
                  </span>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className={isMobile ? 'wiki-shell__body is-mobile' : 'wiki-shell__body'}>
        <main className="wiki-shell__content">
          {activeNav === 'synthesis' && !selectedPage && renderHome()}
          {activeNav !== 'synthesis' && !selectedPage && renderCollection()}
          {selectedPage && (
            <div className="wiki-page">
              <div className="wiki-page__path">
                {pageBreadcrumbs.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 && <span className="wiki-page__path-separator">/</span>}
                    {item.onClick ? (
                      <button type="button" className="wiki-page__crumb" onClick={item.onClick}>
                        {item.label}
                      </button>
                    ) : (
                      <span className="wiki-page__crumb is-current">{item.label}</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
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

        {!isMobile && contextOpen && (
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

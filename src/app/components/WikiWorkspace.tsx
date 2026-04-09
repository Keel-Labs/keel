import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { useIsMobile } from '../../lib/useIsMobile';
import type {
  WikiBaseSummary as SharedWikiBaseSummary,
  WikiFileImport,
  WikiIngestResult,
  WikiJob,
  WikiSourceInput,
  WikiSourceType,
} from '../../shared/types';
import type { WikiNavId, WikiSidebarBranch, WikiSidebarState } from './Sidebar';

type WikiPageSection =
  | 'overview'
  | 'sources'
  | 'concepts'
  | 'open-questions'
  | 'outputs'
  | 'health';

type SynthesisSectionId = 'summary' | 'concepts' | 'sources' | 'questions';

interface WikiPage {
  path: string;
  relativePath: string;
  section: WikiPageSection;
  title: string;
  summary: string;
  content: string;
  updatedAt: number;
}

interface WikiBaseSummary extends SharedWikiBaseSummary {
  overviewPath: string;
  logPath: string;
  sourceCount: number;
  conceptCount: number;
  questionCount: number;
  artifactCount: number;
}

interface SourceDetail {
  rawSourcePath: string;
  metadataPath: string;
  sourceType?: string;
  provider?: string;
  origin?: string;
  capturedAt?: string;
  extractor?: string;
  mimeType?: string;
  warning?: string;
  xPostUrl?: string;
  xAuthorHandle?: string;
  xAuthorName?: string;
  xPostedAt?: string;
  xReplyCount?: number;
  xRepostCount?: number;
  xLikeCount?: number;
  xBookmarkCount?: number;
  xText?: string;
}

interface BreadcrumbItem {
  id: string;
  label: string;
  onClick?: () => void;
}

export interface WikiCommand {
  type: 'nav' | 'page' | 'create-base';
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

const SYNTHESIS_SECTIONS: Array<{ id: SynthesisSectionId; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'concepts', label: 'Concepts' },
  { id: 'sources', label: 'Sources' },
  { id: 'questions', label: 'Open Questions' },
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

function classifySection(relativePath: string): WikiPageSection | null {
  if (relativePath === 'overview.md' || relativePath === 'wiki/index.md') return 'overview';
  if (relativePath.startsWith('wiki/sources/')) return 'sources';
  if (relativePath.startsWith('wiki/concepts/')) return 'concepts';
  if (relativePath.startsWith('wiki/open-questions/')) return 'open-questions';
  if (relativePath.startsWith('outputs/')) return 'outputs';
  if (relativePath.startsWith('health/')) return 'health';
  return null;
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

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Unknown';
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.round(deltaMs / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function formatCapturedAt(value?: string): string {
  if (!value) return 'Unknown';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp);
}

function formatMetricCount(value?: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
}

function normalizeXHandle(value: string): string {
  const trimmed = value.trim().replace(/^@+/, '');
  return trimmed ? `@${trimmed}` : '';
}

function parseOptionalCount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed);
}

function buildXSourceTitle(detail?: SourceDetail): string {
  if (!detail) return 'X Post';
  return detail.xAuthorName || detail.xAuthorHandle || 'X Post';
}

function takePreviewText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

function renderMetricPill(label: string, value?: number): React.ReactNode {
  const formatted = formatMetricCount(value);
  if (!formatted) return null;
  return (
    <span className="wiki-x-metric" key={label}>
      {label} {formatted}
    </span>
  );
}

function getLeadMarkdown(content: string): string {
  const withoutTitle = content.replace(/^#\s+.+\n+/, '');
  const lines = withoutTitle.split('\n');
  const leadLines: string[] = [];

  for (const line of lines) {
    if (/^##\s+/.test(line.trim())) break;
    leadLines.push(line);
  }

  return leadLines.join('\n').trim();
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

function sortPages(pages: WikiPage[]): WikiPage[] {
  return [...pages].sort((a, b) => a.title.localeCompare(b.title));
}

function basenameWithoutExtension(filePath: string): string {
  const name = filePath.split('/').pop() || filePath;
  return name.replace(/\.md$/, '');
}

export default function WikiWorkspace({
  onBack,
  showBack = true,
  contextOpen = false,
  command,
  onSidebarStateChange,
}: Props) {
  const isMobile = useIsMobile();
  const handledCommandNonceRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const savedScrollRef = useRef<number>(0);
  const synthesisSectionRefs = useRef<Record<SynthesisSectionId, HTMLElement | null>>({
    summary: null,
    concepts: null,
    sources: null,
    questions: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bases, setBases] = useState<WikiBaseSummary[]>([]);
  const [currentBasePath, setCurrentBasePath] = useState('');
  const [activeNav, setActiveNav] = useState<WikiNavId>('home');
  const [selectedPagePath, setSelectedPagePath] = useState<string | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [jobs, setJobs] = useState<WikiJob[]>([]);
  const [jobError, setJobError] = useState('');
  const [sourceDetails, setSourceDetails] = useState<Record<string, SourceDetail>>({});
  const [activeSynthesisSection, setActiveSynthesisSection] = useState<SynthesisSectionId>('summary');
  const [baseSearch, setBaseSearch] = useState('');
  const [showCreateBaseModal, setShowCreateBaseModal] = useState(false);
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [createBaseTitle, setCreateBaseTitle] = useState('');
  const [createBaseDescription, setCreateBaseDescription] = useState('');
  const [createBaseError, setCreateBaseError] = useState('');
  const [isCreatingBase, setIsCreatingBase] = useState(false);
  const [ingestBasePath, setIngestBasePath] = useState('');
  const [ingestMode, setIngestMode] = useState<WikiSourceType>('url');
  const [ingestTitle, setIngestTitle] = useState('');
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingestText, setIngestText] = useState('');
  const [ingestFile, setIngestFile] = useState<WikiFileImport | null>(null);
  const [ingestXPostUrl, setIngestXPostUrl] = useState('');
  const [ingestXAuthorHandle, setIngestXAuthorHandle] = useState('');
  const [ingestXAuthorName, setIngestXAuthorName] = useState('');
  const [ingestXPostedAt, setIngestXPostedAt] = useState('');
  const [ingestXReplyCount, setIngestXReplyCount] = useState('');
  const [ingestXRepostCount, setIngestXRepostCount] = useState('');
  const [ingestXLikeCount, setIngestXLikeCount] = useState('');
  const [ingestXBookmarkCount, setIngestXBookmarkCount] = useState('');
  const [ingestError, setIngestError] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const lastTerminalJobRef = useRef<string | null>(null);

  const loadBases = useCallback(async () => {
    await window.keel.ensureBrain();
    const summaries = await window.keel.listWikiBases();

    const enriched = await Promise.all(summaries.map(async (base) => {
      let sourceCount = 0;
      let conceptCount = 0;
      let questionCount = 0;
      let artifactCount = 0;

      try {
        const files = await listMarkdownFiles(base.basePath);
        files.forEach((file) => {
          const relativePath = file.path.slice(`${base.basePath}/`.length);
          const section = classifySection(relativePath);
          if (section === 'sources') sourceCount += 1;
          if (section === 'concepts') conceptCount += 1;
          if (section === 'open-questions') questionCount += 1;
          if (section === 'outputs') artifactCount += 1;
        });
      } catch {
        // Keep zero counts if a base is only partially initialized.
      }

      return {
        ...base,
        overviewPath: `${base.basePath}/overview.md`,
        logPath: `${base.basePath}/wiki/log.md`,
        sourceCount,
        conceptCount,
        questionCount,
        artifactCount,
      } satisfies WikiBaseSummary;
    }));

    setBases(enriched);
    setCurrentBasePath((previous) => (
      previous && enriched.some((base) => base.basePath === previous) ? previous : ''
    ));
    return enriched;
  }, []);

  const loadCurrentBase = useCallback(async () => {
    if (!currentBasePath) {
      setPages([]);
      setSourceDetails({});
      return [] as WikiPage[];
    }

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

    const sourceMetadataEntries = await Promise.all(
      filtered
        .filter((page) => page.section === 'sources')
        .map(async (page) => {
          const sourceSlug = basenameWithoutExtension(page.relativePath);
          const metadataPath = `${currentBasePath}/raw/${sourceSlug}/metadata.json`;
          const rawSourcePath = `${currentBasePath}/raw/${sourceSlug}/source.md`;

          try {
            const metadataText = await window.keel.readFile(metadataPath);
            const metadata = JSON.parse(metadataText) as {
              sourceType?: string;
              provider?: string;
              origin?: string;
              capturedAt?: string;
              extractor?: string;
              mimeType?: string;
              warnings?: string[];
              xPostUrl?: string;
              xAuthorHandle?: string;
              xAuthorName?: string;
              xPostedAt?: string;
              xReplyCount?: number;
              xRepostCount?: number;
              xLikeCount?: number;
              xBookmarkCount?: number;
              xText?: string;
            };

            return [
              page.path,
              {
                metadataPath,
                rawSourcePath,
                sourceType: metadata.sourceType,
                provider: metadata.provider,
                origin: metadata.origin,
                capturedAt: metadata.capturedAt,
                extractor: metadata.extractor,
                mimeType: metadata.mimeType,
                warning: metadata.warnings?.[0],
                xPostUrl: metadata.xPostUrl,
                xAuthorHandle: metadata.xAuthorHandle,
                xAuthorName: metadata.xAuthorName,
                xPostedAt: metadata.xPostedAt,
                xReplyCount: metadata.xReplyCount,
                xRepostCount: metadata.xRepostCount,
                xLikeCount: metadata.xLikeCount,
                xBookmarkCount: metadata.xBookmarkCount,
                xText: metadata.xText,
              } satisfies SourceDetail,
            ] as const;
          } catch {
            return [page.path, { metadataPath, rawSourcePath } satisfies SourceDetail] as const;
          }
        })
    );

    setSourceDetails(Object.fromEntries(sourceMetadataEntries));

    return filtered;
  }, [currentBasePath]);

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
        await loadBases();
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
  }, [loadBases]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!currentBasePath) {
          setPages([]);
          setSourceDetails({});
          return;
        }

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
      try {
        if (!currentBasePath) {
          setJobs([]);
          return;
        }

        const nextJobs = await loadJobs();
        if (cancelled) return;
        const latestTerminal = nextJobs.find((job) => job.status === 'completed' || job.status === 'failed');
        if (latestTerminal && latestTerminal.id !== lastTerminalJobRef.current) {
          lastTerminalJobRef.current = latestTerminal.id;
          await loadBases();
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
  }, [currentBasePath, loadBases, loadCurrentBase, loadJobs]);

  const currentBase = useMemo(
    () => bases.find((base) => base.basePath === currentBasePath) || null,
    [bases, currentBasePath]
  );

  const overviewPage = useMemo(
    () => pages.find((page) => page.relativePath === 'overview.md') || pages.find((page) => page.relativePath === 'wiki/index.md') || null,
    [pages]
  );

  const selectedPage = useMemo(
    () => pages.find((page) => page.path === selectedPagePath) || null,
    [pages, selectedPagePath]
  );

  const displayedPage = useMemo(() => {
    if (selectedPage) return selectedPage;
    return null;
  }, [selectedPage]);

  const displayedSourceDetail = displayedPage ? sourceDetails[displayedPage.path] : undefined;
  const isDisplayedXSource = displayedPage?.section === 'sources' && displayedSourceDetail?.sourceType === 'x';

  const sourcePages = useMemo(() => sortPages(pages.filter((page) => page.section === 'sources')), [pages]);
  const conceptPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'concepts')), [pages]);
  const questionPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'open-questions')), [pages]);
  const artifactPages = useMemo(() => sortPages(pages.filter((page) => page.section === 'outputs')), [pages]);
  const lastUpdatedAt = useMemo(
    () => pages.reduce((latest, page) => Math.max(latest, page.updatedAt), 0),
    [pages]
  );

  const leadMarkdown = useMemo(() => {
    if (!overviewPage) return currentBase?.description || '';
    return getLeadMarkdown(overviewPage.content) || currentBase?.description || '';
  }, [currentBase?.description, overviewPage]);

  const renderedLead = useMemo(() => {
    if (!currentBasePath || !overviewPage || !leadMarkdown) return '';
    return renderWikiMarkdown(currentBasePath, overviewPage.relativePath, leadMarkdown);
  }, [currentBasePath, leadMarkdown, overviewPage]);

  const renderedPage = useMemo(() => {
    if (!displayedPage || !currentBasePath) return '';
    const contentWithoutTitle = displayedPage.content.replace(/^#\s+.+\n+/, '');
    return renderWikiMarkdown(currentBasePath, displayedPage.relativePath, contentWithoutTitle);
  }, [currentBasePath, displayedPage]);

  const outgoingLinks = useMemo(() => {
    if (!displayedPage || !currentBasePath) return [] as WikiPage[];
    const targets = new Set(
      Array.from(displayedPage.content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g))
        .map((match) => resolveWikiHref(currentBasePath, displayedPage.relativePath, match[1] || ''))
        .filter(Boolean) as string[]
    );

    return pages.filter((page) => page.path !== displayedPage.path && targets.has(page.path));
  }, [currentBasePath, displayedPage, pages]);

  const backlinks = useMemo(() => {
    if (!displayedPage || !currentBasePath) return [] as WikiPage[];
    return pages.filter((page) => {
      if (page.path === displayedPage.path) return false;
      return Array.from(page.content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g))
        .map((match) => resolveWikiHref(currentBasePath, page.relativePath, match[1] || ''))
        .some((resolved) => resolved === displayedPage.path);
    });
  }, [currentBasePath, displayedPage, pages]);

  const activeJob = useMemo(
    () => jobs.find((job) => job.status === 'queued' || job.status === 'running') || null,
    [jobs]
  );

  const latestJob = useMemo(
    () => jobs[0] || null,
    [jobs]
  );

  const sidebarBranches = useMemo<WikiSidebarBranch[]>(
    () => bases.map((base) => ({
      id: base.basePath,
      label: base.title,
      path: base.overviewPath,
    })),
    [bases]
  );

  const openNav = useCallback((nav: WikiNavId) => {
    if (nav === 'synthesis' && !currentBasePath && bases[0]) {
      setCurrentBasePath(bases[0].basePath);
    }
    setActiveNav(nav);
    setSelectedPagePath(null);
    setNotice('');
  }, [bases, currentBasePath]);

  const openPage = useCallback((path: string): boolean => {
    const baseMatch = path.match(/^(knowledge-bases\/[^/]+)/);
    const targetBasePath = baseMatch?.[1];
    if (!targetBasePath) return false;

    const relativePath = path.startsWith(`${targetBasePath}/`)
      ? path.slice(`${targetBasePath}/`.length)
      : '';
    const section = classifySection(relativePath);
    if (!section) return false;

    if (currentBasePath !== targetBasePath) {
      setCurrentBasePath(targetBasePath);
    }

    if (relativePath === 'overview.md' || relativePath === 'wiki/index.md') {
      setSelectedPagePath(null);
      setActiveNav('synthesis');
      setNotice('');
      return true;
    }

    savedScrollRef.current = contentRef.current?.scrollTop || 0;
    setSelectedPagePath(path);
    setActiveNav('synthesis');
    setNotice('');
    window.history.pushState({ wikiPage: path }, '');
    return true;
  }, [currentBasePath]);

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
      return;
    }

    if (command.type === 'create-base') {
      openCreateBaseModal();
      handledCommandNonceRef.current = command.nonce;
    }
  }, [command, openNav, openPage]);

  useEffect(() => {
    onSidebarStateChange?.({
      activeNav,
      selectedPagePath,
      branches: sidebarBranches,
    });
  }, [activeNav, onSidebarStateChange, selectedPagePath, sidebarBranches]);

  useEffect(() => {
    const handleFocus = () => {
      loadBases().catch(() => undefined);
      loadCurrentBase().catch(() => undefined);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadBases, loadCurrentBase]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    if (selectedPagePath) {
      container.scrollTop = 0;
    } else {
      requestAnimationFrame(() => {
        container.scrollTop = savedScrollRef.current;
      });
    }
  }, [selectedPagePath]);

  useEffect(() => {
    const handlePopState = () => {
      if (selectedPagePath) {
        setSelectedPagePath(null);
        setActiveNav('synthesis');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedPagePath]);

  useEffect(() => {
    if (activeNav !== 'synthesis' || displayedPage || !currentBasePath) return;
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let closestSection: SynthesisSectionId = 'summary';
      let closestDistance = Number.POSITIVE_INFINITY;

      SYNTHESIS_SECTIONS.forEach(({ id }) => {
        const node = synthesisSectionRefs.current[id];
        if (!node) return;
        const distance = Math.abs(node.getBoundingClientRect().top - containerTop - 94);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestSection = id;
        }
      });

      setActiveSynthesisSection(closestSection);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeNav, currentBasePath, displayedPage, pages]);

  const pageBreadcrumbs = useMemo(() => {
    if (!displayedPage) return [] as BreadcrumbItem[];

    const items: BreadcrumbItem[] = [
      {
        id: 'home',
        label: 'All Bases',
        onClick: () => openNav('home'),
      },
    ];

    if (currentBase) {
      items.push({
        id: 'base',
        label: currentBase.title,
        onClick: () => openPage(currentBase.overviewPath),
      });
    }

    items.push({ id: 'page', label: displayedPage.title });
    return items;
  }, [currentBase, displayedPage, openNav, openPage]);

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

  const openCreateBaseModal = useCallback(() => {
    setCreateBaseError('');
    setCreateBaseTitle('');
    setCreateBaseDescription('');
    setShowCreateBaseModal(true);
  }, []);

  const openIngestModal = useCallback((basePath?: string) => {
    setNotice('');
    setIngestError('');
    setIngestMode('url');
    setIngestTitle('');
    setIngestUrl('');
    setIngestText('');
    setIngestFile(null);
    setIngestXPostUrl('');
    setIngestXAuthorHandle('');
    setIngestXAuthorName('');
    setIngestXPostedAt('');
    setIngestXReplyCount('');
    setIngestXRepostCount('');
    setIngestXLikeCount('');
    setIngestXBookmarkCount('');
    setIngestBasePath(basePath || currentBasePath || bases[0]?.basePath || '');
    setShowIngestModal(true);
  }, [bases, currentBasePath]);

  const handleCreateBase = useCallback(async () => {
    setCreateBaseError('');
    setIsCreatingBase(true);

    try {
      const result = await window.keel.createWikiBase(createBaseTitle, createBaseDescription.trim() || undefined);
      const nextBases = await loadBases();
      const createdBase = nextBases.find((base) => base.basePath === result.basePath);
      setCurrentBasePath(result.basePath);
      setActiveNav('synthesis');
      setSelectedPagePath(null);
      setNotice(result.message);
      setShowCreateBaseModal(false);
      if (createdBase) {
        setIngestBasePath(createdBase.basePath);
      }
    } catch (err) {
      setCreateBaseError(err instanceof Error ? err.message : 'Failed to create wiki base.');
    } finally {
      setIsCreatingBase(false);
    }
  }, [createBaseDescription, createBaseTitle, loadBases]);

  const pickIngestFile = useCallback(async () => {
    setIngestError('');
    const files = await window.keel.pickWikiFiles();
    setIngestFile(files[0] || null);
  }, []);

  const handleIngestSubmit = useCallback(async () => {
    if (!ingestBasePath) {
      setIngestError('Choose a wiki base before adding a source.');
      return;
    }

    const payload: WikiSourceInput = {
      sourceType: ingestMode,
      title: ingestTitle.trim() || undefined,
    };

    if (ingestMode === 'url') {
      payload.url = ingestUrl.trim();
    } else if (ingestMode === 'text') {
      payload.text = ingestText.trim();
    } else if (ingestMode === 'x') {
      payload.xPostUrl = ingestXPostUrl.trim();
      payload.xText = ingestText.trim();
      payload.xAuthorHandle = normalizeXHandle(ingestXAuthorHandle);
      payload.xAuthorName = ingestXAuthorName.trim() || undefined;
      payload.xPostedAt = ingestXPostedAt || undefined;
      payload.xReplyCount = parseOptionalCount(ingestXReplyCount);
      payload.xRepostCount = parseOptionalCount(ingestXRepostCount);
      payload.xLikeCount = parseOptionalCount(ingestXLikeCount);
      payload.xBookmarkCount = parseOptionalCount(ingestXBookmarkCount);
    } else if (ingestFile) {
      payload.filePath = ingestFile.path;
      payload.fileName = ingestFile.name;
    }

    setIsIngesting(true);
    setIngestError('');

    try {
      const result: WikiIngestResult = await window.keel.ingestWikiSource(ingestBasePath, payload);
      await loadBases();
      setCurrentBasePath(ingestBasePath);
      setActiveNav('synthesis');
      setSelectedPagePath(null);
      await loadCurrentBase();
      setShowIngestModal(false);
      setNotice(result.warning || result.message);
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Failed to ingest source.');
    } finally {
      setIsIngesting(false);
    }
  }, [
    ingestBasePath,
    ingestFile,
    ingestXAuthorHandle,
    ingestXAuthorName,
    ingestXBookmarkCount,
    ingestXLikeCount,
    ingestXPostUrl,
    ingestXPostedAt,
    ingestXReplyCount,
    ingestXRepostCount,
    ingestMode,
    ingestText,
    ingestTitle,
    ingestUrl,
    loadBases,
    loadCurrentBase,
  ]);

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

  const openRawSource = useCallback(async (filePath: string) => {
    try {
      const errorMessage = await window.keel.openPath(filePath);
      if (errorMessage) {
        setNotice(errorMessage);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to open raw source.');
    }
  }, []);

  const openSynthesisSection = useCallback((sectionId: SynthesisSectionId) => {
    const node = synthesisSectionRefs.current[sectionId];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const ingestCanSubmit =
    !!ingestBasePath &&
    (
      (ingestMode === 'url' && ingestUrl.trim()) ||
      (ingestMode === 'text' && ingestText.trim()) ||
      (ingestMode === 'x' && ingestXPostUrl.trim() && ingestText.trim()) ||
      (ingestMode === 'file' && ingestFile)
    );

  if (loading && !bases.length && !pages.length) {
    return <div className="wiki-shell wiki-shell--loading">Loading wiki...</div>;
  }

  if (error) {
    return <div className="wiki-shell wiki-shell--loading">{error}</div>;
  }

  return (
    <div className="wiki-shell">
      <div className={displayedPage ? 'wiki-shell__header wiki-shell__header--slim' : 'wiki-shell__header'}>
        <div className="wiki-shell__header-left">
          {displayedPage ? (
            <button
              type="button"
              className="wiki-shell__breadcrumb"
              onClick={() => {
                setSelectedPagePath(null);
                setActiveNav('synthesis');
              }}
            >
              ← Back to {currentBase?.title || 'synthesis'}
            </button>
          ) : (
            <>
              <div className="wiki-shell__eyebrow">
                {activeNav !== 'home' && currentBase ? (
                  <button type="button" className="wiki-shell__breadcrumb" onClick={() => openNav('home')}>
                    ← All Bases
                  </button>
                ) : (
                  'Wiki'
                )}
              </div>
              <div className="wiki-shell__title-row">
                {showBack && onBack && isMobile && (
                  <button className="wiki-shell__back" onClick={onBack}>←</button>
                )}
                <h1 className="wiki-shell__title">
                  {activeNav === 'home' || !currentBase ? 'All Wiki Bases' : currentBase.title}
                </h1>
              </div>
            </>
          )}
          {activeNav !== 'home' && currentBase && !displayedPage && (
            <div className="wiki-shell__action-links">
              <button
                type="button"
                className="wiki-shell__action-link"
                title="Synthesize sources into concepts, summaries, and connections"
                disabled={!!activeJob}
                onClick={() => {
                  startCompile().catch((err) => {
                    setJobError(err instanceof Error ? err.message : 'Compile failed.');
                  });
                }}
              >
                Compile
              </button>
              <span className="wiki-shell__action-separator">·</span>
              <button
                type="button"
                className="wiki-shell__action-link"
                title="Scan for gaps, contradictions, or stale information"
                disabled={!!activeJob}
                onClick={() => {
                  startHealthCheck().catch((err) => {
                    setJobError(err instanceof Error ? err.message : 'Health check failed.');
                  });
                }}
              >
                Health Check
              </button>
              <span className="wiki-shell__action-separator">·</span>
              <button
                type="button"
                className="wiki-shell__action-link wiki-shell__action-link--primary"
                onClick={() => openIngestModal(currentBasePath)}
              >
                Add Sources
              </button>
              {(activeJob || latestJob || jobError) && (
                <>
                  <span className="wiki-shell__action-separator">·</span>
                  <span className="wiki-shell__action-status">
                    {jobError ? (
                      <span className="is-failed">{jobError}</span>
                    ) : activeJob ? (
                      <span className="is-running">{activeJob.type === 'compile' ? 'Compiling…' : 'Checking…'}</span>
                    ) : latestJob ? (
                      <span className={latestJob.status === 'failed' ? 'is-failed' : ''}>
                        {latestJob.status === 'failed' ? `Failed: ${latestJob.error}` : `${latestJob.type === 'compile' ? 'Compiled' : 'Health check'} · ${formatRelativeTime(latestJob.updatedAt)}`}
                      </span>
                    ) : null}
                  </span>
                </>
              )}
            </div>
          )}
          {notice && <div className="wiki-shell__notice">{notice}</div>}
        </div>
      </div>

      <div className={isMobile ? 'wiki-shell__body is-mobile' : 'wiki-shell__body'}>
        <main ref={contentRef} className="wiki-shell__content">
          {activeNav === 'home' && (() => {
            const filteredBases = baseSearch
              ? bases.filter((b) => b.title.toLowerCase().includes(baseSearch.toLowerCase()) || (b.description && b.description.toLowerCase().includes(baseSearch.toLowerCase())))
              : bases;
            return (
              <div className="wiki-home">
                {bases.length > 1 && (
                  <div className="wiki-home__search-wrapper">
                    <svg className="wiki-home__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    <input
                      type="text"
                      className="wiki-home__search"
                      placeholder="Search bases…"
                      value={baseSearch}
                      onChange={(e) => setBaseSearch(e.target.value)}
                    />
                  </div>
                )}
                <div className="wiki-synthesis__list">
                  {filteredBases.map((base) => (
                    <div key={base.basePath} className="wiki-synthesis__card">
                      <div className="wiki-synthesis__card-header">
                        <div className="wiki-synthesis__card-header-left">
                          <button type="button" className="wiki-synthesis__card-title wiki-synthesis__card-title--link" onClick={() => openPage(base.overviewPath)}>{base.title}</button>
                          <div className="wiki-synthesis__card-meta">
                            <span>{base.sourceCount} sources</span>
                            <span>{base.conceptCount} concepts</span>
                            <span>{base.questionCount} open questions</span>
                            <span>Updated {formatRelativeTime(base.updatedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="wiki-synthesis__card-text">
                        {base.description || 'This base is ready for synthesis and source-backed browsing.'}
                      </div>
                    </div>
                  ))}
                  {bases.length === 0 && (
                    <div className="wiki-synthesis__empty">
                      No wiki bases yet. Create a base to get started.
                    </div>
                  )}
                  {bases.length > 0 && filteredBases.length === 0 && (
                    <div className="wiki-synthesis__empty">
                      No bases matching &ldquo;{baseSearch}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {activeNav !== 'home' && !displayedPage && currentBase && (
            <div className="wiki-synthesis">
              <div className="wiki-synthesis__tabs">
                {SYNTHESIS_SECTIONS.map((section) => {
                  const countMap: Record<string, number> = {
                    concepts: conceptPages.length,
                    sources: sourcePages.length,
                    questions: questionPages.length,
                  };
                  const count = countMap[section.id];
                  return (
                    <button
                      type="button"
                      key={section.id}
                      className={activeSynthesisSection === section.id ? 'wiki-synthesis__tab is-active' : 'wiki-synthesis__tab'}
                      onClick={() => openSynthesisSection(section.id)}
                    >
                      {section.label}
                      {count !== undefined && <span className="wiki-synthesis__tab-count">{count}</span>}
                    </button>
                  );
                })}
              </div>

              <section
                ref={(node) => { synthesisSectionRefs.current.summary = node; }}
                className="wiki-synthesis__section"
              >
                <h2 className="wiki-synthesis__section-heading">Summary</h2>
                {renderedLead ? (
                  <div
                    className="markdown-body wiki-synthesis__body"
                    onClick={handleRenderedPageClick}
                    dangerouslySetInnerHTML={{ __html: renderedLead }}
                  />
                ) : (
                  <p className="wiki-synthesis__empty">Compile this base or add more detail to the overview to generate a clearer summary.</p>
                )}
              </section>

              <section
                ref={(node) => { synthesisSectionRefs.current.concepts = node; }}
                className="wiki-synthesis__section"
              >
                <h2 className="wiki-synthesis__section-heading">Concepts</h2>
                <div className="wiki-synthesis__list">
                  {conceptPages.map((page) => (
                    <button type="button" key={page.path} className="wiki-synthesis__card" onClick={() => openPage(page.path)}>
                      <div className="wiki-synthesis__card-title">{page.title}</div>
                      <div className="wiki-synthesis__card-text">
                        {page.summary || 'Open the concept page to read the full synthesis.'}
                      </div>
                    </button>
                  ))}
                  {conceptPages.length === 0 && (
                    <div className="wiki-synthesis__empty">No concept pages have been synthesized for this base yet.</div>
                  )}
                </div>
              </section>

              <section
                ref={(node) => { synthesisSectionRefs.current.sources = node; }}
                className="wiki-synthesis__section"
              >
                <h2 className="wiki-synthesis__section-heading">Sources</h2>
                <div className="wiki-synthesis__list">
                  {sourcePages.map((page) => {
                    const detail = sourceDetails[page.path];
                    const isXSource = detail?.sourceType === 'x';
                    const sourceExcerpt = detail?.xText || page.summary || 'Open the source page to inspect the extracted content and metadata.';
                    return (
                      <div
                        key={page.path}
                        className={isXSource
                          ? 'wiki-synthesis__card wiki-synthesis__card--source wiki-synthesis__card--x'
                          : 'wiki-synthesis__card wiki-synthesis__card--source'}
                      >
                        <div className="wiki-synthesis__card-header">
                          <div>
                            {isXSource ? (
                              <div className="wiki-synthesis__card-title">
                                {buildXSourceTitle(detail)}
                              </div>
                            ) : (
                              <button type="button" className="wiki-synthesis__card-title wiki-synthesis__card-title--link" onClick={() => openPage(page.path)}>{page.title}</button>
                            )}
                            <div className="wiki-synthesis__card-meta">
                              <span>{detail?.sourceType ? formatTitle(detail.sourceType) : 'Source'}</span>
                              {isXSource && detail?.xAuthorHandle && <span>{detail.xAuthorHandle}</span>}
                              {isXSource && detail?.xPostedAt && <span>Posted {formatCapturedAt(detail.xPostedAt)}</span>}
                              <span>Captured {formatCapturedAt(detail?.capturedAt)}</span>
                            </div>
                          </div>
                        </div>
                        {isXSource ? (
                          <div className="wiki-synthesis__x-preview">
                            <div className="wiki-synthesis__x-badge">X Post</div>
                            <div className="wiki-synthesis__x-text">{takePreviewText(sourceExcerpt, 220)}</div>
                            <div className="wiki-synthesis__x-metrics">
                              {renderMetricPill('Reply', detail?.xReplyCount)}
                              {renderMetricPill('Repost', detail?.xRepostCount)}
                              {renderMetricPill('Like', detail?.xLikeCount)}
                              {renderMetricPill('Bookmark', detail?.xBookmarkCount)}
                            </div>
                          </div>
                        ) : (
                          <div className="wiki-synthesis__card-text">
                            {sourceExcerpt}
                          </div>
                        )}
                        <div className="wiki-synthesis__source-links">
                          {detail?.origin && /^https?:\/\//.test(detail.origin) ? (
                            <a className="wiki-synthesis__mini-link" href={detail.origin} target="_blank" rel="noopener noreferrer">
                              Open source
                            </a>
                          ) : detail?.rawSourcePath ? (
                            <button type="button" className="wiki-synthesis__mini-link" onClick={() => openRawSource(detail.rawSourcePath)}>
                              Open source
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {sourcePages.length === 0 && (
                    <div className="wiki-synthesis__empty">No sources have been added to this base yet.</div>
                  )}
                </div>
              </section>

              <section
                ref={(node) => { synthesisSectionRefs.current.questions = node; }}
                className="wiki-synthesis__section"
              >
                <h2 className="wiki-synthesis__section-heading">Open Questions</h2>
                <div className="wiki-synthesis__list">
                  {questionPages.map((page) => (
                    <button type="button" key={page.path} className="wiki-synthesis__card" onClick={() => openPage(page.path)}>
                      <div className="wiki-synthesis__card-title">{page.title}</div>
                      <div className="wiki-synthesis__card-text">
                        {page.summary || 'Open the question page to inspect the unresolved gap.'}
                      </div>
                    </button>
                  ))}
                  {questionPages.length === 0 && (
                    <div className="wiki-synthesis__empty">No open-question pages have been captured for this base.</div>
                  )}
                </div>
              </section>
            </div>
          )}

          {displayedPage && (
            <div className="wiki-page">
              <div className="wiki-page__type">
                {displayedPage.section === 'concepts' ? 'Concept page' :
                 displayedPage.section === 'sources' ? 'Source page' :
                 displayedPage.section === 'open-questions' ? 'Open question' :
                 displayedPage.section === 'outputs' ? 'Output' :
                 'Wiki page'}
              </div>
              <h2 className="wiki-page__title">{displayedPage.title}</h2>
              {displayedPage.summary && !isDisplayedXSource && <p className="wiki-page__summary">{displayedPage.summary}</p>}
              {isDisplayedXSource && (
                <div className="wiki-x-post">
                  <div className="wiki-x-post__header">
                    <div>
                      <div className="wiki-x-post__author">{buildXSourceTitle(displayedSourceDetail)}</div>
                      {displayedSourceDetail?.xAuthorHandle && (
                        <div className="wiki-x-post__handle">{displayedSourceDetail.xAuthorHandle}</div>
                      )}
                    </div>
                    <div className="wiki-x-post__badge">X Post</div>
                  </div>
                  <div className="wiki-x-post__text">
                    {displayedSourceDetail?.xText || displayedPage.summary}
                  </div>
                  <div className="wiki-x-post__meta">
                    {displayedSourceDetail?.xPostedAt && <span>Posted {formatCapturedAt(displayedSourceDetail.xPostedAt)}</span>}
                    {displayedSourceDetail?.capturedAt && <span>Captured {formatCapturedAt(displayedSourceDetail.capturedAt)}</span>}
                    {displayedSourceDetail?.xPostUrl && (
                      <a href={displayedSourceDetail.xPostUrl} target="_blank" rel="noopener noreferrer">
                        Open original
                      </a>
                    )}
                  </div>
                  <div className="wiki-x-post__metrics">
                    {renderMetricPill('Reply', displayedSourceDetail?.xReplyCount)}
                    {renderMetricPill('Repost', displayedSourceDetail?.xRepostCount)}
                    {renderMetricPill('Like', displayedSourceDetail?.xLikeCount)}
                    {renderMetricPill('Bookmark', displayedSourceDetail?.xBookmarkCount)}
                  </div>
                </div>
              )}
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
            {activeNav === 'home' ? (
              <div className="wiki-meta">
                <div className="wiki-meta__label">Wiki Home</div>
                <div className="wiki-meta__title">{bases.length} bases</div>
                <div className="wiki-meta__text">
                  This view is the front door for everything Keel has already indexed and learned.
                </div>
              </div>
            ) : displayedPage ? (
              <div className="wiki-meta">
                <div className="wiki-meta__label">Page Context</div>
                <div className="wiki-meta__title">{displayedPage.title}</div>
                <div className="wiki-meta__text">Updated {formatRelativeTime(displayedPage.updatedAt)}</div>

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
                  <div className="wiki-meta__section-title">Related Pages</div>
                  {outgoingLinks.length === 0 && <div className="wiki-meta__empty">No related pages linked from this page.</div>}
                  {outgoingLinks.map((page) => (
                    <button key={page.path} className="wiki-meta__link" onClick={() => openPage(page.path)}>
                      {page.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : currentBase ? (
              <div className="wiki-meta">
                <div className="wiki-meta__label">Current Base</div>
                <div className="wiki-meta__title">{currentBase.title}</div>
                <div className="wiki-meta__text">{currentBase.description}</div>

                <div className="wiki-meta__section">
                  <div className="wiki-meta__section-title">Coverage</div>
                  <div className="wiki-meta__empty">{currentBase.sourceCount} sources</div>
                  <div className="wiki-meta__empty">{currentBase.conceptCount} concepts</div>
                  <div className="wiki-meta__empty">{currentBase.questionCount} open questions</div>
                </div>

                <div className="wiki-meta__section">
                  <div className="wiki-meta__section-title">Recent Outputs</div>
                  {artifactPages.length === 0 && <div className="wiki-meta__empty">No output pages yet.</div>}
                  {artifactPages.slice(0, 6).map((page) => (
                    <button key={page.path} className="wiki-meta__link" onClick={() => openPage(page.path)}>
                      {page.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        )}
      </div>

      {showCreateBaseModal && (
        <div className="wiki-modal__backdrop" onClick={() => {
          if (!isCreatingBase) {
            setShowCreateBaseModal(false);
            setCreateBaseError('');
          }
        }}>
          <div className="wiki-modal" onClick={(event) => event.stopPropagation()}>
            <div className="wiki-modal__header">
              <div>
                <div className="wiki-modal__eyebrow">Wiki Base</div>
                <div className="wiki-modal__title">Create Base</div>
              </div>
              <button
                type="button"
                className="wiki-modal__close"
                onClick={() => {
                  if (!isCreatingBase) {
                    setShowCreateBaseModal(false);
                    setCreateBaseError('');
                  }
                }}
              >
                ×
              </button>
            </div>

            <div className="wiki-modal__field">
              <label className="wiki-modal__label">Base Name</label>
              <input
                className="wiki-modal__input"
                value={createBaseTitle}
                onChange={(event) => setCreateBaseTitle(event.target.value)}
                placeholder="e.g. Project Research"
              />
            </div>

            <div className="wiki-modal__field">
              <label className="wiki-modal__label">Description</label>
              <textarea
                className="wiki-modal__textarea"
                value={createBaseDescription}
                onChange={(event) => setCreateBaseDescription(event.target.value)}
                placeholder="A plain-English description of what this base is meant to synthesize."
              />
            </div>

            {createBaseError && <div className="wiki-modal__error">{createBaseError}</div>}

            <div className="wiki-modal__footer">
              <button type="button" className="wiki-modal__secondary" onClick={() => setShowCreateBaseModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="wiki-modal__primary"
                disabled={!createBaseTitle.trim() || isCreatingBase}
                onClick={() => {
                  handleCreateBase().catch(() => undefined);
                }}
              >
                {isCreatingBase ? 'Creating...' : 'Create Base'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showIngestModal && (
        <div className="wiki-modal__backdrop" onClick={() => {
          if (!isIngesting) {
            setShowIngestModal(false);
            setIngestError('');
          }
        }}>
          <div className="wiki-modal" onClick={(event) => event.stopPropagation()}>
            <div className="wiki-modal__header">
              <div>
                <div className="wiki-modal__eyebrow">Wiki</div>
                <div className="wiki-modal__title">Add Sources</div>
              </div>
              <button
                type="button"
                className="wiki-modal__close"
                onClick={() => {
                  if (!isIngesting) {
                    setShowIngestModal(false);
                    setIngestError('');
                  }
                }}
              >
                ×
              </button>
            </div>

            <div className="wiki-modal__field">
              <label className="wiki-modal__label">Target Base</label>
              <select
                className="wiki-modal__input"
                value={ingestBasePath}
                onChange={(event) => setIngestBasePath(event.target.value)}
              >
                <option value="">Choose a wiki base</option>
                {bases.map((base) => (
                  <option key={base.basePath} value={base.basePath}>{base.title}</option>
                ))}
              </select>
            </div>

            {bases.length === 0 && (
              <div className="wiki-modal__error">
                Create a wiki base first, then come back to add sources here.
              </div>
            )}

            <div className="wiki-modal__mode-switch">
              {(['url', 'text', 'file', 'x'] as WikiSourceType[]).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={ingestMode === mode ? 'wiki-modal__mode is-active' : 'wiki-modal__mode'}
                  onClick={() => setIngestMode(mode)}
                >
                  {mode === 'url'
                    ? 'URL Article'
                    : mode === 'text'
                      ? 'Pasted Text'
                      : mode === 'file'
                        ? 'Document File'
                        : 'X Post'}
                </button>
              ))}
            </div>

            <div className="wiki-modal__field">
              <label className="wiki-modal__label">Title Override</label>
              <input
                className="wiki-modal__input"
                value={ingestTitle}
                onChange={(event) => setIngestTitle(event.target.value)}
                placeholder="Optional title override"
              />
            </div>

            {ingestMode === 'url' && (
              <div className="wiki-modal__field">
                <label className="wiki-modal__label">Article URL</label>
                <input
                  className="wiki-modal__input"
                  value={ingestUrl}
                  onChange={(event) => setIngestUrl(event.target.value)}
                  placeholder="https://example.com/article"
                />
              </div>
            )}

            {ingestMode === 'text' && (
              <div className="wiki-modal__field">
                <label className="wiki-modal__label">Source Text</label>
                <textarea
                  className="wiki-modal__textarea"
                  value={ingestText}
                  onChange={(event) => setIngestText(event.target.value)}
                  placeholder="Paste notes, article text, or raw source material."
                />
              </div>
            )}

            {ingestMode === 'x' && (
              <>
                <div className="wiki-modal__field">
                  <label className="wiki-modal__label">Post URL</label>
                  <input
                    className="wiki-modal__input"
                    value={ingestXPostUrl}
                    onChange={(event) => setIngestXPostUrl(event.target.value)}
                    placeholder="https://x.com/handle/status/1234567890"
                  />
                </div>

                <div className="wiki-modal__field">
                  <label className="wiki-modal__label">Post Text</label>
                  <textarea
                    className="wiki-modal__textarea"
                    value={ingestText}
                    onChange={(event) => setIngestText(event.target.value)}
                    placeholder="Paste the post text so Keel can preserve it even if the source changes later."
                  />
                </div>

                <div className="wiki-modal__field-grid">
                  <div className="wiki-modal__field">
                    <label className="wiki-modal__label">Author Handle</label>
                    <input
                      className="wiki-modal__input"
                      value={ingestXAuthorHandle}
                      onChange={(event) => setIngestXAuthorHandle(event.target.value)}
                      placeholder="@handle"
                    />
                  </div>
                  <div className="wiki-modal__field">
                    <label className="wiki-modal__label">Author Name</label>
                    <input
                      className="wiki-modal__input"
                      value={ingestXAuthorName}
                      onChange={(event) => setIngestXAuthorName(event.target.value)}
                      placeholder="Optional display name"
                    />
                  </div>
                </div>

                <div className="wiki-modal__field">
                  <label className="wiki-modal__label">Posted At</label>
                  <input
                    className="wiki-modal__input"
                    type="datetime-local"
                    value={ingestXPostedAt}
                    onChange={(event) => setIngestXPostedAt(event.target.value)}
                  />
                </div>

                <div className="wiki-modal__field-grid">
                  <div className="wiki-modal__field">
                    <label className="wiki-modal__label">Reply Count</label>
                    <input
                      className="wiki-modal__input"
                      value={ingestXReplyCount}
                      onChange={(event) => setIngestXReplyCount(event.target.value)}
                      inputMode="numeric"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="wiki-modal__field">
                    <label className="wiki-modal__label">Repost Count</label>
                    <input
                      className="wiki-modal__input"
                      value={ingestXRepostCount}
                      onChange={(event) => setIngestXRepostCount(event.target.value)}
                      inputMode="numeric"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="wiki-modal__field">
                    <label className="wiki-modal__label">Like Count</label>
                    <input
                      className="wiki-modal__input"
                      value={ingestXLikeCount}
                      onChange={(event) => setIngestXLikeCount(event.target.value)}
                      inputMode="numeric"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="wiki-modal__field">
                    <label className="wiki-modal__label">Bookmark Count</label>
                    <input
                      className="wiki-modal__input"
                      value={ingestXBookmarkCount}
                      onChange={(event) => setIngestXBookmarkCount(event.target.value)}
                      inputMode="numeric"
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </>
            )}

            {ingestMode === 'file' && (
              <div className="wiki-modal__field">
                <label className="wiki-modal__label">Document File</label>
                <div className="wiki-modal__file-row">
                  <button type="button" className="wiki-modal__secondary" onClick={() => {
                    pickIngestFile().catch(() => undefined);
                  }}>
                    Choose File
                  </button>
                  <div className="wiki-modal__file-name">{ingestFile?.name || 'No file selected'}</div>
                </div>
              </div>
            )}

            {ingestError && <div className="wiki-modal__error">{ingestError}</div>}

            <div className="wiki-modal__footer">
              <button
                type="button"
                className="wiki-modal__secondary"
                onClick={() => {
                  setShowIngestModal(false);
                  openCreateBaseModal();
                }}
              >
                Create Base
              </button>
              <button
                type="button"
                className="wiki-modal__primary"
                disabled={!ingestCanSubmit || isIngesting || bases.length === 0}
                onClick={() => {
                  handleIngestSubmit().catch(() => undefined);
                }}
              >
                {isIngesting ? 'Adding...' : 'Add Source'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

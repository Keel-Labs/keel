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
  | 'health'
  | 'activity-log';

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
  origin?: string;
  capturedAt?: string;
  extractor?: string;
  mimeType?: string;
  warning?: string;
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
  if (relativePath === 'wiki/log.md') return 'activity-log';
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
              origin?: string;
              capturedAt?: string;
              extractor?: string;
              mimeType?: string;
              warnings?: string[];
            };

            return [
              page.path,
              {
                metadataPath,
                rawSourcePath,
                sourceType: metadata.sourceType,
                origin: metadata.origin,
                capturedAt: metadata.capturedAt,
                extractor: metadata.extractor,
                mimeType: metadata.mimeType,
                warning: metadata.warnings?.[0],
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

  const activityLogPage = useMemo(
    () => pages.find((page) => page.relativePath === 'wiki/log.md') || null,
    [pages]
  );

  const selectedPage = useMemo(
    () => pages.find((page) => page.path === selectedPagePath) || null,
    [pages, selectedPagePath]
  );

  const displayedPage = useMemo(() => {
    if (selectedPage) return selectedPage;
    if (activeNav === 'activity-log') return activityLogPage;
    return null;
  }, [activeNav, activityLogPage, selectedPage]);

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
    return renderWikiMarkdown(currentBasePath, displayedPage.relativePath, displayedPage.content);
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

    if (relativePath === 'wiki/log.md') {
      setSelectedPagePath(path);
      setActiveNav('activity-log');
      setNotice('');
      return true;
    }

    setSelectedPagePath(path);
    setActiveNav('synthesis');
    setNotice('');
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

    if (displayedPage.relativePath === 'wiki/log.md') {
      items.push({ id: 'page', label: 'Activity Log' });
      return items;
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
      <div className="wiki-shell__header">
        <div className="wiki-shell__header-left">
          <div className="wiki-shell__eyebrow">Wiki</div>
          <div className="wiki-shell__title-row">
            {showBack && onBack && isMobile && (
              <button className="wiki-shell__back" onClick={onBack}>←</button>
            )}
            <h1 className="wiki-shell__title">
              {activeNav === 'home' || !currentBase ? 'All Wiki Bases' : currentBase.title}
            </h1>
            {activeNav !== 'home' && currentBase && (
              <button type="button" className="wiki-shell__action" onClick={() => openNav('home')}>
                All Bases
              </button>
            )}
            <button type="button" className="wiki-shell__action" onClick={() => openIngestModal(activeNav === 'home' ? undefined : currentBasePath)}>
              Add Sources
            </button>
            {activeNav === 'home' ? (
              <button type="button" className="wiki-shell__action" onClick={openCreateBaseModal}>
                Create Base
              </button>
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className="wiki-shell__subtitle">
            {activeNav === 'home'
              ? ''
              : currentBase?.description || 'LLM-maintained wiki workspace'}
          </div>
          {(activeJob || latestJob || jobError) && activeNav !== 'home' && (
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
          {notice && <div className="wiki-shell__notice">{notice}</div>}
        </div>
      </div>

      <div className={isMobile ? 'wiki-shell__body is-mobile' : 'wiki-shell__body'}>
        <main ref={contentRef} className="wiki-shell__content">
          {activeNav === 'home' && (
            <div className="wiki-home">
              <div className="wiki-home__hero wiki-home__hero--compact">
                <div className="wiki-home__stats">
                  <div className="wiki-home__stat"><strong>{bases.length}</strong><span>Bases</span></div>
                  <div className="wiki-home__stat"><strong>{bases.reduce((total, base) => total + base.sourceCount, 0)}</strong><span>Sources</span></div>
                  <div className="wiki-home__stat"><strong>{bases.reduce((total, base) => total + base.conceptCount, 0)}</strong><span>Concepts</span></div>
                  <div className="wiki-home__stat"><strong>{bases.reduce((total, base) => total + base.questionCount, 0)}</strong><span>Open Questions</span></div>
                </div>
              </div>

              <div className="wiki-base-list">
                {bases.map((base) => (
                  <button
                    type="button"
                    key={base.basePath}
                    className="wiki-base-card"
                    onClick={() => openPage(base.overviewPath)}
                  >
                    <div className="wiki-base-card__header">
                      <div>
                        <div className="wiki-base-card__title">{base.title}</div>
                        <div className="wiki-base-card__summary">
                          {base.description || 'This base is ready for synthesis and source-backed browsing.'}
                        </div>
                      </div>
                      <div className="wiki-base-card__timestamp">Updated {formatRelativeTime(base.updatedAt)}</div>
                    </div>
                    <div className="wiki-base-card__stats">
                      <span>{base.sourceCount} sources</span>
                      <span>{base.conceptCount} concepts</span>
                      <span>{base.questionCount} open questions</span>
                    </div>
                    <div className="wiki-base-card__cta">Open Synthesis</div>
                  </button>
                ))}
                {bases.length === 0 && (
                  <div className="wiki-base-card wiki-base-card--empty">
                    <div className="wiki-base-card__title">No wiki bases yet</div>
                    <div className="wiki-base-card__summary">
                      Create a base first, then add source material here instead of going through settings.
                    </div>
                    <div className="wiki-base-card__actions">
                      <button type="button" className="wiki-shell__action" onClick={openCreateBaseModal}>
                        Create Base
                      </button>
                      <button type="button" className="wiki-shell__action" onClick={() => openIngestModal()}>
                        Add Sources
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeNav !== 'home' && !displayedPage && currentBase && (
            <div className="wiki-synthesis">
              <div className="wiki-synthesis__hero">
                <div className="wiki-home__stats">
                  <div className="wiki-home__stat"><strong>{sourcePages.length}</strong><span>Sources</span></div>
                  <div className="wiki-home__stat"><strong>{conceptPages.length}</strong><span>Concepts</span></div>
                  <div className="wiki-home__stat"><strong>{questionPages.length}</strong><span>Open Questions</span></div>
                  <div className="wiki-home__stat"><strong>{formatRelativeTime(lastUpdatedAt)}</strong><span>Updated</span></div>
                </div>
              </div>

              <div className="wiki-synthesis__nav">
                {SYNTHESIS_SECTIONS.map((section) => (
                  <button
                    type="button"
                    key={section.id}
                    className={activeSynthesisSection === section.id ? 'wiki-synthesis__nav-link is-active' : 'wiki-synthesis__nav-link'}
                    onClick={() => openSynthesisSection(section.id)}
                  >
                    {section.label}
                  </button>
                ))}
              </div>

              <section
                ref={(node) => { synthesisSectionRefs.current.summary = node; }}
                className="wiki-synthesis__section"
              >
                <div className="wiki-synthesis__section-label">Summary</div>
                <div className="wiki-synthesis__section-title">What this base says right now</div>
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
                <div className="wiki-synthesis__section-label">Concepts</div>
                <div className="wiki-synthesis__section-title">Key ideas synthesized from the source material</div>
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
                <div className="wiki-synthesis__section-label">Sources</div>
                <div className="wiki-synthesis__section-title">Where the synthesis comes from</div>
                <div className="wiki-synthesis__list">
                  {sourcePages.map((page) => {
                    const detail = sourceDetails[page.path];
                    return (
                      <div key={page.path} className="wiki-synthesis__card wiki-synthesis__card--source">
                        <div className="wiki-synthesis__card-header">
                          <div>
                            <div className="wiki-synthesis__card-title">{page.title}</div>
                            <div className="wiki-synthesis__card-meta">
                              <span>{detail?.sourceType ? formatTitle(detail.sourceType) : 'Source'}</span>
                              <span>Captured {formatCapturedAt(detail?.capturedAt)}</span>
                            </div>
                          </div>
                          <button type="button" className="wiki-synthesis__mini-link" onClick={() => openPage(page.path)}>
                            Open page
                          </button>
                        </div>
                        <div className="wiki-synthesis__card-text">
                          {page.summary || 'Open the source page to inspect the extracted content and metadata.'}
                        </div>
                        <div className="wiki-synthesis__source-links">
                          {detail?.origin && (
                            <div className="wiki-synthesis__source-origin">
                              {/^https?:\/\//.test(detail.origin) ? (
                                <a href={detail.origin} target="_blank" rel="noopener noreferrer">
                                  Original URL
                                </a>
                              ) : (
                                <span>{detail.origin}</span>
                              )}
                            </div>
                          )}
                          {detail?.rawSourcePath && (
                            <button type="button" className="wiki-synthesis__mini-link" onClick={() => openRawSource(detail.rawSourcePath)}>
                              Open raw source
                            </button>
                          )}
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
                <div className="wiki-synthesis__section-label">Open Questions</div>
                <div className="wiki-synthesis__section-title">What still needs clarification</div>
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
              <h2 className="wiki-page__title">{displayedPage.title}</h2>
              {displayedPage.summary && <p className="wiki-page__summary">{displayedPage.summary}</p>}
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
                placeholder="Cisco Cloud Control"
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
              {(['url', 'text', 'file'] as WikiSourceType[]).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={ingestMode === mode ? 'wiki-modal__mode is-active' : 'wiki-modal__mode'}
                  onClick={() => setIngestMode(mode)}
                >
                  {mode === 'url' ? 'URL Article' : mode === 'text' ? 'Pasted Text' : 'Document File'}
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

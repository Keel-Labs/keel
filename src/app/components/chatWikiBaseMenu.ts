import type { WikiBaseSummary } from '../../shared/types';

export function filterWikiBases(wikiBases: WikiBaseSummary[], query: string): WikiBaseSummary[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return wikiBases;

  return wikiBases.filter((base) => {
    const haystack = `${base.title} ${base.slug}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

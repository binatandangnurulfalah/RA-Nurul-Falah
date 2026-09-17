import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

export const PAGE_SIZE = 20

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer) }, [delay, value])
  return debounced
}

export function usePaginatedItems<T>(items: T[], resetKey: string, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [resetKey])
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, pages)
  return { page: safePage, setPage, items: items.slice((safePage - 1) * pageSize, safePage * pageSize), total: items.length }
}

type CacheEntry<T> = { value: T; expiresAt: number }
const queryCache = new Map<string, CacheEntry<unknown>>()

export async function cachedQuery<T>(key: string, loader: () => Promise<T>, ttl = 30_000): Promise<T> {
  const cached = queryCache.get(key) as CacheEntry<T> | undefined
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const value = await loader()
  queryCache.set(key, { value, expiresAt: Date.now() + ttl })
  return value
}

export function invalidateQueryCache(prefix = '') {
  for (const key of queryCache.keys()) if (!prefix || key.startsWith(prefix)) queryCache.delete(key)
}

export function PaginationControls({ page, total, pageSize = PAGE_SIZE, onPage }: { page: number; total: number; pageSize?: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return <nav className="v5-pagination" aria-label="Navigasi halaman data">
    <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya"><ChevronLeft size={17} /> Sebelumnya</button>
    <span>Halaman <strong>{page}</strong> dari {pages} · {total} data</span>
    <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Halaman berikutnya">Berikutnya <ChevronRight size={17} /></button>
  </nav>
}

import { useEffect, useState } from 'react'
import { Pagination } from '../components/data/Pagination'
import { normalizePage } from '../lib/data-utils.js'

export const PAGE_SIZE = 20

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer) }, [delay, value])
  return debounced
}

export function PaginationControls({ page, total, pageSize = PAGE_SIZE, onPage }: { page: number; total: number; pageSize?: number; onPage: (page: number) => void }) {
  const safePage = normalizePage(page, total, pageSize)
  return <Pagination currentPage={safePage} pageSize={pageSize} totalItems={total} onPageChange={onPage} />
}

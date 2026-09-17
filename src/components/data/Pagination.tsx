import { ChevronLeft, ChevronRight } from 'lucide-react'

const DEFAULT_PAGE_SIZES = [20, 50]

type PaginationProps = {
  currentPage: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
}

export function Pagination({ currentPage, pageSize, totalItems, onPageChange, onPageSizeChange, pageSizeOptions = DEFAULT_PAGE_SIZES, className = '' }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(1, currentPage), totalPages)
  if (totalItems <= pageSize && !onPageSizeChange) return null

  return (
    <nav className={['data-pagination', className].filter(Boolean).join(' ')} aria-label="Navigasi halaman data">
      <div className="data-pagination__summary">
        <span>Halaman <strong>{safePage}</strong> dari {totalPages}</span>
        <span>{totalItems} data</span>
      </div>
      <div className="data-pagination__controls">
        {onPageSizeChange ? (
          <label className="data-pagination__size">
            <span>Per halaman</span>
            <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
              {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1} aria-label="Halaman sebelumnya">
          <ChevronLeft size={17} /> <span>Sebelumnya</span>
        </button>
        <button type="button" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= totalPages} aria-label="Halaman berikutnya">
          <span>Berikutnya</span> <ChevronRight size={17} />
        </button>
      </div>
    </nav>
  )
}

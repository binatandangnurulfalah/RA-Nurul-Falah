import type { ReactNode } from 'react'
import { RotateCcw, Search } from 'lucide-react'
import { Button } from '../ui/Button'

type SearchFilterBarProps = {
  searchValue: string
  onSearchChange: (value: string) => void
  placeholder: string
  children?: ReactNode
  onReset?: () => void
  activeFilterCount?: number
  searchLabel?: string
  className?: string
}

export function SearchFilterBar({ searchValue, onSearchChange, placeholder, children, onReset, activeFilterCount = 0, searchLabel = 'Cari data', className = '' }: SearchFilterBarProps) {
  return (
    <div className={['search-filter-bar', className].filter(Boolean).join(' ')}>
      <label className="search-filter-bar__search">
        <span className="sr-only">{searchLabel}</span>
        <Search size={18} aria-hidden="true" />
        <input value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder} />
      </label>
      {children ? <div className="search-filter-bar__filters">{children}</div> : null}
      {onReset ? (
        <Button variant="secondary" onClick={onReset} disabled={!searchValue && activeFilterCount === 0}>
          <RotateCcw size={16} aria-hidden="true" /> Reset{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
      ) : null}
    </div>
  )
}

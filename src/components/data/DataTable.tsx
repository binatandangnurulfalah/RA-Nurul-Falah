import type { Key, ReactNode } from 'react'
import { Skeleton } from '../ui/Skeleton'

export type DataTableAlign = 'left' | 'center' | 'right'

export type DataTableColumn<T> = {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  align?: DataTableAlign
  className?: string
  headerClassName?: string
}

type DataTableProps<T> = {
  rows: T[]
  columns: DataTableColumn<T>[]
  getRowKey: (row: T) => Key
  caption?: string
  loading?: boolean
  skeletonRows?: number
  empty?: ReactNode
  className?: string
  rowClassName?: (row: T) => string | undefined
}

export function DataTable<T>({ rows, columns, getRowKey, caption, loading = false, skeletonRows = 5, empty, className = '', rowClassName }: DataTableProps<T>) {
  if (!loading && rows.length === 0) return <>{empty ?? null}</>

  return (
    <div className={['data-table-wrap', className].filter(Boolean).join(' ')}>
      <table className="data-table">
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[`align-${column.align ?? 'left'}`, column.headerClassName].filter(Boolean).join(' ')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`} aria-hidden="true">
                {columns.map((column, columnIndex) => (
                  <td key={`${column.key}-${columnIndex}`}><Skeleton className="data-table__skeleton" /></td>
                ))}
              </tr>
            ))
            : rows.map((row) => (
              <tr key={getRowKey(row)} className={rowClassName?.(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={[`align-${column.align ?? 'left'}`, column.className].filter(Boolean).join(' ')}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

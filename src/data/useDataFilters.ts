import { useSearchParams } from 'react-router-dom'

export type FilterDefaults = Record<string, string>

function positivePage(value: string | null) {
  const parsed = Number(value || '1')
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

export function useDataFilters(defaults: FilterDefaults) {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = positivePage(searchParams.get('page'))

  const value = (key: string) => searchParams.get(key) ?? defaults[key] ?? ''

  const update = (changes: Record<string, string | number | null | undefined>, options: { resetPage?: boolean; replace?: boolean } = {}) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, rawValue] of Object.entries(changes)) {
      const normalized = rawValue == null ? '' : String(rawValue)
      const defaultValue = defaults[key]
      if (!normalized || normalized === defaultValue || (key === 'page' && normalized === '1')) next.delete(key)
      else next.set(key, normalized)
    }
    if (options.resetPage) next.delete('page')
    setSearchParams(next, { replace: options.replace ?? true })
  }

  const setPage = (nextPage: number) => update({ page: Math.max(1, nextPage) }, { replace: false })
  const reset = (...keys: string[]) => {
    const next = new URLSearchParams(searchParams)
    for (const key of keys.length ? keys : Object.keys(defaults)) next.delete(key)
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  return { page, value, update, setPage, reset }
}

export function normalizePage(page, total, pageSize) {
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize))
  return Math.min(Math.max(1, Math.trunc(page) || 1), pages)
}

export function getPageRange(page, pageSize) {
  const safePage = Math.max(1, Math.trunc(page) || 1)
  const from = (safePage - 1) * pageSize
  return { from, to: from + pageSize - 1 }
}

export function paginateItems(items, page, pageSize) {
  const safePage = normalizePage(page, items.length, pageSize)
  const { from, to } = getPageRange(safePage, pageSize)
  return { page: safePage, items: items.slice(from, to + 1), total: items.length }
}

export function sanitizeSearch(value) {
  return value.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

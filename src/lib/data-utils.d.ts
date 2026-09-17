export function normalizePage(page: number, total: number, pageSize: number): number
export function getPageRange(page: number, pageSize: number): { from: number; to: number }
export function paginateItems<T>(items: T[], page: number, pageSize: number): { page: number; items: T[]; total: number }
export function sanitizeSearch(value: string): string

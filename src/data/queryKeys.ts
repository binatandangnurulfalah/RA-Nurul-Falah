type Primitive = string | number | boolean | null | undefined
export type QueryKeyParams = Record<string, Primitive>

function scoped(scope: string) {
  const all = [scope] as const
  return {
    all,
    lists: () => [...all, 'list'] as const,
    list: (params: QueryKeyParams) => [...all, 'list', params] as const,
    detail: (id: string) => [...all, 'detail', id] as const,
    meta: (name: string, params: QueryKeyParams = {}) => [...all, 'meta', name, params] as const,
  }
}

export const queryKeys = {
  students: scoped('students'),
  attendance: scoped('attendance'),
  teachers: scoped('teachers'),
  accounts: scoped('accounts'),
  payments: scoped('payments'),
  documents: scoped('documents'),
  announcements: scoped('announcements'),
  dashboard: scoped('dashboard'),
  audit: scoped('audit'),
} as const

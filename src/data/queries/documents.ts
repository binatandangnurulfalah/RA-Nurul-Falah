import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { getPageRange, sanitizeSearch } from '../../lib/data-utils.js'
import { queryKeys } from '../queryKeys'

export type SchoolDocumentRow = {
  id: string
  title: string
  category: string
  document_number: string | null
  document_date: string | null
  recipient: string | null
  description: string | null
  file_url: string | null
  audience: 'all' | 'admin' | 'teacher' | 'parent'
  is_published: boolean
  created_at: string
}

export function documentPageOptions({ page, pageSize, search }: { page: number; pageSize: number; search: string }) {
  const normalizedSearch = sanitizeSearch(search)
  return queryOptions({
    queryKey: queryKeys.documents.list({ page, pageSize, search: normalizedSearch }),
    queryFn: async () => {
      const range = getPageRange(page, pageSize)
      let query = supabase
        .from('school_documents')
        .select('*', { count: 'exact' })
        .order('document_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(range.from, range.to)
      if (normalizedSearch) query = query.or(`title.ilike.%${normalizedSearch}%,category.ilike.%${normalizedSearch}%,document_number.ilike.%${normalizedSearch}%,recipient.ilike.%${normalizedSearch}%`)
      const { data, error, count } = await query
      if (error) throw new Error(error.message || 'Data dokumen gagal dimuat.')
      return { rows: (data as SchoolDocumentRow[] | null) ?? [], total: count ?? 0 }
    },
    placeholderData: keepPreviousData,
  })
}

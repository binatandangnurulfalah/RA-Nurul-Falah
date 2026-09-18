import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { reportOperationalError } from '../lib/observability'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const rootKey = typeof query.queryKey[0] === 'string' ? query.queryKey[0] : 'anonymous'
      reportOperationalError('query', error, { query_name: rootKey })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      reportOperationalError('mutation', error)
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
      networkMode: 'always',
    },
  },
})

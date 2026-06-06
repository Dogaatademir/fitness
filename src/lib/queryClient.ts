import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { persistQueryClient } from '@tanstack/react-query-persist-client'

// Persist edilmeyecek query key prefix'leri — gerçek zamanlı veriler
const NO_PERSIST_KEYS = [
  'workout-page',
  'workout-history',
  'workout-session',
  'dashboard',
]

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const CACHE_VERSION = 'v3'

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: `ft-query-cache-${CACHE_VERSION}`,
})

// Eski versiyonlardaki cache key'lerini temizle
;['ft-query-cache', 'ft-query-cache-v1', 'ft-query-cache-v2'].forEach(k =>
  localStorage.removeItem(k)
)

persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      const key = query.queryKey[0]
      if (typeof key === 'string' && NO_PERSIST_KEYS.includes(key)) return false
      return query.state.status === 'success'
    },
  },
})

export const QK = {
  dashboard: ['dashboard'] as const,
  programs: ['programs'] as const,
  programDetail: (id: string) => ['program', id] as const,
  workoutHistory: ['workout-history'] as const,
  workoutSession: (date: string) => ['workout-session', date] as const,
  nutrition: (date: string) => ['nutrition', date] as const,
  nutritionHistory: ['nutrition-history'] as const,
  body: ['body'] as const,
  profile: ['profile'] as const,
  water: (date: string) => ['water', date] as const,
}

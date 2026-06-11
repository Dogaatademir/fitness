import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { persistQueryClient } from '@tanstack/react-query-persist-client'

// Persist edilmeyecek query key prefix'leri — gerçek zamanlı veriler
const NO_PERSIST_KEYS = [
  'workout-page',
  'workout-history',
  'workout-session',
  'dashboard',
  'programs',
  'activity-logs',
  'activity-calories',
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

const CACHE_VERSION = 'v4'

// Eski versiyonlardaki cache key'lerini temizle
;['ft-query-cache', 'ft-query-cache-v1', 'ft-query-cache-v2', 'ft-query-cache-v3'].forEach(k =>
  localStorage.removeItem(k)
)

// Kullanıcıya özel persist cache başlatır — kullanıcı değişince tekrar çağrılır
let _unsubscribePersist: (() => void) | undefined

export function initPersistCache(userId: string) {
  // Önceki listener'ı temizle
  _unsubscribePersist?.()

  const cacheKey = `ft-query-cache-${CACHE_VERSION}-${userId}`

  // Başka kullanıcılara ait eski cache'leri temizle
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(`ft-query-cache-${CACHE_VERSION}-`) && k !== cacheKey) {
      localStorage.removeItem(k)
    }
  }

  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: cacheKey,
  })

  const { unsubscribe } = persistQueryClient({
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

  _unsubscribePersist = unsubscribe
}

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
  activityLogs: (date: string) => ['activity-logs', date] as const,
  activityCalories: (date: string) => ['activity-calories', date] as const,
}

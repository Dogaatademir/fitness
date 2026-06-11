import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, clearUserIdCache } from '../lib/supabase'
import { queryClient, initPersistCache } from '../lib/queryClient'

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-in'; user: User }
  | { status: 'signed-out' }

const AuthContext = createContext<AuthState>({ status: 'loading' })

function clearAllCache() {
  clearUserIdCache()
  queryClient.clear()
  // Kullanıcıya özel tüm cache key'lerini temizle
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith('ft-query-cache-')) keysToRemove.push(k)
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const prevUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null
      prevUserIdRef.current = user?.id ?? null
      if (user) initPersistCache(user.id)
      setState(user ? { status: 'signed-in', user } : { status: 'signed-out' })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      // Farklı bir kullanıcıya geçiliyorsa cache'i temizle
      if (prevUserIdRef.current && prevUserIdRef.current !== user?.id) {
        clearAllCache()
      }
      prevUserIdRef.current = user?.id ?? null
      if (user) initPersistCache(user.id)
      setState(user ? { status: 'signed-in', user } : { status: 'signed-out' })
    })

    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

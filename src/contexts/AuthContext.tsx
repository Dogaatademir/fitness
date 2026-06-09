import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-in'; user: User }
  | { status: 'signed-out' }

const AuthContext = createContext<AuthState>({ status: 'loading' })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState(
        data.session?.user
          ? { status: 'signed-in', user: data.session.user }
          : { status: 'signed-out' }
      )
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(
        session?.user
          ? { status: 'signed-in', user: session.user }
          : { status: 'signed-out' }
      )
    })

    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

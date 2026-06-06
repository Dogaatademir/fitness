import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ensureSignedIn } from '../lib/auth'

type Status = 'ready' | 'error'

const AuthContext = createContext<{ status: Status; error: string }>({
  status: 'ready',
  error: '',
})

// Supabase session localStorage'da 'sb-*-auth-token' anahtarıyla saklar.
// Sayfa açılır açılmaz senkron kontrol edip spinner'ı tamamen atlıyoruz.
function hasLocalSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? ''
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const val = localStorage.getItem(key)
        if (!val) continue
        const parsed = JSON.parse(val)
        const exp: number = parsed?.expires_at ?? 0
        // Token süresi dolmamışsa geçerli say
        if (exp * 1000 > Date.now()) return true
      }
    }
  } catch {}
  return false
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('ready')
  const [error, setError] = useState('')

  useEffect(() => {
    // İlk açılışta session yoksa (yeni kullanıcı) arka planda giriş yap
    if (!hasLocalSession()) {
      ensureSignedIn().catch(e => {
        setError(e.message)
        setStatus('error')
      })
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        ensureSignedIn().catch(e => {
          setError(e.message)
          setStatus('error')
        })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#f7f5f2] flex items-center justify-center px-8">
        <div className="text-center">
          <p className="text-base font-bold text-stone-800 mb-2">Bağlantı Hatası</p>
          <p className="text-sm text-stone-500 leading-relaxed">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-semibold"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    )
  }

  return <AuthContext.Provider value={{ status, error }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

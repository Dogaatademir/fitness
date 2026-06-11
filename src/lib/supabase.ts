import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY .env dosyasında tanımlı olmalı.')
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Oturum boyunca user ID'yi bir kez çek, sonra cache'den dön
let _cachedUserId: string | null = null

export async function getUserId(): Promise<string> {
  if (_cachedUserId) return _cachedUserId
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Oturum açılmamış')
  _cachedUserId = data.user.id
  return _cachedUserId
}

export function clearUserIdCache() {
  _cachedUserId = null
}

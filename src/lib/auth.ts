import { supabase } from './supabase'

const EMAIL = import.meta.env.VITE_APP_EMAIL as string
const PASSWORD = import.meta.env.VITE_APP_PASSWORD as string

export async function ensureSignedIn(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return

  if (!EMAIL || !PASSWORD) {
    throw new Error('VITE_APP_EMAIL ve VITE_APP_PASSWORD .env dosyasında tanımlı olmalı.')
  }

  const { error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw new Error(`Otomatik giriş başarısız: ${error.message}`)
}

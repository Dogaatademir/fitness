import { supabase } from './supabase'
import { clearUserIdCache } from './supabase'

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  // session null ise e-posta onayı gerekiyor
  return { needsConfirmation: !data.session }
}

export async function signOut(): Promise<void> {
  clearUserIdCache()
  await supabase.auth.signOut()
}

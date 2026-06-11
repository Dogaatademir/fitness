import { supabase } from './supabase'
import type { SessionSet } from '../types'

const fnUrl = (name: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  }
}

export async function estimateActivityCalories(params: {
  activityName: string
  durationMinutes: number
  weightKg: number
  ageYears: number
}): Promise<{ calories_burned: number; notes?: string }> {
  const res = await fetch(fnUrl('calculate-calories'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ mode: 'activity', ...params }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function estimateWorkoutCalories(params: {
  weightKg: number
  heightCm: number
  ageYears: number
  durationMinutes: number
  exercises: Array<{
    name: string
    type: string
    sets: Pick<SessionSet, 'weight_kg' | 'reps' | 'duration_minutes' | 'distance_km' | 'held_seconds'>[]
  }>
}): Promise<{ calories_burned: number; notes?: string }> {
  const res = await fetch(fnUrl('calculate-calories'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ mode: 'workout', ...params }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function estimateNutrition(foodName: string, servingSize?: string) {
  const res = await fetch(fnUrl('estimate-nutrition'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ foodName, servingSize }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}


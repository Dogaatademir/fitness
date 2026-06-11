import type { ActivityLevel, Gender } from '../types'

// Aktivite faktörleri (Harris-Benedict çarpanları)
const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary:          1.2,
  lightly_active:     1.375,
  moderately_active:  1.55,
  very_active:        1.725,
  extra_active:       1.9,
}

export interface BMRResult {
  bmr: number        // Bazal metabolizma (yatakta yatsan)
  tdee: number       // Toplam günlük enerji harcaması (aktivite dahil)
}

// Mifflin-St Jeor formülü
// Erkek: +5, Kadın: −161
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  birthDate: string,
  activityLevel: ActivityLevel = 'sedentary',
  gender: Gender = 'male',
): BMRResult {
  const age = Math.floor(
    (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  )
  const genderOffset = gender === 'female' ? -161 : 5
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + genderOffset)
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel])
  return { bmr, tdee }
}

export function getAgeFromBirthDate(birthDate: string): number {
  return Math.floor(
    (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  )
}

// MET tabanlı basit antrenman kalori tahmini (Edge Function yokken fallback)
// Ağırlık: ~5 MET, Kardiyo: ~8 MET, Vücut ağırlığı: ~4 MET
export function estimateWorkoutCaloriesLocally(
  weightKg: number,
  durationMinutes: number,
  exerciseTypes: string[],
): number {
  const hasCardio = exerciseTypes.some(t => t === 'cardio')
  const hasStrength = exerciseTypes.some(t => t === 'strength' || t === 'bodyweight')
  let met = 5
  if (hasCardio && hasStrength) met = 6.5
  else if (hasCardio) met = 8
  else if (hasStrength) met = 5
  const kcal = met * weightKg * (durationMinutes / 60)
  return Math.round(kcal * 1.1) // +%10 EPOC
}

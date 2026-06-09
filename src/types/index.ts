// ─── PROGRAM & ANTRENMAN ───────────────────────────────────────

export interface Program {
  id: string
  name: string
  description?: string
  is_active: boolean
  created_at: string
}

export interface ProgramDay {
  id: string
  program_id: string
  day_name: string
  weekday: number // 0=Pazar, 1=Pazartesi, ...
  order_index: number
}

export interface Exercise {
  id: string
  program_day_id: string
  name: string
  muscle_group: string // Örn: 'Göğüs', 'Sırt', 'Kardiyo'
  type?: 'strength' | 'cardio' | 'timed' | 'bodyweight'
  phase?: 'warmup' | 'main' | 'cooldown'
  
  // Ağırlık / Güç Antrenmanı Hedefleri
  target_sets?: number
  target_reps_min?: number
  target_reps_max?: number
  rest_seconds?: number
  
  // Kardiyo Hedefleri
  target_duration_minutes?: number

  // Timed (izometrik) Hedefleri — Plank, Wall Sit vb.
  target_duration_seconds?: number
  
  notes?: string
  order_index: number
}

export interface WorkoutSession {
  id: string
  program_day_id: string
  date: string
  started_at: string
  ended_at?: string
  notes?: string
}

export interface SessionSet {
  id: string
  session_id: string
  exercise_id: string
  set_number: number
  completed: boolean
  
  // Ağırlık Metrikleri
  weight_kg?: number
  reps?: number
  
  // Kardiyo & Timed Metrikleri
  duration_minutes?: number
  distance_km?: number
  speed_kmh?: number
  incline_pct?: number
  held_seconds?: number  // Plank, Wall Sit vb.
}

export interface PersonalRecord {
  id: string
  exercise_name: string
  max_weight_kg: number
  max_volume: number
  achieved_at: string
}

// ─── BESLENME ─────────────────────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface FoodLog {
  id: string
  date: string
  meal_type: MealType
  food_name: string
  calories: number
  protein_g: number
  carb_g: number
  fat_g: number
  serving_size: number
  serving_unit: string
  barcode?: string
  source: 'api' | 'manual' | 'recent'
}

export interface DailyNutritionSummary {
  date: string
  total_calories: number
  total_protein: number
  total_carb: number
  total_fat: number
}

// ─── VÜCUT ÖLÇÜMÜ ─────────────────────────────────────────────

export interface BodyMeasurement {
  id: string
  date: string
  weight_kg: number
  waist_cm?: number
  chest_cm?: number
  arm_cm?: number
  hip_cm?: number
  body_fat_pct?: number
  photo_url?: string
}

// ─── SU TAKİBİ ────────────────────────────────────────────────

export interface WaterLog {
  id: string
  date: string
  amount_ml: number
}

// ─── KULLANICI PROFİLİ ────────────────────────────────────────

export interface UserProfile {
  height_cm: number
  weight_kg: number
  birth_date?: string
  daily_calorie_goal: number
  daily_protein_goal: number
  daily_carb_goal: number
  daily_fat_goal: number
  training_calorie_goal?: number
  daily_water_goal?: number
}
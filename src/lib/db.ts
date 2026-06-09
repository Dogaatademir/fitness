import { supabase, getUserId } from './supabase'
import type {
  Program, ProgramDay, Exercise,
  WorkoutSession, SessionSet, PersonalRecord,
  FoodLog, BodyMeasurement, UserProfile,
} from '../types'


function today(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── PROFİL ───────────────────────────────────────────────────
export const profileDb = {
  async get(): Promise<UserProfile | null> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (!data) return null
    return {
      height_cm: data.height_cm,
      weight_kg: data.weight_kg,
      birth_date: data.birth_date ?? undefined,
      daily_calorie_goal: data.daily_calorie_goal,
      daily_protein_goal: data.daily_protein_goal,
      daily_carb_goal: data.daily_carb_goal,
      daily_fat_goal: data.daily_fat_goal,
      training_calorie_goal: data.training_calorie_goal ?? undefined,
    }
  },
  async save(profile: UserProfile): Promise<void> {
    const userId = await getUserId()
    await supabase.from('user_profiles').upsert({ id: userId, ...profile, updated_at: new Date().toISOString() })
  },
}

// ─── PROGRAM ──────────────────────────────────────────────────
export const programDb = {
  async getAll(): Promise<Program[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    return (data ?? []).map(r => ({
      id: r.id, name: r.name, description: r.description ?? undefined,
      is_active: r.is_active, created_at: r.created_at,
    }))
  },
  async getById(id: string): Promise<Program | undefined> {
    const { data } = await supabase.from('programs').select('*').eq('id', id).maybeSingle()
    if (!data) return undefined
    return { id: data.id, name: data.name, description: data.description ?? undefined, is_active: data.is_active, created_at: data.created_at }
  },
  async getActive(): Promise<Program | undefined> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('programs').select('*')
      .eq('user_id', userId).eq('is_active', true).maybeSingle()
    if (!data) return undefined
    return { id: data.id, name: data.name, description: data.description ?? undefined, is_active: data.is_active, created_at: data.created_at }
  },
  async create(input: Omit<Program, 'id' | 'created_at'>): Promise<Program> {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('programs').insert({ ...input, user_id: userId }).select().single()
    if (error || !data) throw error ?? new Error('Program oluşturulamadı')
    return { id: data.id, name: data.name, description: data.description ?? undefined, is_active: data.is_active, created_at: data.created_at }
  },
  async update(id: string, input: Partial<Program>): Promise<void> {
    await supabase.from('programs').update(input).eq('id', id)
  },
  async setActive(id: string): Promise<void> {
    const userId = await getUserId()
    await supabase.from('programs').update({ is_active: false }).eq('user_id', userId)
    await supabase.from('programs').update({ is_active: true }).eq('id', id)
  },
  async delete(id: string): Promise<void> {
    await supabase.from('programs').delete().eq('id', id)
  },
}

// ─── PROGRAM GÜNÜ ─────────────────────────────────────────────
export const programDayDb = {
  async getAll(): Promise<ProgramDay[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('program_days')
      .select('*, programs!inner(user_id)')
      .eq('programs.user_id', userId)
      .order('order_index', { ascending: true })
    return (data ?? []).map(r => ({
      id: r.id, program_id: r.program_id,
      day_name: r.day_name, weekday: r.weekday, order_index: r.order_index,
    }))
  },
  async getByProgram(programId: string): Promise<ProgramDay[]> {
    const { data } = await supabase
      .from('program_days').select('*')
      .eq('program_id', programId)
      .order('order_index', { ascending: true })
    return (data ?? []).map(r => ({
      id: r.id, program_id: r.program_id,
      day_name: r.day_name, weekday: r.weekday, order_index: r.order_index,
    }))
  },
  async getByWeekday(programId: string, weekday: number): Promise<ProgramDay | undefined> {
    const { data } = await supabase
      .from('program_days').select('*')
      .eq('program_id', programId).eq('weekday', weekday).maybeSingle()
    if (!data) return undefined
    return { id: data.id, program_id: data.program_id, day_name: data.day_name, weekday: data.weekday, order_index: data.order_index }
  },
  async create(input: Omit<ProgramDay, 'id'>): Promise<ProgramDay> {
    const { data, error } = await supabase.from('program_days').insert(input).select().single()
    if (error || !data) throw error ?? new Error('Gün oluşturulamadı')
    return { id: data.id, program_id: data.program_id, day_name: data.day_name, weekday: data.weekday, order_index: data.order_index }
  },
  async update(id: string, input: Partial<ProgramDay>): Promise<void> {
    await supabase.from('program_days').update(input).eq('id', id)
  },
  async delete(id: string): Promise<void> {
    await supabase.from('program_days').delete().eq('id', id)
  },
}

// ─── EGZERSİZ ─────────────────────────────────────────────────
export const exerciseDb = {
  async getAll(): Promise<Exercise[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('exercises')
      .select('*, program_days!inner(program_id, programs!inner(user_id))')
      .eq('program_days.programs.user_id', userId)
      .order('order_index', { ascending: true })
    return (data ?? []).map(mapExercise)
  },
  async getByDay(dayId: string): Promise<Exercise[]> {
    const { data } = await supabase
      .from('exercises').select('*')
      .eq('program_day_id', dayId)
      .order('order_index', { ascending: true })
    return (data ?? []).map(mapExercise)
  },
  async create(input: Omit<Exercise, 'id'>): Promise<Exercise> {
    const { data, error } = await supabase.from('exercises').insert(input).select().single()
    if (error || !data) throw error ?? new Error('Egzersiz oluşturulamadı')
    return mapExercise(data)
  },
  async update(id: string, input: Partial<Exercise>): Promise<void> {
    await supabase.from('exercises').update(input).eq('id', id)
  },
  async delete(id: string): Promise<void> {
    await supabase.from('exercises').delete().eq('id', id)
  },
}

function mapExercise(r: Record<string, unknown>): Exercise {
  return {
    id: r.id as string,
    program_day_id: r.program_day_id as string,
    name: r.name as string,
    muscle_group: r.muscle_group as string,
    type: (r.type as Exercise['type']) ?? 'strength',
    phase: (r.phase as Exercise['phase']) ?? 'main',
    target_sets: r.target_sets as number | undefined,
    target_reps_min: r.target_reps_min as number | undefined,
    target_reps_max: r.target_reps_max as number | undefined,
    rest_seconds: r.rest_seconds as number | undefined,
    target_duration_minutes: r.target_duration_minutes as number | undefined,
    target_duration_seconds: r.target_duration_seconds as number | undefined,
    notes: r.notes as string | undefined,
    order_index: r.order_index as number,
  }
}

// ─── ANTRENMAN OTURUMU ────────────────────────────────────────
export const sessionDb = {
  async getAll(): Promise<WorkoutSession[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('workout_sessions').select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    return (data ?? []).map(mapSession)
  },
  async getById(id: string): Promise<WorkoutSession | undefined> {
    const { data } = await supabase.from('workout_sessions').select('*').eq('id', id).maybeSingle()
    if (!data) return undefined
    return mapSession(data)
  },
  async getByDate(date: string): Promise<WorkoutSession | undefined> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('workout_sessions').select('*')
      .eq('user_id', userId).eq('date', date).maybeSingle()
    if (!data) return undefined
    return mapSession(data)
  },
  async getRecent(limit = 10): Promise<WorkoutSession[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('workout_sessions').select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit)
    return (data ?? []).map(mapSession)
  },
  async create(input: Omit<WorkoutSession, 'id'>): Promise<WorkoutSession> {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('workout_sessions').insert({ ...input, user_id: userId }).select().single()
    if (error || !data) throw error ?? new Error('Oturum oluşturulamadı')
    return mapSession(data)
  },
  async update(id: string, input: Partial<WorkoutSession>): Promise<void> {
    await supabase.from('workout_sessions').update(input).eq('id', id)
  },
}

function mapSession(r: Record<string, unknown>): WorkoutSession {
  return {
    id: r.id as string,
    program_day_id: r.program_day_id as string,
    date: r.date as string,
    started_at: r.started_at as string,
    ended_at: r.ended_at as string | undefined,
    notes: r.notes as string | undefined,
  }
}

// ─── SET ──────────────────────────────────────────────────────
export const setDb = {
  async getAll(): Promise<SessionSet[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('session_sets')
      .select('*, workout_sessions!inner(user_id)')
      .eq('workout_sessions.user_id', userId)
    return (data ?? []).map(mapSet)
  },
  async getBySession(sessionId: string): Promise<SessionSet[]> {
    const { data } = await supabase
      .from('session_sets').select('*')
      .eq('session_id', sessionId)
      .order('set_number', { ascending: true })
    return (data ?? []).map(mapSet)
  },
  async getByExercise(exerciseId: string): Promise<SessionSet[]> {
    const { data } = await supabase
      .from('session_sets').select('*')
      .eq('exercise_id', exerciseId)
    return (data ?? []).map(mapSet)
  },
  async getByDateRange(from: string, to: string): Promise<SessionSet[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('session_sets')
      .select('*, workout_sessions!inner(user_id, date)')
      .eq('workout_sessions.user_id', userId)
      .gte('workout_sessions.date', from)
      .lte('workout_sessions.date', to)
    return (data ?? []).map(mapSet)
  },
  async create(input: Omit<SessionSet, 'id'>): Promise<SessionSet> {
    const { data, error } = await supabase.from('session_sets').insert(input).select().single()
    if (error || !data) throw error ?? new Error('Set oluşturulamadı')
    return mapSet(data)
  },
  async update(id: string, input: Partial<SessionSet>): Promise<void> {
    await supabase.from('session_sets').update(input).eq('id', id)
  },
  async delete(id: string): Promise<void> {
    await supabase.from('session_sets').delete().eq('id', id)
  },
}

function mapSet(r: Record<string, unknown>): SessionSet {
  return {
    id: r.id as string,
    session_id: r.session_id as string,
    exercise_id: r.exercise_id as string,
    set_number: r.set_number as number,
    completed: r.completed as boolean,
    weight_kg: r.weight_kg as number | undefined,
    reps: r.reps as number | undefined,
    duration_minutes: r.duration_minutes as number | undefined,
    distance_km: r.distance_km as number | undefined,
    speed_kmh: r.speed_kmh as number | undefined,
    incline_pct: r.incline_pct as number | undefined,
    held_seconds: r.held_seconds as number | undefined,
  }
}

// ─── KİŞİSEL REKOR ────────────────────────────────────────────
export const prDb = {
  async getAll(): Promise<PersonalRecord[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('personal_records').select('*').eq('user_id', userId)
    return (data ?? []).map(r => ({
      id: r.id, exercise_name: r.exercise_name,
      max_weight_kg: r.max_weight_kg, max_volume: r.max_volume,
      achieved_at: r.achieved_at,
    }))
  },
  async getByExercise(name: string): Promise<PersonalRecord | undefined> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('personal_records').select('*')
      .eq('user_id', userId)
      .ilike('exercise_name', name)
      .maybeSingle()
    if (!data) return undefined
    return { id: data.id, exercise_name: data.exercise_name, max_weight_kg: data.max_weight_kg, max_volume: data.max_volume, achieved_at: data.achieved_at }
  },
  async upsert(exerciseName: string, weightKg: number, volume: number, type?: 'strength' | 'cardio' | 'timed' | 'bodyweight'): Promise<boolean> {
    if (type === 'cardio' || type === 'timed' || type === 'bodyweight') return false
    const userId = await getUserId()
    const existing = await this.getByExercise(exerciseName)

    if (!existing) {
      await supabase.from('personal_records').insert({
        user_id: userId, exercise_name: exerciseName,
        max_weight_kg: weightKg, max_volume: volume,
        achieved_at: new Date().toISOString(),
      })
      return true
    }

    if (weightKg > existing.max_weight_kg || volume > existing.max_volume) {
      await supabase.from('personal_records').update({
        max_weight_kg: Math.max(existing.max_weight_kg, weightKg),
        max_volume: Math.max(existing.max_volume, volume),
        achieved_at: new Date().toISOString(),
      }).eq('id', existing.id)
      return true
    }

    return false
  },
}

// ─── BESIN KAYDI ──────────────────────────────────────────────
export const foodLogDb = {
  async getAll(): Promise<FoodLog[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('food_logs').select('*').eq('user_id', userId)
      .order('date', { ascending: false })
    return (data ?? []).map(mapFood)
  },
  async getByDate(date: string): Promise<FoodLog[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('food_logs').select('*')
      .eq('user_id', userId).eq('date', date)
    return (data ?? []).map(mapFood)
  },
  async getToday(): Promise<FoodLog[]> {
    return this.getByDate(today())
  },
  async getRecent(limit = 10): Promise<FoodLog[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('food_logs').select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    const seen = new Set<string>()
    const result: FoodLog[] = []
    for (const r of data ?? []) {
      if (seen.has(r.food_name)) continue
      seen.add(r.food_name)
      result.push(mapFood(r))
      if (result.length >= limit) break
    }
    return result
  },
  async create(input: Omit<FoodLog, 'id'>): Promise<FoodLog> {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('food_logs').insert({ ...input, user_id: userId }).select().single()
    if (error || !data) throw error ?? new Error('Besin kaydı oluşturulamadı')
    return mapFood(data)
  },
  async delete(id: string): Promise<void> {
    await supabase.from('food_logs').delete().eq('id', id)
  },
  async getDailySummary(date: string) {
    const logs = await this.getByDate(date)
    return {
      date,
      total_calories: logs.reduce((s, f) => s + f.calories, 0),
      total_protein: logs.reduce((s, f) => s + f.protein_g, 0),
      total_carb: logs.reduce((s, f) => s + f.carb_g, 0),
      total_fat: logs.reduce((s, f) => s + f.fat_g, 0),
    }
  },
}

function mapFood(r: Record<string, unknown>): FoodLog {
  return {
    id: r.id as string,
    date: r.date as string,
    meal_type: r.meal_type as FoodLog['meal_type'],
    food_name: r.food_name as string,
    calories: r.calories as number,
    protein_g: r.protein_g as number,
    carb_g: r.carb_g as number,
    fat_g: r.fat_g as number,
    serving_size: r.serving_size as number,
    serving_unit: r.serving_unit as string,
    barcode: r.barcode as string | undefined,
    source: r.source as FoodLog['source'],
  }
}

// ─── VÜCUT ÖLÇÜMÜ ─────────────────────────────────────────────
export const bodyDb = {
  async getAll(): Promise<BodyMeasurement[]> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('body_measurements').select('*').eq('user_id', userId)
      .order('date', { ascending: false })
    return (data ?? []).map(r => ({
      id: r.id as string, date: r.date as string,
      weight_kg: r.weight_kg as number,
      waist_cm: r.waist_cm as number | undefined,
      chest_cm: r.chest_cm as number | undefined,
      arm_cm: r.arm_cm as number | undefined,
      hip_cm: r.hip_cm as number | undefined,
      body_fat_pct: r.body_fat_pct as number | undefined,
      photo_url: r.photo_url as string | undefined,
    }))
  },
  async getLatest(): Promise<BodyMeasurement | undefined> {
    return (await this.getAll())[0]
  },
  async create(input: Omit<BodyMeasurement, 'id'>): Promise<BodyMeasurement> {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('body_measurements').insert({ ...input, user_id: userId }).select().single()
    if (error || !data) throw error ?? new Error('Ölçüm oluşturulamadı')
    return {
      id: data.id, date: data.date, weight_kg: data.weight_kg,
      waist_cm: data.waist_cm ?? undefined, chest_cm: data.chest_cm ?? undefined,
      arm_cm: data.arm_cm ?? undefined, hip_cm: data.hip_cm ?? undefined,
      body_fat_pct: data.body_fat_pct ?? undefined, photo_url: data.photo_url ?? undefined,
    }
  },
  async delete(id: string): Promise<void> {
    await supabase.from('body_measurements').delete().eq('id', id)
  },
}

// ─── SU TAKİBİ ────────────────────────────────────────────────
export const waterDb = {
  async getToday(): Promise<number> {
    const userId = await getUserId()
    const { data } = await supabase
      .from('water_logs').select('amount_ml')
      .eq('user_id', userId).eq('date', today())
    return (data ?? []).reduce((sum, r) => sum + (r.amount_ml as number), 0)
  },
  async add(amount_ml: number): Promise<void> {
    const userId = await getUserId()
    await supabase.from('water_logs').insert({ user_id: userId, date: today(), amount_ml })
  },
  async reset(): Promise<void> {
    const userId = await getUserId()
    await supabase.from('water_logs').delete().eq('user_id', userId).eq('date', today())
  },
}

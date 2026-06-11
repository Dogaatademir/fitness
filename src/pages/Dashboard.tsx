import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageSpinner from '../components/PageSpinner'
import {
  Plus, Minus, ArrowRight, Dumbbell, UserCircle,
  Flame, Scale, Droplets, ChevronRight, ChevronDown, ChevronUp, Zap,
} from 'lucide-react'
import { exerciseDb, waterDb, activityLogDb } from '../lib/db'
import { supabase } from '../lib/supabase'
import { QK } from '../lib/queryClient'
import { calculateBMR } from '../lib/bmr'
import type { Program, ProgramDay, Exercise, BodyMeasurement, ActivityLevel, Gender } from '../types'

// ─── Renk Sabitleri ──────────────────────────────────────────────────────────
const C = {
  bg:          '#f5f3ef',   // sıcak krem arka plan
  surface:     '#ffffff',   // saf beyaz kart
  surfaceHigh: '#f0ede8',   // hafif bej vurgu yüzey
  border:      'rgba(0,0,0,0.07)',
  borderSub:   'rgba(0,0,0,0.04)',
  text:        '#1a1714',   // neredeyse siyah, soğuk değil
  textMid:     'rgba(26,23,20,0.45)',
  textLow:     'rgba(26,23,20,0.28)',

  startText:    '#1d4ed8',   // koyu indigo — krem üstünde okunur
  startBg:      'rgba(29,78,216,0.07)',
  startBorder:  'rgba(29,78,216,0.18)',

  ongoingText:  '#b45309',   // amber/kahve tonu
  ongoingBg:    'rgba(180,83,9,0.08)',
  ongoingBorder:'rgba(180,83,9,0.2)',

  successText:  '#166534',   // koyu yeşil
  successBg:    'rgba(22,101,52,0.07)',
  successBorder:'rgba(22,101,52,0.18)',
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatDuration(startedAt: string, endedAt?: string): string {
  const mins = Math.round(
    (new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime()) / 60000
  )
  return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)} sa ${mins % 60} dk`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 6)  return 'İyi geceler'
  if (h < 12) return 'Günaydın'
  if (h < 18) return 'İyi öğleden sonralar'
  return 'İyi akşamlar'
}

function relativeDate(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr + 'T12:00:00')
  const diffDays = Math.round((now.getTime() - d.getTime()) / 86400000)
  if (diffDays <= 0) return 'Bugün'
  if (diffDays === 1) return 'Dün'
  if (diffDays < 7) return `${diffDays} gün önce`
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
}

function exerciseTarget(e: Exercise): string {
  if (e.type === 'cardio') return e.target_duration_minutes ? `${e.target_duration_minutes} dk` : ''
  if (e.type === 'timed') return e.target_duration_seconds ? `${e.target_duration_seconds}s` : ''
  const sets = e.target_sets ?? ''
  const reps = e.target_reps_min
    ? e.target_reps_max && e.target_reps_max !== e.target_reps_min
      ? `${e.target_reps_min}-${e.target_reps_max}`
      : `${e.target_reps_min}`
    : ''
  return sets && reps ? `${sets}×${reps}` : sets ? `${sets} set` : ''
}

function formatWater(ml: number): string {
  if (ml < 1000) return `${ml} ml`
  const l = ml / 1000
  return l % 1 === 0 ? `${l} L` : `${l.toFixed(2).replace(/\.?0+$/, '')} L`
}

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface TodaySession {
  id: string
  started_at: string
  ended_at?: string
  program_day_id: string
}

interface LastSession {
  id: string
  date: string
  started_at: string
  ended_at?: string
  program_day_id: string
}

interface DashData {
  activeProgram: Program | null
  todayDay: ProgramDay | null
  todayExercises: Exercise[]
  todaySession: TodaySession | null
  weeklySessions: number
  weeklyVolume: number
  weekDays: boolean[]           // Pzt–Paz, true = fitness antrenmanı yapıldı
  weekActivityDays: boolean[]   // Pzt–Paz, true = aktivite kaydı var
  streak: number
  lastSession: LastSession | null
  lastSessionName: string
  lastSessionSets: number
  lastSessionExercises: string[]
  bodyHistory: BodyMeasurement[]
  calorieConsumed: number
  calorieGoal: number
  protein: number; proteinGoal: number
  carb: number; carbGoal: number
  fat: number; fatGoal: number
  latestBody: BodyMeasurement | null
  prevBody: BodyMeasurement | null
  hasProfile: boolean
  waterGoal: number
  bmr: number | null
  tdee: number | null
}

const WATER_STEP = 250
const WATER_GOAL_DEFAULT = 3000

function localDateStr(d: Date = new Date()): string {
  const shifted = new Date(d)
  if (shifted.getHours() < 7) {
    shifted.setDate(shifted.getDate() - 1)
  }
  const y = shifted.getFullYear()
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const day = String(shifted.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function fetchDashboard(): Promise<DashData> {
  const todayStr = localDateStr()

  // 07:00 shift'i uygulanmış "bugün" tarihini baz al
  const todayDate = new Date(todayStr + 'T12:00:00')
  const dow = todayDate.getDay() // 0=Pazar
  const startOfWeek = new Date(todayDate)
  startOfWeek.setDate(todayDate.getDate() - (dow === 0 ? 6 : dow - 1))
  const weekStart = localDateStr(startOfWeek)

  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Oturum açılmamış')

  // Streak + son antrenman için RPC'den bağımsız sorgu
  const streakSince = new Date()
  streakSince.setDate(streakSince.getDate() - 90)
  const [rpcResult, recentSessionsResult, weekActivityResult] = await Promise.all([
    supabase.rpc('get_dashboard_data', {
      p_user_id: user.user.id,
      p_today: todayStr,
      p_week_start: weekStart,
    }),
    supabase
      .from('workout_sessions')
      .select('id, date, started_at, ended_at, program_day_id')
      .eq('user_id', user.user.id)
      .not('ended_at', 'is', null)
      .gte('date', localDateStr(streakSince))
      .order('date', { ascending: false }),
    supabase
      .from('activity_logs')
      .select('date')
      .eq('user_id', user.user.id)
      .gte('date', weekStart),
  ])
  if (rpcResult.error) throw rpcResult.error
  const { data: rpc } = rpcResult
  const recentSessions = recentSessionsResult.data ?? []
  const weekActivityDates = new Set((weekActivityResult.data ?? []).map((r: { date: string }) => r.date))

  const r = (typeof rpc === 'string' ? JSON.parse(rpc) : rpc) as Record<string, unknown>
  const profile       = r.profile           as Record<string, number> | null
  const activeProgram = r.active_program     as Program | null
  const allSessions   = (r.all_sessions      as unknown[]) ?? []
  const weeklySets    = (r.weekly_sets       as Record<string, unknown>[]) ?? []
  const lastSetsList  = (r.last_session_sets as Record<string, unknown>[]) ?? []
  const foodSummary   = r.food_summary       as Record<string, number> | null
  const bodyHistory   = (r.body_history      as BodyMeasurement[]) ?? []
const programDays   = (r.program_days      as ProgramDay[]) ?? []
  const todaySession  = r.today_session      as TodaySession | null


  let todayDay: ProgramDay | null = null
  let todayExercises: Exercise[] = []
  let lastSessionExercises: string[] = []
  if (activeProgram) {
    const activeDays = programDays
      .filter(d => d.program_id === activeProgram.id)
      .sort((a, b) => a.order_index - b.order_index)

    if (activeDays.length > 0) {
      // Bugün tamamlanmış bir session varsa o günü göster
      const todayCompleted = recentSessions.find(s => s.date === todayStr)
      if (todayCompleted) {
        todayDay = activeDays.find(d => d.id === todayCompleted.program_day_id) ?? null
      } else {
        // Yoksa son tamamlanan session'dan sonraki sıradaki günü hesapla
        const completedSessions = (allSessions as { program_day_id: string; ended_at?: string }[])
          .filter(s => s.ended_at)
        const lastCompleted = completedSessions[0] ?? null
        const lastDayIndex = lastCompleted
          ? activeDays.findIndex(d => d.id === lastCompleted.program_day_id)
          : -1
        const nextIndex = lastDayIndex >= 0 ? (lastDayIndex + 1) % activeDays.length : 0
        todayDay = activeDays[nextIndex]
      }
    }

    // exerciseDb.getByDay ve egzersiz adı sorgusu paralel çalışsın
    const lastExerciseIdsPre = [
      ...new Set(
        lastSetsList
          .filter(s => (s as Record<string, unknown>).completed)
          .map(s => (s as Record<string, unknown>).exercise_id as string)
          .filter(Boolean)
      )
    ]
    const [exercises, exRows] = await Promise.all([
      todayDay ? exerciseDb.getByDay(todayDay.id) : Promise.resolve([]),
      lastExerciseIdsPre.length > 0
        ? supabase.from('exercises').select('id, name').in('id', lastExerciseIdsPre).then(r => r.data ?? [])
        : Promise.resolve([]),
    ])
    todayExercises = exercises
    const nameMap = Object.fromEntries(exRows.map((e: { id: string; name: string }) => [e.id, e.name]))
    lastSessionExercises = lastExerciseIdsPre.map(id => nameMap[id]).filter(Boolean)
  }

  const weeklyVolume = weeklySets.reduce(
    (acc, s) => acc + ((s.weight_kg as number) || 0) * ((s.reps as number) || 0), 0
  )

  // Streak: son 90 günlük gerçek veriden hesapla (2 güne kadar boşluk tolere edilir)
  const streakDates = [...new Set(recentSessions.map(s => s.date))].sort().reverse()
  let streak = 0
  if (streakDates.length > 0) {
    const daysSinceLast = Math.round(
      (new Date(todayStr).getTime() - new Date(streakDates[0]).getTime()) / 86400000
    )
    if (daysSinceLast <= 2) {
      streak = 1
      for (let i = 1; i < streakDates.length; i++) {
        const gap = Math.round(
          (new Date(streakDates[i - 1]).getTime() - new Date(streakDates[i]).getTime()) / 86400000
        )
        if (gap <= 2) streak++
        else break
      }
    }
  }

  // lastSession: recentSessions'dan al — RPC haftalık sınırlı döndürebilir
  const lastSession = recentSessions[0] ?? null
  const lastSessionSets = lastSetsList.filter(s => (s as Record<string, unknown>).completed).length
  const lastSessionName = lastSession
    ? programDays.find(d => d.id === lastSession.program_day_id)?.day_name ?? ''
    : ''

  const weekSessions = (allSessions as { date: string; ended_at?: string }[]).filter(s => s.date >= weekStart && s.ended_at)

  const weekDayDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}-${mo}-${da}`
  })
  const completedSessionDates = new Set(recentSessions.map(s => s.date))
  const weekDays = weekDayDates.map(d => completedSessionDates.has(d))
  const weekActivityDays = weekDayDates.map(d => weekActivityDates.has(d))

  const calorieGoal = todayDay && profile?.training_calorie_goal
    ? profile.training_calorie_goal
    : (profile?.daily_calorie_goal ?? 1600)

  let bmr: number | null = null
  let tdee: number | null = null
  if (profile?.weight_kg && profile?.height_cm && profile?.birth_date && profile?.activity_level) {
    const result = calculateBMR(
      profile.weight_kg as number,
      profile.height_cm as number,
      String(profile.birth_date),
      profile.activity_level as unknown as ActivityLevel,
      (profile.gender as unknown as Gender) ?? 'male',
    )
    bmr = result.bmr
    tdee = result.tdee
  }

  return {
    activeProgram,
    todayDay,
    todayExercises,
    todaySession,
    weeklySessions: weekSessions.length,
    weeklyVolume: Math.round(weeklyVolume),
    weekDays,
    weekActivityDays,
    streak,
    lastSession,
    lastSessionName,
    lastSessionSets,
    lastSessionExercises,
    bodyHistory: bodyHistory.slice(0, 5),
    calorieConsumed: foodSummary?.total_calories ?? 0,
    calorieGoal,
    protein:     foodSummary?.total_protein ?? 0,
    proteinGoal: profile?.daily_protein_goal ?? 160,
    carb:        foodSummary?.total_carb ?? 0,
    carbGoal:    profile?.daily_carb_goal ?? 135,
    fat:         foodSummary?.total_fat ?? 0,
    fatGoal:     profile?.daily_fat_goal ?? 47,
    latestBody: bodyHistory[0] ?? null,
    prevBody:   bodyHistory[1] ?? null,
    hasProfile: !!profile,
    waterGoal:  profile?.daily_water_goal ?? WATER_GOAL_DEFAULT,
    bmr,
    tdee,
  }
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min((value / Math.max(goal, 1)) * 100, 100)
  const over = value > goal
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[11px] font-semibold" style={{ color: C.textMid }}>{label}</span>
        <span className="text-[11px] tabular-nums" style={{ color: over ? '#b91c1c' : C.textLow }}>
          {Math.round(value)}<span style={{ color: C.textLow }}>/{goal}g</span>
        </span>
      </div>
      <div className="h-[3px] rounded-full overflow-hidden" style={{ background: C.borderSub }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: over ? '#b91c1c' : color }}
        />
      </div>
    </div>
  )
}

function Card({ children, onClick, className = '' }: {
  children: React.ReactNode; onClick?: () => void; className?: string
}) {
  const style = { background: C.surface, border: `1px solid ${C.border}` }
  const base = 'rounded-2xl'
  if (onClick) {
    return (
      <button onClick={onClick} style={style}
        className={`${base} w-full text-left active:scale-[0.985] transition-transform duration-150 ${className}`}>
        {children}
      </button>
    )
  }
  return <div style={style} className={`${base} ${className}`}>{children}</div>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.textLow }}>
      {children}
    </p>
  )
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const todayStr = localDateStr()

  const { data, isLoading } = useQuery({
    queryKey: QK.dashboard,
    queryFn: fetchDashboard,
    staleTime: 1000 * 60 * 2,
  })

  const { data: water = 0 } = useQuery({
    queryKey: QK.water(todayStr),
    queryFn: () => waterDb.getToday(),
    staleTime: Infinity,
  })

  const { data: activityCalories = 0 } = useQuery({
    queryKey: QK.activityCalories(todayStr),
    queryFn: () => activityLogDb.getDailyCalories(todayStr),
    staleTime: 1000 * 60 * 5,
  })

  const addWaterMutation = useMutation({
    mutationFn: () => waterDb.add(WATER_STEP),
    onMutate: () => {
      qc.setQueryData(QK.water(todayStr), (prev: number) => (prev ?? 0) + WATER_STEP)
    },
  })

  const removeWaterMutation = useMutation({
    mutationFn: async () => {
      const glasses = Math.max(0, Math.round(water / WATER_STEP) - 1)
      await waterDb.reset()
      for (let i = 0; i < glasses; i++) await waterDb.add(WATER_STEP)
      return glasses * WATER_STEP
    },
    onMutate: () => {
      if (water < WATER_STEP) return
      qc.setQueryData(QK.water(todayStr), (prev: number) => Math.max(0, (prev ?? 0) - WATER_STEP))
    },
    onSuccess: (val) => {
      qc.setQueryData(QK.water(todayStr), val)
    },
  })

  const [showStartConfirm, setShowStartConfirm] = useState(false)
  const [waterCollapsed, setWaterCollapsed] = useState(
    () => localStorage.getItem('dash-water-collapsed') === '1'
  )
  const [bodyExpanded, setBodyExpanded] = useState(false)

  function toggleWater() {
    setWaterCollapsed(v => {
      localStorage.setItem('dash-water-collapsed', v ? '0' : '1')
      return !v
    })
  }

  if (isLoading) return <PageSpinner />

  if (!data) return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <div className="px-5 pt-14 pb-5 flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-16 rounded-full animate-pulse" style={{ background: C.surfaceHigh }} />
          <div className="h-8 w-24 rounded-xl animate-pulse" style={{ background: C.surfaceHigh }} />
        </div>
        <div className="w-9 h-9 rounded-xl animate-pulse mt-1" style={{ background: C.surfaceHigh }} />
      </div>
      <div className="px-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl animate-pulse" style={{ background: C.surface, border: `1px solid ${C.border}`, height: i === 1 ? 200 : 120 }} />
        ))}
      </div>
    </div>
  )

  const calorieLeft = data.calorieGoal - data.calorieConsumed
  const calorieOver = calorieLeft < 0
  const caloriePct  = Math.min((data.calorieConsumed / Math.max(data.calorieGoal, 1)) * 100, 100)
  const waterGlasses = Math.round(water / WATER_STEP)
  const waterGoalGlasses = data.waterGoal / WATER_STEP
  const weightChange = data.latestBody && data.prevBody
    ? +(data.latestBody.weight_kg - data.prevBody.weight_kg).toFixed(1)
    : null
  const isNewUser = !data.activeProgram && !data.lastSession && !data.hasProfile
  // todaySession yalnızca todayDay ile aynı güne aitse geçerli sayılır
  const todaySessionForDay = data.todaySession?.program_day_id === data.todayDay?.id
    ? data.todaySession : null
  const isWorkoutDone = !!todaySessionForDay?.ended_at
  const isWorkoutInProgress = !!todaySessionForDay && !todaySessionForDay.ended_at

  function handleWorkoutTap() {
    if (isWorkoutDone) {
      navigate(`/workout/history/${todaySessionForDay!.id}`)
    } else if (isWorkoutInProgress) {
      navigate('/workout/start', { state: { dayId: data!.todayDay?.id } })
    } else {
      setShowStartConfirm(true)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>

      {/* ── Header ── */}
      <div className="px-5 pt-14 pb-5 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
            {getGreeting()}
          </p>
          <h1 className="text-[30px] font-black tracking-tight leading-none" style={{ color: C.text }}>
            Bugün
          </h1>
          <p className="text-xs mt-1.5 font-medium capitalize" style={{ color: C.textLow }}>
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {data.latestBody && (
            <button
              onClick={() => navigate('/body')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <Scale size={11} style={{ color: C.textLow }} />
              <span className="text-[12px] font-bold tabular-nums" style={{ color: C.textMid }}>
                {data.latestBody.weight_kg} kg
              </span>
              {weightChange !== null && weightChange !== 0 && (
                <span className="text-[11px] font-bold" style={{ color: weightChange < 0 ? C.successText : '#b91c1c' }}>
                  {weightChange > 0 ? '+' : ''}{weightChange}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => navigate('/profile')}
            className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-95 transition-transform"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMid }}
          >
            <UserCircle size={16} />
          </button>
        </div>
      </div>

      <div className="px-4 space-y-3 pb-32">

        {/* ── Yeni Kullanıcı Hoş Geldin — antrenman kartının üstünde ── */}
        {isNewUser && (
          <Card>
            <div className="p-5">
              <p className="text-[22px] font-black leading-tight mb-2" style={{ color: C.text }}>Hoş geldin!</p>
              <p className="text-sm leading-relaxed mb-5" style={{ color: C.textMid }}>
                Başlamak için önce hedeflerini gir, sonra kendine uygun bir antrenman programı oluştur.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => navigate('/profile')}
                  className="flex-1 py-3.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
                  style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.text }}
                >
                  Hedefleri Gir
                </button>
                <button
                  onClick={() => navigate('/programs')}
                  className="flex-1 py-3.5 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                  style={{ background: C.startBg, border: `1px solid ${C.startBorder}`, color: C.startText }}
                >
                  Program Oluştur
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Antrenman Hero ── */}
        {data.activeProgram ? (
          data.todayDay ? (
            <button
              onClick={handleWorkoutTap}
              className="w-full rounded-2xl overflow-hidden text-left active:scale-[0.985] transition-transform duration-150"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              {/* Üst bant */}
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: C.textLow }}>
                  {isWorkoutInProgress ? (
                    <span className="flex items-center gap-1.5" style={{ color: C.textMid }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse"
                        style={{ background: C.ongoingText }} />
                      devam ediyor
                    </span>
                  ) : isWorkoutDone ? 'tamamlandı' : data.activeProgram.name}
                </span>
                <span
                  className="text-[11px] font-bold px-3 py-1 rounded-full"
                  style={{
                    background: isWorkoutDone ? C.successBg : isWorkoutInProgress ? C.ongoingBg : C.startBg,
                    color:      isWorkoutDone ? C.successText : isWorkoutInProgress ? C.ongoingText : C.startText,
                    border:     `1px solid ${isWorkoutDone ? C.successBorder : isWorkoutInProgress ? C.ongoingBorder : C.startBorder}`,
                  }}
                >
                  {isWorkoutDone ? '✓ Tamamlandı' : isWorkoutInProgress ? 'Devam Et' : 'Başlat'}
                </span>
              </div>

              {/* İçerik */}
              <div className="px-5 py-5">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-[32px] font-black leading-none tracking-tight mb-1.5" style={{ color: C.text }}>
                      {data.todayDay.day_name}
                    </p>
                    <p className="text-sm" style={{ color: C.textMid }}>
                      {data.todayExercises.length} egzersiz
                      {isWorkoutDone && ` · ${formatDuration(todaySessionForDay!.started_at, todaySessionForDay!.ended_at)}`}
                    </p>
                  </div>
                  <ArrowRight size={18} style={{ color: C.textLow, marginBottom: 4 }} />
                </div>

                {data.todayExercises.length > 0 && (
                  <div className="pt-4 space-y-3" style={{ borderTop: `1px solid ${C.borderSub}` }}>
                    {data.todayExercises.slice(0, 4).map(e => (
                      <div key={e.id} className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold" style={{ color: C.textMid }}>{e.name}</span>
                        <span className="text-[12px] font-medium tabular-nums" style={{ color: C.textLow }}>{exerciseTarget(e)}</span>
                      </div>
                    ))}
                    {data.todayExercises.length > 4 && (
                      <p className="text-xs pt-0.5" style={{ color: C.textLow }}>
                        +{data.todayExercises.length - 4} egzersiz daha
                      </p>
                    )}
                  </div>
                )}
              </div>
            </button>
          ) : (
            <Card onClick={() => navigate('/workout')}>
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: C.surfaceHigh, border: `1px solid ${C.borderSub}` }}>
                    <Dumbbell size={18} style={{ color: C.textLow }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
                      {data.activeProgram.name}
                    </p>
                    <p className="text-base font-bold" style={{ color: C.text }}>Antrenman Günü Seç</p>
                    <p className="text-xs mt-0.5" style={{ color: C.textMid }}>Bugün için programda gün yok</p>
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: C.textLow }} />
              </div>
            </Card>
          )
        ) : (
          <Card onClick={() => navigate('/programs')}>
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: C.surfaceHigh, border: `1px solid ${C.borderSub}` }}>
                  <Dumbbell size={18} style={{ color: C.textLow }} />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: C.text }}>Program oluştur</p>
                  <p className="text-sm mt-0.5" style={{ color: C.textMid }}>Antrenman programın henüz yok</p>
                </div>
              </div>
              <ArrowRight size={16} style={{ color: C.textLow }} />
            </div>
          </Card>
        )}

        {/* ── Bu Hafta + Son Antrenman ── */}
        <Card>
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Bu Hafta</SectionLabel>
              {data.lastSession && (
                <button
                  onClick={() => navigate('/workout/history')}
                  className="flex items-center gap-1 text-[11px] font-semibold active:opacity-60 transition-opacity"
                  style={{ color: C.textLow }}
                >
                  Geçmiş <ChevronRight size={11} />
                </button>
              )}
            </div>

            {/* Gün takvimi */}
            <div className="flex gap-1.5 mb-4">
              {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((label, i) => {
                const isToday = i === (new Date(todayStr + 'T12:00:00').getDay() + 6) % 7
                const hasWorkout  = data.weekDays[i]
                const hasActivity = data.weekActivityDays[i]
                const hasBoth = hasWorkout && hasActivity
                const hasEither = hasWorkout || hasActivity

                // renk mantığı
                const workoutColor = C.successText        // yeşil
                const activityColor = C.startText         // mavi
                const bgWorkout  = C.successBg
                const bgActivity = C.startBg
                const borderWorkout  = C.successBorder
                const borderActivity = C.startBorder

                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div
                      className="w-full h-7 rounded-lg flex items-center justify-center overflow-hidden transition-colors relative"
                      style={{
                        background: hasBoth ? 'transparent' : hasWorkout ? bgWorkout : hasActivity ? bgActivity : C.surfaceHigh,
                        border: `1px solid ${isToday && !hasEither ? C.startBorder : hasWorkout ? borderWorkout : hasActivity ? borderActivity : C.borderSub}`,
                      }}
                    >
                      {/* Yarı-yarı arka plan */}
                      {hasBoth && (
                        <>
                          <div className="absolute inset-y-0 left-0 w-1/2" style={{ background: bgWorkout }} />
                          <div className="absolute inset-y-0 right-0 w-1/2" style={{ background: bgActivity }} />
                        </>
                      )}
                      {/* İndikatör nokta */}
                      {hasBoth ? (
                        <div className="relative flex gap-0.5 z-10">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: workoutColor }} />
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: activityColor }} />
                        </div>
                      ) : hasWorkout ? (
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: workoutColor }} />
                      ) : hasActivity ? (
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: activityColor }} />
                      ) : isToday ? (
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.startText }} />
                      ) : null}
                    </div>
                    <span className="text-[9px] font-semibold" style={{ color: isToday ? C.startText : C.textLow }}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Sayılar */}
            {(() => {
              const weekActivities = data.weekActivityDays.filter(Boolean).length
              const stats = [
                {
                  value: data.weeklySessions,
                  label: 'antrenman',
                  color: C.successText,
                  dotColor: C.successText,
                  show: true,
                },
                {
                  value: weekActivities,
                  label: 'aktivite',
                  color: C.startText,
                  dotColor: C.startText,
                  show: true,
                },
                {
                  value: data.streak,
                  label: data.streak === 0 ? 'seri yok' : 'gün seri',
                  color: data.streak >= 3 ? C.ongoingText : C.text,
                  flame: data.streak >= 3,
                  show: true,
                },
              ]
              return (
                <div className="grid grid-cols-3 pt-4 mt-1" style={{ borderTop: `1px solid ${C.borderSub}` }}>
                  {stats.map(({ value, label, color, dotColor, flame }, idx) => (
                    <div
                      key={label}
                      className={`flex flex-col items-center py-1 ${idx < 2 ? 'border-r' : ''}`}
                      style={{ borderColor: C.borderSub }}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        {dotColor && (
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                        )}
                        <span className="text-[22px] font-black tabular-nums leading-none" style={{ color }}>
                          {value}
                        </span>
                        {flame && <Flame size={13} style={{ color: C.ongoingText }} />}
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.textLow }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Son Antrenman — kompakt satır */}
            {data.lastSession && (
              <button
                onClick={() => navigate('/workout/history')}
                className="w-full flex items-center gap-3 mt-3 pt-3 active:opacity-60 transition-opacity"
                style={{ borderTop: `1px solid ${C.borderSub}` }}
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: C.surfaceHigh }}>
                  <Dumbbell size={13} strokeWidth={1.6} style={{ color: C.textMid }} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[13px] font-semibold truncate" style={{ color: C.text }}>
                    {data.lastSessionName || 'Son Antrenman'}
                  </p>
                  <p className="text-[11px]" style={{ color: C.textLow }}>
                    {relativeDate(data.lastSession.date)}
                    {' · '}{formatDuration(data.lastSession.started_at, data.lastSession.ended_at)}
                    {data.lastSessionSets > 0 && ` · ${data.lastSessionSets} set`}
                  </p>
                </div>
                <ChevronRight size={13} style={{ color: C.textLow }} />
              </button>
            )}

            {!data.lastSession && !isNewUser && (
              <button
                onClick={() => navigate('/workout')}
                className="w-full flex items-center gap-3 mt-3 pt-3 active:opacity-60 transition-opacity"
                style={{ borderTop: `1px solid ${C.borderSub}` }}
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: C.startBg }}>
                  <Dumbbell size={13} strokeWidth={1.6} style={{ color: C.startText }} />
                </div>
                <p className="text-[13px] font-semibold" style={{ color: C.startText }}>
                  İlk antrenmanını başlat
                </p>
                <ArrowRight size={13} style={{ color: C.startText, marginLeft: 'auto' }} />
              </button>
            )}
          </div>
        </Card>

        {/* ── Kalori & Makrolar ── */}
        <Card onClick={() => navigate('/nutrition')}>
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <SectionLabel>Kalori</SectionLabel>
              <span className="text-[10px] font-medium" style={{ color: C.textLow }}>
                hedef {data.calorieGoal} kcal
              </span>
            </div>

            {/* Kalori bar */}
            <div className="mb-1.5">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[28px] font-black leading-none tabular-nums" style={{ color: C.text }}>
                  {Math.round(data.calorieConsumed)}
                </span>
                <span className="text-sm font-semibold" style={{ color: calorieOver ? '#b91c1c' : C.successText }}>
                  {calorieOver
                    ? `${Math.abs(Math.round(calorieLeft))} kcal fazla`
                    : `${Math.round(calorieLeft)} kcal kaldı`}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mb-5" style={{ background: C.borderSub }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${caloriePct}%`, backgroundColor: calorieOver ? '#b91c1c' : C.startText }}
                />
              </div>
            </div>

            {data.calorieConsumed === 0 ? (
              <div className="pt-1 pb-1 flex items-center justify-between">
                <p className="text-[13px]" style={{ color: C.textMid }}>Bugün henüz eklemedin</p>
                <span className="text-[12px] font-bold flex items-center gap-1" style={{ color: C.startText }}>
                  Ekle <ArrowRight size={12} />
                </span>
              </div>
            ) : (
              <div className="space-y-3.5">
                <MacroBar label="Protein" value={data.protein} goal={data.proteinGoal} color="#4f46e5" />
                <MacroBar label="Karbonhidrat" value={data.carb} goal={data.carbGoal} color="#166534" />
                <MacroBar label="Yağ" value={data.fat} goal={data.fatGoal} color="#b45309" />
              </div>
            )}
          </div>
        </Card>

        {/* ── Su Takibi ── */}
        <Card>
          <div className="p-5">
            {/* Header — her zaman görünür */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SectionLabel>Su Takibi</SectionLabel>
                <div className="flex items-baseline gap-1">
                  <span className="text-[16px] font-black tabular-nums" style={{ color: C.text }}>
                    {waterGlasses}
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: C.textMid }}>
                    /{waterGoalGlasses}
                  </span>
                  <span className="text-[11px]" style={{ color: C.textLow }}> bardak</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {!waterCollapsed && (
                  <>
                    <button
                      onClick={() => removeWaterMutation.mutate()}
                      disabled={water === 0}
                      className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all"
                      style={{ background: C.surfaceHigh, border: `1px solid ${C.borderSub}`, color: C.textMid }}
                    >
                      <Minus size={14} />
                    </button>
                    <button
                      onClick={() => addWaterMutation.mutate()}
                      className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                      style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.text }}
                    >
                      <Plus size={14} />
                    </button>
                  </>
                )}
                <button
                  onClick={toggleWater}
                  className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                  style={{ color: C.textLow }}
                >
                  {waterCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>
            </div>

            {/* Expand edilince bardak gösterimi */}
            {!waterCollapsed && (
              <div className="mt-4">
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-[28px] font-black leading-none tabular-nums" style={{ color: C.text }}>
                    {formatWater(water)}
                  </span>
                  <span className="text-sm font-medium" style={{ color: C.textMid }}>
                    / {data.waterGoal / 1000} L
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: waterGoalGlasses }).map((_, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <Droplets
                        size={14}
                        style={{ color: i < waterGlasses ? C.startText : C.borderSub }}
                        className="transition-colors duration-300"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── Kalori Dengesi ── */}
        {data.tdee && (() => {
          const totalBurned = data.tdee + activityCalories
          const consumed = Math.round(data.calorieConsumed)
          const net = consumed - totalBurned
          const isDeficit = net < 0
          // Bar: yenilen / yakılan oranı — %100 = denge noktası
          const balancePct = Math.min((consumed / Math.max(totalBurned, 1)) * 100, 100)
          const barColor = isDeficit ? C.successText : '#b91c1c'

          return (
            <Card onClick={() => navigate('/activity')}>
              <div className="p-5">

                {/* Başlık */}
                <div className="flex items-center justify-between mb-5">
                  <SectionLabel>Kalori Dengesi</SectionLabel>
                  <Zap size={13} style={{ color: C.textLow }} />
                </div>

                {/* Ana sayı — net fark */}
                <div className="flex items-end justify-between mb-1">
                  <div>
                    <p className="text-[11px] font-semibold mb-1" style={{ color: C.textLow }}>
                      {consumed > 0
                        ? (isDeficit ? 'Kalori açığı' : 'Kalori fazlası')
                        : 'Tahmini yakılan'}
                    </p>
                    <p className="text-[36px] font-black tabular-nums leading-none" style={{ color: consumed > 0 ? barColor : C.text }}>
                      {consumed > 0 ? Math.abs(net) : totalBurned}
                      <span className="text-[15px] font-semibold ml-1" style={{ color: C.textMid }}>kcal</span>
                    </p>
                  </div>
                  {consumed > 0 && (
                    <div className="text-right pb-1">
                      <p className="text-[11px]" style={{ color: C.textLow }}>
                        {isDeficit ? '🔥 Yağ yakıyorsun' : '⚠️ Hedefin üstünde'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Balance bar */}
                {consumed > 0 && (
                  <div className="mt-3 mb-5">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.borderSub }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${balancePct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                )}

                {/* 3 kolon: Yakılan / Yenen / Aktivite */}
                <div
                  className="grid grid-cols-3 gap-2 mt-4 pt-4"
                  style={{ borderTop: `1px solid ${C.borderSub}` }}
                >
                  {[
                    { label: 'TDEE', value: data.tdee, color: C.text },
                    { label: 'Yenen', value: consumed, color: consumed > 0 ? C.text : C.textLow },
                    { label: 'Aktivite', value: activityCalories, color: activityCalories > 0 ? C.successText : C.textLow },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center">
                      <p className="text-[17px] font-black tabular-nums leading-none" style={{ color }}>
                        {value}
                      </p>
                      <p className="text-[10px] font-semibold mt-1 uppercase tracking-wide" style={{ color: C.textLow }}>
                        {label}
                      </p>
                    </div>
                  ))}
                </div>

              </div>
            </Card>
          )
        })()}

        {/* ── Vücut Ölçümleri ── */}
        {data.latestBody && (() => {
          const b = data.latestBody
          const p = data.prevBody
          const extraFields: { label: string; cur?: number; prev?: number; unit: string }[] = [
            { label: 'Bel', cur: b.waist_cm, prev: p?.waist_cm, unit: 'cm' },
            { label: 'Göğüs', cur: b.chest_cm, prev: p?.chest_cm, unit: 'cm' },
            { label: 'Kol', cur: b.arm_cm, prev: p?.arm_cm, unit: 'cm' },
            { label: 'Kalça', cur: b.hip_cm, prev: p?.hip_cm, unit: 'cm' },
            { label: 'Yağ', cur: b.body_fat_pct, prev: p?.body_fat_pct, unit: '%' },
          ].filter(f => f.cur != null)
          const hasExtra = extraFields.length > 0

          return (
            <Card>
              <div className="p-5">
                {/* Header satırı */}
                <div className="flex items-center justify-between mb-4">
                  <SectionLabel>Vücut</SectionLabel>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate('/body')}
                      className="text-[11px] font-semibold flex items-center gap-0.5 active:opacity-60 transition-opacity"
                      style={{ color: C.textLow }}
                    >
                      Detay <ChevronRight size={11} />
                    </button>
                    {hasExtra && (
                      <button
                        onClick={() => setBodyExpanded(v => !v)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center active:scale-95 transition-all"
                        style={{ color: C.textLow }}
                      >
                        {bodyExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Ağırlık + sparkline */}
                <div className="flex items-end justify-between mb-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[36px] font-black leading-none tabular-nums" style={{ color: C.text }}>
                      {b.weight_kg}
                    </span>
                    <span className="text-sm font-medium" style={{ color: C.textLow }}>kg</span>
                  </div>
                  {weightChange !== null && weightChange !== 0 && (
                    <span className="text-sm font-bold tabular-nums" style={{ color: weightChange < 0 ? C.successText : '#b91c1c' }}>
                      {weightChange > 0 ? '+' : ''}{weightChange} kg
                    </span>
                  )}
                </div>

                {data.bodyHistory.length >= 2 && (() => {
                  const reversed = [...data.bodyHistory].reverse()
                  const weights = reversed.map(bh => bh.weight_kg)
                  const min = Math.min(...weights)
                  const max = Math.max(...weights)
                  const range = max - min || 1
                  const W = 280; const H = 36
                  const pts = weights.map((w, i) => {
                    const x = (i / (weights.length - 1)) * W
                    const y = H - ((w - min) / range) * H
                    return `${x},${y}`
                  }).join(' ')
                  return (
                    <div className="mb-1">
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 36 }}>
                        <polyline points={pts} fill="none"
                          stroke={C.startText} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                        {weights.map((_, i) => {
                          const x = (i / (weights.length - 1)) * W
                          const y = H - ((weights[i] - min) / range) * H
                          return <circle key={i} cx={x} cy={y} r="3" fill={C.startText} />
                        })}
                      </svg>
                    </div>
                  )
                })()}

                {/* Ek ölçümler — expand edilince */}
                {bodyExpanded && hasExtra && (
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.borderSub}` }}>
                    {extraFields.map(f => {
                      const diff = f.cur != null && f.prev != null ? +(f.cur - f.prev).toFixed(1) : null
                      return (
                        <div key={f.label} className="rounded-xl p-2.5" style={{ background: C.surfaceHigh }}>
                          <p className="text-[10px] font-semibold mb-1" style={{ color: C.textLow }}>{f.label}</p>
                          <p className="text-[15px] font-black tabular-nums leading-none" style={{ color: C.text }}>
                            {f.cur}<span className="text-[10px] font-medium ml-0.5" style={{ color: C.textLow }}>{f.unit}</span>
                          </p>
                          {diff !== null && diff !== 0 && (
                            <p className="text-[10px] font-bold mt-0.5 tabular-nums" style={{
                              color: diff < 0 ? C.successText : '#b91c1c'
                            }}>
                              {diff > 0 ? '+' : ''}{diff}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          )
        })()}


      </div>

      {/* ── Başlat onay modalı ── */}
      {showStartConfirm && data.todayDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={() => setShowStartConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
              Antrenman
            </p>
            <p className="text-[22px] font-black tracking-tight mb-1" style={{ color: C.text }}>
              {data.todayDay.day_name}
            </p>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>
              {data.todayExercises.length} egzersiz · Başlatılsın mı?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowStartConfirm(false)}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold active:scale-95 transition-transform"
                style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.textMid }}
              >
                İptal
              </button>
              <button
                onClick={() => { setShowStartConfirm(false); navigate('/workout/start', { state: { dayId: data!.todayDay?.id } }) }}
                className="flex-[2] py-3.5 rounded-2xl text-sm font-bold active:scale-95 transition-transform"
                style={{ background: C.startBg, border: `1px solid ${C.startBorder}`, color: C.startText }}
              >
                Başlat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

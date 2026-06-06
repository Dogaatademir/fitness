import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Minus, ArrowRight, Dumbbell, Settings,
  Trophy, Flame, Scale, CheckCircle2,
} from 'lucide-react'
import { exerciseDb, waterDb } from '../lib/db'
import { supabase } from '../lib/supabase'
import { QK } from '../lib/queryClient'
import type { Program, ProgramDay, Exercise, PersonalRecord, BodyMeasurement } from '../types'

// ─── HELPERS ──────────────────────────────────────────────────
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

// ─── TYPES ────────────────────────────────────────────────────
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
  streak: number
  lastSession: LastSession | null
  lastSessionName: string
  lastSessionSets: number
  calorieConsumed: number
  calorieGoal: number
  protein: number; proteinGoal: number
  carb: number; carbGoal: number
  fat: number; fatGoal: number
  latestBody: BodyMeasurement | null
  prevBody: BodyMeasurement | null
  topPR: PersonalRecord | null
  hasProfile: boolean
}

const WATER_STEP = 250
const WATER_GOAL = 3000

async function fetchDashboard(): Promise<DashData> {
  const todayStr = new Date().toISOString().split('T')[0]

  const startOfWeek = new Date()
  const dow = startOfWeek.getDay()
  startOfWeek.setDate(startOfWeek.getDate() - (dow === 0 ? 6 : dow - 1))
  const weekStart = startOfWeek.toISOString().split('T')[0]

  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Oturum açılmamış')

  const { data: rpc, error } = await supabase.rpc('get_dashboard_data', {
    p_user_id: user.user.id,
    p_today: todayStr,
    p_week_start: weekStart,
  })
  if (error) throw error

  const r = (typeof rpc === 'string' ? JSON.parse(rpc) : rpc) as Record<string, unknown>
  const profile       = r.profile           as Record<string, number> | null
  const activeProgram = r.active_program     as Program | null
  const allSessions   = (r.all_sessions      as unknown[]) ?? []
  const weeklySets    = (r.weekly_sets       as Record<string, unknown>[]) ?? []
  const lastSetsList  = (r.last_session_sets as Record<string, unknown>[]) ?? []
  const foodSummary   = r.food_summary       as Record<string, number> | null
  const bodyHistory   = (r.body_history      as BodyMeasurement[]) ?? []
  const prs           = (r.prs               as PersonalRecord[]) ?? []
  const programDays   = (r.program_days      as ProgramDay[]) ?? []
  const todaySession  = r.today_session      as TodaySession | null
  const lastSessionId = r.last_session_id    as string | null

  let todayDay: ProgramDay | null = null
  let todayExercises: Exercise[] = []
  if (activeProgram) {
    // Dashboard'da "bugünkü gün" artık RPC'den gelen is_next flagine göre belirlenmeli
    // Şimdilik ilk programDay'i alıyoruz, workout sayfası zaten doğru sırayı gösteriyor
    todayDay = programDays.find(d => d.program_id === activeProgram.id) ?? null
    if (todayDay) todayExercises = await exerciseDb.getByDay(todayDay.id)
  }

  const weeklyVolume = weeklySets.reduce(
    (acc, s) => acc + ((s.weight_kg as number) || 0) * ((s.reps as number) || 0), 0
  )

  const dateSet = new Set((allSessions as { date: string }[]).map(s => s.date))
  let streak = 0
  const cur = new Date()
  if (!dateSet.has(cur.toISOString().split('T')[0])) cur.setDate(cur.getDate() - 1)
  while (dateSet.has(cur.toISOString().split('T')[0])) { streak++; cur.setDate(cur.getDate() - 1) }

  const weekSessions = (allSessions as { date: string }[]).filter(s => s.date >= weekStart)
  const lastSession  = lastSessionId
    ? (allSessions as LastSession[]).find(s => s.id === lastSessionId) ?? null
    : null
  const lastSessionSets = lastSetsList.filter(s => (s as Record<string,unknown>).completed).length
  const lastSessionName = lastSession
    ? programDays.find(d => d.id === lastSession.program_day_id)?.day_name ?? ''
    : ''

  const calorieGoal = todayDay && profile?.training_calorie_goal
    ? profile.training_calorie_goal
    : (profile?.daily_calorie_goal ?? 2200)

  return {
    activeProgram,
    todayDay,
    todayExercises,
    todaySession,
    weeklySessions: weekSessions.length,
    weeklyVolume: Math.round(weeklyVolume),
    streak,
    lastSession,
    lastSessionName,
    lastSessionSets,
    calorieConsumed: foodSummary?.total_calories ?? 0,
    calorieGoal,
    protein:     foodSummary?.total_protein ?? 0,
    proteinGoal: profile?.daily_protein_goal ?? 160,
    carb:        foodSummary?.total_carb ?? 0,
    carbGoal:    profile?.daily_carb_goal ?? 250,
    fat:         foodSummary?.total_fat ?? 0,
    fatGoal:     profile?.daily_fat_goal ?? 70,
    latestBody: bodyHistory[0] ?? null,
    prevBody:   bodyHistory[1] ?? null,
    topPR: prs.length > 0 ? [...prs].sort((a, b) => b.max_weight_kg - a.max_weight_kg)[0] : null,
    hasProfile: !!profile,
  }
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────
function Ring({ value, max, size = 80, stroke = 5, over = false, children }: {
  value: number; max: number; size?: number; stroke?: number; over?: boolean; children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(value / Math.max(max, 1), 1)
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ede9e3" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={over ? '#dc2626' : '#334155'} strokeWidth={stroke}
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

function MacroBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min((value / Math.max(goal, 1)) * 100, 100)
  const over = value > goal
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-stone-400 font-medium">{label}</span>
        <span className={over ? 'text-red-500 font-semibold' : 'text-stone-600 font-medium'}>
          {Math.round(value)}<span className="text-stone-300 font-normal">/{goal}g</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-stone-100">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: over ? '#dc2626' : '#334155' }} />
      </div>
    </div>
  )
}

function Card({ children, onClick, className = '' }: {
  children: React.ReactNode; onClick?: () => void; className?: string
}) {
  const base = 'rounded-2xl bg-white border border-stone-100 p-5 shadow-sm'
  if (onClick)
    return <button onClick={onClick} className={`${base} w-full text-left transition-all active:scale-[0.98] hover:shadow-md ${className}`}>{children}</button>
  return <div className={`${base} ${className}`}>{children}</div>
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-3">{children}</p>
}

// ─── DASHBOARD ────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const todayStr = new Date().toISOString().split('T')[0]

  const { data } = useQuery({
    queryKey: QK.dashboard,
    queryFn: fetchDashboard,
    staleTime: 1000 * 60 * 2,
  })

  const { data: water = 0 } = useQuery({
    queryKey: QK.water(todayStr),
    queryFn: () => waterDb.getToday(),
    staleTime: Infinity,
  })

  const addWaterMutation = useMutation({
    mutationFn: () => waterDb.add(WATER_STEP),
    onMutate: () => {
      qc.setQueryData(QK.water(todayStr), (prev: number) => (prev ?? 0) + WATER_STEP)
    },
  })

  const removeWaterMutation = useMutation({
    mutationFn: async () => {
      const glasses = Math.max(0, Math.round((water) / WATER_STEP) - 1)
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

  if (!data) return null

  const calorieLeft = data.calorieGoal - data.calorieConsumed
  const calorieOver = calorieLeft < 0
  const waterGlasses = Math.round(water / WATER_STEP)
  const waterGoalGlasses = WATER_GOAL / WATER_STEP
  const weightChange = data.latestBody && data.prevBody
    ? +(data.latestBody.weight_kg - data.prevBody.weight_kg).toFixed(1)
    : null
  const isNewUser = !data.activeProgram && !data.lastSession && !data.hasProfile

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6 flex items-start justify-between">
        <div>
          <p className="text-xs text-stone-400 font-medium tracking-wide">{getGreeting()}</p>
          <div className="flex items-baseline gap-2.5 mt-1">
            <h1 className="text-[32px] font-bold tracking-tight leading-none text-stone-900">Bugün</h1>
            {data.latestBody && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-stone-100 shadow-sm">
                <Scale size={10} className="text-stone-400" />
                <span className="text-xs font-semibold text-stone-600">{data.latestBody.weight_kg} kg</span>
                {weightChange !== null && weightChange !== 0 && (
                  <span className={`text-[10px] font-semibold ${weightChange < 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                    {weightChange > 0 ? '+' : ''}{weightChange}
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-stone-400 mt-2 capitalize">
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={() => navigate('/settings')}
          className="mt-1 w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-stone-100 shadow-sm text-stone-400 hover:text-stone-700 transition-colors">
          <Settings size={16} />
        </button>
      </div>

      <div className="px-4 space-y-3 pb-10">

        {/* Antrenman hero */}
        {data.activeProgram ? (
          data.todayDay ? (
            <button onClick={() => navigate('/workout/start')}
              className="w-full rounded-2xl bg-slate-800 p-5 shadow-md text-left transition-all active:scale-[0.98]">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  {data.todaySession?.ended_at
                    ? <CheckCircle2 size={13} className="text-emerald-400" />
                    : <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">{data.activeProgram.name}</span>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                  data.todaySession?.ended_at ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white'
                }`}>
                  {data.todaySession?.ended_at ? 'Tamamlandı' : data.todaySession ? 'Devam Et' : 'Başlat'}
                </div>
              </div>
              <div className="flex items-end justify-between mb-5">
                <div>
                  <p className="text-[28px] font-bold text-white leading-none">{data.todayDay.day_name}</p>
                  <p className="text-sm text-slate-400 mt-1.5 font-medium">
                    {data.todayExercises.length} egzersiz
                    {data.todaySession?.ended_at && <> · {formatDuration(data.todaySession.started_at, data.todaySession.ended_at)}</>}
                  </p>
                </div>
                <ArrowRight size={17} className="text-slate-500 mb-1" />
              </div>
              {data.todayExercises.length > 0 && (
                <div className="border-t border-slate-700/80 pt-4 space-y-2.5">
                  {data.todayExercises.slice(0, 3).map(e => (
                    <div key={e.id} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300 font-medium">{e.name}</span>
                      <span className="text-xs text-slate-500 font-medium tabular-nums">{exerciseTarget(e)}</span>
                    </div>
                  ))}
                  {data.todayExercises.length > 3 && (
                    <p className="text-xs text-slate-500 pt-0.5">+{data.todayExercises.length - 3} egzersiz daha</p>
                  )}
                </div>
              )}
            </button>
          ) : (
            <button onClick={() => navigate('/workout')}
              className="w-full rounded-2xl bg-slate-800 p-5 shadow-md text-left transition-all active:scale-[0.98]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">{data.activeProgram.name}</span>
                <div className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-white">Başlat</div>
              </div>
              <p className="text-[28px] font-bold text-white leading-none mt-4">Antrenmana Başla</p>
              <p className="text-sm text-slate-400 mt-1.5 font-medium">Sıradaki günü görmek için dokun</p>
            </button>
          )
        ) : (
          <Card onClick={() => navigate('/programs')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center">
                  <Dumbbell size={18} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-800">Program oluştur</p>
                  <p className="text-xs text-stone-400 mt-0.5">Antrenman programın henüz yok</p>
                </div>
              </div>
              <ArrowRight size={15} className="text-stone-300" />
            </div>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="!p-4">
            <p className="text-[9px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-2.5">Bu Hafta</p>
            <p className="text-[28px] font-bold text-stone-900 leading-none">{data.weeklySessions}</p>
            <p className="text-[10px] text-stone-400 mt-1.5 font-medium">antrenman</p>
          </Card>
          <Card className="!p-4">
            <p className="text-[9px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-2.5">Seri</p>
            <div className="flex items-end gap-1">
              <p className="text-[28px] font-bold text-stone-900 leading-none">{data.streak}</p>
              {data.streak > 1 && <Flame size={14} className="text-amber-400 mb-1" />}
            </div>
            <p className="text-[10px] text-stone-400 mt-1.5 font-medium">gün üst üste</p>
          </Card>
          <Card className="!p-4">
            <p className="text-[9px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-2.5">Hacim</p>
            <p className="text-[28px] font-bold text-stone-900 leading-none">
              {data.weeklyVolume > 0 ? (data.weeklyVolume / 1000).toFixed(1) : '—'}
            </p>
            <p className="text-[10px] text-stone-400 mt-1.5 font-medium">ton · hafta</p>
          </Card>
        </div>

        {/* Kalori */}
        <Card onClick={() => navigate('/nutrition')}>
          <div className="flex items-center justify-between mb-4">
            <Label>Kalori</Label>
            <span className="text-[10px] text-stone-300 font-medium -mt-3">hedef {data.calorieGoal} kcal</span>
          </div>
          <div className="flex items-center gap-5">
            <Ring value={data.calorieConsumed} max={data.calorieGoal} over={calorieOver}>
              <div className="text-center">
                <p className="text-[13px] font-bold leading-none text-stone-900">{Math.round(data.calorieConsumed)}</p>
                <p className="text-[8px] text-stone-400 mt-0.5 font-medium">kcal</p>
              </div>
            </Ring>
            <div className="flex-1">
              <div className="mb-3">
                {calorieOver
                  ? <p className="text-sm text-red-500 font-bold">{Math.abs(calorieLeft)} kcal aşıldı</p>
                  : <p className="text-sm font-bold text-stone-900">{calorieLeft}{' '}<span className="text-xs font-normal text-stone-400">kcal kaldı</span></p>
                }
              </div>
              <div className="space-y-2.5">
                <MacroBar label="Protein" value={data.protein} goal={data.proteinGoal} />
                <MacroBar label="Karb" value={data.carb} goal={data.carbGoal} />
                <MacroBar label="Yağ" value={data.fat} goal={data.fatGoal} />
              </div>
            </div>
          </div>
        </Card>

        {/* Su */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div>
              <Label>Su Takibi</Label>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-stone-900 leading-none">{(water / 1000).toFixed(2)}</span>
                <span className="text-sm font-medium text-stone-400">L</span>
                <span className="text-xs text-stone-300 font-medium">/ {WATER_GOAL / 1000} L</span>
              </div>
              <p className="text-xs text-stone-400 mt-1 font-medium">{waterGlasses} / {waterGoalGlasses} bardak</p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => removeWaterMutation.mutate()} disabled={water === 0}
                className="w-8 h-8 rounded-xl border border-stone-200 bg-white flex items-center justify-center text-stone-400 active:bg-stone-100 disabled:opacity-30 transition-colors shadow-sm">
                <Minus size={14} />
              </button>
              <button onClick={() => addWaterMutation.mutate()}
                className="w-8 h-8 rounded-xl border border-stone-200 bg-white flex items-center justify-center text-stone-700 active:bg-stone-100 transition-colors shadow-sm">
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: waterGoalGlasses }).map((_, i) => (
              <div key={i} className="flex-1 h-2 rounded-full transition-all duration-300"
                style={{ backgroundColor: i < waterGlasses ? '#334155' : '#ede9e3' }} />
            ))}
          </div>
        </Card>

        {/* Ağırlık + Rekor */}
        {(data.latestBody || data.topPR) && (
          <div className="grid grid-cols-2 gap-3">
            {data.latestBody && (
              <Card onClick={() => navigate('/body')} className="!p-4">
                <p className="text-[9px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-2.5">Ağırlık</p>
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl font-bold text-stone-900 leading-none">{data.latestBody.weight_kg}</p>
                  <p className="text-sm text-stone-400 font-medium">kg</p>
                </div>
                {weightChange !== null && weightChange !== 0
                  ? <p className={`text-xs font-semibold mt-1.5 ${weightChange < 0 ? 'text-emerald-500' : 'text-red-400'}`}>{weightChange > 0 ? '+' : ''}{weightChange} kg</p>
                  : weightChange === 0 ? <p className="text-xs text-stone-300 mt-1.5">değişim yok</p> : null}
              </Card>
            )}
            {data.topPR && (
              <Card onClick={() => navigate('/workout/history')} className={`!p-4 ${!data.latestBody ? 'col-span-2' : ''}`}>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-stone-400 font-semibold">Rekor</p>
                  <Trophy size={10} className="text-amber-400" />
                </div>
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl font-bold text-stone-900 leading-none">{data.topPR.max_weight_kg}</p>
                  <p className="text-sm text-stone-400 font-medium">kg</p>
                </div>
                <p className="text-[11px] text-stone-400 mt-1.5 font-medium truncate">{data.topPR.exercise_name}</p>
              </Card>
            )}
          </div>
        )}

        {/* Son antrenman */}
        {data.lastSession && (
          <Card onClick={() => navigate('/workout/history')}>
            <div className="flex items-center justify-between">
              <div>
                <Label>Son Antrenman</Label>
                <p className="text-base font-bold text-stone-900">{data.lastSessionName || relativeDate(data.lastSession.date)}</p>
                <p className="text-xs text-stone-400 mt-1 font-medium">
                  {data.lastSessionName ? `${relativeDate(data.lastSession.date)} · ` : ''}
                  {formatDuration(data.lastSession.started_at, data.lastSession.ended_at)}
                  {data.lastSessionSets > 0 && ` · ${data.lastSessionSets} set`}
                </p>
              </div>
              <ArrowRight size={14} className="text-stone-300" />
            </div>
          </Card>
        )}

        {/* Hoş geldin */}
        {isNewUser && (
          <Card>
            <p className="text-base font-bold text-stone-900 mb-1">Hoş geldin</p>
            <p className="text-sm text-stone-400 mb-5 leading-relaxed">
              Başlamak için önce hedeflerini gir, sonra bir antrenman programı oluştur.
            </p>
            <div className="flex gap-2">
              <button onClick={() => navigate('/settings')}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 active:bg-stone-50 transition-colors">
                Hedefleri Gir
              </button>
              <button onClick={() => navigate('/programs')}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 active:bg-slate-600 text-white text-sm font-semibold transition-colors">
                Program Oluştur
              </button>
            </div>
          </Card>
        )}

      </div>
    </div>
  )
}

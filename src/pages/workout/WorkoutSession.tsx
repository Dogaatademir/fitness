import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check, X, Plus, ChevronDown, ChevronUp,
  Clock, Trophy, Minus,
} from 'lucide-react'
import { sessionDb, setDb, prDb } from '../../lib/db'
import { supabase, getUserId } from '../../lib/supabase'
import { today } from '../../lib/storage'
import { QK } from '../../lib/queryClient'
import type { Exercise, WorkoutSession, SessionSet, ProgramDay } from '../../types'

// ─── HELPERS ──────────────────────────────────────────────────
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function calcVolume(sets: SessionSet[]): number {
  return sets
    .filter(s => s.completed)
    .reduce((acc, s) => acc + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
}

// ─── REST TIMER ───────────────────────────────────────────────
let sharedAudioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContext()
    }
    return sharedAudioCtx
  } catch { return null }
}

// Kullanıcı etkileşiminde çağır — suspended context'i unlock eder
function primeAudio() {
  const ctx = getAudioCtx()
  if (ctx && ctx.state === 'suspended') ctx.resume()
}

function playBeep() {
  // Ses — Safari ön plandayken çalışır
  const ctx = getAudioCtx()
  if (!ctx) return
  const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()
  resume.then(() => {
    const now = ctx.currentTime
    const beepTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + start)
      gain.gain.setValueAtTime(0.5, now + start)
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration)
      osc.start(now + start)
      osc.stop(now + start + duration + 0.05)
    }
    beepTone(880, 0, 0.15)
    beepTone(1100, 0.18, 0.15)
    beepTone(1320, 0.36, 0.28)
  }).catch(() => {})
}

function RestTimer({ seconds, onDone, onSkip }: {
  seconds: number
  onDone: () => void
  onSkip: () => void
}) {
  const endTimeRef = useRef<number>(Date.now() + seconds * 1000)
  const [remaining, setRemaining] = useState(seconds)
  const [totalSeconds, setTotalSeconds] = useState(seconds)

  useEffect(() => {
    if (remaining <= 0) { onDone(); return }
    const t = setInterval(() => {
      const r = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
      setRemaining(r)
      if (r <= 0) { clearInterval(t); playBeep(); onDone() }
    }, 500)
    return () => clearInterval(t)
  }, [])

  function addTime(delta: number) {
    endTimeRef.current += delta * 1000
    setTotalSeconds(t => t + delta)
    setRemaining(r => Math.max(0, r + delta))
  }

  const pct = Math.max(0, remaining / totalSeconds)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col items-center justify-center px-8">
      <p className="text-stone-400 text-sm font-medium mb-6 uppercase tracking-widest">Dinlenme</p>

      <div className="relative flex items-center justify-center mb-8">
        <svg width={160} height={160} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={80} cy={80} r={70} fill="none" stroke="#1e293b" strokeWidth={8} />
          <circle
            cx={80} cy={80} r={70} fill="none"
            stroke={remaining <= 5 ? '#f59e0b' : '#22d3ee'}
            strokeWidth={8}
            strokeDasharray={`${pct * 2 * Math.PI * 70} ${2 * Math.PI * 70}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="absolute text-center">
          <p className={`text-5xl font-bold tabular-nums ${remaining <= 5 ? 'text-amber-400' : 'text-white'}`}>
            {remaining}
          </p>
          <p className="text-stone-500 text-xs mt-1">saniye</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => addTime(30)}
          className="w-12 h-12 rounded-xl border border-slate-700 text-slate-400 flex items-center justify-center text-xs font-bold active:bg-slate-800 transition-colors"
        >
          +30s
        </button>
        <button
          onClick={onSkip}
          className="px-8 h-12 rounded-xl bg-white text-slate-900 font-bold text-sm active:bg-stone-100 transition-colors"
        >
          Atla
        </button>
        <button
          onClick={() => addTime(-30)}
          className="w-12 h-12 rounded-xl border border-slate-700 text-slate-400 flex items-center justify-center text-xs font-bold active:bg-slate-800 transition-colors"
        >
          -30s
        </button>
      </div>
      <p className="text-stone-600 text-xs">Otomatik devam edecek</p>
    </div>
  )
}

// ─── SET ROW ──────────────────────────────────────────────────
interface SetRowProps {
  set: SessionSet
  index: number
  exercise: Exercise
  prevSet?: SessionSet
  onChange: (id: string, data: Partial<SessionSet>) => void
  onComplete: (id: string) => boolean
  onDelete: (id: string) => void
}

function SetRow({ set, index, exercise, prevSet, onChange, onComplete, onDelete }: SetRowProps) {
  const isStrength = !exercise.type || exercise.type === 'strength'
  const isBodyweight = exercise.type === 'bodyweight'
  const isCardio = exercise.type === 'cardio'
  const isTimed = exercise.type === 'timed'
  const [shakeKey, setShakeKey] = useState(0)
  const [shakeFields, setShakeFields] = useState<{ weight: boolean; reps: boolean; duration: boolean; distance: boolean; held: boolean }>({ weight: false, reps: false, duration: false, distance: false, held: false })
  const [swiped, setSwiped] = useState(false)
  const touchStartX = useRef<number>(0)
  const DELETE_WIDTH = 64

  function handleComplete() {
    const ok = onComplete(set.id)
    if (!ok) {
      setShakeFields({
        weight:   isStrength && !set.weight_kg,
        reps:     (isStrength || isBodyweight) && !set.reps,
        duration: isCardio && !set.duration_minutes && !set.distance_km,
        distance: false,
        held:     isTimed && !set.held_seconds,
      })
      setShakeKey(k => k + 1)
      setTimeout(() => setShakeFields({ weight: false, reps: false, duration: false, distance: false, held: false }), 400)
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = touchStartX.current - e.changedTouches[0].clientX
    if (dx > 40) setSwiped(true)
    else if (dx < -20) setSwiped(false)
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete butonu — arkada sabit */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-center rounded-xl"
        style={{ width: DELETE_WIDTH, background: '#b91c1c' }}>
        <button
          onClick={() => onDelete(set.id)}
          className="w-full h-full flex items-center justify-center active:opacity-70 transition-opacity"
        >
          <X size={16} color="white" strokeWidth={2.5} />
        </button>
      </div>

      {/* İçerik — swipe ile sola kayar */}
      <div
        className={`flex items-center gap-2 py-2 px-1 rounded-xl transition-transform duration-200 ${set.completed ? 'bg-emerald-50' : 'bg-white'}`}
        style={{ transform: swiped ? `translateX(-${DELETE_WIDTH}px)` : 'translateX(0)' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => swiped && setSwiped(false)}
      >
        <span className="text-xs font-bold text-stone-400 w-5 text-center flex-shrink-0">{index + 1}</span>

        {isStrength && (
          <>
            <div className="flex items-center gap-1 flex-1">
              <button
                onClick={() => onChange(set.id, { weight_kg: Math.max(0, (set.weight_kg ?? 0) - 2.5) })}
                className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 active:bg-stone-100 flex-shrink-0"
              >
                <Minus size={12} />
              </button>
              <input
                type="number"
                inputMode="decimal"
                value={set.weight_kg || ''}
                placeholder={prevSet?.weight_kg?.toString() ?? '—'}
                onChange={e => onChange(set.id, { weight_kg: parseFloat(e.target.value) || 0 })}
                key={`w-${shakeKey}`}
                className={`w-14 text-center text-sm font-semibold bg-transparent border-b outline-none py-1 tabular-nums focus:border-slate-400 ${shakeFields.weight ? 'shake border-red-400' : 'border-stone-200'}`}
              />
              <button
                onClick={() => onChange(set.id, { weight_kg: (set.weight_kg ?? 0) + 2.5 })}
                className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 active:bg-stone-100 flex-shrink-0"
              >
                <Plus size={12} />
              </button>
              <span className="text-[10px] text-stone-400 font-medium ml-0.5">kg</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onChange(set.id, { reps: Math.max(0, (set.reps ?? 0) - 1) })}
                className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 active:bg-stone-100 flex-shrink-0"
              >
                <Minus size={12} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                value={set.reps || ''}
                placeholder={prevSet?.reps?.toString() ?? exercise.target_reps_min?.toString() ?? '—'}
                onChange={e => onChange(set.id, { reps: parseInt(e.target.value) || 0 })}
                key={`r-${shakeKey}`}
                className={`w-10 text-center text-sm font-semibold bg-transparent border-b outline-none py-1 tabular-nums focus:border-slate-400 ${shakeFields.reps ? 'shake border-red-400' : 'border-stone-200'}`}
              />
              <button
                onClick={() => onChange(set.id, { reps: (set.reps ?? 0) + 1 })}
                className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 active:bg-stone-100 flex-shrink-0"
              >
                <Plus size={12} />
              </button>
              <span className="text-[10px] text-stone-400 font-medium ml-0.5">tekrar</span>
            </div>
          </>
        )}

        {isBodyweight && (
          <div className="flex items-center gap-1 flex-1">
            <button
              onClick={() => onChange(set.id, { reps: Math.max(0, (set.reps ?? 0) - 1) })}
              className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 active:bg-stone-100 flex-shrink-0"
            >
              <Minus size={12} />
            </button>
            <input
              type="number"
              inputMode="numeric"
              value={set.reps || ''}
              placeholder={prevSet?.reps?.toString() ?? exercise.target_reps_min?.toString() ?? '—'}
              onChange={e => onChange(set.id, { reps: parseInt(e.target.value) || 0 })}
              key={`r-${shakeKey}`}
              className={`w-14 text-center text-sm font-semibold bg-transparent border-b outline-none py-1 tabular-nums focus:border-slate-400 ${shakeFields.reps ? 'shake border-red-400' : 'border-stone-200'}`}
            />
            <button
              onClick={() => onChange(set.id, { reps: (set.reps ?? 0) + 1 })}
              className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-400 active:bg-stone-100 flex-shrink-0"
            >
              <Plus size={12} />
            </button>
            <span className="text-[10px] text-stone-400 font-medium ml-0.5">tekrar</span>
          </div>
        )}

        {isCardio && (
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <div className="flex items-center gap-1">
              <input
                type="number" inputMode="decimal"
                value={set.duration_minutes || ''}
                placeholder={exercise.target_duration_minutes?.toString() ?? '—'}
                onChange={e => onChange(set.id, { duration_minutes: parseFloat(e.target.value) || 0 })}
                key={`d-${shakeKey}`}
                className={`w-14 text-center text-sm font-semibold bg-transparent border-b outline-none py-1 tabular-nums focus:border-slate-400 ${shakeFields.duration ? 'shake border-red-400' : 'border-stone-200'}`}
              />
              <span className="text-[10px] text-stone-400 font-medium">dk</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number" inputMode="decimal"
                value={set.distance_km || ''}
                placeholder="km"
                onChange={e => onChange(set.id, { distance_km: parseFloat(e.target.value) || 0 })}
                className="w-14 text-center text-sm font-semibold bg-transparent border-b border-stone-200 focus:border-slate-400 outline-none py-1 tabular-nums"
              />
              <span className="text-[10px] text-stone-400 font-medium">km</span>
            </div>
          </div>
        )}

        {isTimed && (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="number" inputMode="numeric"
              value={set.held_seconds || ''}
              placeholder={exercise.target_duration_seconds?.toString() ?? '—'}
              onChange={e => onChange(set.id, { held_seconds: parseInt(e.target.value) || 0 })}
              key={`h-${shakeKey}`}
              className={`w-16 text-center text-sm font-semibold bg-transparent border-b outline-none py-1 tabular-nums focus:border-slate-400 ${shakeFields.held ? 'shake border-red-400' : 'border-stone-200'}`}
            />
            <span className="text-[10px] text-stone-400 font-medium">saniye</span>
          </div>
        )}

        <button
          onClick={handleComplete}
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
            set.completed
              ? 'bg-emerald-500 text-white'
              : 'border border-stone-200 text-stone-300 active:bg-stone-100'
          }`}
        >
          <Check size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

// ─── EXERCISE CARD ────────────────────────────────────────────
interface ExerciseCardProps {
  exercise: Exercise
  sets: SessionSet[]
  allSets: SessionSet[]
  onAddSet: (exerciseId: string) => void
  onSetChange: (id: string, data: Partial<SessionSet>) => void
  onSetComplete: (id: string) => boolean
  onSetDelete: (id: string) => void
  newPRs: Set<string>
}

function ExerciseCard({
  exercise, sets, allSets, onAddSet, onSetChange, onSetComplete, onSetDelete, newPRs,
}: ExerciseCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const prevSets = allSets
    .filter(s => s.exercise_id === exercise.id && !sets.find(cs => cs.id === s.id))

  const completedCount = sets.filter(s => s.completed).length
  const isPR = newPRs.has(exercise.name)

  return (
    <div className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-stone-900">{exercise.name}</p>
              {isPR && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50">
                  <Trophy size={10} className="text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-600">PR</span>
                </div>
              )}
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              {exercise.muscle_group}
              {completedCount > 0 && ` · ${completedCount}/${sets.length} tamamlandı`}
            </p>
          </div>
        </div>
        {collapsed ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronUp size={16} className="text-stone-400" />}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-1 border-t border-stone-50">
          {/* Başlık satırı */}
          <div className="flex items-center gap-2 py-2 px-1 mb-1">
            <span className="w-5" />
            {(!exercise.type || exercise.type === 'strength') && (
              <>
                <span className="flex-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide text-center">Ağırlık</span>
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide text-center w-32">Tekrar</span>
              </>
            )}
            {exercise.type === 'bodyweight' && (
              <span className="flex-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Tekrar</span>
            )}
            {exercise.type === 'cardio' && (
              <span className="flex-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Süre / Mesafe</span>
            )}
            {exercise.type === 'timed' && (
              <span className="flex-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Süre (sn)</span>
            )}
            <span className="w-9" />
            <span className="w-7" />
          </div>

          {sets.map((set, i) => (
            <SetRow
              key={set.id}
              set={set}
              index={i}
              exercise={exercise}
              prevSet={prevSets[i]}
              onChange={onSetChange}
              onComplete={onSetComplete}
              onDelete={onSetDelete}
            />
          ))}

          <button
            onClick={() => onAddSet(exercise.id)}
            className="w-full mt-2 py-2.5 rounded-xl border border-dashed border-stone-200 text-xs font-semibold text-stone-400 flex items-center justify-center gap-1.5 active:bg-stone-50 transition-colors"
          >
            <Plus size={13} />
            Set Ekle
          </button>
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function WorkoutSession() {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const forcedDayId = (location.state as { dayId?: string })?.dayId

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [day, setDay] = useState<ProgramDay | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [sets, setSets] = useState<SessionSet[]>([])
  const [allHistorySets, setAllHistorySets] = useState<SessionSet[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [restTimer, setRestTimer] = useState<{ seconds: number } | null>(null)
  const [newPRs, setNewPRs] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [showFinish, setShowFinish] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showPause, setShowPause] = useState(false)
  const [deleteSetId, setDeleteSetId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerBaseRef = useRef<number>(0) // Date.now() - bu değer = elapsed ms
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // WakeLock
  useEffect(() => {
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(lock => {
        wakeLockRef.current = lock
      }).catch(() => {})
    }
    return () => { wakeLockRef.current?.release().catch(() => {}) }
  }, [])

  // İlk yükleme — tek RPC çağrısı
  useEffect(() => {
    async function load() {
      const todayStr = today()
      const weekday = new Date().getDay()
      const userId = await getUserId()

      // forcedDayId varsa RPC yerine doğrudan sorgular (farklı gün antrenmanı)
      if (forcedDayId) {
        const { data: dayData } = await supabase
          .from('program_days').select('*').eq('id', forcedDayId).maybeSingle()
        if (!dayData) { navigate('/workout'); return }
        setDay(dayData as ProgramDay)

        const { data: exData } = await supabase
          .from('exercises').select('*').eq('program_day_id', forcedDayId).order('order_index')
        const dayExercises = (exData ?? []) as Exercise[]
        setExercises(dayExercises)
        setAllHistorySets([])

        const newSession = await sessionDb.create({
          program_day_id: forcedDayId,
          date: todayStr,
          started_at: new Date().toISOString(),
        })
        setSession(newSession)
        setNotes('')

        const initialSets: SessionSet[] = []
        const inserts = dayExercises.flatMap(ex =>
          Array.from({ length: ex.target_sets ?? 3 }, (_, i) => ({
            session_id: newSession.id,
            exercise_id: ex.id,
            set_number: i + 1,
            completed: false,
          }))
        )
        if (inserts.length > 0) {
          const { data: created } = await supabase.from('session_sets').insert(inserts).select()
          initialSets.push(...((created ?? []) as SessionSet[]))
        }
        setSets(initialSets)
        setElapsed(0)
        timerBaseRef.current = Date.now()
        return
      }

      // Normal akış: RPC ile tek sorguda
      const { data: rpcRaw } = await supabase.rpc('get_workout_session', {
        p_user_id: userId,
        p_today: todayStr,
        p_weekday: weekday,
      })

      if (!rpcRaw) { navigate('/workout'); return }
      const rpc = typeof rpcRaw === 'string' ? JSON.parse(rpcRaw) : rpcRaw

      if (!(rpc as Record<string, unknown>).program) {
        navigate('/workout'); return
      }

      const r = rpc as Record<string, unknown>
      const targetDay = r.day as ProgramDay | null
      if (!targetDay) { navigate('/workout'); return }
      setDay(targetDay)

      const dayExercises = (r.exercises as Exercise[]) ?? []
      setExercises(dayExercises)
      setAllHistorySets([])

      const existingSession = r.session as WorkoutSession | null
      const isResuming = !!existingSession  // true = yarım bırakılmış, false = yeni

      let activeSession: WorkoutSession
      if (existingSession) {
        activeSession = existingSession
      } else {
        activeSession = await sessionDb.create({
          program_day_id: targetDay.id,
          date: todayStr,
          started_at: new Date().toISOString(),
        })
      }
      setSession(activeSession)
      setNotes(activeSession.notes ?? '')

      // Devam senaryosunda RPC setleri döndürür, yeni session'da boş gelir
      const existingSets = Array.isArray(r.sets) ? (r.sets as SessionSet[]) : []
      if (isResuming && existingSets.length > 0) {
        setSets(existingSets)
      } else if (!isResuming) {
        // Yeni session — setleri oluştur
        const inserts = dayExercises.flatMap(ex =>
          Array.from({ length: ex.target_sets ?? 3 }, (_, i) => ({
            session_id: activeSession.id,
            exercise_id: ex.id,
            set_number: i + 1,
            completed: false,
          }))
        )
        if (inserts.length > 0) {
          const { data: created } = await supabase.from('session_sets').insert(inserts).select()
          setSets((created ?? []) as SessionSet[])
        }
      } else {
        // Devam ama setler boş geldi — Supabase'den direkt çek
        const { data: fetchedSets } = await supabase
          .from('session_sets').select('*')
          .eq('session_id', activeSession.id)
          .order('set_number')
        setSets((fetchedSets ?? []) as SessionSet[])
      }

      // Sadece devam senaryosunda geçen süreyi yükle, yeni session 0'dan başlar
      if (isResuming && !activeSession.ended_at) {
        // paused_elapsed_seconds varsa oradan başla (duraklat → devam)
        const { data: fresh } = await supabase
          .from('workout_sessions')
          .select('paused_elapsed_seconds')
          .eq('id', activeSession.id)
          .single()
        const pausedSecs = (fresh as { paused_elapsed_seconds: number | null } | null)?.paused_elapsed_seconds
        if (pausedSecs != null) {
          // Duraklatılmış session — kayıtlı süreden başla
          setElapsed(pausedSecs)
          // started_at'ı kaydır + paused_elapsed_seconds'ı temizle
          const adjustedStart = new Date(Date.now() - pausedSecs * 1000).toISOString()
          await supabase.from('workout_sessions').update({
            paused_elapsed_seconds: null,
            started_at: adjustedStart,
          }).eq('id', activeSession.id)
          timerBaseRef.current = Date.now() - pausedSecs * 1000
        } else {
          // Duraklatılmamış ama devam — started_at'tan hesapla
          const { data: freshSession } = await supabase
            .from('workout_sessions').select('started_at').eq('id', activeSession.id).single()
          const startedAt = (freshSession as { started_at: string } | null)?.started_at ?? activeSession.started_at
          const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
          setElapsed(secs)
          timerBaseRef.current = Date.now() - secs * 1000
        }
      } else {
        setElapsed(0)
        timerBaseRef.current = Date.now()
      }
    }
    load()
  }, [])

  // Timer: her tick'te Date.now() - base hesaplar
  // Ekran kapanıp açılsa bile doğru süreyi gösterir
  useEffect(() => {
    if (!session || session.ended_at) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }
    if (timerRef.current) return // zaten çalışıyor
    // elapsed state'i set edildiğinde base'i senkronize et
    timerBaseRef.current = Date.now() - elapsed * 1000
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerBaseRef.current) / 1000))
    }, 1000)
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  }, [!!session, session?.ended_at])

  const handleSetChange = useCallback((id: string, data: Partial<SessionSet>) => {
    setSets(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
    setDb.update(id, data)
  }, [])

  const handleSetComplete = useCallback((id: string): boolean => {
    let valid = true
    setSets(prev => {
      const set = prev.find(s => s.id === id)
      if (set && !set.completed) {
        const exercise = exercises.find(e => e.id === set.exercise_id)
        const type = exercise?.type ?? 'strength'
        if (type === 'strength' && (!(set.weight_kg) || !(set.reps))) { valid = false; return prev }
        if (type === 'bodyweight' && !(set.reps)) { valid = false; return prev }
        if (type === 'timed' && !(set.held_seconds)) { valid = false; return prev }
        if (type === 'cardio' && !(set.duration_minutes) && !(set.distance_km)) { valid = false; return prev }
      }

      const updated = prev.map(s => {
        if (s.id !== id) return s
        const newCompleted = !s.completed
        setDb.update(id, { completed: newCompleted })
        return { ...s, completed: newCompleted }
      })

      const completedSet = updated.find(s => s.id === id)
      if (completedSet?.completed) {
        const exercise = exercises.find(e => e.id === completedSet.exercise_id)
        if (exercise) {
          const exSets = updated.filter(s => s.exercise_id === exercise.id && s.completed)
          const maxWeight = Math.max(...exSets.map(s => s.weight_kg ?? 0))
          const totalVol = exSets.reduce((a, s) => a + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
          prDb.upsert(exercise.name, maxWeight, totalVol, exercise.type).then(isNewPR => {
            if (isNewPR) setNewPRs(prs => new Set([...prs, exercise.name]))
          })

          const restSecs = exercise.rest_seconds
          if (restSecs && restSecs > 0) { primeAudio(); setRestTimer({ seconds: restSecs }) }
        }
      }

      return updated
    })
    return valid
  }, [exercises])

  const handleAddSet = useCallback(async (exerciseId: string) => {
    if (!session) return
    const existingSets = sets.filter(s => s.exercise_id === exerciseId)
    const newSet = await setDb.create({
      session_id: session.id,
      exercise_id: exerciseId,
      set_number: existingSets.length + 1,
      completed: false,
    })
    setSets(prev => [...prev, newSet])
  }, [session, sets])

  const handleSetDelete = useCallback((id: string) => {
    setDeleteSetId(id)
  }, [])

  const confirmSetDelete = useCallback((id: string) => {
    setDb.delete(id)
    setSets(prev => prev.filter(s => s.id !== id))
    setDeleteSetId(null)
  }, [])

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  async function cancelSession() {
    if (!session) return
    stopTimer()
    setElapsed(0)
    wakeLockRef.current?.release().catch(() => {})
    // Aynı program_day_id + ended_at IS NULL olan TÜM açık session'ları sil
    // (birden fazla açık session kalabilir — hepsini temizle)
    const { data: openSessions } = await supabase
      .from('workout_sessions')
      .select('id')
      .eq('program_day_id', session.program_day_id)
      .is('ended_at', null)
    if (openSessions && openSessions.length > 0) {
      const ids = openSessions.map(s => s.id)
      await supabase.from('session_sets').delete().in('session_id', ids)
      await supabase.from('workout_sessions').delete().in('id', ids)
    }
    qc.removeQueries({ queryKey: QK.workoutHistory })
    qc.removeQueries({ queryKey: ['workout-page'] })
    qc.removeQueries({ queryKey: QK.dashboard })
    navigate('/workout', { replace: true })
  }

  async function pauseSession() {
    if (!session) return
    stopTimer()
    wakeLockRef.current?.release().catch(() => {})
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
    await supabase.from('workout_sessions').update({
      paused_elapsed_seconds: elapsed,
      notes: notes || undefined,
    }).eq('id', session.id)
    qc.removeQueries({ queryKey: QK.workoutHistory })
    qc.removeQueries({ queryKey: ['workout-page'] })
    navigate('/workout', { replace: true })
  }

  async function finishSession() {
    if (!session) return
    stopTimer()
    const endedAt = new Date().toISOString()
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
    await sessionDb.update(session.id, { ended_at: endedAt, notes: notes || undefined })
    // ended_at set edince timer useEffect zaten duracak, elapsed sabit kalır
    setSession(s => s ? { ...s, ended_at: endedAt } : s)
    wakeLockRef.current?.release().catch(() => {})
    qc.invalidateQueries({ queryKey: QK.workoutHistory })
    qc.invalidateQueries({ queryKey: QK.dashboard })
    qc.invalidateQueries({ queryKey: ['workout-page'] })
    navigate('/workout/history', { replace: true })
  }

  if (!session || !day) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f3ef' }}>
        <div className="w-5 h-5 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(0,0,0,0.07)', borderTopColor: 'rgba(26,23,20,0.28)' }} />
      </div>
    )
  }

  const completedSets = sets.filter(s => s.completed).length
  const totalSets = sets.length
  const volume = calcVolume(sets)
  const isFinished = !!session.ended_at
  const progress = totalSets > 0 ? completedSets / totalSets : 0

  // Renkler — session sayfası krem tema
  const SC = {
    bg:       '#f5f3ef',
    surface:  '#ffffff',
    surfaceH: '#f0ede8',
    border:   'rgba(0,0,0,0.07)',
    borderS:  'rgba(0,0,0,0.04)',
    text:     '#1a1714',
    textMid:  'rgba(26,23,20,0.45)',
    textLow:  'rgba(26,23,20,0.28)',
    success:  '#166534',
    successBg:'rgba(22,101,52,0.07)',
    danger:   '#b91c1c',
    dangerBg: 'rgba(185,28,28,0.07)',
  }

  return (
    <div className="min-h-screen" style={{ background: SC.bg, color: SC.text }}>
      {restTimer && (
        <RestTimer
          seconds={restTimer.seconds}
          onDone={() => setRestTimer(null)}
          onSkip={() => setRestTimer(null)}
        />
      )}

      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-sm px-5 pt-12 pb-3"
        style={{ background: 'rgba(245,243,239,0.95)', borderBottom: `1px solid ${SC.borderS}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: SC.textLow }}>
              {isFinished ? 'Tamamlandı' : 'Devam Ediyor'}
            </p>
            <h1 className="text-[22px] font-extrabold tracking-tight leading-tight truncate" style={{ color: SC.text }}>
              {day.day_name}
            </h1>
          </div>
          {!isFinished && (
            <button
              onClick={() => setShowCancel(true)}
              className="ml-3 w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 active:scale-95 transition-transform"
              style={{ background: SC.surface, border: `1px solid ${SC.border}`, color: SC.textMid }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* İlerleme çubuğu + stats */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center gap-1.5">
            <Clock size={12} style={{ color: SC.textLow }} />
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: SC.text }}>
              {formatElapsed(elapsed)}
            </span>
          </div>
          <div className="w-px h-3.5" style={{ background: SC.borderS }} />
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: SC.text }}>
            {completedSets}/{totalSets} set
          </span>
          {volume > 0 && (
            <>
              <div className="w-px h-3.5" style={{ background: SC.borderS }} />
              <span className="text-[13px] font-semibold tabular-nums" style={{ color: SC.text }}>
                {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}
              </span>
            </>
          )}
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: SC.borderS }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress * 100}%`, background: SC.success }} />
        </div>
      </div>

      <div className="px-4 pt-4 pb-10 space-y-3">
        {(['warmup', 'main', 'cooldown'] as const).map(phase => {
          const phaseExs = exercises.filter(ex => (ex.phase ?? 'main') === phase)
          if (phaseExs.length === 0) return null
          const labels = { warmup: '🔥 Isınma', main: '💪 Antrenman', cooldown: '🧘 Soğuma' }
          return (
            <div key={phase} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1" style={{ background: 'rgba(26,23,20,0.10)' }} />
                <span className="text-[12px] font-extrabold uppercase tracking-widest px-3 py-1"
                  style={{
                    color: phase === 'warmup' ? '#ea580c' : phase === 'cooldown' ? '#4f46e5' : 'rgba(26,23,20,0.50)',
                  }}>
                  {labels[phase]}
                </span>
                <div className="h-px flex-1" style={{ background: 'rgba(26,23,20,0.10)' }} />
              </div>
              {phaseExs.map(exercise => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  sets={sets.filter(s => s.exercise_id === exercise.id)}
                  allSets={allHistorySets}
                  onAddSet={handleAddSet}
                  onSetChange={handleSetChange}
                  onSetComplete={handleSetComplete}
                  onSetDelete={handleSetDelete}
                  newPRs={newPRs}
                />
              ))}
            </div>
          )
        })}

        {/* Notlar */}
        <div className="rounded-2xl p-5" style={{ background: SC.surface, border: `1px solid ${SC.border}` }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: SC.textLow }}>
            Notlar
          </p>
          <textarea
            value={notes}
            onChange={e => {
              const val = e.target.value
              setNotes(val)
              if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
              if (session) {
                notesDebounceRef.current = setTimeout(() => {
                  sessionDb.update(session.id, { notes: val || undefined })
                }, 800)
              }
            }}
            placeholder="Bugünkü antrenman nasıldı? PR kırdın mı?"
            rows={3}
            className="w-full text-[14px] bg-transparent outline-none resize-none"
            style={{ color: SC.text }}
          />
        </div>

        {/* Butonlar */}
        {!isFinished ? (
          <div className="flex gap-3">
            <button
              onClick={() => setShowPause(true)}
              className="flex-1 py-4 rounded-2xl text-[14px] font-semibold active:scale-[0.97] transition-transform"
              style={{ background: SC.surface, border: `1px solid ${SC.border}`, color: SC.textMid }}
            >
              Duraklat
            </button>
            <button
              onClick={() => setShowFinish(true)}
              className="flex-[2] py-4 rounded-2xl text-[15px] font-bold active:scale-[0.97] transition-transform"
              style={{ background: SC.text, color: SC.bg }}
            >
              Antrenmanı Bitir
            </button>
          </div>
        ) : (
          <div className="rounded-2xl p-5 text-center"
            style={{ background: 'rgba(22,101,52,0.07)', border: '1px solid rgba(22,101,52,0.18)' }}>
            <p className="text-[15px] font-bold mb-1" style={{ color: SC.success }}>Tamamlandı!</p>
            <p className="text-[13px]" style={{ color: SC.success }}>
              {session.ended_at
                ? (() => {
                    const mins = Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
                    return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)} sa ${mins % 60} dk`
                  })()
                : formatElapsed(elapsed)
              } · {completedSets} set
              {volume > 0 && ` · ${volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`} hacim`}
            </p>
          </div>
        )}
      </div>

      {/* İptal modalı */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: SC.surface, border: `1px solid ${SC.border}` }}
            onClick={e => e.stopPropagation()}>
            <p className="text-[17px] font-extrabold mb-1" style={{ color: SC.text }}>Antrenmanı İptal Et?</p>
            <p className="text-[13px] mb-5 leading-relaxed" style={{ color: SC.textMid }}>
              Tüm setler ve bu seans silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancel(false)}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-semibold active:scale-95 transition-transform"
                style={{ background: SC.surfaceH, border: `1px solid ${SC.border}`, color: SC.textMid }}>
                Vazgeç
              </button>
              <button onClick={cancelSession}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-bold active:scale-95 transition-transform"
                style={{ background: SC.dangerBg, border: '1px solid rgba(185,28,28,0.2)', color: SC.danger }}>
                İptal Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duraklat modalı */}
      {showPause && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={() => setShowPause(false)}>
          <div className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: SC.surface, border: `1px solid ${SC.border}` }}
            onClick={e => e.stopPropagation()}>
            <p className="text-[17px] font-extrabold mb-1" style={{ color: SC.text }}>Antrenmanı Duraklat?</p>
            <p className="text-[13px] mb-5 leading-relaxed" style={{ color: SC.textMid }}>
              Mevcut setler kaydedilir. Daha sonra kaldığın yerden devam edebilirsin.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowPause(false)}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-semibold active:scale-95 transition-transform"
                style={{ background: SC.surfaceH, border: `1px solid ${SC.border}`, color: SC.textMid }}>
                Geri Dön
              </button>
              <button onClick={pauseSession}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-bold active:scale-95 transition-transform"
                style={{ background: SC.text, color: SC.bg }}>
                Duraklat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set silme modalı */}
      {deleteSetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={() => setDeleteSetId(null)}>
          <div className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: SC.surface, border: `1px solid ${SC.border}` }}
            onClick={e => e.stopPropagation()}>
            <p className="text-[17px] font-extrabold mb-1" style={{ color: SC.text }}>Seti Sil?</p>
            <p className="text-[13px] mb-5" style={{ color: SC.textMid }}>Bu set kalıcı olarak silinecek.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteSetId(null)}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-semibold active:scale-95 transition-transform"
                style={{ background: SC.surfaceH, border: `1px solid ${SC.border}`, color: SC.textMid }}>
                İptal
              </button>
              <button onClick={() => confirmSetDelete(deleteSetId)}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-bold active:scale-95 transition-transform"
                style={{ background: SC.dangerBg, border: '1px solid rgba(185,28,28,0.2)', color: SC.danger }}>
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bitirme modalı */}
      {showFinish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={() => setShowFinish(false)}>
          <div className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: SC.surface, border: `1px solid ${SC.border}` }}
            onClick={e => e.stopPropagation()}>
            <p className="text-[17px] font-extrabold mb-1" style={{ color: SC.text }}>Antrenmanı Bitir</p>
            <p className="text-[13px] mb-1" style={{ color: SC.textMid }}>
              {completedSets}/{totalSets} set tamamlandı
            </p>
            {completedSets < totalSets && (
              <p className="text-[13px] mb-5 leading-relaxed" style={{ color: SC.textMid }}>
                Tamamlanmamış setler kaydedilmeyecek.
              </p>
            )}
            {completedSets >= totalSets && (
              <p className="text-[13px] mb-5 leading-relaxed" style={{ color: SC.success }}>
                Tüm setler tamamlandı!
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowFinish(false)}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-semibold active:scale-95 transition-transform"
                style={{ background: SC.surfaceH, border: `1px solid ${SC.border}`, color: SC.textMid }}>
                Devam Et
              </button>
              <button onClick={finishSession}
                className="flex-[2] py-3.5 rounded-2xl text-[13px] font-bold active:scale-95 transition-transform"
                style={{ background: SC.text, color: SC.bg }}>
                Bitir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

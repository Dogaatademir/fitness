import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check, X, Plus, ChevronDown, ChevronUp,
  Clock, Trophy, Minus, Square,
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
function RestTimer({ seconds, onDone, onSkip }: {
  seconds: number
  onDone: () => void
  onSkip: () => void
}) {
  const [remaining, setRemaining] = useState(seconds)
  const [extra, setExtra] = useState(0)

  useEffect(() => {
    if (remaining <= 0) { onDone(); return }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onDone])

  const total = seconds + extra
  const pct = Math.max(0, remaining / total)

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
          onClick={() => setExtra(e => { setRemaining(r => r + 30); return e + 30 })}
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
          onClick={() => setExtra(e => { setRemaining(r => Math.max(0, r - 30)); return e })}
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
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}

function SetRow({ set, index, exercise, prevSet, onChange, onComplete, onDelete }: SetRowProps) {
  const isStrength = !exercise.type || exercise.type === 'strength'
  const isCardio = exercise.type === 'cardio'
  const isTimed = exercise.type === 'timed'

  return (
    <div className={`flex items-center gap-2 py-2 px-1 rounded-xl transition-colors ${
      set.completed ? 'bg-emerald-50' : ''
    }`}>
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
              value={set.weight_kg ?? ''}
              placeholder={prevSet?.weight_kg?.toString() ?? '—'}
              onChange={e => onChange(set.id, { weight_kg: parseFloat(e.target.value) || 0 })}
              className="w-14 text-center text-sm font-semibold bg-transparent border-b border-stone-200 focus:border-slate-400 outline-none py-1 tabular-nums"
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
              value={set.reps ?? ''}
              placeholder={prevSet?.reps?.toString() ?? exercise.target_reps_min?.toString() ?? '—'}
              onChange={e => onChange(set.id, { reps: parseInt(e.target.value) || 0 })}
              className="w-10 text-center text-sm font-semibold bg-transparent border-b border-stone-200 focus:border-slate-400 outline-none py-1 tabular-nums"
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

      {isCardio && (
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="flex items-center gap-1">
            <input
              type="number" inputMode="decimal"
              value={set.duration_minutes ?? ''}
              placeholder={exercise.target_duration_minutes?.toString() ?? '—'}
              onChange={e => onChange(set.id, { duration_minutes: parseFloat(e.target.value) || 0 })}
              className="w-14 text-center text-sm font-semibold bg-transparent border-b border-stone-200 focus:border-slate-400 outline-none py-1 tabular-nums"
            />
            <span className="text-[10px] text-stone-400 font-medium">dk</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number" inputMode="decimal"
              value={set.distance_km ?? ''}
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
            value={set.held_seconds ?? ''}
            placeholder={exercise.target_duration_seconds?.toString() ?? '—'}
            onChange={e => onChange(set.id, { held_seconds: parseInt(e.target.value) || 0 })}
            className="w-16 text-center text-sm font-semibold bg-transparent border-b border-stone-200 focus:border-slate-400 outline-none py-1 tabular-nums"
          />
          <span className="text-[10px] text-stone-400 font-medium">saniye</span>
        </div>
      )}

      <button
        onClick={() => onComplete(set.id)}
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
          set.completed
            ? 'bg-emerald-500 text-white'
            : 'border border-stone-200 text-stone-300 active:bg-stone-100'
        }`}
      >
        <Check size={16} strokeWidth={2.5} />
      </button>

      <button
        onClick={() => onDelete(set.id)}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-200 active:text-stone-400 flex-shrink-0"
      >
        <X size={12} />
      </button>
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
  onSetComplete: (id: string) => void
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

  const handleSetComplete = useCallback((id: string) => {
    setSets(prev => {
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
          if (restSecs && restSecs > 0) setRestTimer({ seconds: restSecs })
        }
      }

      return updated
    })
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
      <div className="min-h-screen bg-[#f7f5f2] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-400 rounded-full animate-spin" />
      </div>
    )
  }

  const completedSets = sets.filter(s => s.completed).length
  const totalSets = sets.length
  const volume = calcVolume(sets)
  const isFinished = !!session.ended_at

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      {restTimer && (
        <RestTimer
          seconds={restTimer.seconds}
          onDone={() => setRestTimer(null)}
          onSkip={() => setRestTimer(null)}
        />
      )}

      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#f7f5f2]/95 backdrop-blur-sm border-b border-stone-100 px-5 pt-14 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-stone-400 font-medium uppercase tracking-wide mb-0.5">
              {isFinished ? 'Tamamlandı' : 'Devam Ediyor'}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{day.day_name}</h1>
          </div>
          {!isFinished && (
            <button
              onClick={() => setShowCancel(true)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-stone-100 shadow-sm text-stone-400"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Stats şeridi */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-stone-400" />
            <span className="text-sm font-semibold tabular-nums text-stone-700">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <div className="w-px h-4 bg-stone-200" />
          <div className="flex items-center gap-1.5">
            <Check size={13} className="text-stone-400" />
            <span className="text-sm font-semibold text-stone-700">
              {completedSets}/{totalSets} set
            </span>
          </div>
          {volume > 0 && (
            <>
              <div className="w-px h-4 bg-stone-200" />
              <span className="text-sm font-semibold text-stone-700">
                {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`} hacim
              </span>
            </>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 pb-10 space-y-3">
        {exercises.map(exercise => (
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

        {/* Notlar */}
        <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Notlar</p>
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
            className="w-full text-sm text-stone-700 bg-transparent outline-none resize-none placeholder:text-stone-300"
          />
        </div>

        {/* Butonlar */}
        {!isFinished ? (
          <div className="flex gap-3">
            <button
              onClick={() => setShowPause(true)}
              className="flex-1 py-4 rounded-2xl border-2 border-stone-200 text-stone-600 font-bold text-sm active:bg-stone-50 transition-colors"
            >
              Duraklat
            </button>
            <button
              onClick={() => setShowFinish(true)}
              className="flex-[2] py-4 rounded-2xl bg-slate-800 text-white font-bold text-base active:bg-slate-700 transition-colors shadow-md"
            >
              Antrenmanı Bitir
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5 text-center">
            <p className="text-emerald-700 font-bold text-base mb-1">Tamamlandı!</p>
            <p className="text-emerald-600 text-sm">
              {session.ended_at
                ? (() => {
                    const mins = Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
                    return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)} sa ${mins % 60} dk`
                  })()
                : formatElapsed(elapsed)
              } · {completedSets} set · {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`} hacim
            </p>
          </div>
        )}
      </div>

      {/* İptal onay modalı */}
      {showCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6">
            <p className="font-bold text-stone-900 mb-2">Antrenmanı İptal Et?</p>
            <p className="text-sm text-stone-500 mb-5 leading-relaxed">
              Tüm setler ve bu seans silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancel(false)}
                className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm active:bg-stone-50"
              >
                Devam Et
              </button>
              <button
                onClick={cancelSession}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-sm active:bg-red-600"
              >
                İptal Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duraklat onay modalı */}
      {showPause && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6">
            <p className="font-bold text-stone-900 mb-2">Antrenmanı Duraklat?</p>
            <p className="text-sm text-stone-500 mb-5 leading-relaxed">
              Mevcut setler kaydedilir. Daha sonra devam edebilirsin.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPause(false)}
                className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm active:bg-stone-50"
              >
                Geri Dön
              </button>
              <button
                onClick={pauseSession}
                className="flex-1 py-3 rounded-xl bg-slate-700 text-white font-semibold text-sm active:bg-slate-600"
              >
                Duraklat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set silme onay modalı */}
      {deleteSetId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6">
            <p className="font-bold text-stone-900 mb-2">Seti sil?</p>
            <p className="text-sm text-stone-500 mb-5">Bu set kalıcı olarak silinecek.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteSetId(null)}
                className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm active:bg-stone-50"
              >
                İptal
              </button>
              <button
                onClick={() => confirmSetDelete(deleteSetId)}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-sm active:bg-red-600"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bitirme onay modalı */}
      {showFinish && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Square size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-stone-900">Antrenmanı Bitir</p>
                <p className="text-xs text-stone-400">
                  {completedSets}/{totalSets} set tamamlandı
                </p>
              </div>
            </div>
            <p className="text-sm text-stone-500 mb-5 leading-relaxed">
              Tamamlanmamış setler kaydedilmeyecek. Devam etmek istiyor musun?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinish(false)}
                className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm active:bg-stone-50"
              >
                Devam Et
              </button>
              <button
                onClick={finishSession}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm active:bg-emerald-700"
              >
                Bitir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

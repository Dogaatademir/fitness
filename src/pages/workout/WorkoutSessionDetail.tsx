import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Clock, Dumbbell, Trophy } from 'lucide-react'
import { supabase, getUserId } from '../../lib/supabase'
import type { Exercise, SessionSet } from '../../types'

function formatDuration(startedAt: string, endedAt?: string): string {
  const mins = Math.round(
    (new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime()) / 60000
  )
  return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)} sa ${mins % 60} dk`
}

function formatSetDetail(set: SessionSet, exercise: Exercise): string {
  if (exercise.type === 'cardio') {
    const parts: string[] = []
    if (set.duration_minutes) parts.push(`${set.duration_minutes} dk`)
    if (set.distance_km) parts.push(`${set.distance_km} km`)
    return parts.join(' · ')
  }
  if (exercise.type === 'timed') return set.held_seconds ? `${set.held_seconds} sn` : '—'
  if (set.weight_kg && set.reps) return `${set.weight_kg} kg × ${set.reps}`
  if (set.reps) return `${set.reps} tekrar`
  return '—'
}

interface Session {
  id: string; date: string; started_at: string; ended_at?: string
  program_day_id: string; notes?: string
}

interface PR { max_weight_kg: number; max_volume: number; achieved_at: string }

interface ExGroup {
  exercise: Exercise
  sets: SessionSet[]
  pr: PR | null
}

interface PageData {
  session: Session
  day_name: string
  groups: ExGroup[]
}

export default function WorkoutSessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [page, setPage] = useState<PageData | null>(null)

  useEffect(() => {
    if (!sessionId) return
    async function load() {
      const userId = await getUserId()
      const { data } = await supabase.rpc('get_session_detail', {
        p_user_id: userId,
        p_session_id: sessionId,
      })
      if (!data) { navigate('/workout/history'); return }
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      setPage(parsed as PageData)
    }
    load()
  }, [sessionId])

  if (!page) return (
    <div className="min-h-screen bg-[#f7f5f2] flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-400 rounded-full animate-spin" />
    </div>
  )

  const { session, day_name, groups } = page
  const completedSets = groups.flatMap(g => g.sets).filter(s => s.completed)
  const totalVolume = completedSets.reduce((a, s) => a + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
  const dateLabel = new Date(session.date + 'T12:00:00').toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6">
        <button onClick={() => navigate(-1)}
          className="text-xs text-stone-400 font-semibold mb-3 flex items-center gap-1 active:text-stone-600">
          ← Geri
        </button>
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wide mb-0.5 capitalize">{dateLabel}</p>
        <h1 className="text-[28px] font-bold tracking-tight">{day_name}</h1>
      </div>

      <div className="px-4 pb-10 space-y-4">
        {/* Özet */}
        <div className="rounded-2xl bg-slate-800 p-5 shadow-md">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Clock size={12} className="text-slate-400" />
                <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Süre</span>
              </div>
              <p className="text-xl font-bold text-white">
                {session.ended_at ? formatDuration(session.started_at, session.ended_at) : '—'}
              </p>
            </div>
            <div className="text-center border-x border-slate-700">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Dumbbell size={12} className="text-slate-400" />
                <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Set</span>
              </div>
              <p className="text-xl font-bold text-white">{completedSets.length}</p>
            </div>
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold block mb-1">Hacim</span>
              <p className="text-xl font-bold text-white">
                {totalVolume > 0
                  ? totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${Math.round(totalVolume)}kg`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {session.notes && (
          <div className="rounded-2xl bg-amber-50 border border-amber-100 px-5 py-4">
            <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold mb-1">Not</p>
            <p className="text-sm text-amber-900 leading-relaxed">{session.notes}</p>
          </div>
        )}

        {groups.map(({ exercise, sets, pr }) => {
          const completed = sets.filter(s => s.completed)
          const sessionMaxWeight = completed.length > 0 ? Math.max(...completed.map(s => s.weight_kg ?? 0)) : 0
          const isPR = pr && sessionMaxWeight > 0 && sessionMaxWeight > pr.max_weight_kg

          return (
            <div key={exercise.id} className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
              <button
                onClick={() => navigate(`/workout/exercise/${exercise.id}`)}
                className="w-full flex items-center justify-between px-5 py-4 text-left active:bg-stone-50 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-stone-900">{exercise.name}</p>
                    {isPR && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50">
                        <Trophy size={10} className="text-amber-500" />
                        <span className="text-[10px] font-bold text-amber-600">PR</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {exercise.muscle_group} · {completed.length}/{sets.length} set
                  </p>
                </div>
                <ChevronRight size={14} className="text-stone-300" />
              </button>

              {completed.length > 0 && (
                <div className="border-t border-stone-50 px-5 pb-4 pt-3 space-y-2">
                  {sets.map((set, i) => (
                    <div key={set.id} className={`flex items-center justify-between text-sm ${set.completed ? '' : 'opacity-30'}`}>
                      <span className="text-stone-400 font-medium w-8">Set {i + 1}</span>
                      <span className="font-semibold text-stone-800">{formatSetDetail(set, exercise)}</span>
                      <span className="text-xs text-stone-400 tabular-nums">
                        {(!exercise.type || exercise.type === 'strength') && set.weight_kg && set.reps
                          ? `${Math.round(set.weight_kg * set.reps)} kg`
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

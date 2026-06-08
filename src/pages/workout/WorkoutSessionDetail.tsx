import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Trophy, Clock, Dumbbell, BarChart2 } from 'lucide-react'
import { supabase, getUserId } from '../../lib/supabase'
import type { Exercise, SessionSet } from '../../types'

const C = {
  bg:           '#f5f3ef',
  surface:      '#ffffff',
  surfaceHigh:  '#f0ede8',
  border:       'rgba(0,0,0,0.07)',
  borderSub:    'rgba(0,0,0,0.04)',
  text:         '#1a1714',
  textMid:      'rgba(26,23,20,0.45)',
  textLow:      'rgba(26,23,20,0.28)',
  successText:  '#166534',
  successBg:    'rgba(22,101,52,0.07)',
  successBorder:'rgba(22,101,52,0.18)',
  ongoingText:  '#b45309',
  ongoingBg:    'rgba(180,83,9,0.08)',
  startText:    '#1d4ed8',
  startBg:      'rgba(29,78,216,0.07)',
}

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
interface ExGroup { exercise: Exercise; sets: SessionSet[]; pr: PR | null }
interface PageData { session: Session; day_name: string; groups: ExGroup[] }

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
    <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
      <div className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{ borderColor: C.borderSub, borderTopColor: C.textLow }} />
    </div>
  )

  const { session, day_name, groups } = page
  const completedSets = groups.flatMap(g => g.sets).filter(s => s.completed)
  const totalVolume = completedSets.reduce((a, s) => a + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
  const dateLabel = new Date(session.date + 'T12:00:00').toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const done = !!session.ended_at

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div className="px-5 pt-14 pb-5">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-[12px] font-semibold mb-4 active:opacity-60 transition-opacity"
          style={{ color: C.textLow }}>
          ← Geri
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1 capitalize"
          style={{ color: C.textLow }}>
          {dateLabel}
        </p>
        <h1 className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: C.text }}>
          {day_name}
        </h1>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {/* Özet kartı */}
        <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="grid grid-cols-3 gap-0">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1.5">
                <Clock size={11} style={{ color: C.textLow }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.textLow }}>
                  Süre
                </span>
              </div>
              <p className="text-[20px] font-extrabold tabular-nums" style={{ color: C.text }}>
                {done ? formatDuration(session.started_at, session.ended_at) : '—'}
              </p>
            </div>
            <div className="text-center" style={{ borderLeft: `1px solid ${C.borderSub}`, borderRight: `1px solid ${C.borderSub}` }}>
              <div className="flex items-center justify-center gap-1 mb-1.5">
                <Dumbbell size={11} style={{ color: C.textLow }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.textLow }}>
                  Set
                </span>
              </div>
              <p className="text-[20px] font-extrabold tabular-nums" style={{ color: C.text }}>
                {completedSets.length}
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1.5">
                <BarChart2 size={11} style={{ color: C.textLow }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.textLow }}>
                  Hacim
                </span>
              </div>
              <p className="text-[20px] font-extrabold tabular-nums" style={{ color: C.text }}>
                {totalVolume > 0
                  ? totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${Math.round(totalVolume)}kg`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Not */}
        {session.notes && (
          <div className="rounded-2xl px-5 py-4"
            style={{ background: C.ongoingBg, border: `1px solid rgba(180,83,9,0.15)` }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: C.ongoingText }}>Not</p>
            <p className="text-[13px] leading-relaxed" style={{ color: C.text }}>{session.notes}</p>
          </div>
        )}

        {/* Egzersiz grupları */}
        {groups.map(({ exercise, sets, pr }) => {
          const completed = sets.filter(s => s.completed)
          const sessionMaxWeight = completed.length > 0 ? Math.max(...completed.map(s => s.weight_kg ?? 0)) : 0
          const isPR = pr && sessionMaxWeight > 0 && sessionMaxWeight >= pr.max_weight_kg

          return (
            <div key={exercise.id} className="rounded-2xl overflow-hidden"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <button
                onClick={() => navigate(`/workout/exercise/${exercise.id}`)}
                className="w-full flex items-center justify-between px-5 py-4 text-left active:bg-black/[0.02] transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold" style={{ color: C.text }}>{exercise.name}</p>
                    {isPR && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(180,83,9,0.08)' }}>
                        <Trophy size={10} style={{ color: C.ongoingText }} />
                        <span className="text-[10px] font-bold" style={{ color: C.ongoingText }}>PR</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[12px] mt-0.5" style={{ color: C.textMid }}>
                    {exercise.muscle_group} · {completed.length}/{sets.length} set
                  </p>
                </div>
                <ChevronRight size={14} style={{ color: C.textLow }} />
              </button>

              {completed.length > 0 && (
                <div className="px-5 pb-4 pt-1 space-y-2" style={{ borderTop: `1px solid ${C.borderSub}` }}>
                  {sets.map((set, i) => (
                    <div key={set.id}
                      className="flex items-center justify-between"
                      style={{ opacity: set.completed ? 1 : 0.3 }}>
                      <span className="text-[12px] font-medium w-10" style={{ color: C.textLow }}>
                        Set {i + 1}
                      </span>
                      <span className="text-[13px] font-semibold" style={{ color: C.text }}>
                        {formatSetDetail(set, exercise)}
                      </span>
                      <span className="text-[12px] tabular-nums" style={{ color: C.textMid }}>
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

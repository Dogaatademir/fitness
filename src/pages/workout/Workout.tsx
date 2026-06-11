import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { History, ChevronRight, Dumbbell, BarChart2, Play, Check } from 'lucide-react'
import PageSpinner from '../../components/PageSpinner'
import { supabase, getUserId } from '../../lib/supabase'
import { today } from '../../lib/storage'
import type { Program, ProgramDay, Exercise, WorkoutSession } from '../../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(startedAt: string, endedAt?: string): string {
  const mins = Math.round(
    (new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime()) / 60000
  )
  return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)} sa ${mins % 60} dk`
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

function relativeDate(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr + 'T12:00:00')
  const diffDays = Math.round((now.getTime() - d.getTime()) / 86400000)
  if (diffDays <= 0) return 'Bugün'
  if (diffDays === 1) return 'Dün'
  if (diffDays < 7) return `${diffDays} gün önce`
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
}

// ─── Tema ────────────────────────────────────────────────────────────────────
const C = {
  bg:           '#f5f3ef',
  surface:      '#ffffff',
  surfaceHigh:  '#f0ede8',
  border:       'rgba(0,0,0,0.07)',
  borderSub:    'rgba(0,0,0,0.04)',
  text:         '#1a1714',
  textMid:      'rgba(26,23,20,0.45)',
  textLow:      'rgba(26,23,20,0.28)',

  startText:    '#1d4ed8',
  startBg:      'rgba(29,78,216,0.07)',
  startBorder:  'rgba(29,78,216,0.18)',

  ongoingText:  '#b45309',
  ongoingBg:    'rgba(180,83,9,0.08)',
  ongoingBorder:'rgba(180,83,9,0.2)',

  successText:  '#166534',
  successBg:    'rgba(22,101,52,0.07)',
  successBorder:'rgba(22,101,52,0.18)',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayWithExercises extends ProgramDay {
  exercises: Exercise[]
}

interface OpenSession {
  id: string
  program_day_id: string
  started_at: string
  ended_at: string | null
  order_index: number
  paused_elapsed_seconds: number | null
}

interface PageData {
  program: Program | null
  days: DayWithExercises[]
  sessions: WorkoutSession[]
  setMeta: Record<string, { dayName: string; completedSets: number }>
  nextOrder: number
  openSession: OpenSession | null
}

// ─── Veri ────────────────────────────────────────────────────────────────────

async function fetchWorkoutPage(): Promise<PageData> {
  const userId = await getUserId()
  const { data: rpc } = await supabase.rpc('get_workout_page', {
    p_user_id: userId,
    p_today: today(),
  })
  if (!rpc) return { program: null, days: [], sessions: [], setMeta: {}, nextOrder: 0, openSession: null }

  const r = (typeof rpc === 'string' ? JSON.parse(rpc) : rpc) as Record<string, unknown>
  const sessions  = (r.sessions as WorkoutSession[]) ?? []
  const rawSets   = (r.sets as { session_id: string; completed: boolean }[]) ?? []
  const nextOrder = (r.next_order as number) ?? 0
  const days = ((r.days as (DayWithExercises & { exercises: Exercise[] | null })[]) ?? []).map(d => ({
    ...d,
    exercises: d.exercises ?? [],
  }))

  const setMeta: Record<string, { dayName: string; completedSets: number }> = {}
  for (const s of sessions.slice(0, 5)) {
    const day = days.find(d => d.id === s.program_day_id)
    const completedSets = rawSets.filter(x => x.session_id === s.id && x.completed).length
    setMeta[s.id] = { dayName: day?.day_name ?? 'Antrenman', completedSets }
  }

  const openSession = (r.open_session as OpenSession) ?? null
  return { program: r.program as Program ?? null, days, sessions, setMeta, nextOrder, openSession }
}

function buildSessionsByDay(days: DayWithExercises[], sessions: WorkoutSession[]) {
  const map: Record<string, WorkoutSession> = {}
  for (const d of days) {
    const match = sessions
      .filter(x => x.program_day_id === d.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    if (match) map[d.id] = match
  }
  return map
}

// ─── NextDayCard ──────────────────────────────────────────────────────────────

function NextDayCard({ day, session, inProgress, pausedLabel, onClick }: {
  day: DayWithExercises
  session?: WorkoutSession
  inProgress: boolean
  pausedLabel: string | null
  onClick: () => void
}) {
  const done = !!session?.ended_at

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl overflow-hidden text-left active:scale-[0.985] transition-transform duration-150"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      {/* Üst bant */}
      <div className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${C.borderSub}` }}>
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.textLow }}>
          {inProgress ? (
            <span className="flex items-center gap-1.5" style={{ color: C.ongoingText }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse"
                style={{ background: C.ongoingText }} />
              devam ediyor
            </span>
          ) : done ? 'tamamlandı' : 'sıradaki'}
        </span>
        <span className="text-[11px] font-bold px-3 py-1 rounded-full" style={{
          background: done ? C.successBg : inProgress ? C.ongoingBg : C.startBg,
          color:      done ? C.successText : inProgress ? C.ongoingText : C.startText,
          border:     `1px solid ${done ? C.successBorder : inProgress ? C.ongoingBorder : C.startBorder}`,
        }}>
          {done ? '✓ Tamamlandı' : inProgress
            ? pausedLabel ? `Devam Et · ${pausedLabel}` : 'Devam Et'
            : 'Başlat'}
        </span>
      </div>

      {/* İçerik */}
      <div className="px-5 py-5">
        <div className="flex items-end justify-between mb-1.5">
          <p className="text-[30px] font-extrabold leading-none tracking-tight" style={{ color: C.text }}>
            {day.day_name}
          </p>
        </div>
        <p className="text-sm mb-4" style={{ color: C.textMid }}>
          {day.exercises.length} egzersiz
          {session?.ended_at && ` · ${formatDuration(session.started_at, session.ended_at)}`}
        </p>

        {day.exercises.length > 0 && (
          <div className="pt-4 space-y-2.5" style={{ borderTop: `1px solid ${C.borderSub}` }}>
            {day.exercises.slice(0, 4).map(e => (
              <div key={e.id} className="flex items-center justify-between">
                <span className="text-[13px] font-semibold" style={{ color: C.textMid }}>{e.name}</span>
                <span className="text-[12px] font-medium tabular-nums" style={{ color: C.textLow }}>
                  {exerciseTarget(e)}
                </span>
              </div>
            ))}
            {day.exercises.length > 4 && (
              <p className="text-xs" style={{ color: C.textLow }}>
                +{day.exercises.length - 4} egzersiz daha
              </p>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── DayRow ───────────────────────────────────────────────────────────────────

function DayRow({ day, session, orderNum }: {
  day: DayWithExercises
  session?: WorkoutSession
  orderNum: number
}) {
  const done = !!session?.ended_at

  return (
    <div
      className="w-full rounded-2xl px-4 py-3.5 flex items-center gap-3.5"
      style={{ background: C.surface, border: `1px solid ${C.border}`, opacity: done ? 0.8 : 0.6 }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: done ? C.successBg : C.surfaceHigh,
          border: `1px solid ${done ? C.successBorder : C.borderSub}`,
        }}>
        {done
          ? <Check size={14} style={{ color: C.successText }} strokeWidth={2.5} />
          : <span className="text-[12px] font-bold" style={{ color: C.textLow }}>{orderNum}</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold truncate" style={{ color: done ? C.textMid : C.text }}>
          {day.day_name}
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: C.textLow }}>
          {day.exercises.length} egzersiz
          {session?.ended_at && ` · ${formatDuration(session.started_at, session.ended_at)}`}
        </p>
      </div>
    </div>
  )
}

// ─── Workout ─────────────────────────────────────────────────────────────────

export default function Workout() {
  const navigate = useNavigate()
  const [confirmDay, setConfirmDay] = useState<DayWithExercises | null>(null)

  const { data: wdata, isLoading } = useQuery({
    queryKey: ['workout-page'],
    queryFn: fetchWorkoutPage,
    staleTime: 0,
  })

  if (isLoading) return <PageSpinner />

  const { program, days, sessions, setMeta, nextOrder, openSession } =
    wdata ?? { program: null, days: [], sessions: [], setMeta: {}, nextOrder: 0, openSession: null }

  const sessionsByDay   = buildSessionsByDay(Array.isArray(days) ? days : [], Array.isArray(sessions) ? sessions : [])
  const recentSessions  = Array.isArray(sessions) ? sessions.slice(0, 5) : []
  const safeDays        = Array.isArray(days) ? days : []
  const activeNextOrder = openSession ? openSession.order_index : nextOrder
  const isInProgress    = !!openSession
  const activeDay       = safeDays.find(d => d.order_index === activeNextOrder)

  const sortedDays = [...safeDays].sort((a, b) => a.order_index - b.order_index)

  const pausedLabel = isInProgress && openSession?.paused_elapsed_seconds != null
    ? (() => {
        const secs = openSession.paused_elapsed_seconds!
        return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
      })()
    : null

  function handleDayTap(day: DayWithExercises) {
    setConfirmDay(day)
  }

  function handleConfirmed() {
    setConfirmDay(null)
    if (confirmDay) {
      navigate('/workout/start', { state: { dayId: confirmDay.id } })
    }
  }

  // Aktif gün için state: dayId vermeden navigate edersek mevcut session devam eder
  function handleActiveDayConfirmed() {
    setConfirmDay(null)
    navigate('/workout/start')
  }

  const isConfirmingActiveDay = confirmDay?.order_index === activeNextOrder

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>

      {/* ── Header ── */}
      <div className="px-5 pt-14 pb-5 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
            {program ? program.name : 'Antrenman'}
          </p>
          <h1 className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: C.text }}>
            Antrenman
          </h1>
        </div>
        <button
          onClick={() => navigate('/workout/history')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMid }}
        >
          <History size={13} />
          Geçmiş
        </button>
      </div>

      {/* ── İçerik ── */}
      <div className="px-4 pb-36 space-y-2.5">
        {!program ? (
          <div className="rounded-2xl p-10 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: C.surfaceHigh }}>
              <Dumbbell size={22} style={{ color: C.textLow }} />
            </div>
            <p className="text-base font-bold mb-2" style={{ color: C.text }}>Program yok</p>
            <p className="text-sm leading-relaxed mb-6" style={{ color: C.textMid }}>
              Antrenman takibi için önce bir program oluşturman gerekiyor.
            </p>
            <button
              onClick={() => navigate('/programs')}
              className="px-6 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform"
              style={{ background: C.surfaceHigh, color: C.text, border: `1px solid ${C.border}` }}
            >
              Program Oluştur
            </button>
          </div>
        ) : safeDays.length === 0 ? (
          <div className="rounded-2xl p-10 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: C.surfaceHigh }}>
              <BarChart2 size={22} style={{ color: C.textLow }} />
            </div>
            <p className="text-base font-bold mb-2" style={{ color: C.text }}>Gün eklenmedi</p>
            <p className="text-sm leading-relaxed mb-6" style={{ color: C.textMid }}>
              Programa antrenman günleri ekle.
            </p>
            <button
              onClick={() => navigate(`/programs/${program.id}`)}
              className="px-6 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform"
              style={{ background: C.surfaceHigh, color: C.text, border: `1px solid ${C.border}` }}
            >
              Programı Düzenle
            </button>
          </div>
        ) : (
          <>
            {/* Sıradaki / aktif gün — büyük kart */}
            {activeDay && (
              <NextDayCard
                day={activeDay}
                session={sessionsByDay[activeDay.id]}
                inProgress={isInProgress}
                pausedLabel={pausedLabel}
                onClick={() => handleDayTap(activeDay)}
              />
            )}

            {/* Diğer günler */}
            {sortedDays.filter(d => d.order_index !== activeNextOrder).length > 0 && (
              <div className="pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                  style={{ color: C.textLow }}>
                  Program
                </p>
                <div className="space-y-2">
                  {sortedDays
                    .filter(d => d.order_index !== activeNextOrder)
                    .map(day => (
                      <DayRow
                        key={day.id}
                        day={day}
                        session={sessionsByDay[day.id]}
                        orderNum={day.order_index + 1}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Son antrenmanlar */}
            {recentSessions.length > 0 && (
              <div className="pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                  style={{ color: C.textLow }}>
                  Son Antrenmanlar
                </p>
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: `1px solid ${C.border}`, background: C.surface }}>
                  {recentSessions.map((session, i) => {
                    const meta = setMeta[session.id]
                    return (
                      <button
                        key={session.id}
                        onClick={() => navigate(`/workout/history/${session.id}`)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left active:bg-black/[0.02] transition-colors"
                        style={i > 0 ? { borderTop: `1px solid ${C.borderSub}` } : undefined}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: C.surfaceHigh }}>
                            <Dumbbell size={14} strokeWidth={1.6} style={{ color: C.textMid }} />
                          </div>
                          <div>
                            <p className="text-[14px] font-semibold" style={{ color: C.text }}>
                              {meta?.dayName ?? 'Antrenman'}
                            </p>
                            <p className="text-[12px] mt-0.5" style={{ color: C.textLow }}>
                              {relativeDate(session.date)}
                              {session.ended_at && ` · ${formatDuration(session.started_at, session.ended_at)}`}
                              {(meta?.completedSets ?? 0) > 0 && ` · ${meta.completedSets} set`}
                            </p>
                          </div>
                        </div>
                        <ChevronRight size={14} style={{ color: C.textLow }} />
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => navigate('/workout/history')}
                  className="w-full mt-2 py-3 text-[12px] font-semibold"
                  style={{ color: C.textLow }}
                >
                  Tüm geçmişi gör →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Floating CTA ── */}
      {program && safeDays.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6"
          style={{ background: `linear-gradient(to top, ${C.bg} 60%, transparent)` }}>
          <button
            onClick={() => activeDay && handleDayTap(activeDay)}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-[15px] active:scale-[0.97] transition-transform"
            style={{
              background: isInProgress ? C.ongoingBg : C.startBg,
              border: `1px solid ${isInProgress ? C.ongoingBorder : C.startBorder}`,
              color: isInProgress ? C.ongoingText : C.startText,
            }}
          >
            <Play size={14} fill="currentColor" strokeWidth={0} />
            {isInProgress ? 'Devam Et' : 'Antrenmana Başla'}
          </button>
        </div>
      )}

      {/* ── Onay Modalı ── */}
      {confirmDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={() => setConfirmDay(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
              {isConfirmingActiveDay && isInProgress ? 'Devam Et' : 'Antrenman'}
            </p>
            <p className="text-[22px] font-extrabold tracking-tight mb-1" style={{ color: C.text }}>
              {confirmDay.day_name}
            </p>
            <p className="text-[14px] mb-6" style={{ color: C.textMid }}>
              {isConfirmingActiveDay && isInProgress
                ? 'Yarım kalan antrenmanına devam edeceksin.'
                : `${confirmDay.exercises.length} egzersiz · Başlatılsın mı?`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDay(null)}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold active:scale-95 transition-transform"
                style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.textMid }}
              >
                İptal
              </button>
              <button
                onClick={isConfirmingActiveDay ? handleActiveDayConfirmed : handleConfirmed}
                className="flex-[2] py-3.5 rounded-2xl text-sm font-bold active:scale-95 transition-transform"
                style={{
                  background: isInProgress && isConfirmingActiveDay ? C.ongoingBg : C.startBg,
                  border: `1px solid ${isInProgress && isConfirmingActiveDay ? C.ongoingBorder : C.startBorder}`,
                  color: isInProgress && isConfirmingActiveDay ? C.ongoingText : C.startText,
                }}
              >
                {isInProgress && isConfirmingActiveDay ? 'Devam Et' : 'Başlat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

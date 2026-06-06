import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Play, History, ChevronRight, Dumbbell, Lock, Clock, BarChart2 } from 'lucide-react'
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

// ─── Renk sabitleri — tek noktadan yönetim ───────────────────────────────────
const C = {
  bg:          '#0d0d14',
  surface:     '#16161f',   // kart yüzeyi
  surfaceHigh: '#1c1c27',   // hover/raised
  border:      'rgba(255,255,255,0.08)',
  borderSub:   'rgba(255,255,255,0.05)',
  text:        '#e8e4dc',   // kirli krem — birincil metin
  textMid:     'rgba(232,228,220,0.45)',
  textLow:     'rgba(232,228,220,0.2)',

  // Başlat (Start) - Enerjik Mavi
  startText:   '#60a5fa',
  startBg:     'rgba(59,130,246,0.15)',
  startBorder: 'rgba(59,130,246,0.3)',

  // Devam Et (In Progress) - Kehribar/Turuncu
  ongoingText: '#fbbf24',
  ongoingBg:   'rgba(245,158,11,0.15)',
  ongoingBorder:'rgba(245,158,11,0.3)',

  // Tamamlandı (Done) - Zümrüt Yeşili
  successText: '#34d399',
  successBg:   'rgba(16,185,129,0.15)',
  successBorder:'rgba(16,185,129,0.3)',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayWithExercises extends ProgramDay {
  exercises: Exercise[]
  is_next?: boolean
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

// ─── ActiveDayCard ────────────────────────────────────────────────────────────

function ActiveDayCard({ day, session, inProgress, pausedLabel, onClick }: {
  day: DayWithExercises
  session?: WorkoutSession
  inProgress: boolean
  pausedLabel: string | null
  onClick: () => void
}) {
  const done = !!session?.ended_at

  return (
    <div
      onClick={onClick}
      role="button"
      className="w-full rounded-2xl overflow-hidden cursor-pointer active:scale-[0.985] transition-transform duration-150"
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
      }}
    >
      {/* Üst bant */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${C.borderSub}` }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: C.textLow }}
        >
          {inProgress ? (
            <span className="flex items-center gap-1.5" style={{ color: C.textMid }}>
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: C.ongoingText, boxShadow: `0 0 0 3px ${C.ongoingBg}` }}
              />
              devam ediyor
            </span>
          ) : 'sıradaki'}
        </span>

        <span
          className="text-[11px] font-bold px-3 py-1 rounded-full"
          style={{
            background: done ? C.successBg : inProgress ? C.ongoingBg : C.startBg,
            color: done ? C.successText : inProgress ? C.ongoingText : C.startText,
            border: `1px solid ${done ? C.successBorder : inProgress ? C.ongoingBorder : C.startBorder}`,
          }}
        >
          {done
            ? '✓ Tamamlandı'
            : inProgress && pausedLabel
              ? `Devam Et · ${pausedLabel}`
              : inProgress ? 'Devam Et'
              : 'Başlat'}
        </span>
      </div>

      {/* İçerik */}
      <div className="px-5 py-5">
        <p
          className="text-[32px] font-black leading-none tracking-tight mb-1.5"
          style={{ color: C.text }}
        >
          {day.day_name}
        </p>
        <p className="text-sm mb-5" style={{ color: C.textMid }}>
          {day.exercises.length} egzersiz
          {session?.ended_at && ` · ${formatDuration(session.started_at, session.ended_at)}`}
        </p>

        {day.exercises.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {day.exercises.slice(0, 4).map(e => (
              <div
                key={e.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                style={{
                  background: C.surfaceHigh,
                  border: `1px solid ${C.border}`,
                  color: C.textMid,
                }}
              >
                <span style={{ color: C.text, fontWeight: 600 }}>{e.name}</span>
                {exerciseTarget(e) && (
                  <span style={{ color: C.textLow }}>{exerciseTarget(e)}</span>
                )}
              </div>
            ))}
            {day.exercises.length > 4 && (
              <div
                className="px-3 py-1.5 rounded-full text-xs"
                style={{
                  background: C.surfaceHigh,
                  border: `1px solid ${C.borderSub}`,
                  color: C.textLow,
                }}
              >
                +{day.exercises.length - 4}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── LockedDayRow ─────────────────────────────────────────────────────────────

function LockedDayRow({ day, session }: {
  day: DayWithExercises
  session?: WorkoutSession
}) {
  const done = !!session?.ended_at
  return (
    <div
      className="w-full rounded-xl px-4 py-3.5 flex items-center gap-3.5"
      style={{
        background: C.surface,
        border: `1px solid ${C.borderSub}`,
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-black"
        style={{
          background: done ? C.successBg : C.surfaceHigh,
          color: done ? C.successText : C.textLow,
          border: `1px solid ${done ? C.successBorder : C.borderSub}`,
        }}
      >
        {done ? '✓' : <Lock size={12} />}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate"
          style={{ color: done ? C.textMid : C.textLow }}
        >
          {day.day_name}
        </p>
        <p className="text-xs mt-0.5" style={{ color: C.textLow }}>
          {day.exercises.length} egzersiz
          {session?.ended_at && ` · ${formatDuration(session.started_at, session.ended_at)}`}
        </p>
      </div>
      <span
        className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
        style={{ color: done ? C.successText : C.textLow }}
      >
        {done ? 'bitti' : `${day.order_index + 1}. gün`}
      </span>
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ icon, title, desc, action }: {
  icon: React.ReactNode
  title: string
  desc: string
  action: { label: string; onClick: () => void }
}) {
  return (
    <div
      className="rounded-2xl p-10 text-center"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
        style={{ background: C.surfaceHigh, border: `1px solid ${C.border}` }}
      >
        {icon}
      </div>
      <p className="text-base font-bold mb-2" style={{ color: C.text }}>{title}</p>
      <p className="text-sm leading-relaxed mb-6" style={{ color: C.textMid }}>{desc}</p>
      <button
        onClick={action.onClick}
        className="px-6 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform"
        style={{ background: C.surfaceHigh, color: C.text, border: `1px solid ${C.border}` }}
      >
        {action.label}
      </button>
    </div>
  )
}

// ─── Workout (ana sayfa) ──────────────────────────────────────────────────────

export default function Workout() {
  const navigate = useNavigate()
  const [showConfirm, setShowConfirm] = useState(false)

  const { data: wdata } = useQuery({
    queryKey: ['workout-page'],
    queryFn: fetchWorkoutPage,
    staleTime: 0,
  })

  const { program, days, sessions, setMeta, nextOrder, openSession } =
    wdata ?? { program: null, days: [], sessions: [], setMeta: {}, nextOrder: 0, openSession: null }

  const sessionsByDay  = buildSessionsByDay(Array.isArray(days) ? days : [], Array.isArray(sessions) ? sessions : [])
  const recentSessions = Array.isArray(sessions) ? sessions.slice(0, 5) : []
  const safeDays       = Array.isArray(days) ? days : []
  const activeNextOrder = openSession ? openSession.order_index : nextOrder
  const isInProgress   = !!openSession

  const sortedDays = [...safeDays].sort((a, b) => {
    if (a.order_index === activeNextOrder) return -1
    if (b.order_index === activeNextOrder) return 1
    return a.order_index - b.order_index
  })

  const activeDay = safeDays.find(d => d.order_index === activeNextOrder)

  const pausedLabel = isInProgress && openSession && openSession.paused_elapsed_seconds != null
    ? (() => {
        const secs = openSession.paused_elapsed_seconds!
        const m = Math.floor(secs / 60)
        const s = secs % 60
        return `${m}:${String(s).padStart(2, '0')}`
      })()
    : null

  function handleStartConfirmed() {
    setShowConfirm(false)
    navigate('/workout/start')
  }

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>

      {/* ── Header ── */}
      <div className="px-5 pt-14 pb-5 flex items-start justify-between">
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1"
            style={{ color: C.textLow }}
          >
            {program ? program.name : 'Antrenman'}
          </p>
          <h1 className="text-[28px] font-black tracking-tight leading-none" style={{ color: C.text }}>
            Antrenman
          </h1>
        </div>
        <button
          onClick={() => navigate('/workout/history')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            color: C.textMid,
          }}
        >
          <History size={13} />
          Geçmiş
        </button>
      </div>

      {/* ── İçerik ── */}
      <div className="px-4 pb-32 space-y-2.5">
        {!program ? (
          <EmptyState
            icon={<Dumbbell size={22} style={{ color: C.textLow }} />}
            title="Program yok"
            desc="Antrenman takibi için önce bir program oluşturman gerekiyor."
            action={{ label: 'Program Oluştur', onClick: () => navigate('/programs') }}
          />
        ) : safeDays.length === 0 ? (
          <EmptyState
            icon={<BarChart2 size={22} style={{ color: C.textLow }} />}
            title="Gün eklenmedi"
            desc="Programa antrenman günleri ekle."
            action={{ label: 'Programı Düzenle', onClick: () => navigate(`/programs/${program.id}`) }}
          />
        ) : (
          <>
            {sortedDays.map(day =>
              day.order_index === activeNextOrder ? (
                <ActiveDayCard
                  key={day.id}
                  day={day}
                  session={sessionsByDay[day.id]}
                  inProgress={isInProgress}
                  pausedLabel={pausedLabel}
                  onClick={() => setShowConfirm(true)}
                />
              ) : (
                <LockedDayRow
                  key={day.id}
                  day={day}
                  session={sessionsByDay[day.id]}
                />
              )
            )}

            {/* ── Son Antrenmanlar ── */}
            {recentSessions.length > 0 && (
              <div className="pt-4">
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3 px-1"
                  style={{ color: C.textLow }}
                >
                  Son Antrenmanlar
                </p>
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ border: `1px solid ${C.border}`, background: C.surface }}
                >
                  {recentSessions.map((session, i) => {
                    const meta = setMeta[session.id]
                    return (
                      <button
                        key={session.id}
                        onClick={() => navigate(`/workout/history/${session.id}`)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors active:bg-white/[0.03]"
                        style={i > 0 ? { borderTop: `1px solid ${C.borderSub}` } : undefined}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: C.surfaceHigh, border: `1px solid ${C.borderSub}` }}
                          >
                            <Clock size={13} style={{ color: C.textLow }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: C.text }}>
                              {meta?.dayName ?? 'Antrenman'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: C.textLow }}>
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
                  className="w-full mt-2 py-3 text-xs font-semibold"
                  style={{ color: C.textLow }}
                >
                  Tüm geçmişi gör
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Floating CTA ── */}
      {program && safeDays.length > 0 && (
        <div
          className="fixed bottom-0 inset-x-0 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5"
          style={{ background: `linear-gradient(to top, ${C.bg} 55%, transparent)` }}
        >
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-sm tracking-wide active:scale-[0.97] transition-transform"
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
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6"
            style={{
              background: C.surfaceHigh,
              border: `1px solid ${C.border}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <p className="font-black text-lg mb-1" style={{ color: C.text }}>
              {isInProgress ? 'Devam Et' : 'Antrenmanı Başlat'}
            </p>
            <p className="text-sm mb-6" style={{ color: C.textMid }}>
              {isInProgress
                ? `${activeDay?.day_name} — yarım kalan antrenmanına devam edeceksin.`
                : `${activeDay?.day_name} — ${activeDay?.exercises?.length ?? 0} egzersiz. Hazır mısın?`}
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  color: C.textMid,
                }}
              >
                Vazgeç
              </button>
              <button
                onClick={handleStartConfirmed}
                className="flex-1 py-3.5 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                style={{
                  background: isInProgress ? C.ongoingBg : C.startBg,
                  border: `1px solid ${isInProgress ? C.ongoingBorder : C.startBorder}`,
                  color: isInProgress ? C.ongoingText : C.startText,
                }}
              >
                {isInProgress ? 'Devam Et' : 'Başlat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
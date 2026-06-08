import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { supabase, getUserId } from '../../lib/supabase'
import type { Exercise, SessionSet } from '../../types'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'

const C = {
  bg:          '#f5f3ef',
  surface:     '#ffffff',
  surfaceHigh: '#f0ede8',
  border:      'rgba(0,0,0,0.07)',
  borderSub:   'rgba(0,0,0,0.04)',
  text:        '#1a1714',
  textMid:     'rgba(26,23,20,0.45)',
  textLow:     'rgba(26,23,20,0.28)',
  startText:   '#1d4ed8',
  ongoingText: '#b45309',
  ongoingBg:   'rgba(180,83,9,0.08)',
}

interface PR { id: string; exercise_name: string; max_weight_kg: number; max_volume: number; achieved_at: string }
interface SetWithDate { set: SessionSet; session_date: string }
interface PageData { exercise: Exercise; sets: SetWithDate[]; pr: PR | null }
interface ChartPoint { date: string; label: string; maxWeight: number; totalVolume: number }
type ChartMode = 'weight' | 'volume'

function buildChart(sets: SetWithDate[]): ChartPoint[] {
  const byDate: Record<string, SetWithDate[]> = {}
  for (const s of sets) {
    if (!byDate[s.session_date]) byDate[s.session_date] = []
    byDate[s.session_date].push(s)
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => {
      const completed = rows.filter(r => r.set.completed && (r.set.weight_kg ?? 0) > 0)
      return {
        date,
        label: new Date(date + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
        maxWeight: completed.length > 0 ? Math.max(...completed.map(r => r.set.weight_kg ?? 0)) : 0,
        totalVolume: Math.round(completed.reduce((a, r) => a + (r.set.weight_kg ?? 0) * (r.set.reps ?? 0), 0)),
      }
    })
    .filter(p => p.maxWeight > 0 || p.totalVolume > 0)
}

function recentSessions(sets: SetWithDate[]) {
  const byDate: Record<string, SetWithDate[]> = {}
  for (const s of sets.filter(x => x.set.completed)) {
    if (!byDate[s.session_date]) byDate[s.session_date] = []
    byDate[s.session_date].push(s)
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 5)
}

export default function WorkoutExerciseDetail() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const [page, setPage] = useState<PageData | null>(null)
  const [mode, setMode] = useState<ChartMode>('weight')

  useEffect(() => {
    if (!exerciseId) return
    async function load() {
      const userId = await getUserId()
      const { data } = await supabase.rpc('get_exercise_detail', {
        p_user_id: userId,
        p_exercise_id: exerciseId,
      })
      if (!data) { setPage(null); return }
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      setPage(parsed as PageData)
    }
    load()
  }, [exerciseId])

  if (!page) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center"
      style={{ background: C.bg }}>
      <p className="text-[13px] font-semibold" style={{ color: C.textMid }}>Egzersiz bulunamadı</p>
      <button onClick={() => navigate(-1)}
        className="px-5 py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-transform"
        style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }}>
        Geri Dön
      </button>
    </div>
  )

  const { exercise, sets, pr } = page
  const isStrength = !exercise.type || exercise.type === 'strength'
  const chartData = isStrength ? buildChart(sets) : []
  const recent = recentSessions(sets)
  const dataKey = mode === 'weight' ? 'maxWeight' : 'totalVolume'
  const yLabel = mode === 'weight' ? 'kg' : 'kg hacim'
  const prValue = mode === 'weight' ? pr?.max_weight_kg : pr?.max_volume

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div className="px-5 pt-14 pb-5">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-[12px] font-semibold mb-4 active:opacity-60 transition-opacity"
          style={{ color: C.textLow }}>
          ← Geri
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
          {exercise.muscle_group}
        </p>
        <h1 className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: C.text }}>
          {exercise.name}
        </h1>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {/* PR kartı */}
        {pr && (
          <div className="rounded-2xl p-5" style={{ background: C.ongoingBg, border: `1px solid rgba(180,83,9,0.15)` }}>
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={14} style={{ color: C.ongoingText }} />
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.ongoingText }}>
                Kişisel Rekor
              </p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-[24px] font-extrabold tabular-nums" style={{ color: C.text }}>
                  {pr.max_weight_kg} <span className="text-[14px] font-medium" style={{ color: C.textMid }}>kg</span>
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: C.ongoingText }}>Maksimum ağırlık</p>
              </div>
              <div className="w-px" style={{ background: 'rgba(180,83,9,0.15)' }} />
              <div>
                <p className="text-[24px] font-extrabold tabular-nums" style={{ color: C.text }}>
                  {pr.max_volume >= 1000 ? `${(pr.max_volume / 1000).toFixed(1)}t` : `${Math.round(pr.max_volume)}`}
                  <span className="text-[14px] font-medium ml-1" style={{ color: C.textMid }}>
                    {pr.max_volume >= 1000 ? '' : 'kg'}
                  </span>
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: C.ongoingText }}>Maksimum hacim</p>
              </div>
            </div>
            <p className="text-[11px] mt-3" style={{ color: C.textMid }}>
              {new Date(pr.achieved_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Grafik */}
        {chartData.length > 1 ? (
          <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.textLow }}>
                İlerleme Grafiği
              </p>
              <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: C.surfaceHigh }}>
                {(['weight', 'volume'] as ChartMode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all active:scale-95"
                    style={{
                      background: mode === m ? C.surface : 'transparent',
                      color: mode === m ? C.text : C.textMid,
                      boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}>
                    {m === 'weight' ? 'Ağırlık' : 'Hacim'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="label"
                  tick={{ fontSize: 10, fill: 'rgba(26,23,20,0.35)' }}
                  axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: 'rgba(26,23,20,0.35)' }}
                  axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  contentStyle={{
                    fontSize: 12, borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    background: C.surface,
                    color: C.text,
                  }}
                  formatter={(value) => [`${value ?? 0} ${yLabel}`, mode === 'weight' ? 'Max Ağırlık' : 'Hacim']}
                  labelStyle={{ fontWeight: 600, color: C.text }}
                />
                {prValue && (
                  <ReferenceLine y={prValue} stroke={C.ongoingText} strokeDasharray="4 3"
                    label={{ value: 'PR', fill: C.ongoingText, fontSize: 10, fontWeight: 700 }} />
                )}
                <Line type="monotone" dataKey={dataKey} stroke={C.startText} strokeWidth={2}
                  dot={{ r: 3, fill: C.startText, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: C.startText }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : chartData.length === 1 ? (
          <div className="rounded-2xl p-5 text-center py-8"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <p className="text-[13px]" style={{ color: C.textMid }}>
              Grafik için en az 2 oturum gerekiyor.
            </p>
          </div>
        ) : null}

        {/* Son oturumlar */}
        {recent.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
              style={{ color: C.textLow }}>
              Son Oturumlar
            </p>
            <div className="space-y-2">
              {recent.map(([date, rows]) => {
                const maxWeight = Math.max(...rows.map(r => r.set.weight_kg ?? 0))
                const volume = rows.reduce((a, r) => a + (r.set.weight_kg ?? 0) * (r.set.reps ?? 0), 0)
                return (
                  <div key={date} className="rounded-2xl p-5"
                    style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] font-semibold" style={{ color: C.text }}>
                        {new Date(date + 'T12:00:00').toLocaleDateString('tr-TR', {
                          weekday: 'short', day: 'numeric', month: 'long'
                        })}
                      </p>
                      <div className="flex items-center gap-3">
                        {maxWeight > 0 && (
                          <span className="text-[12px] font-semibold tabular-nums" style={{ color: C.textMid }}>
                            {maxWeight} kg maks
                          </span>
                        )}
                        {volume > 0 && (
                          <span className="text-[12px] font-medium tabular-nums" style={{ color: C.textLow }}>
                            {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2" style={{ borderTop: `1px solid ${C.borderSub}`, paddingTop: 10 }}>
                      {rows.map((r, i) => (
                        <div key={r.set.id} className="flex items-center gap-3">
                          <span className="text-[11px] font-medium w-10" style={{ color: C.textLow }}>
                            Set {i + 1}
                          </span>
                          <span className="text-[13px] font-semibold" style={{ color: C.text }}>
                            {r.set.weight_kg && r.set.reps
                              ? `${r.set.weight_kg} kg × ${r.set.reps}`
                              : r.set.held_seconds ? `${r.set.held_seconds} sn`
                              : r.set.duration_minutes ? `${r.set.duration_minutes} dk`
                              : '—'}
                          </span>
                          {r.set.weight_kg && r.set.reps && (
                            <span className="text-[11px] tabular-nums" style={{ color: C.textMid }}>
                              = {Math.round(r.set.weight_kg * r.set.reps)} kg
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {recent.length === 0 && (
          <div className="rounded-2xl p-10 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <p className="text-[13px]" style={{ color: C.textMid }}>
              {isStrength
                ? 'Bu egzersiz için henüz tamamlanmış set yok.'
                : 'Bu egzersiz için henüz kayıt yok.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { supabase, getUserId } from '../../lib/supabase'
import type { Exercise, SessionSet } from '../../types'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'

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

// Son 5 oturumu grupla
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
    <div className="min-h-screen bg-[#f7f5f2] flex flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-sm font-semibold text-stone-500">Egzersiz bulunamadı</p>
      <button
        onClick={() => navigate(-1)}
        className="px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-semibold"
      >
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
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6">
        <button onClick={() => navigate(-1)}
          className="text-xs text-stone-400 font-semibold mb-3 flex items-center gap-1 active:text-stone-600">
          ← Geri
        </button>
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wide mb-0.5">{exercise.muscle_group}</p>
        <h1 className="text-[28px] font-bold tracking-tight">{exercise.name}</h1>
      </div>

      <div className="px-4 pb-10 space-y-4">
        {/* PR */}
        {pr && (
          <div className="rounded-2xl bg-amber-50 border border-amber-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={14} className="text-amber-500" />
              <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Kişisel Rekor</p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold text-amber-900">{pr.max_weight_kg} kg</p>
                <p className="text-xs text-amber-600 mt-0.5">Maksimum ağırlık</p>
              </div>
              <div className="w-px bg-amber-200" />
              <div>
                <p className="text-2xl font-bold text-amber-900">
                  {pr.max_volume >= 1000 ? `${(pr.max_volume / 1000).toFixed(1)}t` : `${Math.round(pr.max_volume)}kg`}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Maksimum hacim</p>
              </div>
            </div>
            <p className="text-xs text-amber-500 mt-3">
              {new Date(pr.achieved_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Grafik */}
        {chartData.length > 1 ? (
          <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">İlerleme Grafiği</p>
              <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                {(['weight', 'volume'] as ChartMode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      mode === m ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400'
                    }`}>
                    {m === 'weight' ? 'Ağırlık' : 'Hacim'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1ede8" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#a8a29e' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e7e3de', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  formatter={(value) => [`${value ?? 0} ${yLabel}`, mode === 'weight' ? 'Max Ağırlık' : 'Hacim']}
                  labelStyle={{ fontWeight: 600, color: '#1c1917' }}
                />
                {prValue && (
                  <ReferenceLine y={prValue} stroke="#f59e0b" strokeDasharray="4 3"
                    label={{ value: 'PR', fill: '#f59e0b', fontSize: 10, fontWeight: 700 }} />
                )}
                <Line type="monotone" dataKey={dataKey} stroke="#334155" strokeWidth={2}
                  dot={{ r: 3, fill: '#334155', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#334155' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : chartData.length === 1 ? (
          <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-5 text-center py-8">
            <p className="text-sm text-stone-400">Grafik için en az 2 oturum gerekiyor.</p>
          </div>
        ) : null}

        {/* Son oturumlar */}
        {recent.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-3 px-1">Son Oturumlar</p>
            <div className="space-y-2">
              {recent.map(([date, rows]) => {
                const maxWeight = Math.max(...rows.map(r => r.set.weight_kg ?? 0))
                const volume = rows.reduce((a, r) => a + (r.set.weight_kg ?? 0) * (r.set.reps ?? 0), 0)
                return (
                  <div key={date} className="rounded-2xl bg-white border border-stone-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold text-stone-900">
                        {new Date(date + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'long' })}
                      </p>
                      <div className="flex items-center gap-3">
                        {maxWeight > 0 && <span className="text-xs font-semibold text-stone-500">{maxWeight} kg maks</span>}
                        {volume > 0 && <span className="text-xs font-semibold text-stone-400">
                          {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}
                        </span>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {rows.map((r, i) => (
                        <div key={r.set.id} className="flex items-center gap-3 text-sm">
                          <span className="text-stone-300 font-medium w-8">Set {i + 1}</span>
                          {r.set.weight_kg && r.set.reps
                            ? <span className="font-semibold text-stone-800">{r.set.weight_kg} kg × {r.set.reps}</span>
                            : r.set.held_seconds
                            ? <span className="font-semibold text-stone-800">{r.set.held_seconds} sn</span>
                            : r.set.duration_minutes
                            ? <span className="font-semibold text-stone-800">{r.set.duration_minutes} dk</span>
                            : null}
                          {r.set.weight_kg && r.set.reps && (
                            <span className="text-xs text-stone-400">= {Math.round(r.set.weight_kg * r.set.reps)} kg hacim</span>
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
          <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-10 text-center">
            <p className="text-sm text-stone-400">
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

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'
import { bodyDb } from '../../lib/db'
import { QK } from '../../lib/queryClient'
import type { BodyMeasurement } from '../../types'

type Metric = 'weight_kg' | 'waist_cm' | 'chest_cm' | 'arm_cm' | 'hip_cm' | 'body_fat_pct'
type Range  = '4w' | '3m' | 'all'

const METRIC_LABELS: Record<Metric, { label: string; unit: string }> = {
  weight_kg:    { label: 'Kilo',      unit: 'kg' },
  waist_cm:     { label: 'Bel',       unit: 'cm' },
  chest_cm:     { label: 'Göğüs',     unit: 'cm' },
  arm_cm:       { label: 'Kol',       unit: 'cm' },
  hip_cm:       { label: 'Kalça',     unit: 'cm' },
  body_fat_pct: { label: 'Yağ Oranı', unit: '%'  },
}

function filterByRange(data: BodyMeasurement[], range: Range): BodyMeasurement[] {
  if (range === 'all') return data
  const cutoff = new Date()
  if (range === '4w') cutoff.setDate(cutoff.getDate() - 28)
  else cutoff.setMonth(cutoff.getMonth() - 3)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  return data.filter(m => m.date >= cutoffStr)
}

function diffLabel(latest: number, prev: number): { text: string; positive: boolean } {
  const diff = +(latest - prev).toFixed(1)
  return { text: diff > 0 ? `+${diff}` : `${diff}`, positive: diff > 0 }
}

export default function Body() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [metric, setMetric]   = useState<Metric>('weight_kg')
  const [range, setRange]     = useState<Range>('3m')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: measurements = [] } = useQuery({
    queryKey: QK.body,
    queryFn: () => bodyDb.getAll(),
    staleTime: 1000 * 60 * 5,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bodyDb.delete(id),
    onMutate: (id) => {
      qc.setQueryData(QK.body, (prev: BodyMeasurement[]) =>
        (prev ?? []).filter(m => m.id !== id)
      )
      setDeleteId(null)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.body })
      qc.invalidateQueries({ queryKey: QK.dashboard })
    },
  })

  const sorted   = [...measurements].sort((a, b) => a.date.localeCompare(b.date))
  const filtered = filterByRange(sorted, range)

  const chartData = filtered
    .filter(m => m[metric] != null)
    .map(m => ({
      label: new Date(m.date + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
      value: m[metric] as number,
    }))

  const latest = measurements[0]
  const prev   = measurements[1]
  const metricKeys = Object.keys(METRIC_LABELS) as Metric[]

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6 flex items-start justify-between">
        <div>
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wide mb-0.5">Takip</p>
          <h1 className="text-[32px] font-bold tracking-tight">Vücut</h1>
        </div>
        <button
          onClick={() => navigate('/body/new')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold shadow-sm active:bg-slate-700 transition-colors mt-1"
        >
          <Plus size={13} />
          Ölçüm Ekle
        </button>
      </div>

      <div className="px-4 pb-10 space-y-4">
        {measurements.length === 0 ? (
          <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-10 text-center">
            <p className="text-base font-bold text-stone-700 mb-2">Henüz ölçüm yok</p>
            <p className="text-sm text-stone-400 mb-5 leading-relaxed">
              İlk ölçümünü ekle, ilerlemenizi grafikte takip et.
            </p>
            <button
              onClick={() => navigate('/body/new')}
              className="px-5 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold active:bg-slate-600 transition-colors"
            >
              Ölçüm Ekle
            </button>
          </div>
        ) : (
          <>
            {latest && (
              <div className="grid grid-cols-2 gap-3">
                {metricKeys.filter(k => latest[k] != null).map(k => {
                  const { label, unit } = METRIC_LABELS[k]
                  const val    = latest[k] as number
                  const prevVal = prev?.[k] as number | undefined
                  const diff   = prevVal != null ? diffLabel(val, prevVal) : null
                  return (
                    <button
                      key={k}
                      onClick={() => setMetric(k)}
                      className={`rounded-2xl p-4 text-left transition-all active:scale-[0.98] ${
                        metric === k ? 'bg-slate-800 shadow-md' : 'bg-white border border-stone-100 shadow-sm'
                      }`}
                    >
                      <p className={`text-[9px] uppercase tracking-[0.12em] font-semibold mb-2 ${
                        metric === k ? 'text-slate-400' : 'text-stone-400'
                      }`}>{label}</p>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-bold leading-none ${metric === k ? 'text-white' : 'text-stone-900'}`}>
                          {val}
                        </span>
                        <span className={`text-xs font-medium ${metric === k ? 'text-slate-400' : 'text-stone-400'}`}>
                          {unit}
                        </span>
                      </div>
                      {diff && (
                        <p className={`text-xs font-semibold mt-1.5 ${
                          k === 'weight_kg' || k === 'waist_cm' || k === 'hip_cm' || k === 'body_fat_pct'
                            ? diff.positive
                              ? metric === k ? 'text-red-400' : 'text-red-500'
                              : metric === k ? 'text-emerald-400' : 'text-emerald-500'
                            : diff.positive
                              ? metric === k ? 'text-emerald-400' : 'text-emerald-500'
                              : metric === k ? 'text-red-400' : 'text-red-500'
                        }`}>
                          {diff.text} {unit}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {chartData.length > 0 && (
              <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                    {METRIC_LABELS[metric].label} Grafiği
                  </p>
                  <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                    {(['4w', '3m', 'all'] as Range[]).map(r => (
                      <button
                        key={r}
                        onClick={() => setRange(r)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          range === r ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400'
                        }`}
                      >
                        {r === '4w' ? '4 Hafta' : r === '3m' ? '3 Ay' : 'Tümü'}
                      </button>
                    ))}
                  </div>
                </div>

                {chartData.length < 2 ? (
                  <p className="text-sm text-stone-400 text-center py-6">
                    Grafik için bu aralıkta en az 2 ölçüm gerekiyor.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1ede8" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#a8a29e' }} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e7e3de', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                        formatter={(value) => [`${value} ${METRIC_LABELS[metric].unit}`, METRIC_LABELS[metric].label]}
                        labelStyle={{ fontWeight: 600, color: '#1c1917' }}
                      />
                      <Line type="monotone" dataKey="value" stroke="#334155" strokeWidth={2}
                        dot={{ r: 3, fill: '#334155', strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: '#334155' }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-3 px-1">
                Ölçüm Geçmişi
              </p>
              <div className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
                {measurements.map((m, i) => (
                  <div key={m.id} className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? 'border-t border-stone-100' : ''}`}>
                    <div className="flex flex-col items-center w-9 flex-shrink-0">
                      <span className="text-lg font-bold text-stone-900 leading-none">{m.date.split('-')[2]}</span>
                      <span className="text-[9px] text-stone-400 font-semibold uppercase tracking-wide mt-0.5">
                        {new Date(m.date + 'T12:00:00').toLocaleDateString('tr-TR', { month: 'short' })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-stone-900">
                        {m.weight_kg} kg
                        {m.body_fat_pct != null && <span className="text-stone-400 font-normal"> · %{m.body_fat_pct} yağ</span>}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5 truncate">
                        {[
                          m.waist_cm  != null ? `Bel ${m.waist_cm}`    : null,
                          m.chest_cm  != null ? `Göğüs ${m.chest_cm}`  : null,
                          m.arm_cm    != null ? `Kol ${m.arm_cm}`      : null,
                          m.hip_cm    != null ? `Kalça ${m.hip_cm}`    : null,
                        ].filter(Boolean).join(' · ') || 'Sadece kilo'}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteId(m.id)}
                      className="w-8 h-8 flex items-center justify-center text-stone-200 active:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6">
            <p className="font-bold text-stone-900 mb-2">Ölçümü sil?</p>
            <p className="text-sm text-stone-500 mb-5">Bu işlem geri alınamaz.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm active:bg-stone-50"
              >
                İptal
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-sm active:bg-red-600"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

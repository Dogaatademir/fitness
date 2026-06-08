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
  startBg:     'rgba(29,78,216,0.07)',
  successText: '#166534',
  successBg:   'rgba(22,101,52,0.07)',
  danger:      '#b91c1c',
  dangerBg:    'rgba(185,28,28,0.07)',
  dangerBorder:'rgba(185,28,28,0.2)',
}

type Metric = 'weight_kg' | 'waist_cm' | 'chest_cm' | 'arm_cm' | 'hip_cm' | 'body_fat_pct'
type Range  = '4w' | '3m' | 'all'

const METRICS: { key: Metric; label: string; unit: string; lowerIsBetter: boolean }[] = [
  { key: 'weight_kg',    label: 'Kilo',      unit: 'kg', lowerIsBetter: true  },
  { key: 'waist_cm',     label: 'Bel',       unit: 'cm', lowerIsBetter: true  },
  { key: 'chest_cm',     label: 'Göğüs',     unit: 'cm', lowerIsBetter: false },
  { key: 'arm_cm',       label: 'Kol',       unit: 'cm', lowerIsBetter: false },
  { key: 'hip_cm',       label: 'Kalça',     unit: 'cm', lowerIsBetter: true  },
  { key: 'body_fat_pct', label: 'Yağ Oranı', unit: '%',  lowerIsBetter: true  },
]

function filterByRange(data: BodyMeasurement[], range: Range): BodyMeasurement[] {
  if (range === 'all') return data
  const cutoff = new Date()
  if (range === '4w') cutoff.setDate(cutoff.getDate() - 28)
  else cutoff.setMonth(cutoff.getMonth() - 3)
  return data.filter(m => m.date >= cutoff.toISOString().split('T')[0])
}

export default function Body() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [metric, setMetric] = useState<Metric>('weight_kg')
  const [range, setRange]   = useState<Range>('3m')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: measurements = [] } = useQuery({
    queryKey: QK.body,
    queryFn: () => bodyDb.getAll(),
    staleTime: 1000 * 60 * 5,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bodyDb.delete(id),
    onMutate: (id) => {
      qc.setQueryData(QK.body, (prev: BodyMeasurement[]) => (prev ?? []).filter(m => m.id !== id))
      setDeleteId(null)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.body })
      qc.invalidateQueries({ queryKey: QK.dashboard })
    },
  })

  const sorted   = [...measurements].sort((a, b) => a.date.localeCompare(b.date))
  const filtered = filterByRange(sorted, range)
  const latest   = measurements[0]
  const prev     = measurements[1]

  const chartData = filtered
    .filter(m => m[metric] != null)
    .map(m => ({
      label: new Date(m.date + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
      value: m[metric] as number,
    }))

  const activeMetricDef = METRICS.find(m => m.key === metric)!

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div className="px-5 pt-14 pb-5 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
            Takip
          </p>
          <h1 className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: C.text }}>
            Vücut
          </h1>
        </div>
        <button
          onClick={() => navigate('/body/new')}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-transform"
          style={{ background: C.text, color: C.bg }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Ölçüm Ekle
        </button>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {measurements.length === 0 ? (
          <div className="rounded-2xl p-10 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: C.surfaceHigh }}>
              <span className="text-2xl">⚖️</span>
            </div>
            <p className="text-[15px] font-bold mb-1" style={{ color: C.text }}>Henüz ölçüm yok</p>
            <p className="text-[13px] mb-5 leading-relaxed" style={{ color: C.textMid }}>
              İlk ölçümünü ekle, ilerleni grafikte takip et.
            </p>
            <button
              onClick={() => navigate('/body/new')}
              className="px-6 py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-transform"
              style={{ background: C.text, color: C.bg }}
            >
              Ölçüm Ekle
            </button>
          </div>
        ) : (
          <>
            {/* Metrik kartları */}
            {latest && (
              <div className="grid grid-cols-3 gap-2">
                {METRICS.filter(m => latest[m.key] != null).map(({ key, label, unit, lowerIsBetter }) => {
                  const val     = latest[key] as number
                  const prevVal = prev?.[key] as number | undefined
                  const diff    = prevVal != null ? +(val - prevVal).toFixed(1) : null
                  const isActive = metric === key
                  const diffGood = diff != null && (lowerIsBetter ? diff < 0 : diff > 0)

                  return (
                    <button key={key} onClick={() => setMetric(key)}
                      className="rounded-2xl p-3.5 text-left active:scale-[0.97] transition-all duration-150"
                      style={{
                        background: isActive ? C.text : C.surface,
                        border: `1px solid ${isActive ? 'transparent' : C.border}`,
                      }}>
                      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                        style={{ color: isActive ? 'rgba(245,243,239,0.5)' : C.textLow }}>
                        {label}
                      </p>
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-[20px] font-extrabold leading-none tabular-nums"
                          style={{ color: isActive ? C.bg : C.text }}>
                          {val}
                        </span>
                        <span className="text-[11px] font-medium ml-0.5"
                          style={{ color: isActive ? 'rgba(245,243,239,0.45)' : C.textLow }}>
                          {unit}
                        </span>
                      </div>
                      {diff !== null && diff !== 0 && (
                        <p className="text-[11px] font-bold mt-1 tabular-nums"
                          style={{
                            color: isActive
                              ? diffGood ? '#86efac' : '#fca5a5'
                              : diffGood ? C.successText : C.danger
                          }}>
                          {diff > 0 ? '+' : ''}{diff}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Grafik */}
            {chartData.length > 0 && (
              <div className="rounded-2xl p-5"
                style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.textLow }}>
                    {activeMetricDef.label} Grafiği
                  </p>
                  <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: C.surfaceHigh }}>
                    {(['4w', '3m', 'all'] as Range[]).map(r => (
                      <button key={r} onClick={() => setRange(r)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all active:scale-95"
                        style={{
                          background: range === r ? C.surface : 'transparent',
                          color: range === r ? C.text : C.textMid,
                          boxShadow: range === r ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}>
                        {r === '4w' ? '4 Hafta' : r === '3m' ? '3 Ay' : 'Tümü'}
                      </button>
                    ))}
                  </div>
                </div>

                {chartData.length < 2 ? (
                  <p className="text-[13px] text-center py-6" style={{ color: C.textMid }}>
                    Bu aralıkta en az 2 ölçüm gerekiyor.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                      <XAxis dataKey="label"
                        tick={{ fontSize: 10, fill: C.textLow }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: C.textLow }} axisLine={false} tickLine={false}
                        width={36} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12, borderRadius: 12,
                          border: `1px solid ${C.border}`,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                          background: C.surface, color: C.text,
                        }}
                        formatter={(value) => [`${value} ${activeMetricDef.unit}`, activeMetricDef.label]}
                        labelStyle={{ fontWeight: 600, color: C.text }}
                      />
                      <Line type="monotone" dataKey="value" stroke={C.startText} strokeWidth={2}
                        dot={{ r: 3, fill: C.startText, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: C.startText }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            {/* Geçmiş listesi */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                style={{ color: C.textLow }}>
                Ölçüm Geçmişi
              </p>
              <div className="rounded-2xl overflow-hidden"
                style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                {measurements.map((m, i) => (
                  <div key={m.id}
                    className="flex items-center gap-4 px-5 py-4"
                    style={i > 0 ? { borderTop: `1px solid ${C.borderSub}` } : undefined}>
                    {/* Tarih */}
                    <div className="flex flex-col items-center w-9 flex-shrink-0">
                      <span className="text-[18px] font-extrabold leading-none tabular-nums"
                        style={{ color: C.text }}>
                        {m.date.split('-')[2]}
                      </span>
                      <span className="text-[10px] font-semibold uppercase mt-0.5"
                        style={{ color: C.textLow }}>
                        {new Date(m.date + 'T12:00:00').toLocaleDateString('tr-TR', { month: 'short' })}
                      </span>
                    </div>

                    <div className="w-px h-8 flex-shrink-0" style={{ background: C.borderSub }} />

                    {/* Değerler */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold" style={{ color: C.text }}>
                        {m.weight_kg} kg
                        {m.body_fat_pct != null && (
                          <span className="font-normal" style={{ color: C.textMid }}>
                            {' · '}%{m.body_fat_pct} yağ
                          </span>
                        )}
                      </p>
                      <p className="text-[12px] mt-0.5 truncate" style={{ color: C.textMid }}>
                        {[
                          m.waist_cm  != null ? `Bel ${m.waist_cm}`    : null,
                          m.chest_cm  != null ? `Göğüs ${m.chest_cm}`  : null,
                          m.arm_cm    != null ? `Kol ${m.arm_cm}`      : null,
                          m.hip_cm    != null ? `Kalça ${m.hip_cm}`    : null,
                        ].filter(Boolean).join(' · ') || 'Sadece kilo'}
                      </p>
                    </div>

                    {/* Sil */}
                    <button
                      onClick={() => setDeleteId(m.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg active:scale-95 transition-transform flex-shrink-0"
                      style={{ color: C.textLow }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Silme modalı */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
            onClick={e => e.stopPropagation()}>
            <p className="text-[17px] font-extrabold mb-1" style={{ color: C.text }}>Ölçümü Sil?</p>
            <p className="text-[13px] mb-5" style={{ color: C.textMid }}>Bu işlem geri alınamaz.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-semibold active:scale-95 transition-transform"
                style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.textMid }}>
                İptal
              </button>
              <button onClick={() => deleteMutation.mutate(deleteId)}
                className="flex-1 py-3.5 rounded-2xl text-[13px] font-bold active:scale-95 transition-transform"
                style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger }}>
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

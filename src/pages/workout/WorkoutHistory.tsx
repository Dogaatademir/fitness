import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Dumbbell } from 'lucide-react'
import { supabase, getUserId } from '../../lib/supabase'
import { QK } from '../../lib/queryClient'

const C = {
  bg:          '#f5f3ef',
  surface:     '#ffffff',
  surfaceHigh: '#f0ede8',
  border:      'rgba(0,0,0,0.07)',
  borderSub:   'rgba(0,0,0,0.04)',
  text:        '#1a1714',
  textMid:     'rgba(26,23,20,0.45)',
  textLow:     'rgba(26,23,20,0.28)',
  successText: '#166534',
  successBg:   'rgba(22,101,52,0.07)',
}

function formatDuration(startedAt: string, endedAt?: string): string {
  const mins = Math.round(
    (new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime()) / 60000
  )
  return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)} sa ${mins % 60} dk`
}

interface Session {
  id: string; date: string; started_at: string; ended_at?: string
  program_day_id: string; notes?: string
}

interface RowData {
  session: Session
  day_name: string
  completed_sets: number
  volume: number
}

function groupByMonth(rows: RowData[]): Record<string, RowData[]> {
  const groups: Record<string, RowData[]> = {}
  if (!Array.isArray(rows)) return groups
  for (const r of rows) {
    const key = r.session.date.slice(0, 7)
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }
  return groups
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  return new Date(+year, +month - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

async function fetchHistory(): Promise<RowData[]> {
  const userId = await getUserId()
  const { data } = await supabase.rpc('get_workout_history', { p_user_id: userId })
  if (!data) return []
  const parsed = typeof data === 'string' ? JSON.parse(data) : data
  return Array.isArray(parsed) ? parsed : []
}

export default function WorkoutHistory() {
  const navigate = useNavigate()

  const { data: rawRows, isPending } = useQuery({
    queryKey: QK.workoutHistory,
    queryFn: fetchHistory,
    staleTime: 1000 * 60 * 5,
  })

  const rows: RowData[] = Array.isArray(rawRows) ? rawRows : []
  const grouped = groupByMonth(rows)
  const monthKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <div className="px-5 pt-14 pb-5">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-[12px] font-semibold mb-4 active:opacity-60 transition-opacity"
          style={{ color: C.textLow }}>
          ← Geri
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
          Antrenman
        </p>
        <h1 className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: C.text }}>
          Geçmiş
        </h1>
        {rows.length > 0 && (
          <p className="text-[13px] mt-1.5 font-medium" style={{ color: C.textMid }}>
            {rows.length} antrenman
          </p>
        )}
      </div>

      <div className="px-4 pb-10">
        {isPending ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-t-stone-400 rounded-full animate-spin"
              style={{ borderColor: C.borderSub, borderTopColor: C.textLow }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: C.surfaceHigh }}>
              <Dumbbell size={24} style={{ color: C.textLow }} />
            </div>
            <p className="text-[15px] font-bold mb-1" style={{ color: C.text }}>Henüz antrenman yok</p>
            <p className="text-[13px] leading-relaxed" style={{ color: C.textMid }}>
              İlk antrenmanını tamamladığında burada görünecek.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {monthKeys.map(monthKey => (
              <div key={monthKey}>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                  style={{ color: C.textLow }}>
                  {monthLabel(monthKey)}
                </p>
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                  {grouped[monthKey].map((row, i) => {
                    const done = !!row.session.ended_at
                    return (
                      <button key={row.session.id}
                        onClick={() => navigate(`/workout/history/${row.session.id}`)}
                        className="w-full flex items-center gap-4 px-5 py-4 text-left active:bg-black/[0.02] transition-colors"
                        style={i > 0 ? { borderTop: `1px solid ${C.borderSub}` } : undefined}>
                        {/* Tarih kolonu */}
                        <div className="flex flex-col items-center justify-center w-9 flex-shrink-0">
                          <span className="text-[18px] font-extrabold leading-none tabular-nums" style={{ color: C.text }}>
                            {row.session.date.split('-')[2]}
                          </span>
                          <span className="text-[10px] font-semibold uppercase mt-0.5" style={{ color: C.textLow }}>
                            {new Date(row.session.date + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short' })}
                          </span>
                        </div>

                        {/* Dikey ayraç */}
                        <div className="w-px h-8 flex-shrink-0" style={{ background: C.borderSub }} />

                        {/* İçerik */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold truncate" style={{ color: C.text }}>
                            {row.day_name}
                          </p>
                          <p className="text-[12px] mt-0.5" style={{ color: C.textMid }}>
                            {done
                              ? formatDuration(row.session.started_at, row.session.ended_at)
                              : <span style={{ color: '#b45309' }}>Tamamlanmadı</span>}
                            {row.completed_sets > 0 && ` · ${row.completed_sets} set`}
                            {row.volume > 0 && ` · ${row.volume >= 1000 ? `${(row.volume / 1000).toFixed(1)}t` : `${Math.round(row.volume)}kg`}`}
                          </p>
                        </div>

                        {/* Durum + chevron */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {done && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: C.successBg, color: C.successText }}>
                              ✓
                            </span>
                          )}
                          <ChevronRight size={14} style={{ color: C.textLow }} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

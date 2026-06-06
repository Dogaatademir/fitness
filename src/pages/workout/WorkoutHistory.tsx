import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Dumbbell } from 'lucide-react'
import { supabase, getUserId } from '../../lib/supabase'
import { QK } from '../../lib/queryClient'

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
  // RETURNS json fonksiyonu bazen string olarak gelebilir
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
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6">
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wide mb-0.5">Antrenman</p>
        <h1 className="text-[32px] font-bold tracking-tight">Geçmiş</h1>
        {rows.length > 0 && <p className="text-sm text-stone-400 mt-1">{rows.length} antrenman</p>}
      </div>

      <div className="px-4 pb-10">
        {isPending ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-400 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
              <Dumbbell size={24} className="text-stone-300" />
            </div>
            <p className="text-base font-bold text-stone-700 mb-2">Henüz antrenman yok</p>
            <p className="text-sm text-stone-400 leading-relaxed">İlk antrenmanını tamamladığında burada görünecek.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {monthKeys.map(monthKey => (
              <div key={monthKey}>
                <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-3 px-1">
                  {monthLabel(monthKey)}
                </p>
                <div className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
                  {grouped[monthKey].map((row, i) => (
                    <button key={row.session.id}
                      onClick={() => navigate(`/workout/history/${row.session.id}`)}
                      className={`w-full flex items-center justify-between px-5 py-4 text-left active:bg-stone-50 transition-colors ${i > 0 ? 'border-t border-stone-100' : ''}`}>
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="flex flex-col items-center justify-center w-10 flex-shrink-0">
                          <span className="text-xl font-bold text-stone-900 leading-none">
                            {row.session.date.split('-')[2]}
                          </span>
                          <span className="text-[9px] text-stone-400 font-semibold uppercase tracking-wide mt-0.5">
                            {new Date(row.session.date + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short' })}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-stone-900 truncate">{row.day_name}</p>
                          <p className="text-xs text-stone-400 mt-0.5">
                            {row.session.ended_at
                              ? formatDuration(row.session.started_at, row.session.ended_at)
                              : 'Tamamlanmadı'}
                            {row.completed_sets > 0 && ` · ${row.completed_sets} set`}
                            {row.volume > 0 && ` · ${row.volume >= 1000 ? `${(row.volume / 1000).toFixed(1)}t` : `${Math.round(row.volume)}kg`}`}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-stone-300 flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

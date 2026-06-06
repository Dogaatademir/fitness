import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, CheckCircle2, Dumbbell, X } from 'lucide-react'
import { programDb } from '../../lib/db'
import { supabase, getUserId } from '../../lib/supabase'
import { QK } from '../../lib/queryClient'
import type { Program, ProgramDay } from '../../types'

type DayMeta = ProgramDay & { exercise_count: number }
type ProgramRow = Program & { days: DayMeta[] }

const WEEKDAY_SHORT = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct']

function WeekdayRow({ days, dark = false }: { days: DayMeta[]; dark?: boolean }) {
  const active = new Set(days.map(d => d.weekday))
  return (
    <div className="flex gap-2">
      {WEEKDAY_SHORT.map((label, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <div className={`w-5 h-1 rounded-full transition-colors ${
            active.has(i) ? dark ? 'bg-emerald-400' : 'bg-slate-700' : dark ? 'bg-slate-700' : 'bg-stone-200'
          }`} />
          <span className={`text-[9px] font-semibold ${
            active.has(i) ? dark ? 'text-slate-300' : 'text-stone-600' : dark ? 'text-slate-600' : 'text-stone-300'
          }`}>{label}</span>
        </div>
      ))}
    </div>
  )
}

const INPUT_CLS = 'w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-sm font-medium text-stone-800 outline-none focus:border-slate-400 focus:bg-white transition-all'

async function fetchPrograms(): Promise<ProgramRow[]> {
  const userId = await getUserId()
  const { data } = await supabase.rpc('get_programs_page', { p_user_id: userId })
  if (!data) return []
  const parsed = typeof data === 'string' ? JSON.parse(data) : data
  return Array.isArray(parsed) ? parsed : []
}

export default function Programs() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const { data: rawRows } = useQuery({
    queryKey: QK.programs,
    queryFn: fetchPrograms,
    staleTime: 1000 * 60 * 5,
  })
  const rows: ProgramRow[] = Array.isArray(rawRows) ? rawRows : []

  async function handleCreate() {
    if (!newName.trim()) return
    const p = await programDb.create({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      is_active: rows.length === 0,
    })
    qc.invalidateQueries({ queryKey: QK.programs })
    setShowModal(false)
    setNewName('')
    setNewDesc('')
    navigate(`/programs/${p.id}`)
  }

  function openModal() { setNewName(''); setNewDesc(''); setShowModal(true) }

  const active = rows.find(p => p.is_active)
  const inactive = rows.filter(p => !p.is_active)

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6 flex items-end justify-between">
        <div>
          <p className="text-xs text-stone-400 font-medium tracking-wide mb-1">Antrenman</p>
          <h1 className="text-[28px] font-bold tracking-tight leading-none">Programlar</h1>
        </div>
        <button onClick={openModal} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-700 text-white shadow-sm transition-all active:scale-95">
          <Plus size={18} />
        </button>
      </div>

      <div className="px-4 space-y-3 pb-10">
        {active && (
          <button onClick={() => navigate(`/programs/${active.id}`)}
            className="w-full rounded-2xl bg-slate-800 p-5 text-left transition-all active:scale-[0.98] shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Aktif Program</span>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {active.days.length} gün
                {active.days.reduce((s, d) => s + d.exercise_count, 0) > 0
                  ? ` · ${active.days.reduce((s, d) => s + d.exercise_count, 0)} egzersiz`
                  : ''}
              </span>
            </div>
            <p className="text-[22px] font-bold text-white leading-tight mb-1">{active.name}</p>
            {active.description && <p className="text-sm text-slate-400 mb-4">{active.description}</p>}
            {!active.description && <div className="mb-4" />}
            <WeekdayRow days={active.days} dark />
          </button>
        )}

        {inactive.map(p => (
          <button key={p.id} onClick={() => navigate(`/programs/${p.id}`)}
            className="w-full rounded-2xl bg-white border border-stone-100 p-5 text-left shadow-sm transition-all active:scale-[0.98] hover:shadow-md">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 pr-3 min-w-0">
                <p className="text-base font-bold text-stone-900 leading-tight truncate">{p.name}</p>
                {p.description && <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{p.description}</p>}
              </div>
              <span className="text-xs text-stone-400 font-medium flex-shrink-0 mt-0.5">{p.days.length} gün</span>
            </div>
            <WeekdayRow days={p.days} />
          </button>
        ))}

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
              <Dumbbell size={24} className="text-stone-300" />
            </div>
            <p className="text-sm font-semibold text-stone-500">Henüz program yok</p>
            <p className="text-xs text-stone-400 mt-1">İlk antrenman programını oluştur</p>
          </div>
        )}

        <button onClick={openModal}
          className="w-full py-4 border-2 border-dashed border-stone-200 rounded-2xl text-stone-400 font-semibold text-sm hover:border-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-2">
          <Plus size={16} />Yeni Program Oluştur
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-bold text-stone-900">Yeni Program</h3>
              <button onClick={() => setShowModal(false)} className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 text-stone-500">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1.5">Program Adı</label>
                <input type="text" autoFocus placeholder="PPL, Full Body…"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className={INPUT_CLS} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1.5">
                  Açıklama <span className="text-stone-300 normal-case font-normal">(isteğe bağlı)</span>
                </label>
                <input type="text" placeholder="Kısa bir açıklama…"
                  value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className={INPUT_CLS} />
              </div>
              <button onClick={handleCreate} disabled={!newName.trim()}
                className="w-full h-12 rounded-xl bg-slate-700 text-white font-bold text-sm tracking-wide shadow-sm transition-colors active:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed">
                Oluştur ve Düzenle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

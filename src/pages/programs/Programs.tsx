import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, Check, Dumbbell, X, ChevronRight } from 'lucide-react'
import { programDb } from '../../lib/db'
import { supabase, getUserId } from '../../lib/supabase'
import { QK } from '../../lib/queryClient'
import type { Program, ProgramDay } from '../../types'

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
  successText:  '#166534',
  successBg:    'rgba(22,101,52,0.07)',
  successBorder:'rgba(22,101,52,0.18)',
}

const DAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']

type DayMeta = ProgramDay & { exercise_count: number }
type ProgramRow = Program & { days: DayMeta[] }

async function fetchPrograms(): Promise<ProgramRow[]> {
  const userId = await getUserId()
  const { data } = await supabase.rpc('get_programs_page', { p_user_id: userId })
  if (!data) return []
  const parsed = typeof data === 'string' ? JSON.parse(data) : data
  return Array.isArray(parsed) ? parsed : []
}

function DayDots({ days }: { days: DayMeta[] }) {
  const active = new Set(days.map(d => d.weekday))
  return (
    <div className="flex gap-1.5">
      {DAYS.map((label, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="w-5 h-1 rounded-full transition-colors"
            style={{ background: active.has(i) ? C.text : C.borderSub }} />
          <span className="text-[9px] font-semibold"
            style={{ color: active.has(i) ? C.textMid : C.textLow }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

const INPUT = `w-full px-4 py-3 rounded-xl text-[14px] font-medium outline-none transition-all`

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

  const active = rows.find(p => p.is_active)
  const inactive = rows.filter(p => !p.is_active)

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div className="px-5 pt-14 pb-5 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
            Antrenman
          </p>
          <h1 className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: C.text }}>
            Programlar
          </h1>
        </div>
        <button
          onClick={() => { setNewName(''); setNewDesc(''); setShowModal(true) }}
          className="w-10 h-10 flex items-center justify-center rounded-xl active:scale-95 transition-transform"
          style={{ background: C.text, color: C.bg }}
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="px-4 space-y-3 pb-10">
        {/* Aktif program */}
        {active && (
          <button
            onClick={() => navigate(`/programs/${active.id}`)}
            className="w-full rounded-2xl overflow-hidden text-left active:scale-[0.985] transition-transform duration-150"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <div className="px-5 py-3 flex items-center justify-between"
              style={{ borderBottom: `1px solid ${C.borderSub}`, background: C.successBg }}>
              <div className="flex items-center gap-2">
                <Check size={12} style={{ color: C.successText }} strokeWidth={2.5} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.successText }}>
                  Aktif Program
                </span>
              </div>
              <span className="text-[11px] font-medium" style={{ color: C.successText }}>
                {active.days.length} gün · {active.days.reduce((s, d) => s + d.exercise_count, 0)} egzersiz
              </span>
            </div>
            <div className="px-5 py-5">
              <p className="text-[24px] font-extrabold leading-tight tracking-tight mb-1" style={{ color: C.text }}>
                {active.name}
              </p>
              {active.description && (
                <p className="text-[13px] mb-4" style={{ color: C.textMid }}>{active.description}</p>
              )}
              <div className={active.description ? '' : 'mt-4'}>
                <DayDots days={active.days} />
              </div>
            </div>
          </button>
        )}

        {/* Pasif programlar */}
        {inactive.map(p => (
          <button key={p.id}
            onClick={() => navigate(`/programs/${p.id}`)}
            className="w-full rounded-2xl p-5 text-left active:scale-[0.985] transition-transform duration-150"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 pr-3 min-w-0">
                <p className="text-[16px] font-bold truncate" style={{ color: C.text }}>{p.name}</p>
                {p.description && (
                  <p className="text-[12px] mt-0.5 line-clamp-1" style={{ color: C.textMid }}>
                    {p.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                <span className="text-[12px] font-medium" style={{ color: C.textLow }}>
                  {p.days.length} gün
                </span>
                <ChevronRight size={14} style={{ color: C.textLow }} />
              </div>
            </div>
            <DayDots days={p.days} />
          </button>
        ))}

        {/* Boş durum */}
        {rows.length === 0 && (
          <div className="rounded-2xl p-10 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: C.surfaceHigh }}>
              <Dumbbell size={24} style={{ color: C.textLow }} />
            </div>
            <p className="text-[15px] font-bold mb-1" style={{ color: C.text }}>Henüz program yok</p>
            <p className="text-[13px]" style={{ color: C.textMid }}>İlk antrenman programını oluştur</p>
          </div>
        )}

        {/* Yeni program butonu */}
        <button
          onClick={() => { setNewName(''); setNewDesc(''); setShowModal(true) }}
          className="w-full py-4 rounded-2xl text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.985] transition-transform"
          style={{ border: `1.5px dashed ${C.border}`, color: C.textLow }}
        >
          <Plus size={15} />
          Yeni Program Oluştur
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={() => setShowModal(false)}>
          <div className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-[17px] font-extrabold" style={{ color: C.text }}>Yeni Program</p>
              <button onClick={() => setShowModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full active:scale-95 transition-transform"
                style={{ background: C.surfaceHigh, color: C.textMid }}>
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5"
                  style={{ color: C.textLow }}>
                  Program Adı
                </label>
                <input
                  type="text" autoFocus placeholder="PPL, Full Body…"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className={INPUT}
                  style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.text }}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5"
                  style={{ color: C.textLow }}>
                  Açıklama <span className="normal-case font-normal" style={{ color: C.textLow }}>(isteğe bağlı)</span>
                </label>
                <input
                  type="text" placeholder="Kısa bir açıklama…"
                  value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className={INPUT}
                  style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.text }}
                />
              </div>
              <button
                onClick={handleCreate} disabled={!newName.trim()}
                className="w-full h-12 rounded-xl text-[14px] font-bold active:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-all mt-1"
                style={{ background: C.text, color: C.bg }}
              >
                Oluştur ve Düzenle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

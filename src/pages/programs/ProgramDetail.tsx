import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit2, X, Dumbbell, Activity, Timer, Check, ImagePlus, Search, BookOpen } from 'lucide-react'
import { programDb, programDayDb, exerciseDb, exerciseLibraryDb } from '../../lib/db'
import { supabase, getUserId } from '../../lib/supabase'
import { QK } from '../../lib/queryClient'
import type { Program, ProgramDay, Exercise, ExerciseLibraryItem } from '../../types'

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
  successBorder:'rgba(22,101,52,0.18)',
  danger:      '#b91c1c',
  dangerBg:    'rgba(185,28,28,0.07)',
  dangerBorder:'rgba(185,28,28,0.2)',
}

const MUSCLE_GROUPS = ['Göğüs', 'Sırt', 'Omuz', 'Biceps', 'Triceps', 'Karın', 'Bacak', 'Arka Bacak', 'Glute', 'Kardiyo', 'Diğer']
type ExType = 'strength' | 'cardio' | 'timed' | 'bodyweight'
type ExPhase = 'warmup' | 'main' | 'cooldown'

const PHASE_LABELS: Record<ExPhase, string> = {
  warmup:   '🔥 Isınma',
  main:     '💪 Antrenman',
  cooldown: '🧘 Soğuma',
}
type ModalState =
  | { type: 'addDay' }
  | { type: 'addExercise'; dayId: string }
  | { type: 'deleteDay'; dayId: string; dayName: string }
  | { type: 'deleteExercise'; exerciseId: string }
  | { type: 'deleteProgram' }

function exTarget(ex: Exercise): string {
  if (ex.type === 'cardio') return ex.target_duration_minutes ? `${ex.target_duration_minutes} dk` : 'Kardiyo'
  if (ex.type === 'timed') {
    const sets = ex.target_sets ? `${ex.target_sets}×` : ''
    const dur = ex.target_duration_seconds ? `${ex.target_duration_seconds}s` : ''
    const rest = ex.rest_seconds ? ` · ${ex.rest_seconds}sn` : ''
    return `${sets}${dur}${rest}` || 'Zamanlı'
  }
  const sets = ex.target_sets ?? '?'
  const reps = ex.target_reps_min
    ? ex.target_reps_max && ex.target_reps_max !== ex.target_reps_min
      ? `${ex.target_reps_min}-${ex.target_reps_max}`
      : `${ex.target_reps_min}`
    : '?'
  return `${sets}×${reps}${ex.rest_seconds ? ` · ${ex.rest_seconds}sn` : ''}`
}

const INPUT = `w-full px-3.5 py-3 rounded-xl text-[14px] font-medium outline-none transition-all`
const SELECT = `w-full px-3.5 py-3 rounded-xl text-[14px] font-medium outline-none transition-all appearance-none`

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5"
        style={{ color: C.textLow }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ModalShell({ children, onClose, zIndex = 'z-50' }: {
  children: React.ReactNode; onClose: () => void; zIndex?: string
}) {
  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4`}
      style={{ background: 'rgba(0,0,0,0.25)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl p-6 max-h-[85vh] overflow-y-auto"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <p className="text-[17px] font-extrabold" style={{ color: C.text }}>{title}</p>
      <button onClick={onClose}
        className="w-7 h-7 flex items-center justify-center rounded-full active:scale-95 transition-transform"
        style={{ background: C.surfaceHigh, color: C.textMid }}>
        <X size={14} />
      </button>
    </div>
  )
}

const defaultNew = () => ({
  name: '', type: 'strength' as ExType, phase: 'main' as ExPhase, muscle_group: 'Göğüs',
  target_sets: 3, target_reps_min: 8, target_reps_max: 12,
  rest_seconds: 90, target_duration_minutes: 15, target_duration_seconds: 40,
})

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [program, setProgram] = useState<Program | null>(null)
  const [days, setDays] = useState<ProgramDay[]>([])
  const [exercises, setExercises] = useState<Record<string, Exercise[]>>({})
  const [modal, setModal] = useState<ModalState | null>(null)
  const [editingEx, setEditingEx] = useState<Exercise | null>(null)
  const [dayNameInput, setDayNameInput] = useState('')
  const [newEx, setNewEx] = useState(defaultNew())
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Hareket havuzu
  const [library, setLibrary] = useState<ExerciseLibraryItem[]>([])
  const [libTab, setLibTab] = useState<'pick' | 'new'>('pick')
  const [libSearch, setLibSearch] = useState('')
  const [libMuscle, setLibMuscle] = useState('Tümü')
  const [libPhase, setLibPhase] = useState<ExPhase>('main')

  async function handleImageUpload(file: File) {
    if (!editingEx) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${editingEx.id}.${ext}`
      const { error } = await supabase.storage
        .from('exercise-images')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('exercise-images')
        .getPublicUrl(path)
      await exerciseDb.update(editingEx.id, { image_url: publicUrl })
      setEditingEx(v => v ? { ...v, image_url: publicUrl } : null)
      load()
    } finally {
      setUploading(false)
    }
  }

  async function handleImageRemove() {
    if (!editingEx?.image_url) return
    const path = editingEx.image_url.split('/').pop() ?? ''
    await supabase.storage.from('exercise-images').remove([path])
    await exerciseDb.update(editingEx.id, { image_url: null as unknown as undefined })
    setEditingEx(v => v ? { ...v, image_url: undefined } : null)
    load()
  }

  useEffect(() => { if (id) load() }, [id])
  useEffect(() => {
    exerciseLibraryDb.getAll().then(setLibrary)
  }, [])

  async function load() {
    if (!id) return
    const userId = await getUserId()
    const { data } = await supabase.rpc('get_program_detail', {
      p_user_id: userId, p_program_id: id,
    })
    if (!data) { navigate('/programs'); return }
    const r = data as { program: Program; days: (ProgramDay & { exercises: Exercise[] | null })[] }
    setProgram(r.program)
    setDays(r.days.map(d => ({ ...d, exercises: undefined })))
    const map: Record<string, Exercise[]> = {}
    for (const d of r.days) map[d.id] = d.exercises ?? []
    setExercises(map)
  }

  async function handleAddDay() {
    if (!program || !dayNameInput.trim()) return
    await programDayDb.create({
      program_id: program.id,
      day_name: dayNameInput.trim(),
      weekday: 0,
      order_index: days.length,
    })
    setModal(null)
    load()
  }

  async function handleDeleteDay(dayId: string) {
    const exs = await exerciseDb.getByDay(dayId)
    await Promise.all(exs.map(ex => exerciseDb.delete(ex.id)))
    await programDayDb.delete(dayId)
    setModal(null)
    load()
  }

  async function handleAddExercise(dayId: string) {
    if (!newEx.name.trim()) return
    await exerciseDb.create({
      program_day_id: dayId,
      name: newEx.name.trim(),
      muscle_group: newEx.muscle_group,
      type: newEx.type,
      phase: newEx.phase,
      target_sets: newEx.type !== 'cardio' ? newEx.target_sets : undefined,
      target_reps_min: newEx.type === 'strength' ? newEx.target_reps_min : undefined,
      target_reps_max: newEx.type === 'strength' ? newEx.target_reps_max : undefined,
      rest_seconds: newEx.type !== 'cardio' ? newEx.rest_seconds : undefined,
      target_duration_minutes: newEx.type === 'cardio' ? newEx.target_duration_minutes : undefined,
      target_duration_seconds: newEx.type === 'timed' ? newEx.target_duration_seconds : undefined,
      order_index: exercises[dayId]?.length || 0,
    })
    // Havuzda yoksa otomatik ekle
    const alreadyInLib = library.some(l => l.name.toLowerCase() === newEx.name.trim().toLowerCase())
    if (!alreadyInLib) {
      try {
        const added = await exerciseLibraryDb.create({
          name: newEx.name.trim(),
          muscle_group: newEx.muscle_group,
          type: newEx.type,
        })
        setLibrary(prev => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)))
      } catch { /* unique constraint — zaten var */ }
    }
    setModal(null)
    load()
  }

  async function handleAddFromLibrary(dayId: string, item: ExerciseLibraryItem) {
    await exerciseDb.create({
      program_day_id: dayId,
      name: item.name,
      muscle_group: item.muscle_group,
      type: item.type,
      phase: libPhase,
      target_sets: item.type !== 'cardio' ? 3 : undefined,
      target_reps_min: item.type === 'strength' ? 8 : undefined,
      target_reps_max: item.type === 'strength' ? 12 : undefined,
      rest_seconds: item.type !== 'cardio' ? 90 : undefined,
      order_index: exercises[dayId]?.length || 0,
    })
    setModal(null)
    load()
  }

  async function handleSaveExercise() {
    if (!editingEx) return
    await exerciseDb.update(editingEx.id, editingEx)
    setEditingEx(null)
    load()
  }

  async function handleDeleteExercise(exId: string) {
    await exerciseDb.delete(exId)
    setEditingEx(null)
    setModal(null)
    load()
  }

  async function handleDeleteProgram() {
    if (!program) return
    for (const day of days) {
      const exs = await exerciseDb.getByDay(day.id)
      await Promise.all(exs.map(ex => exerciseDb.delete(ex.id)))
      await programDayDb.delete(day.id)
    }
    await programDb.delete(program.id)
    qc.invalidateQueries({ queryKey: QK.programs })
    qc.invalidateQueries({ queryKey: QK.dashboard })
    navigate('/programs')
  }

  if (!program) return <div className="min-h-screen" style={{ background: C.bg }} />

  const totalExercises = Object.values(exercises).reduce((s, exs) => s + exs.length, 0)

  const inputStyle = { background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.text }

  return (
    <div className="min-h-screen pb-10" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-md px-5 pt-14 pb-4"
        style={{ background: 'rgba(245,243,239,0.95)', borderBottom: `1px solid ${C.borderSub}` }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate('/programs')}
            className="flex items-center gap-1 text-[12px] font-semibold active:opacity-60 transition-opacity"
            style={{ color: C.textLow }}>
            ← Geri
          </button>
          <div className="flex items-center gap-2">
            {!program.is_active && (
              <button
                onClick={async () => { await programDb.setActive(program.id); load() }}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 transition-transform"
                style={{ background: C.successBg, color: C.successText, border: `1px solid ${C.successBorder}` }}
              >
                Aktif Yap
              </button>
            )}
            <button
              onClick={() => setModal({ type: 'deleteProgram' })}
              className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-95 transition-transform"
              style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-extrabold tracking-tight leading-tight truncate" style={{ color: C.text }}>
            {program.name}
          </h1>
          {program.is_active && (
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wider uppercase flex-shrink-0"
              style={{ background: C.successBg, color: C.successText, border: `1px solid ${C.successBorder}` }}>
              Aktif
            </span>
          )}
        </div>
        <p className="text-[12px] mt-1" style={{ color: C.textMid }}>
          {program.description ? `${program.description} · ` : ''}
          {days.length} gün · {totalExercises} egzersiz
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* Boş durum */}
        {days.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: C.surfaceHigh }}>
              <Dumbbell size={22} style={{ color: C.textLow }} />
            </div>
            <p className="text-[14px] font-semibold" style={{ color: C.textMid }}>Henüz gün eklenmemiş</p>
            <p className="text-[12px] mt-1" style={{ color: C.textLow }}>
              Antrenman günlerini ekleyerek başla
            </p>
          </div>
        )}

        {/* Gün kartları */}
        {days.map((day, di) => {
          const dayExs = exercises[day.id] || []
          return (
            <div key={day.id} className="rounded-2xl overflow-hidden"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              {/* Gün başlığı */}
              <div className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${C.borderSub}`, background: C.surfaceHigh }}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5"
                    style={{ color: C.textLow }}>
                    {di + 1}. Gün
                  </p>
                  <p className="text-[15px] font-bold" style={{ color: C.text }}>{day.day_name}</p>
                </div>
                <button
                  onClick={() => setModal({ type: 'deleteDay', dayId: day.id, dayName: day.day_name })}
                  className="w-8 h-8 flex items-center justify-center rounded-lg active:scale-95 transition-transform"
                  style={{ color: C.textLow }}>
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Egzersizler */}
              {dayExs.length === 0 ? (
                <div className="px-5 py-4 text-center">
                  <p className="text-[12px]" style={{ color: C.textLow }}>Egzersiz eklenmemiş</p>
                </div>
              ) : (
                <div>
                  {(['warmup', 'main', 'cooldown'] as ExPhase[]).map(phase => {
                    const phaseExs = dayExs.filter(ex => (ex.phase ?? 'main') === phase)
                    if (phaseExs.length === 0) return null
                    return (
                      <div key={phase}>
                        {/* Phase başlığı */}
                        <div className="px-5 py-2" style={{ background: C.surfaceHigh, borderTop: `1px solid ${C.borderSub}` }}>
                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textLow }}>
                            {PHASE_LABELS[phase]}
                          </p>
                        </div>
                        {phaseExs.map((ex, ei) => (
                          <div key={ex.id}
                            className="px-5 py-3.5 flex items-center gap-3"
                            style={ei > 0 ? { borderTop: `1px solid ${C.borderSub}` } : undefined}>
                            <span className="w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                              style={{ background: C.surfaceHigh, color: C.textLow }}>
                              {ei + 1}
                            </span>
                            {ex.type === 'cardio'
                              ? <Activity size={13} style={{ color: '#b45309', flexShrink: 0 }} />
                              : ex.type === 'timed'
                                ? <Timer size={13} style={{ color: '#7c3aed', flexShrink: 0 }} />
                                : ex.type === 'bodyweight'
                                  ? <Activity size={13} style={{ color: '#0891b2', flexShrink: 0 }} />
                                  : <Dumbbell size={13} style={{ color: C.textLow, flexShrink: 0 }} />}
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-semibold truncate" style={{ color: C.text }}>
                                {ex.name}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                                  style={{ background: C.surfaceHigh, color: C.textLow }}>
                                  {ex.muscle_group}
                                </span>
                                <span className="text-[11px] font-medium" style={{ color: C.textMid }}>
                                  {exTarget(ex)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => setEditingEx(ex)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg active:scale-95 transition-transform flex-shrink-0"
                              style={{ color: C.textLow }}>
                              <Edit2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Egzersiz ekle */}
              <button
                onClick={() => { setNewEx(defaultNew()); setLibTab('pick'); setLibSearch(''); setLibMuscle('Tümü'); setLibPhase('main'); setModal({ type: 'addExercise', dayId: day.id }) }}
                className="w-full py-3.5 flex items-center justify-center gap-1.5 text-[12px] font-semibold active:bg-black/[0.02] transition-colors"
                style={{ borderTop: `1px solid ${C.borderSub}`, color: C.textLow }}
              >
                <Plus size={13} />
                Egzersiz Ekle
              </button>
            </div>
          )
        })}

        {/* Yeni gün ekle */}
        <button
          onClick={() => { setDayNameInput(''); setModal({ type: 'addDay' }) }}
          className="w-full py-4 rounded-2xl text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.985] transition-transform"
          style={{ border: `1.5px dashed ${C.border}`, color: C.textLow }}
        >
          <Plus size={15} />
          Yeni Gün Ekle
        </button>
      </div>

      {/* ── Gün Ekle Modal ── */}
      {modal?.type === 'addDay' && (
        <ModalShell onClose={() => setModal(null)}>
          <ModalHeader title="Yeni Gün Ekle" onClose={() => setModal(null)} />
          <div className="space-y-4">
            <Field label="Gün Adı">
              <input type="text" autoFocus placeholder="İtiş, Çekiş, Bacak…"
                value={dayNameInput}
                onChange={e => setDayNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddDay()}
                className={INPUT} style={inputStyle} />
            </Field>
            <button onClick={handleAddDay} disabled={!dayNameInput.trim()}
              className="w-full h-11 rounded-xl text-[14px] font-bold active:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              style={{ background: C.text, color: C.bg }}>
              Ekle
            </button>
          </div>
        </ModalShell>
      )}

      {/* ── Egzersiz Ekle Modal ── */}
      {modal?.type === 'addExercise' && (() => {
        const dayId = modal.dayId
        const libMuscles = ['Tümü', ...Array.from(new Set(library.map(l => l.muscle_group))).sort()]
        const filtered = library.filter(l => {
          const matchMuscle = libMuscle === 'Tümü' || l.muscle_group === libMuscle
          const matchSearch = libSearch === '' || l.name.toLowerCase().includes(libSearch.toLowerCase())
          return matchMuscle && matchSearch
        })
        return (
          <ModalShell onClose={() => setModal(null)}>
            <ModalHeader title="Egzersiz Ekle" onClose={() => setModal(null)} />

            {/* Sekme seçici */}
            <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: C.surfaceHigh }}>
              {(['pick', 'new'] as const).map(tab => (
                <button key={tab}
                  onClick={() => setLibTab(tab)}
                  className="flex-1 py-2 rounded-lg text-[12px] font-bold transition-all flex items-center justify-center gap-1.5"
                  style={{
                    background: libTab === tab ? C.surface : 'transparent',
                    color: libTab === tab ? C.text : C.textLow,
                    boxShadow: libTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {tab === 'pick' ? <><BookOpen size={12} />Havuzdan Seç</> : <><Plus size={12} />Yeni Hareket</>}
                </button>
              ))}
            </div>

            {/* Bölüm seçici (her iki sekmede ortak) */}
            <div className="mb-3">
              <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: C.textLow }}>
                Bölüm
              </label>
              <div className="flex gap-2">
                {(['warmup', 'main', 'cooldown'] as ExPhase[]).map(ph => (
                  <button key={ph}
                    onClick={() => { setLibPhase(ph); setNewEx(v => ({ ...v, phase: ph })) }}
                    className="flex-1 py-2 rounded-xl text-[11px] font-bold transition-all"
                    style={{
                      background: (libTab === 'pick' ? libPhase : newEx.phase) === ph ? C.text : C.surfaceHigh,
                      color: (libTab === 'pick' ? libPhase : newEx.phase) === ph ? C.bg : C.textMid,
                    }}
                  >
                    {ph === 'warmup' ? 'Isınma' : ph === 'main' ? 'Antrenman' : 'Soğuma'}
                  </button>
                ))}
              </div>
            </div>

            {/* HAVUZDAN SEÇ */}
            {libTab === 'pick' && (
              <div className="space-y-3">
                {/* Arama */}
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: C.surfaceHigh }}>
                  <Search size={14} style={{ color: C.textLow, flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Hareket ara…"
                    value={libSearch}
                    onChange={e => setLibSearch(e.target.value)}
                    className="flex-1 bg-transparent text-[13px] font-medium outline-none"
                    style={{ color: C.text }}
                    autoFocus
                  />
                  {libSearch && (
                    <button onClick={() => setLibSearch('')} style={{ color: C.textLow }}>
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Kas grubu filtre */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                  {libMuscles.map(mg => (
                    <button key={mg}
                      onClick={() => setLibMuscle(mg)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all"
                      style={{
                        background: libMuscle === mg ? C.text : C.surfaceHigh,
                        color: libMuscle === mg ? C.bg : C.textMid,
                      }}
                    >
                      {mg}
                    </button>
                  ))}
                </div>

                {/* Liste */}
                <div className="space-y-1 max-h-64 overflow-y-auto -mx-1 px-1">
                  {filtered.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-[13px] font-semibold mb-1" style={{ color: C.textMid }}>
                        {library.length === 0 ? 'Havuz boş' : 'Sonuç yok'}
                      </p>
                      <p className="text-[12px]" style={{ color: C.textLow }}>
                        {library.length === 0
                          ? '"Yeni Hareket" sekmesinden ekle'
                          : 'Farklı bir arama dene'}
                      </p>
                    </div>
                  ) : (
                    filtered.map(item => (
                      <button key={item.id}
                        onClick={() => handleAddFromLibrary(dayId, item)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left active:scale-[0.98] transition-transform"
                        style={{ background: C.surfaceHigh }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: C.surface }}>
                          {item.type === 'cardio'
                            ? <Activity size={14} style={{ color: '#b45309' }} />
                            : item.type === 'timed'
                              ? <Timer size={14} style={{ color: '#7c3aed' }} />
                              : item.type === 'bodyweight'
                                ? <Activity size={14} style={{ color: '#0891b2' }} />
                                : <Dumbbell size={14} style={{ color: C.textLow }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: C.text }}>{item.name}</p>
                          <p className="text-[11px]" style={{ color: C.textLow }}>{item.muscle_group}</p>
                        </div>
                        <Plus size={15} style={{ color: C.textLow, flexShrink: 0 }} />
                      </button>
                    ))
                  )}
                </div>

                <button
                  onClick={() => setLibTab('new')}
                  className="w-full py-3 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  style={{ border: `1.5px dashed ${C.border}`, color: C.textLow }}
                >
                  <Plus size={13} />
                  Havuzda yok, yeni ekle
                </button>
              </div>
            )}

            {/* YENİ HAREKET */}
            {libTab === 'new' && (
              <div className="space-y-3">
                <Field label="Egzersiz Adı">
                  <input type="text" autoFocus placeholder="Bench Press, Squat…"
                    value={newEx.name}
                    onChange={e => setNewEx(v => ({ ...v, name: e.target.value }))}
                    className={INPUT} style={inputStyle} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tür">
                    <select value={newEx.type}
                      onChange={e => setNewEx(v => ({ ...v, type: e.target.value as ExType }))}
                      className={SELECT} style={inputStyle}>
                      <option value="strength">Ağırlık</option>
                      <option value="bodyweight">Vücut Ağırlığı</option>
                      <option value="cardio">Kardiyo</option>
                      <option value="timed">Zamanlı</option>
                    </select>
                  </Field>
                  <Field label="Kas Grubu">
                    <select value={newEx.muscle_group}
                      onChange={e => setNewEx(v => ({ ...v, muscle_group: e.target.value }))}
                      className={SELECT} style={inputStyle}>
                      {MUSCLE_GROUPS.map(mg => <option key={mg} value={mg}>{mg}</option>)}
                    </select>
                  </Field>
                </div>
                {newEx.type === 'strength' && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Set">
                        <input type="number" min={1} value={newEx.target_sets}
                          onChange={e => setNewEx(v => ({ ...v, target_sets: +e.target.value }))}
                          className={INPUT} style={inputStyle} />
                      </Field>
                      <Field label="Min Tek.">
                        <input type="number" min={1} value={newEx.target_reps_min}
                          onChange={e => setNewEx(v => ({ ...v, target_reps_min: +e.target.value }))}
                          className={INPUT} style={inputStyle} />
                      </Field>
                      <Field label="Max Tek.">
                        <input type="number" min={1} value={newEx.target_reps_max}
                          onChange={e => setNewEx(v => ({ ...v, target_reps_max: +e.target.value }))}
                          className={INPUT} style={inputStyle} />
                      </Field>
                    </div>
                    <Field label="Dinlenme (sn)">
                      <input type="number" min={0} value={newEx.rest_seconds}
                        onChange={e => setNewEx(v => ({ ...v, rest_seconds: +e.target.value }))}
                        className={INPUT} style={inputStyle} />
                    </Field>
                  </>
                )}
                {newEx.type === 'cardio' && (
                  <Field label="Süre (dakika)">
                    <input type="number" min={1} value={newEx.target_duration_minutes}
                      onChange={e => setNewEx(v => ({ ...v, target_duration_minutes: +e.target.value }))}
                      className={INPUT} style={inputStyle} />
                  </Field>
                )}
                {newEx.type === 'timed' && (
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Set">
                      <input type="number" min={1} value={newEx.target_sets}
                        onChange={e => setNewEx(v => ({ ...v, target_sets: +e.target.value }))}
                        className={INPUT} style={inputStyle} />
                    </Field>
                    <Field label="Süre (sn)">
                      <input type="number" min={1} value={newEx.target_duration_seconds}
                        onChange={e => setNewEx(v => ({ ...v, target_duration_seconds: +e.target.value }))}
                        className={INPUT} style={inputStyle} />
                    </Field>
                    <Field label="Dinlenme (sn)">
                      <input type="number" min={0} value={newEx.rest_seconds}
                        onChange={e => setNewEx(v => ({ ...v, rest_seconds: +e.target.value }))}
                        className={INPUT} style={inputStyle} />
                    </Field>
                  </div>
                )}
                <p className="text-[11px]" style={{ color: C.textLow }}>
                  Bu hareket otomatik olarak havuzuna da eklenecek.
                </p>
                <button
                  onClick={() => handleAddExercise(dayId)}
                  disabled={!newEx.name.trim()}
                  className="w-full h-11 rounded-xl text-[14px] font-bold active:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  style={{ background: C.text, color: C.bg }}>
                  Ekle
                </button>
              </div>
            )}
          </ModalShell>
        )
      })()}

      {/* ── Egzersiz Düzenle Modal ── */}
      {editingEx && (
        <ModalShell onClose={() => setEditingEx(null)}>
          <ModalHeader title="Egzersizi Düzenle" onClose={() => setEditingEx(null)} />
          <div className="space-y-3">
            <Field label="Egzersiz Adı">
              <input type="text" value={editingEx.name}
                onChange={e => setEditingEx(v => v ? { ...v, name: e.target.value } : null)}
                className={INPUT} style={inputStyle} />
            </Field>
            <Field label="Bölüm">
              <select value={editingEx.phase ?? 'main'}
                onChange={e => setEditingEx(v => v ? { ...v, phase: e.target.value as ExPhase } : null)}
                className={SELECT} style={inputStyle}>
                <option value="warmup">Isınma</option>
                <option value="main">Antrenman</option>
                <option value="cooldown">Soğuma</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tür">
                <select value={editingEx.type || 'strength'}
                  onChange={e => setEditingEx(v => v ? { ...v, type: e.target.value as ExType } : null)}
                  className={SELECT} style={inputStyle}>
                  <option value="strength">Ağırlık</option>
                  <option value="bodyweight">Vücut Ağırlığı</option>
                  <option value="cardio">Kardiyo</option>
                  <option value="timed">Zamanlı</option>
                </select>
              </Field>
              <Field label="Kas Grubu">
                <select value={editingEx.muscle_group}
                  onChange={e => setEditingEx(v => v ? { ...v, muscle_group: e.target.value } : null)}
                  className={SELECT} style={inputStyle}>
                  {MUSCLE_GROUPS.map(mg => <option key={mg} value={mg}>{mg}</option>)}
                </select>
              </Field>
            </div>
            {(editingEx.type ?? 'strength') === 'strength' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Set">
                    <input type="number" min={1} value={editingEx.target_sets || ''}
                      onChange={e => setEditingEx(v => v ? { ...v, target_sets: +e.target.value } : null)}
                      className={INPUT} style={inputStyle} />
                  </Field>
                  <Field label="Min Tek.">
                    <input type="number" min={1} value={editingEx.target_reps_min || ''}
                      onChange={e => setEditingEx(v => v ? { ...v, target_reps_min: +e.target.value } : null)}
                      className={INPUT} style={inputStyle} />
                  </Field>
                  <Field label="Max Tek.">
                    <input type="number" min={1} value={editingEx.target_reps_max || ''}
                      onChange={e => setEditingEx(v => v ? { ...v, target_reps_max: +e.target.value } : null)}
                      className={INPUT} style={inputStyle} />
                  </Field>
                </div>
                <Field label="Dinlenme (sn)">
                  <input type="number" min={0} value={editingEx.rest_seconds || ''}
                    onChange={e => setEditingEx(v => v ? { ...v, rest_seconds: +e.target.value } : null)}
                    className={INPUT} style={inputStyle} />
                </Field>
              </>
            )}
            {editingEx.type === 'cardio' && (
              <Field label="Süre (dakika)">
                <input type="number" min={1} value={editingEx.target_duration_minutes || ''}
                  onChange={e => setEditingEx(v => v ? { ...v, target_duration_minutes: +e.target.value } : null)}
                  className={INPUT} style={inputStyle} />
              </Field>
            )}
            {editingEx.type === 'timed' && (
              <div className="grid grid-cols-3 gap-2">
                <Field label="Set">
                  <input type="number" min={1} value={editingEx.target_sets || ''}
                    onChange={e => setEditingEx(v => v ? { ...v, target_sets: +e.target.value } : null)}
                    className={INPUT} style={inputStyle} />
                </Field>
                <Field label="Süre (sn)">
                  <input type="number" min={1} value={editingEx.target_duration_seconds || ''}
                    onChange={e => setEditingEx(v => v ? { ...v, target_duration_seconds: +e.target.value } : null)}
                    className={INPUT} style={inputStyle} />
                </Field>
                <Field label="Dinlenme (sn)">
                  <input type="number" min={0} value={editingEx.rest_seconds || ''}
                    onChange={e => setEditingEx(v => v ? { ...v, rest_seconds: +e.target.value } : null)}
                    className={INPUT} style={inputStyle} />
                </Field>
              </div>
            )}
            {/* Görsel */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: C.textLow }}>
                Görsel
              </label>
              {editingEx.image_url ? (
                <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img src={editingEx.image_url} alt={editingEx.name} className="w-full h-full object-cover" />
                  <button
                    onClick={handleImageRemove}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.5)' }}
                  >
                    <X size={13} color="white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-semibold transition-opacity disabled:opacity-40"
                  style={{ border: `1.5px dashed ${C.border}`, color: C.textLow, background: C.surfaceHigh }}
                >
                  <ImagePlus size={15} />
                  {uploading ? 'Yükleniyor…' : 'Görsel Ekle'}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setModal({ type: 'deleteExercise', exerciseId: editingEx.id })}
                className="w-11 h-11 flex items-center justify-center rounded-xl active:scale-95 transition-transform flex-shrink-0"
                style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger }}>
                <Trash2 size={15} />
              </button>
              <button onClick={handleSaveExercise}
                className="flex-1 h-11 rounded-xl text-[14px] font-bold active:opacity-80 transition-all flex items-center justify-center gap-2"
                style={{ background: C.text, color: C.bg }}>
                <Check size={15} strokeWidth={2.5} />
                Kaydet
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ── Gün Sil ── */}
      {modal?.type === 'deleteDay' && (
        <ModalShell onClose={() => setModal(null)}>
          <p className="text-[17px] font-extrabold mb-1" style={{ color: C.text }}>Günü Sil</p>
          <p className="text-[13px] mb-5 leading-relaxed" style={{ color: C.textMid }}>
            <span className="font-semibold" style={{ color: C.text }}>"{modal.dayName}"</span> günü ve tüm egzersizleri kalıcı olarak silinecek.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setModal(null)}
              className="flex-1 h-11 rounded-xl text-[13px] font-semibold active:scale-95 transition-transform"
              style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.textMid }}>
              Vazgeç
            </button>
            <button onClick={() => handleDeleteDay(modal.dayId)}
              className="flex-1 h-11 rounded-xl text-[13px] font-bold active:scale-95 transition-transform"
              style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger }}>
              Sil
            </button>
          </div>
        </ModalShell>
      )}

      {/* ── Egzersiz Sil ── */}
      {modal?.type === 'deleteExercise' && (
        <ModalShell onClose={() => setModal(null)} zIndex="z-[60]">
          <p className="text-[17px] font-extrabold mb-1" style={{ color: C.text }}>Egzersizi Sil</p>
          <p className="text-[13px] mb-5" style={{ color: C.textMid }}>Bu egzersiz kalıcı olarak silinecek.</p>
          <div className="flex gap-3">
            <button onClick={() => setModal(null)}
              className="flex-1 h-11 rounded-xl text-[13px] font-semibold active:scale-95 transition-transform"
              style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.textMid }}>
              Vazgeç
            </button>
            <button onClick={() => handleDeleteExercise(modal.exerciseId)}
              className="flex-1 h-11 rounded-xl text-[13px] font-bold active:scale-95 transition-transform"
              style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger }}>
              Sil
            </button>
          </div>
        </ModalShell>
      )}

      {/* ── Program Sil ── */}
      {modal?.type === 'deleteProgram' && (
        <ModalShell onClose={() => setModal(null)}>
          <p className="text-[17px] font-extrabold mb-1" style={{ color: C.text }}>Programı Sil</p>
          <p className="text-[13px] mb-5 leading-relaxed" style={{ color: C.textMid }}>
            <span className="font-semibold" style={{ color: C.text }}>"{program.name}"</span> ve tüm günler kalıcı olarak silinecek.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setModal(null)}
              className="flex-1 h-11 rounded-xl text-[13px] font-semibold active:scale-95 transition-transform"
              style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.textMid }}>
              Vazgeç
            </button>
            <button onClick={handleDeleteProgram}
              className="flex-1 h-11 rounded-xl text-[13px] font-bold active:scale-95 transition-transform"
              style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger }}>
              Sil
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

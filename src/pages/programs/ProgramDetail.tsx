import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Edit2, X, Dumbbell, Activity, Timer } from 'lucide-react'
import { programDb, programDayDb, exerciseDb } from '../../lib/db'
import { supabase, getUserId } from '../../lib/supabase'
import type { Program, ProgramDay, Exercise } from '../../types'


const MUSCLE_GROUPS = ['Göğüs', 'Sırt', 'Omuz', 'Biceps', 'Triceps', 'Karın', 'Bacak', 'Arka Bacak', 'Kardiyo', 'Diğer']
type ExType = 'strength' | 'cardio' | 'timed'

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

const INPUT = 'w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm font-medium text-stone-800 outline-none focus:border-slate-400 focus:bg-white transition-all'
const BTN_PRIMARY = 'w-full h-11 rounded-xl bg-slate-700 text-white font-bold text-sm tracking-wide transition-colors active:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed'
const BTN_GHOST = 'flex-1 h-11 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm transition-colors active:bg-stone-50'
const BTN_DANGER = 'flex-1 h-11 rounded-xl bg-red-500 text-white font-bold text-sm transition-colors active:bg-red-600'

function Modal({ children, zIndex = 'z-50' }: { children: React.ReactNode; onClose: () => void; zIndex?: string }) {
  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4`}>
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl">{children}</div>
    </div>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex justify-between items-center mb-5">
      <h3 className="text-base font-bold text-stone-900">{title}</h3>
      <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 text-stone-500">
        <X size={14} />
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const defaultNew = () => ({
  name: '', type: 'strength' as ExType, muscle_group: 'Göğüs',
  target_sets: 3, target_reps_min: 8, target_reps_max: 12,
  rest_seconds: 90, target_duration_minutes: 15, target_duration_seconds: 40,
})

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [program, setProgram] = useState<Program | null>(null)
  const [days, setDays] = useState<ProgramDay[]>([])
  const [exercises, setExercises] = useState<Record<string, Exercise[]>>({})
  const [modal, setModal] = useState<ModalState | null>(null)
  const [editingEx, setEditingEx] = useState<Exercise | null>(null)
  const [dayNameInput, setDayNameInput] = useState('')
  const [newEx, setNewEx] = useState(defaultNew())

  useEffect(() => { if (id) load() }, [id])

  async function load() {
    if (!id) return
    const userId = await getUserId()
    const { data } = await supabase.rpc('get_program_detail', {
      p_user_id: userId,
      p_program_id: id,
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
      target_sets: newEx.type !== 'cardio' ? newEx.target_sets : undefined,
      target_reps_min: newEx.type === 'strength' ? newEx.target_reps_min : undefined,
      target_reps_max: newEx.type === 'strength' ? newEx.target_reps_max : undefined,
      rest_seconds: newEx.type !== 'cardio' ? newEx.rest_seconds : undefined,
      target_duration_minutes: newEx.type === 'cardio' ? newEx.target_duration_minutes : undefined,
      target_duration_seconds: newEx.type === 'timed' ? newEx.target_duration_seconds : undefined,
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
    navigate('/programs')
  }

  if (!program) return <div className="min-h-screen bg-[#f7f5f2]" />

  const totalExercises = Object.values(exercises).reduce((s, exs) => s + exs.length, 0)

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900 pb-10">
      <div className="sticky top-0 z-10 bg-[#f7f5f2]/95 backdrop-blur-md border-b border-stone-100/80 px-5 pt-14 pb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate('/programs')} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-stone-100 shadow-sm text-stone-500">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            {!program.is_active && (
              <button
                onClick={async () => { await programDb.setActive(program.id); load() }}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100"
              >
                Aktif Yap
              </button>
            )}
            <button onClick={() => setModal({ type: 'deleteProgram' })} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-red-100 text-red-400 shadow-sm">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-bold tracking-tight text-stone-900 leading-tight truncate">{program.name}</h1>
          {program.is_active && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[9px] font-bold tracking-wider uppercase flex-shrink-0">Aktif</span>
          )}
        </div>
        <p className="text-xs text-stone-400 mt-1 font-medium">
          {program.description ? `${program.description} · ` : ''}
          {days.length} gün · {totalExercises} egzersiz
        </p>
      </div>

      <div className="px-4 mt-5 space-y-4">
        {days.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
              <Dumbbell size={24} className="text-stone-300" />
            </div>
            <p className="text-sm font-semibold text-stone-500">Henüz gün eklenmemiş</p>
            <p className="text-xs text-stone-400 mt-1">Antrenman günlerini ekleyerek başla</p>
          </div>
        )}

        {days.map((day, di) => {
          const dayExs = exercises[day.id] || []
          return (
            <div key={day.id} className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3.5 flex items-center justify-between bg-stone-50/60 border-b border-stone-100">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-stone-400">{di + 1}. Gün</span>
                  </div>
                  <h3 className="text-[15px] font-bold text-stone-900">{day.day_name}</h3>
                </div>
                <button onClick={() => setModal({ type: 'deleteDay', dayId: day.id, dayName: day.day_name })} className="p-2 text-stone-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-50">
                  <Trash2 size={14} />
                </button>
              </div>

              {dayExs.length === 0 ? (
                <div className="px-4 py-5 text-center"><p className="text-xs text-stone-300 italic">Egzersiz eklenmemiş</p></div>
              ) : (
                <div className="divide-y divide-stone-50">
                  {dayExs.map((ex, ei) => (
                    <div key={ex.id} className="px-4 py-3.5 flex items-center gap-3 hover:bg-stone-50 transition-colors">
                      <span className="w-5 h-5 rounded-md bg-stone-100 text-stone-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{ei + 1}</span>
                      {ex.type === 'cardio' ? <Activity size={13} className="text-amber-400 flex-shrink-0" />
                        : ex.type === 'timed' ? <Timer size={13} className="text-violet-400 flex-shrink-0" />
                        : <Dumbbell size={13} className="text-slate-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-stone-800 truncate">{ex.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] bg-stone-100 text-stone-400 px-1.5 py-0.5 rounded font-bold">{ex.muscle_group}</span>
                          <span className="text-[11px] text-stone-400 font-medium">{exTarget(ex)}</span>
                        </div>
                      </div>
                      <button onClick={() => setEditingEx(ex)} className="p-1.5 text-stone-300 hover:text-slate-600 transition-colors rounded-lg hover:bg-stone-100 flex-shrink-0">
                        <Edit2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => { setNewEx(defaultNew()); setModal({ type: 'addExercise', dayId: day.id }) }}
                className="w-full py-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-slate-600 hover:bg-stone-50 transition-colors border-t border-stone-100"
              >
                <Plus size={13} />Egzersiz Ekle
              </button>
            </div>
          )
        })}

        <button
          onClick={() => { setDayNameInput(''); setModal({ type: 'addDay' }) }}
          className="w-full py-4 border-2 border-dashed border-stone-200 rounded-2xl text-stone-400 font-semibold text-sm hover:border-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} />Yeni Gün Ekle
        </button>
      </div>

      {/* Modals */}
      {modal?.type === 'addDay' && (
        <Modal onClose={() => setModal(null)}>
          <ModalHeader title="Yeni Gün Ekle" onClose={() => setModal(null)} />
          <div className="space-y-4">
            <Field label="Gün Adı">
              <input type="text" autoFocus placeholder="İtiş, Çekiş, Bacak…" value={dayNameInput}
                onChange={e => setDayNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddDay()} className={INPUT} />
            </Field>
            <button onClick={handleAddDay} disabled={!dayNameInput.trim()} className={BTN_PRIMARY}>Ekle</button>
          </div>
        </Modal>
      )}

      {modal?.type === 'addExercise' && (
        <Modal onClose={() => setModal(null)}>
          <ModalHeader title="Egzersiz Ekle" onClose={() => setModal(null)} />
          <div className="space-y-4">
            <Field label="Egzersiz Adı">
              <input type="text" autoFocus placeholder="Bench Press, Squat…" value={newEx.name}
                onChange={e => setNewEx(v => ({ ...v, name: e.target.value }))} className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tür">
                <select value={newEx.type} onChange={e => setNewEx(v => ({ ...v, type: e.target.value as ExType }))} className={INPUT}>
                  <option value="strength">Ağırlık</option>
                  <option value="cardio">Kardiyo</option>
                  <option value="timed">Zamanlı</option>
                </select>
              </Field>
              <Field label="Kas Grubu">
                <select value={newEx.muscle_group} onChange={e => setNewEx(v => ({ ...v, muscle_group: e.target.value }))} className={INPUT}>
                  {MUSCLE_GROUPS.map(mg => <option key={mg} value={mg}>{mg}</option>)}
                </select>
              </Field>
            </div>
            {newEx.type === 'strength' && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Set"><input type="number" min={1} value={newEx.target_sets} onChange={e => setNewEx(v => ({ ...v, target_sets: +e.target.value }))} className={INPUT} /></Field>
                  <Field label="Min Tek."><input type="number" min={1} value={newEx.target_reps_min} onChange={e => setNewEx(v => ({ ...v, target_reps_min: +e.target.value }))} className={INPUT} /></Field>
                  <Field label="Max Tek."><input type="number" min={1} value={newEx.target_reps_max} onChange={e => setNewEx(v => ({ ...v, target_reps_max: +e.target.value }))} className={INPUT} /></Field>
                </div>
                <Field label="Dinlenme (sn)"><input type="number" min={0} value={newEx.rest_seconds} onChange={e => setNewEx(v => ({ ...v, rest_seconds: +e.target.value }))} className={INPUT} /></Field>
              </>
            )}
            {newEx.type === 'cardio' && (
              <Field label="Süre (dakika)"><input type="number" min={1} value={newEx.target_duration_minutes} onChange={e => setNewEx(v => ({ ...v, target_duration_minutes: +e.target.value }))} className={INPUT} /></Field>
            )}
            {newEx.type === 'timed' && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Set"><input type="number" min={1} value={newEx.target_sets} onChange={e => setNewEx(v => ({ ...v, target_sets: +e.target.value }))} className={INPUT} /></Field>
                <Field label="Süre (sn)"><input type="number" min={1} value={newEx.target_duration_seconds} onChange={e => setNewEx(v => ({ ...v, target_duration_seconds: +e.target.value }))} className={INPUT} /></Field>
                <Field label="Dinlenme (sn)"><input type="number" min={0} value={newEx.rest_seconds} onChange={e => setNewEx(v => ({ ...v, rest_seconds: +e.target.value }))} className={INPUT} /></Field>
              </div>
            )}
            <button onClick={() => { if (modal.type === 'addExercise') handleAddExercise(modal.dayId) }} disabled={!newEx.name.trim()} className={BTN_PRIMARY}>Ekle</button>
          </div>
        </Modal>
      )}

      {editingEx && (
        <Modal onClose={() => setEditingEx(null)}>
          <ModalHeader title="Egzersizi Düzenle" onClose={() => setEditingEx(null)} />
          <div className="space-y-4">
            <Field label="Egzersiz Adı">
              <input type="text" value={editingEx.name} onChange={e => setEditingEx(v => v ? { ...v, name: e.target.value } : null)} className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tür">
                <select value={editingEx.type || 'strength'} onChange={e => setEditingEx(v => v ? { ...v, type: e.target.value as ExType } : null)} className={INPUT}>
                  <option value="strength">Ağırlık</option>
                  <option value="cardio">Kardiyo</option>
                  <option value="timed">Zamanlı</option>
                </select>
              </Field>
              <Field label="Kas Grubu">
                <select value={editingEx.muscle_group} onChange={e => setEditingEx(v => v ? { ...v, muscle_group: e.target.value } : null)} className={INPUT}>
                  {MUSCLE_GROUPS.map(mg => <option key={mg} value={mg}>{mg}</option>)}
                </select>
              </Field>
            </div>
            {(editingEx.type ?? 'strength') === 'strength' && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Set"><input type="number" min={1} value={editingEx.target_sets || ''} onChange={e => setEditingEx(v => v ? { ...v, target_sets: +e.target.value } : null)} className={INPUT} /></Field>
                  <Field label="Min Tek."><input type="number" min={1} value={editingEx.target_reps_min || ''} onChange={e => setEditingEx(v => v ? { ...v, target_reps_min: +e.target.value } : null)} className={INPUT} /></Field>
                  <Field label="Max Tek."><input type="number" min={1} value={editingEx.target_reps_max || ''} onChange={e => setEditingEx(v => v ? { ...v, target_reps_max: +e.target.value } : null)} className={INPUT} /></Field>
                </div>
                <Field label="Dinlenme (sn)"><input type="number" min={0} value={editingEx.rest_seconds || ''} onChange={e => setEditingEx(v => v ? { ...v, rest_seconds: +e.target.value } : null)} className={INPUT} /></Field>
              </>
            )}
            {editingEx.type === 'cardio' && (
              <Field label="Süre (dakika)"><input type="number" min={1} value={editingEx.target_duration_minutes || ''} onChange={e => setEditingEx(v => v ? { ...v, target_duration_minutes: +e.target.value } : null)} className={INPUT} /></Field>
            )}
            {editingEx.type === 'timed' && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Set"><input type="number" min={1} value={editingEx.target_sets || ''} onChange={e => setEditingEx(v => v ? { ...v, target_sets: +e.target.value } : null)} className={INPUT} /></Field>
                <Field label="Süre (sn)"><input type="number" min={1} value={editingEx.target_duration_seconds || ''} onChange={e => setEditingEx(v => v ? { ...v, target_duration_seconds: +e.target.value } : null)} className={INPUT} /></Field>
                <Field label="Dinlenme (sn)"><input type="number" min={0} value={editingEx.rest_seconds || ''} onChange={e => setEditingEx(v => v ? { ...v, rest_seconds: +e.target.value } : null)} className={INPUT} /></Field>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setModal({ type: 'deleteExercise', exerciseId: editingEx.id })} className="w-11 h-11 flex items-center justify-center rounded-xl border border-red-100 text-red-400 bg-white flex-shrink-0">
                <Trash2 size={15} />
              </button>
              <button onClick={handleSaveExercise} className={`${BTN_PRIMARY} flex-1`}>Kaydet</button>
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === 'deleteDay' && (
        <Modal onClose={() => setModal(null)}>
          <h3 className="text-base font-bold text-stone-900 mb-2">Günü Sil</h3>
          <p className="text-sm text-stone-500 mb-5 leading-relaxed">
            <span className="font-semibold text-stone-700">"{modal.dayName}"</span> günü ve tüm egzersizleri kalıcı olarak silinecek.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setModal(null)} className={BTN_GHOST}>Vazgeç</button>
            <button onClick={() => handleDeleteDay(modal.dayId)} className={BTN_DANGER}>Sil</button>
          </div>
        </Modal>
      )}

      {modal?.type === 'deleteExercise' && (
        <Modal onClose={() => setModal(null)} zIndex="z-[60]">
          <h3 className="text-base font-bold text-stone-900 mb-2">Egzersizi Sil</h3>
          <p className="text-sm text-stone-500 mb-5">Bu egzersiz kalıcı olarak silinecek.</p>
          <div className="flex gap-3">
            <button onClick={() => setModal(null)} className={BTN_GHOST}>Vazgeç</button>
            <button onClick={() => handleDeleteExercise(modal.exerciseId)} className={BTN_DANGER}>Sil</button>
          </div>
        </Modal>
      )}

      {modal?.type === 'deleteProgram' && (
        <Modal onClose={() => setModal(null)}>
          <h3 className="text-base font-bold text-stone-900 mb-2">Programı Sil</h3>
          <p className="text-sm text-stone-500 mb-5 leading-relaxed">
            <span className="font-semibold text-stone-700">"{program.name}"</span> ve tüm günler kalıcı olarak silinecek.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setModal(null)} className={BTN_GHOST}>Vazgeç</button>
            <button onClick={handleDeleteProgram} className={BTN_DANGER}>Sil</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { bodyDb } from '../../lib/db'
import { today } from '../../lib/storage'
import { QK } from '../../lib/queryClient'

interface FormState {
  date: string
  weight_kg: string
  waist_cm: string
  chest_cm: string
  arm_cm: string
  hip_cm: string
  body_fat_pct: string
}

function Field({
  label, unit, value, onChange, placeholder,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-stone-100 last:border-0">
      <div>
        <p className="text-sm font-semibold text-stone-800">{label}</p>
        <p className="text-xs text-stone-400 mt-0.5">{unit}</p>
      </div>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        className="w-24 text-right text-base font-semibold text-stone-900 bg-transparent outline-none border-b border-stone-200 focus:border-slate-400 pb-0.5 tabular-nums placeholder:text-stone-300"
      />
    </div>
  )
}

export default function BodyNew() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>({
    date: today(),
    weight_kg: '',
    waist_cm: '',
    chest_cm: '',
    arm_cm: '',
    hip_cm: '',
    body_fat_pct: '',
  })
  const [error, setError] = useState('')

  function set(field: keyof FormState) {
    return (v: string) => setForm(f => ({ ...f, [field]: v }))
  }

  async function handleSave() {
    if (!form.weight_kg) {
      setError('Kilo alanı zorunlu.')
      return
    }
    setError('')
    await bodyDb.create({
      date: form.date,
      weight_kg: parseFloat(form.weight_kg),
      waist_cm: form.waist_cm ? parseFloat(form.waist_cm) : undefined,
      chest_cm: form.chest_cm ? parseFloat(form.chest_cm) : undefined,
      arm_cm: form.arm_cm ? parseFloat(form.arm_cm) : undefined,
      hip_cm: form.hip_cm ? parseFloat(form.hip_cm) : undefined,
      body_fat_pct: form.body_fat_pct ? parseFloat(form.body_fat_pct) : undefined,
    })
    qc.invalidateQueries({ queryKey: QK.body })
    qc.invalidateQueries({ queryKey: QK.dashboard })
    navigate('/body', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6 flex items-start justify-between">
        <div>
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wide mb-0.5">Vücut Takibi</p>
          <h1 className="text-[28px] font-bold tracking-tight">Yeni Ölçüm</h1>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold active:bg-slate-700 transition-colors shadow-sm mt-1"
        >
          <Check size={14} />
          Kaydet
        </button>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {/* Tarih */}
        <div className="rounded-2xl bg-white border border-stone-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-800">Tarih</p>
            <input
              type="date"
              value={form.date}
              onChange={e => set('date')(e.target.value)}
              className="text-sm font-semibold text-stone-700 bg-transparent outline-none text-right"
            />
          </div>
        </div>

        {/* Ölçümler */}
        <div className="rounded-2xl bg-white border border-stone-100 shadow-sm px-5">
          <Field label="Kilo" unit="kg · zorunlu" value={form.weight_kg} onChange={set('weight_kg')} placeholder="75.0" />
          <Field label="Bel Çevresi" unit="cm" value={form.waist_cm} onChange={set('waist_cm')} />
          <Field label="Göğüs Çevresi" unit="cm" value={form.chest_cm} onChange={set('chest_cm')} />
          <Field label="Kol Çevresi" unit="cm" value={form.arm_cm} onChange={set('arm_cm')} />
          <Field label="Kalça Çevresi" unit="cm" value={form.hip_cm} onChange={set('hip_cm')} />
          <Field label="Vücut Yağ Oranı" unit="% · isteğe bağlı" value={form.body_fat_pct} onChange={set('body_fat_pct')} />
        </div>

        {error && (
          <p className="text-sm text-red-500 font-medium px-1">{error}</p>
        )}

        <button
          onClick={handleSave}
          className="w-full py-4 rounded-2xl bg-slate-800 text-white font-bold text-base active:bg-slate-700 transition-colors shadow-md"
        >
          Ölçümü Kaydet
        </button>

        <button
          onClick={() => navigate(-1)}
          className="w-full py-3 text-sm text-stone-400 font-medium"
        >
          İptal
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { bodyDb, profileDb } from '../../lib/db'
import { today } from '../../lib/storage'
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
  danger:      '#b91c1c',
  dangerBg:    'rgba(185,28,28,0.07)',
}

interface FormState {
  date: string
  weight_kg: string
  waist_cm: string
  chest_cm: string
  arm_cm: string
  hip_cm: string
  body_fat_pct: string
}

function Field({ label, unit, value, onChange, placeholder, required }: {
  label: string; unit: string; value: string
  onChange: (v: string) => void; placeholder?: string; required?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-4"
      style={{ borderBottom: `1px solid ${C.borderSub}` }}>
      <div>
        <p className="text-[14px] font-semibold" style={{ color: C.text }}>{label}</p>
        <p className="text-[11px] mt-0.5" style={{ color: C.textLow }}>
          {unit}{required ? ' · zorunlu' : ''}
        </p>
      </div>
      <input
        type="number" inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        className="w-24 text-right text-[16px] font-semibold bg-transparent outline-none pb-0.5 tabular-nums"
        style={{ color: C.text, borderBottom: `1px solid ${C.borderSub}` }}
      />
    </div>
  )
}

export default function BodyNew() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>({
    date: today(), weight_kg: '',
    waist_cm: '', chest_cm: '', arm_cm: '', hip_cm: '', body_fat_pct: '',
  })
  const [error, setError] = useState('')

  function set(field: keyof FormState) {
    return (v: string) => setForm(f => ({ ...f, [field]: v }))
  }

  async function handleSave() {
    if (!form.weight_kg) { setError('Kilo alanı zorunlu.'); return }
    setError('')
    const weight_kg = parseFloat(form.weight_kg)
    await bodyDb.create({
      date: form.date,
      weight_kg,
      waist_cm:     form.waist_cm     ? parseFloat(form.waist_cm)     : undefined,
      chest_cm:     form.chest_cm     ? parseFloat(form.chest_cm)     : undefined,
      arm_cm:       form.arm_cm       ? parseFloat(form.arm_cm)       : undefined,
      hip_cm:       form.hip_cm       ? parseFloat(form.hip_cm)       : undefined,
      body_fat_pct: form.body_fat_pct ? parseFloat(form.body_fat_pct) : undefined,
    })
    const profile = await profileDb.get()
    await profileDb.save({ ...(profile ?? { height_cm: 0, daily_calorie_goal: 1600, daily_protein_goal: 160, daily_carb_goal: 135, daily_fat_goal: 47 }), weight_kg })
    qc.invalidateQueries({ queryKey: QK.body })
    qc.invalidateQueries({ queryKey: QK.dashboard })
    qc.invalidateQueries({ queryKey: QK.profile })
    navigate('/body', { replace: true })
  }

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div className="px-5 pt-14 pb-5">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-[12px] font-semibold mb-4 active:opacity-60 transition-opacity"
          style={{ color: C.textLow }}>
          ← Geri
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
          Vücut Takibi
        </p>
        <h1 className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: C.text }}>
          Yeni Ölçüm
        </h1>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {/* Tarih */}
        <div className="rounded-2xl px-5 py-4"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold" style={{ color: C.text }}>Tarih</p>
            <input
              type="date" value={form.date}
              onChange={e => set('date')(e.target.value)}
              className="text-[14px] font-semibold bg-transparent outline-none text-right"
              style={{ color: C.textMid }}
            />
          </div>
        </div>

        {/* Ölçümler */}
        <div className="rounded-2xl px-5"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <Field label="Kilo" unit="kg" value={form.weight_kg} onChange={set('weight_kg')} placeholder="75.0" required />
          <Field label="Bel Çevresi" unit="cm" value={form.waist_cm} onChange={set('waist_cm')} />
          <Field label="Göğüs Çevresi" unit="cm" value={form.chest_cm} onChange={set('chest_cm')} />
          <Field label="Kol Çevresi" unit="cm" value={form.arm_cm} onChange={set('arm_cm')} />
          <Field label="Kalça Çevresi" unit="cm" value={form.hip_cm} onChange={set('hip_cm')} />
          <div style={{ borderBottom: 'none' }}>
            <Field label="Vücut Yağ Oranı" unit="%" value={form.body_fat_pct} onChange={set('body_fat_pct')} />
          </div>
        </div>

        {/* Hata */}
        {error && (
          <p className="text-[13px] font-semibold px-1"
            style={{ color: C.danger, background: C.dangerBg, padding: '10px 14px', borderRadius: 12 }}>
            {error}
          </p>
        )}

        {/* Kaydet */}
        <button
          onClick={handleSave}
          className="w-full py-4 rounded-2xl text-[15px] font-bold active:opacity-80 transition-opacity"
          style={{ background: C.text, color: C.bg }}
        >
          Ölçümü Kaydet
        </button>

        <button
          onClick={() => navigate(-1)}
          className="w-full py-3 text-[13px] font-medium"
          style={{ color: C.textLow }}
        >
          İptal
        </button>
      </div>
    </div>
  )
}

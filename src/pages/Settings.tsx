import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, LogOut } from 'lucide-react'
import { profileDb } from '../lib/db'
import { signOut } from '../lib/auth'
import { QK } from '../lib/queryClient'
import type { UserProfile } from '../types'

const C = {
  bg:           '#f5f3ef',
  surface:      '#ffffff',
  surfaceHigh:  '#f0ede8',
  border:       'rgba(0,0,0,0.07)',
  borderSub:    'rgba(0,0,0,0.04)',
  text:         '#1a1714',
  textMid:      'rgba(26,23,20,0.45)',
  textLow:      'rgba(26,23,20,0.28)',
  danger:       '#b91c1c',
  dangerBg:     'rgba(185,28,28,0.07)',
  dangerBorder: 'rgba(185,28,28,0.2)',
  successText:  '#166534',
  successBg:    'rgba(22,101,52,0.07)',
  successBorder:'rgba(22,101,52,0.18)',
}

type FormState = {
  height_cm: string
  weight_kg: string
  daily_calorie_goal: string
  daily_protein_goal: string
  daily_carb_goal: string
  daily_fat_goal: string
  training_calorie_goal: string
  daily_water_goal: string
}

function profileToForm(p: UserProfile | null): FormState {
  return {
    height_cm:             String(p?.height_cm             ?? ''),
    weight_kg:             String(p?.weight_kg             ?? ''),
    daily_calorie_goal:    String(p?.daily_calorie_goal    ?? '1600'),
    daily_protein_goal:    String(p?.daily_protein_goal    ?? '160'),
    daily_carb_goal:       String(p?.daily_carb_goal       ?? '135'),
    daily_fat_goal:        String(p?.daily_fat_goal        ?? '47'),
    training_calorie_goal: String(p?.training_calorie_goal ?? ''),
    daily_water_goal:      String(p?.daily_water_goal      ?? '3000'),
  }
}

function formToProfile(f: FormState): UserProfile {
  return {
    height_cm:             parseFloat(f.height_cm)             || 0,
    weight_kg:             parseFloat(f.weight_kg)             || 0,
    daily_calorie_goal:    parseInt(f.daily_calorie_goal)      || 1600,
    daily_protein_goal:    parseInt(f.daily_protein_goal)      || 160,
    daily_carb_goal:       parseInt(f.daily_carb_goal)         || 135,
    daily_fat_goal:        parseInt(f.daily_fat_goal)          || 47,
    training_calorie_goal: f.training_calorie_goal ? parseInt(f.training_calorie_goal) : undefined,
    daily_water_goal:      f.daily_water_goal ? parseInt(f.daily_water_goal) : 3000,
  }
}

function FieldRow({
  label, hint, value, onChange, suffix, type = 'number', placeholder, readOnly,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  suffix?: string
  type?: string
  placeholder?: string
  readOnly?: boolean
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-4"
      style={{ borderBottom: `1px solid ${C.borderSub}` }}
    >
      <div className="mr-4 min-w-0 flex-1">
        <p className="text-[14px] font-semibold" style={{ color: C.text }}>{label}</p>
        {hint && <p className="text-[11px] mt-0.5" style={{ color: C.textLow }}>{hint}</p>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? '—'}
          readOnly={readOnly}
          className={`${type === 'date' ? 'w-32' : 'w-20'} text-right text-[14px] font-semibold bg-transparent outline-none pb-0.5`}
          style={{
            color: readOnly ? C.textMid : C.text,
            borderBottom: readOnly ? 'none' : `1px solid ${C.border}`,
          }}
        />
        {suffix && (
          <span className="text-[12px] font-medium w-8" style={{ color: C.textMid }}>{suffix}</span>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-widest px-1 mb-2"
      style={{ color: C.textLow }}
    >
      {children}
    </p>
  )
}

export default function Settings() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(profileToForm(null))
  const [saved, setSaved] = useState(false)

  const { data: profile } = useQuery({
    queryKey: QK.profile,
    queryFn: () => profileDb.get(),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (profile !== undefined) setForm(profileToForm(profile))
  }, [profile])

  const saveMutation = useMutation({
    mutationFn: (p: UserProfile) => profileDb.save(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.profile })
      qc.invalidateQueries({ queryKey: QK.dashboard })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  function set(key: keyof FormState) {
    return (v: string) => setForm(f => ({ ...f, [key]: v }))
  }


  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <div className="px-5 pt-14 pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
          Profil
        </p>
        <h1 className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: C.text }}>
          Ayarlar
        </h1>
      </div>

      <div className="px-4 pb-10 space-y-5">

        {/* Vücut */}
        <div>
          <SectionLabel>Vücut Ölçüleri</SectionLabel>
          <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <FieldRow label="Boy" suffix="cm" value={form.height_cm} onChange={set('height_cm')} />
            <FieldRow label="Kilo" suffix="kg" value={form.weight_kg} onChange={set('weight_kg')} hint="Ölçüm sayfasından güncellenir" readOnly />
<div style={{ height: 1, background: 'transparent' }} />
          </div>
        </div>

        {/* Günlük hedefler */}
        <div>
          <SectionLabel>Günlük Hedefler</SectionLabel>
          <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <FieldRow
              label="Kalori"
              hint="Dinlenme günü"
              suffix="kcal"
              value={form.daily_calorie_goal}
              onChange={set('daily_calorie_goal')}
            />
            <FieldRow
              label="Antrenman Kalori"
              hint="Spor günü (boş = dinlenme hedefi)"
              suffix="kcal"
              value={form.training_calorie_goal}
              onChange={set('training_calorie_goal')}
              placeholder="—"
            />
            <FieldRow label="Protein"      suffix="g" value={form.daily_protein_goal} onChange={set('daily_protein_goal')} />
            <FieldRow label="Karbonhidrat" suffix="g" value={form.daily_carb_goal}    onChange={set('daily_carb_goal')} />
            <FieldRow label="Yağ"          suffix="g"  value={form.daily_fat_goal}     onChange={set('daily_fat_goal')} />
            <FieldRow label="Su"           suffix="ml" value={form.daily_water_goal}    onChange={set('daily_water_goal')} />
            <div style={{ height: 1, background: 'transparent' }} />
          </div>
        </div>

        {/* Kaydet */}
        <button
          onClick={() => saveMutation.mutate(formToProfile(form))}
          disabled={saveMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[15px] font-bold active:opacity-80 transition-opacity disabled:opacity-50"
          style={saved
            ? { background: C.successBg, color: C.successText, border: `1px solid ${C.successBorder}` }
            : { background: C.text, color: C.bg }
          }
        >
          {saved ? <><Check size={15} /> Kaydedildi</> : 'Kaydet'}
        </button>


        {/* Çıkış */}
        <button
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[15px] font-bold active:opacity-80 transition-opacity"
          style={{ background: C.dangerBg, color: C.danger, border: `1px solid ${C.dangerBorder}` }}
        >
          <LogOut size={15} />
          Çıkış Yap
        </button>

      </div>

    </div>
  )
}

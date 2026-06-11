import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageSpinner from '../components/PageSpinner'
import { Check, LogOut, ChevronDown } from 'lucide-react'
import { profileDb } from '../lib/db'
import { signOut } from '../lib/auth'
import { calculateBMR } from '../lib/bmr'
import { QK } from '../lib/queryClient'
import type { UserProfile, ActivityLevel, Gender } from '../types'

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

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary',         label: 'Hareketsiz',       hint: 'Masa başı iş, günde ~2000-4000 adım. Antrenman ve spor hariç.' },
  { value: 'lightly_active',    label: 'Az Hareketli',     hint: 'Günde ~4000-7000 adım, hafif tempolu günlük yaşam. Antrenman ve spor hariç.' },
  { value: 'moderately_active', label: 'Orta Hareketli',   hint: 'Günde ~7000-10000 adım, sık sık ayakta. Antrenman ve spor hariç.' },
  { value: 'very_active',       label: 'Çok Hareketli',    hint: 'Fiziksel iş, günde ~10000+ adım. Antrenman ve spor hariç.' },
  { value: 'extra_active',      label: 'Aşırı Hareketli',  hint: 'Çok ağır fiziksel iş, neredeyse sürekli hareket halinde. Antrenman ve spor hariç.' },
]

type FormState = {
  birth_date: string
  gender: Gender | ''
  activity_level: ActivityLevel | ''
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
    birth_date:            p?.birth_date ?? '',
    gender:                p?.gender ?? '',
    activity_level:        p?.activity_level ?? '',
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
    birth_date:            f.birth_date || undefined,
    gender:                f.gender || undefined,
    activity_level:        f.activity_level || undefined,
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

function GenderRow({
  value, onChange,
}: {
  value: Gender | ''
  onChange: (v: Gender | '') => void
}) {
  const options: { value: Gender; label: string }[] = [
    { value: 'male',   label: 'Erkek' },
    { value: 'female', label: 'Kadın' },
  ]
  return (
    <div
      className="flex items-center justify-between px-5 py-4"
      style={{ borderBottom: `1px solid ${C.borderSub}` }}
    >
      <div className="mr-4 min-w-0 flex-1">
        <p className="text-[14px] font-semibold" style={{ color: C.text }}>Cinsiyet</p>
        <p className="text-[11px] mt-0.5" style={{ color: C.textLow }}>BMR hesabı için gerekli</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="px-3 py-1.5 rounded-xl text-[13px] font-semibold transition-all"
            style={
              value === o.value
                ? { background: C.text, color: C.bg }
                : { background: C.surfaceHigh, color: C.textMid, border: `1px solid ${C.border}` }
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ActivityRow({
  value, onChange,
}: {
  value: ActivityLevel | ''
  onChange: (v: ActivityLevel | '') => void
}) {
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const selected = ACTIVITY_OPTIONS.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  function handleOpen() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setDropdownStyle({
        position: 'fixed',
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
        zIndex: 9999,
      })
    }
    setOpen(o => !o)
  }

  return (
    <div
      className="px-5 py-4"
      style={{ borderBottom: `1px solid ${C.borderSub}` }}
      ref={ref}
    >
      <div
        ref={triggerRef}
        className="flex items-center justify-between cursor-pointer"
        onClick={handleOpen}
      >
        <div className="mr-4 min-w-0 flex-1">
          <p className="text-[14px] font-semibold" style={{ color: C.text }}>Aktivite Düzeyi</p>
          {selected && (
            <p className="text-[11px] mt-0.5" style={{ color: C.textLow }}>{selected.hint}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 2 }}>
          <span className="text-[13px] font-semibold" style={{ color: value ? C.text : C.textMid }}>
            {selected ? selected.label : 'Seç'}
          </span>
          <ChevronDown
            size={12}
            style={{ color: C.textMid, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>
      </div>

      {open && (
        <div
          className="rounded-2xl overflow-hidden shadow-lg"
          style={{ ...dropdownStyle, background: C.surface, border: `1px solid ${C.border}` }}
        >
          {ACTIVITY_OPTIONS.map((o, i) => (
            <div
              key={o.value}
              className="flex items-center justify-between px-5 py-3 cursor-pointer active:opacity-70"
              style={{
                borderBottom: i < ACTIVITY_OPTIONS.length - 1 ? `1px solid ${C.borderSub}` : 'none',
                background: value === o.value ? C.surfaceHigh : 'transparent',
              }}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              <div>
                <p className="text-[14px] font-semibold" style={{ color: C.text }}>{o.label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: C.textLow }}>{o.hint}</p>
              </div>
              {value === o.value && (
                <Check size={14} style={{ color: C.text, flexShrink: 0, marginLeft: 12 }} />
              )}
            </div>
          ))}
        </div>
      )}
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

export default function Profile() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(profileToForm(null))
  const [saved, setSaved] = useState(false)

  const bmrResult = (() => {
    const w = parseFloat(form.weight_kg)
    const h = parseFloat(form.height_cm)
    if (!w || !h || !form.birth_date || !form.activity_level || !form.gender) return null
    return calculateBMR(w, h, form.birth_date, form.activity_level, form.gender)
  })()

  const { data: profile, isLoading } = useQuery({
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

  if (isLoading) return <PageSpinner />

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
            <FieldRow label="Doğum Tarihi" type="date" value={form.birth_date} onChange={set('birth_date')} />
            <GenderRow
              value={form.gender}
              onChange={v => setForm(f => ({ ...f, gender: v }))}
            />
            <ActivityRow
              value={form.activity_level}
              onChange={v => setForm(f => ({ ...f, activity_level: v }))}
            />
            <FieldRow label="Boy" suffix="cm" value={form.height_cm} onChange={set('height_cm')} />
            <FieldRow label="Kilo" suffix="kg" value={form.weight_kg} onChange={set('weight_kg')} hint="Ölçüm sayfasından güncellenir" readOnly />
            <div style={{ height: 1, background: 'transparent' }} />
          </div>
        </div>

        {/* BMR Özeti */}
        {bmrResult && (
          <div className="rounded-2xl px-5 py-4 flex items-center justify-between"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
                Günlük Harcama Tahmini
              </p>
              <p className="text-[13px]" style={{ color: C.textMid }}>
                Antrenman ve spor aktiviteleri hariç
              </p>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <p className="text-[22px] font-black tabular-nums leading-none" style={{ color: C.text }}>
                {bmrResult.tdee}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: C.textLow }}>
                BMR: {bmrResult.bmr} kcal
              </p>
            </div>
          </div>
        )}

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
            <FieldRow label="Protein"      suffix="g"  value={form.daily_protein_goal} onChange={set('daily_protein_goal')} />
            <FieldRow label="Karbonhidrat" suffix="g"  value={form.daily_carb_goal}    onChange={set('daily_carb_goal')} />
            <FieldRow label="Yağ"          suffix="g"  value={form.daily_fat_goal}      onChange={set('daily_fat_goal')} />
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

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Trash2, AlertTriangle } from 'lucide-react'
import { profileDb } from '../lib/db'
import { supabase, getUserId } from '../lib/supabase'
import { QK } from '../lib/queryClient'
import type { UserProfile } from '../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-3 px-1">{title}</p>
      <div className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-stone-50 last:border-0">
      <div className="mr-4 min-w-0">
        <p className="text-sm font-semibold text-stone-800">{label}</p>
        {hint && <p className="text-xs text-stone-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function NumInput({ value, onChange, min, max, suffix }: {
  value: string; onChange: (v: string) => void; min?: number; max?: number; suffix?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        className="w-20 px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm font-semibold text-stone-800 text-center outline-none focus:border-slate-400 focus:bg-white transition-all"
      />
      {suffix && <span className="text-xs text-stone-400 font-medium">{suffix}</span>}
    </div>
  )
}

type FormState = {
  height_cm: string
  weight_kg: string
  daily_calorie_goal: string
  daily_protein_goal: string
  daily_carb_goal: string
  daily_fat_goal: string
  training_calorie_goal: string
}

function profileToForm(p: UserProfile | null): FormState {
  return {
    height_cm:             String(p?.height_cm             ?? ''),
    weight_kg:             String(p?.weight_kg             ?? ''),
    daily_calorie_goal:    String(p?.daily_calorie_goal    ?? '2200'),
    daily_protein_goal:    String(p?.daily_protein_goal    ?? '160'),
    daily_carb_goal:       String(p?.daily_carb_goal       ?? '250'),
    daily_fat_goal:        String(p?.daily_fat_goal        ?? '70'),
    training_calorie_goal: String(p?.training_calorie_goal ?? ''),
  }
}

function formToProfile(f: FormState): UserProfile {
  return {
    height_cm:             parseFloat(f.height_cm)             || 0,
    weight_kg:             parseFloat(f.weight_kg)             || 0,
    daily_calorie_goal:    parseInt(f.daily_calorie_goal)      || 2200,
    daily_protein_goal:    parseInt(f.daily_protein_goal)      || 160,
    daily_carb_goal:       parseInt(f.daily_carb_goal)         || 250,
    daily_fat_goal:        parseInt(f.daily_fat_goal)          || 70,
    training_calorie_goal: f.training_calorie_goal ? parseInt(f.training_calorie_goal) : undefined,
  }
}

export default function Settings() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(profileToForm(null))
  const [saved, setSaved] = useState(false)
  const [showClearWorkouts, setShowClearWorkouts] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearDone, setClearDone] = useState(false)

  const { data: profile } = useQuery({
    queryKey: QK.profile,
    queryFn: () => profileDb.get(),
    staleTime: Infinity,
  })

  // Profil yüklenince formu doldur
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

  function handleSave() {
    saveMutation.mutate(formToProfile(form))
  }

  async function handleClearWorkouts() {
    setClearing(true)
    try {
      const userId = await getUserId()
      // session_sets → workout_sessions (CASCADE ile silinir)
      const { data: sessions } = await supabase
        .from('workout_sessions')
        .select('id')
        .eq('user_id', userId)
      if (sessions && sessions.length > 0) {
        const ids = sessions.map(s => s.id)
        await supabase.from('session_sets').delete().in('session_id', ids)
        await supabase.from('workout_sessions').delete().eq('user_id', userId)
      }
      await supabase.from('personal_records').delete().eq('user_id', userId)
      qc.invalidateQueries({ queryKey: QK.workoutHistory })
      qc.invalidateQueries({ queryKey: QK.dashboard })
      qc.invalidateQueries({ queryKey: ['workout-page'] })
      setClearDone(true)
      setTimeout(() => setClearDone(false), 3000)
    } finally {
      setClearing(false)
      setShowClearWorkouts(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6">
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wide mb-0.5">Hesap</p>
        <h1 className="text-[32px] font-bold tracking-tight">Ayarlar</h1>
      </div>

      <div className="px-4 pb-10 space-y-6">

        {/* Vücut Ölçüleri */}
        <Section title="Vücut Ölçüleri">
          <Row label="Boy" hint="Santimetre cinsinden">
            <NumInput value={form.height_cm} onChange={set('height_cm')} min={100} max={250} suffix="cm" />
          </Row>
          <Row label="Kilo" hint="Kilogram cinsinden">
            <NumInput value={form.weight_kg} onChange={set('weight_kg')} min={30} max={300} suffix="kg" />
          </Row>
        </Section>

        {/* Günlük Hedefler */}
        <Section title="Günlük Hedefler">
          <Row label="Kalori" hint="Dinlenme günü kalori hedefi">
            <NumInput value={form.daily_calorie_goal} onChange={set('daily_calorie_goal')} min={500} max={10000} suffix="kcal" />
          </Row>
          <Row label="Antrenman Kalori" hint="Spor günü kalori hedefi (boş = dinlenme hedefi)">
            <NumInput value={form.training_calorie_goal} onChange={set('training_calorie_goal')} min={500} max={10000} suffix="kcal" />
          </Row>
          <Row label="Protein">
            <NumInput value={form.daily_protein_goal} onChange={set('daily_protein_goal')} min={0} max={1000} suffix="g" />
          </Row>
          <Row label="Karbonhidrat">
            <NumInput value={form.daily_carb_goal} onChange={set('daily_carb_goal')} min={0} max={2000} suffix="g" />
          </Row>
          <Row label="Yağ">
            <NumInput value={form.daily_fat_goal} onChange={set('daily_fat_goal')} min={0} max={1000} suffix="g" />
          </Row>
        </Section>

        {/* Kaydet */}
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className={`w-full py-4 rounded-2xl font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${
            saved
              ? 'bg-emerald-500 text-white'
              : 'bg-slate-800 text-white active:bg-slate-700'
          } disabled:opacity-50`}
        >
          {saved ? <><Check size={16} />Kaydedildi</> : 'Kaydet'}
        </button>

        {/* Geliştirici Araçları */}
        <Section title="Geliştirici Araçları">
          <div className="px-5 py-4">
            <p className="text-xs text-stone-400 mb-3 leading-relaxed">
              Sadece test amaçlıdır. Antrenman geçmişini, setleri ve kişisel rekorları kalıcı olarak siler.
            </p>
            <button
              onClick={() => setShowClearWorkouts(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold active:bg-red-100 transition-colors"
            >
              <Trash2 size={14} />
              Antrenman Kayıtlarını Sil
            </button>
            {clearDone && (
              <p className="text-xs text-emerald-600 font-semibold mt-2 flex items-center gap-1">
                <Check size={12} />Tüm antrenman kayıtları silindi.
              </p>
            )}
          </div>
        </Section>

      </div>

      {/* Antrenman silme onay modalı */}
      {showClearWorkouts && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-bold text-stone-900">Emin misin?</p>
                <p className="text-xs text-stone-400 mt-0.5">Bu işlem geri alınamaz</p>
              </div>
            </div>
            <p className="text-sm text-stone-500 mb-5 leading-relaxed">
              Tüm antrenman seansları, setler ve kişisel rekorlar silinecek. Program ve beslenme kayıtlarına dokunulmaz.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearWorkouts(false)}
                disabled={clearing}
                className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm active:bg-stone-50 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                onClick={handleClearWorkouts}
                disabled={clearing}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-sm active:bg-red-600 disabled:opacity-50"
              >
                {clearing ? 'Siliniyor…' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

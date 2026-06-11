import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { foodLogDb } from '../../lib/db'
import { today } from '../../lib/storage'
import { QK } from '../../lib/queryClient'
import { MEAL_LABELS, MEAL_ORDER } from '../../lib/mealConstants'

const C = {
  bg:          '#f5f3ef',
  surface:     '#ffffff',
  surfaceHigh: '#f0ede8',
  border:      'rgba(0,0,0,0.07)',
  borderSub:   'rgba(0,0,0,0.04)',
  text:        '#1a1714',
  textMid:     'rgba(26,23,20,0.45)',
  textLow:     'rgba(26,23,20,0.28)',
  startText:   '#1d4ed8',
  startBorder: 'rgba(29,78,216,0.18)',
  danger:      '#b91c1c',
  dangerBg:    'rgba(185,28,28,0.07)',
  dangerBorder:'rgba(185,28,28,0.2)',
}
import type { MealType } from '../../types'

interface ManualForm {
  food_name: string
  calories: string
  protein_g: string
  carb_g: string
  fat_g: string
  serving_size: string
  serving_unit: string
}

type BaseValues = { calories: number; protein_g: number; carb_g: number; fat_g: number }

function defaultServing(unit: string): string {
  return unit === 'g' || unit === 'ml' ? '100' : '1'
}

function scaleMacros(base: BaseValues, qty: number, unit: string) {
  const divisor = unit === 'g' || unit === 'ml' ? 100 : 1
  const scale = qty / divisor
  return {
    calories:  String(Math.round(base.calories  * scale)),
    protein_g: String(Math.round(base.protein_g * scale * 10) / 10),
    carb_g:    String(Math.round(base.carb_g    * scale * 10) / 10),
    fat_g:     String(Math.round(base.fat_g     * scale * 10) / 10),
  }
}

async function estimateWithGroq(foodName: string, unit: string): Promise<BaseValues | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  const unitLabel = unit === 'g' || unit === 'ml' ? `100${unit}` : `1 ${unit}`

  const res = await fetch(`${supabaseUrl}/functions/v1/estimate-nutrition`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ foodName, servingSize: unitLabel }),
  })

  if (!res.ok) return null

  const data = await res.json()
  if (data.error || !data.calories) return null

  return {
    calories:  data.calories,
    protein_g: data.protein_g,
    carb_g:    data.carb_g,
    fat_g:     data.fat_g,
  }
}

export default function NutritionLog() {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const initialMeal = (location.state as { meal?: MealType })?.meal ?? 'breakfast'

  const [meal, setMeal] = useState<MealType>(initialMeal)
  const [form, setForm] = useState<ManualForm>({
    food_name: '', calories: '', protein_g: '', carb_g: '', fat_g: '',
    serving_size: '100', serving_unit: 'g',
  })
  const [error, setError] = useState('')
  const [estimating, setEstimating] = useState(false)
  const [aiError, setAiError] = useState('')
  const [baseValues, setBaseValues] = useState<BaseValues | null>(null)
  // Tracks whether current macro values were filled by AI (to show visual indicator)
  const [aiLocked, setAiLocked] = useState(false)

  function setF(field: keyof ManualForm) {
    return (v: string) => {
      setForm(f => {
        const updated = { ...f, [field]: v }

        if (field === 'serving_unit') {
          // Birim değişince temel değerler ve makrolar geçersiz
          setBaseValues(null)
          setAiLocked(false)
          updated.serving_size = ''
          updated.calories  = ''
          updated.protein_g = ''
          updated.carb_g    = ''
          updated.fat_g     = ''
          return updated
        }

        if (field === 'serving_size' && baseValues) {
          const qty = parseFloat(v) || parseFloat(defaultServing(f.serving_unit))
          Object.assign(updated, scaleMacros(baseValues, qty, f.serving_unit))
        }

        // Kullanıcı makroyu elle değiştirirse AI lock kalkar
        if (['calories', 'protein_g', 'carb_g', 'fat_g'].includes(field)) {
          setAiLocked(false)
          setBaseValues(null)
        }

        return updated
      })
    }
  }

  async function handleEstimate() {
    if (!form.food_name.trim()) return
    setAiError('')
    setEstimating(true)
    try {
      const result = await estimateWithGroq(form.food_name, form.serving_unit || 'g')
      if (!result) {
        setAiError('Tahmin alınamadı. Tekrar dene veya manuel gir.')
        return
      }
      setBaseValues(result)
      setAiLocked(true)
      const qty = parseFloat(form.serving_size) || parseFloat(defaultServing(form.serving_unit))
      setForm(f => ({ ...f, ...scaleMacros(result, qty, f.serving_unit) }))
    } catch {
      setAiError('Bağlantı hatası. İnternet bağlantını kontrol et.')
    } finally {
      setEstimating(false)
    }
  }

  async function handleAdd() {
    if (!form.food_name || !form.calories) {
      setError('Besin adı ve kalori zorunlu.')
      return
    }
    setError('')
    const unit = form.serving_unit || 'g'
    const servingFallback = unit === 'g' || unit === 'ml' ? 100 : 1
    await foodLogDb.create({
      date: today(),
      meal_type: meal,
      food_name: form.food_name,
      calories:  parseFloat(form.calories)  || 0,
      protein_g: parseFloat(form.protein_g) || 0,
      carb_g:    parseFloat(form.carb_g)    || 0,
      fat_g:     parseFloat(form.fat_g)     || 0,
      serving_size: parseFloat(form.serving_size) || servingFallback,
      serving_unit: unit,
      source: 'manual',
    })
    qc.invalidateQueries({ queryKey: QK.nutrition(today()) })
    qc.invalidateQueries({ queryKey: QK.dashboard })
    navigate('/nutrition', { replace: true })
  }

  const macroFields = [
    { label: 'Kalori',       field: 'calories'   as const, placeholder: '0', unit: 'kcal' },
    { label: 'Protein',      field: 'protein_g'  as const, placeholder: '0', unit: 'g'    },
    { label: 'Karbonhidrat', field: 'carb_g'     as const, placeholder: '0', unit: 'g'    },
    { label: 'Yağ',          field: 'fat_g'      as const, placeholder: '0', unit: 'g'    },
  ]

  const canEstimate = form.food_name.trim().length > 0

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <div className="px-5 pt-14 pb-5">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-[12px] font-semibold mb-4 active:opacity-60 transition-opacity"
          style={{ color: C.textLow }}>
          ← Geri
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textLow }}>
          Beslenme
        </p>
        <h1 className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: C.text }}>
          Besin Ekle
        </h1>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {/* Öğün seçici */}
        <div className="rounded-2xl p-1.5 flex gap-1"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {MEAL_ORDER.map(m => (
            <button key={m} onClick={() => setMeal(m)}
              className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold transition-colors active:scale-[0.97]"
              style={meal === m
                ? { background: C.text, color: C.bg }
                : { color: C.textMid }}>
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Besin adı */}
        <div className="rounded-2xl px-5"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between py-4">
            <p className="text-[14px] font-semibold" style={{ color: C.text }}>Besin Adı</p>
            <input
              type="text"
              value={form.food_name}
              onChange={e => setF('food_name')(e.target.value)}
              placeholder="Yulaf ezmesi"
              className="flex-1 text-right text-[14px] font-semibold bg-transparent outline-none pb-0.5 ml-4"
              style={{ color: C.text, borderBottom: `1px solid ${C.border}` }}
            />
          </div>
        </div>

        {/* Porsiyon */}
        <div className="rounded-2xl px-5"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between py-4"
            style={{ borderBottom: `1px solid ${C.borderSub}` }}>
            <p className="text-[14px] font-semibold" style={{ color: C.text }}>Porsiyon</p>
            <input type="number" inputMode="decimal"
              value={form.serving_size}
              onChange={e => setF('serving_size')(e.target.value)}
              placeholder={defaultServing(form.serving_unit)}
              className="w-20 text-right text-[14px] font-semibold bg-transparent outline-none pb-0.5"
              style={{ color: C.text, borderBottom: `1px solid ${C.border}` }} />
          </div>
          <div className="flex items-center justify-between py-4">
            <p className="text-[14px] font-semibold" style={{ color: C.text }}>Birim</p>
            <div className="flex gap-1 rounded-lg p-0.5" style={{ background: C.surfaceHigh }}>
              {['g', 'ml', 'adet', 'porsiyon'].map(u => (
                <button key={u} onClick={() => setF('serving_unit')(u)}
                  className="px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors active:scale-95"
                  style={form.serving_unit === u
                    ? { background: C.surface, color: C.text }
                    : { color: C.textMid }}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AI Tahmin butonu */}
        <button
          onClick={handleEstimate}
          disabled={estimating || !canEstimate}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-bold active:opacity-80 transition-opacity disabled:opacity-40"
          style={{ background: C.surfaceHigh, color: C.text, border: `1px solid ${C.border}` }}
        >
          {estimating
            ? <><Loader2 size={16} className="animate-spin" /> Hesaplanıyor…</>
            : 'AI ile Makroları Hesapla'
          }
        </button>

        {aiError && (
          <div className="rounded-xl px-4 py-3"
            style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger }}>
            <p className="text-[13px] font-medium">{aiError}</p>
          </div>
        )}

        {/* Makro alanları */}
        <div className="rounded-2xl px-5"
          style={{
            background: C.surface,
            border: `1px solid ${aiLocked ? C.startBorder : C.border}`,
            transition: 'border-color 0.2s',
          }}>
          {aiLocked && (
            <div className="pt-3 pb-1 px-0">
              <p className="text-[11px] font-semibold" style={{ color: C.startText }}>
                AI tarafından dolduruldu · elle değiştirerek düzenleyebilirsin
              </p>
            </div>
          )}
          {macroFields.map(({ label, field, placeholder, unit }, i) => (
            <div key={field} className="flex items-center justify-between py-4"
              style={i < macroFields.length - 1 ? { borderBottom: `1px solid ${C.borderSub}` } : {}}>
              <p className="text-[14px] font-semibold" style={{ color: C.text }}>{label}</p>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="decimal"
                  value={form[field]}
                  onChange={e => setF(field)(e.target.value)}
                  placeholder={placeholder}
                  className="w-28 text-right text-[14px] font-semibold bg-transparent outline-none pb-0.5"
                  style={{ color: C.text, borderBottom: `1px solid ${C.border}` }}
                />
                {unit && <span className="text-[12px] font-medium" style={{ color: C.textMid }}>{unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3"
            style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger }}>
            <p className="text-[13px] font-medium">{error}</p>
          </div>
        )}

        <button onClick={handleAdd}
          className="w-full py-4 rounded-2xl text-[15px] font-bold active:opacity-80 transition-opacity"
          style={{ background: C.text, color: C.bg }}>
          Ekle
        </button>
      </div>
    </div>
  )
}

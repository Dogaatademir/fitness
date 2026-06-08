import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { foodLogDb } from '../../lib/db'
import { today } from '../../lib/storage'
import { QK } from '../../lib/queryClient'
import type { MealType } from '../../types'

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
  dangerBorder:'rgba(185,28,28,0.2)',
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle',
  dinner: 'Akşam',
  snack: 'Ara Öğün',
}

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

interface ManualForm {
  food_name: string
  calories: string
  protein_g: string
  carb_g: string
  fat_g: string
  serving_size: string
  serving_unit: string
}

async function estimateWithGroq(foodName: string, serving: string, unit: string): Promise<{
  calories: number
  protein_g: number
  carb_g: number
  fat_g: number
} | null> {
  const key = import.meta.env.VITE_GROQ_API_KEY
  console.log('[Groq] key mevcut:', !!key, '| key prefix:', key?.slice(0, 8) ?? 'YOK')
  if (!key) {
    console.error('[Groq] VITE_GROQ_API_KEY tanımlı değil — deploy env kontrol et')
    return null
  }

  const prompt = `Türk mutfağı ve uluslararası besinler hakkında beslenme uzmanısın.
"${foodName}" için ${serving}${unit} porsiyonunun besin değerlerini tahmin et.
Sadece JSON döndür, başka hiçbir şey yazma:
{"calories":number,"protein_g":number,"carb_g":number,"fat_g":number}
Tüm değerler sayı olmalı (ondalık olabilir). Kalori tam sayı olsun.`

  console.log('[Groq] istek gönderiliyor:', foodName, serving, unit)
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 100,
    }),
  })

  console.log('[Groq] yanıt status:', res.status)
  if (!res.ok) {
    const errText = await res.text()
    console.error('[Groq] API hatası:', res.status, errText)
    return null
  }
  const data = await res.json()
  console.log('[Groq] yanıt:', JSON.stringify(data.choices?.[0]?.message?.content))
  const text = data.choices?.[0]?.message?.content ?? ''
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) {
    console.error('[Groq] JSON parse edilemedi, ham yanıt:', text)
    return null
  }
  try {
    const parsed = JSON.parse(match[0])
    console.log('[Groq] başarılı:', parsed)
    return parsed
  } catch (e) {
    console.error('[Groq] JSON.parse hatası:', e)
    return null
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

  function setF(field: keyof ManualForm) {
    return (v: string) => setForm(f => ({ ...f, [field]: v }))
  }

  async function handleEstimate() {
    if (!form.food_name.trim()) {
      setAiError('Önce besin adını gir.')
      return
    }
    setAiError('')
    setEstimating(true)
    try {
      const result = await estimateWithGroq(form.food_name, form.serving_size || '100', form.serving_unit || 'g')
      if (!result) {
        setAiError('Tahmin alınamadı. Tekrar dene veya manuel gir.')
        return
      }
      setForm(f => ({
        ...f,
        calories:  String(result.calories),
        protein_g: String(result.protein_g),
        carb_g:    String(result.carb_g),
        fat_g:     String(result.fat_g),
      }))
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
    await foodLogDb.create({
      date: today(),
      meal_type: meal,
      food_name: form.food_name,
      calories:  parseFloat(form.calories)  || 0,
      protein_g: parseFloat(form.protein_g) || 0,
      carb_g:    parseFloat(form.carb_g)    || 0,
      fat_g:     parseFloat(form.fat_g)     || 0,
      serving_size: parseFloat(form.serving_size) || 100,
      serving_unit: form.serving_unit || 'g',
      source: 'manual',
    })
    qc.invalidateQueries({ queryKey: QK.nutrition(today()) })
    qc.invalidateQueries({ queryKey: QK.dashboard })
    navigate('/nutrition', { replace: true })
  }

  const macroFields = [
    { label: 'Kalori',       field: 'calories'   as const, type: 'number', placeholder: '0', unit: 'kcal'},
    { label: 'Protein',      field: 'protein_g'  as const, type: 'number', placeholder: '0', unit: 'g'   },
    { label: 'Karbonhidrat', field: 'carb_g'     as const, type: 'number', placeholder: '0', unit: 'g'   },
    { label: 'Yağ',          field: 'fat_g'      as const, type: 'number', placeholder: '0', unit: 'g'   },
  ]

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

        {/* Besin adı + AI butonu */}
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

        {/* Porsiyon (AI'a göndermeden önce bilinmesi için üste taşındı) */}
        <div className="rounded-2xl px-5"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between py-4"
            style={{ borderBottom: `1px solid ${C.borderSub}` }}>
            <p className="text-[14px] font-semibold" style={{ color: C.text }}>Porsiyon</p>
            <input type="number" inputMode="decimal"
              value={form.serving_size}
              onChange={e => setF('serving_size')(e.target.value)}
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
          disabled={estimating}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-bold active:opacity-80 transition-opacity disabled:opacity-50"
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
          style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {macroFields.map(({ label, field, type, placeholder, unit }, i) => (
            <div key={field} className="flex items-center justify-between py-4"
              style={i < macroFields.length - 1 ? { borderBottom: `1px solid ${C.borderSub}` } : {}}>
              <p className="text-[14px] font-semibold" style={{ color: C.text }}>{label}</p>
              <div className="flex items-center gap-1.5">
                <input
                  type={type}
                  inputMode={type === 'number' ? 'decimal' : undefined}
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

        {/* Hata */}
        {error && (
          <div className="rounded-xl px-4 py-3"
            style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger }}>
            <p className="text-[13px] font-medium">{error}</p>
          </div>
        )}

        {/* CTA */}
        <button onClick={handleAdd}
          className="w-full py-4 rounded-2xl text-[15px] font-bold active:opacity-80 transition-opacity"
          style={{ background: C.text, color: C.bg }}>
          Ekle
        </button>
      </div>
    </div>
  )
}

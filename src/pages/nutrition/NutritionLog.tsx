import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Search, Check, Clock, ChevronRight } from 'lucide-react'
import { foodLogDb } from '../../lib/db'
import { today } from '../../lib/storage'
import { QK } from '../../lib/queryClient'
import type { FoodLog, MealType } from '../../types'

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle',
  dinner: 'Akşam',
  snack: 'Ara Öğün',
}

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

// Open Food Facts türkçe/ingilizce arama
async function searchOFF(query: string): Promise<Partial<FoodLog>[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&lc=tr`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FitnessTracker/1.0 (nailanildemiray@gmail.com)' },
  })
  if (!res.ok) throw new Error('API hatası')
  const data = await res.json()
  return (data.products ?? [])
    .filter((p: Record<string, unknown>) => p.product_name && p.nutriments)
    .map((p: Record<string, unknown>) => {
      const n = p.nutriments as Record<string, number>
      return {
        food_name: (p.product_name_tr as string) || (p.product_name as string),
        calories: Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0),
        protein_g: +(n.proteins_100g ?? 0).toFixed(1),
        carb_g: +(n.carbohydrates_100g ?? 0).toFixed(1),
        fat_g: +(n.fat_100g ?? 0).toFixed(1),
        serving_size: 100,
        serving_unit: 'g',
        barcode: p.code as string | undefined,
        source: 'api' as const,
      }
    })
}

interface ManualForm {
  food_name: string
  calories: string
  protein_g: string
  carb_g: string
  fat_g: string
  serving_size: string
  serving_unit: string
}

export default function NutritionLog() {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const initialMeal = (location.state as { meal?: MealType })?.meal ?? 'breakfast'

  const [meal, setMeal] = useState<MealType>(initialMeal)
  const [tab, setTab] = useState<'search' | 'manual'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Partial<FoodLog>[]>([])
  const [recent, setRecent] = useState<FoodLog[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Partial<FoodLog> | null>(null)
  const [serving, setServing] = useState('100')
  const [manual, setManual] = useState<ManualForm>({
    food_name: '', calories: '', protein_g: '', carb_g: '', fat_g: '',
    serving_size: '100', serving_unit: 'g',
  })
  const [error, setError] = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    foodLogDb.getRecent(10).then(setRecent)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const [res, allLogs] = await Promise.all([searchOFF(query), foodLogDb.getAll()])
        const seen = new Set<string>()
        const personal: Partial<FoodLog>[] = []
        for (const f of allLogs) {
          if (seen.has(f.food_name)) continue
          if (f.food_name.toLowerCase().includes(query.toLowerCase())) {
            seen.add(f.food_name)
            personal.push({ ...f, source: 'recent' })
          }
        }
        setResults([...personal, ...res])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
  }, [query])

  function scaledMacros(item: Partial<FoodLog>, servingGrams: number) {
    const base = item.serving_size ?? 100
    const factor = servingGrams / base
    return {
      calories: Math.round((item.calories ?? 0) * factor),
      protein_g: +((item.protein_g ?? 0) * factor).toFixed(1),
      carb_g: +((item.carb_g ?? 0) * factor).toFixed(1),
      fat_g: +((item.fat_g ?? 0) * factor).toFixed(1),
    }
  }

  async function addFromSearch() {
    if (!selected) return
    const s = parseFloat(serving) || 100
    const macros = scaledMacros(selected, s)
    await foodLogDb.create({
      date: today(),
      meal_type: meal,
      food_name: selected.food_name ?? 'Bilinmiyor',
      ...macros,
      serving_size: s,
      serving_unit: selected.serving_unit ?? 'g',
      barcode: selected.barcode,
      source: selected.source ?? 'api',
    })
    qc.invalidateQueries({ queryKey: QK.nutrition(today()) })
    qc.invalidateQueries({ queryKey: QK.dashboard })
    navigate('/nutrition', { replace: true })
  }

  async function addManual() {
    if (!manual.food_name || !manual.calories) {
      setError('İsim ve kalori zorunlu.')
      return
    }
    setError('')
    await foodLogDb.create({
      date: today(),
      meal_type: meal,
      food_name: manual.food_name,
      calories: parseFloat(manual.calories) || 0,
      protein_g: parseFloat(manual.protein_g) || 0,
      carb_g: parseFloat(manual.carb_g) || 0,
      fat_g: parseFloat(manual.fat_g) || 0,
      serving_size: parseFloat(manual.serving_size) || 100,
      serving_unit: manual.serving_unit || 'g',
      source: 'manual',
    })
    qc.invalidateQueries({ queryKey: QK.nutrition(today()) })
    qc.invalidateQueries({ queryKey: QK.dashboard })
    navigate('/nutrition', { replace: true })
  }

  function setM(field: keyof ManualForm) {
    return (v: string) => setManual(f => ({ ...f, [field]: v }))
  }

  const displayList = query.trim().length >= 2 ? results : recent

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-stone-400 font-semibold mb-3 flex items-center gap-1 active:text-stone-600"
        >
          ← Geri
        </button>
        <h1 className="text-[28px] font-bold tracking-tight">Besin Ekle</h1>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {/* Öğün seçici */}
        <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-1.5 flex gap-1">
          {MEAL_ORDER.map(m => (
            <button
              key={m}
              onClick={() => setMeal(m)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                meal === m
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-stone-400 active:bg-stone-50'
              }`}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Sekme */}
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
          {(['search', 'manual'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === t ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400'
              }`}
            >
              {t === 'search' ? 'Ara' : 'Manuel Giriş'}
            </button>
          ))}
        </div>

        {tab === 'search' ? (
          <>
            {/* Arama kutusu */}
            <div className="relative">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Besin ara… (örn. yulaf, tavuk göğsü)"
                className="w-full pl-10 pr-4 py-3.5 rounded-2xl bg-white border border-stone-100 shadow-sm text-sm outline-none placeholder:text-stone-300 focus:border-slate-300"
                autoFocus
              />
              {searching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-stone-200 border-t-stone-400 rounded-full animate-spin" />
              )}
            </div>

            {/* Seçili besin porsiyon girişi */}
            {selected && (
              <div className="rounded-2xl bg-slate-800 p-5 shadow-md">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-white font-bold text-base truncate">{selected.food_name}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {scaledMacros(selected, parseFloat(serving) || 100).calories} kcal
                      {' · '}P {scaledMacros(selected, parseFloat(serving) || 100).protein_g}g
                      {' · '}K {scaledMacros(selected, parseFloat(serving) || 100).carb_g}g
                      {' · '}Y {scaledMacros(selected, parseFloat(serving) || 100).fat_g}g
                    </p>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-slate-500 active:text-slate-300 mt-0.5">
                    <Plus size={14} className="rotate-45" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-slate-400 text-xs mb-1.5">Porsiyon ({selected.serving_unit ?? 'g'})</p>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={serving}
                      onChange={e => setServing(e.target.value)}
                      className="w-full bg-slate-700 text-white font-semibold text-lg text-center rounded-xl py-2.5 outline-none border border-slate-600 focus:border-slate-400"
                    />
                  </div>
                  <button
                    onClick={addFromSearch}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-slate-900 font-bold text-sm active:bg-stone-100 transition-colors self-end"
                  >
                    <Check size={15} />
                    Ekle
                  </button>
                </div>
              </div>
            )}

            {/* Sonuç / son kullanılanlar listesi */}
            {!selected && displayList.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 font-semibold mb-2 px-1">
                  {query.trim().length >= 2 ? 'Sonuçlar' : 'Son Kullanılanlar'}
                </p>
                <div className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
                  {displayList.map((item, i) => {
                    const id = (item as FoodLog).id ?? `item-${i}`
                    return (
                      <button
                        key={id + i}
                        onClick={() => { setSelected(item); setServing(String(item.serving_size ?? 100)) }}
                        className={`w-full flex items-center justify-between px-5 py-4 text-left active:bg-stone-50 transition-colors ${
                          i > 0 ? 'border-t border-stone-100' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {item.source === 'recent' && (
                            <Clock size={12} className="text-stone-300 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-stone-800 truncate">{item.food_name}</p>
                            <p className="text-xs text-stone-400 mt-0.5">
                              {item.calories} kcal / {item.serving_size}{item.serving_unit ?? 'g'}
                              {' · '}P {item.protein_g}g K {item.carb_g}g Y {item.fat_g}g
                            </p>
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-stone-300 flex-shrink-0 ml-2" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-stone-400">Sonuç bulunamadı.</p>
                <button
                  onClick={() => setTab('manual')}
                  className="mt-2 text-sm font-semibold text-slate-600 underline underline-offset-2"
                >
                  Manuel giriş yap
                </button>
              </div>
            )}
          </>
        ) : (
          /* Manuel giriş formu */
          <div className="space-y-3">
            <div className="rounded-2xl bg-white border border-stone-100 shadow-sm px-5">
              {[
                { label: 'Besin Adı', field: 'food_name' as const, type: 'text', placeholder: 'Yulaf ezmesi', unit: '' },
                { label: 'Kalori', field: 'calories' as const, type: 'number', placeholder: '0', unit: 'kcal' },
                { label: 'Protein', field: 'protein_g' as const, type: 'number', placeholder: '0', unit: 'g' },
                { label: 'Karbonhidrat', field: 'carb_g' as const, type: 'number', placeholder: '0', unit: 'g' },
                { label: 'Yağ', field: 'fat_g' as const, type: 'number', placeholder: '0', unit: 'g' },
              ].map(({ label, field, type, placeholder, unit }, i, arr) => (
                <div
                  key={field}
                  className={`flex items-center justify-between py-4 ${i < arr.length - 1 ? 'border-b border-stone-100' : ''}`}
                >
                  <p className="text-sm font-semibold text-stone-800">{label}</p>
                  <div className="flex items-center gap-1">
                    <input
                      type={type}
                      inputMode={type === 'number' ? 'decimal' : undefined}
                      value={manual[field]}
                      onChange={e => setM(field)(e.target.value)}
                      placeholder={placeholder}
                      className="w-28 text-right text-sm font-semibold text-stone-900 bg-transparent outline-none border-b border-stone-200 focus:border-slate-400 pb-0.5 placeholder:text-stone-300"
                    />
                    {unit && <span className="text-xs text-stone-400 font-medium ml-1">{unit}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-white border border-stone-100 shadow-sm px-5">
              <div className="flex items-center justify-between py-4 border-b border-stone-100">
                <p className="text-sm font-semibold text-stone-800">Porsiyon Miktarı</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number" inputMode="decimal"
                    value={manual.serving_size}
                    onChange={e => setM('serving_size')(e.target.value)}
                    className="w-16 text-right text-sm font-semibold text-stone-900 bg-transparent outline-none border-b border-stone-200 focus:border-slate-400 pb-0.5"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between py-4">
                <p className="text-sm font-semibold text-stone-800">Birim</p>
                <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                  {['g', 'ml', 'adet', 'porsiyon'].map(u => (
                    <button
                      key={u}
                      onClick={() => setM('serving_unit')(u)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                        manual.serving_unit === u ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-500 font-medium px-1">{error}</p>}

            <button
              onClick={addManual}
              className="w-full py-4 rounded-2xl bg-slate-800 text-white font-bold text-base active:bg-slate-700 transition-colors shadow-md"
            >
              Ekle
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// küçük yardımcı — sadece içeride kullanılıyor
function Plus({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

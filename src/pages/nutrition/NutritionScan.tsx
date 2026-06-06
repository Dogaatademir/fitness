import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Zap } from 'lucide-react'
import { foodLogDb } from '../../lib/db'
import { today } from '../../lib/storage'
import type { MealType, FoodLog } from '../../types'

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle',
  dinner: 'Akşam',
  snack: 'Ara Öğün',
}

async function fetchByBarcode(barcode: string): Promise<Partial<FoodLog> | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
    { headers: { 'User-Agent': 'FitnessTracker/1.0 (nailanildemiray@gmail.com)' } }
  )
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 1) return null
  const p = data.product
  const n = p.nutriments ?? {}
  return {
    food_name: p.product_name_tr || p.product_name || 'Bilinmiyor',
    calories: Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0),
    protein_g: +(n.proteins_100g ?? 0).toFixed(1),
    carb_g: +(n.carbohydrates_100g ?? 0).toFixed(1),
    fat_g: +(n.fat_100g ?? 0).toFixed(1),
    serving_size: 100,
    serving_unit: 'g',
    barcode,
    source: 'api' as const,
  }
}

export default function NutritionScan() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [meal, setMeal] = useState<MealType>('lunch')
  const [serving, setServing] = useState('100')
  const [result, setResult] = useState<Partial<FoodLog> | null>(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [supported, setSupported] = useState(true)
  const detectorRef = useRef<BarcodeDetector | null>(null)
  const rafRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!('BarcodeDetector' in window)) {
      setSupported(false)
      return
    }
    startCamera()
    return () => stopCamera()
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      detectorRef.current = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'] })
      setScanning(true)
      scanLoop()
    } catch {
      setError('Kameraya erişilemiyor. İzin verdiğinden emin ol.')
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  function scanLoop() {
    if (!videoRef.current || !detectorRef.current) return
    rafRef.current = requestAnimationFrame(async () => {
      if (!videoRef.current || !detectorRef.current) return
      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current)
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue
            stopCamera()
            setScanning(false)
            handleBarcode(code)
            return
          }
        } catch {}
      }
      scanLoop()
    })
  }

  async function handleBarcode(code: string) {
    setFetching(true)
    setError('')
    try {
      const product = await fetchByBarcode(code)
      if (product) {
        setResult(product)
      } else {
        setError(`"${code}" barkodu bulunamadı. Ürün veritabanında kayıtlı olmayabilir.`)
      }
    } catch {
      setError('Ürün bilgisi alınamadı. İnternet bağlantını kontrol et.')
    } finally {
      setFetching(false)
    }
  }

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

  async function addFood() {
    if (!result) return
    const s = parseFloat(serving) || 100
    const macros = scaledMacros(result, s)
    await foodLogDb.create({
      date: today(),
      meal_type: meal,
      food_name: result.food_name ?? 'Bilinmiyor',
      ...macros,
      serving_size: s,
      serving_unit: result.serving_unit ?? 'g',
      barcode: result.barcode,
      source: 'api',
    })
    navigate('/nutrition', { replace: true })
  }

  function rescan() {
    setResult(null)
    setError('')
    startCamera()
  }

  const s = parseFloat(serving) || 100
  const macros = result ? scaledMacros(result, s) : null

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-4">
        <button
          onClick={() => { stopCamera(); navigate(-1) }}
          className="text-xs text-stone-400 font-semibold mb-3 flex items-center gap-1 active:text-stone-600"
        >
          ← Geri
        </button>
        <h1 className="text-[28px] font-bold tracking-tight">Barkod Tara</h1>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {!supported ? (
          <div className="rounded-2xl bg-amber-50 border border-amber-100 p-6 text-center">
            <Zap size={24} className="text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-bold text-amber-900 mb-2">Barkod okuyucu desteklenmiyor</p>
            <p className="text-sm text-amber-700 mb-4 leading-relaxed">
              Tarayıcın BarcodeDetector API'yi desteklemiyor. Chrome 88+ veya Safari 17.4+ gerekiyor.
            </p>
            <button
              onClick={() => navigate('/nutrition/log')}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold active:bg-amber-600"
            >
              Manuel Giriş Yap
            </button>
          </div>
        ) : !result ? (
          <>
            {/* Kamera görüntüsü */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-square shadow-md">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {scanning && (
                <>
                  {/* Tarama animasyonu */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-56 h-56 relative">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-lg" />
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 text-center">
                    <span className="text-white text-xs font-medium bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm">
                      Barkodu çerçeve içine al
                    </span>
                  </div>
                </>
              )}
              {fetching && (
                <div className="absolute inset-0 bg-slate-900/70 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <p className="text-white text-sm font-medium">Ürün aranıyor…</p>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
                <p className="text-sm text-red-700 font-medium">{error}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={rescan} className="text-xs font-semibold text-red-600 underline underline-offset-2">
                    Tekrar dene
                  </button>
                  <span className="text-red-300">·</span>
                  <button onClick={() => navigate('/nutrition/log')} className="text-xs font-semibold text-red-600 underline underline-offset-2">
                    Manuel gir
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Ürün bulundu */}
            <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <Check size={11} strokeWidth={2.5} className="text-white" />
                </div>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Ürün Bulundu</p>
              </div>
              <p className="text-base font-bold text-emerald-900 mt-2">{result.food_name}</p>
              <p className="text-xs text-emerald-600 mt-1">Barkod: {result.barcode}</p>
            </div>

            {/* Makrolar (100g baz) */}
            <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-5">
              <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-3">
                100g / 100ml başına
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Kalori', value: result.calories ?? 0, unit: 'kcal' },
                  { label: 'Protein', value: result.protein_g ?? 0, unit: 'g' },
                  { label: 'Karb', value: result.carb_g ?? 0, unit: 'g' },
                  { label: 'Yağ', value: result.fat_g ?? 0, unit: 'g' },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="bg-stone-50 rounded-xl py-3">
                    <p className="text-base font-bold text-stone-900">{value}</p>
                    <p className="text-[10px] text-stone-400 mt-0.5 font-medium">{unit}</p>
                    <p className="text-[9px] text-stone-300 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Öğün + porsiyon */}
            <div className="rounded-2xl bg-white border border-stone-100 shadow-sm px-5">
              {/* Öğün */}
              <div className="py-4 border-b border-stone-100">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Öğün</p>
                <div className="flex gap-1">
                  {(Object.keys(MEAL_LABELS) as MealType[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setMeal(m)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        meal === m ? 'bg-slate-800 text-white' : 'text-stone-400 bg-stone-50'
                      }`}
                    >
                      {MEAL_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Porsiyon */}
              <div className="py-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
                  Porsiyon ({result.serving_unit ?? 'g'})
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={serving}
                    onChange={e => setServing(e.target.value)}
                    className="flex-1 text-center text-2xl font-bold text-stone-900 bg-stone-50 rounded-xl py-3 outline-none border border-stone-100 focus:border-slate-300"
                  />
                  <div className="flex-1 text-center">
                    <p className="text-2xl font-bold text-stone-900">{macros?.calories}</p>
                    <p className="text-xs text-stone-400 mt-0.5">kcal</p>
                  </div>
                </div>
                {macros && (
                  <p className="text-xs text-stone-400 text-center mt-2">
                    P {macros.protein_g}g · K {macros.carb_g}g · Y {macros.fat_g}g
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={addFood}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-800 text-white font-bold text-base active:bg-slate-700 transition-colors shadow-md"
            >
              <Check size={16} />
              Ekle
            </button>

            <button
              onClick={rescan}
              className="w-full py-3 text-sm text-stone-400 font-medium"
            >
              Farklı ürün tara
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// BarcodeDetector tipini tanımla (lib.dom'da yok)
declare class BarcodeDetector {
  constructor(options?: { formats?: string[] })
  detect(image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<{ rawValue: string }[]>
  static getSupportedFormats(): Promise<string[]>
}

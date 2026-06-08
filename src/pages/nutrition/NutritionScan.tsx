import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Zap } from 'lucide-react'
import { foodLogDb } from '../../lib/db'
import { today } from '../../lib/storage'
import type { MealType, FoodLog } from '../../types'

const C = {
  bg:           '#f5f3ef',
  surface:      '#ffffff',
  surfaceHigh:  '#f0ede8',
  border:       'rgba(0,0,0,0.07)',
  borderSub:    'rgba(0,0,0,0.04)',
  text:         '#1a1714',
  textMid:      'rgba(26,23,20,0.45)',
  textLow:      'rgba(26,23,20,0.28)',
  startText:    '#1d4ed8',
  startBg:      'rgba(29,78,216,0.07)',
  startBorder:  'rgba(29,78,216,0.18)',
  successText:  '#166534',
  successBg:    'rgba(22,101,52,0.07)',
  successBorder:'rgba(22,101,52,0.18)',
  ongoingText:  '#b45309',
  ongoingBg:    'rgba(180,83,9,0.08)',
  danger:       '#b91c1c',
  dangerBg:     'rgba(185,28,28,0.07)',
  dangerBorder: 'rgba(185,28,28,0.2)',
}

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
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <div className="px-5 pt-14 pb-4">
        <button
          onClick={() => { stopCamera(); navigate(-1) }}
          className="text-xs font-semibold mb-3 flex items-center gap-1 active:opacity-60 transition-opacity"
          style={{ color: C.textLow }}
        >
          ← Geri
        </button>
        <h1 className="text-[28px] font-bold tracking-tight">Barkod Tara</h1>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {!supported ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{
              background: C.ongoingBg,
              border: `1px solid rgba(180,83,9,0.18)`,
            }}
          >
            <Zap size={24} className="mx-auto mb-3" style={{ color: C.ongoingText }} />
            <p className="text-sm font-bold mb-2" style={{ color: C.ongoingText }}>
              Barkod okuyucu desteklenmiyor
            </p>
            <p className="text-sm mb-4 leading-relaxed" style={{ color: C.ongoingText }}>
              Tarayıcın BarcodeDetector API'yi desteklemiyor. Chrome 88+ veya Safari 17.4+ gerekiyor.
            </p>
            <button
              onClick={() => navigate('/nutrition/log')}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold active:opacity-80 transition-opacity"
              style={{ background: C.text, color: C.bg }}
            >
              Manuel Giriş Yap
            </button>
          </div>
        ) : !result ? (
          <>
            {/* Kamera görüntüsü */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {scanning && (
                <>
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
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <p className="text-white text-sm font-medium">Ürün aranıyor…</p>
                </div>
              )}
            </div>

            {error && (
              <div
                className="rounded-2xl p-4"
                style={{
                  background: C.dangerBg,
                  border: `1px solid ${C.dangerBorder}`,
                }}
              >
                <p className="text-sm font-medium" style={{ color: C.danger }}>{error}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={rescan}
                    className="text-xs font-semibold underline underline-offset-2"
                    style={{ color: C.danger }}
                  >
                    Tekrar dene
                  </button>
                  <span style={{ color: C.dangerBorder }}>·</span>
                  <button
                    onClick={() => navigate('/nutrition/log')}
                    className="text-xs font-semibold underline underline-offset-2"
                    style={{ color: C.danger }}
                  >
                    Manuel gir
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Ürün bulundu */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: C.successBg,
                border: `1px solid ${C.successBorder}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: C.successText }}
                >
                  <Check size={11} strokeWidth={2.5} className="text-white" />
                </div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: C.successText }}
                >
                  Ürün Bulundu
                </p>
              </div>
              <p className="text-base font-bold mt-2" style={{ color: C.successText }}>{result.food_name}</p>
              <p className="text-xs mt-1" style={{ color: C.successText }}>Barkod: {result.barcode}</p>
            </div>

            {/* Makrolar (100g baz) */}
            <div
              className="rounded-2xl p-5"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: C.textLow }}
              >
                100g / 100ml başına
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Kalori', value: result.calories ?? 0, unit: 'kcal' },
                  { label: 'Protein', value: result.protein_g ?? 0, unit: 'g' },
                  { label: 'Karb', value: result.carb_g ?? 0, unit: 'g' },
                  { label: 'Yağ', value: result.fat_g ?? 0, unit: 'g' },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="rounded-xl py-3" style={{ background: C.surfaceHigh }}>
                    <p className="text-base font-bold" style={{ color: C.text }}>{value}</p>
                    <p className="text-[10px] mt-0.5 font-medium" style={{ color: C.textMid }}>{unit}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: C.textLow }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Öğün + porsiyon */}
            <div
              className="rounded-2xl px-5"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              {/* Öğün */}
              <div className="py-4" style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: C.textLow }}
                >
                  Öğün
                </p>
                <div className="flex gap-1">
                  {(Object.keys(MEAL_LABELS) as MealType[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setMeal(m)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
                      style={
                        meal === m
                          ? { background: C.text, color: C.bg }
                          : { background: C.surfaceHigh, color: C.textMid }
                      }
                    >
                      {MEAL_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Porsiyon */}
              <div className="py-4">
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: C.textLow }}
                >
                  Porsiyon ({result.serving_unit ?? 'g'})
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={serving}
                    onChange={e => setServing(e.target.value)}
                    className="flex-1 text-center text-2xl font-bold rounded-xl py-3 outline-none"
                    style={{
                      background: C.surfaceHigh,
                      color: C.text,
                      border: `1px solid ${C.border}`,
                    }}
                  />
                  <div className="flex-1 text-center">
                    <p className="text-2xl font-bold" style={{ color: C.text }}>{macros?.calories}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.textLow }}>kcal</p>
                  </div>
                </div>
                {macros && (
                  <p className="text-xs text-center mt-2" style={{ color: C.textLow }}>
                    P {macros.protein_g}g · K {macros.carb_g}g · Y {macros.fat_g}g
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={addFood}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base active:opacity-80 transition-opacity"
              style={{ background: C.text, color: C.bg }}
            >
              <Check size={16} />
              Ekle
            </button>

            <button
              onClick={rescan}
              className="w-full py-3 text-sm font-medium"
              style={{ color: C.textMid }}
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

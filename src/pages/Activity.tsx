import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import PageSpinner from '../components/PageSpinner'
import { Trash2, ChevronLeft, Loader2, Zap, Plus } from 'lucide-react'
import { activityLogDb } from '../lib/db'
import { profileDb } from '../lib/db'
import { estimateActivityCalories } from '../lib/api'
import { getAgeFromBirthDate } from '../lib/bmr'
import { QK } from '../lib/queryClient'
import type { ActivityLog } from '../types'

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
  danger:       '#b91c1c',
  dangerBg:     'rgba(185,28,28,0.07)',
  dangerBorder: 'rgba(185,28,28,0.2)',
}

const SUGGESTIONS = ['Yürüyüş', 'Koşu', 'Bisiklet', 'Yüzme', 'Padel', 'Tenis', 'Futbol', 'Basketbol', 'Yoga', 'Pilates']

function localDateStr(d: Date = new Date()): string {
  const shifted = new Date(d)
  if (shifted.getHours() < 7) {
    shifted.setDate(shifted.getDate() - 1)
  }
  const y = shifted.getFullYear()
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const day = String(shifted.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Activity() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const todayStr = localDateStr()

  const [activityName, setActivityName] = useState('')
  const [duration, setDuration] = useState('')
  const [estimating, setEstimating] = useState(false)
  const [estimateResult, setEstimateResult] = useState<{ calories_burned: number; notes?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const { data: rawLogs, isLoading } = useQuery({
    queryKey: QK.activityLogs(todayStr),
    queryFn: () => activityLogDb.getByDate(todayStr),
    staleTime: 1000 * 60 * 5,
  })
  const logs: ActivityLog[] = Array.isArray(rawLogs) ? rawLogs : []

  const { data: profile } = useQuery({
    queryKey: QK.profile,
    queryFn: () => profileDb.get(),
    staleTime: Infinity,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => activityLogDb.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.activityLogs(todayStr) })
      qc.invalidateQueries({ queryKey: QK.activityCalories(todayStr) })
    },
  })

  const saveMutation = useMutation({
    mutationFn: (log: Omit<ActivityLog, 'id'>) => activityLogDb.create(log),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.activityLogs(todayStr) })
      qc.invalidateQueries({ queryKey: QK.activityCalories(todayStr) })
      setActivityName('')
      setDuration('')
      setEstimateResult(null)
      setError(null)
      nameInputRef.current?.focus()
    },
  })

  async function handleEstimate() {
    const durationNum = parseInt(duration)
    if (!activityName.trim() || !duration || durationNum <= 0) return
    if (!profile?.weight_kg || !profile?.birth_date) {
      setError('Profil bilgilerini (kilo, doğum tarihi) tamamla.')
      return
    }
    setEstimating(true)
    setError(null)
    try {
      const result = await estimateActivityCalories({
        activityName: activityName.trim(),
        durationMinutes: durationNum,
        weightKg: profile.weight_kg,
        ageYears: getAgeFromBirthDate(profile.birth_date),
      })
      setEstimateResult(result)
    } catch {
      setError('Kalori hesaplanamadı. Tekrar dene.')
    } finally {
      setEstimating(false)
    }
  }

  function handleSave() {
    if (!estimateResult || !activityName.trim()) return
    saveMutation.mutate({
      date: todayStr,
      activity_name: activityName.trim(),
      duration_minutes: duration ? parseInt(duration) : undefined,
      calories_burned: estimateResult.calories_burned,
      notes: estimateResult.notes,
    })
  }

  function handleSuggestion(name: string) {
    setActivityName(name)
    setEstimateResult(null)
    setError(null)
  }

  const totalCalories = logs.reduce((s, l) => s + l.calories_burned, 0)
  const canEstimate = activityName.trim().length > 0 && parseInt(duration) > 0

  if (isLoading) return <PageSpinner />

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>

      {/* Header */}
      <div className="px-5 pt-14 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-xl active:scale-95 transition-transform flex-shrink-0"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMid }}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.textLow }}>Bugün</p>
          <h1 className="text-[24px] font-black tracking-tight leading-tight" style={{ color: C.text }}>
            Aktiviteler
          </h1>
        </div>
        {totalCalories > 0 && (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl flex-shrink-0"
            style={{ background: C.successBg, border: `1px solid ${C.successBorder}` }}
          >
            <Zap size={12} style={{ color: C.successText }} />
            <span className="text-[13px] font-black tabular-nums" style={{ color: C.successText }}>
              {totalCalories} kcal
            </span>
          </div>
        )}
      </div>

      <div className="px-4 space-y-3 pb-32">

        {/* Form kartı */}
        <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="px-5 pt-5 pb-5">

            {/* İki input yan yana */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2" style={{ color: C.textLow }}>
                  Aktivite
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={activityName}
                  onChange={e => { setActivityName(e.target.value); setEstimateResult(null); setError(null) }}
                  onKeyDown={e => e.key === 'Enter' && canEstimate && !estimateResult && handleEstimate()}
                  placeholder="Padel, koşu…"
                  className="w-full px-3 py-3 rounded-xl text-[14px] font-semibold outline-none"
                  style={{ background: C.surfaceHigh, border: `1px solid ${activityName ? C.border : C.borderSub}`, color: C.text }}
                />
              </div>
              <div style={{ width: 88, flexShrink: 0 }}>
                <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2" style={{ color: C.textLow }}>
                  Süre
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={duration}
                    onChange={e => { setDuration(e.target.value); setEstimateResult(null); setError(null) }}
                    onKeyDown={e => e.key === 'Enter' && canEstimate && !estimateResult && handleEstimate()}
                    placeholder="60"
                    className="w-full pl-3 pr-7 py-3 rounded-xl text-[14px] font-semibold outline-none"
                    style={{ background: C.surfaceHigh, border: `1px solid ${duration ? C.border : C.borderSub}`, color: C.text }}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium pointer-events-none" style={{ color: C.textLow }}>
                    dk
                  </span>
                </div>
              </div>
            </div>

            {/* Hızlı öneri chip'leri */}
            {!activityName && (
              <div className="flex gap-1.5 flex-wrap mb-3">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-semibold active:scale-95 transition-transform"
                    style={{ background: C.surfaceHigh, border: `1px solid ${C.borderSub}`, color: C.textMid }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p className="text-[12px] mb-3" style={{ color: C.danger }}>{error}</p>
            )}

            {/* Sonuç veya buton */}
            {estimateResult ? (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${C.successBorder}` }}
              >
                <div className="px-4 py-3" style={{ background: C.successBg }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[22px] font-black tabular-nums leading-none" style={{ color: C.successText }}>
                        ~{estimateResult.calories_burned}
                        <span className="text-[13px] font-semibold ml-1" style={{ color: C.successText }}>kcal</span>
                      </p>
                      {estimateResult.notes && (
                        <p className="text-[11px] mt-1 leading-relaxed" style={{ color: C.successText, opacity: 0.8 }}>
                          {estimateResult.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 ml-3 flex-shrink-0">
                      <button
                        onClick={handleSave}
                        disabled={saveMutation.isPending}
                        className="px-5 py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-transform disabled:opacity-50"
                        style={{ background: C.successText, color: '#fff' }}
                      >
                        {saveMutation.isPending ? 'Kaydediliyor…' : 'Kaydet'}
                      </button>
                      <button
                        onClick={() => setEstimateResult(null)}
                        className="px-5 py-2 rounded-xl text-[12px] font-semibold active:scale-95 transition-transform"
                        style={{ background: 'transparent', color: C.successText }}
                      >
                        Yeniden hesapla
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={handleEstimate}
                disabled={!canEstimate || estimating}
                className="w-full py-3.5 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-35"
                style={{
                  background: canEstimate && !estimating ? C.startText : C.startBg,
                  color: canEstimate && !estimating ? '#fff' : C.startText,
                  border: `1px solid ${C.startBorder}`,
                }}
              >
                {estimating
                  ? <><Loader2 size={15} className="animate-spin" /> Hesaplanıyor…</>
                  : <><Zap size={15} /> Kalori Hesapla</>
                }
              </button>
            )}
          </div>
        </div>

        {/* Bugünkü aktiviteler */}
        {logs.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.borderSub}` }}>
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.textLow }}>
                Bugün
              </p>
              <div className="flex items-center gap-1.5">
                <Zap size={11} style={{ color: C.successText }} />
                <span className="text-[13px] font-black tabular-nums" style={{ color: C.successText }}>
                  {totalCalories} kcal
                </span>
              </div>
            </div>
            {logs.map((log, i) => (
              <div
                key={log.id}
                className="flex items-center gap-3 px-5 py-3.5"
                style={{ borderTop: i > 0 ? `1px solid ${C.borderSub}` : undefined }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: C.startBg }}
                >
                  <Plus size={13} style={{ color: C.startText }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold truncate" style={{ color: C.text }}>{log.activity_name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: C.textLow }}>
                    {log.duration_minutes ? `${log.duration_minutes} dk · ` : ''}
                    <span className="font-semibold tabular-nums" style={{ color: C.successText }}>{log.calories_burned} kcal</span>
                  </p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(log.id)}
                  disabled={deleteMutation.isPending}
                  className="w-8 h-8 flex items-center justify-center rounded-xl active:scale-95 transition-transform disabled:opacity-40"
                  style={{ color: C.textLow }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {logs.length === 0 && !isLoading && (
          <div
            className="rounded-2xl px-5 py-10 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: C.surfaceHigh }}
            >
              <Zap size={18} style={{ color: C.textLow }} />
            </div>
            <p className="text-[13px] font-semibold" style={{ color: C.textMid }}>Bugün henüz aktivite yok</p>
            <p className="text-[11px] mt-1" style={{ color: C.textLow }}>Yukarıdan aktivite ekleyebilirsin</p>
          </div>
        )}
      </div>
    </div>
  )
}


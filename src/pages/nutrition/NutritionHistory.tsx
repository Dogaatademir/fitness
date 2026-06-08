import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { foodLogDb, profileDb } from '../../lib/db'
import { today } from '../../lib/storage'
import { MEAL_LABELS, MEAL_ORDER } from '../../lib/mealConstants'

const C = {
  bg:           '#f5f3ef',
  surface:      '#ffffff',
  surfaceHigh:  '#f0ede8',
  border:       'rgba(0,0,0,0.07)',
  borderSub:    'rgba(0,0,0,0.04)',
  text:         '#1a1714',
  textMid:      'rgba(26,23,20,0.45)',
  textLow:      'rgba(26,23,20,0.28)',
  successText:  '#166534',
  ongoingText:  '#b45309',
  danger:       '#b91c1c',
}
import type { FoodLog } from '../../types'

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return date.toISOString().split('T')[0]
}

function startOfMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01'
}

function daysInMonth(dateStr: string): number {
  const [y, m] = dateStr.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function monthLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', {
    month: 'long', year: 'numeric',
  })
}

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return day === 0 ? 6 : day - 1 // Pazartesi=0
}

interface DaySummary {
  date: string
  calories: number
  hasLogs: boolean
}

export default function NutritionHistory() {
  const navigate = useNavigate()
  const [calGoal, setCalGoal] = useState<number | null>(null)
  const [summaries, setSummaries] = useState<Map<string, DaySummary>>(new Map())
  const [monthStart, setMonthStart] = useState(() => startOfMonth(today()))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedLogs, setSelectedLogs] = useState<FoodLog[]>([])

  useEffect(() => {
    async function load() {
      const [profile, allLogs] = await Promise.all([profileDb.get(), foodLogDb.getAll()])
      if (profile) setCalGoal(profile.daily_calorie_goal)
      else setCalGoal(2200)
      const map = new Map<string, DaySummary>()
      for (const log of allLogs) {
        const existing = map.get(log.date)
        if (existing) existing.calories += log.calories
        else map.set(log.date, { date: log.date, calories: log.calories, hasLogs: true })
      }
      setSummaries(map)
    }
    load()
  }, [])

  function selectDate(date: string) {
    setSelectedDate(date)
    foodLogDb.getByDate(date).then(setSelectedLogs)
  }

  function prevMonth() {
    const [y, m] = monthStart.split('-').map(Number)
    const prev = new Date(y, m - 2, 1)
    setMonthStart(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`)
  }

  function nextMonth() {
    const [y, m] = monthStart.split('-').map(Number)
    const next = new Date(y, m, 1)
    setMonthStart(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`)
  }

  const todayStr = today()
  const days = daysInMonth(monthStart)
  const firstDow = dayOfWeek(monthStart)
  const calendarCells: (string | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: days }, (_, i) => addDays(monthStart, i)),
  ]
  while (calendarCells.length % 7 !== 0) calendarCells.push(null)

  const selectedTotal = selectedLogs.reduce((s, f) => s + f.calories, 0)
  const selectedByMeal = MEAL_ORDER.reduce((acc, mealType) => {
    const foods = selectedLogs.filter(f => f.meal_type === mealType)
    if (foods.length > 0) acc[mealType] = foods
    return acc
  }, {} as Record<string, FoodLog[]>)

  const DOT_COLORS = {
    success: C.successText,
    ongoing: C.ongoingText,
    danger:  C.danger,
  }

  // Takvim yüklenirken nokta renkleri calGoal'a bağlı, null iken render etme
  const goalReady = calGoal !== null

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <div className="px-5 pt-14 pb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-xs font-semibold mb-3 flex items-center gap-1 active:opacity-60 transition-opacity"
          style={{ color: C.textLow }}
        >
          ← Geri
        </button>
        <h1 className="text-[32px] font-bold tracking-tight">Geçmiş</h1>
      </div>

      <div className="px-4 pb-10 space-y-4">
        {/* Takvim */}
        <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {/* Ay navigasyonu */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-xl active:opacity-60 transition-opacity"
              style={{ border: `1px solid ${C.border}`, color: C.textMid }}
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-bold capitalize" style={{ color: C.text }}>{monthLabel(monthStart)}</p>
            <button
              onClick={nextMonth}
              disabled={monthStart >= todayStr.slice(0, 7) + '-01'}
              className="w-8 h-8 flex items-center justify-center rounded-xl active:opacity-60 transition-opacity disabled:opacity-30"
              style={{ border: `1px solid ${C.border}`, color: C.textMid }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Gün başlıkları */}
          <div className="grid grid-cols-7 mb-2">
            {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(d => (
              <div key={d} className="text-center text-[10px] font-semibold pb-1" style={{ color: C.textLow }}>{d}</div>
            ))}
          </div>

          {/* Takvim hücreleri */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((date, i) => {
              if (!date) return <div key={i} />
              const summary = summaries.get(date)
              const isToday = date === todayStr
              const isFuture = date > todayStr
              const isSelected = date === selectedDate
              const calPct = goalReady && summary ? Math.min(summary.calories / calGoal!, 1) : 0
              const over = goalReady && summary ? summary.calories > calGoal! : false

              let dotColor = C.textLow
              if (goalReady && summary?.hasLogs) {
                dotColor = over ? DOT_COLORS.danger : calPct >= 0.8 ? DOT_COLORS.success : DOT_COLORS.ongoing
              }

              let cellBg = 'transparent'
              if (isSelected) cellBg = C.text
              else if (isToday) cellBg = C.surfaceHigh

              return (
                <button
                  key={date}
                  onClick={() => !isFuture && selectDate(date)}
                  disabled={isFuture}
                  className="aspect-square flex flex-col items-center justify-center rounded-xl transition-all active:opacity-70"
                  style={{
                    background: cellBg,
                    opacity: isFuture ? 0.25 : 1,
                    cursor: isFuture ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span
                    className="text-xs font-semibold leading-none"
                    style={{ color: isSelected ? C.bg : isToday ? C.text : C.textMid }}
                  >
                    {date.split('-')[2].replace(/^0/, '')}
                  </span>
                  {summary?.hasLogs && (
                    <span
                      className="w-1 h-1 rounded-full mt-1"
                      style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.5)' : dotColor }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Renk açıklaması */}
          <div
            className="flex items-center gap-4 mt-4 pt-4"
            style={{ borderTop: `1px solid ${C.borderSub}` }}
          >
            {[
              { color: DOT_COLORS.success, label: 'Hedef tuttu' },
              { color: DOT_COLORS.ongoing, label: 'Eksik' },
              { color: DOT_COLORS.danger,  label: 'Aştı' },
              { color: C.textLow,          label: 'Giriş yok' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] font-medium" style={{ color: C.textLow }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Seçili gün detayı */}
        {selectedDate && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.borderSub}` }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold capitalize" style={{ color: C.text }}>
                  {(() => {
                    const [y, m, d] = selectedDate.split('-').map(Number)
                    return new Date(y, m - 1, d).toLocaleDateString('tr-TR', {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })
                  })()}
                </p>
                <span
                  className="text-sm font-bold"
                  style={{ color: calGoal && selectedTotal > calGoal ? C.danger : C.textMid }}
                >
                  {Math.round(selectedTotal)} kcal
                </span>
              </div>
              {selectedLogs.length > 0 && (
                <p className="text-xs mt-0.5" style={{ color: C.textLow }}>
                  P {Math.round(selectedLogs.reduce((s, f) => s + f.protein_g, 0))}g
                  {' · '}K {Math.round(selectedLogs.reduce((s, f) => s + f.carb_g, 0))}g
                  {' · '}Y {Math.round(selectedLogs.reduce((s, f) => s + f.fat_g, 0))}g
                </p>
              )}
            </div>

            {selectedLogs.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-sm" style={{ color: C.textMid }}>Bu gün için kayıt yok.</p>
              </div>
            ) : (
              Object.entries(selectedByMeal).map(([mealType, foods]) => (
                <div key={mealType} style={{ borderBottom: `1px solid ${C.borderSub}` }} className="last:border-b-0">
                  <div className="px-5 py-3 flex items-center justify-between">
                    <p
                      className="text-[11px] font-semibold uppercase tracking-widest"
                      style={{ color: C.textLow }}
                    >
                      {MEAL_LABELS[mealType as keyof typeof MEAL_LABELS] ?? mealType}
                    </p>
                    <p className="text-xs font-medium" style={{ color: C.textLow }}>
                      {Math.round(foods.reduce((s, f) => s + f.calories, 0))} kcal
                    </p>
                  </div>
                  {foods.map(food => (
                    <div
                      key={food.id}
                      className="flex items-center justify-between px-5 py-2.5"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium truncate" style={{ color: C.text }}>{food.food_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.textLow }}>
                          {food.serving_size} {food.serving_unit}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: C.textMid }}>
                        {Math.round(food.calories)} kcal
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

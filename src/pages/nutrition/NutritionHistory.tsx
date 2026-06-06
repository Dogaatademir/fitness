import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { foodLogDb, profileDb } from '../../lib/db'
import { today } from '../../lib/storage'
import type { FoodLog } from '../../types'

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle',
  dinner: 'Akşam',
  snack: 'Ara Öğün',
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function startOfMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01'
}

function daysInMonth(dateStr: string): number {
  const [y, m] = dateStr.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function monthLabel(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    month: 'long', year: 'numeric',
  })
}

function dayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00').getDay()
  return d === 0 ? 6 : d - 1 // Pazartesi=0
}

interface DaySummary {
  date: string
  calories: number
  hasLogs: boolean
}

export default function NutritionHistory() {
  const navigate = useNavigate()
  const [calGoal, setCalGoal] = useState(2200)
  const [summaries, setSummaries] = useState<Map<string, DaySummary>>(new Map())
  const [monthStart, setMonthStart] = useState(() => startOfMonth(today()))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedLogs, setSelectedLogs] = useState<FoodLog[]>([])

  useEffect(() => {
    async function load() {
      const [profile, allLogs] = await Promise.all([profileDb.get(), foodLogDb.getAll()])
      if (profile) setCalGoal(profile.daily_calorie_goal)
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
    const d = new Date(monthStart + 'T12:00:00')
    d.setMonth(d.getMonth() - 1)
    setMonthStart(d.toISOString().split('T')[0].slice(0, 7) + '-01')
  }

  function nextMonth() {
    const d = new Date(monthStart + 'T12:00:00')
    d.setMonth(d.getMonth() + 1)
    setMonthStart(d.toISOString().split('T')[0].slice(0, 7) + '-01')
  }

  const todayStr = today()
  const days = daysInMonth(monthStart)
  const firstDow = dayOfWeek(monthStart)
  const calendarCells: (string | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: days }, (_, i) => addDays(monthStart, i)),
  ]
  // Haftayı tamamla
  while (calendarCells.length % 7 !== 0) calendarCells.push(null)

  const selectedTotal = selectedLogs.reduce((s, f) => s + f.calories, 0)
  const selectedByMeal = selectedLogs.reduce((acc, f) => {
    if (!acc[f.meal_type]) acc[f.meal_type] = []
    acc[f.meal_type].push(f)
    return acc
  }, {} as Record<string, FoodLog[]>)

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-stone-400 font-semibold mb-3 flex items-center gap-1 active:text-stone-600"
        >
          ← Geri
        </button>
        <h1 className="text-[32px] font-bold tracking-tight">Geçmiş</h1>
      </div>

      <div className="px-4 pb-10 space-y-4">
        {/* Takvim */}
        <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-5">
          {/* Ay navigasyonu */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-stone-100 text-stone-400 active:bg-stone-50 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-bold text-stone-900 capitalize">{monthLabel(monthStart)}</p>
            <button
              onClick={nextMonth}
              disabled={monthStart >= todayStr.slice(0, 7) + '-01'}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-stone-100 text-stone-400 active:bg-stone-50 transition-colors disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Gün başlıkları */}
          <div className="grid grid-cols-7 mb-2">
            {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-stone-400 pb-1">{d}</div>
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
              const calPct = summary ? Math.min(summary.calories / calGoal, 1) : 0
              const over = summary ? summary.calories > calGoal : false

              let dotColor = 'bg-stone-200'
              if (summary?.hasLogs) {
                dotColor = over ? 'bg-red-400' : calPct >= 0.8 ? 'bg-emerald-400' : 'bg-amber-400'
              }

              return (
                <button
                  key={date}
                  onClick={() => !isFuture && selectDate(date)}
                  disabled={isFuture}
                  className={`aspect-square flex flex-col items-center justify-center rounded-xl transition-all ${
                    isSelected
                      ? 'bg-slate-800'
                      : isToday
                        ? 'bg-stone-100'
                        : 'hover:bg-stone-50 active:bg-stone-100'
                  } ${isFuture ? 'opacity-25 cursor-default' : ''}`}
                >
                  <span className={`text-xs font-semibold leading-none ${
                    isSelected ? 'text-white' : isToday ? 'text-slate-700' : 'text-stone-700'
                  }`}>
                    {date.split('-')[2].replace(/^0/, '')}
                  </span>
                  {summary?.hasLogs && (
                    <span className={`w-1 h-1 rounded-full mt-1 ${
                      isSelected ? 'bg-white/60' : dotColor
                    }`} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Renk açıklaması */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-stone-50">
            {[
              { color: 'bg-emerald-400', label: 'Hedef tuttu' },
              { color: 'bg-amber-400', label: 'Eksik' },
              { color: 'bg-red-400', label: 'Aştı' },
              { color: 'bg-stone-200', label: 'Giriş yok' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-[10px] text-stone-400 font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Seçili gün detayı */}
        {selectedDate && (
          <div className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-50">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-stone-900 capitalize">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('tr-TR', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </p>
                <span className={`text-sm font-bold ${selectedTotal > calGoal ? 'text-red-500' : 'text-stone-700'}`}>
                  {Math.round(selectedTotal)} kcal
                </span>
              </div>
              {selectedLogs.length > 0 && (
                <p className="text-xs text-stone-400 mt-0.5">
                  P {Math.round(selectedLogs.reduce((s,f) => s+f.protein_g,0))}g
                  {' · '}K {Math.round(selectedLogs.reduce((s,f) => s+f.carb_g,0))}g
                  {' · '}Y {Math.round(selectedLogs.reduce((s,f) => s+f.fat_g,0))}g
                </p>
              )}
            </div>

            {selectedLogs.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-sm text-stone-400">Bu gün için kayıt yok.</p>
              </div>
            ) : (
              Object.entries(selectedByMeal).map(([mealType, foods]) => (
                <div key={mealType} className="border-b border-stone-50 last:border-0">
                  <div className="px-5 py-3 flex items-center justify-between">
                    <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                      {MEAL_LABELS[mealType] ?? mealType}
                    </p>
                    <p className="text-xs text-stone-400 font-medium">
                      {Math.round(foods.reduce((s,f) => s+f.calories,0))} kcal
                    </p>
                  </div>
                  {foods.map(food => (
                    <div key={food.id} className="flex items-center justify-between px-5 py-2.5">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium text-stone-800 truncate">{food.food_name}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {food.serving_size} {food.serving_unit}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-stone-600 tabular-nums flex-shrink-0">
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

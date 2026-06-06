import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, History, Scan } from 'lucide-react'
import { foodLogDb, profileDb } from '../../lib/db'
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

function Ring({ value, max, size = 88, stroke = 6, over = false, children }: {
  value: number; max: number; size?: number; stroke?: number
  over?: boolean; children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(value / Math.max(max, 1), 1)
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ede9e3" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={over ? '#dc2626' : '#334155'}
          strokeWidth={stroke}
          strokeDasharray={`${pct * circ} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min((value / Math.max(goal, 1)) * 100, 100)
  const over = value > goal
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-stone-500 font-medium">{label}</span>
        <span className={over ? 'text-red-500 font-semibold' : 'text-stone-600 font-semibold'}>
          {Math.round(value)}<span className="text-stone-300 font-normal">/{goal}g</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: over ? '#dc2626' : color }}
        />
      </div>
    </div>
  )
}

export default function Nutrition() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const todayStr = today()

  const { data: logs = [] } = useQuery({
    queryKey: QK.nutrition(todayStr),
    queryFn: () => foodLogDb.getByDate(todayStr),
    staleTime: 1000 * 60 * 2,
  })

  const { data: profile } = useQuery({
    queryKey: QK.profile,
    queryFn: () => profileDb.get(),
    staleTime: Infinity,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => foodLogDb.delete(id),
    onMutate: (id) => {
      qc.setQueryData(QK.nutrition(todayStr), (prev: FoodLog[]) =>
        (prev ?? []).filter(f => f.id !== id)
      )
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.nutrition(todayStr) })
      qc.invalidateQueries({ queryKey: QK.dashboard })
    },
  })

  const calorieGoal  = profile?.daily_calorie_goal  ?? 2200
  const proteinGoal  = profile?.daily_protein_goal  ?? 160
  const carbGoal     = profile?.daily_carb_goal     ?? 250
  const fatGoal      = profile?.daily_fat_goal      ?? 70

  const totalCal     = logs.reduce((s, f) => s + f.calories,  0)
  const totalProtein = logs.reduce((s, f) => s + f.protein_g, 0)
  const totalCarb    = logs.reduce((s, f) => s + f.carb_g,    0)
  const totalFat     = logs.reduce((s, f) => s + f.fat_g,     0)
  const remaining    = calorieGoal - totalCal
  const over         = remaining < 0

  const dateLabel = new Date(todayStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-stone-900">
      <div className="px-5 pt-14 pb-6 flex items-start justify-between">
        <div>
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wide mb-0.5 capitalize">
            {dateLabel}
          </p>
          <h1 className="text-[32px] font-bold tracking-tight">Beslenme</h1>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => navigate('/nutrition/history')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-stone-100 shadow-sm text-stone-400 active:bg-stone-50 transition-colors"
          >
            <History size={15} />
          </button>
          <button
            onClick={() => navigate('/nutrition/scan')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-stone-100 shadow-sm text-stone-400 active:bg-stone-50 transition-colors"
          >
            <Scan size={15} />
          </button>
        </div>
      </div>

      <div className="px-4 pb-10 space-y-3">
        <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-5">
          <div className="flex items-center gap-5 mb-5">
            <Ring value={totalCal} max={calorieGoal} over={over}>
              <div className="text-center">
                <p className="text-[15px] font-bold leading-none text-stone-900">{Math.round(totalCal)}</p>
                <p className="text-[9px] text-stone-400 mt-0.5 font-medium">kcal</p>
              </div>
            </Ring>
            <div className="flex-1">
              <div className="mb-1">
                {over ? (
                  <p className="text-base font-bold text-red-500">{Math.abs(remaining)} kcal aşıldı</p>
                ) : (
                  <p className="text-base font-bold text-stone-900">
                    {remaining}{' '}
                    <span className="text-sm font-normal text-stone-400">kcal kaldı</span>
                  </p>
                )}
                <p className="text-xs text-stone-400 mt-0.5">hedef {calorieGoal} kcal</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <MacroBar label="Protein"      value={totalProtein} goal={proteinGoal} color="#3b82f6" />
            <MacroBar label="Karbonhidrat" value={totalCarb}    goal={carbGoal}    color="#f59e0b" />
            <MacroBar label="Yağ"          value={totalFat}     goal={fatGoal}     color="#f97316" />
          </div>
        </div>

        {MEAL_ORDER.map(mealType => {
          const mealLogs = logs.filter(f => f.meal_type === mealType)
          const mealCal  = mealLogs.reduce((s, f) => s + f.calories, 0)
          return (
            <div key={mealType} className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-bold text-stone-900">{MEAL_LABELS[mealType]}</p>
                  {mealCal > 0 && <p className="text-xs text-stone-400 mt-0.5">{Math.round(mealCal)} kcal</p>}
                </div>
                <button
                  onClick={() => navigate('/nutrition/log', { state: { meal: mealType } })}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-stone-50 border border-stone-100 text-stone-500 active:bg-stone-100 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>

              {mealLogs.length > 0 && (
                <div className="border-t border-stone-50">
                  {mealLogs.map((food, i) => (
                    <div
                      key={food.id}
                      className={`flex items-center justify-between px-5 py-3 ${i > 0 ? 'border-t border-stone-50' : ''}`}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium text-stone-800 truncate">{food.food_name}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {food.serving_size} {food.serving_unit}
                          {' · '}P {Math.round(food.protein_g)}g
                          {' · '}K {Math.round(food.carb_g)}g
                          {' · '}Y {Math.round(food.fat_g)}g
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-semibold text-stone-700 tabular-nums">
                          {Math.round(food.calories)} kcal
                        </span>
                        <button
                          onClick={() => deleteMutation.mutate(food.id)}
                          className="text-stone-200 active:text-red-400 transition-colors"
                        >
                          <Plus size={14} className="rotate-45" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {mealLogs.length === 0 && (
                <div className="px-5 pb-4">
                  <p className="text-xs text-stone-300">Henüz eklenmedi</p>
                </div>
              )}
            </div>
          )
        })}

        <button
          onClick={() => navigate('/nutrition/log')}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-800 text-white font-semibold text-sm active:bg-slate-700 transition-colors shadow-md"
        >
          <Plus size={15} />
          Besin Ekle
        </button>
      </div>
    </div>
  )
}

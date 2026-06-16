import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, History, X } from 'lucide-react'
import PageSpinner from '../../components/PageSpinner'
import { foodLogDb, profileDb } from '../../lib/db'
import { today } from '../../lib/storage'
import { QK } from '../../lib/queryClient'
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
import type { FoodLog, MealType } from '../../types'

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min((value / Math.max(goal, 1)) * 100, 100)
  const over = value > goal
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span style={{ color: C.textMid }} className="font-medium">{label}</span>
        <span style={{ color: over ? C.danger : C.text }} className="font-semibold">
          {Math.round(value)}<span style={{ color: C.textLow }} className="font-normal">/{goal}g</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: C.surfaceHigh }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: over ? C.danger : color }}
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

  const { data: profile, isLoading: profileLoading } = useQuery({
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

  if (profileLoading) return <PageSpinner />

  const calorieGoal  = profile?.daily_calorie_goal  ?? 1600
  const proteinGoal  = profile?.daily_protein_goal  ?? 160
  const carbGoal     = profile?.daily_carb_goal     ?? 135
  const fatGoal      = profile?.daily_fat_goal      ?? 47

  const totalCal     = logs.reduce((s, f) => s + f.calories,  0)
  const totalProtein = logs.reduce((s, f) => s + f.protein_g, 0)
  const totalCarb    = logs.reduce((s, f) => s + f.carb_g,    0)
  const totalFat     = logs.reduce((s, f) => s + f.fat_g,     0)
  const remaining    = calorieGoal - totalCal
  const over         = remaining < 0

  const calPct = Math.min(totalCal / Math.max(calorieGoal, 1), 1)

  const dateLabel = new Date(todayStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const hasAnyLog = logs.length > 0

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <div className="px-5 pt-14 pb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-0.5 capitalize" style={{ color: C.textLow }}>
            {dateLabel}
          </p>
          <h1 className="text-[32px] font-bold tracking-tight">Beslenme</h1>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => navigate('/nutrition/history')}
            className="w-9 h-9 flex items-center justify-center rounded-xl active:opacity-60 transition-opacity"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMid }}
          >
            <History size={15} />
          </button>
        </div>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {/* Kalori kartı */}
        <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {profileLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-8 w-32 rounded-lg" style={{ background: C.surfaceHigh }} />
              <div className="h-1.5 rounded-full" style={{ background: C.surfaceHigh }} />
              <div className="space-y-3 pt-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <div className="h-3 w-16 rounded" style={{ background: C.surfaceHigh }} />
                      <div className="h-3 w-12 rounded" style={{ background: C.surfaceHigh }} />
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: C.surfaceHigh }} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[32px] font-bold tracking-tight leading-none" style={{ color: C.text }}>
                  {Math.round(totalCal)}
                </span>
                <span className="text-sm font-medium" style={{ color: over ? C.danger : C.textMid }}>
                  {over
                    ? `${Math.abs(Math.round(remaining))} kcal aşıldı`
                    : `${Math.round(remaining)} kcal kaldı`}
                </span>
              </div>
              <p className="text-xs mb-3" style={{ color: C.textLow }}>hedef {calorieGoal} kcal</p>
              <div className="h-1.5 rounded-full mb-5" style={{ background: C.surfaceHigh }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${calPct * 100}%`,
                    backgroundColor: over ? C.danger : C.startText,
                  }}
                />
              </div>
              <div className="space-y-3">
                <MacroBar label="Protein"      value={totalProtein} goal={proteinGoal} color="#4f46e5" />
                <MacroBar label="Karbonhidrat" value={totalCarb}    goal={carbGoal}    color="#166534" />
                <MacroBar label="Yağ"          value={totalFat}     goal={fatGoal}     color="#b45309" />
              </div>
            </>
          )}
        </div>

        {/* Boş durum */}
        {!hasAnyLog && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <p className="text-[28px] mb-2">🥗</p>
            <p className="text-sm font-semibold mb-1" style={{ color: C.text }}>Bugün henüz bir şey eklemedin</p>
            <p className="text-xs mb-4" style={{ color: C.textMid }}>İlk öğününü ekleyerek güne başla.</p>
            <button
              onClick={() => navigate('/nutrition/log')}
              className="px-5 py-2.5 rounded-xl text-sm font-bold active:opacity-80 transition-opacity"
              style={{ background: C.text, color: C.bg }}
            >
              Besin Ekle
            </button>
          </div>
        )}

        {MEAL_ORDER.map((mealType: MealType) => {
          const mealLogs = logs.filter(f => f.meal_type === mealType)
          const mealCal  = mealLogs.reduce((s, f) => s + f.calories, 0)
          return (
            <div
              key={mealType}
              className="rounded-2xl overflow-hidden"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-bold" style={{ color: C.text }}>{MEAL_LABELS[mealType]}</p>
                  {mealCal > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: C.textLow }}>{Math.round(mealCal)} kcal</p>
                  )}
                </div>
                <button
                  onClick={() => navigate('/nutrition/log', { state: { meal: mealType } })}
                  className="w-8 h-8 flex items-center justify-center rounded-xl active:opacity-60 transition-opacity"
                  style={{ background: C.surfaceHigh, border: `1px solid ${C.borderSub}`, color: C.textMid }}
                >
                  <Plus size={14} />
                </button>
              </div>

              {mealLogs.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.borderSub}` }}>
                  {mealLogs.map((food, i) => (
                    <div
                      key={food.id}
                      className="flex items-center justify-between px-5 py-3"
                      style={i > 0 ? { borderTop: `1px solid ${C.borderSub}` } : {}}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium truncate" style={{ color: C.text }}>{food.food_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.textLow }}>
                          {food.serving_size} {food.serving_unit}
                          {' · '}P {Math.round(food.protein_g)}g
                          {' · '}K {Math.round(food.carb_g)}g
                          {' · '}Y {Math.round(food.fat_g)}g
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-semibold tabular-nums" style={{ color: C.textMid }}>
                          {Math.round(food.calories)} kcal
                        </span>
                        <button
                          onClick={() => deleteMutation.mutate(food.id)}
                          className="active:opacity-60 transition-opacity"
                          style={{ color: C.textLow }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {mealLogs.length === 0 && (
                <div className="px-5 pb-4">
                  <p className="text-xs" style={{ color: C.textLow }}>Henüz eklenmedi</p>
                </div>
              )}
            </div>
          )
        })}

        {hasAnyLog && (
          <button
            onClick={() => navigate('/nutrition/log')}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm active:opacity-80 transition-opacity"
            style={{ background: C.text, color: C.bg }}
          >
            <Plus size={15} />
            Besin Ekle
          </button>
        )}
      </div>
    </div>
  )
}

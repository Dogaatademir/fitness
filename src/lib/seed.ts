import {
  programDb, programDayDb, exerciseDb,
  sessionDb, setDb, profileDb, bodyDb,
  prDb, foodLogDb, waterDb,
} from './db'
import { today } from './storage'

// ─── HELPERS ──────────────────────────────────────────────────
type S = { reps?: number; weight_kg?: number; held_seconds?: number; duration_minutes?: number; completed?: boolean }

function addSets(sessionId: string, exerciseId: string, data: S[]) {
  data.forEach((s, i) =>
    setDb.create({
      session_id: sessionId,
      exercise_id: exerciseId,
      set_number: i + 1,
      completed: s.completed ?? true,
      reps: s.reps,
      weight_kg: s.weight_kg,
      held_seconds: s.held_seconds,
      duration_minutes: s.duration_minutes,
    })
  )
}

function clearAll() {
  const keys = [
    'ft_programs', 'ft_program_days', 'ft_exercises',
    'ft_sessions', 'ft_sets', 'ft_personal_records',
    'ft_food_logs', 'ft_body_measurements', 'ft_water_logs', 'ft_profile',
  ]
  keys.forEach(k => localStorage.removeItem(k))
}

// ─── CORE SEED ────────────────────────────────────────────────
function seed() {
  // ── Profil ────────────────────────────────────────────────
  profileDb.save({
    height_cm: 172,
    weight_kg: 79.5,
    daily_calorie_goal: 2200,
    daily_protein_goal: 160,
    daily_carb_goal: 240,
    daily_fat_goal: 65,
    training_calorie_goal: 2500,
  })

  // ── Vücut Ölçümleri ───────────────────────────────────────
  for (const m of [
    { date: '2026-04-01', weight_kg: 82.0, waist_cm: 86 },
    { date: '2026-04-15', weight_kg: 81.2, waist_cm: 85 },
    { date: '2026-05-01', weight_kg: 80.5, waist_cm: 84 },
    { date: '2026-05-15', weight_kg: 79.8, waist_cm: 83 },
    { date: '2026-05-28', weight_kg: 79.5, waist_cm: 82 },
  ]) bodyDb.create(m)

  // ── Program ───────────────────────────────────────────────
  const program = programDb.create({
    name: 'PPL + Hafif Bacak',
    description: '4 gün itme/çekme split',
    is_active: true,
  })

  // ── Gün 1 — İtiş A + Hafif Bacak (Pazartesi) ──────────────
  const day1 = programDayDb.create({ program_id: program.id, day_name: 'İtiş A + Hafif Bacak', weekday: 1, order_index: 0 })
  const d1 = [
    exerciseDb.create({ program_day_id: day1.id, order_index: 0, name: 'Dumbbell Chest Press', type: 'strength', muscle_group: 'Göğüs', target_sets: 3, target_reps_min: 8, target_reps_max: 10, rest_seconds: 90, notes: 'Ana göğüs hareketi.' }),
    exerciseDb.create({ program_day_id: day1.id, order_index: 1, name: 'Incline Dumbbell Press', type: 'strength', muscle_group: 'Göğüs', target_sets: 3, target_reps_min: 8, target_reps_max: 10, rest_seconds: 90, notes: 'Üst göğüs için.' }),
    exerciseDb.create({ program_day_id: day1.id, order_index: 2, name: 'Overhead Dumbbell Press', type: 'strength', muscle_group: 'Omuz', target_sets: 3, target_reps_min: 8, target_reps_max: 10, rest_seconds: 90 }),
    exerciseDb.create({ program_day_id: day1.id, order_index: 3, name: 'Lateral Raise', type: 'strength', muscle_group: 'Omuz', target_sets: 3, target_reps_min: 12, target_reps_max: 15, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day1.id, order_index: 4, name: 'Triceps Pushdown', type: 'strength', muscle_group: 'Triceps', target_sets: 3, target_reps_min: 10, target_reps_max: 12, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day1.id, order_index: 5, name: 'Leg Press', type: 'strength', muscle_group: 'Bacak', target_sets: 2, target_reps_min: 12, target_reps_max: 15, rest_seconds: 90, notes: 'Hafif/orta yoğunluk.' }),
    exerciseDb.create({ program_day_id: day1.id, order_index: 6, name: 'Eğimli Yürüyüş', type: 'cardio', muscle_group: 'Kardiyo', target_duration_minutes: 15 }),
  ]

  // ── Gün 2 — Çekiş A + Core (Salı) ────────────────────────
  const day2 = programDayDb.create({ program_id: program.id, day_name: 'Çekiş A + Core', weekday: 2, order_index: 1 })
  const d2 = [
    exerciseDb.create({ program_day_id: day2.id, order_index: 0, name: 'Lat Pulldown', type: 'strength', muscle_group: 'Sırt', target_sets: 3, target_reps_min: 8, target_reps_max: 10, rest_seconds: 90 }),
    exerciseDb.create({ program_day_id: day2.id, order_index: 1, name: 'Seated Cable Row', type: 'strength', muscle_group: 'Sırt', target_sets: 3, target_reps_min: 8, target_reps_max: 10, rest_seconds: 90 }),
    exerciseDb.create({ program_day_id: day2.id, order_index: 2, name: 'Face Pull', type: 'strength', muscle_group: 'Omuz', target_sets: 3, target_reps_min: 12, target_reps_max: 15, rest_seconds: 60, notes: 'Omuz sağlığı için kalmalı.' }),
    exerciseDb.create({ program_day_id: day2.id, order_index: 3, name: 'Dumbbell Biceps Curl', type: 'strength', muscle_group: 'Biceps', target_sets: 3, target_reps_min: 10, target_reps_max: 12, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day2.id, order_index: 4, name: 'Hammer Curl', type: 'strength', muscle_group: 'Biceps', target_sets: 2, target_reps_min: 10, target_reps_max: 12, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day2.id, order_index: 5, name: 'Plank', type: 'timed', muscle_group: 'Karın', target_sets: 3, target_duration_seconds: 40, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day2.id, order_index: 6, name: 'Hanging Knee Raise', type: 'strength', muscle_group: 'Karın', target_sets: 3, target_reps_min: 10, target_reps_max: 12, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day2.id, order_index: 7, name: 'Kondisyon Bisikleti', type: 'cardio', muscle_group: 'Kardiyo', target_duration_minutes: 15 }),
  ]

  // ── Gün 3 — İtiş B + Kalça/Arka Bacak (Perşembe) ─────────
  const day3 = programDayDb.create({ program_id: program.id, day_name: 'İtiş B + Kalça/Arka Bacak', weekday: 4, order_index: 2 })
  const d3 = [
    exerciseDb.create({ program_day_id: day3.id, order_index: 0, name: 'Incline Dumbbell Press', type: 'strength', muscle_group: 'Göğüs', target_sets: 3, target_reps_min: 8, target_reps_max: 10, rest_seconds: 90 }),
    exerciseDb.create({ program_day_id: day3.id, order_index: 1, name: 'Chest Press Machine', type: 'strength', muscle_group: 'Göğüs', target_sets: 3, target_reps_min: 10, target_reps_max: 12, rest_seconds: 90 }),
    exerciseDb.create({ program_day_id: day3.id, order_index: 2, name: 'Cable Lateral Raise', type: 'strength', muscle_group: 'Omuz', target_sets: 3, target_reps_min: 12, target_reps_max: 15, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day3.id, order_index: 3, name: 'Rear Delt Fly', type: 'strength', muscle_group: 'Omuz', target_sets: 3, target_reps_min: 12, target_reps_max: 15, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day3.id, order_index: 4, name: 'Overhead Dumbbell Extension', type: 'strength', muscle_group: 'Triceps', target_sets: 3, target_reps_min: 10, target_reps_max: 12, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day3.id, order_index: 5, name: 'Romanian Deadlift', type: 'strength', muscle_group: 'Arka Bacak', target_sets: 2, target_reps_min: 10, target_reps_max: 12, rest_seconds: 90 }),
    exerciseDb.create({ program_day_id: day3.id, order_index: 6, name: 'Elliptical', type: 'cardio', muscle_group: 'Kardiyo', target_duration_minutes: 15 }),
  ]

  // ── Gün 4 — Çekiş B + Core + Hafif Bacak (Cuma) ──────────
  const day4 = programDayDb.create({ program_id: program.id, day_name: 'Çekiş B + Core + Hafif Bacak', weekday: 5, order_index: 3 })
  const d4 = [
    exerciseDb.create({ program_day_id: day4.id, order_index: 0, name: 'One Arm Dumbbell Row', type: 'strength', muscle_group: 'Sırt', target_sets: 3, target_reps_min: 8, target_reps_max: 10, rest_seconds: 90 }),
    exerciseDb.create({ program_day_id: day4.id, order_index: 1, name: 'Close Grip Pulldown', type: 'strength', muscle_group: 'Sırt', target_sets: 3, target_reps_min: 10, target_reps_max: 12, rest_seconds: 90 }),
    exerciseDb.create({ program_day_id: day4.id, order_index: 2, name: 'Face Pull / Reverse Pec Deck', type: 'strength', muscle_group: 'Omuz', target_sets: 3, target_reps_min: 12, target_reps_max: 15, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day4.id, order_index: 3, name: 'Cable Curl', type: 'strength', muscle_group: 'Biceps', target_sets: 3, target_reps_min: 10, target_reps_max: 12, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day4.id, order_index: 4, name: 'Cable Crunch', type: 'strength', muscle_group: 'Karın', target_sets: 3, target_reps_min: 10, target_reps_max: 12, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day4.id, order_index: 5, name: 'Side Plank / Pallof Press', type: 'timed', muscle_group: 'Karın', target_sets: 3, target_duration_seconds: 30, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day4.id, order_index: 6, name: 'Walking Lunge / Step-Up', type: 'strength', muscle_group: 'Bacak', target_sets: 2, target_reps_min: 10, target_reps_max: 12, rest_seconds: 60 }),
    exerciseDb.create({ program_day_id: day4.id, order_index: 7, name: 'Stairmaster / Eğimli Yürüyüş', type: 'cardio', muscle_group: 'Kardiyo', target_duration_minutes: 15 }),
  ]

  // ─── ANTRENMAN GEÇMİŞİ ────────────────────────────────────
  // Bugün: Pazar 31 Mayıs 2026. Streak ve haftalık istatistik için:
  //   • Bu hafta (Pzt 25 - Paz 31): 25 Pzt, 26 Sal, 28 Per, 29 Cum, 30 Cmt = 5 antrenman
  //   • Seri: Cmt→Cum→Per, Çar'da boşluk = 3 gün

  // ── Hafta 3 — 11-15 Mayıs ────────────────────────────────
  const s1 = sessionDb.create({ program_day_id: day1.id, date: '2026-05-11', started_at: '2026-05-11T04:30:00.000Z', ended_at: '2026-05-11T05:38:00.000Z' })
  addSets(s1.id, d1[0].id, [{ weight_kg: 28, reps: 10 }, { weight_kg: 28, reps: 10 }, { weight_kg: 28, reps: 9 }])
  addSets(s1.id, d1[1].id, [{ weight_kg: 22, reps: 10 }, { weight_kg: 22, reps: 9  }, { weight_kg: 22, reps: 9 }])
  addSets(s1.id, d1[2].id, [{ weight_kg: 18, reps: 10 }, { weight_kg: 18, reps: 10 }, { weight_kg: 18, reps: 9 }])
  addSets(s1.id, d1[3].id, [{ weight_kg: 10, reps: 12 }, { weight_kg: 10, reps: 12 }, { weight_kg: 10, reps: 12 }])
  addSets(s1.id, d1[4].id, [{ weight_kg: 20, reps: 12 }, { weight_kg: 20, reps: 12 }, { weight_kg: 20, reps: 10 }])
  addSets(s1.id, d1[5].id, [{ weight_kg: 90, reps: 15 }, { weight_kg: 90, reps: 14 }])
  addSets(s1.id, d1[6].id, [{ duration_minutes: 15 }])

  const s2 = sessionDb.create({ program_day_id: day2.id, date: '2026-05-12', started_at: '2026-05-12T05:00:00.000Z', ended_at: '2026-05-12T06:02:00.000Z' })
  addSets(s2.id, d2[0].id, [{ weight_kg: 60, reps: 10 }, { weight_kg: 60, reps: 10 }, { weight_kg: 60, reps: 9 }])
  addSets(s2.id, d2[1].id, [{ weight_kg: 55, reps: 10 }, { weight_kg: 55, reps: 10 }, { weight_kg: 55, reps: 9 }])
  addSets(s2.id, d2[2].id, [{ weight_kg: 28, reps: 12 }, { weight_kg: 28, reps: 12 }, { weight_kg: 28, reps: 12 }])
  addSets(s2.id, d2[3].id, [{ weight_kg: 16, reps: 12 }, { weight_kg: 16, reps: 11 }, { weight_kg: 16, reps: 11 }])
  addSets(s2.id, d2[4].id, [{ weight_kg: 14, reps: 12 }, { weight_kg: 14, reps: 11 }])
  addSets(s2.id, d2[5].id, [{ held_seconds: 38 }, { held_seconds: 40 }, { held_seconds: 35 }])
  addSets(s2.id, d2[6].id, [{ reps: 12 }, { reps: 12 }, { reps: 10 }])
  addSets(s2.id, d2[7].id, [{ duration_minutes: 15 }])

  const s3 = sessionDb.create({ program_day_id: day3.id, date: '2026-05-14', started_at: '2026-05-14T04:30:00.000Z', ended_at: '2026-05-14T05:37:00.000Z' })
  addSets(s3.id, d3[0].id, [{ weight_kg: 22, reps: 10 }, { weight_kg: 22, reps: 10 }, { weight_kg: 22, reps: 9 }])
  addSets(s3.id, d3[1].id, [{ weight_kg: 50, reps: 12 }, { weight_kg: 50, reps: 12 }, { weight_kg: 50, reps: 10 }])
  addSets(s3.id, d3[2].id, [{ weight_kg: 9,  reps: 15 }, { weight_kg: 9,  reps: 14 }, { weight_kg: 9,  reps: 13 }])
  addSets(s3.id, d3[3].id, [{ weight_kg: 8,  reps: 15 }, { weight_kg: 8,  reps: 14 }, { weight_kg: 8,  reps: 14 }])
  addSets(s3.id, d3[4].id, [{ weight_kg: 16, reps: 12 }, { weight_kg: 16, reps: 12 }, { weight_kg: 16, reps: 11 }])
  addSets(s3.id, d3[5].id, [{ weight_kg: 50, reps: 12 }, { weight_kg: 50, reps: 11 }])
  addSets(s3.id, d3[6].id, [{ duration_minutes: 15 }])

  const s4 = sessionDb.create({ program_day_id: day4.id, date: '2026-05-15', started_at: '2026-05-15T04:45:00.000Z', ended_at: '2026-05-15T05:49:00.000Z' })
  addSets(s4.id, d4[0].id, [{ weight_kg: 24, reps: 10 }, { weight_kg: 24, reps: 10 }, { weight_kg: 24, reps: 10 }])
  addSets(s4.id, d4[1].id, [{ weight_kg: 55, reps: 12 }, { weight_kg: 55, reps: 11 }, { weight_kg: 55, reps: 10 }])
  addSets(s4.id, d4[2].id, [{ weight_kg: 28, reps: 15 }, { weight_kg: 28, reps: 14 }, { weight_kg: 28, reps: 14 }])
  addSets(s4.id, d4[3].id, [{ weight_kg: 24, reps: 12 }, { weight_kg: 24, reps: 12 }, { weight_kg: 24, reps: 10 }])
  addSets(s4.id, d4[4].id, [{ weight_kg: 38, reps: 12 }, { weight_kg: 38, reps: 12 }, { weight_kg: 38, reps: 11 }])
  addSets(s4.id, d4[5].id, [{ held_seconds: 30 }, { held_seconds: 30 }, { held_seconds: 28 }])
  addSets(s4.id, d4[6].id, [{ reps: 12 }, { reps: 11 }])
  addSets(s4.id, d4[7].id, [{ duration_minutes: 15 }])

  // ── Hafta 2 — 18-22 Mayıs ────────────────────────────────
  const s5 = sessionDb.create({ program_day_id: day1.id, date: '2026-05-18', started_at: '2026-05-18T04:30:00.000Z', ended_at: '2026-05-18T05:39:00.000Z' })
  addSets(s5.id, d1[0].id, [{ weight_kg: 28, reps: 10 }, { weight_kg: 28, reps: 10 }, { weight_kg: 30, reps: 8 }])
  addSets(s5.id, d1[1].id, [{ weight_kg: 22, reps: 10 }, { weight_kg: 22, reps: 10 }, { weight_kg: 22, reps: 10 }])
  addSets(s5.id, d1[2].id, [{ weight_kg: 18, reps: 10 }, { weight_kg: 18, reps: 10 }, { weight_kg: 20, reps: 8 }])
  addSets(s5.id, d1[3].id, [{ weight_kg: 10, reps: 13 }, { weight_kg: 10, reps: 12 }, { weight_kg: 10, reps: 12 }])
  addSets(s5.id, d1[4].id, [{ weight_kg: 22, reps: 12 }, { weight_kg: 22, reps: 12 }, { weight_kg: 22, reps: 10 }])
  addSets(s5.id, d1[5].id, [{ weight_kg: 90, reps: 15 }, { weight_kg: 100, reps: 12 }])
  addSets(s5.id, d1[6].id, [{ duration_minutes: 15 }])

  const s6 = sessionDb.create({ program_day_id: day2.id, date: '2026-05-19', started_at: '2026-05-19T05:00:00.000Z', ended_at: '2026-05-19T06:02:00.000Z' })
  addSets(s6.id, d2[0].id, [{ weight_kg: 62, reps: 10 }, { weight_kg: 62, reps: 9  }, { weight_kg: 62, reps: 9 }])
  addSets(s6.id, d2[1].id, [{ weight_kg: 57, reps: 10 }, { weight_kg: 57, reps: 10 }, { weight_kg: 57, reps: 9 }])
  addSets(s6.id, d2[2].id, [{ weight_kg: 30, reps: 12 }, { weight_kg: 30, reps: 12 }, { weight_kg: 30, reps: 12 }])
  addSets(s6.id, d2[3].id, [{ weight_kg: 16, reps: 12 }, { weight_kg: 16, reps: 12 }, { weight_kg: 18, reps: 10 }])
  addSets(s6.id, d2[4].id, [{ weight_kg: 14, reps: 12 }, { weight_kg: 14, reps: 12 }])
  addSets(s6.id, d2[5].id, [{ held_seconds: 40 }, { held_seconds: 40 }, { held_seconds: 38 }])
  addSets(s6.id, d2[6].id, [{ reps: 12 }, { reps: 12 }, { reps: 12 }])
  addSets(s6.id, d2[7].id, [{ duration_minutes: 15 }])

  const s7 = sessionDb.create({ program_day_id: day3.id, date: '2026-05-21', started_at: '2026-05-21T04:30:00.000Z', ended_at: '2026-05-21T05:38:00.000Z' })
  addSets(s7.id, d3[0].id, [{ weight_kg: 22, reps: 10 }, { weight_kg: 24, reps: 8  }, { weight_kg: 24, reps: 8 }])
  addSets(s7.id, d3[1].id, [{ weight_kg: 52, reps: 12 }, { weight_kg: 52, reps: 12 }, { weight_kg: 52, reps: 11 }])
  addSets(s7.id, d3[2].id, [{ weight_kg: 9,  reps: 15 }, { weight_kg: 9,  reps: 15 }, { weight_kg: 9,  reps: 14 }])
  addSets(s7.id, d3[3].id, [{ weight_kg: 8,  reps: 15 }, { weight_kg: 8,  reps: 15 }, { weight_kg: 9,  reps: 12 }])
  addSets(s7.id, d3[4].id, [{ weight_kg: 18, reps: 12 }, { weight_kg: 18, reps: 11 }, { weight_kg: 18, reps: 10 }])
  addSets(s7.id, d3[5].id, [{ weight_kg: 52, reps: 12 }, { weight_kg: 52, reps: 12 }])
  addSets(s7.id, d3[6].id, [{ duration_minutes: 15 }])

  const s8 = sessionDb.create({ program_day_id: day4.id, date: '2026-05-22', started_at: '2026-05-22T04:45:00.000Z', ended_at: '2026-05-22T05:51:00.000Z' })
  addSets(s8.id, d4[0].id, [{ weight_kg: 26, reps: 10 }, { weight_kg: 26, reps: 10 }, { weight_kg: 26, reps: 9 }])
  addSets(s8.id, d4[1].id, [{ weight_kg: 57, reps: 12 }, { weight_kg: 57, reps: 11 }, { weight_kg: 57, reps: 10 }])
  addSets(s8.id, d4[2].id, [{ weight_kg: 28, reps: 15 }, { weight_kg: 28, reps: 15 }, { weight_kg: 30, reps: 12 }])
  addSets(s8.id, d4[3].id, [{ weight_kg: 25, reps: 12 }, { weight_kg: 25, reps: 12 }, { weight_kg: 25, reps: 11 }])
  addSets(s8.id, d4[4].id, [{ weight_kg: 40, reps: 12 }, { weight_kg: 40, reps: 12 }, { weight_kg: 40, reps: 11 }])
  addSets(s8.id, d4[5].id, [{ held_seconds: 32 }, { held_seconds: 30 }, { held_seconds: 30 }])
  addSets(s8.id, d4[6].id, [{ reps: 12 }, { reps: 12 }])
  addSets(s8.id, d4[7].id, [{ duration_minutes: 15 }])

  // ── Haftanın haftası — 25-30 Mayıs (mevcut hafta, Pzt'den itibaren) ──
  const s9 = sessionDb.create({ program_day_id: day1.id, date: '2026-05-25', started_at: '2026-05-25T04:30:00.000Z', ended_at: '2026-05-25T05:38:00.000Z' })
  addSets(s9.id, d1[0].id, [{ weight_kg: 30, reps: 10 }, { weight_kg: 30, reps: 10 }, { weight_kg: 30, reps: 9 }])
  addSets(s9.id, d1[1].id, [{ weight_kg: 24, reps: 10 }, { weight_kg: 24, reps: 10 }, { weight_kg: 24, reps: 9 }])
  addSets(s9.id, d1[2].id, [{ weight_kg: 20, reps: 10 }, { weight_kg: 20, reps: 10 }, { weight_kg: 20, reps: 9 }])
  addSets(s9.id, d1[3].id, [{ weight_kg: 12, reps: 12 }, { weight_kg: 12, reps: 12 }, { weight_kg: 12, reps: 12 }])
  addSets(s9.id, d1[4].id, [{ weight_kg: 22, reps: 12 }, { weight_kg: 22, reps: 12 }, { weight_kg: 22, reps: 12 }])
  addSets(s9.id, d1[5].id, [{ weight_kg: 100, reps: 15 }, { weight_kg: 100, reps: 14 }])
  addSets(s9.id, d1[6].id, [{ duration_minutes: 15 }])

  const s10 = sessionDb.create({ program_day_id: day2.id, date: '2026-05-26', started_at: '2026-05-26T05:00:00.000Z', ended_at: '2026-05-26T06:02:00.000Z' })
  addSets(s10.id, d2[0].id, [{ weight_kg: 65, reps: 10 }, { weight_kg: 65, reps: 10 }, { weight_kg: 65, reps: 9 }])
  addSets(s10.id, d2[1].id, [{ weight_kg: 60, reps: 10 }, { weight_kg: 60, reps: 10 }, { weight_kg: 60, reps: 9 }])
  addSets(s10.id, d2[2].id, [{ weight_kg: 30, reps: 12 }, { weight_kg: 30, reps: 12 }, { weight_kg: 30, reps: 12 }])
  addSets(s10.id, d2[3].id, [{ weight_kg: 18, reps: 12 }, { weight_kg: 18, reps: 12 }, { weight_kg: 18, reps: 11 }])
  addSets(s10.id, d2[4].id, [{ weight_kg: 16, reps: 12 }, { weight_kg: 16, reps: 12 }])
  addSets(s10.id, d2[5].id, [{ held_seconds: 40 }, { held_seconds: 42 }, { held_seconds: 40 }])
  addSets(s10.id, d2[6].id, [{ reps: 12 }, { reps: 12 }, { reps: 12 }])
  addSets(s10.id, d2[7].id, [{ duration_minutes: 15 }])

  const s11 = sessionDb.create({ program_day_id: day3.id, date: '2026-05-28', started_at: '2026-05-28T04:30:00.000Z', ended_at: '2026-05-28T05:37:00.000Z' })
  addSets(s11.id, d3[0].id, [{ weight_kg: 24, reps: 10 }, { weight_kg: 24, reps: 10 }, { weight_kg: 24, reps: 9 }])
  addSets(s11.id, d3[1].id, [{ weight_kg: 55, reps: 12 }, { weight_kg: 55, reps: 12 }, { weight_kg: 55, reps: 11 }])
  addSets(s11.id, d3[2].id, [{ weight_kg: 10, reps: 15 }, { weight_kg: 10, reps: 14 }, { weight_kg: 10, reps: 14 }])
  addSets(s11.id, d3[3].id, [{ weight_kg: 9,  reps: 15 }, { weight_kg: 9,  reps: 15 }, { weight_kg: 9,  reps: 14 }])
  addSets(s11.id, d3[4].id, [{ weight_kg: 18, reps: 12 }, { weight_kg: 18, reps: 12 }, { weight_kg: 18, reps: 12 }])
  addSets(s11.id, d3[5].id, [{ weight_kg: 55, reps: 12 }, { weight_kg: 55, reps: 12 }])
  addSets(s11.id, d3[6].id, [{ duration_minutes: 15 }])

  const s12 = sessionDb.create({ program_day_id: day4.id, date: '2026-05-29', started_at: '2026-05-29T04:45:00.000Z', ended_at: '2026-05-29T05:49:00.000Z' })
  addSets(s12.id, d4[0].id, [{ weight_kg: 28, reps: 10 }, { weight_kg: 28, reps: 10 }, { weight_kg: 28, reps: 10 }])
  addSets(s12.id, d4[1].id, [{ weight_kg: 60, reps: 12 }, { weight_kg: 60, reps: 12 }, { weight_kg: 60, reps: 10 }])
  addSets(s12.id, d4[2].id, [{ weight_kg: 30, reps: 15 }, { weight_kg: 30, reps: 14 }, { weight_kg: 30, reps: 14 }])
  addSets(s12.id, d4[3].id, [{ weight_kg: 27, reps: 12 }, { weight_kg: 27, reps: 12 }, { weight_kg: 27, reps: 11 }])
  addSets(s12.id, d4[4].id, [{ weight_kg: 42, reps: 12 }, { weight_kg: 42, reps: 12 }, { weight_kg: 42, reps: 11 }])
  addSets(s12.id, d4[5].id, [{ held_seconds: 32 }, { held_seconds: 32 }, { held_seconds: 30 }])
  addSets(s12.id, d4[6].id, [{ reps: 12 }, { reps: 12 }])
  addSets(s12.id, d4[7].id, [{ duration_minutes: 15 }])

  // Cmt 30 Mayıs — Ekstra core+cardio (streak'i 3'e çıkarır)
  const s13 = sessionDb.create({ program_day_id: day2.id, date: '2026-05-30', started_at: '2026-05-30T07:00:00.000Z', ended_at: '2026-05-30T07:35:00.000Z' })
  addSets(s13.id, d2[5].id, [{ held_seconds: 45 }, { held_seconds: 45 }, { held_seconds: 42 }])
  addSets(s13.id, d2[6].id, [{ reps: 15 }, { reps: 14 }, { reps: 13 }])
  addSets(s13.id, d2[7].id, [{ duration_minutes: 20 }])

  // ─── KİŞİSEL REKORLAR ─────────────────────────────────────
  prDb.upsert('Leg Press', 100, 3000)
  prDb.upsert('Lat Pulldown', 65, 1950)
  prDb.upsert('Dumbbell Chest Press', 30, 900)
  prDb.upsert('Romanian Deadlift', 55, 1320)
  prDb.upsert('Dumbbell Biceps Curl', 18, 648)

  // ─── BUGÜNKÜ BESLENME (31 Mayıs, dinlenme günü) ───────────
  const t = today()
  foodLogDb.create({ date: t, meal_type: 'breakfast', food_name: 'Yulaf Ezmesi + Muz + Protein Tozu', calories: 485, protein_g: 32, carb_g: 65, fat_g: 10, serving_size: 1, serving_unit: 'porsiyon', source: 'manual' })
  foodLogDb.create({ date: t, meal_type: 'lunch', food_name: 'Tavuk Göğsü + Bulgur Pilavı + Salata', calories: 580, protein_g: 48, carb_g: 55, fat_g: 12, serving_size: 1, serving_unit: 'porsiyon', source: 'manual' })

  // ─── BUGÜNKÜ SU (6 bardak = 1500 ml) ─────────────────────
  for (let i = 0; i < 6; i++) waterDb.add(250)
}

// ─── EXPORTS ──────────────────────────────────────────────────
export function seedProgram() {
  if (programDb.getAll().length > 0) return
  seed()
}

// Tüm veriyi silerek baştan seed'ler — test için
export function resetAndSeed() {
  clearAll()
  seed()
}

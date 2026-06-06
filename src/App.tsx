import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import Workout from './pages/workout/Workout'
import WorkoutSession from './pages/workout/WorkoutSession'
import WorkoutHistory from './pages/workout/WorkoutHistory'
import WorkoutSessionDetail from './pages/workout/WorkoutSessionDetail'
import WorkoutExerciseDetail from './pages/workout/WorkoutExerciseDetail'
import Programs from './pages/programs/Programs'
import ProgramDetail from './pages/programs/ProgramDetail'
import Nutrition from './pages/nutrition/Nutrition'
import NutritionLog from './pages/nutrition/NutritionLog'
import NutritionHistory from './pages/nutrition/NutritionHistory'
import NutritionScan from './pages/nutrition/NutritionScan'
import Body from './pages/body/Body'
import BodyNew from './pages/body/BodyNew'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/workout" element={<Workout />} />
          <Route path="/workout/start" element={<WorkoutSession />} />
          <Route path="/workout/history" element={<WorkoutHistory />} />
          <Route path="/workout/history/:sessionId" element={<WorkoutSessionDetail />} />
          <Route path="/workout/exercise/:exerciseId" element={<WorkoutExerciseDetail />} />

          <Route path="/programs" element={<Programs />} />
          <Route path="/programs/:id" element={<ProgramDetail />} />

          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/nutrition/log" element={<NutritionLog />} />
          <Route path="/nutrition/history" element={<NutritionHistory />} />
          <Route path="/nutrition/scan" element={<NutritionScan />} />

          <Route path="/body" element={<Body />} />
          <Route path="/body/new" element={<BodyNew />} />

          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
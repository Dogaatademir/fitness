import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import MainLayout from './layouts/MainLayout'
import Login from './pages/Login'
import Register from './pages/Register'
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
import Body from './pages/body/Body'
import BodyNew from './pages/body/BodyNew'
import Profile from './pages/Profile'
import Activity from './pages/Activity'

function AppRoutes() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f3ef' }}>
        <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
      </div>
    )
  }

  if (auth.status === 'signed-out') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
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

        <Route path="/body" element={<Body />} />
        <Route path="/body/new" element={<BodyNew />} />

        <Route path="/profile" element={<Profile />} />
        <Route path="/activity" element={<Activity />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

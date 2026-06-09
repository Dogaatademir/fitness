import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { signIn } from '../lib/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#F5F2EB' }}>

      {/* Logo alanı */}
      <div className="flex justify-center pt-10 pb-4">
        <img
          src="/dadfitnesslogo.png"
          alt="DAD Fitness"
          className="w-64 h-auto"
        />
      </div>

      {/* Form kartı */}
      <div className="flex-1 px-6 pb-16">
        <div
          className="w-full max-w-sm mx-auto rounded-3xl px-7 py-8"
          style={{ background: '#ffffff', boxShadow: '0 2px 40px rgba(0,0,0,0.07)' }}
        >
          <div className="mb-8">
            <h1
              className="text-[26px] font-extrabold tracking-tight leading-none mb-1"
              style={{ color: '#1a1714' }}
            >
              Hoş geldin
            </h1>
            <p className="text-[13px]" style={{ color: 'rgba(26,23,20,0.45)' }}>
              Devam etmek için giriş yap
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="space-y-1">
              <label
                className="block text-[11px] font-bold uppercase tracking-widest"
                style={{ color: 'rgba(26,23,20,0.4)' }}
              >
                E-posta
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="ornek@email.com"
                className="w-full px-4 py-3.5 rounded-2xl text-[14px] font-medium outline-none transition-all"
                style={{
                  background: '#EDE9E0',
                  color: '#1a1714',
                  border: '1.5px solid transparent',
                }}
                onFocus={e => (e.currentTarget.style.border = '1.5px solid #1a1714')}
                onBlur={e => (e.currentTarget.style.border = '1.5px solid transparent')}
              />
            </div>

            <div className="space-y-1">
              <label
                className="block text-[11px] font-bold uppercase tracking-widest"
                style={{ color: 'rgba(26,23,20,0.4)' }}
              >
                Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-3.5 rounded-2xl text-[14px] font-medium outline-none transition-all"
                style={{
                  background: '#EDE9E0',
                  color: '#1a1714',
                  border: '1.5px solid transparent',
                }}
                onFocus={e => (e.currentTarget.style.border = '1.5px solid #1a1714')}
                onBlur={e => (e.currentTarget.style.border = '1.5px solid transparent')}
              />
            </div>

            {error && (
              <div
                className="px-4 py-3 rounded-2xl text-[12px] font-semibold"
                style={{ background: 'rgba(185,28,28,0.07)', color: '#b91c1c' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl text-[14px] font-bold tracking-wide transition-opacity active:opacity-75 disabled:opacity-40"
              style={{ background: '#1a1714', color: '#f5f3ef', marginTop: 8 }}
            >
              {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </button>

          </form>
        </div>

        {/* Alt link */}
        <p className="text-center text-[13px] mt-6" style={{ color: 'rgba(26,23,20,0.45)' }}>
          Hesabın yok mu?{' '}
          <Link
            to="/register"
            className="font-bold underline underline-offset-2"
            style={{ color: '#1a1714' }}
          >
            Kayıt Ol
          </Link>
        </p>
      </div>

    </div>
  )
}

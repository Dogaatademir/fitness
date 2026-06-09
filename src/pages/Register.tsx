import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { signUp } from '../lib/auth'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== password2) { setError('Şifreler eşleşmiyor.'); return }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalı.'); return }
    setError('')
    setLoading(true)
    try {
      const { needsConfirmation } = await signUp(email, password)
      if (needsConfirmation) setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#F5F2EB' }}>
        <img
          src="/dadfitnesslogo.png"
          alt="DAD Fitness"
          className="w-56 h-auto mb-12"
                  />
        <div
          className="w-full max-w-sm rounded-3xl px-7 py-8 text-center"
          style={{ background: '#ffffff', boxShadow: '0 2px 40px rgba(0,0,0,0.07)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: '#F5F2EB' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1714" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <h2 className="text-[22px] font-extrabold tracking-tight mb-2" style={{ color: '#1a1714' }}>
            E-postanı onayla
          </h2>
          <p className="text-[13px] leading-relaxed mb-1" style={{ color: 'rgba(26,23,20,0.5)' }}>
            Onay bağlantısı gönderildi
          </p>
          <p className="text-[14px] font-semibold mb-6" style={{ color: '#1a1714' }}>
            {email}
          </p>
          <p className="text-[12px] leading-relaxed mb-6" style={{ color: 'rgba(26,23,20,0.4)' }}>
            Bağlantıya tıkladıktan sonra giriş yapabilirsin.
          </p>
          <Link
            to="/login"
            className="block w-full py-4 rounded-2xl text-[14px] font-bold tracking-wide text-center transition-opacity active:opacity-75"
            style={{ background: '#1a1714', color: '#f5f3ef' }}
          >
            Giriş Sayfasına Dön
          </Link>
        </div>
      </div>
    )
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
              Hesap oluştur
            </h1>
            <p className="text-[13px]" style={{ color: 'rgba(26,23,20,0.45)' }}>
              DAD Fitness'a katıl
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
                autoComplete="new-password"
                placeholder="En az 6 karakter"
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
                Şifre Tekrar
              </label>
              <input
                type="password"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Şifreni tekrar gir"
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
              {loading ? 'Kayıt yapılıyor…' : 'Kayıt Ol'}
            </button>

          </form>
        </div>

        {/* Alt link */}
        <p className="text-center text-[13px] mt-6" style={{ color: 'rgba(26,23,20,0.45)' }}>
          Zaten hesabın var mı?{' '}
          <Link
            to="/login"
            className="font-bold underline underline-offset-2"
            style={{ color: '#1a1714' }}
          >
            Giriş Yap
          </Link>
        </p>
      </div>

    </div>
  )
}

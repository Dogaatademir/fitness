export default function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f3ef' }}>
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: 'rgba(26,23,20,0.08)', borderTopColor: 'rgba(26,23,20,0.35)' }}
      />
    </div>
  )
}

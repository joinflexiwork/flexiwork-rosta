'use client'

/** Fixed center logo for header - original orientation (points up). z-index 50 so it sits below back button. */
export default function CenteredLogo() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        width: 48,
        height: 48,
        borderRadius: '50%',
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
        border: '2px solid rgba(255,255,255,0.6)',
        pointerEvents: 'none',
      }}
    >
      <img
        src="/FWlogo.jpeg"
        alt="FlexiWork"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  )
}

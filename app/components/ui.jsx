/**
 * Modern/Technical shared UI primitives.
 * Class-driven — the classes live in app/globals.css (loaded by the root layout),
 * so these work on any page with no extra CSS import.
 */
'use client'

export function Button({ children, variant = 'primary', as = 'button', href, ...rest }) {
  const cls = `btn btn-${variant}`
  if (as === 'a') return <a className={cls} href={href} {...rest}>{children}</a>
  return <button className={cls} {...rest}>{children}</button>
}

export function Badge({ children, dark = false }) {
  return <span className={`badge${dark ? ' badge-dark' : ''}`}>{children}</span>
}

export function Card({ children, lift = false, className = '', style }) {
  return <div className={`card${lift ? ' lift' : ''} ${className}`} style={style}>{children}</div>
}

export function Stat({ value, label }) {
  return (
    <div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function SectionHeader({ number, title }) {
  return (
    <div className="sec-hdr">
      {number != null && <div className="sec-num">{number}</div>}
      <div className="sec-title">{title}</div>
      <div className="sec-rule" />
    </div>
  )
}

export function Field({ label, help, children }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      {children}
      {help && <p className="help">{help}</p>}
    </div>
  )
}

export function Input(props) { return <input className="field" {...props} /> }
export function Textarea(props) { return <textarea className="field" {...props} /> }
export function Select({ children, ...rest }) { return <select className="field" {...rest}>{children}</select> }

export function ControlGroup({ type = 'radio', name, options = [], value, values = [], onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(opt => {
        const checked = type === 'radio' ? value === opt : values.includes(opt)
        return (
          <label key={opt} className="control">
            <input type={type} name={name} checked={checked} onChange={() => onChange?.(opt)} readOnly={!onChange} />
            <span>{opt}</span>
          </label>
        )
      })}
    </div>
  )
}

export function ProgressBar({ value = 0 }) {
  return <div className="progress"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}

export function Rag({ level }) {
  const k = (level || '').toLowerCase()
  const cls = k.startsWith('h') ? 'rag-high' : k.startsWith('m') ? 'rag-med' : 'rag-low'
  return <span className={`rag ${cls}`}>{level}</span>
}

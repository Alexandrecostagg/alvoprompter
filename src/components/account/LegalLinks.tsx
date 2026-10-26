import { APPLE_EULA_URL, PRIVACY_URL, TERMS_URL } from '../../lib/legal'

export default function LegalLinks() {
  return <nav aria-label="Termos e privacidade" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
    <a className="underline min-h-11 inline-flex items-center" href={TERMS_URL} target="_blank" rel="noopener noreferrer">Termos de uso</a>
    <a className="underline min-h-11 inline-flex items-center" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacidade e LGPD</a>
    <a className="underline min-h-11 inline-flex items-center" href={APPLE_EULA_URL} target="_blank" rel="noopener noreferrer">Licença Apple (EULA)</a>
  </nav>
}

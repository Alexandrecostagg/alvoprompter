import { createRoot } from 'react-dom/client'
import WelcomeFlow from '../src/components/account/WelcomeFlow'
import '../src/index.css'

document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'
createRoot(document.getElementById('root')!).render(<WelcomeFlow onContinueLocal={() => { window.location.href = '/' }} />)

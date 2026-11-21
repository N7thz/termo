import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@xterm/xterm/css/xterm.css'
import './tailwind.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'

// Sem StrictMode: a montagem dupla criaria dois processos de shell por aba.
const root = document.getElementById('root')
if (!root) throw new Error('elemento #root não encontrado')
createRoot(root).render(<App />)

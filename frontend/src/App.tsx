import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'

import Home from './pages/Home'
import Join from './pages/Join'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join" element={<Join />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

import './App.css'
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import Home from './pages/Home'
import Join from './pages/Join'
import AttendanceImport from './pages/AttendanceImport'
import Statistics from './pages/Statistics'
import Members from './pages/Members'
import Settings from './pages/Settings'

function Layout() {
  return (
    <>
      <header className="navBar">
        <div className="navBarInner">
          <div className="navTitle">Learn together</div>
          <nav className="navLinks">
            <Link to="/">Home</Link>
            <Link to="/statistics">Statistics</Link>
            <Link to="/members">Members</Link>
            <Link to="/settings">Settings</Link>
            <Link to="/attendance/import">Import</Link>
          </nav>
        </div>
      </header>
      <Outlet />
    </>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/statistics" element={<Statistics />} />
        <Route path="/members" element={<Members />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/join" element={<Join />} />
        <Route path="/attendance/import" element={<AttendanceImport />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

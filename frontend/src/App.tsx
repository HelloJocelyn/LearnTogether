import './App.css'
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'

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
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/statistics">Statistics</NavLink>
            <NavLink to="/members">Members</NavLink>
            <NavLink to="/settings">Settings</NavLink>
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

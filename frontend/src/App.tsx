import './App.css'
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import Home from './pages/Home'
import Join from './pages/Join'
import AttendanceImport from './pages/AttendanceImport'
import Statistics from './pages/Statistics'
import Members from './pages/Members'
import Settings from './pages/Settings'
import { useI18n } from './i18n'

function Layout() {
  const { t, lang, setLang } = useI18n()
  return (
    <>
      <header className="navBar">
        <div className="navBarInner">
          <div className="navTitle">{t('nav.title')}</div>
          <nav className="navLinks">
            <NavLink to="/" end>
              {t('nav.home')}
            </NavLink>
            <NavLink to="/statistics">{t('nav.statistics')}</NavLink>
            <NavLink to="/members">{t('nav.members')}</NavLink>
            <NavLink to="/settings">{t('nav.settings')}</NavLink>
          </nav>
          <label className="langSwitch">
            <span>{t('nav.language')}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'zh' | 'ja')}>
              <option value="en">{t('lang.en')}</option>
              <option value="zh">{t('lang.zh')}</option>
              <option value="ja">{t('lang.ja')}</option>
            </select>
          </label>
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

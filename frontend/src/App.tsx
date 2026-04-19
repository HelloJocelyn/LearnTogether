import './App.css'
import { Suspense, lazy } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { isFullEdition } from './edition'
import Home from './pages/Home'
import Join from './pages/Join'
import AttendanceImport from './pages/AttendanceImport'
import Statistics from './pages/Statistics'
import Members from './pages/Members'
import Settings from './pages/Settings'
import { GoalsBehindInAppBanner } from './components/GoalsBehindInAppBanner'
import { GoalsBehindNotifyEffect } from './components/GoalsBehindNotifyEffect'
import { useI18n } from './i18n'

const LearningGoals = lazy(() => import('./pages/LearningGoals'))

function GoalsLoadingFallback() {
  const { t } = useI18n()
  return (
    <div className="page">
      <p className="muted" style={{ padding: '24px 16px' }}>
        {t('goals.loading')}
      </p>
    </div>
  )
}

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
            {isFullEdition() ? (
              <NavLink to="/learning-goals">{t('nav.goals')}</NavLink>
            ) : null}
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
    <>
      {isFullEdition() ? (
        <>
          <GoalsBehindNotifyEffect />
          <GoalsBehindInAppBanner />
        </>
      ) : null}
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/members" element={<Members />} />
          {isFullEdition() ? (
            <Route
              path="/learning-goals"
              element={
                <Suspense fallback={<GoalsLoadingFallback />}>
                  <LearningGoals />
                </Suspense>
              }
            />
          ) : null}
          <Route path="/settings" element={<Settings />} />
          <Route path="/join" element={<Join />} />
          <Route path="/attendance/import" element={<AttendanceImport />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App

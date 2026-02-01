import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/app/layouts/app-layout'
import { DashboardPage } from '@/pages/dashboard-page'
import { HolidayPage } from '@/pages/holiday-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { ProjectsPage } from '@/pages/projects-page'
import { SettingsPage } from '@/pages/settings-page'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="holiday" element={<HolidayPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

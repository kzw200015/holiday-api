import { HashRouter, Route, Routes } from "react-router-dom"

import { AppLayout } from "@/components/app/app-layout.tsx"
import { Toaster } from "@/components/ui/sonner"
import { HolidayPage } from "@/pages/holiday-page"
import { NotFoundPage } from "@/pages/not-found-page"

export default function App() {
    return (
        <HashRouter>
            <Routes>
                <Route element={<AppLayout/>}>
                    <Route path="holiday" element={<HolidayPage/>}/>
                    <Route path="*" element={<NotFoundPage/>}/>
                </Route>
            </Routes>
            <Toaster position="top-center"/>
        </HashRouter>
    )
}

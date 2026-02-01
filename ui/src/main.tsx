import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "@fontsource/ibm-plex-mono/400.css"
import "@fontsource/ibm-plex-sans/400.css"
import "@fontsource/ibm-plex-sans/500.css"
import "@fontsource/ibm-plex-sans/600.css"
import App from "./App"

createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
        <App/>
    </StrictMode>,
)

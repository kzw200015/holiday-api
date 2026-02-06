import axios from "axios"

export const HttpClient = axios.create({
    headers: {
        Accept: "application/json",
    },
    baseURL: "/api",
})

/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["PingFang SC", "Microsoft YaHei", "sans-serif"],
            },
        },
    },
    plugins: [],
}

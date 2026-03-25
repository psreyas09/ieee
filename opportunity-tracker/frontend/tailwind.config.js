/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                ieee: {
                    navy: '#0a1628',
                    blue: '#00629B',
                    gold: '#FFD700',
                }
            }
        },
    },
    plugins: [],
}

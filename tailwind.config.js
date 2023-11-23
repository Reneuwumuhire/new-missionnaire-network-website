/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      padding: {
        "primarySpace": "100px"
      },
      boxShadow: {
        "4xl": "0px 0px 14px 0px rgba(0, 0, 0, 0.04)"
      },
      colors: {
        primary: "#FF880C",
        accentOrange: "#F2994A",
        accentGray: "#4F4F4F",
        grayWeak: "#A7A7A7",
        grayWhite: "#F3F1F1",
        hardBlack: "#000",
        pureWhite: "#fff",
        weakGray: "#BABABA",
        veryWeakGray: "#EBEBEB",
        missionnaire: {
          DEFAULT: "#FF880C",
          50: "#FCF5ED",
          100: "#FFE5C9",
          Yellow: {
            DEFAULT: "#FFF5EB",
            50: "#FCF5ED",
            100: "#FFE5C9",
            200: "#FFD19F",
            300: "#FFBD75",
            400: "#FFA94B",
            500: "#FF880C",
            600: "#CC6A0A",
            700: "#994C08",
            800: "#663E06",
            900: "#332003"
          },
          }
        }
      },
    },
    screens: {
      'xsm': '350px',
      // => @media (min-width: 350px) { ... }
      'sm': '640px',
      // => @media (min-width: 640px) { ... }

      'md': '768px',
      // => @media (min-width: 768px) { ... }
      'mdx': '968px',
      // => @media (min-width: 768px) { ... }
      'lg': '1024px',
      // => @media (min-width: 1024px) { ... }

      'xl': '1280px',
      // => @media (min-width: 1280px) { ... }

      '2xl': '1536px',
      // => @media (min-width: 1536px) { ... }
    },
    
  plugins: []
};
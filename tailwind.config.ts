import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            h1: {
              fontSize: '1.875rem',
              fontWeight: '700',
              marginTop: '1.5rem',
              marginBottom: '1rem',
              borderBottom: '2px solid #e0e7ff',
              paddingBottom: '0.75rem',
            },
            h2: {
              fontSize: '1.5rem',
              fontWeight: '600',
              marginTop: '1.25rem',
              marginBottom: '0.75rem',
              color: '#4f46e5',
            },
            h3: {
              fontSize: '1.25rem',
              fontWeight: '600',
              marginTop: '1rem',
              marginBottom: '0.5rem',
              color: '#6366f1',
            },
            pre: {
              backgroundColor: '#18181b',
              color: '#ffffff',
            },
            code: {
              color: '#ffffff',
              backgroundColor: 'transparent',
            },
            'pre code': {
              color: '#ffffff',
              backgroundColor: 'transparent',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

export default config;


/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // v2 design tokens
        bg: {
          0: 'var(--bg-0)',
          1: 'var(--bg-1)',
          2: 'var(--bg-2)',
          3: 'var(--bg-3)',
          4: 'var(--bg-4)',
        },
        line: {
          1: 'var(--line-1)',
          2: 'var(--line-2)',
          3: 'var(--line-3)',
        },
        ftext: {
          // 'text' clashes with utility, prefix as ftext (forge text)
          1: 'var(--text-1)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
          4: 'var(--text-4)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          2: 'var(--accent-2)',
          dim: 'var(--accent-dim)',
          line: 'var(--accent-line)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        violet: 'var(--violet)',
        role: {
          fe: 'var(--role-fe)',
          be: 'var(--role-be)',
          db: 'var(--role-db)',
          test: 'var(--role-test)',
          review: 'var(--role-review)',
          infra: 'var(--role-infra)',
          arch: 'var(--role-arch)',
          doc: 'var(--role-doc)',
        },

        // Legacy aliases — kept until v1 components are removed
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        border: {
          DEFAULT: 'var(--border)',
          active: 'var(--border-active)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        status: {
          success: 'var(--status-success)',
          warning: 'var(--status-warning)',
          error: 'var(--status-error)',
          info: 'var(--status-info)',
        },
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['var(--font-ui)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        ui: ['var(--font-ui)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [],
}

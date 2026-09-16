// The five looks PrecisionFix can wear. The owner picks one in /admin/ under
// Site → Theme, or from the Setup tab's Looks picker; site.config.mjs uses the
// default's palette for the editor, emails, and meta theme-color.
//
// Every palette key becomes a CSS variable (--bg, --accent-2 …; hex keys
// also get --key-rgb). Each theme ships its own stylesheet at
// public/assets/themes/<id>.css on top of the shared public/assets/site.css.

export const DEFAULT_THEME = 'redline';

export const THEMES = {
  redline: {
    id: 'redline',
    label: 'Redline',
    blurb: 'Motorsport editorial. Black, red, amber. Big condensed type, mono readouts, a red glow off the hero. The look the current site started.',
    fonts: {
      googleCss: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap',
      display: "'Bebas Neue', 'Impact', sans-serif",
      body: "'DM Sans', system-ui, sans-serif",
    },
    palette: {
      bg: '#0a0a0a',
      'bg-2': '#111214',
      'bg-3': '#161819',
      'bg-4': '#1d1f22',
      line: '#252729',
      'line-2': '#34373b',
      ink: '#f2f0ec',
      'ink-2': '#b8b4ad',
      'ink-3': '#7a7a7a',
      accent: '#e8311a',
      'accent-2': '#ff5a3c',
      'accent-3': '#ffb3a3',
      'accent-deep': '#c42a15',
      'accent-hi': '#ff6a4d',
      'on-accent': '#ffffff',
      amber: '#f5a623',
      sheen: '#ffffff',
      'font-mono': "'DM Mono', ui-monospace, monospace",
    },
    admin: {
      r: '4px',
      'r-lg': '6px',
      'r-btn': '4px',
      'r-pill': '999px',
      'label-transform': 'uppercase',
      'label-spacing': '0.14em',
      'display-weight': '400',
      'display-spacing': '0.03em',
      'btn-weight': '600',
      'btn-primary-bg': 'var(--accent)',
      'btn-primary-shadow': 'none',
      'glow-opacity': '0.6',
    },
  },

  blueprint: {
    id: 'blueprint',
    label: 'Blueprint',
    blurb: 'A service manual on engineering paper. Light, gridded, navy ink, international-orange callouts, dimension lines and figure plates. Reads as precision.',
    fonts: {
      googleCss: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
      display: "'Space Grotesk', system-ui, sans-serif",
      body: "'IBM Plex Sans', system-ui, sans-serif",
    },
    palette: {
      bg: '#f4f0e6',
      'bg-2': '#ece6d8',
      'bg-3': '#e3dcca',
      'bg-4': '#d9d1bc',
      line: '#cdc4ae',
      'line-2': '#b3a88d',
      ink: '#14213d',
      'ink-2': '#3a4560',
      'ink-3': '#6b7288',
      accent: '#ff5a1f',
      'accent-2': '#e04a12',
      'accent-3': '#ff8a5c',
      'accent-deep': '#c23f0f',
      'accent-hi': '#ff7a47',
      'on-accent': '#ffffff',
      blue: '#1f4fb0',
      'blue-2': '#3b6fd8',
      sheen: '#000000',
      'font-mono': "'IBM Plex Mono', ui-monospace, monospace",
    },
    admin: {
      r: '2px',
      'r-lg': '4px',
      'r-btn': '2px',
      'r-pill': '2px',
      line: 'rgb(31 79 176 / 0.28)',
      'line-2': 'rgb(31 79 176 / 0.5)',
      'label-transform': 'uppercase',
      'label-spacing': '0.16em',
      'display-weight': '700',
      'display-spacing': '-0.01em',
      'btn-weight': '600',
      'btn-primary-bg': 'var(--accent)',
      'btn-primary-shadow': 'none',
      'glow-opacity': '0.2',
    },
  },

  chrome: {
    id: 'chrome',
    label: 'Chrome & Carbon',
    blurb: 'The dealership lounge after hours. Graphite, brushed silver, champagne gold, a serif headline over a full-bleed photo. Quiet, expensive, photo-first.',
    fonts: {
      googleCss: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap',
      display: "'Cormorant Garamond', 'Times New Roman', serif",
      body: "'Inter', system-ui, sans-serif",
    },
    palette: {
      bg: '#0f1113',
      'bg-2': '#16191d',
      'bg-3': '#1e2228',
      'bg-4': '#262b32',
      line: '#2b3037',
      'line-2': '#3d434c',
      ink: '#f1efe9',
      'ink-2': '#c3c0b8',
      'ink-3': '#85837d',
      accent: '#c9a86a',
      'accent-2': '#e0c48c',
      'accent-3': '#f0dcb3',
      'accent-deep': '#9c7d45',
      'accent-hi': '#dcb976',
      'on-accent': '#0f1113',
      silver: '#b9bcc2',
      sheen: '#ffffff',
      'font-mono': "'Inter', system-ui, sans-serif",
    },
    admin: {
      r: '6px',
      'r-lg': '10px',
      'r-btn': '999px',
      'r-pill': '999px',
      'label-transform': 'uppercase',
      'label-spacing': '0.2em',
      'display-weight': '500',
      'display-spacing': '0.01em',
      'btn-weight': '500',
      'btn-primary-bg': 'var(--accent)',
      'btn-primary-shadow': 'none',
      'glow-opacity': '0.35',
    },
  },

  sunset: {
    id: 'sunset',
    label: 'Sunset Garage',
    blurb: 'The friendly neighborhood mechanic, Austin edition. Cream paper, a coral-to-gold sunset, chunky rounded cards, tilted photos and sticker badges. Warm and approachable.',
    fonts: {
      googleCss: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Nunito:wght@400;600;700;800&display=swap',
      display: "'Bricolage Grotesque', system-ui, sans-serif",
      body: "'Nunito', system-ui, sans-serif",
    },
    palette: {
      bg: '#fff6ea',
      'bg-2': '#ffeedb',
      'bg-3': '#ffe2c4',
      'bg-4': '#ffd4aa',
      line: '#f0cba8',
      'line-2': '#e4b48a',
      ink: '#2a1a3a',
      'ink-2': '#57476a',
      'ink-3': '#8a7a9a',
      accent: '#ff4d6d',
      'accent-2': '#ff8a3d',
      'accent-3': '#ffc84d',
      'accent-deep': '#d62e52',
      'accent-hi': '#ff6f88',
      'on-accent': '#ffffff',
      purple: '#7b3fe4',
      sky: '#38bdf8',
      sheen: '#000000',
      'font-mono': "'Nunito', system-ui, sans-serif",
    },
    admin: {
      r: '14px',
      'r-lg': '24px',
      'r-btn': '999px',
      'r-pill': '999px',
      'label-transform': 'none',
      'label-spacing': '0.02em',
      'display-weight': '800',
      'display-spacing': '-0.03em',
      'btn-weight': '800',
      'btn-primary-bg': 'linear-gradient(135deg, var(--accent-2), var(--accent))',
      'btn-primary-shadow': '0 5px 0 var(--accent-deep)',
      'glow-opacity': '0.5',
    },
  },

  terminal: {
    id: 'terminal',
    label: 'Diagnostic',
    blurb: 'The XENTRY screen, turned into a website. Black, phosphor green, monospace everything, scanlines, a live readout that types itself. For the nerds and the people who hire them.',
    fonts: {
      googleCss: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap',
      display: "'JetBrains Mono', ui-monospace, monospace",
      body: "'JetBrains Mono', ui-monospace, monospace",
    },
    palette: {
      bg: '#050805',
      'bg-2': '#0a100a',
      'bg-3': '#0f170f',
      'bg-4': '#152015',
      line: '#1e3020',
      'line-2': '#2d4a30',
      ink: '#d7f5dc',
      'ink-2': '#9cd3a6',
      'ink-3': '#5f8f68',
      accent: '#39ff88',
      'accent-2': '#7dffb0',
      'accent-3': '#b8ffd1',
      'accent-deep': '#17a85a',
      'accent-hi': '#5dffa0',
      'on-accent': '#03110a',
      amber: '#ffb000',
      red: '#ff4d4d',
      sheen: '#ffffff',
      'font-mono': "'JetBrains Mono', ui-monospace, monospace",
    },
    admin: {
      r: '0',
      'r-lg': '0',
      'r-btn': '0',
      'r-pill': '0',
      line: 'var(--line)',
      'line-2': 'var(--line-2)',
      'label-transform': 'uppercase',
      'label-spacing': '0.12em',
      'display-weight': '700',
      'display-spacing': '0',
      'btn-weight': '700',
      'btn-primary-bg': 'var(--accent)',
      'btn-primary-shadow': 'none',
      'glow-opacity': '0.3',
    },
  },
};

export const THEME_IDS = Object.keys(THEMES);

export function themeOptions() {
  return THEME_IDS.map((id) => ({ value: id, label: `${THEMES[id].label}: ${THEMES[id].blurb.split('.')[0]}` }));
}

// Cards for the Looks picker in /admin/ (config.themes): swatch + display
// font per look, blurb trimmed to its first sentence.
export function themePickerOptions() {
  return THEME_IDS.map((id) => {
    const t = THEMES[id];
    return {
      id,
      label: t.label,
      blurb: t.blurb.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.'),
      swatch: { bg: t.palette.bg, accent: t.palette.accent, ink: t.palette.ink },
      fontDisplay: t.fonts.display,
    };
  });
}

// Resolve the theme for a render: ?theme=<id> (preview) → the owner's pick →
// the default. Unknown ids fall through, so a bad link never breaks the page.
export function pickTheme({ url, content } = {}) {
  let q = '';
  try { q = url ? new URL(url).searchParams.get('theme') || '' : ''; } catch (_) { q = ''; }
  const chosen = content && content.site && content.site.theme;
  return THEMES[q] || THEMES[chosen] || THEMES[DEFAULT_THEME];
}

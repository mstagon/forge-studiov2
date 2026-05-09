/**
 * Crisp 16px line icons. Stroke-based, currentColor.
 * Mirrors /tmp/forge_design/forge/project/src/icons.jsx — same API surface.
 *
 * NOTE: this is a placeholder while the foundation is being assembled by the
 * main session. It is structurally complete (every key referenced by v2
 * components exists) but visual fidelity may differ until the real foundation
 * lands.
 */
import type { CSSProperties, SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'size'> {
  size?: number
  sw?: number
  fill?: string
  style?: CSSProperties
}

function I({ size = 16, sw = 1.5, fill = 'none', children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const Icon = {
  Folder:   (p: IconProps) => <I {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></I>,
  Git:      (p: IconProps) => <I {...p}><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8M8 6h6a4 4 0 0 1 4 4v0"/></I>,
  Grid:     (p: IconProps) => <I {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></I>,
  Users:    (p: IconProps) => <I {...p}><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 6-4"/></I>,
  Cog:      (p: IconProps) => <I {...p}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></I>,
  Search:   (p: IconProps) => <I {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></I>,
  Plus:     (p: IconProps) => <I {...p}><path d="M12 5v14M5 12h14"/></I>,
  Check:    (p: IconProps) => <I {...p}><path d="M5 12.5 10 17 19 7"/></I>,
  X:        (p: IconProps) => <I {...p}><path d="M6 6l12 12M18 6 6 18"/></I>,
  Chevron:  (p: IconProps) => <I {...p}><path d="m9 6 6 6-6 6"/></I>,
  ChevronD: (p: IconProps) => <I {...p}><path d="m6 9 6 6 6-6"/></I>,
  Arrow:    (p: IconProps) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6"/></I>,
  Terminal: (p: IconProps) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></I>,
  Refresh:  (p: IconProps) => <I {...p}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 4v4h-4M21 12a9 9 0 0 1-15.5 6.3L3 16M3 20v-4h4"/></I>,
  Bell:     (p: IconProps) => <I {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0"/></I>,
  Play:     (p: IconProps) => <I {...p} fill="currentColor" sw={0}><path d="M6 4l14 8L6 20z"/></I>,
  Pause:    (p: IconProps) => <I {...p}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></I>,
  Stop:     (p: IconProps) => <I {...p}><rect x="5" y="5" width="14" height="14" rx="2"/></I>,
  Branch:   (p: IconProps) => <I {...p}><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11v1a4 4 0 0 1-4 4H6"/></I>,
  Sparkle:  (p: IconProps) => <I {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5 8 8M16 16l2.5 2.5M5.5 18.5 8 16M16 8l2.5-2.5"/></I>,
  Code:     (p: IconProps) => <I {...p}><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4 10 20"/></I>,
  Layers:   (p: IconProps) => <I {...p}><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="M3 13 12 18l9-5M3 18 12 23l9-5"/></I>,
  Box:      (p: IconProps) => <I {...p}><path d="M3 7 12 3l9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v12"/></I>,
  Activity: (p: IconProps) => <I {...p}><path d="M3 12h4l3-9 4 18 3-9h4"/></I>,
  Bolt:     (p: IconProps) => <I {...p}><path d="M13 3 4 14h7l-1 7 9-11h-7z"/></I>,
  Lock:     (p: IconProps) => <I {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></I>,
  File:     (p: IconProps) => <I {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></I>,
  Diff:     (p: IconProps) => <I {...p}><path d="M5 4v16M5 8h6M5 14h6M19 4v16M13 16h6M13 10h6"/></I>,
  Send:     (p: IconProps) => <I {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></I>,
  Mail:     (p: IconProps) => <I {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></I>,
  Dot:      (p: IconProps) => <I {...p}><circle cx="12" cy="12" r="4" fill="currentColor"/></I>,
  More:     (p: IconProps) => <I {...p}><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></I>,
  Kbd:      (p: IconProps) => <I {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></I>,
  Zap:      (p: IconProps) => <I {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></I>,
  Cube:     (p: IconProps) => <I {...p}><path d="M3 7 12 3l9 4v10l-9 4-9-4z"/></I>,
  Hash:     (p: IconProps) => <I {...p}><path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/></I>,
  Fire:     (p: IconProps) => <I {...p}><path d="M12 3s4 4 4 8a4 4 0 1 1-8 0c0-2 1-3 1-3s-3 2-3 6a6 6 0 0 0 12 0c0-5-6-11-6-11z"/></I>,
}

export type IconKey = keyof typeof Icon

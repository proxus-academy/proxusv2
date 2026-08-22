import type { ReactNode, SVGProps } from "react"

export type CreatorIconName =
  | "alert"
  | "arrow"
  | "calendar"
  | "check"
  | "clock"
  | "home"
  | "menu"
  | "play"
  | "upload"
  | "user"
  | "video"
  | "wallet"

const paths = {
  alert: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  arrow: <path d="m9 18 6-6-6-6" />,
  calendar: (
    <>
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  play: <path d="m8 5 11 7-11 7Z" />,
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 15v4h14v-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  video: (
    <>
      <rect width="15" height="14" x="3" y="5" rx="2" />
      <path d="m18 10 4-2v8l-4-2Z" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12" />
      <path d="M16 12h5" />
    </>
  ),
} satisfies Record<CreatorIconName, ReactNode>

export function CreatorIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { readonly name: CreatorIconName }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}

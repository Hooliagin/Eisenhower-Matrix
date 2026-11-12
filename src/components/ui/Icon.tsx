import type { SVGProps } from "react";

/** Line icons drawn for this app (24 px grid) – crisp at any size and tintable, unlike emoji. */
const PATHS = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  tasks: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M8 12.3l2.7 2.7L16.2 9.4" />
    </>
  ),
  projects: (
    <>
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2l2 2.2H18a2.5 2.5 0 0 1 2.5 2.5V17a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17z" />
      <path d="M3.5 10.6h17" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="8.5" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  fitness: <path d="M7 8v8M17 8v8M3.8 10v4M20.2 10v4M7 12h10" />,
  elements: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a4.25 4.25 0 0 1 0 8.5 4.25 4.25 0 0 0 0 8.5" />
      <circle cx="12" cy="7.75" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16.25" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevron: <path d="M9 5.5l6.5 6.5L9 18.5" />,
  back: <path d="M15 5.5L8.5 12l6.5 6.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  flame: <path d="M12 3c.6 3.2 4.8 5 4.8 9.6a4.8 4.8 0 0 1-9.6 0c0-1.7.8-2.9 1.7-3.9.3 1.6 1.1 2.4 1.9 2.4C11.5 8.5 10.6 6 12 3z" />,
  spark: <path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6L4.5 11l5.6-1.9z" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z" />
      <path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5" />
    </>
  ),
  chart: <path d="M4.5 19.5h15M7.5 16v-4.5M12 16V7M16.5 16V9" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 22, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {PATHS[name]}
    </svg>
  );
}

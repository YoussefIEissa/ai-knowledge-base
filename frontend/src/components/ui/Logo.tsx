import { useId } from "react";

export function Logo({ size = 28 }: { size?: number }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f7ff7" />
          <stop offset="1" stopColor="#5a63e6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path
        d="M10.5 9.5v13M10.5 16.2l7.2-6.7M13.4 13.6l5.6 8.9"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.6" cy="10.4" r="1.9" fill="#fff" />
    </svg>
  );
}

import Link from "next/link";
import { brand } from "./brand";

export function ClaraMark({ size = 36 }: { size?: number }) {
  return (
    <span className="clara-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="60" height="60" rx="17" fill="#214B3B" />
        <path d="M43.5 18.5A22 22 0 1 0 43.5 45.5" stroke="#F7F3E8" strokeWidth="7" strokeLinecap="round" />
        <path d="M47 11v11m-5.5-5.5h11" stroke="#D99A72" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function ClaraLogo({
  href = "/",
  size = 36,
  suffix,
  ariaLabel,
}: {
  href?: string;
  size?: number;
  suffix?: string;
  ariaLabel?: string;
}) {
  return (
    <Link href={href} className="wordmark" aria-label={ariaLabel ?? `${brand.name}, página inicial`}>
      <ClaraMark size={size} />
      <span className="wordmark-text">{brand.name}</span>
      {suffix && <span className="wordmark-suffix">{suffix}</span>}
    </Link>
  );
}

"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type ReactNode, useEffect, useRef } from "react";

gsap.registerPlugin(ScrollTrigger);

export function LandingMotion({ children }: { children: ReactNode }) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scopeRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.from("[data-hero-stagger]", {
        y: 22,
        opacity: 0,
        duration: 0.72,
        stagger: 0.08,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });

      gsap.from("[data-hero-visual]", {
        y: 28,
        scale: 0.975,
        opacity: 0,
        duration: 0.85,
        delay: 0.14,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });

      gsap.from("[data-hero-float]", {
        y: 18,
        opacity: 0,
        duration: 0.7,
        stagger: 0.12,
        delay: 0.42,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });

      const groups = gsap.utils.toArray<HTMLElement>("[data-reveal-group]");
      for (const group of groups) {
        const items = group.querySelectorAll<HTMLElement>("[data-reveal]");
        if (!items.length) continue;
        gsap.from(items, {
          y: 24,
          opacity: 0,
          duration: 0.65,
          stagger: 0.07,
          ease: "power3.out",
          clearProps: "transform,opacity",
          scrollTrigger: {
            trigger: group,
            start: "top 84%",
            once: true,
          },
        });
      }
    }, scopeRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={scopeRef} className="lp" id="inicio">
      {children}
    </div>
  );
}

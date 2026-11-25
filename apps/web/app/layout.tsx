import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import { brand } from "./brand";
import "./styles.css";
import "./landing.css";
import "./clinica/assistant-chat.css";
import "./editorial-system.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-editorial",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: `${brand.name} | Gestão para clínicas`, template: `%s | ${brand.name}` },
  description: brand.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${plusJakarta.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}

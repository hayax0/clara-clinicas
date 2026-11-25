import type { Metadata } from "next";
import ClinicApp from "./clinic-app";

export const metadata: Metadata = { title: "Área da clínica" };

export default async function ClinicPage({ searchParams }: { searchParams: Promise<{ cadastro?: string; area?: string }> }) {
  const query = await searchParams;
  return <ClinicApp initialRegister={query.cadastro === "1"} openAssistant={query.area === "assistente"} />;
}

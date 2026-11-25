import { CaptureForm } from "./form";

export default async function CapturePage({params,searchParams}:{params:Promise<{clinicId:string}>;searchParams:Promise<{origem?:string}>}) {
  const {clinicId}=await params;
  const {origem}=await searchParams;
  return <CaptureForm key={clinicId} clinicId={clinicId} origin={origem}/>;
}

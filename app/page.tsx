import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { getCurrentUser } from "@/lib/auth/session";
import { landingPeopleCount } from "@/lib/landing/count";

export const metadata: Metadata = {
  title: { absolute: "Salin: know what's fine to spend today" },
  description: "One number a day for your allowance, your pay or your side hustle. Give every peso a job, free, on the web.",
  openGraph: {
    title: "Salin: know what's fine to spend today",
    description: "One number a day for your allowance, your pay or your side hustle. Give every peso a job.",
    type: "website",
  },
};

export default async function Home() {
  // Signed-in people go straight to their money; everyone else meets the landing page.
  if (await getCurrentUser()) redirect("/today");
  return <Landing people={await landingPeopleCount()} />;
}

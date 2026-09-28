import { env } from "cloudflare:workers";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@/generated/prisma/client";
import { notFound } from "next/navigation";
import Calculator from "@/app/calculator-client";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function SharedPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token) || !env.DB) notFound();
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) });
  const plan = await prisma.savedPlan.findUnique({ where: { shareToken: token } });
  if (!plan) notFound();
  const user = await getChatGPTUser();
  return <Calculator signedIn={Boolean(user)} userName={user?.displayName??null} signInPath={chatGPTSignInPath(`/paylas/${token}`)} signOutPath={chatGPTSignOutPath(`/paylas/${token}`)} sharedPlan={{ name: plan.name, data: JSON.parse(plan.data) }} />;
}

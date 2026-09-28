import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";
import Calculator from "./calculator-client";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await getChatGPTUser();
  const { plan } = await searchParams;
  return <Calculator signedIn={Boolean(user)} userName={user?.displayName ?? null} signInPath={chatGPTSignInPath("/")} signOutPath={chatGPTSignOutPath("/")} openPlanId={plan} />;
}

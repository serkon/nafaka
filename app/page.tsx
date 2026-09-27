import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import Calculator from "./calculator-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getChatGPTUser();
  return <Calculator signedIn={Boolean(user)} userName={user?.displayName ?? null} signInPath={chatGPTSignInPath("/")} />;
}

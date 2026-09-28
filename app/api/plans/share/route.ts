import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

function planId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

async function changeShare(request: Request, revoke: boolean) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Paylaşım için giriş yap." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Kayıt veritabanı kullanılamıyor." }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Geçersiz hesaplama." }, { status: 400 }); }
  const id = planId(body);
  if (!id) return Response.json({ error: "Geçersiz hesaplama." }, { status: 400 });

  try {
    const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) });
    const where = { id, ownerId: user.userId };
    const plan = await prisma.savedPlan.findFirst({ where, select: { shareToken: true } });
    if (!plan) return Response.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    if (revoke) {
      await prisma.savedPlan.updateMany({ where, data: { shareToken: null } });
      return Response.json({ shareToken: null });
    }
    if (plan.shareToken) return Response.json({ shareToken: plan.shareToken });
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    await prisma.savedPlan.updateMany({ where: { ...where, shareToken: null }, data: { shareToken: token } });
    const current = await prisma.savedPlan.findFirst({ where, select: { shareToken: true } });
    if (!current?.shareToken) return Response.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    return Response.json({ shareToken: current.shareToken });
  } catch (error) {
    console.error("Paylaşım değiştirilemedi", error);
    return Response.json({ error: "Paylaşım şu anda kullanılamıyor." }, { status: 503 });
  }
}

export async function POST(request: Request) { return changeShare(request, false); }
export async function DELETE(request: Request) { return changeShare(request, true); }

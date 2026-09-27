import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type PlanInput = { name: string; data: unknown };

async function context() {
  const user = await getChatGPTUser();
  if (!user) return null;
  if (!env.DB) throw new Error("Kayıt veritabanı kullanılamıyor.");
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) });
  return { ownerId: user.userId, prisma };
}

function failed() {
  return Response.json({ error: "Kayıtlar şu anda kullanılamıyor. Tekrar deneyin." }, { status: 503 });
}

function unauthorized() {
  return Response.json({ error: "Kaydetmek için ChatGPT hesabınla giriş yap." }, { status: 401 });
}

function inputOf(value: unknown): PlanInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) return null;
  if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) return null;
  const data = input.data as Record<string, unknown>;
  if (!Array.isArray(data.items) || data.items.length > 100 || typeof data.start !== "string" || typeof data.end !== "string") return null;
  if (JSON.stringify(data).length > 100000) return null;
  return { name: input.name.trim(), data };
}

export async function GET() {
  try {
    const ctx = await context();
    if (!ctx) return unauthorized();
    const result = await ctx.prisma.savedPlan.findMany({ where: { ownerId: ctx.ownerId }, orderBy: { updatedAt: "desc" } });
    return Response.json({ plans: result.map(row => ({ id: row.id, name: row.name, data: JSON.parse(row.data), createdAt: row.createdAt, updatedAt: row.updatedAt })) });
  } catch (error) {
    console.error("Plan listesi okunamadı", error);
    return failed();
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await context();
    if (!ctx) return unauthorized();
    const body = await request.text();
    if (body.length > 120000) return Response.json({ error: "Hesaplama çok büyük." }, { status: 413 });
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { return Response.json({ error: "Geçersiz hesaplama." }, { status: 400 }); }
    const input = inputOf(parsed);
    if (!input) return Response.json({ error: "Ad ve hesaplama bilgilerini kontrol et." }, { status: 400 });
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await ctx.prisma.savedPlan.create({ data: { id, ownerId: ctx.ownerId, name: input.name, data: JSON.stringify(input.data), createdAt: now, updatedAt: now } });
    return Response.json({ plan: { id, name: input.name, data: input.data, createdAt: now, updatedAt: now } }, { status: 201 });
  } catch (error) {
    console.error("Plan kaydedilemedi", error);
    return failed();
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await context();
    if (!ctx) return unauthorized();
    const body = await request.text();
    if (body.length > 120000) return Response.json({ error: "Hesaplama çok büyük." }, { status: 413 });
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { return Response.json({ error: "Geçersiz hesaplama." }, { status: 400 }); }
    const input = inputOf(parsed);
    const id = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).id : null;
    if (!input || typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Geçersiz hesaplama." }, { status: 400 });
    const now = new Date().toISOString();
    const update = await ctx.prisma.savedPlan.updateMany({ where: { id, ownerId: ctx.ownerId }, data: { name: input.name, data: JSON.stringify(input.data), updatedAt: now } });
    if (!update.count) return Response.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    return Response.json({ plan: { id, name: input.name, data: input.data, updatedAt: now } });
  } catch (error) {
    console.error("Plan güncellenemedi", error);
    return failed();
  }
}

"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { calculate, initialItems, money, type CostItem, type Frequency } from "@/lib/calculator";

const sum = (rows: {amount:number}[]) => rows.reduce((n, row) => n + row.amount, 0);
const dateLabel = (iso:string) => new Intl.DateTimeFormat("tr-TR",{month:"long",year:"numeric"}).format(new Date(iso+"T12:00:00Z"));
type PlanData = { items: CostItem[]; start: string; end: string; single: number; singleRate: number; singleIncrease: string };
type SavedPlan = { id: string; name: string; data: PlanData; createdAt: string; updatedAt: string };
function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export default function Home({signedIn,signInPath}:{signedIn:boolean;signInPath:string}) {
  const [items,setItems] = useState<CostItem[]>(initialItems);
  const [start,setStart] = useState("2026-10-01");
  const [end,setEnd] = useState("2029-06-30");
  const [open,setOpen] = useState<string|null>(null);
  const [single,setSingle] = useState(35000);
  const [singleRate,setSingleRate] = useState(35);
  const [singleIncrease,setSingleIncrease] = useState("2027-02-01");
  const [plans,setPlans] = useState<SavedPlan[]>([]);
  const [activeId,setActiveId] = useState<string|null>(null);
  const [planName,setPlanName] = useState("Sarp · Lise bitimine kadar");
  const [baseline,setBaseline] = useState("");
  const [saveAs,setSaveAs] = useState(false);
  const [copyName,setCopyName] = useState("");
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [listLoading,setListLoading] = useState(signedIn);
  const data:PlanData={items,start,end,single,singleRate,singleIncrease};
  const dirty=Boolean(activeId && baseline && JSON.stringify(data)!==baseline);
  useEffect(()=>{
    if (!signedIn) return;
    fetch("/api/plans",{cache:"no-store"}).then(async response=>{
      const body=await response.json() as {error?:string;plans:SavedPlan[]};
      if (!response.ok) throw new Error(body.error || "Kayıtlar yüklenemedi.");
      setPlans(body.plans);
    }).catch(error=>setNotice(error.message)).finally(()=>setListLoading(false));
  },[signedIn]);
  const payments = useMemo(()=>calculate(items,start,end),[items,start,end]);
  const singlePayments = useMemo(()=>calculate([{
    id:"single",name:"Tek aylık ödeme",amount:single,share:100,frequency:"monthly",monthsPerYear:12,
    firstDue:start,lastDue:"",paidThrough:"",annualRate:singleRate,firstIncrease:singleIncrease
  }],start,end),[single,singleRate,singleIncrease,start,end]);
  const total=sum(payments), singleTotal=sum(singlePayments), difference=singleTotal-total;
  const itemRows=useMemo(()=>items.map(item=>({item,rows:payments.filter(p=>p.itemId===item.id)})),[items,payments]);
  const monthly=useMemo(()=>{
    const map=new Map<string,{detail:number;single:number;items:Record<string,number>}>();
    const get=(key:string)=>map.get(key)||{detail:0,single:0,items:{}};
    payments.forEach(p=>{const key=p.date.slice(0,7),v=get(key);v.detail+=p.amount;v.items[p.itemId]=(v.items[p.itemId]||0)+p.amount;map.set(key,v);});
    singlePayments.forEach(p=>{const key=p.date.slice(0,7),v=get(key);v.single+=p.amount;map.set(key,v);});
    return [...map.entries()].sort(([a],[b])=>a.localeCompare(b));
  },[payments,singlePayments]);
  const update=(id:string,changes:Partial<CostItem>)=>setItems(old=>old.map(i=>i.id===id?{...i,...changes}:i));
  function add() {
    const id="item-"+Date.now();
    setItems(old=>[...old,{id,name:"Yeni gider",amount:0,share:50,frequency:"yearly",monthsPerYear:12,firstDue:start,lastDue:"",paidThrough:"",annualRate:35,firstIncrease:""}]);
    setOpen(id);
  }
  function reset() {
    setItems(initialItems);setStart("2026-10-01");setEnd("2029-06-30");setSingle(35000);
    setSingleRate(35);setSingleIncrease("2027-02-01");setOpen(null);
  }
  function load(plan:SavedPlan) {
    if (dirty && !window.confirm("Kaydedilmemiş değişiklikler silinsin mi?")) return;
    setItems(plan.data.items);setStart(plan.data.start);setEnd(plan.data.end);
    setSingle(plan.data.single);setSingleRate(plan.data.singleRate);
    setSingleIncrease(plan.data.singleIncrease);
    setActiveId(plan.id);setPlanName(plan.name);setBaseline(JSON.stringify(plan.data));
    setOpen(null);setSaveAs(false);setNotice(`“${plan.name}” açıldı.`);
  }
  function newPlan() {
    if (dirty && !window.confirm("Kaydedilmemiş değişiklikler silinsin mi?")) return;
    reset();setActiveId(null);setPlanName("Yeni hesaplama");setBaseline("");setSaveAs(false);
    setNotice("Yeni hesaplama hazır. Örnek değerleri düzenleyebilirsin.");
  }
  async function persist(asCopy:boolean) {
    const name=(asCopy?copyName:planName).trim();
    if (!name || name.length>80) {setNotice("Hesaplama adı 1–80 karakter olmalı.");return;}
    setBusy(true);setNotice("");
    try {
      const isUpdate=!asCopy && Boolean(activeId);
      const response=await fetch("/api/plans",{method:isUpdate?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...(isUpdate?{id:activeId}:{}),name,data})});
      const result=await response.json() as {error?:string;plan:SavedPlan};
      if (!response.ok) throw new Error(result.error||"Kaydetme başarısız.");
      const saved:SavedPlan={...result.plan,createdAt:result.plan.createdAt||plans.find(p=>p.id===activeId)?.createdAt||new Date().toISOString()};
      setPlans(old=>[saved,...old.filter(p=>p.id!==saved.id)]);
      setActiveId(saved.id);setPlanName(saved.name);setBaseline(JSON.stringify(data));
      setSaveAs(false);setNotice(isUpdate?"Değişiklikler kaydedildi.":"Yeni hesaplama kaydedildi.");
    } catch(error) {setNotice(error instanceof Error?error.message:"Kaydetme başarısız. Tekrar deneyin.");}
    finally {setBusy(false);}
  }
  return <main className="app-shell">
    <header className="topbar"><div className="mark">∑</div><div className="identity"><strong>Gider Planı</strong><span>Çocuk giderleri ve nafaka hesaplayıcı</span></div><span className="privacy">Hesaplama bu ekranda yapılır</span></header>
    <div className="workspace">
      <section className="editor">
        <div className="intro"><p className="eyebrow">HESAPLAMA ALANI</p><h1>Ödemelerini planla</h1><p>Örnek plan Ekim 2026–Haziran 2029 dönemini kapsar. Kurs üç eğitim yılında sekizer ay sürer; tutarları ve ödeme tarihlerini değiştirebilirsin.</p></div>
        <section className="panel plans-panel" aria-label="Kayıtlı hesaplamalar">
          <div className="plans-heading"><div><h2>Hesaplamalarım</h2><p>{activeId?"Açık hesabı güncelle veya farklı adla kopyala.":"Bu hesabı kaydet, sonra başka bir hesaplama oluştur."}</p></div><Button type="button" variant="outline" onClick={newPlan}>Yeni hesaplama</Button></div>
          {signedIn?<>
            <div className="save-bar"><Field label="Hesaplama adı"><Input maxLength={80} value={planName} onChange={e=>setPlanName(e.target.value)} /></Field><Button type="button" disabled={busy} onClick={()=>persist(false)}><Save size={16}/>{activeId?"Kaydet":"Kaydet"}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{setCopyName(`${planName} · Kopya`);setSaveAs(true);}}>Farklı kaydet</Button></div>
            {saveAs&&<div className="save-as"><Field label="Yeni kopyanın adı"><Input maxLength={80} value={copyName} onChange={e=>setCopyName(e.target.value)}/></Field><Button disabled={busy} type="button" onClick={()=>persist(true)}>Yeni kayıt oluştur</Button><Button type="button" variant="ghost" onClick={()=>setSaveAs(false)}>Vazgeç</Button></div>}
            <div className="saved-list"><strong>Kayıtlı hesaplamalar {plans.length?`(${plans.length})`:""}</strong>{listLoading?<p>Yükleniyor…</p>:plans.length?<div className="saved-scroll">{plans.map(plan=><button type="button" className={`saved-item ${plan.id===activeId?"selected":""}`} key={plan.id} onClick={()=>load(plan)}><span><b>{plan.name}</b><small>{new Date(plan.updatedAt).toLocaleDateString("tr-TR")} · {money(sum(calculate(plan.data.items,plan.data.start,plan.data.end)))}</small></span><span>{plan.id===activeId?(dirty?"Değiştirildi":"Açık"):"Aç"}</span></button>)}</div>:<p>Henüz kayıtlı hesaplama yok.</p>}</div>
          </>:<div className="sign-in-prompt"><p>Hesaplamalarını farklı oturumlarda görmek için ChatGPT hesabınla giriş yap. Giriş yapmadan hesaplama yapabilirsin.</p><a href={signInPath} target="_top">Giriş yap ve kaydet</a></div>}
          {notice&&<p className="save-notice" role="status">{notice}</p>}
        </section>
        <section className="panel period"><div className="panel-heading"><div className="icon">01</div><div><h2>Hesaplama dönemi</h2><p>Başlangıç ve bitiş tarihleri dahildir.</p></div></div><div className="two-fields">
          <Field label="Başlangıç tarihi"><Input type="date" value={start} onChange={e=>setStart(e.target.value)} /></Field>
          <Field label="Bitiş tarihi"><Input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></Field>
        </div>{start>end && <p role="alert" className="error">Bitiş tarihi başlangıçtan önce olamaz.</p>}</section>
        <div className="list-head"><div><h2>Gider kalemleri <span className="count">{items.length}</span></h2><p>Her kalemin kendi tutarı ve ödeme takvimi var.</p></div><Button type="button" onClick={add}><Plus size={16}/> Kalem ekle</Button></div>
        <div className="item-list">{itemRows.map(({item,rows})=><article className={"item "+(open===item.id?"expanded":"")} key={item.id}>
          <button className="item-summary" type="button" aria-expanded={open===item.id} onClick={()=>setOpen(open===item.id?null:item.id)}>
            <span className="item-icon">{item.name[0]?.toLocaleUpperCase("tr-TR")||"•"}</span><span className="item-name"><strong>{item.name||"İsimsiz kalem"}</strong><small>{item.frequency==="monthly"?`Yılda ${item.monthsPerYear} ay`:item.frequency==="yearly"?"Yıllık":item.frequency==="dates"?"Belirli tarihler":"Tek sefer"} · %{item.share} pay · {rows.length} ödeme</small></span><span className="item-money">{money(sum(rows))}</span>{open===item.id?<ChevronUp size={18}/>:<ChevronDown size={18}/>}
          </button>
          {open===item.id && <div className="details"><div className="form-grid">
            <Field label="Kalem adı"><Input value={item.name} onChange={e=>update(item.id,{name:e.target.value})}/></Field>
            <Field label="Bir ödeme için temel tutar (TL)"><Input type="number" min="0" step="0.01" value={item.amount} onChange={e=>update(item.id,{amount:Number(e.target.value)})}/></Field>
            <Field label="Tekrar şekli"><NativeSelect className="w-full" value={item.frequency} onChange={e=>update(item.id,{frequency:e.target.value as Frequency})}><NativeSelectOption value="monthly">Aylık</NativeSelectOption><NativeSelectOption value="yearly">Yıllık</NativeSelectOption><NativeSelectOption value="dates">Belirli tarihler</NativeSelectOption><NativeSelectOption value="once">Tek sefer</NativeSelectOption></NativeSelect></Field>
            <Field label="Senin payın (%)"><Input type="number" min="0" max="100" value={item.share} onChange={e=>update(item.id,{share:Number(e.target.value)})}/></Field>
            {item.frequency==="monthly" && <Field label="Yılda kaç ay?" hint="Kurs için 8, nafaka için 12 gibi."><Input type="number" min="1" max="12" value={item.monthsPerYear} onChange={e=>update(item.id,{monthsPerYear:Number(e.target.value)})}/></Field>}
            {item.frequency==="dates" && <Field label="Ödeme tarihleri" hint="YYYY-AA-GG biçiminde, virgülle ayır. Örnek: 2026-11-01, 2027-09-01"><Input value={(item.dueDates??[]).join(", ")} onChange={e=>update(item.id,{dueDates:e.target.value.split(",").map(s=>s.trim())})}/></Field>}
            <Field label="İlk ödeme tarihi" hint="Geçmiş tarih de girilebilir."><Input type="date" value={item.firstDue} onChange={e=>update(item.id,{firstDue:e.target.value})}/></Field>
            <Field label="Son ödeme tarihi (isteğe bağlı)"><Input type="date" value={item.lastDue} onChange={e=>update(item.id,{lastDue:e.target.value})}/></Field>
            <Field label="Ödenmiş son tarih" hint="Bu tarihe kadarki ödemeler hesaptan düşülür."><Input type="date" value={item.paidThrough} onChange={e=>update(item.id,{paidThrough:e.target.value})}/></Field>
            <Field label="Yıllık artış (%)"><Input type="number" min="-100" step="0.01" value={item.annualRate} onChange={e=>update(item.id,{annualRate:Number(e.target.value)})}/></Field>
            <Field label="İlk artış tarihi" hint="Boş bırakılırsa ilk ödemeden 12 ay sonra başlar; son ödeme tarihine kadar her yıl tekrarlanır."><Input type="date" value={item.firstIncrease} onChange={e=>update(item.id,{firstIncrease:e.target.value})}/></Field>
          </div><div className="item-footer"><span>Ödenmiş tutarlar kalan toplama girmez.</span><Button type="button" variant="ghost" onClick={()=>{setItems(old=>old.filter(i=>i.id!==item.id));setOpen(null);}}><Trash2 size={15}/> Kalemi sil</Button></div></div>}
        </article>)}</div>
        <Button type="button" variant="ghost" className="reset" onClick={reset}><RotateCcw size={15}/> Örnek değerlere dön</Button>
      </section>
      <aside className="results"><div className="results-sticky"><p className="eyebrow">ANLIK SONUÇ</p><h2>Toplam karşılaştırma</h2><p>Seçtiğin tarihler arasındaki kalan ödemeler</p>
        <div className="total-card"><span>Kalem kalem toplam</span><strong>{money(total)}</strong><small>{payments.length} ödeme · {items.length} kalem</small></div>
        <div className="single-card"><div className="single-head"><span>Tek aylık ödeme</span><strong>{money(singleTotal)}</strong></div><div className="single-fields">
          <Field label="Başlangıç tutarı (TL)"><Input type="number" min="0" value={single} onChange={e=>setSingle(Number(e.target.value))}/></Field>
          <Field label="Yıllık artış (%)"><Input type="number" min="-100" value={singleRate} onChange={e=>setSingleRate(Number(e.target.value))}/></Field>
          <Field label="İlk artış" hint="Boşsa başlangıçtan 12 ay sonra."><Input type="date" value={singleIncrease} onChange={e=>setSingleIncrease(e.target.value)}/></Field>
        </div></div>
        <div className={"difference "+(difference>0?"higher":difference<0?"lower":"")}><span>{difference>0?"Tek ödeme daha yüksek":difference<0?"Tek ödeme daha düşük":"İki toplam eşit"}</span><strong>{money(Math.abs(difference))}</strong></div>
        <p className="note">Tek aylık ödeme diğer kalemlerin yerine geçtiği varsayımıyla karşılaştırılır. 18 yaş sonrası destek yalnızca bütçe varsayımıdır; hukuki bir ödeme kararı değildir. Kuruşlar toplamda yuvarlanır.</p>
      </div></aside>
    </div>
    <section className="breakdown"><p className="eyebrow">ÖDEME DÖKÜMÜ</p><h2>Nereye ne kadar gidiyor?</h2><p>Tarihe ve kaleme göre hesaplanan tutarlar.</p><div className="breakdown-grid">
      <div className="data-panel"><h3>Kalem bazında</h3>{itemRows.map(({item,rows})=><div className="data-row" key={item.id}><span>{item.name}<small>{rows.length} ödeme</small></span><strong>{money(sum(rows))}</strong></div>)}<div className="data-row grand"><span>Toplam</span><strong>{money(total)}</strong></div></div>
    </div><div className="data-panel matrix-panel"><h3>Ay ay ödeme planı</h3><p>Her sütun senin payını gösterir; ödenmiş okul ve servis tutarı yeniden eklenmez.</p><div className="month-scroll matrix-scroll"><table><thead><tr><th>Ay</th>{items.map(item=><th key={item.id}>{item.name}</th>)}<th>Aylık toplam</th><th>Tek ödeme</th></tr></thead><tbody>{monthly.map(([month,v])=><tr key={month}><td>{dateLabel(month+"-01")}</td>{items.map(item=><td key={item.id}>{v.items[item.id]?money(v.items[item.id]):"—"}</td>)}<td className="row-total">{money(v.detail)}</td><td>{money(v.single)}</td></tr>)}</tbody><tfoot><tr><th>GENEL TOPLAM</th>{items.map(item=><th key={item.id}>{money(sum(payments.filter(p=>p.itemId===item.id)))}</th>)}<th>{money(total)}</th><th>{money(singleTotal)}</th></tr></tfoot></table></div></div></section>
  </main>;
}

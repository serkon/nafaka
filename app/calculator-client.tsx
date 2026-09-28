"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { calculate, initialItems, money, type CostItem, type Frequency } from "@/lib/calculator";

const sum = (rows: {amount:number}[]) => rows.reduce((n, row) => n + row.amount, 0);
const dateLabel = (iso:string) => new Intl.DateTimeFormat("tr-TR",{month:"long",year:"numeric"}).format(new Date(iso+"T12:00:00Z"));
const monthOptions=Array.from({length:12},(_,index)=>({value:String(index+1).padStart(2,"0"),label:new Intl.DateTimeFormat("tr-TR",{month:"long"}).format(new Date(Date.UTC(2000,index,1)))}));
const birthMonthOf=(value:string|undefined)=>{
  const month=value?.match(/^(?:\d{2}-)?(\d{2})$/)?.[1];
  return monthOptions.some(option=>option.value===month)?month!:"03";
};
type PlanData = { items: CostItem[]; start: string; end: string; generalRate: number; birthday: string; single: number; singleRate?: number; singleIncrease: string };
type SavedPlan = { id: string; name: string; data: PlanData; createdAt: string; updatedAt: string };
function currentPlan(plan:SavedPlan):SavedPlan {
  const name=plan.name.endsWith(" · Lise bitimine kadar")?"Lise bitimine kadar":plan.name;
  const items=plan.data.items.flatMap(item=>{
    const normalized=item.annualRate===35 && plan.data.generalRate===undefined?{...item,annualRate:undefined}:item;
    if (item.id==="allowance") return [{...normalized,increaseOnBirthday:true,annualRate:item.annualRate===0 && !item.increaseOnBirthday && item.amount===5000?undefined:normalized.annualRate}];
    if (item.id!=="school-transport") return [normalized];
    const school=Math.round(item.amount*109641.4/196460.4*100)/100;
    return [{...normalized,id:"school",name:"Okul ücreti",amount:school},{...normalized,id:"transport",name:"Servis",amount:Math.round((item.amount-school)*100)/100}];
  });
  return {...plan,name,data:{...plan.data,items,generalRate:plan.data.generalRate??35,birthday:birthMonthOf(plan.data.birthday),singleRate:plan.data.generalRate===undefined && plan.data.singleRate===35?undefined:plan.data.singleRate}};
}
function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export default function Home({signedIn,userName,signInPath}:{signedIn:boolean;userName:string|null;signInPath:string}) {
  const [items,setItems] = useState<CostItem[]>(initialItems);
  const [start,setStart] = useState("2026-10-01");
  const [end,setEnd] = useState("2029-06-30");
  const [generalRate,setGeneralRate] = useState(35);
  const [birthday,setBirthday] = useState("03");
  const [open,setOpen] = useState<string|null>(null);
  const [single,setSingle] = useState(35000);
  const [singleRate,setSingleRate] = useState<number|undefined>(undefined);
  const [singleIncrease,setSingleIncrease] = useState("2027-10-01");
  const [plans,setPlans] = useState<SavedPlan[]>([]);
  const [activeId,setActiveId] = useState<string|null>(null);
  const [planName,setPlanName] = useState("Lise bitimine kadar");
  const [baseline,setBaseline] = useState("");
  const [saveAs,setSaveAs] = useState(false);
  const [copyName,setCopyName] = useState("");
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [listLoading,setListLoading] = useState(signedIn);
  const data:PlanData={items,start,end,generalRate,birthday,single,singleRate,singleIncrease};
  const dirty=Boolean(activeId && baseline && JSON.stringify(data)!==baseline);
  useEffect(()=>{
    if (!signedIn) return;
    fetch("/api/plans",{cache:"no-store"}).then(async response=>{
      const body=await response.json() as {error?:string;plans:SavedPlan[]};
      if (!response.ok) throw new Error(body.error || "Kayıtlar yüklenemedi.");
      setPlans(body.plans.map(currentPlan));
    }).catch(error=>setNotice(error.message)).finally(()=>setListLoading(false));
  },[signedIn]);
  const payments = useMemo(()=>calculate(items,start,end,generalRate,birthday),[items,start,end,generalRate,birthday]);
  const singlePayments = useMemo(()=>calculate([{
    id:"single",name:"Tek aylık ödeme",amount:single,share:100,frequency:"monthly",monthsPerYear:12,
    firstDue:start,lastDue:"",paidThrough:"",annualRate:singleRate,firstIncrease:singleIncrease
  }],start,end,generalRate),[single,singleRate,singleIncrease,start,end,generalRate]);
  const total=sum(payments), singleTotal=sum(singlePayments), difference=singleTotal-total;
  const monthCount=/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start<=end
    ? (Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5,7))-Number(start.slice(5,7))+1 : 0;
  const years=useMemo(()=>{
    if (!monthCount) return [];
    const yearTotals=new Map<number,number>();
    payments.forEach(payment=>{
      const year=Number(payment.date.slice(0,4));
      yearTotals.set(year,(yearTotals.get(year)??0)+payment.amount);
    });
    const firstYear=Number(start.slice(0,4)),lastYear=Number(end.slice(0,4));
    return Array.from({length:lastYear-firstYear+1},(_,offset)=>{
      const year=firstYear+offset;
      const months=(year===lastYear?Number(end.slice(5,7)):12)-(year===firstYear?Number(start.slice(5,7)):1)+1;
      return {year,months,total:yearTotals.get(year)??0};
    });
  },[payments,start,end,monthCount]);
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
    setItems(old=>[...old,{id,name:"Yeni gider",amount:0,share:50,frequency:"yearly",monthsPerYear:12,firstDue:start,lastDue:"",paidThrough:"",firstIncrease:""}]);
    setOpen(id);
  }
  function reset() {
    setItems(initialItems);setStart("2026-10-01");setEnd("2029-06-30");setGeneralRate(35);setBirthday("03");setSingle(35000);
    setSingleRate(undefined);setSingleIncrease("2027-10-01");setOpen(null);
  }
  function load(plan:SavedPlan) {
    if (dirty && !window.confirm("Kaydedilmemiş değişiklikler silinsin mi?")) return;
    setItems(plan.data.items);setStart(plan.data.start);setEnd(plan.data.end);
    setGeneralRate(plan.data.generalRate);setBirthday(plan.data.birthday);
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
  async function removePlan(plan:SavedPlan) {
    if (!window.confirm(`“${plan.name}” kayıtlı hesaplaması silinsin mi? Bu işlem geri alınamaz.`)) return;
    setBusy(true);setNotice("");
    try {
      const response=await fetch("/api/plans",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:plan.id})});
      const result=await response.json() as {error?:string};
      if (!response.ok) throw new Error(result.error||"Hesaplama silinemedi.");
      setPlans(old=>old.filter(p=>p.id!==plan.id));
      if (activeId===plan.id) {setActiveId(null);setBaseline("");setSaveAs(false);}
      setNotice(`“${plan.name}” silindi.`);
    } catch(error) {setNotice(error instanceof Error?error.message:"Hesaplama silinemedi. Tekrar deneyin.");}
    finally {setBusy(false);}
  }
  return <>
    <header className="topbar"><div className="topbar-inner"><div className="mark">∑</div><div className="identity"><strong>Gider Planı</strong><span>Çocuk giderleri ve nafaka hesaplayıcı</span></div><span className="header-user" title={userName||undefined}>{userName||"Hesaplama bu ekranda yapılır"}</span></div></header>
    <main className="app-shell">
    <div className="workspace">
      <section className="editor">
        <div className="intro"><p className="eyebrow">HESAPLAMA ALANI</p><h1>Ödemelerini planla</h1><p>Örnek plan Ekim 2026–Haziran 2029 dönemini kapsar. Kurs üç eğitim yılında sekizer ay sürer; tutarları ve ödeme tarihlerini değiştirebilirsin.</p></div>
        <section className="panel plans-panel" aria-label="Kayıtlı hesaplamalar">
          <div className="plans-heading"><div><h2>Hesaplamalarım</h2><p>{activeId?"Açık hesabı güncelle veya farklı adla kopyala.":"Bu hesabı kaydet, sonra başka bir hesaplama oluştur."}</p></div><Button type="button" variant="outline" onClick={newPlan}>Yeni hesaplama</Button></div>
          {signedIn?<>
            <div className="save-bar"><Field label="Hesaplama adı"><Input maxLength={80} value={planName} onChange={e=>setPlanName(e.target.value)} /></Field><Button type="button" disabled={busy} onClick={()=>persist(false)}><Save size={16}/>{activeId?"Kaydet":"Kaydet"}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{setCopyName(`${planName} · Kopya`);setSaveAs(true);}}>Farklı kaydet</Button></div>
            {saveAs&&<div className="save-as"><Field label="Yeni kopyanın adı"><Input maxLength={80} value={copyName} onChange={e=>setCopyName(e.target.value)}/></Field><Button disabled={busy} type="button" onClick={()=>persist(true)}>Yeni kayıt oluştur</Button><Button type="button" variant="ghost" onClick={()=>setSaveAs(false)}>Vazgeç</Button></div>}
            <div className="saved-list"><strong>Kayıtlı hesaplamalar {plans.length?`(${plans.length})`:""}</strong>{listLoading?<p>Yükleniyor…</p>:plans.length?<div className="saved-scroll">{plans.map(plan=><div className={`saved-item ${plan.id===activeId?"selected":""}`} key={plan.id}><span className="saved-description"><b>{plan.name}</b><small>{new Date(plan.updatedAt).toLocaleDateString("tr-TR")} · {money(sum(calculate(plan.data.items,plan.data.start,plan.data.end,plan.data.generalRate,plan.data.birthday)))}</small></span><span className="saved-actions"><Button type="button" variant="ghost" disabled={busy} onClick={()=>load(plan)}>Düzenle</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>removePlan(plan)} aria-label={`${plan.name} hesabını sil`}><Trash2 size={15}/> Sil</Button></span></div>)}</div>:<p>Henüz kayıtlı hesaplama yok.</p>}</div>
          </>:<div className="sign-in-prompt"><p>Hesaplamalarını farklı oturumlarda görmek için ChatGPT hesabınla giriş yap. Giriş yapmadan hesaplama yapabilirsin.</p><a href={signInPath} target="_top">Giriş yap ve kaydet</a></div>}
          {notice&&<p className="save-notice" role="status">{notice}</p>}
        </section>
        <section className="panel period"><div className="panel-heading"><div className="icon">01</div><div><h2>Hesaplama dönemi</h2><p>Başlangıç ve bitiş tarihleri dahildir.</p></div></div><div className="two-fields">
          <Field label="Başlangıç tarihi"><Input type="date" value={start} onChange={e=>setStart(e.target.value)} /></Field>
          <Field label="Bitiş tarihi"><Input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></Field>
        </div><div className="two-fields plan-settings">
          <Field label="Genel yıllık artış (%)" hint="Özel oran girilmeyen tüm giderlerde ve tek ödeme karşılaştırmasında kullanılır."><Input type="number" min="-100" step="0.01" value={generalRate} onChange={e=>setGeneralRate(Number(e.target.value))}/></Field>
          <Field label="Doğum ayı" hint="Harçlık artışı bu ayın ödemesinde başlar. Varsayılan Mart ayını değiştirebilirsin."><NativeSelect className="w-full" value={birthday} onChange={e=>setBirthday(e.target.value)}>{monthOptions.map(option=><NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}</NativeSelect></Field>
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
            <Field label="Kaleme özel yıllık artış (%)" hint={`Boşsa genel oran (%${generalRate}) kullanılır; 0 girersen artış olmaz.`}><Input type="number" min="-100" step="0.01" placeholder={String(generalRate)} value={item.annualRate??""} onChange={e=>update(item.id,{annualRate:e.target.value===""?undefined:Number(e.target.value)})}/></Field>
            <Field label="İlk artış tarihi" hint={item.increaseOnBirthday?"Boşsa artış doğum ayının ödemesinde başlar. Tarih girersen onu kullanır.":"Boşsa ilk ödemeden 12 ay sonra başlar; her yıl tekrarlanır."}><Input type="date" value={item.firstIncrease} onChange={e=>update(item.id,{firstIncrease:e.target.value})}/></Field>
          </div><div className="item-footer"><span>Ödenmiş tutarlar kalan toplama girmez.</span><Button type="button" variant="ghost" onClick={()=>{setItems(old=>old.filter(i=>i.id!==item.id));setOpen(null);}}><Trash2 size={15}/> Kalemi sil</Button></div></div>}
        </article>)}</div>
        <Button type="button" variant="ghost" className="reset" onClick={reset}><RotateCcw size={15}/> Örnek değerlere dön</Button>
      </section>
      <aside className="results"><div className="results-sticky"><p className="eyebrow">ANLIK SONUÇ</p><h2>Toplam karşılaştırma</h2><p>Seçtiğin tarihler arasındaki kalan ödemeler</p>
        <div className="total-card"><span>Kalem kalem toplam</span><strong>{money(total)}</strong><small>{monthCount} ay · {payments.length} ödeme hareketi · {items.length} gider kalemi</small></div>
        <div className="average-card"><strong>Dönem ortalamaları</strong><div><span>Aylık ortalama</span><b>{money(monthCount?total/monthCount:0)}</b></div><div><span>Yıllık ortalama</span><b>{money(monthCount?total/monthCount*12:0)}</b></div><small>{monthCount} ayın toplamından hesaplanır. Yıllık değer 12 aya ölçeklenmiş ortalamadır.</small></div>
        {years.length>0&&<div className="year-card"><strong>Takvim yılına göre</strong>{years.map(row=><div className="year-row" key={row.year}><span><b>{row.year}</b><small>{row.months} ay · aylık ort. {money(row.total/row.months)}</small></span><strong>{money(row.total)}</strong></div>)}<small>Her yılın seçilen tarihler arasındaki gerçek ödeme toplamı. Ödenmiş tutarlar dahil değildir.</small></div>}
        <div className="single-card"><div className="single-head"><span>Tek aylık ödeme</span><strong>{money(singleTotal)}</strong></div><div className="single-fields">
          <Field label="Başlangıç tutarı (TL)"><Input type="number" min="0" value={single} onChange={e=>setSingle(Number(e.target.value))}/></Field>
          <Field label="Özel yıllık artış (%)" hint={`Boşsa genel oran (%${generalRate}) kullanılır.`}><Input type="number" min="-100" placeholder={String(generalRate)} value={singleRate??""} onChange={e=>setSingleRate(e.target.value===""?undefined:Number(e.target.value))}/></Field>
          <Field label="İlk artış" hint="Boşsa başlangıçtan 12 ay sonra."><Input type="date" value={singleIncrease} onChange={e=>setSingleIncrease(e.target.value)}/></Field>
        </div></div>
        <div className={"difference "+(difference>0?"higher":difference<0?"lower":"")}><span>{difference>0?"Tek ödeme daha yüksek":difference<0?"Tek ödeme daha düşük":"İki toplam eşit"}</span><strong>{money(Math.abs(difference))}</strong></div>
        <p className="note">Tek aylık ödeme diğer kalemlerin yerine geçtiği varsayımıyla karşılaştırılır. 18 yaş sonrası destek yalnızca bütçe varsayımıdır; hukuki bir ödeme kararı değildir. Kuruşlar toplamda yuvarlanır.</p>
      </div></aside>
    </div>
    <section className="breakdown"><p className="eyebrow">ÖDEME DÖKÜMÜ</p><h2>Nereye ne kadar gidiyor?</h2><p>Tarihe ve kaleme göre hesaplanan tutarlar.</p><div className="breakdown-grid">
      <div className="data-panel"><h3>Kalem bazında</h3>{itemRows.map(({item,rows})=><div className="data-row" key={item.id}><span>{item.name}<small>{rows.length} ödeme</small></span><strong>{money(sum(rows))}</strong></div>)}<div className="data-row grand"><span>Toplam</span><strong>{money(total)}</strong></div></div>
    </div><div className="data-panel matrix-panel"><h3>Ay ay ödeme planı</h3><p>Her sütun senin payını gösterir; ödenmiş okul ve servis tutarı yeniden eklenmez.</p><div className="month-scroll matrix-scroll"><table><thead><tr><th>Ay</th>{items.map(item=><th key={item.id}>{item.name}</th>)}<th>Aylık toplam</th><th>Tek ödeme</th></tr></thead><tbody>{monthly.map(([month,v])=><tr key={month}><td>{dateLabel(month+"-01")}</td>{items.map(item=><td key={item.id}>{v.items[item.id]?money(v.items[item.id]):"—"}</td>)}<td className="row-total">{money(v.detail)}</td><td>{money(v.single)}</td></tr>)}</tbody><tfoot><tr><th>GENEL TOPLAM</th>{items.map(item=><th key={item.id}>{money(sum(payments.filter(p=>p.itemId===item.id)))}</th>)}<th>{money(total)}</th><th>{money(singleTotal)}</th></tr></tfoot></table></div></div></section>
    </main>
  </>;
}

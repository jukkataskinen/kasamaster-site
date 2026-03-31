import React, { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cuznmlozzsbyotuuofal.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1em5tbG96enNieW90dXVvZmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTQ1NTMsImV4cCI6MjA4OTg5MDU1M30.ci9QEREY1auW4qfmHL70bz7lt8yjEdnC1pgsuTDxnuE";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const Y = "#FFC107";
const BG = "#111111";

// Varaston sijainti
const WAREHOUSE = { address:"Nokantie 1858, Joutsa", lat:61.674083671249896, lng:26.220276184877136 };
const CARD = "#1E1E1E";
const CARD2 = "#282828";
const BORDER = "#333333";
const TEXT = "#F5F0E8";
const MUTED = "#D8D8D8";
const GREEN = "#22C55E";
const RED = "#EF4444";
const BLUE = "#60A5FA";

const fEur = n => Number(n).toFixed(2).replace(".", ",") + " €";
const fTon = n => Number(n).toFixed(2).replace(".", ",") + " t";

// Rahtihinta: noutohinta + 1,50 €/t (0-1 km) + 0,20 €/t/km (yli 1 km)
const freightPrice = (basePrice, km) => {
  if (!km || km <= 0) return basePrice;
  const freight = 1.50 + Math.max(0, km - 1) * 0.20;
  return basePrice + freight;
};

// Shared label style — slightly larger for readability
const LS_BASE = { fontSize:15, letterSpacing:1.5, color:"#FFC107", fontWeight:700, marginBottom:6, display:"block" };

// Product option helper — shows stock balance
const MatOptions = ({ stock }) =>
  Object.entries(MATS).map(([k,m]) => {
    const t = stock ? (stock[k]||0) : null;
    const label = t !== null ? `${m.emoji} ${m.label}  (${Number(t).toFixed(1).replace(".",",")} t)` : `${m.emoji} ${m.label}`;
    return <option key={k} value={k}>{label}</option>;
  });
const fDate = d => new Date(d).toLocaleDateString("fi-FI");
const nowDate = () => new Date().toISOString().split("T")[0];
const newId = () => Date.now() + Math.random();

const MATS = {
  kam_0_8:   { label: "KaM 0–8 mm",        short: "KaM 0-8",    color: "#92400e", emoji: "🟫", cat: "Kalliomurske" },
  kam_0_16:  { label: "KaM 0–16 mm",       short: "KaM 0-16",   color: "#b45309", emoji: "🟤", cat: "Kalliomurske" },
  kam_0_32:  { label: "KaM 0–32 mm",       short: "KaM 0-32",   color: "#d97706", emoji: "🟡", cat: "Kalliomurske" },
  kam_0_56:  { label: "KaM 0–56 mm",       short: "KaM 0-56",   color: "#ca8a04", emoji: "🟠", cat: "Kalliomurske" },
  sep_5_16:  { label: "Sepeli 5–16 mm",    short: "Sep 5-16",   color: "#475569", emoji: "⬜", cat: "Sepeli" },
  sep_8_16p: { label: "Sepeli 8–16 pesty", short: "Sep 8-16p",  color: "#334155", emoji: "🔲", cat: "Sepeli" },
  sep_16_32: { label: "Sepeli 16–32 mm",   short: "Sep 16-32",  color: "#1e293b", emoji: "⬛", cat: "Sepeli" },
  kivituhka: { label: "Kivituhka 0–6 mm",  short: "Kivituhka",  color: "#6b7280", emoji: "🌫️", cat: "Kivituhka" },
  hiekka:    { label: "Hiekka 0–8 mm",     short: "Hiekka",     color: "#a16207", emoji: "🏜️", cat: "Hiekka" },
};

const DEFAULT_PRICES = { kam_0_8:13.5, kam_0_16:12.0, kam_0_32:10.5, kam_0_56:9.0, sep_5_16:16.0, sep_8_16p:18.0, sep_16_32:15.5, kivituhka:11.0, hiekka:10.5 };
const DEFAULT_STOCK  = { kam_0_8:400, kam_0_16:1200, kam_0_32:800, kam_0_56:2400, sep_5_16:350, sep_8_16p:200, sep_16_32:180, kivituhka:300, hiekka:600 };
const DEFAULT_THRESHOLDS = { green:1500, red:300 };

// Default purchase cost components per ton (€/t)
const DEFAULT_PURCHASE_COSTS = Object.fromEntries(
  Object.keys({kam_0_8:1,kam_0_16:1,kam_0_32:1,kam_0_56:1,sep_5_16:1,sep_8_16p:1,sep_16_32:1,kivituhka:1,hiekka:1})
  .map(k => [k, { kiviaines:2.50, louhinta:2.00, murskaus:3.50 }])
);

// FIFO helpers
const batchCostPerTon = b => b.costPerTon !== undefined ? b.costPerTon : (b.costs?.kiviaines||0)+(b.costs?.louhinta||0)+(b.costs?.murskaus||0);
const getWeightedCost = (batches, material) => {
  const rel = (batches||[]).filter(b=>b.material===material&&(b.remainingTons||0)>0);
  const tons = rel.reduce((s,b)=>s+(b.remainingTons||0),0);
  if (!tons) return null;
  return rel.reduce((s,b)=>s+(b.remainingTons||0)*batchCostPerTon(b),0)/tons;
};
const consumeFIFO = (batches, material, tons) => {
  let left = tons;
  return (batches||[]).map(b => {
    if (b.material!==material||left<=0||(b.remainingTons||0)<=0) return b;
    const use = Math.min(b.remainingTons||0, left);
    left -= use;
    return {...b, remainingTons:(b.remainingTons||0)-use};
  });
};
const DEFAULT_LOCATIONS = [
  { id:"loc1", name:"Nokantie 1858", address:"Nokantie 1858, 19650 Joutsa", lat:61.674083671249896, lng:26.220276184877136 },
];
const DEFAULT_PRODUCT_LOCATIONS = {
  kam_0_8:"loc1", kam_0_16:"loc1", kam_0_32:"loc1", kam_0_56:"loc1",
  sep_5_16:"loc1", sep_8_16p:"loc1", sep_16_32:"loc1", kivituhka:"loc1", hiekka:"loc1",
};

function useStore(key, def) {
  const [val, setVal] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : def;
    } catch { return def; }
  });
  const save = useCallback(fn => {
    setVal(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [val, save];
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = {error:null}; }
  static getDerivedStateFromError(e) { return {error:e}; }
  render() {
    if (this.state.error) return (
      <div style={{background:"#111",color:"#eee",padding:24,minHeight:"100vh"}}>
        <div style={{color:"#FFC107",fontFamily:"'Bebas Neue'",fontSize:28,marginBottom:16}}>KASAMASTER — VIRHE</div>
        <div style={{color:"#ef4444",fontSize:16,marginBottom:12}}>{String(this.state.error)}</div>
        <button onClick={()=>this.setState({error:null})} style={{padding:"12px 24px",background:"#FFC107",color:"#000",border:"none",borderRadius:8,fontWeight:700,fontSize:16,cursor:"pointer"}}>
          ↺ Yritä uudelleen
        </button>
      </div>
    );
    return this.props.children;
  }
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}

function AppInner() {
  const [page, setPage] = useState("home");
  const [navKey, setNavKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timelogOpen, setTimelogOpen] = useState(false);
  const [clockedIn, setClockedIn] = useState(()=>{
    try{return JSON.parse(localStorage.getItem('km3_clocked_in')||'null');}catch{return null;}
  });
  const [elapsed, setElapsed] = useState(0);

  // Clock ticker
  React.useEffect(()=>{
    if(!clockedIn) return;
    const id = setInterval(()=>{
      setElapsed(Math.floor((Date.now()-new Date(clockedIn.startTime).getTime())/1000));
    },1000);
    return ()=>clearInterval(id);
  },[clockedIn]);

  const fElapsed = (s)=>{
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    return h>0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };

  // Supabase auth
  const [auth, setAuth] = useState(null); // null=loading, false=out, object=user
  const [kmUser, setKmUser] = useState(null); // km_users row
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setAuth(session ? session.user : false);
      if(session) loadKmUser(session.user.id);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_,session)=>{
      setAuth(session ? session.user : false);
      if(session) loadKmUser(session.user.id);
      else setKmUser(null);
    });
    return ()=>subscription.unsubscribe();
  },[]);

  const loadKmUser = async (uid) => {
    const {data} = await supabase.from("km_users").select("*").eq("id",uid).single();
    if(data) setKmUser(data);
  };

  const handleLogin = async () => {
    setAuthLoading(true); setAuthErr("");
    const {error} = await supabase.auth.signInWithPassword({email, password});
    if(error) setAuthErr("Väärä sähköposti tai salasana");
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuth(false);
  };

  // Loading
  if(auth === null) return (
    <div style={{minHeight:"100vh",background:"#111",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:4,color:"#FFC107"}}>KASAMASTER</div>
    </div>
  );

  // Login screen
  if(auth === false) return (
    <div style={{minHeight:"100vh",background:"#111",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#1E1E1E",border:"2px solid #FFC107",borderRadius:16,padding:"32px 24px",maxWidth:340,width:"100%"}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:40,letterSpacing:4,color:"#FFC107",marginBottom:4}}>KASA</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:4,color:"#C8C8C8",marginTop:-8,marginBottom:28}}>MASTER</div>
        <div style={{fontSize:13,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:6}}>SÄHKÖPOSTI</div>
        <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setAuthErr("");}}
          onKeyDown={e=>{if(e.key==="Enter")handleLogin();}}
          placeholder="nimi@yritys.fi" autoFocus
          style={{width:"100%",padding:"12px 14px",background:"#0a0a0a",border:`2px solid ${authErr?"#ef4444":"#333"}`,borderRadius:10,color:"#F5F0E8",fontSize:16,boxSizing:"border-box",marginBottom:10}} />
        <div style={{fontSize:13,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:6}}>SALASANA</div>
        <input type="password" value={password} onChange={e=>{setPassword(e.target.value);setAuthErr("");}}
          onKeyDown={e=>{if(e.key==="Enter")handleLogin();}}
          placeholder="••••••••"
          style={{width:"100%",padding:"12px 14px",background:"#0a0a0a",border:`2px solid ${authErr?"#ef4444":"#333"}`,borderRadius:10,color:"#F5F0E8",fontSize:16,boxSizing:"border-box",marginBottom:10}} />
        {authErr&&<div style={{color:"#ef4444",fontSize:14,marginBottom:10}}>{authErr}</div>}
        <button onClick={handleLogin} disabled={authLoading}
          style={{width:"100%",padding:"14px",background:authLoading?"#555":"#FFC107",borderRadius:10,color:"#000",fontWeight:700,fontSize:18,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,border:"none",cursor:"pointer"}}>
          {authLoading ? "KIRJAUDUTAAN..." : "KIRJAUDU →"}
        </button>
      </div>
    </div>
  );
  const [prices,    setPrices]  = useStore("km3_prices",      DEFAULT_PRICES);
  const [thresholds,setThresh]  = useStore("km3_thresholds",      DEFAULT_THRESHOLDS);
  const [locations, setLocs]    = useStore("km3_locations",       DEFAULT_LOCATIONS);
  const [prodLocs,  setProdLocs]= useStore("km3_prodlocs",        DEFAULT_PRODUCT_LOCATIONS);
  const [purchCosts,setPurchCosts]=useStore("km3_purchase_costs", DEFAULT_PURCHASE_COSTS);
  const [batches,   setBatches] = useStore("km3_batches",         []);
  const [stock,     setStock]   = useStore("km3_stock",     DEFAULT_STOCK);
  const [customers, setCust] = useStore("km3_customers_v3", [
  {id:201,name:"A Vakuutus",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:202,name:"A.Reponen oy",address:"Köysitie 6, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7242008,lng:26.0877325},
  {id:203,name:"Aaltonen Ari",address:"Ukkolantie 118, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:204,name:"Aarni Jourio",address:"Joussaarentie 47B, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:205,name:"Aarno Ekroos",address:"Angesseläntie 107, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7943046,lng:26.0932713},
  {id:206,name:"Aarno Kavonius",address:"Kirjokalliontie 28, 00430 Helsinki",phone:"",ytunnus:"",lat:60.2432185,lng:24.8936579},
  {id:207,name:"Aarno Nieminen",address:"Puistotie 10, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7420667,lng:26.1209538},
  {id:208,name:"Aato Pasi",address:"Ruokorannantie 480b, 19650 Joutsa",phone:"",ytunnus:"",lat:61.762471,lng:26.1878074},
  {id:209,name:"Adek oy",address:"Rieskalantie 513, 19650 Joutsa",phone:"",ytunnus:"",lat:61.764723,lng:26.0746688},
  {id:210,name:"Aila Askainen",address:"Jäniskuja 9, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7506493,lng:26.1146272},
  {id:211,name:"Airaksinen Tiina",address:"Ruokorannantie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7625278,lng:26.1880321},
  {id:212,name:"Airi Visa",address:"Savontie 24, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7467441,lng:26.1317962},
  {id:213,name:"Ajokaksikko Oy",address:"Mustamäentie 274, 41520 Hankasalmi",phone:"",ytunnus:"",lat:62.4349238,lng:26.4174033},
  {id:214,name:"Alajärven kaupunki / Tekninentoimi Pirjo Rintala",address:"PL29, 62901 Alajärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:215,name:"Alanen Teuvo",address:"Kulmalantie 4, 19400 Sysmä",phone:"",ytunnus:"",lat:61.508801,lng:25.7178285},
  {id:216,name:"Allan Kari",address:"Puutteenkuja 15, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7444584,lng:26.1232279},
  {id:217,name:"Alpo Sievänen",address:"Ruokorannantie 400, 19650 Joutsa",phone:"",ytunnus:"",lat:61.762471,lng:26.1878074},
  {id:218,name:"Altek Aluetekniikka",address:"PL 233, 40320 Jyväskylä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:219,name:"Amerikanniementie / Annikki Lukkarinen",address:"Amerikanniementie 110, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:220,name:"Angesselän tiehoitokunta",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:221,name:"Angesselänkoulun yksityistie / Metsä Pirkka",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:222,name:"Anja Havas",address:"Aholankatu 16b16, 05830 Hyvinkää",phone:"",ytunnus:"",lat:60.6201579,lng:24.8405228},
  {id:223,name:"Ansa Avikainen",address:"Kangasniementie 25, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:224,name:"Ansioniemen Yksityistie",address:"Vuorenkyläntie 462, 19600 Hartola",phone:"",ytunnus:"",lat:61.6268757,lng:25.9442422},
  {id:225,name:"Anssi Karvonen",address:"Kaarikuja 1 B 10, 00940 Helsinki",phone:"",ytunnus:"",lat:60.2382035,lng:25.07788},
  {id:226,name:"Antero Tervo",address:"Mikontie 9, 04430 Järvenpää",phone:"",ytunnus:"",lat:60.4662535,lng:25.1346879},
  {id:227,name:"Antti Nieminen",address:"Marjatantie 3 b 13, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7438535,lng:26.1162026},
  {id:228,name:"Antti Simola",address:"Korpilahdentie 740, 19920 Joutsa",phone:"",ytunnus:"",lat:61.78476,lng:26.0496556},
  {id:229,name:"Antti Välikangas",address:"Nystyränperä 4-6 b6, 40420 Jyskä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:230,name:"Anu Pylsy",address:"Pertunmaantie 912, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7482731,lng:26.1141858},
  {id:231,name:"Ari Laukkanen",address:"Ailakkitie 2, 41800 Korpilahti",phone:"",ytunnus:"",lat:62.0190073,lng:25.5847611},
  {id:232,name:"Ariko Siirto oy",address:"Salmentie 8, 05830 Hyvinkää",phone:"",ytunnus:"",lat:60.6059409,lng:24.842802},
  {id:233,name:"Aritrac Oy",address:"Pertunmaantie 1433, 19650 JOUTSA",phone:"",ytunnus:"2379810-7",lat:61.7482731,lng:26.1141858},
  {id:234,name:"Arja Ruhtinas",address:"Opistokuja 6-8a14, 40100 Jyväskylä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:235,name:"Arto Aalto",address:"Lammaskalliontie 16, 18150 Heinola",phone:"",ytunnus:"",lat:null,lng:null},
  {id:236,name:"Arto Kärkäs",address:"Pirttisalmentie 28, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7331262,lng:26.2928455},
  {id:237,name:"Arto Niinikoski",address:"Kukkulantie 2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8258179,lng:26.0794461},
  {id:238,name:"Arto Väiste",address:"Pertunmaantie 247 B, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7483294,lng:26.1204414},
  {id:239,name:"As oy  Joutiainen",address:"Yhdystie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7440422,lng:26.1079029},
  {id:240,name:"As Oy Jousan Salmi / Joutsan Isännöintipalvelu /Jorma Lehtosaari",address:"Yhdystie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7440422,lng:26.1079029},
  {id:241,name:"Asennustyö Nieminen",address:"Riihikuja 8, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.9185274,lng:26.124182},
  {id:242,name:"Asfalttikallio oy",address:"Pl 100, 80020 Kollektor Scan",phone:"",ytunnus:"",lat:null,lng:null},
  {id:243,name:"Asoy Satoleivo",address:"Yhdystie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7440422,lng:26.1079029},
  {id:244,name:"Asunto oy Jousisato / Joutsan Isännöintipalvelu Oy",address:"Yhdystie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7440422,lng:26.1079029},
  {id:245,name:"Asunto oy Joutsan meijerinranta 1 / Joutsan Isännöintipalvelu Oy",address:"Yhdystie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7440422,lng:26.1079029},
  {id:246,name:"Aune Oksanen",address:"Vehmaa Sointulantie 77, 19650",phone:"",ytunnus:"",lat:null,lng:null},
  {id:247,name:"Autoilia Juha Salonen",address:"Leppäkorventie 157, 19700 Sysmä",phone:"",ytunnus:"",lat:61.5237679,lng:25.6793878},
  {id:248,name:"Autoliiton Kangasniemen osasto ry",address:"Suurosenkuja 2 as 3, 51200 Kangasniemi",phone:"",ytunnus:"",lat:61.990891,lng:26.6401785},
  {id:249,name:"Auvo Järvinen",address:"Huuperintie 28, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8083718,lng:25.928603},
  {id:250,name:"Birgit Wahlroos",address:"Pertunpellontie 3E40, 00740 HELSINKI",phone:"",ytunnus:"",lat:60.2672864,lng:24.9921205},
  {id:251,name:"CABELBOYS OY",address:"Johtokatu 1, 50130 MIKKELI",phone:"",ytunnus:"",lat:61.6829963,lng:27.2290019},
  {id:252,name:"Cleanosol Oy",address:"Karhutie 1 C, 01900 Nurmijärvi",phone:"",ytunnus:"",lat:60.4917108,lng:24.856752},
  {id:253,name:"Comtower Finland Oy",address:"Sibeliuksenkatu 3, 08100 Lohja",phone:"",ytunnus:"",lat:60.2516217,lng:24.0693489},
  {id:254,name:"Destia oy",address:"Pl 153, 00521 HELSINKI",phone:"",ytunnus:"",lat:null,lng:null},
  {id:255,name:"Destia Rail oy",address:"Arinakatu 6-8, 50170 Savo",phone:"",ytunnus:"",lat:61.7071294,lng:27.3126949},
  {id:256,name:"Dot Productions oy",address:"",phone:"",ytunnus:"2813825-5",lat:null,lng:null},
  {id:257,name:"Eemelinpolku / Martti Järvinen",address:"Venetie 1 b 14, 19650",phone:"",ytunnus:"",lat:61.7392222,lng:26.109624},
  {id:258,name:"Eero Kailanen",address:"Kurikkamäentie 116, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6610685,lng:26.2936639},
  {id:259,name:"Eerontie thk / Jorma Laitinen",address:"Eerontie 103, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8633988,lng:26.2330324},
  {id:260,name:"Eeva Mäntymäki",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:261,name:"Eija Kupiainen",address:"Vesijärvenkatu 37 d 67, 15140 Lahti",phone:"",ytunnus:"",lat:60.9847975,lng:25.662326},
  {id:262,name:"Eila Tuominen",address:"Joutsantie 1427, 19460 Ruorasmäki",phone:"",ytunnus:"",lat:61.5769405,lng:26.4233777},
  {id:263,name:"Eki Uusitalo oy",address:"Metsätuomistontie 13, 26100 Rauma",phone:"",ytunnus:"",lat:61.1408632,lng:21.5708828},
  {id:264,name:"Ekon yhteismetsä",address:"Reinonkuja 3, 19600 Hartola",phone:"",ytunnus:"",lat:61.5834129,lng:26.0230536},
  {id:265,name:"Emmi Honkonen",address:"Tammitie 20 b 37, 00330 Helsinki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:266,name:"Erkki Kauranen",address:"Satulakiventie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.734755,lng:26.1732617},
  {id:267,name:"Erkki Lappalainen",address:"Talvitaipaleentie 62, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6525697,lng:26.1266153},
  {id:268,name:"Erkki Meronen",address:"Aapontie 5, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7343967,lng:26.1203992},
  {id:269,name:"Erkki Savolainen",address:"Sippulantie 30 B 10, 40520 Jyväskylä",phone:"",ytunnus:"",lat:62.2032477,lng:25.753029},
  {id:270,name:"Erno Pukkinen",address:"Livornonkatu 12a9, 00220 HELSINKI",phone:"",ytunnus:"",lat:60.1578642,lng:24.9152875},
  {id:271,name:"Esa Koivisto",address:"Vasaratie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.752557,lng:26.1230583},
  {id:272,name:"Esa M",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:273,name:"Esko Heikkinen PK/Anna-Liisa Liukkonen",address:"Lujukalliontie 10, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7363421,lng:26.1016539},
  {id:274,name:"Esko Tarhanen",address:"Korpilahdentie 839, 19920 Pappinen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:275,name:"Etelä-Suomen Energiamurskaus",address:"PL 1, 23800 Laitila",phone:"",ytunnus:"",lat:null,lng:null},
  {id:276,name:"Etuvarmantien thk / Huujärvi Niilo",address:"Toroniementie 50, 41870 Putkilahti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:277,name:"Family Timber Finland",address:"Kansankatu 8, 15870 Hollola",phone:"",ytunnus:"",lat:60.9892069,lng:25.5154069},
  {id:278,name:"Finnilä Tomi",address:"Asentajankuja 6, 32200 Loimaa",phone:"",ytunnus:"",lat:60.8642708,lng:23.0223572},
  {id:279,name:"Goodnia oy",address:"Vahtirinne 16a4, 00370 Helsinki",phone:"",ytunnus:"",lat:60.2213008,lng:24.8387304},
  {id:280,name:"Grand Express oy",address:"Rantakyläntie 605, 19910 Tammijärvi",phone:"",ytunnus:"1935593-6",lat:null,lng:null},
  {id:281,name:"Grilli-Kahvio Tikander Oy",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:282,name:"GRK Road oy",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:283,name:"GRK Suomi oy",address:"Jaakonkatu 2, 01620 Vantaa",phone:"",ytunnus:"",lat:60.2847221,lng:24.851418},
  {id:284,name:"Haapaniementien thk",address:"Pannuvuorentie 22 h31, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:285,name:"Hanhilahden yksityistie",address:"Hanhilahdentie 134 A, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8000675,lng:26.16446},
  {id:286,name:"Hanhilammen tiekunta / Kari Mutkala",address:"Hanhilammentie 115, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8294694,lng:26.119199},
  {id:287,name:"Hankaan erämiehet ry / Pekka Nuikka",address:"Relanderinaukio 2c20, 00570 Helsinki",phone:"",ytunnus:"",lat:60.1858811,lng:25.0061802},
  {id:288,name:"Hanna Avikainen-Eskola",address:"Rouvienpolku11 c 60, 00810 Helsinki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:289,name:"Hannu Heino",address:"Alhotie 17 b45, 04430 Järvenpää",phone:"",ytunnus:"",lat:60.4760586,lng:25.1093571},
  {id:290,name:"Hannu Hämäläinen",address:"Pajatie 3 a1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7369,lng:26.1388138},
  {id:291,name:"Hannu Härkönen",address:"Paroisentie 156, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:292,name:"Hannu Karvonen",address:"Rusintie 9, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:293,name:"Hannu Loipponen",address:"Jousitie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7501272,lng:26.1189052},
  {id:294,name:"Hannu Soisalo",address:"Kuhalantie 347, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6790163,lng:26.2014841},
  {id:295,name:"Harri Nykänen",address:"Vehkalahdentie 26, 00950 Helsinki",phone:"",ytunnus:"",lat:60.2177139,lng:25.1091266},
  {id:296,name:"Hartikainen Juha",address:"Hanhilahdentie 134 A, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8000675,lng:26.16446},
  {id:297,name:"Hartolan Redem oy",address:"Sysmäntie 213, 19600 Hartola",phone:"",ytunnus:"",lat:61.5744513,lng:25.9777036},
  {id:298,name:"Hartonen Marko",address:"Korppilanmäentie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.747047,lng:26.1434188},
  {id:299,name:"Harvestia oy",address:"PL 21089, 00021 Laskutus",phone:"",ytunnus:"",lat:null,lng:null},
  {id:300,name:"Hauhanpohjantien thk / Mikko Norola",address:"Hauhanpohjantie 287, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:301,name:"Haukijärventien thk / Rundqvist Kari Pekka",address:"Haukijärventie 112, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:302,name:"Heikki Honkanen",address:"Talvitaipaleentie 38, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6525697,lng:26.1266153},
  {id:303,name:"Heikki Salonen",address:"Niemistenkyläntie 243, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:304,name:"Heikki Severi Nieminen",address:"Jänskuja 11, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:305,name:"Heinolan Kaupunki / Katuyksikkä Jouko Rajajärvi",address:"Rauhankatu 3, 18100 Heinola",phone:"",ytunnus:"",lat:61.2051965,lng:26.0363921},
  {id:306,name:"Heinolan KTK oy",address:"Lakeasuontie 4, 18100 Heinola",phone:"",ytunnus:"",lat:61.2092973,lng:26.0584681},
  {id:307,name:"Heinonen Niko",address:"Kostamontie 122, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8191519,lng:26.0676318},
  {id:308,name:"Heinsuo-Nurmelantie / Pirkkalainen Jouko",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:309,name:"Helenius Olavi",address:"Ahventie 15, 01490 Vantaa",phone:"",ytunnus:"",lat:60.3587096,lng:25.138206},
  {id:310,name:"Hemmo Honkonen",address:"Perämiehenkatu 11 D53, 00150 HELSINKI",phone:"",ytunnus:"",lat:null,lng:null},
  {id:311,name:"Henrik Westerlund",address:"Hakostarontie 17, 00970 Helsinki",phone:"",ytunnus:"",lat:60.2341993,lng:25.1043483},
  {id:312,name:"Herapohjantien thk / Koskinen Valto",address:"Vespuolentie 1977B as 2, 41870 Putkilahti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:313,name:"Hernesniemen Maanrakennus oy",address:"Nykäläntie 48, 62600 Lappajärvi Lappajärvi",phone:"",ytunnus:"1031696-5",lat:63.242457,lng:23.6374093},
  {id:314,name:"Heta \"Aleksi\" Hakokivi",address:"Yhdyskuja 3 E41, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7440354,lng:26.1095857},
  {id:315,name:"Hietala Antti Ja Elina",address:"kangasniementie 812, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:316,name:"Hietala Arto",address:"Eerolantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.76815,lng:26.0437865},
  {id:317,name:"Hietala Heikki",address:"Säynätniementie 139, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8021008,lng:26.2110536},
  {id:318,name:"Hietalahden yksityistie / Metsä Pirkka",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:319,name:"Hiiltamontien thk / Tapio Koivisto",address:"Savenahonmetsätie 314, 41770 Leivonmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:320,name:"Himanen Tuire",address:"Nybackantie 3, 05200 Rajamäki",phone:"",ytunnus:"",lat:60.521801,lng:24.7635189},
  {id:321,name:"Hirvilahdentiekunta",address:"Jukka Hautamäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:322,name:"Hoilola Yhtymä / Eira Heino",address:"Myllytie 2 A 10, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7388502,lng:26.1273384},
  {id:323,name:"Hoilolantien tiekunta",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:324,name:"Hokkanan Joni",address:"Tammijärventie 318 A, 19910 Tammijärvi",phone:"",ytunnus:"",lat:61.8329946,lng:25.8037223},
  {id:325,name:"Hopealankankaan yksityistie",address:"Haapavuorentie 167, 12240 Hikiä",phone:"",ytunnus:"",lat:60.6901878,lng:25.0247359},
  {id:326,name:"Hopealankankaantiekunta / Pentti Kiiski",address:"Haapavuorentie 167, 12240 Hikiä",phone:"",ytunnus:"",lat:60.6901878,lng:25.0247359},
  {id:327,name:"Huikko Markku",address:"Rusilantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8000887,lng:26.0508145},
  {id:328,name:"Hutri Tero / Vanhanmyllyntie 85",address:"19600 Hartola, 19600 Hartola Hartola",phone:"",ytunnus:"",lat:61.5746724,lng:26.0032749},
  {id:329,name:"Hyvinvointi ja terveyspalvelu Hanna Ojala",address:"Länsitie 7, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7417016,lng:26.1118144},
  {id:330,name:"Hämeen Moreenijaloste Oy",address:"Kalliokatu 5, 18100 Heinola",phone:"",ytunnus:"0912728-6",lat:61.2089172,lng:26.0388062},
  {id:331,name:"Hämäläinen Antero",address:"Pertunmaantie 349, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7488648,lng:26.1290171},
  {id:332,name:"Hämäläinen Antti",address:"Vuohelantie 11, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6998731,lng:26.1860648},
  {id:333,name:"Hämäläinen Arto",address:"Leppäojantie 225, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7953779,lng:26.0640603},
  {id:334,name:"Hämäläinen Teemu",address:"Knaappilantie 18f18, 04330 Lahela",phone:"",ytunnus:"",lat:null,lng:null},
  {id:335,name:"Häränniemen Metsätie / Pentti Sukanen",address:"Kangasniementie 1337, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:336,name:"Hölttä Samuel",address:"Heiskalantie 75, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7788454,lng:26.0750571},
  {id:337,name:"IF Korvauspalvelu",address:"PL 2017, 20025 IF",phone:"",ytunnus:"",lat:null,lng:null},
  {id:338,name:"Iiris Ilmonen",address:"Kertunpolku 4, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.9113102,lng:26.1201932},
  {id:339,name:"Iitin Kunta",address:"Rautatienkatu 20-22, 47401 KAUSALA",phone:"",ytunnus:"",lat:60.8875651,lng:26.3323792},
  {id:340,name:"Ilkka ja Piia Syrjälä",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:341,name:"Ilpo Hänninen kuolinpesä / c/o Virpi Marttila",address:"Vesilaitoksenkuja, 40800 Vaajakoski",phone:"",ytunnus:"",lat:62.2611454,lng:25.8913228},
  {id:342,name:"Ina Vitola-Hujanena",address:"Siikatie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7353122,lng:26.1368753},
  {id:343,name:"Insinöörityö Hentinen oy",address:"Hulikkalantie 2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7457648,lng:26.1103073},
  {id:344,name:"Irjala Heikki",address:"Palomäenkatu 210b, 20540 Turku",phone:"",ytunnus:"",lat:60.4560248,lng:22.3160769},
  {id:345,name:"Irma Onali",address:"Maisematie 3, 40950 Muurame",phone:"",ytunnus:"",lat:62.1356139,lng:25.7041802},
  {id:346,name:"Irma Takala",address:"Karjakuja 5, 17200 Vääksy",phone:"",ytunnus:"",lat:61.1681433,lng:25.5678805},
  {id:347,name:"Itä Päijänteen RHY / Ilmonen Jyrki",address:"Riuttakuja 5, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:348,name:"Itä-Hämeen Hevospalvelut Ky",address:"Rusintie 80, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:349,name:"JA-SA Infra oy",address:"Tiiholantie 55, 51200 Kangasniemi",phone:"",ytunnus:"",lat:61.9941115,lng:26.5263074},
  {id:350,name:"Jaakko Lamminmäki",address:"Abraham Wetterintie 16 a 17, 00880 Helsinki",phone:"",ytunnus:"",lat:60.1929302,lng:25.0457362},
  {id:351,name:"Jani Tikkanen",address:"Attenkatu 11, 18150 Heinola",phone:"",ytunnus:"",lat:61.1936047,lng:26.0291101},
  {id:352,name:"Jari ja Hanna Koskenniemi ay",address:"Väisäläntie 188, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7026093,lng:26.386463},
  {id:353,name:"Jari Pessala",address:"Puutteenkuja 23, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7444584,lng:26.1232279},
  {id:354,name:"JarMer oy / Jarno Laitinen",address:"Jalkalantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7713719,lng:26.1885346},
  {id:355,name:"Jarmo Halonen",address:"Tuulimyllyntie 8 B 37, 00920 Helsinki",phone:"",ytunnus:"",lat:60.2260476,lng:25.0675401},
  {id:356,name:"Jarmo Saukko",address:"Uittotie 5, 40800 Vaajakoski",phone:"",ytunnus:"",lat:62.2385009,lng:25.8851902},
  {id:357,name:"Jarmo Vahtera",address:"Amerikanniementie 64, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:358,name:"Jere Rossi",address:"Rossintie 38, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6559481,lng:26.3176552},
  {id:359,name:"JHM Sevice Oy",address:"Ovavainiontie 11 B 1, 90420 Oulu",phone:"",ytunnus:"",lat:null,lng:null},
  {id:360,name:"JJ Rakennus ja Kone oy",address:"Savontie 6, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7467441,lng:26.1317962},
  {id:361,name:"JJ-Försäljning AB",address:"Killebäckstorptsvägen 168, 26992 Båstad",phone:"",ytunnus:"",lat:null,lng:null},
  {id:362,name:"Jnna Mönkkönen",address:"Mattilantie 15, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:363,name:"Joenniementie / Tommi Linberg",address:"Maalarintie 5b, 04200 Kerava",phone:"",ytunnus:"",lat:60.4074614,lng:25.0882088},
  {id:364,name:"Jokela Juha",address:"Honkaniementie 1, 99130 Sirkka",phone:"",ytunnus:"",lat:67.8235679,lng:24.8053839},
  {id:365,name:"Jokinen Jarmo",address:"Korpilahdentie 949, 19920 Pappinen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:366,name:"Jokinen Sami ja Teresa",address:"riuttatie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7340191,lng:26.123067},
  {id:367,name:"Jokinen Tanja",address:"Pertunmaantie 259a, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7488648,lng:26.1290171},
  {id:368,name:"Jokita oy",address:"Höylätie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7550679,lng:26.1207462},
  {id:369,name:"Joni Saukkonen",address:"Kivitie 14, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7478959,lng:26.1353723},
  {id:370,name:"Jonna Sillberg10",address:"Jönsaksenpolku 5a3, 01600 Vantaa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:371,name:"Jorma Laitinen",address:"Eerontie 103, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8633988,lng:26.2330324},
  {id:372,name:"JOrma Leini",address:"Kellolahdentie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7468865,lng:26.0594317},
  {id:373,name:"Jorma Lilja",address:"Röksäntie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8098699,lng:26.0427465},
  {id:374,name:"Jouko Lehtonen",address:"Kaenkatu 4 H 89, 04230 Kerava",phone:"",ytunnus:"",lat:60.4136519,lng:25.1069828},
  {id:375,name:"Jouko Pirkkalainen",address:"Angesseläntie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.794305,lng:26.0932571},
  {id:376,name:"Jouni Lavia",address:"Laviantie 51, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8183258,lng:26.1047948},
  {id:377,name:"Joussaaren tiekunta",address:"Myllytie 59, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7388502,lng:26.1273384},
  {id:378,name:"Joutoharju/Joutoranta / Joutsan isännöintipalvel/Jorma Lehtosaari",address:"Yhdystie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7440422,lng:26.1079029},
  {id:379,name:"Joutsan Ekokaasu oy",address:"Mämmiläntie 38, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7499484,lng:26.1014275},
  {id:380,name:"Joutsan Hautauspalvelu",address:"Jousitie 35, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7501272,lng:26.1189052},
  {id:381,name:"Joutsan hys / Pasi Haapasaari",address:"Savelantie 52, 19650 Joutsa",phone:"",ytunnus:"",lat:61.760707,lng:26.3557289},
  {id:382,name:"Joutsan Konehuolto oy",address:"Jousitie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7501272,lng:26.1189052},
  {id:383,name:"Joutsan kotiseutuyhdistys ry / Raija Metsänen",address:"Kuusitie 3, 19650 Joutsa",phone:"",ytunnus:"",lat:61.9152196,lng:26.1198275},
  {id:384,name:"Joutsan kunta",address:"Länsitie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7417016,lng:26.1118144},
  {id:385,name:"Joutsan Kunta / Marika Masalin Veio",address:"Länsitie 5, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7418753,lng:26.1109808},
  {id:386,name:"Joutsan osakaskunnat / Erkki Meronen",address:"Riuttatie 9, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7340191,lng:26.123067},
  {id:387,name:"Joutsan Seudun Ratakeskus Oy",address:"pl 4, 19651 JOUTSA",phone:"",ytunnus:"",lat:null,lng:null},
  {id:388,name:"JR myllykangas ky",address:"Vehkosillantie 219, 15560 Nastola",phone:"",ytunnus:"",lat:60.9463571,lng:25.9522166},
  {id:389,name:"JS Kuljetus oy",address:"Pertunmaantie 366, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7488648,lng:26.1290171},
  {id:390,name:"Juha Boman",address:"Kasarikuja 12, 04460 Järvenpää",phone:"",ytunnus:"",lat:60.5045687,lng:25.0861103},
  {id:391,name:"Juha Ilmonen",address:"Lepolantie 64, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:392,name:"Juha Kangasvieri",address:"Niittytie 9, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7454368,lng:26.1184785},
  {id:393,name:"Juha Kokko",address:"Kielotie 7, 50600 Mikkeli",phone:"",ytunnus:"",lat:61.6648285,lng:27.1921622},
  {id:394,name:"Juha Lehto",address:"Reunakatu 22 B as D2, 15850 Lahti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:395,name:"Juha Määttänen",address:"Kiusalantie 17, 21540 Preitilä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:396,name:"Juha Pylväläinen",address:"Veistotie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7406887,lng:26.1198471},
  {id:397,name:"Juha Savolainen",address:"Lankiansalmentie 28, 19650 Joutsa",phone:"",ytunnus:"",lat:61.741662,lng:26.0389783},
  {id:398,name:"Juho Moilanen KP",address:"Lahtelantien 130, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:399,name:"Jukka Huikko",address:"Valkharjunkaari 6, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:400,name:"Jukka Puurunen",address:"Hangontie 45d23, 05840 Hyvinkää",phone:"",ytunnus:"",lat:60.6133787,lng:24.8233778},
  {id:401,name:"Jukka Taskinen",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:402,name:"Jukolan Maitotila Oy",address:"Poikkitie 236, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.8958206,lng:26.1193863},
  {id:403,name:"Julia Shugailo",address:"Huttulantie 17, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7477254,lng:26.1098294},
  {id:404,name:"Jussi Heikkinen",address:"Mäkkylänmutka 2D, 02650 Espoo",phone:"",ytunnus:"",lat:60.2251115,lng:24.82832},
  {id:405,name:"Jussi Mäkinen",address:"Sydänmaantie 67, 19920 Pappinen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:406,name:"Jussi Saviharju",address:"Kissankulmantie 110, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7780354,lng:26.0958272},
  {id:407,name:"Jussila Timo",address:"Kuusitie 15, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7379709,lng:26.1354844},
  {id:408,name:"JVT-ja Pesutekniikka oy",address:"Kuruntie 521, 33480 Ylöjärvi",phone:"",ytunnus:"",lat:61.5725932,lng:23.6047826},
  {id:409,name:"Jyrki Kilpinen",address:"Välikuja 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.739731,lng:26.1280365},
  {id:410,name:"Jämsän kaupunki / Paattilantie 2",address:"42100 Jämsä, 42100 Jämsä",phone:"",ytunnus:"",lat:61.8637802,lng:25.1897493},
  {id:411,name:"Järvinen Airi",address:"Hauhanpohjantie 243, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:412,name:"Järvinen Markku",address:"Mahlamäentie 1, 19600 Hartola",phone:"",ytunnus:"",lat:61.5764569,lng:26.0130341},
  {id:413,name:"Kaakon Konepalvelu Oy",address:"Tolskantie 13, 47830 HASULA",phone:"",ytunnus:"",lat:null,lng:null},
  {id:414,name:"Kahvimyllyn thk / Metsä Pirkka",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:415,name:"Kai Bergström",address:"Kuismantie 41, 04660 Numminen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:416,name:"Kai Lippojoki",address:"Nauharinne 28c, 01260 Vantaa",phone:"",ytunnus:"",lat:60.2931973,lng:25.1150574},
  {id:417,name:"Kai Parhiala",address:"Sillanlahdetie Ankkurilta oikealle, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:418,name:"Kai Pirnes",address:"Rikkaniementie 40, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7674107,lng:26.014028},
  {id:419,name:"Kaisla rannan kuljetus",address:"Katajatie15, 17200 Vääksy",phone:"",ytunnus:"",lat:null,lng:null},
  {id:420,name:"Kalliojärventie",address:"Yhdystie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7440422,lng:26.1079029},
  {id:421,name:"Kallioniemen yksityistie / Marko Filenius",address:"Pirttikatu 6, 40500 Jyväskylä",phone:"",ytunnus:"",lat:62.2212787,lng:25.7119411},
  {id:422,name:"Kareinen",address:"Jalkalantie 22, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7713719,lng:26.1885346},
  {id:423,name:"Kareinen Juhani",address:"Jalkalantie 22, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7713719,lng:26.1885346},
  {id:424,name:"Kari Kuitunen",address:"Sipiläntie 2A 1, 40950 Muurame",phone:"",ytunnus:"",lat:62.1309014,lng:25.6759937},
  {id:425,name:"Kari Kupiainen",address:"Harjutie 5 E, 01390 Vantaa",phone:"",ytunnus:"",lat:60.3185797,lng:25.0045993},
  {id:426,name:"Kari Luukko",address:"Hernekertuntie 3B, 02660 Espoo",phone:"",ytunnus:"",lat:60.2374897,lng:24.8153789},
  {id:427,name:"Kari Pahkamäki",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:428,name:"Kari Siilos",address:"Tuokkolantie 77, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7744106,lng:26.0445732},
  {id:429,name:"Kari Tiainen",address:"Kiirunapolku 5, 01450 Vantaa",phone:"",ytunnus:"",lat:60.3481787,lng:25.0607689},
  {id:430,name:"Kari Tuominen",address:"Vuorikankaantie 2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7952972,lng:26.1011146},
  {id:431,name:"Kari Uustalo oy",address:"Ohrasalmentie 5, 19600 Hartola",phone:"",ytunnus:"",lat:61.592612,lng:26.0399116},
  {id:432,name:"Karjalahden yksityistie / Iiris Ilmonen",address:"Kaarnapolku 3, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.9106484,lng:26.1222955},
  {id:433,name:"Karri Mesimäki",address:"Jokiniementie 20 B, 00650 Helsinki",phone:"",ytunnus:"",lat:60.2265615,lng:24.9719931},
  {id:434,name:"Karstulan Kunta / Jorma Haataja",address:"Virastotie 4, 43500 Karstula",phone:"",ytunnus:"",lat:62.8784318,lng:24.8045978},
  {id:435,name:"Kartanoahon yksityistie / Hannu Kemppi",address:"Nahkaniementie 231, 19540 Koitti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:436,name:"Kassinsaaren yksityistie / Reijo Simola",address:"Mansikkatie 70, 41870 Putkilahti",phone:"",ytunnus:"",lat:61.8759937,lng:25.7230436},
  {id:437,name:"Katri Kuusimäki",address:"Lujukalliostie, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:438,name:"Keitaantiehoitokunta / Asko Kärnä",address:"Keitaantie 50, 19910 Tammijärvi",phone:"",ytunnus:"",lat:61.8342647,lng:25.8237675},
  {id:439,name:"Kerttula Mauri",address:"Niemistenkyläntie 489, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:440,name:"Keski-Suomen Betonirakenne Oy",address:"PL 5283, 70701 Kuopio",phone:"",ytunnus:"",lat:null,lng:null},
  {id:441,name:"Keskinen Kari",address:"Savontie 36, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7467441,lng:26.1317962},
  {id:442,name:"Kesäniemen thk / Heikki Kuurne",address:"Peltotie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7414799,lng:26.1226879},
  {id:443,name:"Kiinteistö  oy Joutsan Linjala",address:"Köysitie, 19650 Joutsa",phone:"",ytunnus:"0672121-2",lat:61.7242008,lng:26.0877325},
  {id:444,name:"Kiinteistöyhtiö Simola",address:"Korpilahdentie 740, 19920 Pappinen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:445,name:"Kilpilohi oy / Yrjä Tervala",address:"Käpykuja 8, 19600 Hartola",phone:"",ytunnus:"",lat:61.5877568,lng:26.0149085},
  {id:446,name:"Kilpinen Veijo",address:"Isotuntie 165, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6567648,lng:26.2487701},
  {id:447,name:"Kimmo Timonen",address:"Joukolankatu 8, 15700 Lahti",phone:"",ytunnus:"",lat:60.9480289,lng:25.6107004},
  {id:448,name:"Kirsti Lampinen",address:"Savikkotie 6, 40420 Jyskä",phone:"",ytunnus:"",lat:62.2309283,lng:25.8126597},
  {id:449,name:"Kiviniementie thk",address:"Suntianmäki 15, 07600 Myrskylä",phone:"",ytunnus:"",lat:60.6540851,lng:25.84275},
  {id:450,name:"Koivunen Kalle",address:"Rauhankaari 10, 16300 Orimattila",phone:"",ytunnus:"",lat:60.7968633,lng:25.7370423},
  {id:451,name:"Koivurinteen nautatila",address:"Tammimäentie 134, 19920 Pappinen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:452,name:"Kokko Aarne",address:"Kenttäharjuntie 4c, 00720 Helsinki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:453,name:"Kolilanyhdystie",address:"Kolilantie 180, 19460 Ruorasmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:454,name:"Kolmikantin yksityistie",address:"Markkulantie 29, 19910 Tammijärvi",phone:"",ytunnus:"",lat:61.8396441,lng:25.8486152},
  {id:455,name:"Kolu Timo",address:"Vaavialantie 155, 15880 Hollola",phone:"",ytunnus:"",lat:60.9543598,lng:25.4057759},
  {id:456,name:"Konetyö Haikula Oy",address:"Niemiestnkyläntie 70, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:457,name:"Konetyö Kosonen",address:"Pertunmaantie 1641, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7488648,lng:26.1290171},
  {id:458,name:"Koneurakointi Henry Laitinen Oy",address:"Haapasuontie 199, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.8937147,lng:26.1179419},
  {id:459,name:"Koneurakointi Jani Rantanen",address:"Pertunmaantie 1506, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7488648,lng:26.1290171},
  {id:460,name:"Koneurakointi Lehtonen oy / Markus Lehtonen",address:"Lanssi 1e, 18100 Heinola",phone:"",ytunnus:"",lat:61.2011861,lng:26.0059682},
  {id:461,name:"Koneurakointi Piipponen oy",address:"Vuorelantie 10, 15460 Mäkelä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:462,name:"Koneurakointi Tarmo Oksanen",address:"Korpijärventie 124, 19230 Onkiniemi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:463,name:"Korjaus H Pajunen ky",address:"Tähtitie 12, 19600 Hartola",phone:"",ytunnus:"",lat:61.5732486,lng:26.0172476},
  {id:464,name:"Kosken Levytyö oy",address:"Teollisuuskatu 15, 44150 Äänekoski",phone:"",ytunnus:"",lat:62.6126708,lng:25.6923787},
  {id:465,name:"Koskenmyllyn Korjuu Oy",address:"Tekeväntie, 18300 Heinola",phone:"",ytunnus:"",lat:61.2400295,lng:26.0435894},
  {id:466,name:"Koskenrannan yksityistie",address:"Koivukatu 17, 40630 Jyväskylä",phone:"",ytunnus:"",lat:62.2387884,lng:25.702309},
  {id:467,name:"Koskinen Olli",address:"Nokanpolku, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6703874,lng:26.2164036},
  {id:468,name:"Koskisen oy",address:"Kauppakatu 9, 18100 Heinola",phone:"",ytunnus:"",lat:61.2020575,lng:26.0321689},
  {id:469,name:"Koskitukki oy",address:"Tuohikuja 3, 19600 Hartola",phone:"",ytunnus:"",lat:61.5889284,lng:26.0172391},
  {id:470,name:"Kostamontien thk / Jouko Pirkkalainen",address:"Angesseläntie 119, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7943046,lng:26.0932713},
  {id:471,name:"Kotilahdentien thk / Halonen Jouko",address:"Kotilahdentie 10, 19950 Luhanka",phone:"",ytunnus:"",lat:61.7130809,lng:25.6216215},
  {id:472,name:"Kotimäki yhtiöt oy",address:"Rieskalantie 17, 19650 Joutsa",phone:"",ytunnus:"",lat:61.764723,lng:26.0746688},
  {id:473,name:"Kotkatniementiekunta / Metsä Pirkka",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:474,name:"Kouhinsalon yksityistie",address:"Koivistontie 50, 41870 Putkilahti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:475,name:"Kovanen Matti",address:"Pistotie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.736966,lng:26.1980528},
  {id:476,name:"KOY Joutsan Linjala",address:"Köysitie 130, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7150467,lng:26.0729842},
  {id:477,name:"Kuhala Sankarin Yksityistie",address:"Kuhalantie 347, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6790163,lng:26.2014841},
  {id:478,name:"Kuhasenmäki Nuijalantiekunta",address:"Kuhasenmäentie 77, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.9245363,lng:26.1208813},
  {id:479,name:"Kuitunen Auvo",address:"Kaislakatu 8, 15240 Lahti",phone:"",ytunnus:"",lat:61.0256015,lng:25.6556873},
  {id:480,name:"Kukko ja Kili oy",address:"Jousitie 49, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7344903,lng:26.104714},
  {id:481,name:"Kukko Racing oy",address:"Markkulantie 10, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.920308,lng:26.1326165},
  {id:482,name:"Kukkonen Pauli",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:483,name:"Kuljetus ja Maanrakennus Reponen oy",address:"Rieskalantie 513, 19650 Joutsa",phone:"",ytunnus:"",lat:61.764723,lng:26.0746688},
  {id:484,name:"Kuljetus Jarno Salonen ky",address:"Välimäentie 4, 19700 Sysmä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:485,name:"Kuljetus Juha Ilmonen",address:"Lepolantie 64, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:486,name:"Kuljetus Pesoset Oy",address:"Koluntie 48, 19630 Kalhonkylä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:487,name:"Kuljetus Rami Ahola",address:"Rantakyläntie 605, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:488,name:"Kuljetus Risto Ahola",address:"Härkiöntie1 as 2, 19950 Luhanka",phone:"",ytunnus:"",lat:null,lng:null},
  {id:489,name:"Kuljetus Sami Manninen Oy",address:"Saarenmaantie 909, 40270 Palokka",phone:"",ytunnus:"",lat:62.2880984,lng:25.697579},
  {id:490,name:"Kuljetus Uotiset ky",address:"Mansikkamäentie 111, 19410 Kuortti",phone:"",ytunnus:"",lat:61.4285957,lng:26.3898862},
  {id:491,name:"Kuljetus-ja maansiirtoliike K.Timonen oy",address:"Vieterikatu 12, 15700 Lahti",phone:"",ytunnus:"",lat:60.9431958,lng:25.6057059},
  {id:492,name:"Kuljetusliike A.Nieminen",address:"Huttulankuja 3, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7470835,lng:26.1081102},
  {id:493,name:"Kuljetusliike Ari Sievänen oy",address:"Salmentie 8, 05830 Hyvinkää",phone:"",ytunnus:"",lat:60.6059409,lng:24.842802},
  {id:494,name:"Kuljetusliike Matti Mäkinen Ky",address:"Omakotitie 4, 19600 Hartola",phone:"",ytunnus:"",lat:61.574906,lng:26.0116022},
  {id:495,name:"Kuljetusliike Mikko Koskinen ky",address:"Lepsalantie 293, 19540 Koitti",phone:"",ytunnus:"",lat:61.4766857,lng:26.2399244},
  {id:496,name:"Kuljetusliike Yrjö Erämies",address:"Rajalantie 23, 19600 Hartola",phone:"",ytunnus:"",lat:61.4550321,lng:26.1464272},
  {id:497,name:"Kullasniemi Mankki tiehoitokunta / Jouko Laakso",address:"Laaksontie 71, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:498,name:"Kuormaus ja Raivaus / Perälä&Kumpp.",address:"PL 15, 40271 Palokka",phone:"",ytunnus:"",lat:null,lng:null},
  {id:499,name:"Kuortaneen kaivin oy",address:"Keskustie 48, 63100 Kuortane",phone:"",ytunnus:"",lat:62.8063314,lng:23.5075354},
  {id:500,name:"Kälä-pajula yksitystie / Kuitunen Martti",address:"Kälä-Pajulantie 2, 19670 Mieskonmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:501,name:"Kärkäs Arto",address:"Pirttisalmentie 28, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7331262,lng:26.2928455},
  {id:502,name:"Kärkäs Jorma",address:"Rautamäentie 3 d 9, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7381505,lng:26.1395225},
  {id:503,name:"L&T Kiinteistöhuolto",address:"Onkapannu 6, 40700 Jyväskylä",phone:"",ytunnus:"",lat:62.2406256,lng:25.7073301},
  {id:504,name:"L&T Ympäristö-palvelut Oy",address:"Valimotie 27, 00380 HELSINKI",phone:"",ytunnus:"3155938-4",lat:60.2215244,lng:24.8765852},
  {id:505,name:"Lahtinen Juho",address:"Koitintie 641, 19610 Murakka",phone:"",ytunnus:"",lat:null,lng:null},
  {id:506,name:"Lahtinen Miikka",address:"Rajalantie 72a, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7512568,lng:26.1755867},
  {id:507,name:"Lahtinen Sami",address:"Ruokorannantie 13, 19650 Joutsa",phone:"",ytunnus:"",lat:61.762471,lng:26.1878074},
  {id:508,name:"Laine Teppo",address:"Parosentie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6813192,lng:26.269484},
  {id:509,name:"Laitinen Markku",address:"Terrikankaantie 2, 19670 Mieskonmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:510,name:"Laitinen Reino",address:"Jousitie 76, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7344903,lng:26.104714},
  {id:511,name:"Laitjärven osakaskunta / Hannu Soisalo",address:"Kuhalantie 347, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6790163,lng:26.2014841},
  {id:512,name:"Lammintauksentie  thk / Leila Suojärvi",address:"Piltintie 26, 19210 Lusi",phone:"",ytunnus:"",lat:61.3168532,lng:26.0680139},
  {id:513,name:"Lapinlammentie thk / ArtoTupala",address:"Lapinlammentie 157, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:514,name:"Laukaan kunta / Ostolaskut",address:"PL 6, 41341 Laukaa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:515,name:"Laukaan Vesihuolto Oy / 27220206",address:"PL 100, 80020 Kollektor Scan",phone:"",ytunnus:"",lat:null,lng:null},
  {id:516,name:"Laviantien hoitokunta / Milla Vesterinen",address:"Laviantie 109, 41310 Leppävesi",phone:"",ytunnus:"",lat:62.336153,lng:25.8869137},
  {id:517,name:"Lehtonen Jussi",address:"Nuijalantie 126, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.930418,lng:26.1319112},
  {id:518,name:"Lehtosen Marja- ja hedelmätila",address:"Kangasniementie 252, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:519,name:"Leila Borg",address:"Mäntytie 13, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7434968,lng:26.1226441},
  {id:520,name:"Leivon betoni oy",address:"Leivonmäentie 160, 41770 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.9011673,lng:26.1186291},
  {id:521,name:"Leivonrannantie",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:522,name:"Lemminkäinen infra oy",address:"PL 476, 00026 Basware",phone:"",ytunnus:"",lat:null,lng:null},
  {id:523,name:"Lemmonlammen tiekunta",address:"Nokantie 603, 19540 Koitti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:524,name:"Leo Kalliokoski",address:"Laiskanseläntie 33, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:525,name:"Leo Saltiola",address:"Puutteenkuja 20, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7444584,lng:26.1232279},
  {id:526,name:"Leporanta Inkeri",address:"Oijalantie 277, 19650 Joutsa",phone:"",ytunnus:"",lat:61.687,lng:26.1361279},
  {id:527,name:"Leppäojantie yksityistie",address:"Leppäojantie 225, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7953779,lng:26.0640603},
  {id:528,name:"Leväntien Hoitokunta / Matti Remes",address:"Maksaruohonpolku 3b10, 00930 Helsinki",phone:"",ytunnus:"",lat:60.2082412,lng:25.0890303},
  {id:529,name:"Lievestuoreen lämpö oy",address:"Varikontie 90, 41400 Lievestuore",phone:"",ytunnus:"",lat:62.2537124,lng:26.152412},
  {id:530,name:"Liisa Kuitunen Kuula",address:"Yläpohjantie 354, 41180 Vehniä",phone:"",ytunnus:"",lat:62.4574279,lng:25.6638198},
  {id:531,name:"Livan yksityistie / Laakso Tarja",address:"Livantie 151, 41800 Korpilahti",phone:"",ytunnus:"",lat:61.9881277,lng:25.6822606},
  {id:532,name:"Ljungberg Rauno",address:"Korsontie 88, 01450 Vantaa",phone:"",ytunnus:"",lat:60.3504701,lng:25.0746771},
  {id:533,name:"LKS Energiat oy",address:"Talvialantie 1, 42100 Jämsä",phone:"",ytunnus:"2340117-3",lat:61.8614435,lng:25.1969536},
  {id:534,name:"Lohiniemen yksityistien tiekunta / c/o Poikolainen Klara",address:"Lohiniementie 142, 19600 Hartola",phone:"",ytunnus:"",lat:61.6270752,lng:25.9982004},
  {id:535,name:"Loipponen Anssi",address:"Etu-Ikolantie 63, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.9331205,lng:26.1469008},
  {id:536,name:"Lopen Mulli Express",address:"Läyliäistenraitti 903, 12600 Läyliäinen",phone:"",ytunnus:"",lat:60.6181109,lng:24.4635859},
  {id:537,name:"Lopperi Osmo PK",address:"Niemistenkyläntie 514, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:538,name:"Loppi Tarja",address:"Suntianmäki 15, 07600 Myrskylä",phone:"",ytunnus:"",lat:60.6540851,lng:25.84275},
  {id:539,name:"Luhangan Liikenne",address:"Keskustie 3, 19950 LUHANKA",phone:"",ytunnus:"",lat:61.8040334,lng:25.6900151},
  {id:540,name:"Lukkaroinen Veijo",address:"Siikaniementie 243, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:541,name:"Luotikasjärventiekunta / Peltonen Ismo",address:"Luotikasjärventie 184, 19540 Koitti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:542,name:"Lyytikkä Ari",address:"Vihdinkatu 9, 15100 Lahti",phone:"",ytunnus:"",lat:60.9743308,lng:25.6654699},
  {id:543,name:"M. Fixers oy / MIkko Lukkaroinen",address:"Paperimestarintie 4b6, 40520 Jyväskylä",phone:"",ytunnus:"",lat:62.2607278,lng:25.7586805},
  {id:544,name:"M. Huhtakallio oy",address:"Tuotantolinja 3, 36220 Kangasala",phone:"",ytunnus:"",lat:61.4784508,lng:23.9913613},
  {id:545,name:"M.Hahtokari oy",address:"Niiniementie 60, 41770 Leivomäki",phone:"",ytunnus:"0773443-7",lat:null,lng:null},
  {id:546,name:"Maanrakennus Ari Helminen Oy",address:"Harantie 980 A, 19920 PAPPINEN",phone:"",ytunnus:"1956364-7",lat:null,lng:null},
  {id:547,name:"Maanrakennus J&J Mynttinen Oy",address:"Pihtijoentie 81, 41660 TOIVAKKA",phone:"",ytunnus:"",lat:62.14534,lng:26.1396676},
  {id:548,name:"Maanrakennus Jouko Laakso oy",address:"Laaksotie 71, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7143932,lng:26.4524061},
  {id:549,name:"Maanrakennus L&T oy",address:"Salo-Syrjälä 39, 16730 Kutajärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:550,name:"Maanrakennus Pertti Kärnä Oy",address:"Jääkärintie 3, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7361503,lng:26.1101907},
  {id:551,name:"Maanrakennus Reijo Saari",address:"Kilkinniementie 55, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7329179,lng:26.2346992},
  {id:552,name:"Maanrakennus T. Mäkelä / Ostolaskut 144 64 F",address:"PL 10, 57090 Visma scan",phone:"",ytunnus:"",lat:null,lng:null},
  {id:553,name:"Maanrakennus Tomi Salonen Oy",address:"Riuttatie, 19650 Joutsa",phone:"",ytunnus:"2845786-2",lat:61.7340191,lng:26.123067},
  {id:554,name:"Maansiirto Hämeenniemi Ky",address:"Yliahontie 16, 42700",phone:"",ytunnus:"2666392-9",lat:62.2444581,lng:24.725501},
  {id:555,name:"Maarakennus L. Kurppa Oy",address:"Tuustaipaleentie 387, 52740 Tuustaipale",phone:"",ytunnus:"",lat:null,lng:null},
  {id:556,name:"Maarakennus M.Laivola Oy",address:"PL 7, 14201 Turenki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:557,name:"Maarakennus Suutarinen oy",address:"Vuorilahdentie 7, 52700 Mäntyharju",phone:"",ytunnus:"",lat:61.4069025,lng:26.8919452},
  {id:558,name:"Mahajärven Metsätie / Tuomo Hietala",address:"Rinnekuja 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7402356,lng:26.1229804},
  {id:559,name:"Maiju Maunula",address:"Myllytie 5A4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7388502,lng:26.1273384},
  {id:560,name:"Marja Paakkinen",address:"Vasaratie 5, 19650 Joutsa",phone:"",ytunnus:"",lat:61.752557,lng:26.1230583},
  {id:561,name:"Marjatta Hahkio",address:"Reunaniitty 4b2, 02200 Espoo",phone:"",ytunnus:"",lat:60.1709667,lng:24.7792561},
  {id:562,name:"Markku Niemi",address:"Ruokorannantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.762471,lng:26.1878074},
  {id:563,name:"Markku Otava",address:"Tanttulansaarentie 11, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7264818,lng:26.232325},
  {id:564,name:"Markku Rinta-Kiikka",address:"Kiikkalankuja 28, 60800 Ilmajoki",phone:"",ytunnus:"",lat:62.7222474,lng:22.539316},
  {id:565,name:"Marko Miina",address:"Puistotie 8, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7420667,lng:26.1209538},
  {id:566,name:"Marko Niemi",address:"Vuohelantie 2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6998731,lng:26.1860648},
  {id:567,name:"Marko Pynnönen",address:"Jousitie 54, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7344903,lng:26.104714},
  {id:568,name:"Marko Salo",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:569,name:"Marko Tanteri",address:"Leppäojantie 236, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7953779,lng:26.0640603},
  {id:570,name:"Marti Komu",address:"Pakkaspolku 5, 17200 Vööksy",phone:"",ytunnus:"",lat:null,lng:null},
  {id:571,name:"Martti Hietala",address:"Kangasniementie 812, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:572,name:"Martti Siltala",address:"Levänmäentie 24, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:573,name:"Marttila Terttu",address:"Niittytie 18 a 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7454368,lng:26.1184785},
  {id:574,name:"Matias Arpikari",address:"Riihikallionkuja 4, 00890 Helsinki",phone:"",ytunnus:"",lat:60.2712604,lng:25.1899869},
  {id:575,name:"Matti Simola",address:"Salmenniementie 73b, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8025281,lng:25.981389},
  {id:576,name:"Matti Virolainen",address:"Oravakiventie 11, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7160521,lng:26.0708038},
  {id:577,name:"Mattila Maija",address:"Mutkalantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7246529,lng:26.2026379},
  {id:578,name:"Mauri Haikarainen",address:"Myllykankaantie 238, 41770 Leivonmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:579,name:"Metsä-Pirkka Ky",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:580,name:"Metsähallitus",address:"Kauppakatu 32, 40101 Jyväskylä",phone:"",ytunnus:"",lat:62.2439893,lng:25.7504248},
  {id:581,name:"Metsähallitus Metsätalous Oy",address:"PL 1319, 96101 ROVANIEMI",phone:"",ytunnus:"",lat:null,lng:null},
  {id:582,name:"Metsähallitus / Metsätalous",address:"Ostolaskut, PL 1319",phone:"",ytunnus:"",lat:null,lng:null},
  {id:583,name:"Metsäkone palvelu oy",address:"Konepajantie 12, 13300 Hämeenlinna",phone:"",ytunnus:"",lat:60.9743881,lng:24.5196275},
  {id:584,name:"Metsäkoneurakointi Forester Oy",address:"Vuohelantie, 19650 Joutsa",phone:"",ytunnus:"2304368-7",lat:61.6998731,lng:26.1860648},
  {id:585,name:"Metsäliitto Osuuskunta",address:"PL 5, 02020 Metsä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:586,name:"Metsälänyksityistie",address:"Metsäläntie 175, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6813698,lng:26.2570103},
  {id:587,name:"Metsänen Juha",address:"Nurmaanrannantie 52, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8080477,lng:26.1856517},
  {id:588,name:"Metsänhoitoyhdistys Etelä-Savo ry",address:"Länsitie 8, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7417016,lng:26.1118144},
  {id:589,name:"Metsänhoitoyhdistys Päijät-Häme Ry / Teppo Laine",address:"Metsolantie 7, 19600 Hartola",phone:"",ytunnus:"",lat:61.5806706,lng:26.0168508},
  {id:590,name:"Metsäpalvelu Heimonen",address:"Koittilantie 22, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7960331,lng:25.9999284},
  {id:591,name:"Metsätyö Pylväläinen oy",address:"Siltalantie 77, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8483105,lng:26.2345351},
  {id:592,name:"Metsäurakointi Heikki Halberg oy",address:"Tillalantie 36, 19850 Putkijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:593,name:"Metsäyhtymä Hanna ja Heikki Norola",address:"Valkharjunkaari 14, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:594,name:"Metsäyhtymä Heinonen ja Leppäketo",address:"Kostamontie 122, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8191519,lng:26.0676318},
  {id:595,name:"Metsäyhtymä Hietala",address:"Rinnekuja 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7402356,lng:26.1229804},
  {id:596,name:"Metsäyhtymä Kantele Mika ja Kantele Sini",address:"Kanteleentie 265, 19540 Koitti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:597,name:"Metsäyhtymä Moilanen Juho / Moilanen Pirkko ja Kuolinpesä",address:"Lahtelantie 130, 19650 Joutsa",phone:"",ytunnus:"",lat:61.663484,lng:26.3225462},
  {id:598,name:"Metsäyhtymä Pylkkö Tommi ja Salme",address:"Kaivomäentie 10, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8266113,lng:26.1015116},
  {id:599,name:"Metsäyhtymä Saviharju Kaija kp ja Kari kp",address:"Kissankulmantie 110, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7780354,lng:26.0958272},
  {id:600,name:"Michael Muller",address:"Estetie 11 B, 00430 Helsinki",phone:"",ytunnus:"",lat:60.2463517,lng:24.896451},
  {id:601,name:"Mieskonmäen koulukyyti",address:"Kumputie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7375189,lng:26.1304943},
  {id:602,name:"Mika Kytö",address:"Suojoensuuntie 135, 19540 Koitti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:603,name:"Mika Salow",address:"Palsantie 120 A, 19460 Ruorasmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:604,name:"Mikko Isokangas",address:"Lohjantie 17, 03100 Nummela",phone:"",ytunnus:"",lat:60.3313546,lng:24.3012606},
  {id:605,name:"Mikko Mönkölä",address:"Rusintie 175, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:606,name:"Mikko Norola",address:"Hauhanpohjantie 287, 19910",phone:"",ytunnus:"",lat:61.8837659,lng:25.8421122},
  {id:607,name:"Mikko Peltonen",address:"Pengertie 12, 02880 Veikkola",phone:"",ytunnus:"",lat:60.2797391,lng:24.4187515},
  {id:608,name:"Mikko Raito",address:"Toivikkotie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7360343,lng:26.1041706},
  {id:609,name:"Minna Olkkonen",address:"Puistotie 6, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7420667,lng:26.1209538},
  {id:610,name:"Moniapu Salonen oy",address:"Kalhontie 251, 19630 Kalhonkylä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:611,name:"Morenia oy",address:"PL 36, 20266 DocuScan",phone:"",ytunnus:"",lat:null,lng:null},
  {id:612,name:"Mossinniementien thk",address:"Oritmurrontie 22, 04420 Järvenpää",phone:"",ytunnus:"",lat:60.4652226,lng:25.1114265},
  {id:613,name:"Mstone",address:"Niininiementie 75, 41770 Leivonmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:614,name:"MTY Arttu ja Vuokko Laakso",address:"Uudenkäläntie 35, 19670 Mieskonmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:615,name:"Murtonen Antti",address:"Jousitie 41 b 8, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7344903,lng:26.104714},
  {id:616,name:"Myllykankaantie / Pekka Aarnio",address:"Myllykankaantie 440 A, 41770 Leivonmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:617,name:"Myllyniementie / Timo Hietala",address:"Säynätniementie 139, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8021008,lng:26.2110536},
  {id:618,name:"Mäkinen Anssi",address:"Leivonmäentie 7, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.916007,lng:26.1219282},
  {id:619,name:"Naavarannantie",address:"Naavarannantie 8a, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6512038,lng:26.1592042},
  {id:620,name:"Nakontila oy",address:"Impivaarankuja 72, 47810 Selänpää",phone:"",ytunnus:"",lat:61.0520647,lng:26.7451598},
  {id:621,name:"Napapiirin Kuljetus Oy",address:"Taavankatu 2, 98120 Kemijärvi",phone:"",ytunnus:"0195373-5",lat:null,lng:null},
  {id:622,name:"Nemo Sipilä",address:"Solnantie 32 A 18, 00330 Helsinki",phone:"",ytunnus:"",lat:60.1975811,lng:24.879081},
  {id:623,name:"Niemenyksityistie / c/o Pirjo Seimola",address:"Hauhanpohjantie 84, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:624,name:"Niemi Tapio",address:"Tyyneläntie 192, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7192016,lng:26.0946675},
  {id:625,name:"Nieminen Juhani",address:"Heinävuorentie 206, 19850 Putkijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:626,name:"Nieminen Pekka",address:"Myllytie 55, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7388502,lng:26.1273384},
  {id:627,name:"Niemitien thk / Mikko Peltola",address:"Pengertie 12, 02880 Veikkola",phone:"",ytunnus:"",lat:60.2797391,lng:24.4187515},
  {id:628,name:"Niinikoski Aila ja Leo",address:"Hakaniementie 125, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6967244,lng:26.2552881},
  {id:629,name:"Niittyläntiekunta",address:"Pohvintie 2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7471973,lng:26.1328535},
  {id:630,name:"Nikander Hannu",address:"Kaivokselantie 8a1, 01610 Vantaa",phone:"",ytunnus:"",lat:60.2669708,lng:24.8719838},
  {id:631,name:"Niko Järvinen",address:"Lahdenpohjantie 120, 16790 Manskivi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:632,name:"Nina Laine",address:"Ruokorannantie 435, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7625278,lng:26.1880321},
  {id:633,name:"Nurmaanrannantie",address:"Sirkanpolku 24 B9, 40420 Jyskä",phone:"",ytunnus:"",lat:62.2340498,lng:25.8201735},
  {id:634,name:"Oijala Teppo",address:"Kalliokatu 8, 40630 Jyväskylä",phone:"",ytunnus:"",lat:62.2429393,lng:25.7007451},
  {id:635,name:"Ojala Aulis",address:"Suvirannantie 22, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:636,name:"Oksanen Tarmo",address:"Korpijärventie 124, 19230 Onkiniemi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:637,name:"Olkkonen Arto",address:"Valtatie 662, 19600 Hartola",phone:"",ytunnus:"",lat:61.56167,lng:26.0056913},
  {id:638,name:"Olli Ikäläinen",address:"Viertolankuja 5b26, 01300 Vantaa",phone:"",ytunnus:"",lat:60.2902488,lng:25.0175642},
  {id:639,name:"Olli Koskinen",address:"Nokanpolku, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6703874,lng:26.2164036},
  {id:640,name:"Onalinsalmen tiekunta / Jari Pessala",address:"Puuttenkujan 23, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:641,name:"Onkisalontie / Metsä-Pirkka ky",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:642,name:"Osmo Linkola",address:"Suotorpantie 21, 02130 Espoo",phone:"",ytunnus:"",lat:60.196133,lng:24.7937655},
  {id:643,name:"Osmo Ulmala",address:"osmo.ulmala@luukku.com",phone:"",ytunnus:"",lat:null,lng:null},
  {id:644,name:"Ostech oy",address:"Juvanlammenpolku 26, 19620 Pohela",phone:"",ytunnus:"",lat:null,lng:null},
  {id:645,name:"Ostech oy ltd",address:"Pohniementie 42, 19610 Murakka",phone:"",ytunnus:"",lat:null,lng:null},
  {id:646,name:"Oteran oy",address:"Ahlmaninkatu 2e, 40100 Jyväskylä",phone:"",ytunnus:"",lat:62.2316761,lng:25.7352898},
  {id:647,name:"Paalanen Eero",address:"Kärälammentie 210, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7720592,lng:26.1747284},
  {id:648,name:"Paappanen Pirjo",address:"Kaivokuja, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:649,name:"Palsantien thk / Milla Haukka",address:"Kolilantie 181, 19460 Ruorasmäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:650,name:"Panu Salonen",address:"Eerolantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.76815,lng:26.0437865},
  {id:651,name:"Papinmäen ja Avosalmentie",address:"Jouni Salonen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:652,name:"Papinmäenyksityistie / Salonen Jouni",address:"Lehtovuorenkatu 8a5, 00390 Helsinki",phone:"",ytunnus:"",lat:60.2469601,lng:24.8367441},
  {id:653,name:"Pappinen-Vartiamäen yksityistie",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:654,name:"Parkkonen Markku",address:"Rauhalantie 61, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7715193,lng:26.1225616},
  {id:655,name:"Parosen thk",address:"Paroisentie 296, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:656,name:"Partanen Aaro",address:"Rieppola, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7916818,lng:26.3651559},
  {id:657,name:"Pasi Kangas",address:"Nurmaanrannantie 14b, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8080501,lng:26.1856502},
  {id:658,name:"Pasi Nieminen",address:"Mäkitie 9, 19650 Joutsa",phone:"",ytunnus:"",lat:61.739485,lng:26.1282866},
  {id:659,name:"Pauli Kallio",address:"Vihersalontie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6860805,lng:26.1626091},
  {id:660,name:"Pauliina Maukonen",address:"Angesseläntie 107, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7943046,lng:26.0932713},
  {id:661,name:"Pauliina Sievänen",address:"Leivonmäentie 17a2, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.9011673,lng:26.1186291},
  {id:662,name:"Paunonen Pertti",address:"Jäniskuja 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7506493,lng:26.1146272},
  {id:663,name:"PEAB",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:664,name:"Peab Indrustri oy",address:"PL1098, 00026 Basware",phone:"",ytunnus:"",lat:null,lng:null},
  {id:665,name:"Peab Industri Oy",address:"Karvaamokuja 2a, 00380 Helsinki",phone:"",ytunnus:"",lat:60.2156605,lng:24.8822708},
  {id:666,name:"Pekka Aarnio",address:"Myllykankaantie 440, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8391342,lng:26.1617294},
  {id:667,name:"Pekka Nykopp",address:"Sarkapolku 1, 16300 Orimattila",phone:"",ytunnus:"",lat:60.8000184,lng:25.7471262},
  {id:668,name:"Pekka Runtti",address:"Niittytie 12, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7454368,lng:26.1184785},
  {id:669,name:"Pekka Sampo",address:"Korpilahdentie 300, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7882024,lng:26.093461},
  {id:670,name:"Pekka Strengell",address:"Riuttakuja 3, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:671,name:"Pekkastentie THK / Lasse Peltola",address:"Pekkasentie 86, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7385565,lng:26.0739568},
  {id:672,name:"Pellonpään yksityistie",address:"Pitkäniementie 171, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:673,name:"Peltosen torppa",address:"Peltosentie 1, 19630 Kalhonkylä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:674,name:"Pentti Kaarnakoski",address:"Välilänraitti 37, 41400 Lievestuore",phone:"",ytunnus:"",lat:62.2482581,lng:26.2105142},
  {id:675,name:"Pentti Kiiski",address:"Haapavuorentie 167, 12240 Hikiä",phone:"",ytunnus:"",lat:60.6901878,lng:25.0247359},
  {id:676,name:"Pentti Otava",address:"Mattilantie 15, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:677,name:"Pertti Larva",address:"Rantaharju 4c 39, 02230 Espoo",phone:"",ytunnus:"",lat:60.1522212,lng:24.7576591},
  {id:678,name:"Pertti Saarikoski",address:"Kangastie 4, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.911136,lng:26.1213582},
  {id:679,name:"Pesonen Veijo",address:"Sipoontie 57, 04430 Järvenpää",phone:"",ytunnus:"",lat:60.4671407,lng:25.1290138},
  {id:680,name:"Petri Heino",address:"Pistotie 20a, 19650 Joutsa",phone:"",ytunnus:"",lat:61.736966,lng:26.1980528},
  {id:681,name:"Petri Niemi",address:"Kunnantie 4b8, 00700 Helsinki",phone:"",ytunnus:"",lat:60.2525293,lng:25.0010175},
  {id:682,name:"Petri Pessala",address:"jousitie 36, 19650 joutsa",phone:"",ytunnus:"",lat:61.7396976,lng:26.1131333},
  {id:683,name:"Petri Pihamaa",address:"Uusi-Ruskealantie 9, 19600 Hartola",phone:"",ytunnus:"",lat:61.6041922,lng:26.0120906},
  {id:684,name:"Petri Pukkanen",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:685,name:"Piilolan yksityistie THK / Anna Huuskola",address:"Tammijärventie 208, 19910 Tammijärvi",phone:"",ytunnus:"",lat:61.8329946,lng:25.8037223},
  {id:686,name:"Pika-Antti oy",address:"Kangasniementie 65, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:687,name:"Pilkasenniemen yksityistie / Sirpa Iivari",address:"Töppöspohjantie 250, 41870 Putkilahti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:688,name:"PIMARA VÄYLÄPALVELUT OY",address:"Kolmenkulmantie 16, 33430 Vuorentausta",phone:"",ytunnus:"",lat:null,lng:null},
  {id:689,name:"Pirjo Paappanen",address:"Kaivokuja 1, 19650 joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:690,name:"Pirjo Puranen",address:"Valmetinkatu 12 B 13, 33900 Tampere",phone:"",ytunnus:"",lat:61.4730335,lng:23.7263375},
  {id:691,name:"Pirkko Moilanen",address:"Lahtelantie 130, 19650 Joutsa",phone:"",ytunnus:"",lat:61.663484,lng:26.3225462},
  {id:692,name:"PK Palvelut",address:"Nurmaanrannantie 14b, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8080501,lng:26.1856502},
  {id:693,name:"PM Autohuolto O)y",address:"Yrittäjäntie 10, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7611299,lng:26.1069743},
  {id:694,name:"ProPellet oy",address:"Vähäkankaantie 66, 84100 Ylivieska",phone:"",ytunnus:"",lat:64.0867289,lng:24.5587949},
  {id:695,name:"Protek service",address:"Leppäojantie 225, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7953779,lng:26.0640603},
  {id:696,name:"PT-Rakennuspalvelu oy",address:"Valkharjuntie 2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7539844,lng:26.1268891},
  {id:697,name:"Puhakka Jarkko",address:"Sillanlahdentyie 18, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:698,name:"Puollustushallinnon / Rakennuslaitos",address:"PL 8151, 01051 Laskut",phone:"",ytunnus:"",lat:null,lng:null},
  {id:699,name:"Puolustuskiinteistöt / Keski-Suomen palvelualue",address:"PL 1000, 00531 Helsinki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:700,name:"PurkuPro oy",address:"Pekkalankuja 7, 01510 Vantaa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:701,name:"Pylsyn yksityistie / Martti Lahtinen",address:"Pylsyntie 766a, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7847778,lng:26.2975542},
  {id:702,name:"Pylväläinen Timo",address:"Siltalantie 77, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8483105,lng:26.2345351},
  {id:703,name:"Pyydysmutkan thk / Eero Paakkunainen",address:"Pyydysmutka 204, 41730 Kivisuo",phone:"",ytunnus:"",lat:61.9066521,lng:25.9555395},
  {id:704,name:"Päijänteen Metsänhoitoyhdistys ry / Jalkanen Erkki",address:"Vasarakatu 9A, 40320 Jyväskylä",phone:"",ytunnus:"",lat:62.259525,lng:25.7721392},
  {id:705,name:"Päijät-Hämeen urheiluautoiliat",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:706,name:"Pärnämäentie thk / Pasi Haapasaari",address:"Savelantie52, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:707,name:"Rahikka Jouko",address:"Niittylahdentie 84, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6975174,lng:26.3968572},
  {id:708,name:"Raidanlahdentie / Kari Kauppinen",address:"Raidanlahdentie 300, 41880 Oittila",phone:"",ytunnus:"",lat:61.9820099,lng:25.7412494},
  {id:709,name:"Raili Paukku",address:"Savontie 29, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7467441,lng:26.1317962},
  {id:710,name:"Raimo Järvelin",address:"Niemistenkyläntie 155, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:711,name:"Raimo Rastas",address:"Joenniementie69, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:712,name:"Raimo Tikka",address:"Huttulantie 19, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7477254,lng:26.1098294},
  {id:713,name:"RaimoSalonen",address:"Lapinlammentie 233, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:714,name:"Rainer Koivisto",address:"Isokuja 4 A, 40500 Jyväskylä",phone:"",ytunnus:"",lat:62.2217769,lng:25.7956691},
  {id:715,name:"Rakennuspalvelu Ilmonen oy",address:"Kukintie 14, 01620 Vantaa",phone:"",ytunnus:"",lat:60.2832513,lng:24.8625765},
  {id:716,name:"Rakennustyö Marko  Salo oy",address:"Toivakantie 19, 19650 Joutsa",phone:"",ytunnus:"2110290-3",lat:null,lng:null},
  {id:717,name:"Rakennustyö Marko Lehtonen Oy",address:"PL 77826, 00063 Laskunet",phone:"",ytunnus:"",lat:null,lng:null},
  {id:718,name:"Rakennustyö Timo Heino",address:"Rautamäentie 10, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7379881,lng:26.1401969},
  {id:719,name:"Rakkolan yksityistie / Marko Pynnönen",address:"Jousitie 54, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7344903,lng:26.104714},
  {id:720,name:"Ranaatintien thk",address:"Ranaatintie 145, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8406756,lng:26.2101647},
  {id:721,name:"Rantakyläntien thk / Metsä Pirkka",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:722,name:"Rantalanyksityistie",address:"Vuohelantie 2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6998731,lng:26.1860648},
  {id:723,name:"Rantasen sora ja turve",address:"Suotie 20, 19600 Hartola",phone:"",ytunnus:"",lat:61.5622816,lng:26.013497},
  {id:724,name:"Rauhalantien THK",address:"Heiskalantie 75, 19650 JOUTSA",phone:"",ytunnus:"",lat:61.7788454,lng:26.0750571},
  {id:725,name:"Rauno Jaakkola",address:"Tammimäentie 443, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8206562,lng:25.9897699},
  {id:726,name:"Ravi ja Ratsutalli S.Kekkonen",address:"Kangasniementie 128, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:727,name:"Reijo Forström",address:"Kaitueentie 92, 19560 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:728,name:"Reijo Hamina",address:"Kirveslahdentie 13, 19540 Koitti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:729,name:"Reijo Hjelm",address:"Tuovintie 7, 01420 Vantaa",phone:"",ytunnus:"",lat:60.3226825,lng:25.096513},
  {id:730,name:"Reijo Mustonen",address:"Angesselkä 144B, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7916314,lng:26.0927267},
  {id:731,name:"Reiskan Taloapu ky",address:"Kinkosentie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7588027,lng:26.1904163},
  {id:732,name:"Rekolankyläntien thk / Metsä Pirkka ky",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:733,name:"Rieskalanrantatien THK / Arto Hölttä",address:"Rieskalantie 400, 19650 JOUTSA",phone:"",ytunnus:"",lat:61.764723,lng:26.0746688},
  {id:734,name:"Riihi-Virta oy",address:"Kärälammentie 153, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7725491,lng:26.1748089},
  {id:735,name:"Riikka Forssten",address:"Teiskontie 21d 53, 33500 Tampere",phone:"",ytunnus:"",lat:null,lng:null},
  {id:736,name:"Riitta Niinikoski",address:"Angesselkä 2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7913103,lng:26.0928361},
  {id:737,name:"Rinne Sinikka",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:738,name:"Risto Saarikettu",address:"Rautamäentie 14, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7385249,lng:26.1398251},
  {id:739,name:"Risto Tammelin",address:"Keitaantie, 19910 Tammijärvi",phone:"",ytunnus:"",lat:61.8342647,lng:25.8237675},
  {id:740,name:"Riutantie Yksityistie / Jopuni Pekkola",address:"Riutantie152, 19430 Pertunmaa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:741,name:"Roni Saarinen / Pöndis",address:"Pannuvuorentie 21, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7428058,lng:26.1262817},
  {id:742,name:"Roni Ärling",address:"Matinkatu 24 a 7, 02230 Espoo",phone:"",ytunnus:"",lat:60.1592943,lng:24.7462238},
  {id:743,name:"Roope Teppola",address:"Soratie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7449054,lng:26.1247058},
  {id:744,name:"Rosenberg Matti",address:"Kaksolantie 1, 19600 Hartola",phone:"",ytunnus:"",lat:null,lng:null},
  {id:745,name:"Rotomon oy",address:"Hallitie 26, 51200 Kangasniemi",phone:"",ytunnus:"",lat:62.0102219,lng:26.6395158},
  {id:746,name:"Rovanperä Racing Oy / Rovanperä Kalle",address:"Käpälämäentie 40, 41120 Puuppola",phone:"",ytunnus:"",lat:null,lng:null},
  {id:747,name:"Ruhanen Keijo",address:"Kostamontie 117, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8191519,lng:26.0676318},
  {id:748,name:"Ruohtula Ari",address:"Kissankulmantie 59, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7780354,lng:26.0958272},
  {id:749,name:"Ruokorannan THK",address:"Kariharjuntie 3, 19650 JOUTSA",phone:"",ytunnus:"1447480-5",lat:61.7359345,lng:26.1063863},
  {id:750,name:"Ruosteniementie THK / Jorma Lehtosaari",address:"Yhdystie 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7440422,lng:26.1079029},
  {id:751,name:"Rusi Riders",address:"Rusintie 80, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:752,name:"Ruunula Arto",address:"Mikontie, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:753,name:"Räiskäläntiekunta",address:"Räiskäläntie 62, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:754,name:"Räiskän yksityistie / Kalle Rantanen",address:"Räiskäntie 62, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:755,name:"Räyhänmäen yksityistie / Kirsi Salonen",address:"Valkharjuntie 1 b 7, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7539844,lng:26.1268891},
  {id:756,name:"Röksäntien thk / Jorma Lilja",address:"Röksäntie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8098699,lng:26.0427465},
  {id:757,name:"Saagatalli",address:"Issikanpolku 51, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7758843,lng:26.156229},
  {id:758,name:"Saarijärven Kaupunki",address:"Sivulantie 11, 43100 Saarijärvi",phone:"",ytunnus:"",lat:62.7072164,lng:25.2539881},
  {id:759,name:"Saarinen Kari",address:"Kaunistontie 60, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6909689,lng:26.4200784},
  {id:760,name:"Saila Heinonen",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:761,name:"Saima Mansikan kuolinpesä",address:"Lintulahden aukio 10 A 20, 00500 Helsinki",phone:"",ytunnus:"",lat:60.1844494,lng:24.9630098},
  {id:762,name:"Sallinen Pirjo",address:"Lapikastie 12, 00940 Helsinki",phone:"",ytunnus:"",lat:60.2300747,lng:25.095807},
  {id:763,name:"Salmelantien thk / Tili ja Neuvonta Lehtari",address:"Höltänkyläntie 221, 19410 Kuortti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:764,name:"Salmelantien THK / Ari Lehtimäki",address:"Höltänkyläntie 211, 19410 Kuortti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:765,name:"Salonen Petri tmi",address:"Vanhansillantie 102, 19370 Nuoramoinen",phone:"",ytunnus:"",lat:61.4422202,lng:25.8459098},
  {id:766,name:"Salonen Teuvo",address:"Kangasniementie 260, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:767,name:"Saltiola Juha",address:"Pannuvuorenkuja 3, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7419355,lng:26.1264311},
  {id:768,name:"Sami Fagerholm",address:"Angesseläntie 90, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7943046,lng:26.0932713},
  {id:769,name:"Sami Laaksonen",address:"Runeberginkatu 6 b 32, 00100 Helsinki",phone:"",ytunnus:"",lat:60.1726975,lng:24.9229612},
  {id:770,name:"Sami Rolig",address:"Itälahdenkatu 10a b29, 00210 Helsinki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:771,name:"Samuel Hölttä",address:"Heiskalantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7788454,lng:26.0750571},
  {id:772,name:"Sankari Markku",address:"Sankarintie 35, 19600 Hartola",phone:"",ytunnus:"",lat:61.6349237,lng:26.2546632},
  {id:773,name:"Sanna Inkeroinen",address:"Mannisenkatu 34, 44120 Äänekoski",phone:"",ytunnus:"",lat:62.6153824,lng:25.7273529},
  {id:774,name:"Sari Nieminen",address:"Hämeenkatu 15A, 18100 Heinola",phone:"",ytunnus:"",lat:61.2072489,lng:26.038522},
  {id:775,name:"Savolainen Niko",address:"Lankiansalmentie 28, 19650 Joutsa",phone:"",ytunnus:"",lat:61.741662,lng:26.0389783},
  {id:776,name:"Savonlinja Oy",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:777,name:"Seppo Malin",address:"Rauhalantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7715193,lng:26.1225616},
  {id:778,name:"Serforest oy.co Jarno Salonen",address:"Välimäentie 4, 19700 Sysmä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:779,name:"SH Autopalvelu",address:"Kangasniementie 65, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:780,name:"Siikaniementiekunta",address:"Siikaniementie, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:781,name:"Siiri Mäentalo",address:"Pukaraistentie 63, 19770 Valittula",phone:"",ytunnus:"",lat:null,lng:null},
  {id:782,name:"Siitimenjärvenyksityistiekunta",address:"Hirvipohjantie, 19600 Hartola",phone:"",ytunnus:"",lat:61.6633214,lng:25.810239},
  {id:783,name:"Sikkola Helmelän yksityistie / Valtteri Sankari",address:"Helmeläntie 88, 19540 Koitti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:784,name:"Sikojärven thk",address:"Rekolankylä, 19950 Luhanka",phone:"",ytunnus:"",lat:null,lng:null},
  {id:785,name:"Silmula Veikko",address:"Tiilipuistontie 12 as3, 15870 Hollola",phone:"",ytunnus:"",lat:null,lng:null},
  {id:786,name:"Siltala Kalle",address:"Angesselkä 144 A, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7913103,lng:26.0928361},
  {id:787,name:"Simo Kärnä",address:"Niittysenmutka 38, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:788,name:"Simo Lehtinen",address:"Iso-Hakoniementie 10, 19610 Murakka",phone:"",ytunnus:"",lat:null,lng:null},
  {id:789,name:"Simola Veli Pekka",address:"Liinakontie 18, 47400 Kausala",phone:"",ytunnus:"",lat:60.8848813,lng:26.3357486},
  {id:790,name:"Sinikka Salonen",address:"Räyhänmäentie 124, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6709058,lng:26.1132504},
  {id:791,name:"Sirkka Valtonen",address:"Rautamäentie 3e10, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7381505,lng:26.1395225},
  {id:792,name:"Sirpa Lohikallio",address:"Lintukankaantie 367, 40270 Palokka",phone:"",ytunnus:"",lat:62.3164838,lng:25.6292898},
  {id:793,name:"Sirpa Äänisalo",address:"Leppäojantie 218 b, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7953779,lng:26.0640603},
  {id:794,name:"Soilu Jesse",address:"Pertunmaantie 366, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7488648,lng:26.1290171},
  {id:795,name:"Soilu oy",address:"Korpilahdentie 226, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7882024,lng:26.093461},
  {id:796,name:"Soisalo Mikko",address:"Kuhalantie 347, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6790163,lng:26.2014841},
  {id:797,name:"Soisalon Liikenne oy",address:"Mestarintie 3, 78200 Varkaus",phone:"",ytunnus:"",lat:62.3083717,lng:27.8632034},
  {id:798,name:"Sokurantie / Flinkman Jouni",address:"Sokurantie 141, 19650 Joutsa",phone:"",ytunnus:"",lat:61.82408,lng:26.2973283},
  {id:799,name:"Sompin Maansiirto oy",address:"Särkilahdentie 29, 19700 Sysmä",phone:"",ytunnus:"",lat:61.501716,lng:25.6799391},
  {id:800,name:"Stora Enso Oyj Wood Supply Finland / Metsä",address:"Heikinkatu 1, 55100 Imatra",phone:"",ytunnus:"1039050-8",lat:61.1723801,lng:28.7744327},
  {id:801,name:"Suiteri Motorsport",address:"Jalmarinpolku 3, 40950 Muurame",phone:"",ytunnus:"",lat:62.1240464,lng:25.6700096},
  {id:802,name:"Sukanen Pentti",address:"Kangasniementie 1337, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:803,name:"Sundström Ab Oy Entreprenad",address:"Långmossantie 50, 68530 Lepplax",phone:"",ytunnus:"",lat:63.6589018,lng:22.9138212},
  {id:804,name:"Suojakallio-Painaa thk / Pietilä Jarmo",address:"Hirvimäentie 37, 41600 Korpilahti",phone:"",ytunnus:"",lat:62.0429205,lng:25.3624044},
  {id:805,name:"Suojoensuuntien thk / Heikki Niinilahti",address:"Tarhalantie 377, 19600 Hartola",phone:"",ytunnus:"",lat:61.6076792,lng:25.9265215},
  {id:806,name:"Susanna Lavikainen",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:807,name:"Suursyvän yksityistie",address:"Kanervakuja 3a3, 51200 Kangasniemi",phone:"",ytunnus:"",lat:62.003423,lng:26.6474864},
  {id:808,name:"Sydänmaan yksityistie",address:"Sydänmaantie 67, 19920 Pappinen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:809,name:"Sydänmaan yksityistie / TieALVia oy",address:"Pynnöläntie 80, 51360 KOIVULA",phone:"",ytunnus:"",lat:null,lng:null},
  {id:810,name:"Sydänpuu Kiinteistöt oy",address:"PL 15, 90571 Oulu",phone:"",ytunnus:"",lat:null,lng:null},
  {id:811,name:"Säynätniemen yksityistien tiekunta / Heikki Hietala",address:"Säynätniementie 139, 19650 Joutsa",phone:"",ytunnus:"",lat:61.8021008,lng:26.2110536},
  {id:812,name:"T:mi Antti Kyyhkynen",address:"Väisäläntie 456, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7026093,lng:26.386463},
  {id:813,name:"T:mi Sami Kyyhkynen",address:"Vaatturintie 140, 19650 Joutsa",phone:"",ytunnus:"",lat:61.754708,lng:26.4073223},
  {id:814,name:"Tahvanainen Markku",address:"Nauharinne 6 A, 01260 Vantaa",phone:"",ytunnus:"",lat:60.2882919,lng:25.113563},
  {id:815,name:"Taina Kuivainen",address:"Niemeläntie 135a, 19420 Mansikkamäki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:816,name:"Taisto Sievänen",address:"Jousitie 55 A 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7344903,lng:26.104714},
  {id:817,name:"Taisto Välimaa",address:"Lumikonkuja 13, 40400 Jyväskylä",phone:"",ytunnus:"",lat:62.2445407,lng:25.7931744},
  {id:818,name:"Talvikki Turppo",address:"Kangasniementie 649, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:819,name:"Talvitaipaleentien thk / Raimo Toppi",address:"Talvitaipaleentie 54, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6525697,lng:26.1266153},
  {id:820,name:"Tammi Baari",address:"Kangaskuja 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7470429,lng:26.1263165},
  {id:821,name:"Tammimäen tienhoitokunta / Vesa Heino",address:"Ylä-Ottolantie, 19920 Pappinen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:822,name:"Tamminen Katri",address:"Huttulantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7477254,lng:26.1098294},
  {id:823,name:"Tamminen Reijo",address:"Kinkosentie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7588027,lng:26.1904163},
  {id:824,name:"Tampinmylly",address:"Tampinmyllyntie 12, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7953975,lng:26.1660152},
  {id:825,name:"Tanttulansaaren tiehoitokunta / Risto Otava",address:"Peltotie 6, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7414799,lng:26.1226879},
  {id:826,name:"Tapio Koivisto",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:827,name:"Tapio Vilpas",address:"Venetahontie 568, 19920 Pappinen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:828,name:"Tarhanen Esko",address:"Korpilahdentie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7882024,lng:26.093461},
  {id:829,name:"Tarvainen Markku",address:"Tervalahdentie 84, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7165259,lng:26.0815319},
  {id:830,name:"Tauno Häyri",address:"Myllytie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7388502,lng:26.1273384},
  {id:831,name:"Teemu Koivisto",address:"Linnansaarentie, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:832,name:"Teemu Silvonen",address:"Kaviokuja 6 A 35, 01200 Vantaa",phone:"",ytunnus:"",lat:60.2788933,lng:25.1087054},
  {id:833,name:"TeePee Kiinteistöpalvelut Oy",address:"Katvelantie 14, 41400 Lievestuore",phone:"",ytunnus:"28210464",lat:null,lng:null},
  {id:834,name:"Teppola Pirkko",address:"Mikontie1, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:835,name:"Terho Kortelainen",address:"Arolantie 2 as 8, 17200 Vääksy",phone:"",ytunnus:"",lat:61.1674063,lng:25.545959},
  {id:836,name:"Tero Seppälä oy",address:"Savontie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7467441,lng:26.1317962},
  {id:837,name:"Terranor oy / Pieksämäki",address:"Teollisuuskatu 21, 00510 HELSINKI",phone:"",ytunnus:"3007636-4",lat:60.1940314,lng:24.9484476},
  {id:838,name:"Terranor oy / Mikkeli",address:"Teollisuuskatu 21, 00510 HELSINKI",phone:"",ytunnus:"",lat:60.1940314,lng:24.9484476},
  {id:839,name:"Terttu Haavisto",address:"Rautjärventie 35b7, 00950 Heklsinki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:840,name:"Testi",address:"te, 1 testi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:841,name:"Teuvo Salonen",address:"Kangasniementie 260, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:842,name:"Teuvo Saltiola",address:"Pertunmaantie 1671, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7488648,lng:26.1290171},
  {id:843,name:"Teuvo Volanen",address:"Juurikantie 17, 78300 Varkaus",phone:"",ytunnus:"",lat:62.3316968,lng:27.8823868},
  {id:844,name:"Tieransaaren metsätie",address:"Kangasniementie 812, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7511835,lng:26.1359096},
  {id:845,name:"Tiia Pajunen",address:"Jalkalantie 33, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7713719,lng:26.1885346},
  {id:846,name:"Tiina Hölttä",address:"Syrjälahdentie 53, 19430 Pertunmaa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:847,name:"Tiina Peussa",address:"Kuusitie 20, 18200 Heinola",phone:"",ytunnus:"",lat:61.2196699,lng:26.030371},
  {id:848,name:"Tiina Saarijärvi",address:"Nahilankulmantie 204, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:849,name:"Tikka Esko kp / c/o Heikki Tikka",address:"Kivityyrintie 105, 04430 Järvenpää",phone:"",ytunnus:"",lat:null,lng:null},
  {id:850,name:"Tili ja Neuvonta Lehtari",address:"Höltänkylätie 211, 19410 Kuortti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:851,name:"Tillalantie / Heikki Niinilahti",address:"Tarhalantie 377, 19600 Hartola",phone:"",ytunnus:"",lat:61.6076792,lng:25.9265215},
  {id:852,name:"Timo Eskola",address:"Laurilantie 386, 19610 Murakka",phone:"",ytunnus:"",lat:null,lng:null},
  {id:853,name:"Timo Kupiainen",address:"Jousiperä 2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7583069,lng:26.1094151},
  {id:854,name:"Timo Niemi",address:"Köysitie 159, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7242008,lng:26.0877325},
  {id:855,name:"Timo Säynätmäki",address:"Eerolantie 230, 19650 Joutsa",phone:"",ytunnus:"",lat:61.76815,lng:26.0437865},
  {id:856,name:"Timo Tommola",address:"Olvikuja 1, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:857,name:"TLT-Connection oy",address:"Pollenkuja 1, 20380 Turku",phone:"",ytunnus:"",lat:60.4838852,lng:22.3295903},
  {id:858,name:"Tmi J.Solatie",address:"Asematie 1, 50670 Otava",phone:"",ytunnus:"",lat:61.641552,lng:27.0746345},
  {id:859,name:"Tmi Tuomo Lavio",address:"Kuusitie 13, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7379709,lng:26.1354844},
  {id:860,name:"Tmi: Juha Sandelin",address:"Jousitie 99, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7344903,lng:26.104714},
  {id:861,name:"Tmi: Tuomo Hietala",address:"Rinnekuja 4, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7402356,lng:26.1229804},
  {id:862,name:"Tohtaanyksityistie / Juhani Nieminen",address:"Heinävuorentie 206, 19850 Putkijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:863,name:"Toivakantien Yksityistie",address:"Vuorenkyläntie 462, 19600 Hartola",phone:"",ytunnus:"",lat:61.6268757,lng:25.9442422},
  {id:864,name:"Tommi Lindberg",address:"Maalarintie 5b, 04200 Kerava",phone:"",ytunnus:"",lat:60.4074614,lng:25.0882088},
  {id:865,name:"Tommi Mäkinen",address:"Salmelantie 7 e, 41120 Puuppola",phone:"",ytunnus:"",lat:62.3500185,lng:25.7109969},
  {id:866,name:"Tommi Mäkinen Racing Oy / 16806762",address:"PL 4000, 00019 SSC",phone:"",ytunnus:"",lat:null,lng:null},
  {id:867,name:"Tommi Toivola",address:"Isonkarhunkuja 6, 00740 HELSINKI",phone:"",ytunnus:"",lat:60.2832653,lng:25.0038951},
  {id:868,name:"Toni Pöyry",address:"Sikkolantie 117, 19540 Koitti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:869,name:"Toppi Raimo",address:"Talvitaipaleentie 54, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6525697,lng:26.1266153},
  {id:870,name:"Tornator Oyj",address:"PL 5102, 70701 Kuopio",phone:"",ytunnus:"",lat:null,lng:null},
  {id:871,name:"Tornator oyj / Laura Pulliainen",address:"PL 8105, 02066 Docuscan",phone:"",ytunnus:"",lat:null,lng:null},
  {id:872,name:"Torsti Hännikäinen",address:"Torstinkuja 30, 19650 Joutsa",phone:"",ytunnus:"",lat:61.74958,lng:26.1261559},
  {id:873,name:"Toyota Gazoo Racing World Rally Team oy",address:"Salvesenintie 6, 40420 Jyskä",phone:"",ytunnus:"",lat:62.2359552,lng:25.8216843},
  {id:874,name:"Trail It Oy",address:"Haukimäentie 112, 41230 Uurainen",phone:"",ytunnus:"",lat:62.5245465,lng:25.3836469},
  {id:875,name:"Tuominen Kai",address:"Pohvintie 1b7, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7471973,lng:26.1328535},
  {id:876,name:"Tuula Ilmonen",address:"Rajalantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7513257,lng:26.1712996},
  {id:877,name:"Tyhjälä oy / Arto Reponen",address:"Rieskalan Rantatie 513, 19650 Joutaa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:878,name:"Tyynelänmetsätien tiekunta",address:"Yhdystie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7421521,lng:26.1138599},
  {id:879,name:"Tyyneläntien THK / Tapio Niemi",address:"Tyyneläntie 192, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7192016,lng:26.0946675},
  {id:880,name:"Töppöspohjan yksityistie / Sirpa Iivari",address:"Töppöspohjantie 250, 41870 Putkilahti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:881,name:"Ukri Pulliainen",address:"Mannerheimintie 79a4, 00270 Helsinki",phone:"",ytunnus:"",lat:60.1979395,lng:24.9012217},
  {id:882,name:"UPM-Kymmene metsä Oyj / Ville Lyytinen",address:"PL 501, 24101 Salo",phone:"",ytunnus:"",lat:null,lng:null},
  {id:883,name:"UPM-Kymmenen oyj",address:"Keskustie 5, 19600 Hartola",phone:"",ytunnus:"",lat:61.5653312,lng:26.0079502},
  {id:884,name:"UPM-Kymmenen oyj / Jarno Jalkanen",address:"UPM Metsä PL 501, 24101 Salo",phone:"",ytunnus:"",lat:null,lng:null},
  {id:885,name:"Uusi Pikontie",address:"Väihkyläntie 2, 19700 Sysmä",phone:"",ytunnus:"",lat:61.5062253,lng:25.6754722},
  {id:886,name:"Uusitalo Jussi",address:"Juurikastie 8, 18300 Heinola",phone:"",ytunnus:"",lat:61.2594083,lng:26.0695607},
  {id:887,name:"Uutelan Aluerakennus oy",address:"Jousitie 3, 15550 Nastola",phone:"",ytunnus:"",lat:60.943974,lng:25.9644442},
  {id:888,name:"Vaihelantila",address:"Vaihelantie 24, 19920 PAPPINEN",phone:"",ytunnus:"",lat:null,lng:null},
  {id:889,name:"Valtonen Veijo",address:"Puutteenkuja 26, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7444584,lng:26.1232279},
  {id:890,name:"Vanha-Salmelan tiekunta / c/o Heikki Haapamäki",address:"Salmelankyläntie 391, 19910 Tammijärvi",phone:"",ytunnus:"",lat:61.8461236,lng:25.8179971},
  {id:891,name:"Vanhavaaruntie THK / Jarmo Ahonen",address:"Vanhavaaruntie 69, 41870 Putkilahti",phone:"",ytunnus:"",lat:null,lng:null},
  {id:892,name:"Varjola Mika",address:"Impivaarankatu 1b, 33820 Tampere",phone:"",ytunnus:"",lat:61.4706537,lng:23.7829072},
  {id:893,name:"Vassilan yksityistie",address:"Juvanlammenpolku 26, 19620 Pohela",phone:"",ytunnus:"",lat:null,lng:null},
  {id:894,name:"Vehkasalon metsätie / c/o Päijänteen tilikeskus",address:"Keskustie 57 A 10, 19600 Hartola",phone:"",ytunnus:"",lat:61.5855772,lng:26.0185633},
  {id:895,name:"Vehmaan Sointulantie",address:"Vehmaan Sointulantie 1, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:896,name:"Vehmaantie thk",address:"Arto Vekkeli",phone:"",ytunnus:"",lat:null,lng:null},
  {id:897,name:"Veijonjärventie",address:"Metsä Pirkka",phone:"",ytunnus:"",lat:null,lng:null},
  {id:898,name:"Vekkeli Arto",address:"Vuorelantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6454673,lng:26.3573032},
  {id:899,name:"Venetahon tiekunta / Vesa Heino",address:"Ylä-Ottolantie, 19920 Pappinen",phone:"",ytunnus:"",lat:null,lng:null},
  {id:900,name:"Versowood Group Oy",address:"Sahatie 1, 19110 VIERUMÄKI",phone:"",ytunnus:"",lat:61.1040837,lng:25.9327432},
  {id:901,name:"Versowood oy",address:"Kymärintie 44, 19700 Sysmä",phone:"",ytunnus:"",lat:61.4519782,lng:25.7232702},
  {id:902,name:"Versowood oy / Jukka Rekola",address:"Maahinkyläntie 155, 41820 Saakoski",phone:"",ytunnus:"",lat:61.9591277,lng:25.3552094},
  {id:903,name:"Versowood oy / Mikko Huvinen",address:"Tähtiniementie 3, 18100 Heinola",phone:"",ytunnus:"",lat:61.1966977,lng:26.0053058},
  {id:904,name:"Vesan rakennus ja maalaus / Vesa Rajavuori",address:"Tikkalantie 828, 19700 Sysmä",phone:"",ytunnus:"",lat:61.5414589,lng:25.7334052},
  {id:905,name:"Viaporintien thk / Heikki Niinilahti",address:"Tarhalantie 377, 19600 Hartola",phone:"",ytunnus:"",lat:61.6076792,lng:25.9265215},
  {id:906,name:"Viherrys Heinonen oy",address:"Majasaarentie 11b, 41400 Lievestuore",phone:"",ytunnus:"",lat:62.2725278,lng:26.1935398},
  {id:907,name:"Vihersalontien thk",address:"Vihersalontie 679, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6976739,lng:26.1674093},
  {id:908,name:"Vihertyö Mustonen oy",address:"Huttulantie 2a2, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7477254,lng:26.1098294},
  {id:909,name:"Vihtonen Heikki",address:"Kukerinkalliontie 122, 12240 Hikiä",phone:"",ytunnus:"",lat:null,lng:null},
  {id:910,name:"Ville Tinnilä",address:"Turhalankatu 22, 15800 Lahti",phone:"",ytunnus:"",lat:60.9713685,lng:25.6119883},
  {id:911,name:"Virpi Marttila",address:"Vesilaitoksenkuja, 40800 Vaajakoski",phone:"",ytunnus:"",lat:62.2611454,lng:25.8913228},
  {id:912,name:"Virtanen Arto",address:"Riihiahontie 210, 41770 Leivonmäki",phone:"",ytunnus:"",lat:61.9179037,lng:26.1844808},
  {id:913,name:"Virtanen Juha",address:"Huoppilantie, 19650 Joutsa",phone:"",ytunnus:"",lat:61.6747816,lng:26.1024317},
  {id:914,name:"Virtanen Matti",address:"Riuttatie 5, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7340191,lng:26.123067},
  {id:915,name:"Virtaniemen tiekunta / Linkola Seppo",address:"Rengaskatu 38, 15610 Lahti",phone:"",ytunnus:"",lat:60.947821,lng:25.6690063},
  {id:916,name:"VRJ Etelä-Suomi",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:917,name:"VS-Welding oy / Ville Sahuri",address:"Vastuskatu 9, 15680 Lahti",phone:"",ytunnus:"",lat:60.9307487,lng:25.6684419},
  {id:918,name:"Vuorelantie thk",address:"Vekkeli Arto",phone:"",ytunnus:"",lat:null,lng:null},
  {id:919,name:"Vuorenmaa Pirkko",address:"Etelämyllyntie 90, 19650 Joutsa",phone:"",ytunnus:"",lat:null,lng:null},
  {id:920,name:"Vääräjärventien thk",address:"Hauhanpohjantie 99, 19910 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:921,name:"Woodlark oy",address:"Kiviniementie 1, 51200 Kangasniemi",phone:"",ytunnus:"",lat:62.00144,lng:26.6565156},
  {id:922,name:"Yellou Racing Team ry",address:"Jalmarinpolku 3, 40950 Muurame",phone:"",ytunnus:"",lat:62.1240464,lng:25.6700096},
  {id:923,name:"Yit Infra oy",address:"PL 476, 00026 BASWARE",phone:"",ytunnus:"",lat:null,lng:null},
  {id:924,name:"YIT Rakennus oy",address:"PL 36, 00621 Helsinki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:925,name:"YIT Rakennus Oy Infrapalvelut",address:"PL 36, 00621 Helsinki",phone:"",ytunnus:"",lat:null,lng:null},
  {id:926,name:"YIT Suomi oy Rakennus",address:"",phone:"",ytunnus:"",lat:null,lng:null},
  {id:927,name:"YIT Teollisuus Oy",address:"PL 1098, 00026 BASWARE",phone:"",ytunnus:"",lat:null,lng:null},
  {id:928,name:"Ylä Taipaleentiekunta",address:"Riuttatie 3, 19650 Joutsa",phone:"",ytunnus:"",lat:61.7340191,lng:26.123067},
  {id:929,name:"Ylävarmantien Hoitokunta",address:"Ylävarmantie 103, 19950 Luhanka",phone:"",ytunnus:"",lat:null,lng:null},
  {id:930,name:"Ylävarmantien hoitokunta / Ahti Veijo",address:"Ylävarmantie, 19950 Tammijärvi",phone:"",ytunnus:"",lat:null,lng:null},
  {id:931,name:"Ylönen Tuulia",address:"Taulutie 1-3 a 4, 00680 Helsinki",phone:"",ytunnus:"",lat:60.2463095,lng:24.9510211}
]);
  const [deliveries, setDel]    = useStore("km3_deliveries", [
    // Rakennus Oy Virtanen (id:1) — KaM 0-16
    { id:101, date:"2026-01-08", customerId:1, material:"kam_0_16", tons:20.2, unitPrice:24.50, note:"Pilkanranta", invoiced:true },
    { id:102, date:"2026-01-22", customerId:1, material:"kam_0_16", tons:20.8, unitPrice:24.50, note:"Pilkanranta", invoiced:true },
    { id:103, date:"2026-02-05", customerId:1, material:"kam_0_16", tons:41.0, unitPrice:24.50, note:"Pilkanranta", invoiced:true },
    { id:104, date:"2026-02-19", customerId:1, material:"kam_0_16", tons:20.4, unitPrice:25.00, note:"Pilkanranta", invoiced:true },
    { id:105, date:"2026-03-04", customerId:1, material:"kam_0_16", tons:20.1, unitPrice:25.00, note:"Pilkanranta", invoiced:true },
    { id:106, date:"2026-03-18", customerId:1, material:"kam_0_16", tons:40.5, unitPrice:25.00, note:"Pilkanranta", invoiced:false },
    // Rakennus Oy Virtanen — KaM 0-32
    { id:111, date:"2025-11-12", customerId:1, material:"kam_0_32", tons:20.3, unitPrice:22.80, note:"Pilkanranta", invoiced:true },
    { id:112, date:"2026-01-15", customerId:1, material:"kam_0_32", tons:40.6, unitPrice:22.80, note:"Pilkanranta", invoiced:true },
    { id:113, date:"2026-02-28", customerId:1, material:"kam_0_32", tons:20.2, unitPrice:23.20, note:"Pilkanranta", invoiced:true },
    // Rakennus Oy Virtanen — Sepeli 5-16
    { id:121, date:"2025-10-03", customerId:1, material:"sep_5_16", tons:20.1, unitPrice:29.50, note:"Pilkanranta", invoiced:true },
    { id:122, date:"2025-12-10", customerId:1, material:"sep_5_16", tons:20.4, unitPrice:29.50, note:"Pilkanranta", invoiced:true },
    { id:123, date:"2026-02-14", customerId:1, material:"sep_5_16", tons:20.0, unitPrice:30.00, note:"Pilkanranta", invoiced:true },
    // Maansiirto Korhonen (id:2) — KaM 0-16
    { id:201, date:"2025-10-14", customerId:2, material:"kam_0_16", tons:20.5, unitPrice:14.20, note:"Joutsa", invoiced:true },
    { id:202, date:"2025-11-03", customerId:2, material:"kam_0_16", tons:40.8, unitPrice:14.20, note:"Joutsa", invoiced:true },
    { id:203, date:"2025-12-01", customerId:2, material:"kam_0_16", tons:20.2, unitPrice:14.50, note:"Joutsa", invoiced:true },
    { id:204, date:"2026-01-20", customerId:2, material:"kam_0_16", tons:20.6, unitPrice:14.50, note:"Joutsa", invoiced:true },
    { id:205, date:"2026-02-10", customerId:2, material:"kam_0_16", tons:41.1, unitPrice:14.50, note:"Joutsa", invoiced:true },
    { id:206, date:"2026-03-05", customerId:2, material:"kam_0_16", tons:20.3, unitPrice:15.00, note:"Joutsa", invoiced:false },
    // Maansiirto Korhonen — KaM 0-56
    { id:211, date:"2025-09-18", customerId:2, material:"kam_0_56", tons:40.2, unitPrice:11.50, note:"Joutsa", invoiced:true },
    { id:212, date:"2025-11-25", customerId:2, material:"kam_0_56", tons:40.7, unitPrice:11.50, note:"Joutsa", invoiced:true },
    { id:213, date:"2026-01-08", customerId:2, material:"kam_0_56", tons:20.1, unitPrice:12.00, note:"Joutsa", invoiced:true },
    // Maansiirto Korhonen — Kivituhka
    { id:221, date:"2025-10-28", customerId:2, material:"kivituhka", tons:20.4, unitPrice:9.80, note:"Joutsa", invoiced:true },
    { id:222, date:"2026-02-03", customerId:2, material:"kivituhka", tons:40.5, unitPrice:9.80, note:"Joutsa", invoiced:true },
  ]);
  const [invoices, setInv]      = useStore("km3_invoices", []);
  const [orders,   setOrders]   = useStore("km3_orders",   []);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanOrderId, setScanOrderId] = useState(null);
  const openScan = (open, orderId=null) => { setScanOpen(open); setScanOrderId(open ? orderId : null); };
  const [preselectedMaterial, setPreselectedMaterial] = useState(null);

  const TABS = [
    { id:"varasto",   icon:"▦", label:"Varasto"   },
    { id:"tilaukset", icon:"◈", label:"Tilaukset" },
    { id:"tuotanto",  icon:"⚙", label:"Tuotanto"  },
    { id:"laskut",    icon:"◻", label:"Laskut"    },
    { id:"asiakkaat", icon:"◉", label:"Asiakkaat" },
    { id:"hinnat",    icon:"⊛", label:"Hinnat"    },
    { id:"asetukset", icon:"⚙", label:"Asetukset" },
  ];

  const pendingCount = 0; // kuormat-välilehti poistettu
  const openOrdersCount = orders.filter(o => ["aloittamatta","kesken","kuljetuksessa"].includes(o.status)).length;
  const totalStockVal = Object.entries(stock).reduce((s,[k,t]) => s + t*(prices[k]||0), 0);
  const shared = { prices, setPrices, thresholds, setThresh, locations, setLocs, prodLocs, setProdLocs, purchCosts, setPurchCosts, batches, setBatches, stock, setStock, customers, setCust, deliveries, setDel, invoices, setInv, orders, setOrders };

  return (
    <div style={{ background:BG, minHeight:"100vh", color:TEXT, fontFamily:"'Rajdhani',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:#333;}
        input,select,textarea,button{font-family:inherit;}
        .tap{transition:opacity .1s,transform .1s;border:none;cursor:pointer;}
        .tap:active{opacity:.7;transform:scale(.97);}
        input:focus,select:focus{outline:none;border-color:#FFC107!important;box-shadow:0 0 0 2px #FFC10722;}
        @keyframes su{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .su{animation:su .2s ease-out;}
        .mob{display:flex;}
        .desk{display:none;}
        .deskwrap{display:block;}
        @media(min-width:768px){
          .mob{display:none!important;}
          .desk{display:flex;}
          .deskwrap{display:flex!important;}
          .pad{padding:26px!important;}
          .botbar{display:none!important;}
        }
        @media(max-width:767px){
          .pad{padding:13px 13px 130px!important;}
        }
      `}</style>

      <div className="deskwrap" style={{ minHeight:"100vh" }}>
        <div className="desk" style={{ width:210, background:CARD, borderRight:`1px solid ${BORDER}`, position:"fixed", top:0, left:0, height:"100vh", flexDirection:"column", zIndex:50, overflowY:"auto", display: page==="home" ? "none" : undefined }}>
          <div style={{ padding:"10px 15px 8px", borderBottom:`1px solid ${BORDER}` }}>
            <div style={{padding:"4px 0"}}><div style={{fontFamily:"'Bebas Neue'",fontSize:32,letterSpacing:3,color:"#FFC107",lineHeight:1}}>KASA</div><div style={{fontFamily:"'Bebas Neue'",fontSize:28,letterSpacing:3,color:"#C8C8C8",lineHeight:1}}>MASTER</div></div>
          </div>
          <div style={{ padding:"11px 15px", borderBottom:`1px solid ${BORDER}` }}>
            <div style={{ fontSize:15, letterSpacing:2, color:Y, fontWeight:700, marginBottom:7 }}>VARASTO LIVE</div>
            {Object.entries(MATS).map(([k,m]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:15 }}>
                <span style={{ color:MUTED }}>{m.short}</span>
                <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:(stock[k]||0)<=shared.thresholds?.red?RED:(stock[k]||0)>=shared.thresholds?.green?GREEN:TEXT }}>{fTon(stock[k]||0)}</span>
              </div>
            ))}
            <div style={{ marginTop:9, paddingTop:7, borderTop:`1px solid ${BORDER}`, display:"flex", justifyContent:"space-between", fontSize:15 }}>
              <span style={{ color:MUTED }}>Kokonaisarvo</span>
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:Y, fontWeight:600 }}>{fEur(totalStockVal)}</span>
            </div>
          </div>
          <nav style={{ padding:"7px 0", flex:1 }}>
            {TABS.map(t => (
              <button key={t.id} className="tap" onClick={() => setPage(t.id)} style={{ width:"100%", display:"flex", alignItems:"center", gap:9, padding:"11px 15px", background:page===t.id?Y:"transparent", color:page===t.id?"#000":MUTED, fontWeight:700, fontSize:15, letterSpacing:.5, textAlign:"left", position:"relative" }}>
                <span style={{ fontSize:15 }}>{t.icon}</span>{t.label}
                {t.id==="kuormat"&&pendingCount>0&&<span style={{ marginLeft:"auto", background:RED, color:"#fff", borderRadius:10, padding:"0 6px", fontSize:15 }}>{pendingCount}</span>}
                {t.id==="tilaukset"&&openOrdersCount>0&&<span style={{ marginLeft:"auto", background:Y, color:"#000", borderRadius:10, padding:"0 6px", fontSize:15 }}>{openOrdersCount}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding:"11px 15px", borderTop:`1px solid ${BORDER}` }}>
            <button className="tap" onClick={() => openScan(true)} style={{ width:"100%", padding:"11px", background:Y, borderRadius:8, color:"#000", fontWeight:700, fontSize:15, letterSpacing:.5, display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              📷 SKANNAA VAAKA
            </button>
          </div>
        </div>

        {page!=="home" && <div className="mob" style={{ background:CARD, borderBottom:`2px solid ${Y}`, padding:"10px 13px", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:100 }}>
          <div className="tap" onClick={()=>{setPage("tilaukset"); setPreselectedMaterial(null); setNavKey(k=>k+1);}} style={{lineHeight:1}}>
            <img src="/logo.png" alt="Kasamaster" style={{height:44,width:"auto",objectFit:"contain",display:"block"}} />
          </div>
          <div style={{position:"relative"}}>
            <button className="tap" onClick={()=>setMenuOpen(o=>!o)} style={{padding:"8px 12px",background:menuOpen?Y:CARD,border:`2px solid ${menuOpen?Y:BORDER}`,borderRadius:10,color:menuOpen?"#000":MUTED,fontWeight:700,fontSize:20,lineHeight:1,position:"relative"}}>
              ☰
              {openOrdersCount>0&&<span style={{position:"absolute",top:-6,right:-6,background:Y,color:"#000",borderRadius:10,padding:"0 5px",fontSize:13,fontWeight:700}}>{openOrdersCount}</span>}
            </button>
            {menuOpen&&(
              <>
                <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:299}} />
                <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",background:CARD,border:`2px solid ${Y}`,borderRadius:14,padding:8,zIndex:300,minWidth:180,boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
                  {TABS.map(t=>(
                    <button key={t.id} className="tap" onClick={()=>{setPage(t.id);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"12px 16px",background:page===t.id?`${Y}18`:"transparent",border:"none",borderRadius:9,color:page===t.id?Y:TEXT,fontWeight:700,fontSize:16,textAlign:"left",position:"relative"}}>
                      <span style={{fontSize:20}}>{t.icon}</span>
                      <span>{t.label}</span>
                      {t.id==="tilaukset"&&openOrdersCount>0&&<span style={{marginLeft:"auto",background:Y,color:"#000",borderRadius:10,padding:"1px 8px",fontSize:13,fontWeight:700}}>{openOrdersCount}</span>}
                    </button>
                  ))}
                  <div style={{borderTop:`1px solid ${BORDER}`,margin:"6px 0"}} />
                  <button className="tap" onClick={()=>{setTimelogOpen(true);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"12px 16px",background:clockedIn?`#4CAF5022`:"transparent",border:"none",borderRadius:9,color:clockedIn?"#4CAF50":TEXT,fontWeight:700,fontSize:16,textAlign:"left"}}>
                    <span style={{fontSize:20}}>{clockedIn?"🟢":"⏱️"}</span>
                    <span>{clockedIn?"Töissä — leimaa ulos":"Tuntikirjaukset"}</span>
                    {clockedIn&&<span style={{marginLeft:"auto",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:"#4CAF50"}}>{fElapsed(elapsed)}</span>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>}
        <div className={page==="home" ? "" : "pad"} style={{ padding: page==="home"?"0":"26px", marginLeft:0 }} id="mc">
          <style>{`@media(min-width:768px){#mc{margin-left:${page==="home"?"0":"210px"};}}`}</style>
          {page==="home"      && <HomePage setPage={setPage} />}
          {page==="varasto"   && <VarastoPage   stock={shared.stock} prices={shared.prices} thresholds={shared.thresholds} locations={shared.locations} prodLocs={shared.prodLocs} batches={shared.batches} setPage={setPage} onOrderProduct={mat=>{ setPreselectedMaterial(mat); setPage("tilaukset"); }} />}
          {page==="tilaukset" && <TilauksetPage key={navKey} {...shared} setScanOpen={openScan} preselectedMaterial={preselectedMaterial} onClearPreselect={()=>setPreselectedMaterial(null)} />}
          {page==="laskut"    && <LaskutPage    {...shared} />}
          {page==="asiakkaat" && <AsiakkaatPage {...shared} />}
          {page==="tuotanto"  && <TuotantoPage  {...shared} />}
          {page==="hinnat"    && <HinnatPage    {...shared} customers={shared.customers} setCust={shared.setCust} />}
          {page==="asetukset" && <AsetuksetPage {...shared} customers={shared.customers} setCust={shared.setCust} />}
        </div>
      </div>

      {timelogOpen && <TimelogModal clockedIn={clockedIn} setClockedIn={v=>{
        setClockedIn(v);
        if(v) localStorage.setItem('km3_clocked_in', JSON.stringify(v));
        else localStorage.removeItem('km3_clocked_in');
      }} onClose={()=>setTimelogOpen(false)} />}
      {scanOpen && <ScanModal shared={shared} preOrderId={scanOrderId} onClose={() => openScan(false)} />}
    </div>
  );
}

// Searchable customer select
function CustomerSelect({ value, onChange, customers, style }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = customers.find(c => String(c.id) === String(value));

  const filtered = customers.filter(c =>
    !q || c.name?.toLowerCase().includes(q.toLowerCase()) ||
    c.phone?.includes(q) || c.address?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div style={{ position:"relative" }}>
      {open && (
        <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:498 }} />
      )}
      <button type="button" className="tap" onClick={()=>setOpen(o=>!o)} style={{ ...style, display:"flex", justifyContent:"space-between", alignItems:"center", textAlign:"left", cursor:"pointer", zIndex:499, position:"relative" }}>
        <span style={{ color: selected ? "#F5F0E8" : "#AAAAAA", fontSize:15, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {selected ? selected.name : "Valitse asiakas..."}
        </span>
        <span style={{ flexShrink:0, color:"#AAAAAA", fontSize:15, marginLeft:6 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#1E1E1E", border:`1px solid #FFC107`, borderRadius:10, zIndex:500, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,.6)" }}>
          <div style={{ padding:"8px 10px", borderBottom:`1px solid #333` }}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Hae asiakasta..." style={{ width:"100%", padding:"8px 10px", background:"#111", border:`1px solid #333`, borderRadius:7, color:"#F5F0E8", fontSize:15 }} />
          </div>
          <div style={{ maxHeight:220, overflowY:"auto" }}>
            {filtered.length===0 && <div style={{ padding:"12px 14px", color:"#AAAAAA", fontSize:15 }}>Ei tuloksia</div>}
            {filtered.map(c => (
              <button key={c.id} type="button" className="tap" onClick={()=>{ onChange(String(c.id)); setOpen(false); setQ(""); }}
                style={{ width:"100%", padding:"11px 14px", background: String(c.id)===String(value)?"#FFC10722":"transparent", border:"none", textAlign:"left", cursor:"pointer", borderBottom:`1px solid #2a2a2a` }}>
                <div style={{ fontWeight:700, fontSize:15, color:"#F5F0E8" }}>{c.name}</div>
                {c.address && <div style={{ fontSize:15, color:"#AAAAAA", marginTop:1 }}>{c.address}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ETUSIVU ──────────────────────────────────────────────────────────────────
function HomePage({ setPage }) {
  return (
    <div style={{
      minHeight:"100vh", background:BG, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"32px 24px",
    }}>
      <div style={{position:"relative", width:"100%", maxWidth:340}}>
        <img src="/hero.jpg" style={{width:"100%",borderRadius:16,display:"block"}} alt="Kasamaster" />
        {/* Buttons overlaid on bottom of logo */}
        <div style={{position:"absolute",bottom:12,left:12,right:12,display:"flex",gap:8}}>
          <button className="tap" onClick={() => setPage("tilaukset")} style={{flex:1,padding:"12px 0",background:"rgba(255,193,7,0.93)",borderRadius:10,color:"#000",fontWeight:700,fontSize:18,letterSpacing:2,fontFamily:"'Bebas Neue'",boxShadow:`0 4px 20px rgba(255,193,7,0.6)`}}>
            ◈ TILAUKSET
          </button>
          <button className="tap" onClick={() => setPage("varasto")} style={{flex:1,padding:"12px 0",background:"rgba(255,193,7,0.93)",borderRadius:10,color:"#000",fontWeight:700,fontSize:18,letterSpacing:2,fontFamily:"'Bebas Neue'",boxShadow:`0 4px 20px rgba(255,193,7,0.6)`}}>
            ▦ VARASTO
          </button>
        </div>
      </div>
    </div>
  );
}

function VarastoPage({ stock, prices, thresholds, locations, prodLocs, batches, setPage, onOrderProduct }) {
  const thr = thresholds || DEFAULT_THRESHOLDS;
  const trafficColor = tons => tons >= thr.green ? GREEN : tons <= thr.red ? RED : "#FF9500";
  const trafficIcon = tColor => (
    <div style={{ width:18, height:18, borderRadius:"50%", background:tColor, flexShrink:0, boxShadow:`0 0 6px ${tColor}88` }} />
  );
  const [mode, setMode] = useState("myynti");
  const [selected, setSelected] = useState(null); // key of selected product

  const cardPrice = key => {
    if (mode === "osto") {
      const c = getWeightedCost(batches, key);
      return c !== null ? c : null;
    }
    return prices[key] || 0;
  };

  const totalVal = Object.entries(stock).reduce((s,[k,t]) => {
    const p = cardPrice(k);
    return p !== null ? s + t * p : s;
  }, 0);

  const low = Object.entries(stock).filter(([,t]) => t<=thr.red);
  const maxT = Math.max(...Object.values(stock), 1);
  const cats = {};
  Object.entries(MATS).forEach(([k,m]) => { if(!cats[m.cat]) cats[m.cat]=[]; cats[m.cat].push([k,m]); });

  // Product detail modal
  const selMat = selected ? MATS[selected] : null;
  const selTons = selected ? (stock[selected]||0) : 0;
  const selTColor = selected ? trafficColor(selTons) : Y;
  const selOsto = selected ? getWeightedCost(batches, selected) : null;
  const selMyynti = selected ? (prices[selected]||0) : 0;
  const selLoc = selected && prodLocs?.[selected] ? (locations||[]).find(l=>l.id===prodLocs[selected]) : null;

  return (
    <div className="su">
      {selected && selMat && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setSelected(null)}>
          <div className="su" style={{background:CARD,border:`2px solid ${selTColor}`,borderRadius:"18px 18px 0 0",padding:"22px 20px 36px",width:"100%",maxWidth:520}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:BORDER,borderRadius:2,margin:"0 auto 18px"}} />
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div>
                <div style={{fontSize:28,marginBottom:4}}>{selMat.emoji}</div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:26,letterSpacing:1.5,lineHeight:1}}>{selMat.label}</div>
                <div style={{fontSize:15,color:MUTED,marginTop:4}}>{selMat.cat}</div>
              </div>
              {trafficIcon(selTColor)}
            </div>

            <div style={{background:BG,borderRadius:12,padding:"16px 18px",marginBottom:14}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:52,color:selTColor,letterSpacing:2,lineHeight:1}}>
                {Number(selTons).toFixed(1).replace(".",",")}
              </div>
              <div style={{fontSize:15,color:MUTED}}>tonnia varastossa</div>
              <div style={{height:5,background:"#333",borderRadius:3,overflow:"hidden",marginTop:10}}>
                <div style={{width:`${Math.min(100,(selTons/Math.max(...Object.values(stock),1))*100)}%`,height:"100%",background:selTColor,borderRadius:3,transition:"width .5s"}} />
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              <div style={{background:BG,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:15,color:MUTED,marginBottom:3}}>Myyntihinta</div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:18,color:Y,fontWeight:700}}>{fEur(selMyynti)}/t</div>
              </div>
              <div style={{background:BG,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:15,color:MUTED,marginBottom:3}}>Ostohinta (FIFO)</div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:18,color:selOsto!==null?TEXT:MUTED,fontWeight:700}}>
                  {selOsto!==null ? fEur(selOsto)+"/t" : "—"}
                </div>
              </div>
              {selOsto!==null && (
                <div style={{background:BG,borderRadius:10,padding:"12px 14px",gridColumn:"span 2"}}>
                  <div style={{fontSize:15,color:MUTED,marginBottom:3}}>Kate</div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:18,color:selMyynti-selOsto>=0?GREEN:RED,fontWeight:700}}>
                    {selMyynti-selOsto>=0?"+":""}{fEur(selMyynti-selOsto)}/t
                  </div>
                </div>
              )}
              {selLoc && (
                <div style={{background:BG,borderRadius:10,padding:"12px 14px",gridColumn:"span 2"}}>
                  <div style={{fontSize:15,color:MUTED,marginBottom:3}}>📍 Sijainti</div>
                  <div style={{fontSize:15,fontWeight:700}}>{selLoc.name}</div>
                  <div style={{fontSize:15,color:MUTED}}>{selLoc.address}</div>
                </div>
              )}
            </div>

            <div style={{background:`${Y}15`,border:`1px solid ${Y}44`,borderRadius:11,padding:"14px 16px",marginBottom:14,textAlign:"center"}}>
              <div style={{fontSize:15,color:MUTED,marginBottom:10}}>Tehdäänkö tilaus tästä tuotteesta?</div>
              <button className="tap" onClick={()=>{ setSelected(null); if(onOrderProduct) onOrderProduct(selected); }} style={{width:"100%",padding:"14px",background:Y,borderRadius:10,color:"#000",fontWeight:700,fontSize:16,letterSpacing:.5}}>
                ◈ TEES TILAUS — {selMat.short}
              </button>
            </div>

            <button className="tap" onClick={()=>setSelected(null)} style={{width:"100%",padding:"11px",background:"transparent",border:`1px solid ${BORDER}`,borderRadius:10,color:MUTED,fontSize:15}}>Sulje</button>
          </div>
        </div>
      )}
      <div style={{ background:`linear-gradient(135deg,${CARD2},${CARD})`, border:`1px solid ${Y}44`, borderRadius:14, padding:"17px 19px", marginBottom:12, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-25, right:-25, width:110, height:110, background:`${Y}07`, borderRadius:"50%", border:`2px solid ${Y}18` }} />
        <div style={{ fontSize:15, letterSpacing:2.5, color:Y, fontWeight:700, marginBottom:2 }}>
          VARASTON KOKONAISARVO — {mode==="myynti" ? "MYYNTIHINNOIN" : "OSTOHINNOIN"}
        </div>
        <div style={{ fontFamily:"'Bebas Neue'", fontSize:"clamp(30px,7vw,48px)", color:Y, letterSpacing:2, lineHeight:1.1 }}>{fEur(totalVal)}</div>
        {low.length>0 && <div style={{ marginTop:7, color:RED, fontSize:15, fontWeight:700 }}>⚠ MATALA: {low.map(([k])=>MATS[k].short).join(", ")}</div>}
      </div>
      <div style={{ display:"flex", background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:3, marginBottom:14, gap:3 }}>
        {[["myynti","💰 Myyntihinta"],["osto","📦 Ostohinta"]].map(([v,lbl])=> (
          <button key={v} className="tap" onClick={()=>setMode(v)} style={{
            flex:1, padding:"9px 0", borderRadius:8, border:"none",
            background: mode===v ? Y : "transparent",
            color: mode===v ? "#000" : MUTED,
            fontWeight:700, fontSize:15, letterSpacing:.5,
          }}>{lbl}</button>
        ))}
      </div>
      {Object.entries(cats).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom:18 }}>
          <div style={{ fontSize:15, letterSpacing:2.5, color:Y, fontWeight:700, marginBottom:9 }}>{cat.toUpperCase()}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {items.map(([key, mat]) => {
              const tons = stock[key]||0;
              const tColor = trafficColor(tons);
              const tIcon  = trafficIcon(tColor);
              const ostohinta = getWeightedCost(batches, key);
              const myyntihinta = prices[key]||0;
              const shownPrice = mode==="osto" ? ostohinta : myyntihinta;
              const margin = ostohinta !== null ? myyntihinta - ostohinta : null;
              return (
                <div key={key} className="tap" onClick={()=>setSelected(key)} style={{ background:CARD, border:`1px solid ${tColor}55`, borderRadius:12, overflow:"hidden", cursor:"pointer" }}>
                  <div style={{ height:3, background:tColor }} />
                  <div style={{ padding:"13px 15px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, alignItems:"flex-start" }}>
                      <div style={{ fontFamily:"'Bebas Neue'", fontSize:"clamp(18px,4vw,22px)", letterSpacing:1, lineHeight:1.1, color:TEXT }}>{mat.label}</div>
                      {tIcon}
                    </div>
                    <div style={{ fontFamily:"'Bebas Neue'", fontSize:"clamp(28px,7vw,40px)", color:tColor, letterSpacing:1.5, lineHeight:1, marginBottom:2 }}>
                      {Number(tons).toFixed(1).replace(".",",")}
                    </div>
                    <div style={{ fontSize:15, color:MUTED, marginBottom:4 }}>tonnia</div>
                    {shownPrice !== null && (
                      <div style={{ fontSize:15, color:Y, fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>
                        {fEur(shownPrice)}/t
                      </div>
                    )}
                    {margin !== null && (
                      <div style={{ fontSize:15, color: margin>=0?GREEN:RED, fontWeight:700, marginBottom:4 }}>
                        Kate {margin>=0?"+":""}{fEur(margin)}/t
                      </div>
                    )}
                    {prodLocs&&prodLocs[key]&&(locations||[]).find(l=>l.id===prodLocs[key])&&(
                      <div style={{ fontSize:15, color:MUTED, marginBottom:4, letterSpacing:.5 }}>
                        📍 {(locations||[]).find(l=>l.id===prodLocs[key])?.name}
                      </div>
                    )}
                    <div style={{ height:3, background:"#333", borderRadius:2, overflow:"hidden" }}>
                      <div style={{ width:`${Math.min(100,(tons/maxT)*100)}%`, height:"100%", background:tColor, borderRadius:2, transition:"width .5s" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function KuormatPage({ deliveries, setDel, customers, prices, stock, setStock, batches, setBatches, setScanOpen }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ date:nowDate(), customerId:"", material:"kam_0_16", tons:"", note:"" });

  const add = () => {
    const tons = parseFloat(form.tons);
    if (!form.customerId||isNaN(tons)||tons<=0) return;
    setDel(ds => [...ds, { ...form, id:newId(), customerId:parseInt(form.customerId), tons, invoiced:false }]);
    setStock(s => ({ ...s, [form.material]:Math.max(0,(s[form.material]||0)-tons) }));
    if (setBatches) setBatches(bs => consumeFIFO(bs, form.material, tons));
    setForm({ date:nowDate(), customerId:"", material:"kam_0_16", tons:"", note:"" });
    setShowForm(false);
  };
  const del = id => {
    const d = deliveries.find(x=>x.id===id);
    if (!d||d.invoiced) return;
    setDel(ds=>ds.filter(x=>x.id!==id));
    setStock(s=>({...s,[d.material]:(s[d.material]||0)+d.tons}));
  };

  const filtered = [...deliveries].filter(d => filter==="all"?true:filter==="pending"?!d.invoiced:d.invoiced).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const IS = { width:"100%", padding:"10px 12px", background:BG, border:`1px solid ${BORDER}`, borderRadius:9, color:TEXT, fontSize:15 };
  const LS = {...LS_BASE};

  return (
    <div className="su">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:13, flexWrap:"wrap", gap:9 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:26, letterSpacing:2 }}>KUORMAKIRJAT</div>
          <div style={{ color:MUTED, fontSize:15 }}>{deliveries.filter(d=>!d.invoiced).length} laskuttamatta</div>
        </div>
        <div style={{ display:"flex", gap:7 }}>
          <button className="tap" onClick={() => openScan(true)} style={{ padding:"9px 13px", background:CARD2, border:`1px solid ${Y}`, borderRadius:9, color:Y, fontWeight:700, fontSize:15 }}>📷</button>
          <button className="tap" onClick={() => setShowForm(!showForm)} style={{ padding:"9px 17px", background:Y, borderRadius:9, color:"#000", fontWeight:700, fontSize:15 }}>+ UUSI</button>
        </div>
      </div>

      {showForm && (
        <div style={{ background:CARD, border:`1px solid ${Y}`, borderRadius:13, padding:17, marginBottom:13 }}>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:19, letterSpacing:2, color:Y, marginBottom:12 }}>UUSI KUORMAKIRJA</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:10, marginBottom:10 }}>
            <div><label style={LS}>PÄIVÄMÄÄRÄ</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={IS} /></div>
            <div><label style={LS}>ASIAKAS</label>
              <select value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value}))} style={IS}>
                <option value="">Valitse...</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label style={LS}>TUOTE</label>
              <select value={form.material} onChange={e=>setForm(f=>({...f,material:e.target.value}))} style={IS}>
                <MatOptions stock={stock} />
              </select>
            </div>
            <div><label style={LS}>TONNIA</label><input type="number" value={form.tons} onChange={e=>setForm(f=>({...f,tons:e.target.value}))} placeholder="0,00" style={{ ...IS, fontFamily:"'IBM Plex Mono',monospace", fontSize:17, color:Y }} step="0.01" /></div>
            <div style={{ gridColumn:"span 2" }}><label style={LS}>TYÖMAA</label><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Kohde..." style={IS} /></div>
          </div>
          {form.tons&&form.material&&(
            <div style={{ padding:"8px 12px", background:BG, borderRadius:8, marginBottom:10, fontSize:15, borderLeft:`3px solid ${Y}` }}>
              💰 <strong style={{ color:Y }}>{fEur(parseFloat(form.tons||0)*(prices[form.material]||0))}</strong>
              <span style={{ color:MUTED, marginLeft:8 }}>Varasto jälkeen: {fTon(Math.max(0,(stock[form.material]||0)-parseFloat(form.tons||0)))}</span>
            </div>
          )}
          <div style={{ display:"flex", gap:7 }}>
            <button className="tap" onClick={add} style={{ padding:"11px 24px", background:Y, borderRadius:9, color:"#000", fontWeight:700, fontSize:15 }}>TALLENNA</button>
            <button className="tap" onClick={() => setShowForm(false)} style={{ padding:"11px 15px", background:"transparent", border:`1px solid ${BORDER}`, borderRadius:9, color:MUTED, fontSize:15 }}>Peru</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", gap:7, marginBottom:12, overflowX:"auto", paddingBottom:2 }}>
        {[["all","Kaikki"],["pending","Laskuttamatta"],["invoiced","Laskutettu"]].map(([v,lbl])=> (
          <button key={v} className="tap" onClick={() => setFilter(v)} style={{ padding:"7px 14px", background:filter===v?Y:CARD, border:`1px solid ${filter===v?Y:BORDER}`, borderRadius:8, color:filter===v?"#000":MUTED, fontWeight:700, fontSize:15, whiteSpace:"nowrap", flexShrink:0 }}>{lbl}</button>
        ))}
      </div>
      <div className="mob" style={{ flexDirection:"column", gap:9 }}>
        {filtered.length===0&&<div style={{ color:MUTED, padding:"24px 0", textAlign:"center" }}>Ei kuormakirjoja.</div>}
        {filtered.map(d => {
          const c=customers.find(x=>x.id===d.customerId);
          return (
            <div key={d.id} style={{ background:CARD, border:`1px solid ${d.invoiced?BORDER:Y+"44"}`, borderRadius:11, padding:13 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{c?.name||"—"}</div>
                  <div style={{ fontSize:15, color:MUTED }}>{fDate(d.date)} · {MATS[d.material]?.emoji} {MATS[d.material]?.label}</div>
                  {d.note&&<div style={{ fontSize:15, color:MUTED }}>📍 {d.note}</div>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:17, color:Y, fontWeight:600 }}>{fEur(d.tons*(prices[d.material]||0))}</div>
                  <div style={{ fontFamily:"monospace", fontSize:15, color:MUTED }}>{fTon(d.tons)}</div>
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:15, fontWeight:700, color:d.invoiced?GREEN:RED }}>{d.invoiced?"✓ LASKUTETTU":"⏳ ODOTTAA"}</span>
                {!d.invoiced&&<button className="tap" onClick={() => del(d.id)} style={{ padding:"4px 10px", background:"transparent", border:`1px solid ${RED}44`, borderRadius:7, color:RED, fontSize:15 }}>Poista</button>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="desk" style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, overflow:"hidden", flexDirection:"column" }}>
        <div style={{ display:"grid", gridTemplateColumns:"100px 1fr 170px 85px 115px 110px 65px", padding:"9px 15px", background:CARD2, fontSize:15, letterSpacing:2, color:MUTED, fontWeight:700 }}>
          <span>PVM</span><span>ASIAKAS</span><span>TUOTE</span><span>TONNIA</span><span>ARVO</span><span>TILA</span><span></span>
        </div>
        {filtered.map(d => {
          const c=customers.find(x=>x.id===d.customerId);
          return (
            <div key={d.id} style={{ display:"grid", gridTemplateColumns:"100px 1fr 170px 85px 115px 110px 65px", padding:"11px 15px", borderBottom:`1px solid ${BORDER}`, alignItems:"center" }}
              onMouseEnter={e=>e.currentTarget.style.background=CARD2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{ fontFamily:"monospace", fontSize:15, color:MUTED }}>{fDate(d.date)}</span>
              <div><div style={{ fontWeight:600, fontSize:15 }}>{c?.name||"—"}</div>{d.note&&<div style={{ fontSize:15, color:MUTED }}>{d.note}</div>}</div>
              <span style={{ fontSize:15 }}>{MATS[d.material]?.emoji} {MATS[d.material]?.label}</span>
              <span style={{ fontFamily:"monospace", fontSize:15 }}>{fTon(d.tons)}</span>
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:15, color:Y, fontWeight:600 }}>{fEur(d.tons*(prices[d.material]||0))}</span>
              <span style={{ fontSize:15, fontWeight:700, color:d.invoiced?GREEN:RED }}>{d.invoiced?"✓ LASKUTETTU":"⏳ ODOTTAA"}</span>
              {!d.invoiced&&<button className="tap" onClick={() => del(d.id)} style={{ padding:"4px 9px", background:"transparent", border:`1px solid ${RED}44`, borderRadius:6, color:RED, fontSize:15 }}>Poista</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LaskutPage({ invoices, setInv, deliveries, setDel, customers, prices }) {
  const [step, setStep] = useState("list");
  const [selCust, setSelCust] = useState("");
  const [selDels, setSelDels] = useState([]);
  const [due, setDue] = useState(() => { const d=new Date(); d.setDate(d.getDate()+14); return d.toISOString().split("T")[0]; });
  const [viewInv, setViewInv] = useState(null);
  const [vatMode, setVatMode] = useState("25.5"); // "25.5" | "24" | "0" (käänteinen ALV)

  const pending = customers.map(c => {
    const ds=deliveries.filter(d=>d.customerId===c.id&&!d.invoiced);
    return { c, ds, total:ds.reduce((s,d)=>s+d.tons*(prices[d.material]||0),0) };
  }).filter(x=>x.ds.length>0);

  const create = () => {
    if (!selCust||!selDels.length) return;
    const c=customers.find(x=>x.id===parseInt(selCust));
    const ds=deliveries.filter(d=>selDels.includes(d.id));
    const rows=ds.map(d=>({...d,unitPrice:prices[d.material]||0,total:d.tons*(prices[d.material]||0),vatpercent:parseFloat(vatMode),reverseVat:vatMode==="0"}));
    const sub=rows.reduce((s,r)=>s+r.total,0);
    const vatRate = vatMode==="0" ? 0 : parseFloat(vatMode)/100;
    const vat=sub*vatRate;
    const inv={ id:newId(), number:`KM-${new Date().getFullYear()}-${String(invoices.length+1).padStart(3,"0")}`, date:nowDate(), dueDate:due, customer:c, rows, subtotal:sub, vat, total:sub+vat, paid:false, vatMode, fennoa_id:null };
    setInv(i=>[...i,inv]);
    setDel(ds=>ds.map(d=>selDels.includes(d.id)?{...d,invoiced:true}:d));
    setStep("list"); setSelCust(""); setSelDels([]);
    setViewInv(inv);
  };

  if (viewInv) return <InvView inv={viewInv} onBack={()=>setViewInv(null)} onPaid={()=>{setInv(is=>is.map(i=>i.id===viewInv.id?{...i,paid:true}:i));setViewInv({...viewInv,paid:true});}} onFennoaSent={id=>{setInv(is=>is.map(i=>i.id===viewInv.id?{...i,fennoa_id:id}:i));setViewInv({...viewInv,fennoa_id:id});}} />;

  return (
    <div className="su">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:13, flexWrap:"wrap", gap:9 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:26, letterSpacing:2 }}>LASKUTUS</div>
          <div style={{ color:MUTED, fontSize:15 }}>Avoimet: {fEur(invoices.filter(i=>!i.paid).reduce((s,i)=>s+i.total,0))}</div>
        </div>
        {step==="list"&&pending.length>0&&<button className="tap" onClick={()=>setStep("create")} style={{ padding:"9px 19px", background:Y, borderRadius:9, color:"#000", fontWeight:700, fontSize:15 }}>+ LUO LASKU</button>}
      </div>

      {step==="create"&&(
        <div style={{ background:CARD, border:`1px solid ${Y}`, borderRadius:13, padding:17, marginBottom:14 }}>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:19, letterSpacing:2, color:Y, marginBottom:12 }}>UUSI LASKU</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            <div>
              <label style={{ fontSize:15, letterSpacing:2, color:Y, fontWeight:700, marginBottom:5, display:"block" }}>ASIAKAS</label>
              <select value={selCust} onChange={e=>{setSelCust(e.target.value);setSelDels([]);}} style={{ width:"100%", padding:"10px 12px", background:BG, border:`1px solid ${BORDER}`, borderRadius:9, color:TEXT, fontSize:15 }}>
                <option value="">Valitse...</option>{pending.map(x=><option key={x.c.id} value={x.c.id}>{x.c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:15, letterSpacing:2, color:Y, fontWeight:700, marginBottom:5, display:"block" }}>ERÄPÄIVÄ</label>
              <input type="date" value={due} onChange={e=>setDue(e.target.value)} style={{ width:"100%", padding:"10px 12px", background:BG, border:`1px solid ${BORDER}`, borderRadius:9, color:TEXT, fontSize:15 }} />
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{ fontSize:15, letterSpacing:2, color:Y, fontWeight:700, marginBottom:8, display:"block" }}>ALV</label>
            <div style={{display:"flex",gap:8}}>
              {[["25.5","25,5%"],["24","24%"],["0","0% Käänteinen ALV"]].map(([v,l])=>(
                <button key={v} className="tap" onClick={()=>setVatMode(v)}
                  style={{flex:1,padding:"10px 6px",background:vatMode===v?Y:CARD,border:`2px solid ${vatMode===v?Y:BORDER}`,borderRadius:9,color:vatMode===v?"#000":TEXT,fontWeight:700,fontSize:14}}>
                  {l}
                </button>
              ))}
            </div>
            {vatMode==="0"&&<div style={{fontSize:14,color:MUTED,marginTop:6}}>⚠️ Käänteinen ALV — ostaja tilittää ALV:n (rakennusala)</div>}
          </div>
          {selCust&&(()=>{
            const pb=pending.find(x=>x.c.id===parseInt(selCust)); if(!pb) return null;
            const sv=pb.ds.filter(d=>selDels.includes(d.id)).reduce((s,d)=>s+d.tons*(prices[d.material]||0),0);
            return (<div>
              <div style={{ fontSize:15, letterSpacing:2, color:MUTED, fontWeight:700, marginBottom:8 }}>VALITSE KUORMAT</div>
              {pb.ds.map(d=>{
                const ch=selDels.includes(d.id);
                return (
                  <div key={d.id} onClick={()=>setSelDels(s=>ch?s.filter(x=>x!==d.id):[...s,d.id])}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:ch?`${Y}15`:BG, border:`1px solid ${ch?Y:BORDER}`, borderRadius:9, marginBottom:6, cursor:"pointer", transition:"all .1s" }}>
                    <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${ch?Y:BORDER}`, background:ch?Y:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:"#000", flexShrink:0, fontWeight:700 }}>{ch?"✓":""}</div>
                    <div style={{ flex:1, fontSize:15 }}>{fDate(d.date)} · {MATS[d.material]?.emoji} {MATS[d.material]?.label} · <strong>{fTon(d.tons)}</strong></div>
                    <span style={{ fontFamily:"monospace", color:Y, fontSize:15, fontWeight:600 }}>{fEur(d.tons*(prices[d.material]||0))}</span>
                  </div>
                );
              })}
              {selDels.length>0&&<div style={{ padding:"10px 12px", background:`${Y}12`, border:`1px solid ${Y}33`, borderRadius:9, marginTop:6, fontSize:15 }}>
                Alv 0%: <strong style={{ color:Y }}>{fEur(sv)}</strong> + alv 25,5% = <strong style={{ color:Y }}>{fEur(sv*1.255)}</strong>
              </div>}
            </div>);
          })()}
          <div style={{ display:"flex", gap:7, marginTop:12 }}>
            <button className="tap" onClick={create} style={{ padding:"11px 22px", background:selDels.length?Y:BORDER, borderRadius:9, color:"#000", fontWeight:700, fontSize:15 }}>LUO LASKU</button>
            <button className="tap" onClick={()=>{setStep("list");setSelCust("");setSelDels([]);}} style={{ padding:"11px 15px", background:"transparent", border:`1px solid ${BORDER}`, borderRadius:9, color:MUTED, fontSize:15 }}>Peru</button>
          </div>
        </div>
      )}

      {pending.length>0&&(
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:15, letterSpacing:2, color:MUTED, fontWeight:700, marginBottom:8 }}>LASKUTTAMATTA</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:9 }}>
            {pending.map(x=>(
              <div key={x.c.id} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:11, padding:14 }}>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{x.c.name}</div>
                <div style={{ fontSize:15, color:MUTED, marginBottom:7 }}>{x.ds.length} kuormaa</div>
                <div style={{ fontFamily:"'Bebas Neue'", fontSize:24, color:Y, letterSpacing:1 }}>{fEur(x.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize:15, letterSpacing:2, color:MUTED, fontWeight:700, marginBottom:8 }}>LASKUT ({invoices.length})</div>
      {invoices.length===0&&<div style={{ color:MUTED, padding:"18px 0", textAlign:"center" }}>Ei laskuja vielä.</div>}
      <div className="mob" style={{ flexDirection:"column", gap:8 }}>
        {[...invoices].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(inv=>(
          <div key={inv.id} className="tap" onClick={()=>setViewInv(inv)} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:11, padding:13, cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontFamily:"monospace", fontSize:15, color:Y }}>{inv.number}</span>
              <span style={{ fontSize:15, fontWeight:700, color:inv.paid?GREEN:RED }}>{inv.paid?"✓ MAKSETTU":"AVOIN"}</span>
            </div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{inv.customer?.name}</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:15, color:MUTED }}>Erä: {fDate(inv.dueDate)}</span>
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:17, color:Y, fontWeight:600 }}>{fEur(inv.total)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="desk" style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, overflow:"hidden", flexDirection:"column" }}>
        <div style={{ display:"grid", gridTemplateColumns:"125px 1fr 100px 100px 120px 90px", padding:"9px 15px", background:CARD2, fontSize:15, letterSpacing:2, color:MUTED, fontWeight:700 }}>
          <span>NUMERO</span><span>ASIAKAS</span><span>PVM</span><span>ERÄPÄIVÄ</span><span>YHTEENSÄ</span><span>TILA</span>
        </div>
        {[...invoices].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(inv=>(
          <div key={inv.id} onClick={()=>setViewInv(inv)} style={{ display:"grid", gridTemplateColumns:"125px 1fr 100px 100px 120px 90px", padding:"11px 15px", borderBottom:`1px solid ${BORDER}`, alignItems:"center", cursor:"pointer" }}
            onMouseEnter={e=>e.currentTarget.style.background=CARD2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{ fontFamily:"monospace", fontSize:15, color:Y }}>{inv.number}</span>
            <span style={{ fontSize:15, fontWeight:600 }}>{inv.customer?.name}</span>
            <span style={{ fontFamily:"monospace", fontSize:15, color:MUTED }}>{fDate(inv.date)}</span>
            <span style={{ fontFamily:"monospace", fontSize:15, color:!inv.paid&&new Date(inv.dueDate)<new Date()?RED:MUTED }}>{fDate(inv.dueDate)}</span>
            <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:15, color:Y, fontWeight:600 }}>{fEur(inv.total)}</span>
            <span style={{ fontSize:15, fontWeight:700, color:inv.paid?GREEN:RED }}>{inv.paid?"✓ MAKSETTU":"AVOIN"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── VAAKALAPPU PDF GENERATION ─────────────────────────────────────────────────

async function autocropImage(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      let w = img.width, h = img.height;
      const scale = Math.min(1, MAX / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const sampleAvg = (x0, y0, sz) => {
        let r=0,g=0,b=0,n=0;
        for(let y=y0;y<y0+sz&&y<h;y++) for(let x=x0;x<x0+sz&&x<w;x++){
          const i=(y*w+x)*4; r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++;
        }
        return [r/n,g/n,b/n];
      };
      const corners=[sampleAvg(0,0,12),sampleAvg(w-12,0,12),sampleAvg(0,h-12,12),sampleAvg(w-12,h-12,12)];
      const bg=corners.reduce((a,c)=>[a[0]+c[0]/4,a[1]+c[1]/4,a[2]+c[2]/4],[0,0,0]);
      const isBg=(i,tol=45)=>{const dr=d[i]-bg[0],dg=d[i+1]-bg[1],db=d[i+2]-bg[2];return Math.sqrt(dr*dr+dg*dg+db*db)<tol;};
      let top=0,bottom=h-1,left=0,right=w-1;
      let found=false;
      for(let y=0;y<h&&!found;y++) for(let x=0;x<w;x++){if(!isBg((y*w+x)*4)){top=Math.max(0,y-8);found=true;break;}}
      found=false;
      for(let y=h-1;y>=0&&!found;y--) for(let x=0;x<w;x++){if(!isBg((y*w+x)*4)){bottom=Math.min(h-1,y+8);found=true;break;}}
      found=false;
      for(let x=0;x<w&&!found;x++) for(let y=0;y<h;y++){if(!isBg((y*w+x)*4)){left=Math.max(0,x-8);found=true;break;}}
      found=false;
      for(let x=w-1;x>=0&&!found;x--) for(let y=0;y<h;y++){if(!isBg((y*w+x)*4)){right=Math.min(w-1,x+8);found=true;break;}}
      const cw=right-left+1, ch=bottom-top+1;
      const out=document.createElement('canvas');
      out.width=cw; out.height=ch;
      out.getContext('2d').drawImage(cv,left,top,cw,ch,0,0,cw,ch);
      resolve(out.toDataURL('image/jpeg',0.88));
    };
    img.onerror=()=>resolve(dataUrl);
    img.src=dataUrl;
  });
}

async function openVaakalapuPrintWindow(rows, invoiceNumber, customerName) {
  // Collect rows that have images
  const withImages = (rows || []).filter(r => r.image);
  if (!withImages.length) return false;

  // Autocrop images
  const cropped = await Promise.all(withImages.map(r => autocropImage(r.image)));

  // Build 4-per-page HTML: scale tickets are always tall/narrow — 1 column, 4 rows per page
  const pages = [];
  for (let i = 0; i < cropped.length; i += 4) {
    pages.push(cropped.slice(i, i + 4).map((img, j) => {
      const e = withImages[i + j];
      const label = [
        e.date || '',
        e.tons ? `${e.tons} t` : '',
        e.material ? e.material.replace(/_/g,'-').toUpperCase() : '',
        e.note || ''
      ].filter(Boolean).join(' · ');
      return `
        <div class="ticket">
          <img src="${img}" />
          <div class="label">${label}</div>
        </div>`;
    }).join(''));
  }

  const totalPages = pages.length;
  const html = `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8"/>
<title>${invoiceNumber} – Punnituslaput</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;600;700&family=Barlow:wght@400;500&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; font-family:'Barlow',sans-serif; }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 0;
    page-break-after: always;
    display: flex;
    flex-direction: column;
  }
  .page:last-child { page-break-after: avoid; }

  .page-header {
    background: #111;
    padding: 10px 16px 8px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 3px solid #FFC107;
    flex-shrink: 0;
  }
  .brand { font-family:'Bebas Neue',sans-serif; font-size:22px; letter-spacing:3px; color:#FFC107; line-height:1; }
  .brand-sub { font-family:'Barlow Condensed',sans-serif; font-size:10px; letter-spacing:3px; color:#888; margin-top:2px; text-transform:uppercase; }
  .header-right { text-align:right; }
  .inv-num { font-family:'Bebas Neue',sans-serif; font-size:16px; letter-spacing:2px; color:#FFC107; }
  .cust-name { font-family:'Barlow Condensed',sans-serif; font-size:11px; color:#aaa; margin-top:1px; }
  .page-num { font-family:'Barlow',sans-serif; font-size:9px; color:#666; margin-top:3px; }

  .tickets-grid {
    flex: 1;
    display: grid;
    grid-template-rows: repeat(4, 1fr);
    gap: 3mm;
    padding: 4mm 8mm;
  }

  .ticket {
    display: flex;
    flex-direction: column;
    border: 0.5px solid #ddd;
    overflow: hidden;
    background: #fafafa;
  }

  .ticket img {
    width: 100%;
    flex: 1;
    object-fit: contain;
    object-position: center;
    display: block;
    background: #fff;
    min-height: 0;
  }

  .label {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 9px;
    font-weight: 600;
    color: #444;
    padding: 3px 6px;
    background: #f0f0f0;
    border-top: 1px solid #e0e0e0;
    letter-spacing: 0.3px;
    flex-shrink: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .page-footer {
    padding: 4px 16px;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .footer-text {
    font-family:'Barlow',sans-serif;
    font-size:8px;
    color:#bbb;
  }

  @media print {
    html, body { width:210mm; }
    .page { page-break-after: always; width:210mm; min-height:297mm; }
    .page:last-child { page-break-after: avoid; }
    @page { size: A4 portrait; margin: 0; }
  }
</style>
</head>
<body>
${pages.map((content, pi) => `
  <div class="page">
    <div class="page-header">
      <div>
        <div class="brand">KASAMASTER</div>
        <div class="brand-sub">Punnituslaput · Scale Tickets</div>
      </div>
      <div class="header-right">
        <div class="inv-num">${invoiceNumber}</div>
        <div class="cust-name">${customerName}</div>
        <div class="page-num">Sivu ${pi+1} / ${totalPages}</div>
      </div>
    </div>
    <div class="tickets-grid">
      ${content}
    </div>
    <div class="page-footer">
      <span class="footer-text">Kasamaster · Adepta Oy · kasamaster.fi</span>
      <span class="footer-text">Tulostettu ${new Date().toLocaleDateString('fi-FI')}</span>
    </div>
  </div>`).join('')}
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) { alert('Salli ponnahdusikkunat selaimessa ja yritä uudelleen.'); return false; }
  win.document.write(html);
  win.document.close();
  // Auto-trigger print after fonts load
  win.onload = () => setTimeout(() => win.print(), 600);
  return true;
}


function InvView({ inv, onBack, onPaid, onFennoaSent }) {
  const [fennoaStatus, setFennoaStatus] = useState(inv.fennoa_id ? 'sent' : null);
  const [fennoaLoading, setFennoaLoading] = useState(false);
  const [fennoaError, setFennoaError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const hasImages = (inv.rows || []).some(r => r.image);

  const downloadAttachmentPDF = async () => {
    setPdfLoading(true);
    try {
      const ok = await openVaakalapuPrintWindow(inv.rows || [], inv.number, inv.customer?.name || '');
      if (!ok) alert('Laskulla ei ole yhtään skannatun vaakalaput kuvaa.');
    } catch(e) {
      alert('Virhe: ' + e.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const sendToFennoa = async () => {
    setFennoaLoading(true);
    setFennoaError(null);
    const fennoaUser = localStorage.getItem('km_fennoa_user');
    const fennoaKey  = localStorage.getItem('km_fennoa_key');
    if (!fennoaUser || !fennoaKey) {
      setFennoaError('Fennoa-tunnukset puuttuvat — lisää ne Asetukset-välilehdelle');
      setFennoaLoading(false);
      return;
    }
    try {
      // Parse customer address
      const addrParts = inv.customer.address?.match(/^(.+?),\s*(\d{5})\s+(.+)$/) || [];
      const invoiceData = {
        customer: {
          name: inv.customer.name,
          address: addrParts[1] || inv.customer.address || '',
          postalcode: addrParts[2] || '',
          city: addrParts[3] || '',
          business_id: inv.customer.ytunnus || '',
          email: inv.customer.email || '',
        },
        invoice_date: inv.date,
        due_date: inv.dueDate,
        reference: inv.number,
        info: '',
        rows: inv.rows.map(row => ({
          name: MATS[row.material]?.label || row.material,
          description: row.note || '',
          price: row.unitPrice,
          quantity: row.deliveredTons || row.tons || 0,
          unit: 't',
          vatpercent: row.vatpercent || parseFloat(inv.vatMode || '25.5'),
          reverse_vat: row.reverseVat || inv.vatMode === '0',
        })),
      };

      const res = await fetch('/api/fennoa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_invoice', data: invoiceData, fennoa_user: fennoaUser, fennoa_key: fennoaKey }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Fennoa-virhe');

      const fennoaId = data.invoice_id;
      // Approve invoice
      await fetch('/api/fennoa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_invoice', data: { invoice_id: fennoaId }, fennoa_user: fennoaUser, fennoa_key: fennoaKey }),
      });

      setFennoaStatus('sent');
      if (onFennoaSent) onFennoaSent(fennoaId);
    } catch(e) {
      setFennoaError(e.message);
    } finally {
      setFennoaLoading(false);
    }
  };

  return (
    <div className="su">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:7 }}>
        <button className="tap" onClick={onBack} style={{ padding:"8px 15px", background:CARD, border:`1px solid ${BORDER}`, borderRadius:9, color:MUTED, fontSize:15 }}>Takaisin</button>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
          {!inv.paid&&<button className="tap" onClick={onPaid} style={{ padding:"9px 17px", background:GREEN, borderRadius:9, color:"#fff", fontWeight:700, fontSize:15 }}>✓ Maksettu</button>}
          <button className="tap" onClick={()=>window.print()} style={{ padding:"9px 15px", background:CARD2, border:`1px solid ${BORDER}`, borderRadius:9, color:TEXT, fontWeight:600, fontSize:15 }}>🖨 Tulosta</button>
          {hasImages && (
            <button className="tap" onClick={downloadAttachmentPDF} disabled={pdfLoading} style={{ padding:"9px 15px", background:pdfLoading?"#555":"#2E5BFF", borderRadius:9, color:"#fff", fontWeight:700, fontSize:15 }}>
              {pdfLoading ? "⏳ Luodaan..." : "📎 Vaakalappu-liite PDF"}
            </button>
          )}
          {fennoaStatus==='sent'
            ? <div style={{padding:"9px 15px",background:`${GREEN}22`,border:`1px solid ${GREEN}`,borderRadius:9,color:GREEN,fontWeight:700,fontSize:15}}>✓ Fennoassa</div>
            : <button className="tap" onClick={sendToFennoa} disabled={fennoaLoading}
                style={{padding:"9px 15px",background:fennoaLoading?"#555":Y,borderRadius:9,color:"#000",fontWeight:700,fontSize:15}}>
                {fennoaLoading?"⏳ Lähetetään...":"📤 Lähetä Fennoaan"}
              </button>
          }
        </div>
      </div>
      {fennoaError&&<div style={{padding:"10px 14px",background:`${RED}15`,border:`1px solid ${RED}44`,borderRadius:9,marginBottom:12,fontSize:15,color:RED}}>⚠️ {fennoaError}</div>}
      <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:14, padding:"clamp(16px,4vw,32px)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, flexWrap:"wrap", gap:12 }}>
            <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:2,color:"#FFC107"}}>KASAMASTER</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"'Bebas Neue'", fontSize:22, letterSpacing:2 }}>LASKU</div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:15, color:Y }}>{inv.number}</div>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:22 }}>
          <div>
            <div style={{ fontSize:15, letterSpacing:2, color:Y, fontWeight:700, marginBottom:6 }}>LASKUTETAAN</div>
            <div style={{ fontWeight:700, fontSize:15 }}>{inv.customer?.name}</div>
            <div style={{ color:MUTED, fontSize:15 }}>{inv.customer?.ytunnus}</div>
            <div style={{ color:BLUE, fontSize:15 }}>{inv.customer?.email}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ marginBottom:4, fontSize:15 }}><span style={{ color:MUTED }}>Päivämäärä: </span><span style={{ fontFamily:"monospace" }}>{fDate(inv.date)}</span></div>
            <div style={{ marginBottom:4, fontSize:15 }}><span style={{ color:MUTED }}>Eräpäivä: </span><span style={{ fontFamily:"monospace", color:inv.paid?GREEN:Y, fontWeight:700 }}>{fDate(inv.dueDate)}</span></div>
            <div style={{ fontSize:15 }}><span style={{ color:MUTED }}>Tila: </span><span style={{ fontWeight:700, color:inv.paid?GREEN:RED }}>{inv.paid?"MAKSETTU":"AVOIN"}</span></div>
          </div>
        </div>
        <div style={{ borderRadius:8, overflow:"hidden", marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"70px 1fr 70px 95px 100px", padding:"8px 12px", background:CARD2, fontSize:15, letterSpacing:2, color:MUTED, fontWeight:700 }}>
            <span>PVM</span><span>TUOTE</span><span>TONNIA</span><span>À-HINTA</span><span style={{ textAlign:"right" }}>YHT</span>
          </div>
          {inv.rows.map((r,i)=>(
            <div key={i} style={{ display:"grid", gridTemplateColumns:"70px 1fr 70px 95px 100px", padding:"10px 12px", background:i%2===0?BG:"transparent", fontSize:15, alignItems:"center" }}>
              <span style={{ fontFamily:"monospace", fontSize:15, color:MUTED }}>{fDate(r.date)}</span>
              <div><div>{MATS[r.material]?.emoji} {MATS[r.material]?.label}</div>{r.note&&<div style={{ fontSize:15, color:MUTED }}>{r.note}</div>}</div>
              <span style={{ fontFamily:"monospace" }}>{fTon(r.tons)}</span>
              <span style={{ fontFamily:"monospace" }}>{fEur(r.unitPrice)}/t</span>
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", textAlign:"right", fontWeight:700 }}>{fEur(r.total)}</span>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <div style={{ width:"min(250px,100%)" }}>
            {[["Veroton summa",fEur(inv.subtotal)],["ALV 25,5 %",fEur(inv.vat)]].map(([lbl,v])=>(
              <div key={lbl} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${BORDER}`, fontSize:15 }}>
                <span style={{ color:MUTED }}>{lbl}</span><span style={{ fontFamily:"monospace" }}>{v}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"13px 0", fontSize:"clamp(17px,4vw,22px)", fontWeight:700 }}>
              <span>Yhteensä</span>
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:Y }}>{fEur(inv.total)}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop:14, padding:"11px 14px", background:BG, borderRadius:8, fontSize:15, color:MUTED, borderLeft:`3px solid ${Y}` }}>
          Viite: {inv.number} · Maksuehto 14 pv · Viivästyskorko 8 % · Kasamaster maa-aineshallinta
        </div>
      </div>
    </div>
  );
}

function AsiakkaatPage({ customers, setCust, deliveries }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name:"", ytunnus:"", email:"", phone:"", address:"" });
  const [mapCust, setMapCust] = useState(null); // customer being located
  const IS = { width:"100%", padding:"10px 12px", background:BG, border:`1px solid ${BORDER}`, borderRadius:9, color:TEXT, fontSize:15 };
  const LS = {...LS_BASE};
  const add = () => {
    if (!form.name) return;
    setCust(c=>[...c,{...form,id:newId()}]);
    setForm({name:"",ytunnus:"",email:"",phone:"",address:""});
    setShowForm(false);
  };

  // Map picker modal
  const MapPickerModal = ({cust, onClose}) => {
    const iframeRef = useRef(null);
    const lat = cust.lat || 61.674;
    const lng = cust.lng || 26.220;
    const zoom = cust.lat ? 14 : 11;
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.05},${lat-0.03},${lng+0.05},${lat+0.03}&layer=mapnik&marker=${lat},${lng}`;

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:3000,display:"flex",flexDirection:"column"}}>
        <div style={{background:CARD,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`2px solid ${Y}`}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,color:Y}}>ASETA SIJAINTI</div>
            <div style={{fontSize:15,color:MUTED}}>{cust.name}</div>
          </div>
          <button className="tap" onClick={onClose} style={{padding:"8px 14px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,color:MUTED,fontSize:15}}>✕ Sulje</button>
        </div>
        <div style={{padding:"12px 16px",background:CARD,borderBottom:`1px solid ${BORDER}`}}>
          <div style={{fontSize:15,color:MUTED,marginBottom:8}}>Syötä koordinaatit käsin (Google Mapsista: oikealla painikkeella → kopioi):</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:15,color:MUTED,fontWeight:700,marginBottom:4}}>LATITUDE</div>
              <input type="number" step="0.000001"
                defaultValue={cust.lat||""}
                id="map-lat"
                placeholder="61.674..."
                style={{width:"100%",padding:"10px",background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:15,boxSizing:"border-box"}} />
            </div>
            <div>
              <div style={{fontSize:15,color:MUTED,fontWeight:700,marginBottom:4}}>LONGITUDE</div>
              <input type="number" step="0.000001"
                defaultValue={cust.lng||""}
                id="map-lng"
                placeholder="26.220..."
                style={{width:"100%",padding:"10px",background:BG,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:15,boxSizing:"border-box"}} />
            </div>
          </div>
          <button className="tap" onClick={()=>{
            const lat = parseFloat(document.getElementById('map-lat').value);
            const lng = parseFloat(document.getElementById('map-lng').value);
            if (!isNaN(lat) && !isNaN(lng)) {
              setCust(cs=>cs.map(c=>c.id===cust.id?{...c,lat,lng}:c));
              onClose();
            }
          }} style={{width:"100%",marginTop:10,padding:"12px",background:Y,borderRadius:9,color:"#000",fontWeight:700,fontSize:15}}>
            ✓ TALLENNA KOORDINAATIT
          </button>
        </div>
        <div style={{flex:1,position:"relative"}}>
          <iframe
            ref={iframeRef}
            src={mapUrl}
            style={{width:"100%",height:"100%",border:"none"}}
            title="Kartta"
          />
          <div style={{position:"absolute",bottom:12,left:12,right:12,background:"rgba(0,0,0,.8)",borderRadius:8,padding:"8px 12px",fontSize:14,color:MUTED}}>
            💡 Avaa <a href={`https://www.google.com/maps/search/${encodeURIComponent(cust.address||cust.name)}`} target="_blank" rel="noopener noreferrer" style={{color:Y}}>Google Maps</a> → oikealla hiirellä → kopioi koordinaatit yllä oleviin kenttiin
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="su">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
      {mapCust && <MapPickerModal cust={mapCust} onClose={()=>setMapCust(null)} />}
        <div style={{ fontFamily:"'Bebas Neue'", fontSize:26, letterSpacing:2 }}>ASIAKKAAT</div>
        <button className="tap" onClick={()=>setShowForm(!showForm)} style={{ padding:"9px 19px", background:Y, borderRadius:9, color:"#000", fontWeight:700, fontSize:15 }}>+ UUSI</button>
      </div>
      <div style={{ position:"relative", marginBottom:13 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:16, pointerEvents:"none" }}>🔍</span>
        <input
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Hae asiakasta..."
          style={{ width:"100%", padding:"11px 12px 11px 38px", background:CARD, border:`1px solid ${search?Y:BORDER}`, borderRadius:10, color:TEXT, fontSize:15 }}
        />
        {search&&<button onClick={()=>setSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:MUTED, fontSize:18, cursor:"pointer", padding:2 }}>✕</button>}
      </div>
      {showForm&&(
        <div style={{ background:CARD, border:`1px solid ${Y}`, borderRadius:13, padding:17, marginBottom:13 }}>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:19, letterSpacing:2, color:Y, marginBottom:12 }}>UUSI ASIAKAS</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:10, marginBottom:11 }}>
            <div><label style={LS}>YRITYS *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={IS} /></div>
            <div><label style={LS}>Y-TUNNUS</label><input value={form.ytunnus} onChange={e=>setForm(f=>({...f,ytunnus:e.target.value}))} style={IS} /></div>
            <div><label style={LS}>SÄHKÖPOSTI</label><input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={IS} /></div>
            <div><label style={LS}>PUHELIN</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={IS} /></div>
            <div style={{ gridColumn:"span 2" }}><label style={LS}>TOIMITUSOSOITE</label><input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="Katuosoite, postinumero, kaupunki" style={IS} /></div>
          </div>
          <div style={{ display:"flex", gap:7 }}>
            <button className="tap" onClick={add} style={{ padding:"11px 22px", background:Y, borderRadius:9, color:"#000", fontWeight:700, fontSize:15 }}>TALLENNA</button>
            <button className="tap" onClick={()=>setShowForm(false)} style={{ padding:"11px 14px", background:"transparent", border:`1px solid ${BORDER}`, borderRadius:9, color:MUTED, fontSize:15 }}>Peru</button>
          </div>
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,280px),1fr))", gap:11 }}>
        {customers.filter(c => {
          if (!search) return true;
          const q = search.toLowerCase();
          return c.name?.toLowerCase().includes(q) || c.ytunnus?.includes(q) || c.phone?.includes(q) || c.address?.toLowerCase().includes(q);
        }).map(c => {
          const ds=deliveries.filter(d=>d.customerId===c.id);
          return (
            <div key={c.id} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:16 }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:3 }}>{c.name}</div>
              {c.ytunnus&&<div style={{ fontSize:15, color:MUTED }}>Y: {c.ytunnus}</div>}
              {c.email&&<div style={{ fontSize:15, color:BLUE }}>{c.email}</div>}
              {c.phone&&<div style={{ fontSize:15, color:MUTED }}>{c.phone}</div>}
              {c.address&&<div style={{ fontSize:15, color:MUTED, marginTop:2 }}>📍 {c.address}</div>}
              <div style={{ marginTop:9, paddingTop:9, borderTop:`1px solid ${BORDER}`, display:"flex", justifyContent:"space-between" }}>
                <div><div style={{ fontSize:15, color:MUTED, letterSpacing:1 }}>TOIMITETTU</div><div style={{ fontFamily:"'Bebas Neue'", fontSize:22, color:Y, letterSpacing:1 }}>{fTon(ds.reduce((s,d)=>s+d.tons,0))}</div></div>
                <div style={{ textAlign:"right" }}><div style={{ fontSize:15, color:MUTED, letterSpacing:1 }}>KUORMIA</div><div style={{ fontFamily:"'Bebas Neue'", fontSize:22 }}>{ds.length}</div></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HinnatPage({ prices, setPrices, thresholds, setThresh, locations, setLocs, prodLocs, setProdLocs, customers, setCust }) {
  const [local, setLocal] = useState(prices);
  const [localThr, setLocalThr] = useState(thresholds || DEFAULT_THRESHOLDS);
  const [localProdLocs, setLocalProdLocs] = useState(prodLocs || DEFAULT_PRODUCT_LOCATIONS);
  const [locForm, setLocForm] = useState({ name:"", address:"", lat:"", lng:"" });
  const [showLocForm, setShowLocForm] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setPrices(local);
    setThresh(localThr);
    setProdLocs(localProdLocs);
    setSaved(true);
    setTimeout(()=>setSaved(false),2200);
  };

  const addLocation = () => {
    if (!locForm.name || !locForm.address) return;
    const newLoc = { id:newId(), name:locForm.name, address:locForm.address, lat:parseFloat(locForm.lat)||null, lng:parseFloat(locForm.lng)||null };
    setLocs(ls => [...ls, newLoc]);
    setLocForm({ name:"", address:"", lat:"", lng:"" });
    setShowLocForm(false);
  };

  const removeLocation = id => {
    setLocs(ls => ls.filter(l => l.id !== id));
    setLocalProdLocs(pl => { const u={...pl}; Object.keys(u).forEach(k=>{if(u[k]===id)u[k]="";}); return u; });
  };

  const cats = {};
  Object.entries(MATS).forEach(([k,m]) => { if(!cats[m.cat]) cats[m.cat]=[]; cats[m.cat].push([k,m]); });

  const IS = { width:"100%", padding:"10px 12px", background:BG, border:`1px solid ${BORDER}`, borderRadius:9, color:TEXT, fontSize:15 };
  const LS2 = {...LS_BASE};

  return (
    <div className="su" style={{ maxWidth:500 }}>
      <div style={{ fontFamily:"'Bebas Neue'", fontSize:26, letterSpacing:2, marginBottom:2 }}>HINNOITTELU</div>
      <div style={{ color:MUTED, fontSize:15, marginBottom:16 }}>Myyntihinta €/tonni (alv 0 %) · Ostohinta lasketaan tuotantoeristä</div>
      <div style={{ marginBottom:18 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize:15, letterSpacing:2.5, color:Y, fontWeight:700 }}>VARASTOSIJAINNIT</div>
          <button className="tap" onClick={()=>setShowLocForm(!showLocForm)} style={{ padding:"5px 13px", background:Y, borderRadius:7, color:"#000", fontWeight:700, fontSize:15 }}>+ LISÄÄ</button>
        </div>
        {showLocForm && (
          <div style={{ background:CARD, border:`1px solid ${Y}`, borderRadius:11, padding:14, marginBottom:10 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
              <div><label style={LS2}>NIMI *</label><input value={locForm.name} onChange={e=>setLocForm(f=>({...f,name:e.target.value}))} placeholder="esim. Varasto 1" style={IS} /></div>
              <div><label style={LS2}>OSOITE *</label><input value={locForm.address} onChange={e=>setLocForm(f=>({...f,address:e.target.value}))} placeholder="Katuosoite, kaupunki" style={IS} /></div>
              <div><label style={LS2}>LATITUDE</label><input type="number" value={locForm.lat} onChange={e=>setLocForm(f=>({...f,lat:e.target.value}))} placeholder="61.9834" style={IS} step="0.0001" /></div>
              <div><label style={LS2}>LONGITUDE</label><input type="number" value={locForm.lng} onChange={e=>setLocForm(f=>({...f,lng:e.target.value}))} placeholder="26.1076" style={IS} step="0.0001" /></div>
            </div>
            <div style={{ display:"flex", gap:7 }}>
              <button className="tap" onClick={addLocation} style={{ flex:1, padding:"10px", background:Y, borderRadius:8, color:"#000", fontWeight:700, fontSize:15 }}>TALLENNA SIJAINTI</button>
              <button className="tap" onClick={()=>setShowLocForm(false)} style={{ padding:"10px 13px", background:"transparent", border:`1px solid ${BORDER}`, borderRadius:8, color:MUTED, fontSize:15 }}>Peru</button>
            </div>
          </div>
        )}
        <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:11, overflow:"hidden" }}>
          {(locations||[]).length===0 && <div style={{ padding:14, color:MUTED, fontSize:15, textAlign:"center" }}>Ei sijainteja. Lisää yllä.</div>}
          {(locations||[]).map((loc,i) => (
            <div key={loc.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 15px", borderBottom:i<(locations.length-1)?`1px solid ${BORDER}`:"none" }}>
              <div style={{ width:34, height:34, borderRadius:8, background:`${Y}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>📍</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{loc.name}</div>
                <div style={{ fontSize:15, color:MUTED, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{loc.address}</div>
                {loc.lat&&<div style={{ fontSize:15, color:MUTED, fontFamily:"monospace" }}>{loc.lat}, {loc.lng}</div>}
              </div>
              <button className="tap" onClick={()=>removeLocation(loc.id)} style={{ padding:"5px 10px", background:"transparent", border:`1px solid ${RED}44`, borderRadius:7, color:RED, fontSize:15 }}>✕</button>
            </div>
          ))}
        </div>
      </div>
      {Object.entries(cats).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom:14 }}>
          <div style={{ fontSize:15, letterSpacing:2.5, color:Y, fontWeight:700, marginBottom:8 }}>{cat.toUpperCase()}</div>
          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:11, overflow:"hidden" }}>
            {items.map(([key,mat],i)=>(
              <div key={key} style={{ padding:"13px 15px", borderBottom:i<items.length-1?`1px solid ${BORDER}`:"none" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:mat.color+"33", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>{mat.emoji}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:15 }}>{mat.label}</div>
                    <div style={{ fontSize:15, color:MUTED }}>{fEur(local[key]||0)}/t</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <input type="number" value={local[key]} step="0.5" min="0" onChange={e=>setLocal(l=>({...l,[key]:parseFloat(e.target.value)||0}))}
                      style={{ width:76, padding:"8px 9px", background:BG, border:`1px solid ${BORDER}`, borderRadius:7, color:Y, fontSize:15, fontFamily:"'IBM Plex Mono',monospace", textAlign:"right" }} />
                    <span style={{ color:MUTED, fontSize:15 }}>€/t</span>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:15, letterSpacing:1.5, color:MUTED, fontWeight:700, whiteSpace:"nowrap" }}>📍 SIJAINTI</span>
                  <select value={localProdLocs[key]||""} onChange={e=>setLocalProdLocs(pl=>({...pl,[key]:e.target.value}))}
                    style={{ flex:1, padding:"6px 10px", background:BG, border:`1px solid ${BORDER}`, borderRadius:7, color:TEXT, fontSize:15 }}>
                    <option value="">— ei määritetty —</option>
                    {(locations||[]).map(loc=><option key={loc.id} value={loc.id}>{loc.name} · {loc.address}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ padding:"10px 13px", background:`${Y}11`, border:`1px solid ${Y}33`, borderRadius:9, fontSize:15, color:MUTED, marginBottom:12 }}>ALV 25,5 % lisätään laskuille automaattisesti.</div>

      <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:11, padding:"15px 16px", marginBottom:12 }}>
        <div style={{ fontSize:15, letterSpacing:2.5, color:Y, fontWeight:700, marginBottom:12 }}>VARASTOSALDO-LIIKENNEVALOT</div>
        {[
          { key:"green", label:"🟢 Vihreä (yli)", desc:"Hyvä varastotilanne" },
          { key:"red",   label:"🔴 Punainen (alle)", desc:"Kriittinen — tilattava lisää" },
        ].map(({key,label,desc}) => (
          <div key={key} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15 }}>{label}</div>
              <div style={{ fontSize:15, color:MUTED }}>{desc}</div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <input type="number" value={localThr[key]} min="0" step="50"
                onChange={e=>setLocalThr(t=>({...t,[key]:parseFloat(e.target.value)||0}))}
                style={{ width:90, padding:"8px 9px", background:BG, border:`1px solid ${BORDER}`, borderRadius:7, color:Y, fontSize:15, fontFamily:"'IBM Plex Mono',monospace", textAlign:"right" }} />
              <span style={{ color:MUTED, fontSize:15 }}>t</span>
            </div>
          </div>
        ))}
        <div style={{ fontSize:15, color:MUTED, marginTop:4, paddingTop:10, borderTop:`1px solid ${BORDER}` }}>
          🟠 Oranssi = {localThr.red} – {localThr.green} t välillä
        </div>
      </div>

      <button className="tap" onClick={save} style={{ width:"100%", padding:"14px", background:saved?GREEN:Y, borderRadius:10, color:"#000", fontWeight:700, fontSize:15, letterSpacing:.5, transition:"background .3s" }}>
        {saved ? "✓ TALLENNETTU!" : "TALLENNA KAIKKI"}
      </button>
      <div style={{marginTop:10,textAlign:"center",fontSize:14,color:MUTED}}>
        Varastohälytysrajat, sijainnit ja API-tunnukset löytyvät <strong style={{color:Y}}>Asetukset</strong>-välilehdeltä.
      </div>
    </div>
  );
}


// ── ASETUKSET ─────────────────────────────────────────────────────────────────
function AsetuksetPage({ thresholds, setThresh, locations, setLocs, prodLocs, setProdLocs, customers, setCust }) {
  const [localThr, setLocalThr] = useState(thresholds || DEFAULT_THRESHOLDS);
  const [saved, setSaved] = useState(false);

  // Fennoa credentials stored in localStorage
  const [fennoaUser, setFennoaUser] = useState(()=>localStorage.getItem('km_fennoa_user')||'');
  const [fennoaKey,  setFennoaKey]  = useState(()=>localStorage.getItem('km_fennoa_key')||'');
  const [fennoaSaved, setFennoaSaved] = useState(false);

  // Warehouse coordinates
  const [warehouseLat, setWarehouseLat] = useState(()=>parseFloat(localStorage.getItem('km_warehouse_lat'))||WAREHOUSE.lat);
  const [warehouseLng, setWarehouseLng] = useState(()=>parseFloat(localStorage.getItem('km_warehouse_lng'))||WAREHOUSE.lng);
  const [warehouseAddr, setWarehouseAddr] = useState(()=>localStorage.getItem('km_warehouse_addr')||WAREHOUSE.address);

  // Geocode status
  const [geoStatus, setGeoStatus] = useState(null);
  const [geoDone, setGeoDone] = useState(0);
  const [geoTotal, setGeoTotal] = useState(0);

  const saveThr = () => {
    setThresh(localThr);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  };

  const saveFennoa = () => {
    localStorage.setItem('km_fennoa_user', fennoaUser);
    localStorage.setItem('km_fennoa_key', fennoaKey);
    setFennoaSaved(true);
    setTimeout(()=>setFennoaSaved(false), 2000);
  };

  const saveWarehouse = () => {
    localStorage.setItem('km_warehouse_lat', warehouseLat);
    localStorage.setItem('km_warehouse_lng', warehouseLng);
    localStorage.setItem('km_warehouse_addr', warehouseAddr);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  };

  const geocodeAll = async () => {
    const missing = customers.filter(c => !c.lat || !c.lng);
    if (missing.length === 0) { setGeoStatus('done'); return; }
    setGeoStatus('running'); setGeoDone(0); setGeoTotal(missing.length);
    let updated = [...customers];
    for (let i = 0; i < missing.length; i++) {
      const c = missing[i];
      if (!c.address) { setGeoDone(i+1); continue; }
      try {
        const q = encodeURIComponent(c.address + ', Finland');
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`, {headers:{'Accept-Language':'fi'}});
        const d = await r.json();
        if (d?.[0]) updated = updated.map(x => x.id===c.id ? {...x, lat:parseFloat(d[0].lat), lng:parseFloat(d[0].lon)} : x);
      } catch {}
      setGeoDone(i+1);
      await new Promise(r => setTimeout(r, 1000));
    }
    setCust(updated);
    setGeoStatus('done');
  };

  const Section = ({title, children}) => (
    <div style={{background:CARD,borderRadius:12,padding:"18px 18px",marginBottom:16}}>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:2,color:Y,marginBottom:14}}>{title}</div>
      {children}
    </div>
  );

  return (
    <div className="su">
      <div style={{fontFamily:"'Bebas Neue'",fontSize:28,letterSpacing:2,marginBottom:16}}>ASETUKSET</div>

      {/* Fennoa API */}
      <Section title="🔗 FENNOA API">
        <div style={{fontSize:15,color:MUTED,marginBottom:12}}>API-tunnukset laskujen lähettämiseen Fennoaan.</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>API-KÄYTTÄJÄTUNNUS</div>
          <input value={fennoaUser} onChange={e=>setFennoaUser(e.target.value)}
            placeholder="yritystunnus_tai_kayttajatunnus"
            style={{width:"100%",padding:"11px 12px",background:BG,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:15,boxSizing:"border-box"}} />
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>API-AVAIN</div>
          <input type="password" value={fennoaKey} onChange={e=>setFennoaKey(e.target.value)}
            placeholder="••••••••••••"
            style={{width:"100%",padding:"11px 12px",background:BG,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:15,boxSizing:"border-box"}} />
        </div>
        <button className="tap" onClick={saveFennoa}
          style={{width:"100%",padding:"12px",background:fennoaSaved?GREEN:Y,borderRadius:9,color:"#000",fontWeight:700,fontSize:15,transition:"background .3s"}}>
          {fennoaSaved?"✓ TALLENNETTU!":"TALLENNA FENNOA-TUNNUKSET"}
        </button>
        <div style={{fontSize:13,color:MUTED,marginTop:8}}>⚠️ Tallennetaan laitteen selaimeen. Älä käytä jaetuilla laitteilla.</div>
      </Section>

      {/* Varasto */}
      <Section title="📍 VARASTON SIJAINTI">
        <div style={{fontSize:15,color:MUTED,marginBottom:12}}>Lähtöpiste etäisyyslaskennalle ja Google Maps -linkeille.</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>OSOITE</div>
          <input value={warehouseAddr} onChange={e=>setWarehouseAddr(e.target.value)}
            style={{width:"100%",padding:"11px 12px",background:BG,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:15,boxSizing:"border-box"}} />
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          <div>
            <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>LATITUDE</div>
            <input type="number" step="0.000001" value={warehouseLat} onChange={e=>setWarehouseLat(parseFloat(e.target.value))}
              style={{width:"100%",padding:"11px 12px",background:BG,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:15,boxSizing:"border-box"}} />
          </div>
          <div>
            <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>LONGITUDE</div>
            <input type="number" step="0.000001" value={warehouseLng} onChange={e=>setWarehouseLng(parseFloat(e.target.value))}
              style={{width:"100%",padding:"11px 12px",background:BG,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:15,boxSizing:"border-box"}} />
          </div>
        </div>
        <button className="tap" onClick={saveWarehouse}
          style={{width:"100%",padding:"12px",background:Y,borderRadius:9,color:"#000",fontWeight:700,fontSize:15}}>
          TALLENNA SIJAINTI
        </button>
      </Section>

      {/* Varastohälytysrajat */}
      <Section title="⚠️ VARASTOHÄLYTYSRAJAT">
        {[["green","🟢 Vihreä (riittävästi)"],["red","🔴 Punainen (kriittinen)"]].map(([key,label])=>(
          <div key={key} style={{marginBottom:14}}>
            <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>{label}</div>
            <input type="number" value={localThr[key]} min="0" step="50"
              onChange={e=>setLocalThr(t=>({...t,[key]:Number(e.target.value)}))}
              style={{width:"100%",padding:"11px 12px",background:BG,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:15,boxSizing:"border-box"}} />
          </div>
        ))}
        <div style={{fontSize:15,color:MUTED,marginBottom:12}}>
          🟠 Oranssi = {localThr.red} – {localThr.green} t välillä
        </div>
        <button className="tap" onClick={saveThr}
          style={{width:"100%",padding:"12px",background:saved?GREEN:Y,borderRadius:9,color:"#000",fontWeight:700,fontSize:15,transition:"background .3s"}}>
          {saved?"✓ TALLENNETTU!":"TALLENNA RAJAT"}
        </button>
      </Section>

      {/* Koordinaattien päivitys */}
      <Section title="📍 ASIAKKAIDEN KOORDINAATIT">
        <div style={{fontSize:15,color:MUTED,marginBottom:12}}>
          Geokoodaa osoitteet etäisyyslaskentaa varten.{" "}
          <span style={{color:Y}}>{customers.filter(c=>c.lat&&c.lng).length}/{customers.length} koordinoitu.</span>
        </div>
        {geoStatus==='running'?(
          <div>
            <div style={{fontSize:15,marginBottom:8}}>Käsitellään {geoDone}/{geoTotal}...</div>
            <div style={{height:6,background:"#333",borderRadius:3,overflow:"hidden"}}>
              <div style={{width:`${geoTotal?Math.round(geoDone/geoTotal*100):0}%`,height:"100%",background:Y,transition:"width .3s"}} />
            </div>
          </div>
        ):(
          <button className="tap" onClick={geocodeAll}
            style={{width:"100%",padding:"12px",background:geoStatus==='done'?GREEN:Y,borderRadius:9,color:"#000",fontWeight:700,fontSize:15}}>
            {geoStatus==='done'?"✓ VALMIS — KOORDINAATIT PÄIVITETTY":"📍 PÄIVITÄ KOORDINAATIT"}
          </button>
        )}
      </Section>
    </div>
  );
}

// ── TUOTANTO ──────────────────────────────────────────────────────────────────
function TuotantoPage({ batches, setBatches, stock, setStock }) {
  const [showForm, setShowForm] = useState(false);
  // Costs: total € amounts (not per ton)
  const [costs, setCosts] = useState({ louhinta:"", kiviaines:"", murskaus:"" });
  const [outputs, setOutputs] = useState([{ material:"kam_0_16", tons:"" }]);
  const [date, setDate] = useState(nowDate());

  const IS = { width:"100%", padding:"10px 12px", background:BG, border:`1px solid ${BORDER}`, borderRadius:9, color:TEXT, fontSize:15 };
  const LS = {...LS_BASE};

  const totalCost = (parseFloat(costs.louhinta)||0) + (parseFloat(costs.kiviaines)||0) + (parseFloat(costs.murskaus)||0);
  const totalTons = outputs.reduce((s,o) => s + (parseFloat(o.tons)||0), 0);
  const costPerTon = totalTons > 0 ? totalCost / totalTons : 0;

  const addOutput = () => setOutputs(os => [...os, { material:"kam_0_16", tons:"" }]);
  const removeOutput = i => setOutputs(os => os.filter((_,idx)=>idx!==i));
  const updateOutput = (i, field, val) => setOutputs(os => { const n=[...os]; n[i]={...n[i],[field]:val}; return n; });

  const saveBatch = () => {
    if (totalTons<=0 || totalCost<=0) return;
    const batchId = newId();
    // Create one batch entry per output product, each sharing same costPerTon
    outputs.forEach(o => {
      const t = parseFloat(o.tons)||0;
      if (t<=0) return;
      setBatches(bs => [...bs, {
        id: newId(), batchId, date, material: o.material,
        tons: t, remainingTons: t,
        costs: { louhinta: parseFloat(costs.louhinta)||0, kiviaines: parseFloat(costs.kiviaines)||0, murskaus: parseFloat(costs.murskaus)||0 },
        costPerTon,   // shared cost per ton for this crushing run
        totalBatchCost: totalCost,
        totalBatchTons: totalTons,
      }]);
      setStock(s => ({...s, [o.material]: (s[o.material]||0) + t}));
    });
    setCosts({ louhinta:"", kiviaines:"", murskaus:"" });
    setOutputs([{ material:"kam_0_16", tons:"" }]);
    setDate(nowDate());
    setShowForm(false);
  };

  // Group batches by batchId for display
  const batchGroups = [];
  const seen = new Set();
  (batches||[]).slice().reverse().forEach(b => {
    const gid = b.batchId || b.id;
    if (!seen.has(gid)) {
      seen.add(gid);
      const group = (batches||[]).filter(x=>(x.batchId||x.id)===gid);
      batchGroups.push({ id:gid, date:b.date, costPerTon:b.costPerTon||batchCostPerTon(b),
        totalCost:b.totalBatchCost||0, totalTons:b.totalBatchTons||0, items:group });
    }
  });

  const removeGroup = gid => {
    const group = (batches||[]).filter(b=>(b.batchId||b.id)===gid);
    group.forEach(b => setStock(s => ({...s,[b.material]:Math.max(0,(s[b.material]||0)-(b.remainingTons||0))})));
    setBatches(bs => bs.filter(b=>(b.batchId||b.id)!==gid));
  };

  return (
    <div className="su">
      <div style={{fontFamily:"'Bebas Neue'",fontSize:26,letterSpacing:2,marginBottom:2}}>TUOTANTO</div>
      <div style={{color:MUTED,fontSize:15,marginBottom:14}}>Murskauserät — FIFO-ostohinta</div>

      <button className="tap" onClick={()=>setShowForm(!showForm)} style={{width:"100%",padding:"13px",background:Y,borderRadius:10,color:"#000",fontWeight:700,fontSize:15,letterSpacing:.5,marginBottom:14}}>
        + UUSI MURSKAUSERÄ
      </button>

      {showForm && (
        <div style={{background:CARD,border:`1px solid ${Y}`,borderRadius:13,padding:16,marginBottom:14}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:17,letterSpacing:2,color:Y,marginBottom:12}}>UUSI MURSKAUSERÄ</div>

          <div style={{marginBottom:12}}>
            <label style={LS}>PVM</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...IS, width:"auto"}} />
          </div>
          <div style={{fontSize:15,letterSpacing:2,color:Y,fontWeight:700,marginBottom:8}}>KOKONAISKUSTANNUKSET (€ yht.)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
            {[["louhinta","⛏ Louhinta"],["kiviaines","🪨 Kiviaines"],["murskaus","⚙ Murskaus"]].map(([field,label])=>(
              <div key={field}>
                <label style={LS}>{label}</label>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <input type="number" value={costs[field]} onChange={e=>setCosts(c=>({...c,[field]:e.target.value}))}
                    placeholder="0" style={{...IS,fontFamily:"monospace",fontSize:15,color:Y}} step="1" min="0" />
                  <span style={{color:MUTED,fontSize:15,flexShrink:0}}>€</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{fontSize:15,letterSpacing:2,color:Y,fontWeight:700,marginBottom:8}}>SAADUT TUOTTEET</div>
          {outputs.map((o,i) => (
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,alignItems:"flex-end",marginBottom:8}}>
              <div>
                {i===0 && <label style={LS}>TUOTE</label>}
                <select value={o.material} onChange={e=>updateOutput(i,"material",e.target.value)} style={IS}>
                  {Object.entries(MATS).map(([k,m])=><option key={k} value={k}>{m.emoji} {m.label}</option>)}
                </select>
              </div>
              <div>
                {i===0 && <label style={LS}>TONNIT</label>}
                <input type="number" value={o.tons} onChange={e=>updateOutput(i,"tons",e.target.value)}
                  placeholder="0,00" style={{...IS,fontFamily:"monospace",fontSize:15,color:Y}} step="0.01" min="0" />
              </div>
              <div style={{paddingBottom:1}}>
                {outputs.length>1 && <button className="tap" onClick={()=>removeOutput(i)} style={{padding:"10px 12px",background:"transparent",border:`1px solid ${RED}44`,borderRadius:9,color:RED,fontSize:15}}>✕</button>}
              </div>
            </div>
          ))}
          <button className="tap" onClick={addOutput} style={{width:"100%",padding:"8px",background:"transparent",border:`1px dashed ${BORDER}`,borderRadius:9,color:MUTED,fontSize:15,marginBottom:12}}>
            + Lisää tuote
          </button>
          {totalTons>0 && totalCost>0 && (
            <div style={{background:`${Y}12`,borderLeft:`3px solid ${Y}`,borderRadius:7,padding:"10px 13px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:15}}>
                <span style={{color:MUTED}}>Kokonaiskustannus</span>
                <span style={{color:Y,fontWeight:700,fontFamily:"monospace"}}>{fEur(totalCost)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:15}}>
                <span style={{color:MUTED}}>Kokonaistonnit</span>
                <span style={{fontFamily:"monospace"}}>{fTon(totalTons)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:15,borderTop:`1px solid ${BORDER}`,paddingTop:6,marginTop:4}}>
                <span style={{fontWeight:700}}>Ostohinta / tonni</span>
                <span style={{color:Y,fontWeight:700,fontFamily:"monospace",fontSize:16}}>{fEur(costPerTon)}/t</span>
              </div>
            </div>
          )}

          <div style={{display:"flex",gap:8}}>
            <button className="tap" onClick={saveBatch} style={{flex:1,padding:"12px",background:Y,borderRadius:9,color:"#000",fontWeight:700,fontSize:15}}>TALLENNA ERÄ</button>
            <button className="tap" onClick={()=>setShowForm(false)} style={{padding:"12px 15px",background:"transparent",border:`1px solid ${BORDER}`,borderRadius:9,color:MUTED,fontSize:15}}>Peru</button>
          </div>
        </div>
      )}
      {batchGroups.length===0 && !showForm && (
        <div style={{color:MUTED,textAlign:"center",padding:"32px 0",fontSize:15}}>Ei murskauseriä. Lisää ensimmäinen erä yllä.</div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {batchGroups.map(g => (
          <div key={g.id} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{height:3,background:Y}} />
            <div style={{padding:"13px 15px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{fDate(g.date)}</div>
                  {g.totalCost>0 && <div style={{fontSize:15,color:MUTED,marginTop:2}}>
                    Kokonaiskustannus {fEur(g.totalCost)} · {fTon(g.totalTons)}
                  </div>}
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:15,color:Y,fontWeight:700,fontFamily:"monospace"}}>{fEur(g.costPerTon)}/t</div>
                  <div style={{fontSize:15,color:MUTED}}>ostohinta</div>
                </div>
              </div>
              {g.items.map((b,i) => {
                const used = b.tons-(b.remainingTons||0);
                const pct = b.tons>0?(b.remainingTons||0)/b.tons*100:0;
                return (
                  <div key={b.id} style={{borderTop:i>0?`1px solid ${BORDER}`:"none",paddingTop:i>0?8:0,marginTop:i>0?8:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontWeight:700,fontSize:15}}>{MATS[b.material]?.emoji} {MATS[b.material]?.label}</span>
                      <span style={{fontSize:15,fontFamily:"monospace",color:(b.remainingTons||0)>0?GREEN:MUTED}}>{fTon(b.remainingTons||0)} / {fTon(b.tons)}</span>
                    </div>
                    <div style={{height:4,background:"#333",borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:pct>30?GREEN:pct>0?Y:MUTED,borderRadius:2,transition:"width .5s"}} />
                    </div>
                    <div style={{fontSize:15,color:MUTED,marginTop:3}}>{fTon(used)} toimitettu</div>
                  </div>
                );
              })}
              <div style={{marginTop:10,textAlign:"right"}}>
                <button className="tap" onClick={()=>removeGroup(g.id)} style={{padding:"4px 12px",background:"transparent",border:`1px solid ${RED}33`,borderRadius:7,color:RED,fontSize:15}}>Poista erä</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KUITTAUSMODAALI ───────────────────────────────────────────────────────────
function SignatureModal({ orderName, title, order, deliveries, onDeliveryClick, onConfirm, onClose }) {
  const canvasRef = useRef();
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const [mode, setMode] = useState("sig"); // "sig" | "quick"
  const [expandedLine, setExpandedLine] = useState(null);
  const lastPos = useRef(null);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches?.[0] || e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const startDraw = e => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    setDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = e => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#FFC107";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
    setHasSig(true);
  };

  const endDraw = e => { e.preventDefault(); setDrawing(false); lastPos.current = null; };

  const clear = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:2000,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="su" style={{background:CARD,border:`2px solid ${GREEN}`,borderRadius:"16px 16px 0 0",padding:"20px 18px 32px",width:"100%",maxWidth:520}}>
        <div style={{width:40,height:4,background:BORDER,borderRadius:2,margin:"0 auto 18px"}} />
        <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:2,color:GREEN,marginBottom:4}}>{title||"KUITTAA TOIMITETUKSI"}</div>
        <div style={{fontSize:15,color:MUTED,marginBottom:12}}>{orderName}</div>

              {order&&order.lines&&(
          <div style={{marginBottom:12}}>
            {order.lines.map((ol,i)=>{
              const lineDels = deliveries?.filter(d=>
                (d.orderId===order.id || (!d.orderId && d.customerId===order.customerId))
                && d.material===ol.material
              )||[];
              const missing = ol.orderedTons - ol.deliveredTons;
              const isExpanded = expandedLine === i;
              const visibleDels = lineDels.slice(-3);
              return (
                <div key={i} style={{background:BG,borderRadius:10,marginBottom:8,overflow:"hidden",border:`1px solid ${missing>0?RED+"44":GREEN+"44"}`}}>
                  <div className="tap" onClick={()=>setExpandedLine(isExpanded?null:i)}
                    style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 12px"}}>
                    <span style={{fontWeight:700}}>{MATS[ol.material]?.emoji} {MATS[ol.material]?.label}</span>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"monospace",fontSize:15,color:missing>0?Y:GREEN,fontWeight:700}}>{fTon(ol.deliveredTons)} / {fTon(ol.orderedTons)}</div>
                        {missing>0&&<div style={{fontSize:15,color:TEXT}}>toimittamatta {fTon(missing)}</div>}
                      </div>
                      <span style={{color:MUTED,fontSize:15}}>{isExpanded?"▲":"▼"}</span>
                    </div>
                  </div>
                  {isExpanded&&lineDels.length>0&&(
                    <div style={{borderTop:`1px solid ${BORDER}`}}>
                      <div style={{maxHeight:180,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
                        {lineDels.map((d,di)=>(
                          <div key={di} className="tap" onClick={()=>onDeliveryClick&&onDeliveryClick(d)}
                            style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:di<lineDels.length-1?`1px solid ${BORDER}22`:undefined}}>
                            <span style={{fontSize:15,color:MUTED}}>{fDate(d.date)}</span>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontFamily:"monospace",fontSize:15,color:Y,fontWeight:700}}>{fTon(d.tons)}</span>
                              <span style={{fontSize:15,color:d.image?Y:MUTED}}>{d.image?"📷":"📋"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {lineDels.length>3&&<div style={{padding:"4px 12px",fontSize:15,color:MUTED,borderTop:`1px solid ${BORDER}22`,textAlign:"center"}}>
                        ↕ Vieritä — {lineDels.length} kuormakirjaa
                      </div>}
                    </div>
                  )}
                  {isExpanded&&lineDels.length===0&&(
                    <div style={{padding:"8px 12px",borderTop:`1px solid ${BORDER}`,fontSize:15,color:MUTED}}>Ei kuormakirjoja</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{display:"flex",background:BG,borderRadius:9,padding:3,gap:3,marginBottom:16}}>
          {[["sig","✍️ Allekirjoitus"],["quick","👍 Pikakuittaus"]].map(([v,lbl])=>(
            <button key={v} className="tap" onClick={()=>setMode(v)} style={{flex:1,padding:"9px",borderRadius:7,border:"none",background:mode===v?GREEN:"transparent",color:mode===v?"#000":MUTED,fontWeight:700,fontSize:15}}>{lbl}</button>
          ))}
        </div>

        {mode==="sig" ? (
          <>
            <div style={{fontSize:15,color:MUTED,marginBottom:8}}>Asiakas allekirjoittaa alla:</div>
            <div style={{position:"relative",borderRadius:10,overflow:"hidden",border:`1px solid ${BORDER}`,marginBottom:10,background:BG,touchAction:"none"}}>
              <canvas ref={canvasRef} width={480} height={140} style={{width:"100%",height:140,display:"block",cursor:"crosshair",touchAction:"none"}}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
              />
              {!hasSig&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",color:MUTED,fontSize:15}}>Piirrä allekirjoitus tähän</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="tap" onClick={clear} style={{padding:"11px 16px",background:"transparent",border:`1px solid ${BORDER}`,borderRadius:9,color:MUTED,fontSize:15}}>Tyhjennä</button>
              <button className="tap" onClick={()=>hasSig&&onConfirm("allekirjoitus")} style={{flex:1,padding:"12px",background:hasSig?GREEN:BORDER,borderRadius:9,color:"#000",fontWeight:700,fontSize:15,opacity:hasSig?1:.5}}>✅ VAHVISTA</button>
            </div>
          </>
        ) : (
          <>
            <div style={{fontSize:15,color:MUTED,marginBottom:20,lineHeight:1.5}}>Kuljettaja kuittaa toimituksen vastaanotetuksi ilman allekirjoitusta.</div>
            <button className="tap" onClick={()=>onConfirm("pikakuittaus")} style={{width:"100%",padding:"16px",background:GREEN,borderRadius:10,color:"#000",fontWeight:700,fontSize:16,letterSpacing:.5}}>
              👍 KUITTAAN VASTAANOTETUKSI
            </button>
          </>
        )}
        <button className="tap" onClick={onClose} style={{width:"100%",marginTop:10,padding:"11px",background:"transparent",border:`1px solid ${BORDER}`,borderRadius:9,color:MUTED,fontSize:15}}>Peru</button>
      </div>
    </div>
  );
}

// ── TILAUKSET ─────────────────────────────────────────────────────────────────
const TRUCK_TYPES = [
  { id:"tonnia",        label:"Tonnit",                    tons:null },
  { id:"nuppi",         label:"Nuppikuorma (~20 t)",       tons:20   },
  { id:"taysperavaunu", label:"Täysperävaunukuorma (~40 t)",tons:40  },
];

function TilauksetPage({ orders, setOrders, customers, setCust, invoices, prices, stock, deliveries, setScanOpen, preselectedMaterial, onClearPreselect }) {
  const [showForm, setShowForm] = useState(!!preselectedMaterial);
  const [wizardStep, setWizardStep] = useState(1); // 1=asiakas 2=reitti 3=tuote 4=tonnit 5=hinta 6=aikataulu 7=yhteenveto
  const [wizardLineIdx, setWizardLineIdx] = useState(0);
  const [showCustDetail, setShowCustDetail] = useState(false);
  const [newCustForm, setNewCustForm] = useState(null); // null=hidden, {}=open
  const [custSearch, setCustSearch] = useState("");
  const [filter, setFilter] = useState("aloittamatta");
  const [sortBy, setSortBy] = useState("saapunut"); // "aakkoset" | "kiireellisyys" | "saapunut"
  const [showSort, setShowSort] = useState(false);
  const [form, setForm] = useState({
    customerId:"", note:"", info:"", deliveryTime:"heti", deliveryKm:"", deliveryAddress:"", useCustomerAddress:null,
    lines:[{ material: preselectedMaterial||"kam_0_16", qtyType:"tonnia", tons:"" }]
  });
  const [viewId, setViewId] = useState(null);
  const [showLogFor, setShowLogFor] = useState(null);
  const [showDeliveryDetail, setShowDeliveryDetail] = useState(null);
  const [zoomImg, setZoomImg] = useState(null);
  const [listening, setListening] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [showConfirmIncomplete, setShowConfirmIncomplete] = useState(false);
  const [showOrderDone, setShowOrderDone] = useState(null);
  const [editOrderId, setEditOrderId] = useState(null);
  const [distance, setDistance] = useState(null); // { km, duration }
  const [distLoading, setDistLoading] = useState(false);

  // Haversine straight-line distance (always works as fallback)
  const haversine = (lat1, lng1, lat2, lng2) => {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
  };

  const fetchDistance = async (cust, overrideAddress) => {
    setDistance(null);
    setDistLoading(true);
    const addr = overrideAddress || cust?.address;
    if (!addr) return;

    let lat = overrideAddress ? null : cust?.lat;
    let lng = overrideAddress ? null : cust?.lng;

    if (!lat || !lng) {
      try {
        const q = encodeURIComponent(addr + ', Finland');
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`, {headers:{'Accept-Language':'fi'}});
        const geoData = await geoRes.json();
        if (geoData?.[0]) {
          lat = parseFloat(geoData[0].lat);
          lng = parseFloat(geoData[0].lon);
          // Note: not caching coords to avoid triggering re-render during wizard
        }
      } catch {}
    }

    if (!lat || !lng) return;

    const linKm = haversine(WAREHOUSE.lat, WAREHOUSE.lng, lat, lng);
    setDistance({ km: linKm, min: Math.round(linKm / 0.7), type: "lin" });

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${WAREHOUSE.lng},${WAREHOUSE.lat};${lng},${lat}?overview=false`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes?.[0]) {
        setDistance({ km: (data.routes[0].distance/1000).toFixed(1), min: Math.round(data.routes[0].duration/60), type: "drive" });
      }
    } catch {}
    setDistLoading(false);
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Selaimesi ei tue puheentunnistusta."); return; }
    const rec = new SR();
    rec.lang = "fi-FI";
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = e => {
      const text = e.results[0][0].transcript;
      setForm(f => ({ ...f, info: f.info ? f.info + " " + text : text }));
    };
    rec.onerror = () => setListening(false);
    rec.start();
  };

  const suggestPrice = (customerId, material) => {
    const cid = parseInt(customerId);
    const lastInv = [...invoices].reverse().find(inv =>
      inv.customer?.id===cid && inv.rows?.some(r=>r.material===material)
    );
    if (lastInv) {
      const row = lastInv.rows.find(r=>r.material===material);
      if (row) return { price:row.unitPrice, source:"viim. lasku" };
    }
    return { price:prices[material]||0, source:"noutohinta" };
  };

  const addLine = () => setForm(f=>({...f, lines:[...f.lines,{material:"kam_0_16",qtyType:"tonnia",tons:""}]}));
  const removeLine = i => setForm(f=>({...f, lines:f.lines.filter((_,idx)=>idx!==i)}));
  const updateLine = (i,field,val) => setForm(f=>{
    const lines=[...f.lines]; lines[i]={...lines[i],[field]:val};
    if(field==="qtyType"){const t=TRUCK_TYPES.find(tt=>tt.id===val); if(t?.tons) lines[i].tons=String(t.tons);}
    return {...f,lines};
  });

  const createOrder = () => {
    if (!form.customerId||form.lines.some(l=>!l.tons||parseFloat(l.tons)<=0)) return;
    const newLines = form.lines.map(l=>{
      const {price}=suggestPrice(form.customerId,l.material);
      const basePrice = price||0;
      const ekm = parseFloat(form.deliveryKm)||(distance?.km||0);
      const finalPrice = l.customPrice !== undefined ? l.customPrice : freightPrice(basePrice, ekm);
      return {material:l.material,qtyType:l.qtyType,orderedTons:parseFloat(l.tons)||0,deliveredTons:0,unitPrice:finalPrice,basePrice};
    });

    // Save phone and address after wizard closes (deferred to avoid re-render)
    const custId = form.customerId;
    const tmpPhone = form._tmpPhone;
    const useCustomAddr = form.useCustomerAddress;
    const delivAddr = form.deliveryAddress;
    setTimeout(() => {
      if (tmpPhone?.replace(/\D/g,'').length>=10) {
        setCust(cs=>cs.map(c=>String(c.id)===String(custId)?{...c,phone:tmpPhone}:c));
      }
      if (useCustomAddr===false && delivAddr) {
        setCust(cs=>cs.map(c=>String(c.id)===String(custId)?{...c,address:delivAddr}:c));
      }
    }, 500);

    if (editOrderId) {
      setOrders(os=>os.map(o=>o.id===editOrderId
        ? {...o, status:"kesken", lines:[...o.lines, ...newLines]}
        : o
      ));
      setViewId(editOrderId);
      setEditOrderId(null);
    } else {
      const deliveryAddr = form.deliveryAddress || customers.find(c=>String(c.id)===String(form.customerId))?.address || '';
      const order = {
        id:newId(), date:nowDate(),
        customerId:parseInt(form.customerId),
        deliveryAddress: deliveryAddr,
        note:form.note, info:form.info, deliveryTime:form.deliveryTime, deliveryKm:parseFloat(form.deliveryKm)||(distance?.km||null), distance:distance||null, status:"aloittamatta",
        lines:newLines.map(l => ({...l, deliveryKm: parseFloat(form.deliveryKm)||(distance?.km||null)})),
      };
      setOrders(os=>[...os,order]);
    }
    setForm({customerId:"",note:"",info:"",deliveryTime:"heti",deliveryKm:"",deliveryAddress:"",useCustomerAddress:null,lines:[{material:"kam_0_16",qtyType:"tonnia",tons:""}]});
    setShowForm(false);
  };

  const takeOrder = id => setOrders(os=>os.map(o=>o.id===id?{...o,status:"kesken"}:o));

  const urgencyScore = o => {
    // Lower = more urgent
    if (o.deliveryTime === "heti") return 0;
    if (o.deliveryTime) return new Date(o.deliveryTime).getTime();
    return Infinity;
  };

  const filtered = [...orders]
    .filter(o => filter==="kaikki" ? true : o.status===filter)
    .sort((a, b) => {
      if (sortBy==="aakkoset") {
        const ca = customers.find(c=>c.id===a.customerId)?.name||"";
        const cb = customers.find(c=>c.id===b.customerId)?.name||"";
        return ca.localeCompare(cb, "fi");
      }
      if (sortBy==="kiireellisyys") return urgencyScore(a) - urgencyScore(b);
      return new Date(b.date) - new Date(a.date); // saapunut (uusin ensin)
    });

  const IS = {width:"100%",padding:"10px 12px",background:BG,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:15};
  const LS = {...LS_BASE};
  const SC = {aloittamatta:BLUE, kesken:Y, kuljetuksessa:"#FF9500", valmis:GREEN};
  const SL = {aloittamatta:"ALOITTAMATTA", kesken:"KESKEN", kuljetuksessa:"KULJETUKSESSA", valmis:"VALMIS"};

  // Detail view
  if (viewId) {
    const o = orders.find(x=>x.id===viewId);
    if (!o){setViewId(null);return null;}
    const cust = customers.find(c=>c.id===o.customerId);
    const totalOrdered = o.lines.reduce((s,l)=>s+l.orderedTons,0);
    const totalDel = o.lines.reduce((s,l)=>s+l.deliveredTons,0);
    const pct = Math.min(100, totalOrdered>0?(totalDel/totalOrdered)*100:0);

    const handleMerkitseValmis = () => {
      if (totalDel < totalOrdered) {
        setShowConfirmIncomplete(true);
      } else {
        setShowSignature("valmis");
      }
    };

    return (
      <div className="su">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <button className="tap" onClick={()=>{setViewId(null);setShowSignature(false);}} style={{padding:"9px 16px",background:Y,border:`1px solid ${Y}`,borderRadius:9,color:"#000",fontWeight:700,fontSize:15}}>← Takaisin</button>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {o.status!=="aloittamatta"&&o.status!=="valmis"&&<button className="tap" onClick={handleMerkitseValmis} style={{padding:"10px 16px",background:GREEN,borderRadius:9,color:"#000",fontWeight:700,fontSize:15}}>✅ MERKITSE VALMIS</button>}
          </div>
        </div>
        {showConfirmIncomplete&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:CARD,border:`2px solid ${Y}`,borderRadius:16,padding:"24px 20px",maxWidth:360,width:"100%"}}>
              <div style={{fontSize:22,marginBottom:10,textAlign:"center"}}>⚠️</div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,marginBottom:14,textAlign:"center"}}>TILAUS EI OLE VALMIS</div>
              <div style={{marginBottom:16}}>
                {o.lines.map((ol,i)=>{
                  const missing = ol.orderedTons - ol.deliveredTons;
                  if(missing<=0) return null;
                  const pct = Math.round((missing/ol.orderedTons)*100);
                  return (
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:`${RED}15`,border:`1px solid ${RED}33`,borderRadius:9,marginBottom:6}}>
                      <span style={{fontSize:15,fontWeight:700}}>{MATS[ol.material]?.emoji} {MATS[ol.material]?.label}</span>
                      <span style={{fontSize:15,color:TEXT}}>toimittamatta {fTon(missing)} / {pct}%</span>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:15,color:MUTED,marginBottom:20,lineHeight:1.6,textAlign:"center"}}>
                Haluatko silti merkitä tilauksen valmiiksi?
              </div>
              <div style={{display:"flex",gap:9}}>
                <button className="tap" onClick={()=>setShowConfirmIncomplete(false)} style={{flex:1,padding:"12px",background:"transparent",border:`1px solid ${BORDER}`,borderRadius:9,color:MUTED,fontWeight:700,fontSize:15}}>Peruuta</button>
                <button className="tap" onClick={()=>{setShowConfirmIncomplete(false);setShowSignature("valmis");}} style={{flex:1,padding:"12px",background:GREEN,borderRadius:9,color:"#000",fontWeight:700,fontSize:15}}>Vahvista</button>
              </div>
            </div>
          </div>
        )}
        {showSignature&&(
          <SignatureModal
            orderName={cust?.name}
            title={showSignature==="kuorma" ? "KUITTAA KUORMA" : "MERKITSE VALMIS"}
            order={o}
            deliveries={deliveries}
            onDeliveryClick={(d)=>setShowDeliveryDetail(d)}
            onConfirm={(type)=>{
              setOrders(os=>os.map(x=>{
                if (x.id!==o.id) return x;
                if (showSignature==="kuorma") {
                  return {...x, status:"kesken"};
                } else {
                  return {...x, status:"valmis", confirmedAt:new Date().toISOString(), confirmType:type};
                }
              }));
              setShowSignature(false);
              if (showSignature==="valmis") setShowOrderDone(o.id);
            }}
            onClose={()=>setShowSignature(false)}
          />
        )}
        {showOrderDone&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:CARD,border:`2px solid ${GREEN}`,borderRadius:16,padding:"28px 22px",maxWidth:360,width:"100%",textAlign:"center"}}>
              <div style={{fontSize:48,marginBottom:10}}>✅</div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:26,letterSpacing:2,color:GREEN,marginBottom:8}}>TILAUS VALMIS!</div>
              <div style={{fontSize:15,color:MUTED,marginBottom:24,lineHeight:1.5}}>
                Suljetaanko tilaus vai lisätäänkö tilattuja määriä?
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <button className="tap" onClick={()=>{
                  setShowOrderDone(null);
                  setViewId(null);
                }} style={{width:"100%",padding:"14px",background:GREEN,borderRadius:10,color:"#000",fontWeight:700,fontSize:15,letterSpacing:.5}}>
                  ✓ SULJE TILAUS
                </button>
                <button className="tap" onClick={()=>{
                  const eo = orders.find(x=>x.id===showOrderDone);
                  if (eo) setForm(f=>({...f, customerId:String(eo.customerId), note:eo.note||"", lines:[{material:"kam_0_16",qtyType:"tonnia",tons:""}]}));
                  setEditOrderId(showOrderDone);
                  setShowOrderDone(null);
                  setViewId(null);
                  setShowForm(true);
                }} style={{width:"100%",padding:"14px",background:Y,borderRadius:10,color:"#000",fontWeight:700,fontSize:15,letterSpacing:.5}}>
                  + LISÄTILAUS
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"20px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:1}}>{cust?.name}</div>
              {cust?.phone?(
                <a href={`tel:${cust.phone.replace(/\s/g,"")}`} style={{display:"flex",alignItems:"center",gap:6,textDecoration:"none",marginTop:3,marginBottom:3}}>
                  <span style={{fontSize:16}}>📞</span>
                  <span style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:1,color:Y}}>{cust.phone}</span>
                </a>
              ):(
                <div style={{fontSize:15,color:RED,marginTop:2}}>⚠ Ei puhelinnumeroa</div>
              )}
              <div style={{fontSize:15,color:MUTED,marginTop:2}}>{fDate(o.date)}{o.note&&` · ${o.note}`}</div>
              {o.deliveryTime&&<div style={{fontSize:15,marginTop:3,color:o.deliveryTime==="heti"?Y:MUTED,fontWeight:o.deliveryTime==="heti"?700:400}}>{o.deliveryTime==="heti"?"⚡ Toimitus: HETI":`📅 Toimitus: ${new Date(o.deliveryTime).toLocaleString("fi-FI",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})}`}</div>}
              {o.distance&&<div style={{fontSize:15,marginTop:3,color:MUTED}}>🚛 ~{o.distance.km} km · ~{o.distance.min} min</div>}
              {(() => {
                const cust = customers.find(c=>c.id===o.customerId);
                const addr = o.deliveryAddress || cust?.address;
                if (!addr) return null;
                const origin = encodeURIComponent(WAREHOUSE.address);
                const dest = encodeURIComponent(addr);
                const mapsUrl = `https://maps.google.com/maps?saddr=${origin}&daddr=${dest}&dirflg=d`;
                return (
                  <>
                    <div style={{fontSize:15,color:MUTED,marginTop:2}}>📍 {addr}</div>
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:6,padding:"7px 13px",background:`${Y}18`,border:`1px solid ${Y}55`,borderRadius:8,textDecoration:"none",fontSize:15,color:Y,fontWeight:700}}>
                      🗺️ Näytä reitti kartalla
                    </a>
                  </>
                );
              })()}
              {o.info&&(
                <div style={{marginTop:8,padding:"8px 11px",background:`${Y}11`,borderLeft:`3px solid ${Y}`,borderRadius:6,fontSize:15,color:TEXT,lineHeight:1.5}}>
                  💬 {o.info}
                </div>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
              {o.status!=="aloittamatta"&&o.status!=="valmis"&&(
                <div style={{fontFamily:"'Bebas Neue'",fontSize:42,letterSpacing:1,lineHeight:1,color:pct>=100?GREEN:SC[o.status]}}>
                  {Math.round(pct)}%
                </div>
              )}
              {o.status==="aloittamatta"
                ? <button className="tap" onClick={()=>takeOrder(o.id)} style={{fontSize:15,fontWeight:700,color:"#000",background:Y,border:`2px solid ${Y}`,borderRadius:9,padding:"8px 16px",letterSpacing:0.5}}>▷ ALOITA</button>
                : <span style={{fontSize:15,fontWeight:700,color:SC[o.status],border:`1px solid ${SC[o.status]}44`,borderRadius:8,padding:"4px 10px"}}>{SL[o.status]}</span>
              }
            </div>
          </div>
          {o.status!=="aloittamatta"&&(
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:15,color:MUTED,marginBottom:4}}>
                <span>Toimitettu yhteensä</span>
                <span style={{fontFamily:"monospace",color:pct>=100?GREEN:TEXT}}>{fTon(totalDel)} / {fTon(totalOrdered)}</span>
              </div>
              <div style={{height:6,background:"#333",borderRadius:3,overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",background:pct>=100?GREEN:Y,borderRadius:3,transition:"width .5s"}} />
              </div>
            </div>
          )}
          {o.status!=="aloittamatta"&&o.status!=="valmis"&&(
            <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${BORDER}`}}>
              NAPAUTA TUOTETTA LISÄTÄKSESI KUORMAKIRJA
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:o.lines.length>1?"1fr 1fr":"1fr",gap:10,marginBottom:4}}>
          {o.lines.map((ol,oi)=>{
            const lPct=Math.min(100,ol.orderedTons>0?(ol.deliveredTons/ol.orderedTons)*100:0);
            const canScan = o.status!=="aloittamatta" && o.status!=="valmis";
            // Deliveries for this specific order line (by orderId or customerId+material)
            const lineDels = deliveries.filter(d=>
              (d.orderId===o.id || (!d.orderId && d.customerId===o.customerId)) 
              && d.material===ol.material
            );
            return (
              <div key={oi} style={{padding:"10px 0",borderTop:`1px solid ${BORDER}`,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center"}}>
                  <div className={canScan?"tap":""} onClick={canScan?()=>{if(setScanOpen)setScanOpen(true,o.id);}:undefined}
                    style={{display:"flex",alignItems:"center",gap:8,cursor:canScan?"pointer":"default"}}>
                    <span style={{fontWeight:700}}>{MATS[ol.material]?.emoji} {MATS[ol.material]?.label}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {lineDels.length>0&&(
                      <button className="tap" onClick={e=>{e.stopPropagation();setShowLogFor(showLogFor===`${o.id}-${oi}`?null:`${o.id}-${oi}`);}}
                        style={{fontSize:15,fontWeight:700,color:GREEN,background:`${GREEN}18`,border:`1px solid ${GREEN}44`,borderRadius:6,padding:"2px 10px"}}>
                        📋 {lineDels.length}
                      </button>
                    )}
                    <span style={{fontFamily:"monospace",fontSize:15,color:lPct>=100?GREEN:Y}}>{fTon(ol.deliveredTons)} / {fTon(ol.orderedTons)}</span>
                  </div>
                </div>
                <div style={{height:4,background:"#333",borderRadius:2,overflow:"hidden",marginBottom:5}}>
                  <div style={{width:`${lPct}%`,height:"100%",background:lPct>=100?GREEN:MATS[ol.material]?.color,borderRadius:2,transition:"width .5s"}} />
                </div>
                {showLogFor===`${o.id}-${oi}`&&(
                  <div style={{background:BG,borderRadius:10,overflow:"hidden",marginTop:4,border:`1px solid ${BORDER}`}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",padding:"6px 12px",borderBottom:`1px solid ${BORDER}`}}>
                      <span style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1}}>PVM</span>
                      <span style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,textAlign:"right",paddingRight:12}}>TONNIT</span>
                      <span style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,textAlign:"right"}}>KPL</span>
                    </div>
                    {lineDels.map((d,di)=>(
                      <div key={di} className="tap" onClick={()=>setShowDeliveryDetail(showDeliveryDetail?.id===d.id?null:d)}
                        style={{display:"grid",gridTemplateColumns:"1fr auto auto",padding:"10px 12px",borderBottom:di<lineDels.length-1?`1px solid ${BORDER}22`:"none",
                          background:showDeliveryDetail?.id===d.id?`${Y}10`:"transparent"}}>
                        <span style={{fontSize:15,color:TEXT}}>{fDate(d.date)}</span>
                        <span style={{fontSize:15,fontFamily:"monospace",fontWeight:700,color:Y,textAlign:"right",paddingRight:12}}>{fTon(d.tons)}</span>
                        <span style={{fontSize:15,color:MUTED,textAlign:"right"}}>{di+1}</span>
                      </div>
                    ))}
                    <div style={{display:"grid",gridTemplateColumns:"1fr auto",padding:"8px 12px",background:CARD,borderTop:`1px solid ${BORDER}`}}>
                      <span style={{fontSize:15,color:MUTED,fontWeight:700}}>Yhteensä</span>
                      <span style={{fontSize:15,fontFamily:"monospace",fontWeight:700,color:GREEN}}>{fTon(lineDels.reduce((s,d)=>s+d.tons,0))}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </div>
          {o.status==="valmis"&&o.confirmedAt&&(
            <div style={{marginTop:12,padding:"8px 12px",background:`${GREEN}15`,borderLeft:`3px solid ${GREEN}`,borderRadius:7,fontSize:15,color:GREEN}}>
              ✅ Kuitattu {o.confirmType==="allekirjoitus"?"allekirjoituksella":"pikakuittauksella"} · {new Date(o.confirmedAt).toLocaleString("fi-FI",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})}
            </div>
          )}
        </div>

      {/* Delivery detail modal */}
      {showDeliveryDetail&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:2000,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={e=>e.target===e.currentTarget&&setShowDeliveryDetail(null)}>
          <div style={{background:CARD,borderRadius:"16px 16px 0 0",border:`2px solid ${Y}`,width:"100%",maxWidth:520,padding:"20px 20px 36px",maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:2,color:Y}}>KUORMAKIRJA</div>
              <button className="tap" onClick={()=>setShowDeliveryDetail(null)} style={{padding:"6px 12px",background:"transparent",border:`1px solid ${BORDER}`,borderRadius:8,color:MUTED,fontSize:15}}>✕ Sulje</button>
            </div>
            {showDeliveryDetail.image?(
              <div style={{marginBottom:14,borderRadius:10,overflow:"hidden",border:`1px solid ${BORDER}`,cursor:"zoom-in",position:"relative"}}
                onClick={()=>setZoomImg(showDeliveryDetail.image)}>
                <img src={showDeliveryDetail.image} style={{width:"100%",maxHeight:260,objectFit:"contain",background:"#000",display:"block"}} alt="Vaakalappu" />
                <div style={{position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,.7)",borderRadius:6,padding:"4px 8px",fontSize:13,color:MUTED}}>🔍 Napauta suurentaaksesi</div>
              </div>
            ):(
              <div style={{marginBottom:14,padding:"10px 14px",background:BG,borderRadius:10,textAlign:"center",color:MUTED,fontSize:15}}>
                📷 Kuva tallentuu live-versiossa
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div style={{background:BG,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>PÄIVÄMÄÄRÄ</div>
                <div style={{fontSize:18,fontWeight:700}}>{fDate(showDeliveryDetail.date)}</div>
              </div>
              <div style={{background:BG,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>PAINO</div>
                <div style={{fontFamily:"monospace",fontSize:24,fontWeight:700,color:Y}}>{fTon(showDeliveryDetail.tons)}</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div style={{background:BG,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>TUOTE</div>
                <div style={{fontSize:15,fontWeight:700}}>{MATS[showDeliveryDetail.material]?.emoji} {MATS[showDeliveryDetail.material]?.label}</div>
              </div>
              <div style={{background:BG,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>YKSIKKÖHINTA</div>
                <div style={{fontFamily:"monospace",fontSize:18,fontWeight:700,color:showDeliveryDetail.unitPrice?TEXT:MUTED}}>{showDeliveryDetail.unitPrice?fEur(showDeliveryDetail.unitPrice)+"/t":"—"}</div>
              </div>
            </div>
            {showDeliveryDetail.note&&(
              <div style={{background:BG,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>KOHDE / HUOMIO</div>
                <div style={{fontSize:15}}>📍 {showDeliveryDetail.note}</div>
              </div>
            )}
            {showDeliveryDetail.unitPrice&&showDeliveryDetail.tons&&(
              <div style={{background:`${GREEN}15`,border:`1px solid ${GREEN}44`,borderRadius:10,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:MUTED,fontSize:15,fontWeight:700}}>LASKUTETTAVISSA</span>
                <span style={{fontFamily:"monospace",fontSize:20,fontWeight:700,color:GREEN}}>{fEur(showDeliveryDetail.tons*showDeliveryDetail.unitPrice)}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {zoomImg&&(
        <div style={{position:"fixed",inset:0,background:"#000",zIndex:5000}}>
          <div style={{position:"absolute",top:12,right:12,zIndex:10}}>
            <button onClick={()=>setZoomImg(null)} style={{padding:"8px 16px",background:"rgba(0,0,0,.8)",border:`1px solid ${BORDER}`,borderRadius:8,color:"#fff",fontSize:15,fontWeight:700}}>✕ Sulje</button>
          </div>
          <img src={zoomImg}
            style={{width:"100%",height:"100%",objectFit:"contain",touchAction:"pinch-zoom"}}
            alt="Vaakalappu" />
          <div style={{position:"absolute",bottom:16,left:0,right:0,textAlign:"center",color:"rgba(255,255,255,.5)",fontSize:14,pointerEvents:"none"}}>
            👆 Nipistä zoomaamiseksi
          </div>
        </div>
      )}
      </div>
    );
  }

  return (
    <div className="su">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:26,letterSpacing:2}}>TILAUKSET</div>
          <div style={{color:MUTED,fontSize:15}}>{orders.filter(o=>o.status!=="valmis").length} avoinna</div>
        </div>
        <button className="tap" onClick={()=>{
          setEditOrderId(null);
          setWizardStep(1);
          setNewCustForm(null);
          setCustSearch("");
          setWizardLineIdx(0);
          setShowForm(!showForm);
        }} style={{padding:"9px 18px",background:Y,borderRadius:9,color:"#000",fontWeight:700,fontSize:15}}>+ UUSI TILAUS</button>
      </div>

      {showForm&&(
        <div style={{position:"fixed",inset:0,zIndex:400,background:BG,display:"flex",flexDirection:"column"}}>

          {/* Progress bar */}
          <div style={{background:CARD,borderBottom:`1px solid ${BORDER}`,padding:"12px 16px 0"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <button className="tap" onClick={()=>{if(wizardStep>1)setWizardStep(s=>s-1);else{setShowForm(false);}}} style={{padding:"8px 18px",background:wizardStep>1?Y:"transparent",border:`2px solid ${wizardStep>1?Y:BORDER}`,borderRadius:10,color:wizardStep>1?"#000":MUTED,fontWeight:700,fontSize:15}}>
                {wizardStep>1?"← Takaisin":"✕ Peruuta"}
              </button>
              <span style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,color:MUTED}}>{wizardStep} / 8</span>
            </div>
            <div style={{height:3,background:BORDER,borderRadius:2,marginBottom:0}}>
              <div style={{height:"100%",width:`${(wizardStep/7)*100}%`,background:Y,borderRadius:2,transition:"width .3s"}} />
            </div>
          </div>

          {/* Step content */}
          <div style={{flex:1,overflowY:"auto",padding:"24px 20px"}}>

            {/* STEP 1: Asiakas */}
            {wizardStep===1&&(
              <div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:38,letterSpacing:3,color:Y,marginBottom:6}}>{newCustForm?"UUSI ASIAKAS":"ASIAKAS"}</div>
                <div style={{color:MUTED,fontSize:15,marginBottom:24}}>{newCustForm?"Syötä asiakkaan tiedot":"Kenelle toimitus menee?"}</div>
                {!newCustForm && (
                  <div style={{position:"relative",marginBottom:16}}>
                    <input
                      value={custSearch}
                      onChange={e=>setCustSearch(e.target.value)}
                      placeholder="🔍 Hae asiakasta..."
                      style={{width:"100%",padding:"14px 16px",background:CARD,border:`2px solid ${custSearch?Y:BORDER}`,borderRadius:12,color:TEXT,fontSize:17,boxSizing:"border-box"}}
                    />
                    {custSearch&&<button className="tap" onClick={()=>setCustSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:MUTED,fontSize:20}}>✕</button>}
                  </div>
                )}
                {!newCustForm && customers.filter(c=>!custSearch||c.name.toLowerCase().includes(custSearch.toLowerCase())||c.address?.toLowerCase().includes(custSearch.toLowerCase())).map(c=>{
                  const sel = String(form.customerId)===String(c.id);
                  return (
                    <div key={c.id}>
                      <div className="tap" onClick={()=>{
                        setForm(f=>({...f,customerId:String(c.id),useCustomerAddress:null,deliveryAddress:"",deliveryKm:""}));
                        setDistance(null);
                      }} style={{padding:"18px 20px",background:sel?`${Y}18`:CARD,border:`2px solid ${sel?Y:BORDER}`,borderRadius:14,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:20,color:sel?Y:TEXT}}>{c.name}</div>
                          {c.address&&<div style={{fontSize:15,color:MUTED,marginTop:3}}>📍 {c.address}</div>}
                          {c.phone&&<div style={{fontSize:15,color:MUTED,marginTop:2}}>📞 {c.phone}</div>}
                        </div>
                        {sel&&<span style={{fontSize:28}}>✓</span>}
                      </div>
                    </div>
                  );
                })}
                {newCustForm===null?(
                  <div className="tap" onClick={()=>setNewCustForm({name:"",phone:"",address:"",ytunnus:""})} style={{marginTop:8,padding:"14px 16px",background:CARD,border:`1px dashed ${Y}44`,borderRadius:12,color:Y,fontSize:15,fontWeight:700,textAlign:"center"}}>
                    + Lisää uusi asiakas
                  </div>
                ):(
                  <div style={{marginTop:8,background:CARD,border:`2px solid ${Y}`,borderRadius:14,padding:"16px 18px"}}>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:2,color:Y,marginBottom:14}}>UUSI ASIAKAS</div>
                    {/* Y-tunnus haku */}
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:5}}>Y-TUNNUS</div>
                      <div style={{display:"flex",gap:8}}>
                        <input type="text" value={newCustForm.ytunnus||""} onChange={e=>setNewCustForm(f=>({...f,ytunnus:e.target.value}))}
                          placeholder="1234567-8" style={{flex:1,padding:"13px 14px",background:BG,border:`1px solid ${newCustForm.ytunnus?Y:BORDER}`,borderRadius:9,color:TEXT,fontSize:16}} />
                        <button className="tap" onClick={async()=>{
                          const ytunnus=(newCustForm.ytunnus||"").replace(/\s/g,"");
                          if(!ytunnus) return;
                          setNewCustForm(f=>({...f,_ytjLoading:true,_ytjError:null}));
                          try {
                            const res = await fetch(`https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=${ytunnus}`);
                            const data = await res.json();
                            const co = data.companies?.[0];
                            if(!co) { setNewCustForm(f=>({...f,_ytjLoading:false,_ytjError:"Yritystä ei löydy YTJ:stä"})); return; }
                            const name = co.names?.find(n=>!n.endDate)?.name || co.names?.[0]?.name || "";
                            const addr = co.addresses?.find(a=>!a.endDate) || co.addresses?.[0];
                            const addrStr = addr ? [addr.street,addr.postCode,addr.city].filter(Boolean).join(", ") : "";
                            setNewCustForm(f=>({...f,
                              name: name || f.name,
                              address: addrStr || f.address,
                              _ytjLoading:false,
                              _ytjError:null,
                              _ytjOk:name
                            }));
                          } catch(e) {
                            setNewCustForm(f=>({...f,_ytjLoading:false,_ytjError:"Haку epäonnistui"}));
                          }
                        }} style={{padding:"12px 16px",background:newCustForm._ytjLoading?BORDER:`${Y}22`,border:`1px solid ${Y}55`,borderRadius:9,color:Y,fontWeight:700,fontSize:15,whiteSpace:"nowrap"}}>
                          {newCustForm._ytjLoading?"⏳":"🔍 Hae"}
                        </button>
                      </div>
                      {newCustForm._ytjOk&&<div style={{marginTop:6,fontSize:15,color:GREEN}}>✓ Haettu: {newCustForm._ytjOk}</div>}
                      {newCustForm._ytjError&&<div style={{marginTop:6,fontSize:15,color:RED}}>{newCustForm._ytjError}</div>}
                    </div>
                    {/* Muut kentät */}
                    {[["name","NIMI *","Yritys tai henkilö","text"],["phone","PUHELINNUMERO","050 123 4567","tel"],["address","OSOITE","Katuosoite, postinumero, kaupunki","text"]].map(([field,label,ph,type])=>(
                      <div key={field} style={{marginBottom:12}}>
                        <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:5}}>{label}</div>
                        <input type={type} value={newCustForm[field]||""} onChange={e=>setNewCustForm(f=>({...f,[field]:e.target.value}))}
                          placeholder={ph} style={{width:"100%",padding:"13px 14px",background:BG,border:`1px solid ${newCustForm[field]?Y:BORDER}`,borderRadius:9,color:TEXT,fontSize:16}} />
                      </div>
                    ))}
                    <div style={{display:"flex",gap:10,marginTop:6}}>
                      <button className="tap" onClick={()=>setNewCustForm(null)} style={{flex:1,padding:"12px",background:"transparent",border:`1px solid ${BORDER}`,borderRadius:10,color:MUTED,fontSize:15,fontWeight:700}}>Peruuta</button>
                      <button className="tap" onClick={()=>{
                        if(!newCustForm.name.trim()) return;
                        const newId2 = Date.now();
                        const newC = {id:newId2, name:newCustForm.name.trim(), phone:newCustForm.phone.trim(), address:newCustForm.address.trim(), ytunnus:newCustForm.ytunnus.trim()};
                        setCust(cs=>[...cs, newC]);
                        setForm(f=>({...f,customerId:String(newId2)}));
                        setDistance(null);
                        if(newC.address) fetchDistance(newC);
                        setNewCustForm(null);
                      }} style={{flex:2,padding:"12px",background:Y,borderRadius:10,color:"#000",fontSize:15,fontWeight:700}}>✓ Tallenna ja valitse</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Reitti */}
            {wizardStep===2&&(()=>{
              const cust=customers.find(c=>String(c.id)===String(form.customerId));
              const addrForCalc = form.useCustomerAddress===false ? form.deliveryAddress : cust?.address;
              const mapsUrl=addrForCalc?`https://maps.google.com/maps?saddr=${encodeURIComponent(WAREHOUSE.address)}&daddr=${encodeURIComponent(addrForCalc)}&dirflg=d`:null;
              const effectiveKm = parseFloat(form.deliveryKm)||(distance?.km||0);
              return (
                <div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:38,letterSpacing:3,color:Y,marginBottom:6}}>REITTI</div>
                  <div style={{color:MUTED,fontSize:15,marginBottom:20}}>Mitä reittiä ajetaan?</div>

                  {/* Address question */}
                  {form.useCustomerAddress===null&&cust?.address&&(
                    <div style={{background:CARD,borderRadius:14,padding:"18px",marginBottom:16}}>
                      <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Toimitusosoite:</div>
                      <div style={{fontSize:15,color:MUTED,marginBottom:16}}>📍 {cust.address}</div>
                      <div style={{fontSize:15,marginBottom:12}}>Toimitetaanko tähän osoitteeseen?</div>
                      <div style={{display:"flex",gap:10}}>
                        <button className="tap" onClick={()=>{
                          setForm(f=>({...f,useCustomerAddress:true,deliveryAddress:cust.address}));
                          fetchDistance(cust);
                        }} style={{flex:1,padding:"12px",background:GREEN,borderRadius:10,color:"#000",fontWeight:700,fontSize:15}}>✓ Kyllä</button>
                        <button className="tap" onClick={()=>setForm(f=>({...f,useCustomerAddress:false,deliveryAddress:"",_addrStreet:"",_addrZip:"",_addrCity:""}))}
                          style={{flex:1,padding:"12px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:TEXT,fontWeight:700,fontSize:15}}>✎ Eri osoite</button>
                      </div>

                    </div>
                  )}

                  {/* Custom delivery address input */}
                  {form.useCustomerAddress===false&&(()=>{
                    const parts = (form.deliveryAddress||'').split(',').map(s=>s.trim());
                    const street = form._addrStreet ?? (parts[0]||'');
                    const zip = form._addrZip ?? (parts[1]?.match(/^\d{5}/)?.[0]||'');
                    const city = form._addrCity ?? (parts[1]?.replace(/^\d{5}\s*/,'')||parts[2]||'');
                    const fullAddr = [street, zip&&city?`${zip} ${city}`:city||zip].filter(Boolean).join(', ');
                    const allFilled = street && (zip||city);
                    return (
                      <div style={{marginBottom:16}}>
                        <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:10}}>TOIMITUSOSOITE</div>
                        <input value={street} onChange={e=>{setForm(f=>({...f,_addrStreet:e.target.value,deliveryAddress:[e.target.value,zip&&city?`${zip} ${city}`:city||zip].filter(Boolean).join(', ')}));}}
                          placeholder="Katuosoite"
                          style={{width:"100%",padding:"14px",background:CARD,border:`2px solid ${street?Y:BORDER}`,borderRadius:12,color:TEXT,fontSize:16,boxSizing:"border-box",marginBottom:8}} />
                        <div style={{display:"grid",gridTemplateColumns:"2fr 3fr",gap:8,marginBottom:8}}>
                          <input value={zip} onChange={e=>{const z=e.target.value;setForm(f=>({...f,_addrZip:z,deliveryAddress:[street,z&&city?`${z} ${city}`:city||z].filter(Boolean).join(', ')}));}}
                            placeholder="Postinumero" type="tel"
                            style={{padding:"14px",background:CARD,border:`2px solid ${zip?Y:BORDER}`,borderRadius:12,color:TEXT,fontSize:16,boxSizing:"border-box"}} />
                          <input value={city} onChange={e=>{const c=e.target.value;setForm(f=>({...f,_addrCity:c,deliveryAddress:[street,zip&&c?`${zip} ${c}`:c||zip].filter(Boolean).join(', ')}));}}
                            onBlur={async e=>{
                              const c=e.target.value.trim();
                              if(c&&street&&!zip){
                                try{
                                  const q=encodeURIComponent(`${street}, ${c}, Finland`);
                                  const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`,{headers:{'Accept-Language':'fi'}});
                                  const d=await r.json();
                                  if(d?.[0]){
                                    const detail=await fetch(`https://nominatim.openstreetmap.org/details?place_id=${d[0].place_id}&format=json&addressdetails=1`);
                                    const dd=await detail.json();
                                    const pc=dd?.address?.postcode||d[0].display_name?.match(/\b\d{5}\b/)?.[0];
                                    if(pc) setForm(f=>({...f,_addrZip:pc,deliveryAddress:[street,`${pc} ${c}`].join(', ')}));
                                  }
                                }catch{}
                              }
                            }}
                            placeholder="Paikkakunta"
                            style={{padding:"14px",background:CARD,border:`2px solid ${city?Y:BORDER}`,borderRadius:12,color:TEXT,fontSize:16,boxSizing:"border-box"}} />
                        </div>
                        {allFilled&&(
                          <button className="tap" onClick={()=>fetchDistance(cust, fullAddr)}
                            style={{width:"100%",padding:"10px",background:`${Y}18`,border:`1px solid ${Y}44`,borderRadius:9,color:Y,fontWeight:700,fontSize:15}}>
                            🗺️ Laske matka tähän osoitteeseen
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {cust&&(
                    <div style={{background:CARD,borderRadius:14,padding:"16px 18px",marginBottom:20}}>
                      <div style={{fontWeight:700,fontSize:18,marginBottom:4}}>{cust.name}</div>
                      {addrForCalc&&<div style={{fontSize:15,color:MUTED,marginBottom:8}}>📍 {addrForCalc}</div>}
                      {distLoading&&<div style={{fontSize:15,color:MUTED,marginBottom:12}}>🔄 Lasketaan lyhintä reittiä...</div>}
                      {!distLoading&&distance&&<div style={{fontSize:15,color:Y,fontWeight:700,marginBottom:12}}>🚛 Lyhin reitti: ~{distance.km} km · ~{distance.min} min</div>}
                      {!distLoading&&!distance&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                        <span style={{fontSize:15,color:MUTED}}>Etäisyyttä ei saatu</span>
                        <button className="tap" onClick={()=>fetchDistance(cust,addrForCalc)} style={{fontSize:15,color:Y,background:`${Y}18`,border:`1px solid ${Y}44`,borderRadius:6,padding:"2px 10px",fontWeight:700}}>↺ Yritä uudelleen</button>
                      </div>}
                      {mapsUrl&&<a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"14px",background:`${Y}20`,border:`2px solid ${Y}55`,borderRadius:11,textDecoration:"none",fontSize:16,color:Y,fontWeight:700}}>🗺️ Avaa Google Maps</a>}
                    </div>
                  )}
                  <div style={{background:CARD,borderRadius:14,padding:"16px 18px"}}>
                    <div style={{fontSize:15,color:MUTED,marginBottom:8,fontWeight:700,letterSpacing:1}}>AJETTAVA MATKA KM</div>
                    <div style={{color:MUTED,fontSize:15,marginBottom:12}}>{distance?`Lyhin reitti: ${distance.km} km. Muuta tarvittaessa.`:distLoading?"Lasketaan...":"Syötä matka käsin tai avaa Google Maps."}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <input type="number" value={form.deliveryKm} onChange={e=>setForm(f=>({...f,deliveryKm:e.target.value}))}
                        placeholder={distance?String(distance.km):"0"} step="0.1" min="0"
                        style={{flex:1,padding:"14px 16px",background:BG,border:`2px solid ${form.deliveryKm?Y:BORDER}`,borderRadius:10,color:Y,fontSize:28,fontFamily:"monospace",fontWeight:700}} />
                      <span style={{fontSize:20,color:MUTED,fontWeight:700}}>km</span>
                    </div>
                    {effectiveKm>0&&(
                      <div style={{marginTop:12,padding:"10px 14px",background:`${GREEN}15`,border:`1px solid ${GREEN}44`,borderRadius:9,fontSize:15}}>
                        <span style={{color:MUTED}}>Rahti: </span>
                        <span style={{color:Y,fontWeight:700}}>{fEur(1.50+Math.max(0,effectiveKm-1)*0.20)}/t</span>
                        <span style={{color:MUTED}}> ({effectiveKm} km)</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* STEP 3: Tuote */}
            {wizardStep===3&&(()=>{
              const cust = customers.find(c=>String(c.id)===String(form.customerId));
              if(!cust) return null;
              const tmpPh = form._tmpPhone||'';
              const digits = tmpPh.replace(/\D/g,'');
              const validPhone = digits.length>=10 && digits.length<=11;
              return (
                <div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:38,letterSpacing:3,color:Y,marginBottom:6}}>YHTEYSTIEDOT</div>
                  <div style={{color:MUTED,fontSize:15,marginBottom:24}}>Asiakkaan puhelinnumero</div>
                  <div style={{background:CARD,borderRadius:14,padding:"20px 18px"}}>
                    <div style={{fontWeight:700,fontSize:18,marginBottom:16}}>{cust?.name}</div>
                    {cust?.phone?(
                      <div>
                        <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:6}}>PUHELINNUMERO</div>
                        <a href={`tel:${cust.phone.replace(/\s/g,"")}`} style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none"}}>
                          <span style={{fontSize:24}}>📞</span>
                          <span style={{fontFamily:"'Bebas Neue'",fontSize:28,letterSpacing:1,color:Y}}>{cust.phone}</span>
                        </a>
                        <div style={{fontSize:15,color:MUTED,marginTop:12}}>Puhelin on jo tallennettu. Voit jatkaa eteenpäin.</div>
                      </div>
                    ):(
                      <div>
                        <div style={{fontSize:15,color:RED,fontWeight:700,marginBottom:16}}>⚠ Ei puhelinnumeroa tallennettu</div>
                        <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:8}}>PUHELINNUMERO</div>
                        <input type="tel" value={tmpPh} onChange={e=>setForm(f=>({...f,_tmpPhone:e.target.value}))}
                          placeholder="040 123 4567" autoFocus
                          style={{width:"100%",padding:"16px",background:BG,border:`2px solid ${tmpPh?(validPhone?GREEN:RED):BORDER}`,borderRadius:12,color:TEXT,fontSize:22,fontFamily:"monospace",boxSizing:"border-box"}} />
                        <div style={{fontSize:15,marginTop:8,color:validPhone?GREEN:tmpPh?RED:MUTED}}>
                          {!tmpPh?"Syötä 10–11 numeroinen puhelinnumero":validPhone?"✓ Tallennetaan asiakkaalle kun jatkat":`✗ Liian ${digits.length<10?"lyhyt":"pitkä"} (${digits.length} numeroa)`}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {wizardStep===4&&(
              <div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:38,letterSpacing:3,color:Y,marginBottom:6}}>TUOTE</div>
                <div style={{color:MUTED,fontSize:15,marginBottom:20}}>{form.lines.length>1?`Kuorma ${wizardLineIdx+1} / ${form.lines.length} — mitä toimitetaan?`:"Mitä toimitetaan?"}</div>
                {Object.entries(MATS).map(([k,m])=>{
                  const sel=form.lines[wizardLineIdx]?.material===k;
                  const s=stock[k]||0;
                  const low=s<300;
                  return (
                    <div key={k} className="tap" onClick={()=>updateLine(wizardLineIdx,"material",k)} style={{padding:"18px 20px",background:sel?`${Y}18`:CARD,border:`2px solid ${sel?Y:BORDER}`,borderRadius:14,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:20,fontWeight:700,color:sel?Y:TEXT}}>{m.emoji} {m.label}</div>
                        <div style={{fontSize:15,color:low?RED:MUTED,marginTop:3}}>Varasto: {fTon(s)}</div>
                      </div>
                      {sel&&<span style={{fontSize:28}}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* STEP 5: Tonnit */}
            {wizardStep===5&&(()=>{
              const line=form.lines[wizardLineIdx];
              const mat=MATS[line?.material];
              const {price}=form.customerId?suggestPrice(form.customerId,line?.material):{price:0};
              const ekm=parseFloat(form.deliveryKm)||(distance?.km||0);
              const totalPrice=freightPrice(price,ekm);
              const tons=parseFloat(line?.tons)||0;
              return (
                <div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:38,letterSpacing:3,color:Y,marginBottom:6}}>MÄÄRÄ</div>
                  <div style={{color:MUTED,fontSize:15,marginBottom:24}}>{mat?.emoji} {mat?.label}</div>
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:10}}>KUORMATYYPPI</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                      {TRUCK_TYPES.map(t=>{
                        const sel=line?.qtyType===t.id;
                        return (
                          <button key={t.id} className="tap" onClick={()=>updateLine(wizardLineIdx,"qtyType",t.id)} style={{padding:"16px 8px",background:sel?`${Y}18`:CARD,border:`2px solid ${sel?Y:BORDER}`,borderRadius:12,color:sel?Y:MUTED,fontWeight:700,fontSize:15,textAlign:"center"}}>
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:10}}>TONNIT</div>
                    <input type="number" value={line?.tons||""} onChange={e=>updateLine(wizardLineIdx,"tons",e.target.value)}
                      placeholder="0,00" step="0.01"
                      style={{width:"100%",padding:"20px",background:CARD,border:`3px solid ${line?.tons?Y:BORDER}`,borderRadius:14,color:Y,fontSize:48,fontFamily:"monospace",fontWeight:700,textAlign:"center"}} />
                  </div>
                  {tons>0&&price>0&&(
                    <div style={{background:`${GREEN}15`,border:`1px solid ${GREEN}44`,borderRadius:12,padding:"14px 18px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{color:MUTED,fontSize:15}}>Yksikköhinta</span>
                        <span style={{color:Y,fontWeight:700,fontSize:16}}>{fEur(totalPrice)}/t</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{color:MUTED,fontSize:15}}>Yhteensä</span>
                        <span style={{color:GREEN,fontWeight:700,fontSize:20}}>{fEur(tons*totalPrice)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* STEP 5: Hinta */}
            {wizardStep===6&&(()=>{
              const line = form.lines[wizardLineIdx];
              const mat = MATS[line?.material];
              const ekm = parseFloat(form.deliveryKm)||(distance?.km||0);
              const {price: basePrice} = form.customerId ? suggestPrice(form.customerId, line?.material) : {price:0};
              const calcPrice = freightPrice(basePrice, ekm);
              // Get price history for this customer + material
              const history = deliveries
                .filter(d=>d.customerId===parseInt(form.customerId) && d.material===line?.material)
                .sort((a,b)=>new Date(b.date)-new Date(a.date))
                .slice(0,20);
              const tons = parseFloat(line?.tons)||0;
              const customPrice = form.lines[wizardLineIdx]?.customPrice;
              const finalPrice = customPrice !== undefined ? customPrice : calcPrice;
              return (
                <div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:38,letterSpacing:3,color:Y,marginBottom:6}}>HINTA</div>
                  <div style={{color:MUTED,fontSize:15,marginBottom:20}}>{mat?.emoji} {mat?.label} · {fTon(tons)}</div>

                  {/* Calculated price card */}
                  <div style={{background:CARD,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
                    <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:10}}>LASKETTU HINTA</div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{color:MUTED,fontSize:15}}>Noutohinta</span>
                      <span style={{color:TEXT,fontSize:15,fontFamily:"monospace"}}>{fEur(basePrice)}/t</span>
                    </div>
                    {ekm>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{color:MUTED,fontSize:15}}>Rahti ({ekm} km)</span>
                      <span style={{color:TEXT,fontSize:15,fontFamily:"monospace"}}>+{fEur(1.50+Math.max(0,ekm-1)*0.20)}/t</span>
                    </div>}
                    <div style={{borderTop:`1px solid ${BORDER}`,paddingTop:8,marginTop:4,display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontWeight:700,fontSize:15}}>Yhteensä</span>
                      <span style={{color:Y,fontWeight:700,fontSize:18,fontFamily:"monospace"}}>{fEur(calcPrice)}/t</span>
                    </div>
                  </div>

                  {/* History */}
                  {history.length>0&&(
                    <div style={{marginBottom:16}}>
                      <button className="tap" onClick={()=>setForm(f=>({...f,lines:f.lines.map((l,idx)=>idx===wizardLineIdx?{...l,_showHistory:!l._showHistory}:l)}))}
                        style={{width:"100%",padding:"12px 16px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:form.lines[wizardLineIdx]?._showHistory?0:0}}>
                        <span style={{color:MUTED,fontSize:15,fontWeight:700}}>📋 Myyntihistoria tälle asiakkaalle</span>
                        <span style={{color:Y,fontSize:15,fontWeight:700}}>{history.length} toimitusta {form.lines[wizardLineIdx]?._showHistory?"▲":"▼"}</span>
                      </button>
                      {form.lines[wizardLineIdx]?._showHistory&&(
                        <div style={{background:BG,border:`1px solid ${BORDER}`,borderRadius:"0 0 12px 12px",overflow:"hidden",marginTop:-1}}>
                          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",padding:"8px 14px",borderBottom:`1px solid ${BORDER}`}}>
                            <span style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1}}>PVM</span>
                            <span style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,textAlign:"right",paddingRight:16}}>TONNIT</span>
                            <span style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,textAlign:"right"}}>€/T</span>
                          </div>
                          {history.map((d,i)=>(
                            <div key={i} className="tap" onClick={()=>setForm(f=>({...f,lines:f.lines.map((l,idx)=>idx===wizardLineIdx?{...l,customPrice:d.unitPrice}:l)}))}
                              style={{display:"grid",gridTemplateColumns:"1fr auto auto",padding:"11px 14px",borderBottom:i<history.length-1?`1px solid ${BORDER}22`:"none",background:finalPrice===d.unitPrice?`${Y}10`:"transparent"}}>
                              <span style={{fontSize:15,color:finalPrice===d.unitPrice?Y:MUTED}}>{fDate(d.date)}</span>
                              <span style={{fontSize:15,fontFamily:"monospace",color:TEXT,textAlign:"right",paddingRight:16}}>{fTon(d.tons)}</span>
                              <span style={{fontSize:15,fontFamily:"monospace",fontWeight:700,color:finalPrice===d.unitPrice?Y:TEXT,textAlign:"right"}}>{fEur(d.unitPrice)}</span>
                            </div>
                          ))}
                          <div style={{padding:"10px 14px",borderTop:`1px solid ${BORDER}`,display:"grid",gridTemplateColumns:"1fr auto auto",background:CARD}}>
                            <span style={{fontSize:15,color:MUTED,fontWeight:700}}>YHTEENSÄ</span>
                            <span style={{fontSize:15,fontFamily:"monospace",fontWeight:700,textAlign:"right",paddingRight:16}}>{fTon(history.reduce((s,d)=>s+d.tons,0))}</span>
                            <span style={{fontSize:15,color:MUTED,textAlign:"right"}}>—</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Custom price input */}
                  <div style={{background:CARD,borderRadius:14,padding:"16px 18px"}}>
                    <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:10}}>VAHVISTA TAI MUUTA HINTAA</div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <input type="number" step="0.01"
                        value={parseFloat((customPrice !== undefined ? customPrice : calcPrice).toFixed(2))}
                        onChange={e=>setForm(f=>({...f,lines:f.lines.map((l,idx)=>idx===wizardLineIdx?{...l,customPrice:parseFloat(e.target.value)||0}:l)}))}
                        style={{flex:1,padding:"14px",background:BG,border:`2px solid ${customPrice!==undefined&&customPrice!==calcPrice?Y:BORDER}`,borderRadius:10,color:Y,fontSize:28,fontFamily:"monospace",fontWeight:700,textAlign:"center"}} />
                      <span style={{color:MUTED,fontWeight:700}}>€/t</span>
                    </div>
                    {customPrice!==undefined&&customPrice!==calcPrice&&(
                      <button className="tap" onClick={()=>setForm(f=>({...f,lines:f.lines.map((l,idx)=>idx===wizardLineIdx?{...l,customPrice:undefined}:l)}))}
                        style={{marginTop:8,fontSize:15,color:MUTED,background:"transparent",border:"none",textDecoration:"underline"}}>
                        ← Palauta laskettu hinta ({fEur(calcPrice)}/t)
                      </button>
                    )}
                    {tons>0&&<div style={{marginTop:12,padding:"10px 14px",background:`${GREEN}15`,border:`1px solid ${GREEN}44`,borderRadius:9,display:"flex",justifyContent:"space-between"}}>
                      <span style={{color:MUTED,fontSize:15}}>Yhteensä</span>
                      <span style={{color:GREEN,fontWeight:700,fontSize:20}}>{fEur(tons*finalPrice)}</span>
                    </div>}
                  </div>
                </div>
              );
            })()}


            {/* STEP 6: Toimitusaika */}
            {wizardStep===7&&(
              <div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:38,letterSpacing:3,color:Y,marginBottom:6}}>AIKATAULU</div>
                <div style={{color:MUTED,fontSize:15,marginBottom:28}}>Milloin toimitetaan?</div>
                <div className="tap" onClick={()=>setForm(f=>({...f,deliveryTime:"heti"}))} style={{padding:"24px 20px",background:form.deliveryTime==="heti"?`${Y}18`:CARD,border:`3px solid ${form.deliveryTime==="heti"?Y:BORDER}`,borderRadius:16,marginBottom:16,display:"flex",alignItems:"center",gap:16}}>
                  <span style={{fontSize:40}}>⚡</span>
                  <div>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:28,letterSpacing:2,color:form.deliveryTime==="heti"?Y:TEXT}}>HETI</div>
                    <div style={{fontSize:15,color:MUTED}}>Toimitus mahdollisimman pian</div>
                  </div>
                  {form.deliveryTime==="heti"&&<span style={{marginLeft:"auto",fontSize:28}}>✓</span>}
                </div>
                <div style={{padding:"20px",background:form.deliveryTime&&form.deliveryTime!=="heti"?`${Y}18`:CARD,border:`3px solid ${form.deliveryTime&&form.deliveryTime!=="heti"?Y:BORDER}`,borderRadius:16,marginBottom:20}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                    <span style={{fontSize:36}}>📅</span>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:2,color:form.deliveryTime&&form.deliveryTime!=="heti"?Y:TEXT}}>SOVITTU AIKA</div>
                      <div style={{fontSize:15,color:MUTED}}>Valitse päivä ja kellonaika</div>
                    </div>
                    {form.deliveryTime&&form.deliveryTime!=="heti"&&<span style={{fontSize:20,color:GREEN}}>✓</span>}
                  </div>
                  <input type="datetime-local"
                    value={form.deliveryTime!=="heti"?form.deliveryTime:""}
                    onChange={e=>setForm(f=>({...f,deliveryTime:e.target.value||"heti"}))}
                    min={new Date().toISOString().slice(0,16)}
                    style={{width:"100%",padding:"14px",background:BG,border:`2px solid ${form.deliveryTime&&form.deliveryTime!=="heti"?Y:BORDER}`,borderRadius:10,color:TEXT,fontSize:17,boxSizing:"border-box",colorScheme:"dark"}} />
                  {form.deliveryTime&&form.deliveryTime!=="heti"&&(
                    <button className="tap" onClick={()=>setForm(f=>({...f,deliveryTime:"heti"}))} style={{marginTop:8,fontSize:15,color:MUTED,background:"transparent",border:"none",padding:0,cursor:"pointer"}}>
                      ✕ Poista — käytä HETI
                    </button>
                  )}
                </div>
                <div style={{marginTop:24}}>
                  <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>LISÄTIETOA KULJETUKSESTA</div>
                  <div style={{fontSize:15,color:MUTED,marginBottom:8}}>Ei siirry laskulle</div>
                  <textarea value={form.info} onChange={e=>setForm(f=>({...f,info:e.target.value}))}
                    placeholder="Erityistoiveet, ajankohta, lisätiedot..." rows={3}
                    style={{width:"100%",padding:"14px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:TEXT,fontSize:15,resize:"vertical"}}></textarea>
                </div>
                <div style={{marginTop:12}}>
                  <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:8}}>TYÖMAA / KOHDE (valinnainen)</div>
                  <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Osoite tai kohteen nimi..."
                    style={{width:"100%",padding:"14px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:TEXT,fontSize:15}} />
                </div>
              </div>
            )}

            {/* STEP 5: Yhteenveto */}
            {wizardStep===8&&(()=>{
              const cust=customers.find(c=>String(c.id)===String(form.customerId));
              const ekm=parseFloat(form.deliveryKm)||(distance?.km||0);
              const totalTons=form.lines.reduce((s,l)=>s+(parseFloat(l.tons)||0),0);
              const grandTotal=form.lines.reduce((s,line)=>{
                const {price}=suggestPrice(form.customerId,line.material);
                return s+(parseFloat(line.tons)||0)*(line.customPrice!==undefined?line.customPrice:freightPrice(price,ekm));
              },0);
              return (
                <div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:38,letterSpacing:3,color:Y,marginBottom:6}}>YHTEENVETO</div>

                  {/* Asiakas + Reitti side by side */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div style={{background:CARD,borderRadius:12,padding:"12px 14px"}}>
                      <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>ASIAKAS</div>
                      <div className="tap" onClick={()=>setShowCustDetail(s=>!s)} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontSize:16,fontWeight:700,lineHeight:1.2}}>{cust?.name||"—"}</div>
                        <span style={{color:MUTED,fontSize:15}}>{showCustDetail?"▲":"▼"}</span>
                      </div>
                      {form.deliveryAddress&&<div style={{fontSize:15,color:MUTED,marginTop:4}}>📍 {form.deliveryAddress}</div>}
                      {showCustDetail&&(
                        <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <div style={{background:BG,borderRadius:9,padding:"10px 12px"}}>
                            <div style={{fontSize:12,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>POSTIOSOITE</div>
                            <div style={{fontSize:15,color:TEXT}}>{cust?.address||"—"}</div>
                            {cust?.ytunnus&&<div style={{fontSize:15,color:MUTED,marginTop:4}}>Y: {cust.ytunnus}</div>}
                            {cust?.phone&&<div style={{fontSize:15,color:MUTED,marginTop:2}}>📞 {cust.phone}</div>}
                          </div>
                          <div style={{background:BG,borderRadius:9,padding:"10px 12px"}}>
                            <div style={{fontSize:12,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>TOIMITUSOSOITE</div>
                            <div style={{fontSize:15,color:form.deliveryAddress?TEXT:MUTED}}>{form.deliveryAddress||cust?.address||"—"}</div>
                            {form.deliveryAddress&&form.deliveryAddress!==cust?.address&&(
                              <div style={{fontSize:12,color:Y,marginTop:4}}>⚠ Eri kuin postiosoite</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{background:CARD,borderRadius:12,padding:"12px 14px"}}>
                      <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>REITTI & AIKA</div>
                      <div style={{fontSize:18,fontWeight:700,color:Y}}>{ekm} km</div>
                      <div style={{fontSize:15,color:MUTED,marginTop:2}}>
                        {form.deliveryTime==="heti"?"⚡ HETI":form.deliveryTime?new Date(form.deliveryTime).toLocaleString("fi-FI",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}
                      </div>
                    </div>
                  </div>

                  {/* Products in 2-column grid */}
                  <div style={{display:"grid",gridTemplateColumns:form.lines.length>1?"1fr 1fr":"1fr",gap:10,marginBottom:10}}>
                    {form.lines.map((line,idx)=>{
                      const {price}=suggestPrice(form.customerId,line.material);
                      const finalPrice=line.customPrice!==undefined?line.customPrice:freightPrice(price,ekm);
                      const tons=parseFloat(line.tons)||0;
                      return (
                        <div key={idx} style={{background:CARD,borderRadius:12,padding:"12px 14px"}}>
                          <div style={{fontSize:15,color:MUTED,fontWeight:700,letterSpacing:1,marginBottom:4}}>{form.lines.length>1?`TUOTE ${idx+1}`:"TUOTE"}</div>
                          <div style={{fontSize:15,fontWeight:700}}>{MATS[line.material]?.emoji} {MATS[line.material]?.label}</div>
                          <div style={{fontFamily:"monospace",fontSize:26,fontWeight:700,color:Y,marginTop:4}}>{fTon(tons)}</div>
                          <div style={{fontSize:15,color:MUTED,marginTop:4}}>{fEur(finalPrice)}/t</div>
                          <div style={{fontSize:15,color:GREEN,fontWeight:700}}>{fEur(tons*finalPrice)}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Grand total */}
                  <div style={{background:`${Y}18`,border:`2px solid ${Y}44`,borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <span style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,color:Y}}>YHTEENSÄ {fTon(totalTons)}</span>
                    <span style={{fontFamily:"monospace",fontSize:22,fontWeight:700,color:GREEN}}>{fEur(grandTotal)}</span>
                  </div>

                  {(form.note||form.info)&&<div style={{background:CARD,borderRadius:12,padding:"12px 14px"}}>
                    {form.note&&<div style={{fontSize:15,marginBottom:2}}>📍 {form.note}</div>}
                    {form.info&&<div style={{fontSize:15,color:MUTED}}>💬 {form.info}</div>}
                  </div>}
                </div>
              );
            })()}

          </div>

          {/* Bottom action button */}
          <div style={{padding:"16px 20px",paddingBottom:"calc(16px + env(safe-area-inset-bottom))",background:CARD,borderTop:`1px solid ${BORDER}`}}>
            {wizardStep<8?(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {/* After price step: offer to add another product */}
                {wizardStep===6&&(
                  <button className="tap" onClick={()=>{
                    addLine();
                    setWizardLineIdx(wizardLineIdx+1);
                    setWizardStep(4); // back to product selection for new line
                  }} style={{width:"100%",padding:"14px",background:"transparent",border:`2px dashed ${Y}`,borderRadius:14,color:Y,fontWeight:700,fontSize:16,fontFamily:"'Bebas Neue'",letterSpacing:1}}>
                    + LISÄÄ TOINEN TUOTE
                  </button>
                )}
                <button className="tap" onClick={()=>{
                  if(wizardStep===1&&!form.customerId) return;
                  if(wizardStep===1){const c=customers.find(x=>String(x.id)===String(form.customerId));if(c)fetchDistance(c);}
                  if(wizardStep===2&&!distance&&!(parseFloat(form.deliveryKm)>0)) return;
                  if(wizardStep===3&&!customers.find(c=>String(c.id)===String(form.customerId))?.phone&&!(form._tmpPhone?.replace(/\D/g,'').length>=10&&form._tmpPhone?.replace(/\D/g,'').length<=11)) return;
                  if(wizardStep===5&&!(parseFloat(form.lines[wizardLineIdx]?.tons)>0)) return;
                  setWizardStep(s=>s+1);
                }} style={{width:"100%",padding:"18px",background:
                  (wizardStep===1&&!form.customerId)||(wizardStep===2&&!distance&&!(parseFloat(form.deliveryKm)>0))||(wizardStep===3&&!customers.find(c=>String(c.id)===String(form.customerId))?.phone&&!(form._tmpPhone?.replace(/\D/g,'').length>=10&&form._tmpPhone?.replace(/\D/g,'').length<=11))||(wizardStep===5&&!(parseFloat(form.lines[wizardLineIdx]?.tons)>0))?BORDER:Y
                ,borderRadius:14,color:"#000",fontWeight:700,fontSize:20,letterSpacing:1,fontFamily:"'Bebas Neue'"}}>
                  {wizardStep===1&&!form.customerId?"VALITSE ASIAKAS ENSIN":wizardStep===2&&!distance&&!(parseFloat(form.deliveryKm)>0)?"SYÖTÄ MATKA KM":wizardStep===3&&!customers.find(c=>String(c.id)===String(form.customerId))?.phone&&!(form._tmpPhone?.replace(/\D/g,'').length>=10&&form._tmpPhone?.replace(/\D/g,'').length<=11)?"SYÖTÄ PUHELINNUMERO":wizardStep===5&&!(parseFloat(form.lines[wizardLineIdx]?.tons)>0)?"SYÖTÄ MÄÄRÄ ENSIN":"SEURAAVA →"}
                </button>
              </div>
            ):(
              <button className="tap" onClick={createOrder} style={{width:"100%",padding:"18px",background:Y,borderRadius:14,color:"#000",fontWeight:700,fontSize:20,letterSpacing:1,fontFamily:"'Bebas Neue'"}}>
                ✓ TALLENNA TILAUS
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:7,marginBottom:13,overflowX:"auto",paddingBottom:2}}>
        {[["aloittamatta","Aloittamatta"],["kesken","Kesken"],["kuljetuksessa","🚛 Kuljetus"],["valmis","Valmis"],["kaikki","Kaikki"]].map(([v,lbl])=>{
          const cnt = v==="kaikki" ? null : orders.filter(o=>o.status===v).length;
          return (
            <button key={v} className="tap" onClick={()=>setFilter(v)} style={{padding:"7px 14px",background:filter===v?Y:CARD,border:`1px solid ${filter===v?Y:BORDER}`,borderRadius:8,color:filter===v?"#000":MUTED,fontWeight:700,fontSize:15,whiteSpace:"nowrap",flexShrink:0,display:"flex",alignItems:"center",gap:5}}>
              {lbl}
              {cnt!==null&&cnt>0&&<span style={{background:filter===v?"rgba(0,0,0,.25)":"#333",color:filter===v?"#000":TEXT,borderRadius:10,padding:"0 6px",fontSize:15,fontWeight:700}}>{cnt}</span>}
            </button>
          );
        })}
      </div>

      <div style={{marginBottom:14}}>
        <button className="tap" onClick={()=>setShowSort(s=>!s)} style={{padding:"6px 14px",background:showSort?CARD:BG,border:`1px solid ${showSort?Y:BORDER}`,borderRadius:8,color:showSort?Y:MUTED,fontWeight:700,fontSize:15,display:"flex",alignItems:"center",gap:6}}>
          ⇅ JÄRJESTÄ {showSort?"▲":"▼"}<span style={{color:MUTED,fontWeight:400,fontSize:15}}>({sortBy==="saapunut"?"🕐":sortBy==="kiireellisyys"?"⚡":"🔤"})</span>
        </button>
        {showSort&&(
          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
            {[["saapunut","🕐 Saapunut"],["kiireellisyys","⚡ Kiireellisyys"],["aakkoset","🔤 A–Ö"]].map(([sv,sl])=>(
              <button key={sv} className="tap" onClick={()=>{setSortBy(sv);setShowSort(false);}} style={{padding:"8px 14px",background:sortBy===sv?`${Y}18`:CARD,border:`1px solid ${sortBy===sv?Y:BORDER}`,borderRadius:8,color:sortBy===sv?Y:MUTED,fontWeight:700,fontSize:15}}>
                {sl}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length===0&&<div style={{color:MUTED,padding:"24px 0",textAlign:"center"}}>Ei tilauksia.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(o=>{
          const cust=customers.find(c=>c.id===o.customerId);
          const totalOrdered=o.lines.reduce((s,l)=>s+l.orderedTons,0);
          const totalDel=o.lines.reduce((s,l)=>s+l.deliveredTons,0);
          const pct=Math.min(100,totalOrdered>0?(totalDel/totalOrdered)*100:0);
          const isHeti = o.deliveryTime==="heti";
          const isOverdue = o.deliveryTime && o.deliveryTime!=="heti" && new Date(o.deliveryTime)<new Date();
          const isUrgent = (isHeti||isOverdue) && o.status!=="valmis";
          return (
            <div key={o.id} className="tap" onClick={()=>setViewId(o.id)} style={{
              background: isUrgent ? "rgba(239,68,68,0.10)" : CARD,
              border:`1px solid ${isUrgent?RED+"99":o.status==="kuljetuksessa"?"#FF950055":o.status==="kesken"?Y+"55":BORDER}`,
              borderRadius:12,padding:14,cursor:"pointer"
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:o.status!=="aloittamatta"?8:0}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{cust?.name||"—"}</div>
                  <div style={{fontSize:15,color:MUTED}}>{fDate(o.date)}{o.note&&` · ${o.note}`}</div>
                  {o.deliveryTime&&<div style={{fontSize:15,marginTop:2,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{color:o.deliveryTime==="heti"?Y:isOverdue?RED:MUTED,fontWeight:(o.deliveryTime==="heti"||isOverdue)?700:400}}>
                      {o.deliveryTime==="heti"?"⚡ HETI":`📅 ${new Date(o.deliveryTime).toLocaleString("fi-FI",{day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"})}`}
                    </span>
                    {isOverdue&&<span style={{fontSize:15,fontWeight:700,color:RED,background:"rgba(239,68,68,0.15)",border:`1px solid ${RED}66`,borderRadius:5,padding:"1px 6px"}}>MYÖHÄSSÄ</span>}
                  </div>}
                  <div style={{fontSize:15,color:MUTED,marginTop:2}}>
                    {o.lines.map(l=>`${MATS[l.material]?.short} ${fTon(l.orderedTons)}`).join(" · ")}
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
                  {o.status!=="aloittamatta"&&o.status!=="valmis"&&(
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:36,letterSpacing:1,lineHeight:1,color:pct>=100?GREEN:SC[o.status]}}>
                      {Math.round(pct)}%
                    </div>
                  )}
                  <span style={{fontSize:15,fontWeight:700,color:SC[o.status],border:`1px solid ${SC[o.status]}44`,borderRadius:7,padding:"3px 9px",whiteSpace:"nowrap"}}>{SL[o.status]}</span>
                </div>
              </div>
              {o.status!=="aloittamatta"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:15,color:MUTED,marginBottom:3}}>
                    <span>Toimitettu</span>
                    <span style={{fontFamily:"monospace",color:pct>=100?GREEN:TEXT}}>{fTon(totalDel)} / {fTon(totalOrdered)}</span>
                  </div>
                  <div style={{height:4,background:"#333",borderRadius:2,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:pct>=100?GREEN:Y,borderRadius:2,transition:"width .5s"}} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function TimelogModal({ clockedIn, setClockedIn, onClose }) {
  const Y='#FFC107', BG='#111111', CARD='#1A1A1A', BORDER='#2E2E2E', TEXT='#F5F0E8', MUTED='#888880', GREEN='#4CAF50', RED='#ef4444';
  const IS = {width:'100%',padding:'10px 12px',background:BG,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:15,boxSizing:'border-box'};
  const LS = {fontSize:11,fontWeight:700,letterSpacing:2,color:MUTED,textTransform:'uppercase',marginBottom:4,display:'block'};

  const TASK_TYPES = [
    {id:'kuljetus',label:'Kuljetus',icon:'🚛'},
    {id:'kuoppa',label:'Kuopan hoito',icon:'⛏️'},
    {id:'konetyö',label:'Konetyö',icon:'🚜'},
    {id:'toimisto',label:'Toimisto',icon:'📋'},
    {id:'muu',label:'Muu',icon:'🔧'},
  ];

  const [view, setView] = useState('main'); // main | add | month | print
  const [timelog, setTimelog] = useState(()=>{
    try{return JSON.parse(localStorage.getItem('km3_timelog')||'[]');}catch{return [];}
  });
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState('');

  // Add form state
  const todayStr = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({
    date: todayStr,
    startTime: '07:00',
    endTime: '16:00',
    breakMin: '30',
    taskType: 'kuljetus',
    employee: '',
    note: '',
  });
  const [addSaved, setAddSaved] = useState(false);

  // Month view state
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());

  React.useEffect(()=>{
    if(!clockedIn) return;
    const id=setInterval(()=>setElapsed(Math.floor((Date.now()-new Date(clockedIn.startTime).getTime())/1000)),1000);
    return ()=>clearInterval(id);
  },[clockedIn]);

  const fElapsed=(s)=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h>0?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${m}:${String(sec).padStart(2,'0')}`;};
  const formatDur=(s)=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?`${h}t ${m}min`:`${m}min`;};
  const formatTime=(iso)=>new Date(iso).toLocaleTimeString('fi-FI',{hour:'2-digit',minute:'2-digit'});
  const fDate=(d)=>new Date(d+'T00:00:00').toLocaleDateString('fi-FI',{day:'2-digit',month:'2-digit',year:'numeric'});
  const monthName=(m,y)=>new Date(y,m,1).toLocaleDateString('fi-FI',{month:'long',year:'numeric'});

  const saveLog=(entries)=>{setTimelog(entries);localStorage.setItem('km3_timelog',JSON.stringify(entries));};

  const clockIn=()=>{setClockedIn({startTime:new Date().toISOString(),note});setNote('');};
  const clockOut=()=>{
    const endTime=new Date().toISOString();
    const durSec=Math.floor((new Date(endTime)-new Date(clockedIn.startTime))/1000);
    const entry={id:Date.now(),date:clockedIn.startTime.slice(0,10),startTime:clockedIn.startTime,endTime,durSec,taskType:'kuljetus',note:clockedIn.note||note,employee:''};
    saveLog([entry,...timelog]);
    setClockedIn(null);
  };

  // Compute form duration
  const formDurSec=()=>{
    const [sh,sm]=form.startTime.split(':').map(Number);
    const [eh,em]=form.endTime.split(':').map(Number);
    const total=(eh*60+em)-(sh*60+sm)-(parseInt(form.breakMin)||0);
    return Math.max(0,total*60);
  };

  const saveManual=()=>{
    const dur=formDurSec();
    const d=form.date;
    const startISO=`${d}T${form.startTime}:00`;
    const endISO=`${d}T${form.endTime}:00`;
    const entry={id:Date.now(),date:d,startTime:startISO,endTime:endISO,durSec:dur,breakMin:parseInt(form.breakMin)||0,taskType:form.taskType,employee:form.employee,note:form.note};
    saveLog([entry,...timelog]);
    setAddSaved(true);
    setTimeout(()=>{setAddSaved(false);setView('main');},1200);
  };

  // Month entries
  const monthEntries=timelog.filter(e=>{
    const d=new Date(e.date+'T00:00:00');
    return d.getMonth()===viewMonth && d.getFullYear()===viewYear;
  }).sort((a,b)=>a.date.localeCompare(b.date));
  const monthSec=monthEntries.reduce((a,e)=>a+e.durSec,0);
  const taskBreakdown=TASK_TYPES.map(t=>({...t,sec:monthEntries.filter(e=>e.taskType===t.id).reduce((a,e)=>a+e.durSec,0)})).filter(t=>t.sec>0);

  const todayEntries=timelog.filter(e=>e.date===todayStr);
  const todaySec=todayEntries.reduce((a,e)=>a+e.durSec,0);

  const prevMonth=()=>{if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1);};
  const nextMonth=()=>{if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1);};

  const deleteEntry=(id)=>saveLog(timelog.filter(e=>e.id!==id));

  const Btn=({children,onClick,color,style={}})=>(
    <button className="tap" onClick={onClick} style={{padding:'12px 16px',background:color||Y,border:'none',borderRadius:10,color:color?'#fff':'#000',fontWeight:700,fontSize:15,cursor:'pointer',...style}}>
      {children}
    </button>
  );

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.95)',zIndex:2000,display:'flex',flexDirection:'column'}}>
      {/* HEADER */}
      <div style={{background:CARD,borderBottom:`2px solid ${Y}`,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {view!=='main' && (
            <button onClick={()=>setView('main')} style={{padding:'6px 12px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:MUTED,fontSize:15}}>← Takaisin</button>
          )}
          <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:2,color:Y}}>
            {view==='main'?'⏱️ TUNTIKIRJAUKSET':view==='add'?'➕ LISÄÄ KIRJAUS':view==='month'?`📅 ${monthName(viewMonth,viewYear).toUpperCase()}`:'🖨️ TULOSTA'}
          </div>
        </div>
        <button onClick={onClose} style={{padding:'7px 14px',background:'transparent',border:`1px solid ${BORDER}`,borderRadius:8,color:MUTED,fontSize:15}}>✕ Sulje</button>
      </div>

      {/* MAIN VIEW */}
      {view==='main' && (
        <div style={{flex:1,overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:12}}>

          {/* Clock in/out */}
          {clockedIn ? (
            <div style={{background:CARD,border:`2px solid ${GREEN}`,borderRadius:14,padding:20,textAlign:'center'}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:3,color:GREEN,marginBottom:4}}>🟢 TÖISSÄ</div>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:48,color:GREEN,lineHeight:1,marginBottom:6}}>{fElapsed(elapsed)}</div>
              <div style={{fontSize:13,color:MUTED,marginBottom:16}}>Aloitettu {formatTime(clockedIn.startTime)}{clockedIn.note&&` · ${clockedIn.note}`}</div>
              <Btn onClick={clockOut} color={RED} style={{width:'100%',fontSize:18,fontFamily:"'Bebas Neue'",letterSpacing:2}}>⏹ LEIMAA ULOS</Btn>
            </div>
          ) : (
            <div style={{background:CARD,border:`2px dashed ${BORDER}`,borderRadius:14,padding:16,textAlign:'center'}}>
              <div style={{fontSize:13,color:MUTED,marginBottom:10}}>EI SISÄÄNLEIMATTUNA</div>
              <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Muistiinpano..." style={{...IS,marginBottom:10}} />
              <Btn onClick={clockIn} style={{width:'100%',fontSize:17,fontFamily:"'Bebas Neue'",letterSpacing:2}}>▶ LEIMAA SISÄÄN</Btn>
            </div>
          )}

          {/* Today */}
          {(todayEntries.length>0||clockedIn) && (
            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:13,color:MUTED}}>Tänään yhteensä</span>
              <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:22,color:Y,fontWeight:700}}>{formatDur(todaySec+(clockedIn?elapsed:0))}</span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <Btn onClick={()=>setView('add')} style={{background:CARD,border:`1px solid ${Y}`,color:Y}}>➕ Lisää käsin</Btn>
            <Btn onClick={()=>setView('month')} style={{background:CARD,border:`1px solid ${BORDER}`,color:TEXT}}>📅 Kuukausi</Btn>
          </div>

          {/* Recent */}
          {timelog.length>0 && (
            <div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:3,color:MUTED,marginBottom:8}}>VIIMEISIMMÄT</div>
              {timelog.slice(0,8).map(e=>{
                const t=TASK_TYPES.find(t=>t.id===e.taskType)||TASK_TYPES[4];
                return (
                  <div key={e.id} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'10px 14px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,color:MUTED}}>{fDate(e.date)} · {t.icon} {t.label}</div>
                      {e.startTime&&<div style={{fontSize:13,color:MUTED}}>{e.startTime.slice(11,16)}–{e.endTime?.slice(11,16)}</div>}
                      {e.note&&<div style={{fontSize:14,color:TEXT,marginTop:2}}>{e.note}</div>}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:16,color:Y,fontWeight:700}}>{formatDur(e.durSec)}</span>
                      <button onClick={()=>deleteEntry(e.id)} style={{background:'transparent',border:'none',color:RED,fontSize:16,cursor:'pointer',padding:4}}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ADD MANUAL VIEW */}
      {view==='add' && (
        <div style={{flex:1,overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
            <div style={{gridColumn:'1/-1'}}>
              <label style={LS}>Päivämäärä</label>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={IS} />
            </div>
            <div>
              <label style={LS}>Aloitus</label>
              <input type="time" value={form.startTime} onChange={e=>setForm(f=>({...f,startTime:e.target.value}))} style={IS} />
            </div>
            <div>
              <label style={LS}>Lopetus</label>
              <input type="time" value={form.endTime} onChange={e=>setForm(f=>({...f,endTime:e.target.value}))} style={IS} />
            </div>
            <div>
              <label style={LS}>Tauko (min)</label>
              <input type="number" value={form.breakMin} onChange={e=>setForm(f=>({...f,breakMin:e.target.value}))} style={IS} min="0" />
            </div>
          </div>

          {/* Duration preview */}
          <div style={{background:`${Y}18`,border:`1px solid ${Y}44`,borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:14,color:MUTED}}>Työaika</span>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:24,color:Y,fontWeight:700}}>{formatDur(formDurSec())}</span>
          </div>

          <div>
            <label style={LS}>Työntekijä</label>
            <input value={form.employee} onChange={e=>setForm(f=>({...f,employee:e.target.value}))} placeholder="Nimi..." style={IS} />
          </div>

          <div>
            <label style={LS}>Työtehtävä</label>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {TASK_TYPES.map(t=>(
                <button key={t.id} className="tap" onClick={()=>setForm(f=>({...f,taskType:t.id}))}
                  style={{padding:'12px',background:form.taskType===t.id?`${Y}22`:CARD,border:`2px solid ${form.taskType===t.id?Y:BORDER}`,borderRadius:10,color:form.taskType===t.id?Y:TEXT,fontWeight:700,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>
                  <span>{t.icon}</span><span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={LS}>Muistiinpano</label>
            <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Vapaa kuvaus..." style={IS} />
          </div>

          <button className="tap" onClick={saveManual} style={{
            padding:'16px',background:addSaved?GREEN:Y,border:'none',borderRadius:12,
            color:'#000',fontWeight:700,fontSize:18,cursor:'pointer',
            fontFamily:"'Bebas Neue'",letterSpacing:2,transition:'background .3s'
          }}>
            {addSaved?'✓ TALLENNETTU!':'💾 TALLENNA KIRJAUS'}
          </button>
        </div>
      )}

      {/* MONTH VIEW */}
      {view==='month' && (
        <div style={{flex:1,overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:12}}>

          {/* Month nav */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <button onClick={prevMonth} style={{padding:'8px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:18,cursor:'pointer'}}>←</button>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:2,color:Y}}>{monthName(viewMonth,viewYear).toUpperCase()}</div>
            <button onClick={nextMonth} style={{padding:'8px 16px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:9,color:TEXT,fontSize:18,cursor:'pointer'}}>→</button>
          </div>

          {/* Summary card */}
          <div style={{background:CARD,border:`2px solid ${Y}`,borderRadius:14,padding:20}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:3,color:MUTED,marginBottom:4}}>KUUKAUSI YHTEENSÄ</div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:42,color:Y,lineHeight:1,marginBottom:12}}>{formatDur(monthSec)}</div>
            {taskBreakdown.map(t=>(
              <div key={t.id} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderTop:`1px solid ${BORDER}`}}>
                <span style={{fontSize:14,color:MUTED}}>{t.icon} {t.label}</span>
                <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:14,color:TEXT}}>{formatDur(t.sec)}</span>
              </div>
            ))}
          </div>

          {/* Print button */}
          <button className="tap" onClick={()=>setView('print')} style={{padding:'12px',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:TEXT,fontWeight:700,fontSize:15,cursor:'pointer'}}>
            🖨️ Tulosta / Vie yhteenveto
          </button>

          {/* Day list */}
          {monthEntries.length===0 ? (
            <div style={{textAlign:'center',color:MUTED,padding:40,fontSize:15}}>Ei kirjauksia tältä kuulta</div>
          ) : (
            monthEntries.map(e=>{
              const t=TASK_TYPES.find(t=>t.id===e.taskType)||TASK_TYPES[4];
              return (
                <div key={e.id} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                      <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:Y}}>{fDate(e.date)}</span>
                      <span style={{fontSize:13,color:MUTED}}>{t.icon} {t.label}</span>
                    </div>
                    <div style={{fontSize:13,color:MUTED}}>
                      {e.startTime?.slice(11,16)} – {e.endTime?.slice(11,16)}
                      {e.breakMin>0&&<span> · {e.breakMin} min tauko</span>}
                      {e.employee&&<span> · {e.employee}</span>}
                    </div>
                    {e.note&&<div style={{fontSize:14,color:TEXT,marginTop:3}}>{e.note}</div>}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
                    <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:16,color:Y,fontWeight:700}}>{formatDur(e.durSec)}</span>
                    <button onClick={()=>deleteEntry(e.id)} style={{background:'transparent',border:'none',color:RED,fontSize:14,cursor:'pointer'}}>✕</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* PRINT VIEW */}
      {view==='print' && (
        <div style={{flex:1,overflowY:'auto',background:'#f0f0f0',padding:16,display:'flex',flexDirection:'column',gap:12}}>

          {/* A4-style report — white paper on grey background */}
          <div id="timelog-print" style={{
            background:'#fff',
            width:'100%',
            maxWidth:680,
            margin:'0 auto',
            boxShadow:'0 4px 24px rgba(0,0,0,0.18)',
            fontFamily:"'Barlow Condensed','Barlow',sans-serif",
          }}>
            {/* Header band */}
            <div style={{background:'#111',padding:'24px 28px 18px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:36,letterSpacing:4,color:'#FFC107',lineHeight:1}}>KASAMASTER</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600,fontSize:13,letterSpacing:4,color:'#888',marginTop:3,textTransform:'uppercase'}}>Tuntiraportti</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:3,color:'#FFC107'}}>{monthName(viewMonth,viewYear).toUpperCase()}</div>
                  <div style={{fontFamily:"'Barlow',sans-serif",fontSize:11,color:'#666',marginTop:4}}>Tulostettu {new Date().toLocaleDateString('fi-FI')}</div>
                </div>
              </div>

              {/* Summary row */}
              <div style={{marginTop:18,paddingTop:14,borderTop:'1px solid #2E2E2E',display:'flex',gap:0,flexWrap:'wrap'}}>
                {[
                  {label:'Tunnit yhteensä', val:formatDur(monthSec)},
                  {label:'Kirjauksia', val:monthEntries.length},
                  ...taskBreakdown.map(t=>({label:t.label, val:formatDur(t.sec)}))
                ].map((item,i)=>(
                  <div key={i} style={{paddingRight:24,marginBottom:4}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:10,letterSpacing:2,color:'#777',textTransform:'uppercase'}}>{item.label}</div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:2,color:'#FFC107'}}>{item.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Yellow column header bar */}
            <div style={{
              display:'grid',
              gridTemplateColumns:'88px 46px 46px 50px 64px 1fr',
              gap:'0 4px',
              padding:'7px 20px',
              background:'#FFC107',
            }}>
              {['PVM','ALKU','LOPPU','TAUKO','TUNNIT','TEHTÄVÄ / KUVAUS'].map(h=>(
                <div key={h} style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:12,letterSpacing:2,color:'#000'}}>{h}</div>
              ))}
            </div>

            {/* Data rows */}
            {monthEntries.length===0 ? (
              <div style={{padding:'32px',textAlign:'center',color:'#aaa',fontSize:14,fontStyle:'italic'}}>Ei kirjauksia tälle kuulle</div>
            ) : monthEntries.map((e,i)=>{
              const t=TASK_TYPES.find(t=>t.id===e.taskType)||TASK_TYPES[4];
              return (
                <div key={e.id} style={{
                  display:'grid',
                  gridTemplateColumns:'88px 46px 46px 50px 64px 1fr',
                  gap:'0 4px',
                  padding:'9px 20px',
                  background:i%2===0?'#fafafa':'#fff',
                  borderBottom:'1px solid #ececec',
                  alignItems:'start',
                }}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:13,color:'#111',lineHeight:1.4}}>
                    {fDate(e.date)}
                  </div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:15,letterSpacing:1,color:'#222'}}>
                    {e.startTime?.slice(11,16)||'—'}
                  </div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:15,letterSpacing:1,color:'#222'}}>
                    {e.endTime?.slice(11,16)||'—'}
                  </div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,color:'#888'}}>
                    {e.breakMin>0?`${e.breakMin} min`:'—'}
                  </div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:1,color:'#222',fontWeight:700}}>
                    {formatDur(e.durSec)}
                  </div>
                  <div style={{lineHeight:1.4}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:13,color:'#111'}}>
                      {t.icon} {t.label}
                    </div>
                    {e.employee&&<div style={{fontFamily:"'Barlow',sans-serif",fontSize:11,color:'#666'}}>{e.employee}</div>}
                    {e.note&&<div style={{fontFamily:"'Barlow',sans-serif",fontSize:11,color:'#999',fontStyle:'italic'}}>{e.note}</div>}
                  </div>
                </div>
              );
            })}

            {/* Totals footer */}
            <div style={{
              display:'grid',
              gridTemplateColumns:'88px 46px 46px 50px 64px 1fr',
              gap:'0 4px',
              padding:'12px 20px',
              borderTop:'3px solid #FFC107',
              background:'#f5f5f5',
            }}>
              <div style={{
                fontFamily:"'Barlow Condensed',sans-serif",
                fontWeight:700,fontSize:12,letterSpacing:2,
                color:'#555',textTransform:'uppercase',
                gridColumn:'1/5',alignSelf:'center'
              }}>Yhteensä</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:2,color:'#111'}}>{formatDur(monthSec)}</div>
              <div style={{fontFamily:"'Barlow',sans-serif",fontSize:12,color:'#888',alignSelf:'center'}}>{monthEntries.length} kirjausta</div>
            </div>

            {/* Adepta footer */}
            <div style={{padding:'10px 20px',borderTop:'1px solid #eee',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontFamily:"'Barlow',sans-serif",fontSize:10,color:'#ccc'}}>Kasamaster · Adepta Oy</div>
              <div style={{fontFamily:"'Barlow',sans-serif",fontSize:10,color:'#ccc'}}>kasamaster.fi</div>
            </div>
          </div>

          {/* Action button — hidden from print */}
          <div className="no-print" style={{maxWidth:680,margin:'0 auto',width:'100%',display:'flex',gap:10}}>
            <button onClick={()=>{
              const st=document.createElement('style');
              st.id='km-print-style';
              st.innerHTML=`
                @media print {
                  body * { visibility: hidden !important; }
                  #timelog-print, #timelog-print * { visibility: visible !important; }
                  #timelog-print { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; box-shadow: none !important; }
                  .no-print { display: none !important; }
                }
              `;
              document.head.appendChild(st);
              window.print();
              setTimeout(()=>{const s=document.getElementById('km-print-style');if(s)s.remove();},1500);
            }} style={{
              flex:1,padding:'14px',background:'#FFC107',border:'none',borderRadius:10,
              color:'#000',fontWeight:700,fontSize:16,cursor:'pointer',
              fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2
            }}>🖨️ TULOSTA / TALLENNA PDF</button>
          </div>

          <div className="no-print" style={{maxWidth:680,margin:'0 auto',width:'100%'}}>
            <div style={{fontSize:11,color:'#888',textAlign:'center',paddingBottom:16}}>
              Selain avaa tulostusvalikon — valitse "Tallenna PDF"
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function ScanModal({ shared, preOrderId, onClose }) {
  const { prices, setStock, setDel, orders, setOrders, customers, batches, setBatches } = shared;
  const [phase, setPhase] = useState("upload");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [scanZoom, setScanZoom] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1=tuote, 2=määrä

  // Pre-fill from order if opened from order detail
  const preOrder = preOrderId ? (orders||[]).find(o=>o.id===preOrderId) : null;
  const [form, setForm] = useState({
    customerId: preOrder ? String(preOrder.customerId) : "",
    material: preOrder?.lines?.[0]?.material || "kam_0_16",
    tons:"", date:nowDate(), note: preOrder?.note||"",
    orderId: preOrderId||""
  });
  const fileRef = useRef();
  const cameraRef = useRef();

  const handleFile = e => {
    const file = e.target.files?.[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // High quality for OCR and viewing — max 1600px, quality 0.88
      const MAX = 1600;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      // Light contrast boost for receipts — keep color
      ctx.filter = 'contrast(1.2) brightness(1.05)';
      ctx.drawImage(img, 0, 0, w, h);
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      setPreview(jpegDataUrl);
      analyze(jpegDataUrl.split(',')[1], 'image/jpeg');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      const reader = new FileReader();
      reader.onload = ev => { setPreview(ev.target.result); analyze(ev.target.result.split(',')[1], 'image/jpeg'); };
      reader.readAsDataURL(file);
    };
    img.src = url;
  };

  const analyze = async (base64) => {
    setPhase("loading");
    setError(null);
    try {
      const matList = Object.entries(MATS).map(([k,m])=>k+"="+m.label).join(", ");
      const prompt = `Lue tämä vaakalappu. Vastaa VAIN JSON ilman selityksiä: {"paino_tonnia":numero_tai_null,"materiaali_id":"koodi_tai_null","paivamaara":"YYYY-MM-DD_tai_null","kohde":"teksti_tai_null"}. Materiaaliluettelo: ${matList}. Jos useita kuitteja, laske Yht.-rivien painot yhteen. Materiaali on esim Kam 0-16mm, Kam 0-32mm, Kam 0-56mm.`;

      let res, rawResp;
      for (let attempt = 1; attempt <= 3; attempt++) {
        setError(attempt > 1 ? `Yritys ${attempt}/3...` : null);
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY || "",
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:200,
          messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:"image/jpeg",data:base64}},
            {type:"text",text:prompt}
          ]}]
        })
      });
        rawResp = await res.text();
        if (res.status === 529 && attempt < 3) {
          await new Promise(r => setTimeout(r, 3000 * attempt));
          continue;
        }
        break;
      }
      if (!res.ok) { setError("HTTP "+res.status+": "+rawResp.slice(0,120)); setPhase("confirm"); return; }
      let data; try { data=JSON.parse(rawResp); } catch { setError("JSON-virhe: "+rawResp.slice(0,120)); setPhase("confirm"); return; }
      if (data.error) { setError("API: "+(data.error.message||JSON.stringify(data.error).slice(0,80))); setPhase("confirm"); return; }
      const text=(data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
      if (!text) { setError("Tyhjä vastaus"); setPhase("confirm"); return; }
      let parsed; try { parsed=JSON.parse(text); } catch { setError("Vastaus: "+text.slice(0,80)); setPhase("confirm"); return; }
      setResult(parsed);
      const scannedMat = parsed.materiaali_id && MATS[parsed.materiaali_id] ? parsed.materiaali_id : null;
      // Check mismatch with order lines
      const orderLines = preOrder?.lines || [];
      const mismatch = scannedMat && orderLines.length > 0 && !orderLines.some(l => l.material === scannedMat);
      setForm(f=>({...f,
        tons:parsed.paino_tonnia?String(parsed.paino_tonnia):f.tons,
        material:(parsed.materiaali_id&&MATS[parsed.materiaali_id])?parsed.materiaali_id:f.material,
        date:parsed.paivamaara||f.date,
        note:parsed.kohde||f.note,
        _mismatch: mismatch ? scannedMat : null
      }));
      setWizardStep(1);
      setPhase("wizard");
    } catch(e) {
      setError("Virhe: "+(e?.message||String(e)));
      setPhase("confirm");
    }
  };

  const save = () => {
    const tons=parseFloat(form.tons);
    if (!form.customerId||isNaN(tons)||tons<=0) return;
    setDel(ds=>[...ds,{ id:newId(), date:form.date, customerId:parseInt(form.customerId), material:form.material, tons, note:form.note, invoiced:false, image:preview||null }]);
    setStock(s=>({...s,[form.material]:Math.max(0,(s[form.material]||0)-tons)}));
    if (setBatches) setBatches(bs => consumeFIFO(bs, form.material, tons));
    // Link to order if selected
    if (form.orderId) {
      setOrders(os=>os.map(o=>{
        if (o.id!==form.orderId) return o;
        const lines = o.lines.map(l => l.material===form.material ? {...l, deliveredTons: l.deliveredTons+tons} : l);
        const allDone = lines.every(l=>l.deliveredTons>=l.orderedTons);
        return {...o, lines, status: "kuljetuksessa"};
      }));
    }
    setPhase("done");
  };

  // Active orders for customer+material
  const activeOrders = (orders||[]).filter(o =>
    (o.status==="aloittamatta"||o.status==="kesken") &&
    o.customerId===parseInt(form.customerId) &&
    o.lines.some(l=>l.material===form.material)
  );

  const IS = { width:"100%", padding:"10px 12px", background:BG, border:`1px solid ${BORDER}`, borderRadius:9, color:TEXT, fontSize:15 };
  const LS = {...LS_BASE};

  return (
    <div style={{ position:"fixed", inset:0, background:CARD, zIndex:1000, display:"flex", flexDirection:"column" }}>
      <div style={{ background:BG, borderBottom:`2px solid ${Y}`, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontFamily:"'Bebas Neue'", fontSize:20, letterSpacing:2, color:Y }}>📷 VAAKALAPPU</div>
        <button className="tap" onClick={onClose} style={{ padding:"7px 14px", background:"transparent", border:`1px solid ${BORDER}`, borderRadius:8, color:MUTED, fontSize:15 }}>✕ Sulje</button>
      </div>
      <div className="su" style={{ flex:1, overflowY:"auto", padding:"18px 16px 32px" }}>

        {phase==="upload"&&(
          <div>
            <div style={{ fontFamily:"'Bebas Neue'", fontSize:24, letterSpacing:2, color:Y, marginBottom:3 }}>SKANNAA VAAKALAPPU</div>
            <div style={{ color:MUTED, fontSize:15, marginBottom:18 }}>AI lukee painon ja tiedot automaattisesti</div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display:"none" }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display:"none" }} />
            <div style={{ display:"flex", gap:10, marginBottom:14 }}>
              <button className="tap" onClick={()=>cameraRef.current?.click()} style={{ flex:1, padding:"18px 10px", background:BG, border:`2px dashed ${Y}`, borderRadius:13, color:Y, fontWeight:700, fontSize:15, display:"flex", flexDirection:"column", alignItems:"center", gap:7 }}>
                <span style={{ fontSize:32 }}>📷</span>
                KAMERA
              </button>
              <button className="tap" onClick={()=>fileRef.current?.click()} style={{ flex:1, padding:"18px 10px", background:BG, border:`2px dashed ${BORDER}`, borderRadius:13, color:MUTED, fontWeight:700, fontSize:15, display:"flex", flexDirection:"column", alignItems:"center", gap:7 }}>
                <span style={{ fontSize:32 }}>🖼️</span>
                GALLERIA
              </button>
            </div>
            <button className="tap" onClick={()=>setPhase("confirm")} style={{ width:"100%", marginTop:4, padding:"12px", background:"transparent", border:`1px solid ${BORDER}`, borderRadius:10, color:MUTED, fontWeight:600, fontSize:15 }}>Syötä ilman kuvaa</button>
          </div>
        )}

        {phase==="loading"&&(
          <div style={{ textAlign:"center", padding:"40px 0" }}>
            {preview&&<img src={preview} style={{ width:"60%", maxHeight:200, objectFit:"contain", borderRadius:9, marginBottom:16, opacity:.7 }} />}
            <div style={{ fontSize:36, marginBottom:8 }}>⚙️</div>
            <div style={{ fontFamily:"'Bebas Neue'", fontSize:20, letterSpacing:2, color:Y }}>LUETAAN VAAKALAPPU...</div>
          </div>
        )}


        {phase==="wizard"&&(
          <div>
            {/* WIZARD HEADER */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <div style={{
                width:28,height:28,borderRadius:"50%",
                background: wizardStep===1 ? Y : GREEN,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontWeight:700,fontSize:14,color:"#000",flexShrink:0
              }}>1</div>
              <div style={{flex:1,height:2,background: wizardStep===2 ? Y : BORDER}}></div>
              <div style={{
                width:28,height:28,borderRadius:"50%",
                background: wizardStep===2 ? Y : BORDER,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontWeight:700,fontSize:14,color: wizardStep===2 ? "#000" : MUTED,flexShrink:0
              }}>2</div>
            </div>

            {wizardStep===1&&(
              <div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:3,color:MUTED,marginBottom:6}}>
                  VAIHE 1/2 — TUOTE
                </div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:26,letterSpacing:2,color:TEXT,marginBottom:20,lineHeight:1.1}}>
                  AI tunnisti tuotteen:
                </div>

                {/* Scanned material card */}
                <div style={{
                  background:CARD,border:`2px solid ${Y}`,borderRadius:14,
                  padding:"22px 20px",marginBottom:16,textAlign:"center"
                }}>
                  <div style={{fontSize:48,marginBottom:8}}>
                    {MATS[form.material]?.emoji || "📦"}
                  </div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:32,letterSpacing:2,color:Y}}>
                    {MATS[form.material]?.label || form.material}
                  </div>
                  {preOrder?.lines?.[0]?.material && preOrder.lines[0].material !== form.material && (
                    <div style={{
                      marginTop:12,padding:"8px 14px",
                      background:`${RED}20`,border:`1px solid ${RED}44`,
                      borderRadius:8,fontSize:13,color:RED
                    }}>
                      ⚠️ Tilauksella odotettiin: <strong>{MATS[preOrder.lines[0].material]?.emoji} {MATS[preOrder.lines[0].material]?.label}</strong>
                    </div>
                  )}
                </div>

                <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:1,color:TEXT,marginBottom:14,textAlign:"center"}}>
                  Onko tuote oikein?
                </div>

                <div style={{display:"flex",gap:10}}>
                  <button className="tap" onClick={()=>setWizardStep(2)} style={{
                    flex:2,padding:"16px",background:GREEN,borderRadius:12,
                    color:"#fff",fontWeight:700,fontSize:17,letterSpacing:.5
                  }}>✓ Kyllä, oikein</button>
                  <button className="tap" onClick={()=>{
                    // Let user fix material in confirm-form
                    setPhase("confirm");
                  }} style={{
                    flex:1,padding:"16px",background:CARD,
                    border:`1px solid ${RED}`,borderRadius:12,
                    color:RED,fontWeight:700,fontSize:15
                  }}>✗ Väärä</button>
                </div>
                <button className="tap" onClick={()=>setPhase("confirm")} style={{
                  width:"100%",marginTop:8,padding:"11px",background:"transparent",
                  border:`1px solid ${BORDER}`,borderRadius:10,color:MUTED,fontSize:14
                }}>Muokkaa tietoja itse →</button>
              </div>
            )}

            {wizardStep===2&&(
              <div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:3,color:MUTED,marginBottom:6}}>
                  VAIHE 2/2 — MÄÄRÄ
                </div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:26,letterSpacing:2,color:TEXT,marginBottom:20,lineHeight:1.1}}>
                  AI tunnisti painon:
                </div>

                {/* Scanned weight card */}
                <div style={{
                  background:CARD,border:`2px solid ${Y}`,borderRadius:14,
                  padding:"22px 20px",marginBottom:16,textAlign:"center"
                }}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:52,color:Y,lineHeight:1}}>
                    {form.tons || "—"}
                  </div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:2,color:MUTED,marginTop:4}}>
                    TONNIA
                  </div>
                  {form.tons && form.material && (
                    <div style={{
                      marginTop:12,padding:"8px 14px",
                      background:`${Y}12`,border:`1px solid ${Y}33`,
                      borderRadius:8,fontSize:14,color:Y
                    }}>
                      💰 {(() => {
                        const p = shared.prices?.[form.material] || 0;
                        const t = parseFloat(form.tons) || 0;
                        return (t * p).toLocaleString("fi-FI",{style:"currency",currency:"EUR"});
                      })()}
                    </div>
                  )}
                </div>

                {preview&&(
                  <div style={{marginBottom:14,borderRadius:10,overflow:"hidden",border:`1px solid ${BORDER}`,cursor:"zoom-in"}}
                    onClick={()=>setScanZoom(true)}>
                    <img src={preview} style={{width:"100%",maxHeight:"25vh",objectFit:"contain",display:"block",background:"#000"}} />
                    <div style={{padding:"6px 10px",fontSize:12,color:MUTED,textAlign:"center"}}>🔍 Napauta suurentaaksesi</div>
                  </div>
                )}

                <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:1,color:TEXT,marginBottom:14,textAlign:"center"}}>
                  Onko paino oikein?
                </div>

                <div style={{display:"flex",gap:10}}>
                  <button className="tap" onClick={()=>{
                    // All confirmed — go to confirm for final review & save
                    setPhase("confirm");
                  }} style={{
                    flex:2,padding:"16px",background:GREEN,borderRadius:12,
                    color:"#fff",fontWeight:700,fontSize:17,letterSpacing:.5
                  }}>✓ Kyllä, tallenna</button>
                  <button className="tap" onClick={()=>{
                    setPhase("confirm");
                  }} style={{
                    flex:1,padding:"16px",background:CARD,
                    border:`1px solid ${RED}`,borderRadius:12,
                    color:RED,fontWeight:700,fontSize:15
                  }}>✗ Korjaa</button>
                </div>
                <button className="tap" onClick={()=>setWizardStep(1)} style={{
                  width:"100%",marginTop:8,padding:"11px",background:"transparent",
                  border:`1px solid ${BORDER}`,borderRadius:10,color:MUTED,fontSize:14
                }}>← Takaisin tuotteeseen</button>
              </div>
            )}

            {scanZoom&&(
              <div style={{position:"fixed",inset:0,background:"#000",zIndex:6000}}>
                <div style={{position:"absolute",top:12,right:12,zIndex:10}}>
                  <button onClick={()=>setScanZoom(false)} style={{padding:"8px 16px",background:"rgba(0,0,0,.8)",border:`1px solid ${BORDER}`,borderRadius:8,color:"#fff",fontSize:15,fontWeight:700}}>✕ Sulje</button>
                </div>
                <img src={preview} style={{width:"100%",height:"100%",objectFit:"contain",touchAction:"pinch-zoom"}} alt="Vaakalappu" />
              </div>
            )}
          </div>
        )}

        {phase==="confirm"&&(
          <div>
            <div style={{ fontFamily:"'Bebas Neue'", fontSize:22, letterSpacing:2, color:Y, marginBottom:10 }}>SYÖTÄ TIEDOT LAPULTA</div>

            {/* MATERIAL MISMATCH WARNING */}
            {form._mismatch&&(
              <div style={{background:`${RED}20`,border:`3px solid ${RED}`,borderRadius:14,padding:"20px 18px",marginBottom:16,textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:8}}>⚠️</div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:2,color:RED,marginBottom:8}}>VÄÄRÄ TUOTE!</div>
                <div style={{fontSize:15,color:TEXT,marginBottom:8}}>
                  Vaakalapulla: <strong style={{color:RED}}>{MATS[form._mismatch]?.emoji} {MATS[form._mismatch]?.label}</strong>
                </div>
                <div style={{fontSize:15,color:MUTED,marginBottom:8}}>
                  Tilauksella:{" "}
                  {preOrder?.lines?.map((l,i)=>(
                    <span key={i} style={{color:Y}}>{MATS[l.material]?.emoji} {MATS[l.material]?.label}{i<preOrder.lines.length-1?", ":""}</span>
                  ))}
                </div>
                <div style={{fontSize:14,color:MUTED,background:`${Y}15`,border:`1px solid ${Y}33`,borderRadius:8,padding:"8px 12px",marginBottom:16}}>
                  ℹ️ Jos hyväksyt, tuote vaihdetaan automaattisesti tilauksen mukaiseksi: <strong style={{color:Y}}>{MATS[preOrder?.lines?.[0]?.material]?.emoji} {MATS[preOrder?.lines?.[0]?.material]?.label}</strong>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button className="tap" onClick={()=>{
                    // Auto-correct material to order's first line material
                    const correctMat = preOrder?.lines?.[0]?.material;
                    setForm(f=>({...f, _mismatch:null, material: correctMat||f.material}));
                  }}
                    style={{flex:1,padding:"12px",background:RED,borderRadius:10,color:"#fff",fontWeight:700,fontSize:15}}>
                    Hyväksy — vaihda tuote tilauksen mukaiseksi
                  </button>
                  <button className="tap" onClick={onClose}
                    style={{flex:1,padding:"12px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,color:TEXT,fontWeight:700,fontSize:15}}>
                    Peruuta
                  </button>
                </div>
              </div>
            )}
            {preview&&(
              <div style={{ marginBottom:14, borderRadius:10, overflow:"hidden", border:`1px solid ${BORDER}`, cursor:"zoom-in", position:"relative" }}
                onClick={()=>setScanZoom(true)}>
                <img src={preview} style={{ width:"100%", maxHeight:"40vh", objectFit:"contain", display:"block", background:"#000" }} />
                <div style={{position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,.7)",borderRadius:6,padding:"4px 8px",fontSize:13,color:MUTED}}>🔍 Napauta suurentaaksesi</div>
              </div>
            )}
            {scanZoom&&(
              <div style={{position:"fixed",inset:0,background:"#000",zIndex:6000}}>
                <div style={{position:"absolute",top:12,right:12,zIndex:10}}>
                  <button onClick={()=>setScanZoom(false)} style={{padding:"8px 16px",background:"rgba(0,0,0,.8)",border:`1px solid ${BORDER}`,borderRadius:8,color:"#fff",fontSize:15,fontWeight:700}}>✕ Sulje</button>
                </div>
                <img src={preview}
                  style={{width:"100%",height:"100%",objectFit:"contain",touchAction:"pinch-zoom"}}
                  alt="Vaakalappu" />
                <div style={{position:"absolute",bottom:16,left:0,right:0,textAlign:"center",color:"rgba(255,255,255,.5)",fontSize:14,pointerEvents:"none"}}>
                  👆 Nipistä zoomaamiseksi
                </div>
              </div>
            )}
            {error&&<div style={{ padding:"8px 12px", background:`${RED}15`, border:`1px solid ${RED}44`, borderRadius:9, marginBottom:10, fontSize:15, color:RED }}>{error}</div>}
            <div style={{ display:"grid", gap:10 }}>
              <div><label style={LS}>ASIAKAS *</label>
                <CustomerSelect
                  value={form.customerId}
                  customers={shared.customers}
                  style={IS}
                  onChange={cid=>setForm(f=>({...f,customerId:cid}))}
                />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={LS}>TUOTE</label>
                  <select value={form.material} onChange={e=>setForm(f=>({...f,material:e.target.value}))} style={IS}>
                    <MatOptions stock={shared.stock} />
                  </select>
                </div>
                <div><label style={LS}>TONNIA *</label>
                  <input type="number" value={form.tons} onChange={e=>setForm(f=>({...f,tons:e.target.value}))} placeholder="0,00" style={{ ...IS, fontFamily:"'IBM Plex Mono',monospace", fontSize:18, color:Y }} step="0.01" />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={LS}>PVM</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={IS} /></div>
                <div><label style={LS}>TYÖMAA</label><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Kohde..." style={IS} /></div>
              </div>
              {activeOrders.length>0&&(
                <div>
                  <label style={LS}>LIITÄ TILAUKSEEN</label>
                  <select value={form.orderId} onChange={e=>setForm(f=>({...f,orderId:e.target.value}))} style={IS}>
                    <option value="">— ei liitetä tilaukseen —</option>
                    {activeOrders.map(o=>{
                      const l=o.lines.find(l=>l.material===form.material);
                      return <option key={o.id} value={o.id}>{fDate(o.date)}{o.note?` · ${o.note}`:""} · {fTon(l?.orderedTons||0)} tilattu</option>;
                    })}
                  </select>
                </div>
              )}
            </div>
            {form.tons&&form.material&&(
              <div style={{ marginTop:9, padding:"8px 12px", background:`${Y}12`, borderRadius:8, fontSize:15, borderLeft:`3px solid ${Y}` }}>
                💰 <strong style={{ color:Y }}>{fEur(parseFloat(form.tons||0)*(prices[form.material]||0))}</strong>
              </div>
            )}
            <div style={{ display:"flex", gap:7, marginTop:12 }}>
              <button className="tap" onClick={save} style={{ flex:1, padding:"13px", background:Y, borderRadius:10, color:"#000", fontWeight:700, fontSize:15, letterSpacing:.5 }}>💾 TALLENNA KUORMAKIRJA</button>
              <button className="tap" onClick={onClose} style={{ padding:"13px 14px", background:"transparent", border:`1px solid ${BORDER}`, borderRadius:10, color:MUTED, fontSize:15 }}>Peru</button>
            </div>
          </div>
        )}

        {phase==="done"&&(
          <div style={{ textAlign:"center", padding:"26px 0" }}>
            <div style={{ fontSize:52 }}>✅</div>
            <div style={{ fontFamily:"'Bebas Neue'", fontSize:24, letterSpacing:2, color:GREEN, marginTop:9 }}>KUORMAKIRJA TALLENNETTU!</div>
            <div style={{ color:MUTED, fontSize:15, marginTop:4 }}>{MATS[form.material]?.label} · {fTon(parseFloat(form.tons))} · Varasto päivitetty</div>
            <button className="tap" onClick={onClose} style={{ marginTop:20, padding:"12px 28px", background:Y, borderRadius:10, color:"#000", fontWeight:700, fontSize:15 }}>VALMIS</button>
          </div>
        )}
      </div>
    </div>
  );
}

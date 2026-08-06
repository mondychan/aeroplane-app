import { useCallback,useEffect,useMemo,useState } from 'react'
import { Activity, Bell,Clock3,Cloud,Compass,Crosshair,ExternalLink,FileJson,Gauge,History,Layers3,MapPin,Maximize2,Moon,Navigation,Plane,Radio,RefreshCw,Route,Settings2,ShieldCheck,Signal,SlidersHorizontal,Sun,Trash2,Wind,X } from 'lucide-react'
import { cardinal,DEFAULT_HOME,DEMO_AIRCRAFT,distanceKm,bearingFromHome } from './aircraft'
import { RadarMap } from './RadarMap'

const num=(v,d=0)=>v==null||Number.isNaN(v)?'—':new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:d}).format(v)
const DEFAULT_CONFIG={home:DEFAULT_HOME,radiusKm:80,minAltitude:100,maxAltitude:15000,excludeHelicopters:false,excludeLightAircraft:false,displayTooltips:false,units:'metric',language:'cs',lowAltitudeAlert:2500,rotationSeconds:12,theme:'dark',mapStyle:'dark'}

export function App(){
 const[config,setConfig]=useState(DEFAULT_CONFIG),[aircraft,setAircraft]=useState(DEMO_AIRCRAFT),[history,setHistory]=useState({items:[],stats:{total:0,airlines:[],aircraftTypes:[]}}),[weather,setWeather]=useState(null),[status,setStatus]=useState('demo'),[updated,setUpdated]=useState(new Date()),[now,setNow]=useState(new Date()),[selected,setSelected]=useState(0),[settings,setSettings]=useState(false),[busy,setBusy]=useState(false)
 const[activeView,setActiveView]=useState('map')
 const[manualOverride,setManualOverride]=useState(null) // icao24 of manually pinned aircraft when autoNearest=true
 const home=config.home
 const ranked=useMemo(()=>aircraft.map(a=>({...a,distance:a.distanceKm??distanceKm(home,a),bearing:a.bearing??bearingFromHome(home,a)})),[aircraft,home])
 const nearestIndex=useMemo(()=>ranked.reduce((nearest,a,index)=>nearest<0||a.distance<ranked[nearest].distance?index:nearest,-1),[ranked])
 const autoNearest=Number(config.rotationSeconds)===0
 // When autoNearest, use nearest unless user manually pinned an aircraft; release pin when aircraft leaves
 const activeSelected=useMemo(()=>{
   if(!autoNearest)return selected
   if(manualOverride){const idx=ranked.findIndex(a=>a.icao24===manualOverride);if(idx>=0)return idx}
   return nearestIndex
 },[autoNearest,manualOverride,ranked,selected,nearestIndex])
 const current=ranked[activeSelected]||ranked[nearestIndex]||ranked[0]
 const imperial=config.units==='imperial',dist=km=>imperial?`${num(km*.621371,1)} mi`:`${num(km,1)} km`,alt=m=>imperial?`${num(m*3.28084)} ft`:`${num(m)} m`,speed=ms=>imperial?`${num(ms*2.23694)} mph`:`${num(ms*3.6)} km/h`
 const load=useCallback(async(force=false)=>{setBusy(true);try{if(force)await fetch('/api/aircraft/refresh',{method:'POST'});const r=await fetch('/api/aircraft/overhead',{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const d=await r.json();setAircraft(d.aircraft||[]);setStatus(d.source||'live');setUpdated(new Date(d.updatedAt||Date.now()));fetch('/api/history').then(x=>x.json()).then(setHistory)}catch{setStatus('offline')}finally{setBusy(false)}},[])
 useEffect(()=>{Promise.all([fetch('/api/config').then(r=>r.json()),fetch('/api/history').then(r=>r.json()),fetch('/api/weather').then(r=>r.json())]).then(([c,h,w])=>{setConfig(c);setHistory(h);setWeather(w.current)}).catch(()=>{});load();const refresh=setInterval(load,30000),clock=setInterval(()=>setNow(new Date()),1000);return()=>{clearInterval(refresh);clearInterval(clock)}},[load])
 useEffect(()=>{const seconds=Number(config.rotationSeconds);if(!Number.isFinite(seconds)||seconds<=0)return;const rotate=setInterval(()=>setSelected(v=>(v+1)%Math.max(1,Math.min(ranked.length,6))),Math.max(seconds,5)*1000);return()=>clearInterval(rotate)},[ranked.length,config.rotationSeconds])
 // Release manual pin if the pinned aircraft leaves the radar area
 useEffect(()=>{if(manualOverride&&!ranked.find(a=>a.icao24===manualOverride))setManualOverride(null)},[ranked,manualOverride])
 // Unified select handler: in autoNearest mode, clicking pins the aircraft
 const handleSelect=useCallback((index)=>{setSelected(index);if(autoNearest)setManualOverride(ranked[index]?.icao24??null)},[autoNearest,ranked])
 const save=async next=>{const dataChanged=['radiusKm','minAltitude','maxAltitude','excludeHelicopters','excludeLightAircraft'].some(key=>next[key]!==config[key])||next.home?.latitude!==config.home?.latitude||next.home?.longitude!==config.home?.longitude;const r=await fetch('/api/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});if(r.ok){setConfig(await r.json());setSettings(false);if(dataChanged){setSelected(0);setManualOverride(null);load()}}}
 const useLocation=()=>navigator.geolocation?.getCurrentPosition(({coords})=>save({...config,home:{...home,latitude:coords.latitude,longitude:coords.longitude,label:'Moje poloha'}}))
 return <main className={`cockpit theme-${config.theme||'dark'} map-${config.mapStyle||'dark'}`}>
  <header className="nav-bar"><div className="logo"><Plane/><b>Sky<span>Radar</span></b></div><nav><button className={activeView==='map'?'active':''} onClick={()=>setActiveView('map')}><MapPin/>Živá mapa</button><button className={activeView==='flights'?'active':''} onClick={()=>setActiveView('flights')}><Radio/>Přelety</button><button className={activeView==='history'?'active':''} onClick={()=>setActiveView('history')}><History/>Historie</button></nav><div className="nav-meta"><span>{now.toLocaleTimeString('cs-CZ')} <small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small></span><span className={`live-state ${status}`}><i/>{status==='live'?'Živě':status==='offline'?'Offline':'Demo'}</span><button title={config.theme==='light'?'Zapnout tmavý režim':'Zapnout světlý režim'} onClick={()=>save({...config,theme:config.theme==='light'?'dark':'light'})}>{config.theme==='light'?<Moon/>:<Sun/>}</button><button title="Nastavení" onClick={()=>setSettings(true)}><Settings2/></button></div></header>
  <div className="dashboard-grid">
   <aside className="left-rail">
    <Panel title="ŽIVÝ PŘEHLED" className="overview"><Kpi icon={Plane} label="Letadel v dohledu" value={ranked.length}/><Kpi icon={Route} label="Predikované přelety" value={ranked.filter(a=>a.closestApproach?.distanceKm<5).length}/><Kpi icon={History} label="Dnes zaznamenáno" value={history.stats.todayCount??history.stats.total}/><div className="source"><span>Zdroj dat</span><strong>{status==='live'?'OpenSky Network':'Záložní simulace'}</strong><i/></div></Panel>
    <Panel title="FILTRY" className="filters"><RadiusFilter value={config.radiusKm} onCommit={radiusKm=>save({...config,radiusKm})}/><label>Výškový rozsah<select className="select-like" value={`${config.minAltitude}-${config.maxAltitude}`} onChange={e=>{const[minAltitude,maxAltitude]=e.target.value.split('-').map(Number);save({...config,minAltitude,maxAltitude})}}>{!['0-15000','0-3000','3000-9000','9000-15000'].includes(`${config.minAltitude}-${config.maxAltitude}`)&&<option value={`${config.minAltitude}-${config.maxAltitude}`}>Vlastní · {num(config.minAltitude)}–{num(config.maxAltitude)} m</option>}<option value="0-15000">Všechny výšky</option><option value="0-3000">Nízké · do 3 000 m</option><option value="3000-9000">Střední · 3–9 000 m</option><option value="9000-15000">Letová hladina · 9 000+ m</option></select></label><Toggle label="Zobrazit popisky" checked={config.displayTooltips} onChange={v=>save({...config,displayTooltips:v})}/><Toggle label="Skrýt vrtulníky" checked={config.excludeHelicopters} onChange={v=>save({...config,excludeHelicopters:v})}/><Toggle label="Skrýt lehká letadla" checked={config.excludeLightAircraft} onChange={v=>save({...config,excludeLightAircraft:v})}/><button className="filter-button" onClick={()=>setSettings(true)}><SlidersHorizontal/>Všechny filtry</button></Panel>
    <Panel title="PODMÍNKY"><div className="weather"><Cloud/><div><strong>{weather?`${num(weather.temperature_2m)}°C`:'—'}</strong><span>{weatherLabel(weather?.weather_code)}</span></div></div><div className="weather-meta"><span><Wind/>{weather?`${num(weather.wind_speed_10m)} km/h`:'—'}<small>Vítr</small></span><span><Signal/>{weather?.visibility?`${num(weather.visibility/1000,1)} km`:'—'}<small>Viditelnost</small></span></div></Panel>
   </aside>
   <section className="center-stage">{activeView==='map'?<MapView home={home} ranked={ranked} selected={activeSelected} setSelected={handleSelect} config={config} save={save} status={status} busy={busy} load={load} dist={dist}/>:activeView==='flights'?<FlightsView ranked={ranked} selected={activeSelected} setSelected={handleSelect} dist={dist} alt={alt} speed={speed}/>:<HistoryView history={history} setActiveView={setActiveView}/>}</section>
   <aside className="right-rail">
    <Panel className="aircraft-detail" title={autoNearest&&manualOverride?'PŘIPNUTÉ LETADLO':'NEJBLIŽŠÍ LETADLO'} action={<>{autoNearest&&manualOverride&&<button title="Zrušit připnutí, vrátit se na nejbližší" onClick={()=>setManualOverride(null)} style={{fontSize:9,padding:'2px 6px',opacity:.7}}>✕ uvolnit</button>}<Maximize2/><X/></>}>
     {current?<><div className={`plane-photo ${!current.photoUrl?'logo-hero':''}`}>{current.photoUrl?(current.photoLink?<a className="plane-photo-link" href={current.photoLink} target="_blank" rel="noreferrer"><img src={current.photoUrl} alt={current.registration||current.callsign}/></a>:<img src={current.photoUrl} alt={current.registration||current.callsign}/>):<div className="logo-hero-content"><AirlineLogo aircraft={current} large/><strong>{current.airline||current.originCountry}</strong><span>{current.aircraftType||'Fotografie letadla není dostupná'}</span></div>}{current.photoUrl&&<div className="photo-airline"><AirlineLogo aircraft={current}/><span>{current.airline||current.originCountry}</span></div>}{current.photoAttribution&&<a className="photo-credit" href={current.photoLink} target="_blank" rel="noreferrer">Foto: {current.photoAttribution} · {current.photoSource}<ExternalLink/></a>}<span className="photo-badge">{current.aircraftType||'ADS-B'}</span></div><div className="flight-head"><div><AirlineLogo aircraft={current}/><section><h1>{current.callsign}</h1><span>{current.registration||current.icao24.toUpperCase()}</span></section></div><b>{current.airline||current.originCountry}</b></div><div className="route-line"><div><strong>{current.departure||'—'}</strong><small title={current.departureName||current.originAirport?.name}>{current.departureName||current.originAirport?.name||'Odlet'}</small></div><span><i/><Plane/><i/></span><div><strong>{current.arrival||'—'}</strong><small title={current.arrivalName||current.destinationAirport?.name}>{current.arrivalName||current.destinationAirport?.name||'Přílet'}</small></div></div><div className="detail-metrics"><Detail label="VÝŠKA" value={alt(current.altitude)}/><Detail label="RYCHLOST" value={speed(current.velocity)}/><Detail label="KURZ" value={`${num(current.heading)}° ${cardinal(current.heading)}`}/><Detail label="VERT. RYCHLOST" value={`${current.verticalRate>0?'+':''}${num(current.verticalRate,1)} m/s`}/><Detail label="LETADLO" value={current.manufacturer||current.aircraftType||'—'}/><Detail label="REGISTRACE" value={current.registration||'—'}/></div><div className="approach"><Route/><div><span>NEJBLIŽŠÍ BOD PŘELETU</span><strong>{current.closestApproach?.isApproaching?`za ${Math.max(1,Math.round(current.closestApproach.seconds/60))} min · ${dist(current.closestApproach.distanceKm)}`:'Letadlo oblast míjí'}</strong></div></div>{current.prediction?.type==='destination-guided'&&<div className={`prediction-note ${current.prediction.confidence}`}><Navigation/><div><span>PŘÍLETOVÁ PREDIKCE · {current.prediction.confidence==='high'?'VYSOKÁ':current.prediction.confidence==='medium'?'STŘEDNÍ':'NÍZKÁ'} JISTOTA</span><strong>Trajektorie se stáčí k {current.prediction.airportCode} · {dist(current.prediction.distanceKm)}</strong><small>Odhad podle cíle, headingu a klesání; nejde o ATC trasu.</small></div></div>}<a className="fr24-button" href={`https://www.flightradar24.com/${encodeURIComponent(current.callsign||current.registration||current.icao24)}`} target="_blank" rel="noreferrer"><span>View full flight details</span><ExternalLink/></a></>:<div className="empty-detail"><Plane/><h2>Klidné nebe</h2><p>V nastaveném okruhu není žádný aktivní cíl.</p></div>}

    </Panel>
    <Panel title="PROFIL LETU"><FlightChart aircraft={current}/></Panel>
    <Panel title="DOMOVSKÝ BOD"><div className="home-info"><MapPin/><div><strong>{home.label}</strong><span>{home.address||`${home.latitude.toFixed(4)}°, ${home.longitude.toFixed(4)}°`}</span></div></div><div className="home-meta"><span><Compass/>Praha</span><span><Clock3/>{updated.toLocaleTimeString('cs-CZ')}</span></div></Panel>
   </aside>
  </div>
  {settings&&<Settings config={config} onSave={save} onClose={()=>setSettings(false)} onLocation={useLocation}/>} 
 </main>
}

function Panel({title,children,className='',action}){return <section className={`dash-panel ${className}`}><header><span>{title}</span>{action&&<div>{action}</div>}</header>{children}</section>}
function MapView({home,ranked,selected,setSelected,config,save,status,busy,load,dist}){
 const nearest=[...ranked].map((aircraft,index)=>({aircraft,index})).sort((a,b)=>a.aircraft.distance-b.aircraft.distance).slice(0,5)
 return <><div className="map-wrap"><RadarMap home={home} aircraft={ranked} selected={selected} onSelect={setSelected} radiusKm={config.radiusKm} mapStyle={config.mapStyle} displayTooltips={config.displayTooltips}/><div className="map-title"><span className={`dot ${status}`}/>{ranked.length} AKTIVNÍCH CÍLŮ</div><button className="map-refresh" onClick={()=>load(true)}><RefreshCw className={busy?'spin':''}/></button><div className="map-style-switch"><Layers3/>{[['dark','Tmavá'],['light','Světlá'],['satellite','Satelit']].map(([value,label])=><button key={value} className={config.mapStyle===value?'active':''} onClick={()=>save({...config,mapStyle:value})}>{label}</button>)}</div><div className="vector-legend"><span><i className="past"/>Historická stopa</span><span><i className="future"/>Predikovaný vektor</span></div><div className="altitude-legend"><span>VÝŠKA (m)</span><i/><div><b>0</b><b>5 000</b><b>10 000</b><b>15 000+</b></div></div></div><Panel className="nearby" title={`NEJBLIŽŠÍ PŘELETY · ${home.label.toUpperCase()} · ŘAZENO PODLE VZDÁLENOSTI`}><div className="nearby-table">{nearest.map(({aircraft:a,index})=><button key={a.icao24} className={index===selected?'selected':''} onClick={()=>setSelected(index)}><span className="time">{a.closestApproach?.isApproaching?`${Math.max(1,Math.round(a.closestApproach.seconds/60))} min`:'míjí'}</span><AirlineLogo aircraft={a}/><span><b>{a.callsign}</b><small>{a.airline||a.originCountry}</small></span><span><b>{a.departure||'—'} → {a.arrival||'—'}</b><small>{a.aircraftType||a.registration||'Neznámý typ'}</small></span><em>{dist(a.distance)}</em></button>)}</div></Panel></>
}
function FlightsView({ranked,selected,setSelected,dist,alt,speed}){return <Panel className="full-view" title={`AKTUÁLNÍ PŘELETY · ${ranked.length} LETADEL`}><div className="flights-grid">{ranked.map((a,i)=><button key={a.icao24} className={i===selected?'selected':''} onClick={()=>setSelected(i)}><div className="flight-card-plane"><AirlineLogo aircraft={a}/></div><div><h3>{a.callsign}</h3><span>{a.airline||a.originCountry}</span><small>{a.aircraftType||a.registration||'Neznámý typ'}</small></div><dl><div><dt>Vzdálenost</dt><dd>{dist(a.distance)}</dd></div><div><dt>Výška</dt><dd>{alt(a.altitude)}</dd></div><div><dt>Rychlost</dt><dd>{speed(a.velocity)}</dd></div><div><dt>Trasa</dt><dd>{a.departure||'—'} → {a.arrival||'—'}</dd></div></dl><strong className={a.closestApproach?.isApproaching?'approaching':''}>{a.closestApproach?.isApproaching?`za ${Math.max(1,Math.round(a.closestApproach.seconds/60))} min · mine o ${dist(a.closestApproach.distanceKm)}`:'Oblast míjí'}</strong></button>)}</div></Panel>}
function HistoryView({history,setActiveView}){
  const [dateFilter, setDateFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredItems, setFilteredItems] = useState(history.items)

  const fetchFilteredHistory = useCallback(async (date, q) => {
    try {
      const params = new URLSearchParams({ limit: 0 })
      if (date) params.set('date', date)
      if (q) params.set('q', q)
      const res = await fetch(`/api/history?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setFilteredItems(data.items || [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!dateFilter && !searchTerm) {
      setFilteredItems(history.items)
    } else {
      fetchFilteredHistory(dateFilter, searchTerm)
    }
  }, [dateFilter, searchTerm, history.items, fetchFilteredHistory])

  const todayStr = new Date().toISOString().slice(0, 10)

  return <Panel className="full-view" title={`HISTORIE PŘELETŮ · ${filteredItems.length} ZÁZNAMŮ`}>
    <div className="history-summary">
      <div><History/><span>Dnes / Celkem<strong>{history.stats.todayCount ?? history.stats.total} / {history.stats.total}</strong></span></div>
      <div><Plane/><span>Nejčastější aerolinka<strong>{history.stats.airlines[0]?.name||'—'}</strong></span></div>
      <div><Gauge/><span>Nejčastější typ<strong>{history.stats.aircraftTypes[0]?.name||'—'}</strong></span></div>
    </div>
    <div className="history-controls">
      <div className="history-quick-dates">
        <button className={!dateFilter ? 'active' : ''} onClick={() => setDateFilter('')}>Vše</button>
        <button className={dateFilter === todayStr ? 'active' : ''} onClick={() => setDateFilter(todayStr)}>Dnes</button>
        <button className={dateFilter === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? 'active' : ''} onClick={() => setDateFilter(new Date(Date.now() - 86400000).toISOString().slice(0, 10))}>Včera</button>
      </div>
      <input type="date" className="history-date-picker" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
      <input type="text" className="history-search" placeholder="Hledat let, typ, registrace..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      {(dateFilter || searchTerm) && <button className="history-clear-btn" onClick={() => { setDateFilter(''); setSearchTerm('') }}>Zrušit filtr</button>}
    </div>
    {filteredItems.length ? <div className="history-table">
      <header><span>Čas</span><span>Let</span><span>Provozovatel</span><span>Typ / registrace</span><span>Nejbližší bod</span></header>
      {filteredItems.map(item => <div key={`${item.icao24}-${item.seenAt}`}>
        <time>{new Date(item.seenAt).toLocaleString('cs-CZ')}</time>
        <b>{item.callsign}</b>
        <span>{item.airline || item.originCountry}</span>
        <span>{item.aircraftType || '—'} · {item.registration || '—'}</span>
        <em>{num(item.closestApproach?.distanceKm, 1)} km</em>
      </div>)}
    </div> : <div className="history-empty">
      <History/>
      <h2>{dateFilter || searchTerm ? 'Žádné záznamy vyhovující filtru' : 'Historie je zatím prázdná'}</h2>
      <p>{dateFilter || searchTerm ? 'Zkuste upravit vybrané datum nebo hledaný výraz.' : 'Přelety do 5 km od domu se zaznamenají automaticky.'}</p>
      {dateFilter || searchTerm ? <button onClick={() => { setDateFilter(''); setSearchTerm('') }}>Zrušit filtry</button> : <button onClick={() => setActiveView('map')}>Zpět na živou mapu</button>}
    </div>}
  </Panel>
}
function Kpi({icon:Icon,label,value}){return <div className="kpi"><i><Icon/></i><span>{label}<b>{value}</b></span></div>}
function Toggle({label,checked,onChange}){return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={!!checked} onChange={e=>onChange(e.target.checked)}/><i/></label>}
function RadiusFilter({value,onCommit}){const[draft,setDraft]=useState(value);useEffect(()=>setDraft(value),[value]);const commit=()=>{const next=Math.max(5,Math.min(250,Number(draft)||value));setDraft(next);if(next!==value)onCommit(next)};return <label>Poloměr sledování<div className="radius-control"><input type="number" list="radius-presets" min="5" max="250" step="1" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){commit();e.currentTarget.blur()}}}/><span>km</span><datalist id="radius-presets"><option value="20"/><option value="40"/><option value="80"/><option value="120"/><option value="200"/></datalist></div></label>}
function Detail({label,value}){return <div><span>{label}</span><strong>{value}</strong></div>}
function AirlineLogo({aircraft,large=false}){const[failed,setFailed]=useState(false),name=aircraft.airline||aircraft.airlineIata||aircraft.callsign?.slice(0,3)||'?';return <span className={`airline-logo ${large?'large':''}`}>{aircraft.airlineLogoUrl&&!failed?<img src={aircraft.airlineLogoUrl} alt={`${name} logo`} onError={()=>setFailed(true)}/>:<b>{(aircraft.airlineIata||name).slice(0,2).toUpperCase()}</b>}</span>}
function FlightChart({aircraft}){const base=aircraft?.altitude||8000,vertical=aircraft?.verticalRate||0;const points=Array.from({length:18},(_,i)=>`${i*16},${70-Math.sin(i/4)*8-(vertical*i/4)-(base/15000)*35}`).join(' ');return <div className="flight-chart"><svg viewBox="0 0 272 90" preserveAspectRatio="none"><g><line x1="0" y1="20" x2="272" y2="20"/><line x1="0" y1="50" x2="272" y2="50"/><line x1="0" y1="80" x2="272" y2="80"/></g><polyline points={points}/></svg><div><span>-10 min</span><span>nyní</span><span>+10 min</span></div></div>}
function weatherLabel(code){if(code==null)return'Počasí nedostupné';if(code===0)return'Jasno';if(code<=3)return'Polojasno';if(code<=48)return'Mlha';if(code<=67)return'Déšť';if(code<=77)return'Sněžení';return'Přeháňky'}
function Settings({config,onSave,onClose,onLocation}){
 const[d,setD]=useState(config),set=(k,v)=>setD(c=>({...c,[k]:v})),home=(k,v)=>setD(c=>({...c,home:{...c.home,[k]:v}}))
 const geocode=async()=>{const r=await fetch(`/api/geocode?q=${encodeURIComponent(d.home.address||d.home.label)}`),items=await r.json();if(items[0])setD(c=>({...c,home:{...c.home,latitude:+items[0].lat,longitude:+items[0].lon,label:items[0].display_name.split(',')[0]}}))}
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="settings-modal"><header><div><Settings2/><span>NASTAVENÍ DISPLEJE</span></div><button onClick={onClose}><X/></button></header><div className="settings-scroll"><CredentialEditor/><div className="settings-body"><label className="wide">Adresa<input value={d.home.address||''} onChange={e=>home('address',e.target.value)}/><button onClick={geocode}>Vyhledat</button></label><label>Zeměpisná šířka<input type="number" step=".0001" value={d.home.latitude} onChange={e=>home('latitude',+e.target.value)}/></label><label>Zeměpisná délka<input type="number" step=".0001" value={d.home.longitude} onChange={e=>home('longitude',+e.target.value)}/></label><button className="location" onClick={onLocation}><Crosshair/>Použít aktuální polohu</button><label>Poloměr (km)<input type="number" value={d.radiusKm} onChange={e=>set('radiusKm',+e.target.value)}/></label><label>Min. výška (m)<input type="number" value={d.minAltitude} onChange={e=>set('minAltitude',+e.target.value)}/></label><label>Max. výška (m)<input type="number" value={d.maxAltitude} onChange={e=>set('maxAltitude',+e.target.value)}/></label><label>Střídání letadel (s)<input type="number" min="0" value={d.rotationSeconds} onChange={e=>set('rotationSeconds',Math.max(0,+e.target.value))}/></label><div className="settings-toggle"><Toggle label="Zobrazit popisky letadel" checked={d.displayTooltips} onChange={v=>set('displayTooltips',v)}/></div><label>Jednotky<select value={d.units} onChange={e=>set('units',e.target.value)}><option value="metric">Metrické</option><option value="imperial">Imperiální</option></select></label><label>Jazyk<select value={d.language} onChange={e=>set('language',e.target.value)}><option value="cs">Čeština</option><option value="en">English</option></select></label><button className="notify" onClick={()=>window.Notification?.requestPermission()}><Bell/>Povolit upozornění</button></div></div><footer><button onClick={onClose}>Zrušit</button><button className="primary" onClick={()=>onSave(d)}>Uložit nastavení</button></footer></div></div>
}

function CredentialEditor(){
 const[status,setStatus]=useState({configured:false}),[clientId,setClientId]=useState(''),[clientSecret,setClientSecret]=useState(''),[raw,setRaw]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false)
 useEffect(()=>{fetch('/api/credentials/opensky').then(r=>r.json()).then(setStatus)},[])
 const submit=async()=>{setSaving(true);setMessage('');try{const credentials=raw.trim()?raw:{clientId,clientSecret};const r=await fetch('/api/credentials/opensky',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({credentials})}),body=await r.json();setStatus(body);if(!r.ok)throw Error(body.validation?.error||body.error||'Ověření selhalo');setClientId('');setClientSecret('');setRaw('');setMessage('Credentials jsou platné a OAuth připojení je aktivní.')}catch(e){setMessage(e.message)}finally{setSaving(false)}}
 const verify=async()=>{setSaving(true);setMessage('');const r=await fetch('/api/credentials/opensky/verify',{method:'POST'}),body=await r.json();setStatus(body);setMessage(r.ok?'OAuth ověření proběhlo úspěšně.':body.validation?.error||'Ověření selhalo.');setSaving(false)}
  const remove=async()=>{const r=await fetch('/api/credentials/opensky',{method:'DELETE'});setStatus(await r.json());setMessage('Credentials byly odstraněny.')}
  const file=async e=>{const selected=e.target.files?.[0];if(selected){setRaw(await selected.text());setMessage(`Načten soubor ${selected.name}. Dosud nebyl odeslán.`)}}
  const displayClientId = status.clientId || status.maskedClientId || (status.configured ? 'Uložený klient' : 'Anonymní přístup')
  return <section className="credentials-box"><header><div><ShieldCheck/><span>OPENSKY API CREDENTIALS</span></div><b className={status.validation?.valid?'configured':status.configured?'invalid':''}>{status.validation?.valid?`Ověřeno · ${displayClientId}`:status.configured?`Neověřeno · ${displayClientId}`:'Anonymní přístup'}</b></header><div className="credential-status"><span className={status.validation?.valid?'ok':'off'}><i/>OAuth {status.validation?.valid?'ověřen':'neověřen'}</span><span className={status.tokenActive?'ok':'off'}><i/>Token {status.tokenActive?'aktivní':'neaktivní'}</span><span className={status.liveData?'ok':'off'}><i/>Data {status.liveData?'LIVE':'offline/demo'}</span>{status.validation?.verifiedAt&&<time>Ověřeno {new Date(status.validation.verifiedAt).toLocaleString('cs-CZ')}</time>}</div><p>Secret je po odeslání uložen pouze šifrovaně na serveru. Zpět do prohlížeče se nikdy nevrací.</p><div className="credential-grid"><label>Client ID<input autoComplete="off" value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="mondychan-api-client"/></label><label>Client Secret<input type="password" autoComplete="new-password" value={clientSecret} onChange={e=>setClientSecret(e.target.value)} placeholder="••••••••••••"/></label><label className="credential-paste">Vložit celý JSON<textarea value={raw} onChange={e=>setRaw(e.target.value)} spellCheck="false" placeholder={'{"clientId":"…","clientSecret":"…"}'}/></label><label className="file-pick"><FileJson/><span>Nahrát JSON soubor</span><input type="file" accept="application/json,.json" onChange={file}/></label></div>{message&&<div className="credential-message">{message}</div>}<footer><button disabled={!status.configured||saving} onClick={remove}><Trash2/>Odstranit</button><button disabled={!status.configured||saving} onClick={verify}><RefreshCw className={saving?'spin':''}/>Znovu ověřit</button><button className="primary" disabled={saving||(!raw.trim()&&(!clientId||!clientSecret))} onClick={submit}>{saving?'Ověřuji…':'Uložit a ověřit'}</button></footer></section>

}

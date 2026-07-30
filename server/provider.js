import { bounds, bearing, closestApproach, distanceKm, predictedFlightPath } from './geo.js'

const DEMO = [
  ['4b1801','SWR156','Switzerland',14.458,50.087,10972,238,126,-1.3],
  ['3c65ac','DLH7LK','Germany',14.315,50.142,10363,244,142,.2],
  ['40621d','BAW948','United Kingdom',14.581,50.024,8869,251,291,2.8],
  ['49d08f','CSA62F','Czech Republic',14.392,49.991,7315,216,18,5.4],
]
const AIRLINES = {
  BAW:{name:'British Airways',iata:'BA'},DLH:{name:'Lufthansa',iata:'LH'},SWR:{name:'Swiss',iata:'LX'},CSA:{name:'Czech Airlines',iata:'OK'},
  RYR:{name:'Ryanair',iata:'FR'},EZY:{name:'easyJet',iata:'U2'},AFR:{name:'Air France',iata:'AF'},KLM:{name:'KLM',iata:'KL'},
  UAE:{name:'Emirates',iata:'EK'},QTR:{name:'Qatar Airways',iata:'QR'},LOT:{name:'LOT Polish Airlines',iata:'LO'},EWG:{name:'Eurowings',iata:'EW'},
  AUA:{name:'Austrian Airlines',iata:'OS'},AEE:{name:'Aegean Airlines',iata:'A3'},PGT:{name:'Pegasus Airlines',iata:'PC'},ISR:{name:'Israir Airlines',iata:'6H'},
  NSZ:{name:'Norwegian Air Sweden AOC',iata:'D8'},NOZ:{name:'Norwegian Air Shuttle',iata:'DY'},NAX:{name:'Norwegian',iata:'DY'},
}
const AIRLINE_NAMES={'norwegian air sweden aoc':'D8','norwegian air sweden':'D8','norwegian air shuttle':'DY','norwegian':'DY','air france':'AF','british airways':'BA','deutsche lufthansa':'LH','lufthansa':'LH','swiss international air lines':'LX','klm royal dutch airlines':'KL','ryanair':'FR','easyjet':'U2','eurowings':'EW','austrian airlines':'OS'}

export function resolveAirlineIata(prefix,name,provided){return provided||AIRLINES[prefix]?.iata||AIRLINE_NAMES[String(name||'').trim().toLowerCase()]}

export class AircraftProvider {
  constructor(options = {}) { this.timeout = options.timeout || 9000; this.credentials = options.credentials || null; this.contactUrl=options.contactUrl||'http://localhost/contact';this.cache = null; this.metadata = new Map(); this.positionHistory = new Map(); this.accessToken=null }
  setCredentials(credentials){this.credentials=credentials;this.accessToken=null}
  credentialStatus(){return{authenticated:!!this.credentials,tokenActive:!!this.accessToken&&this.accessToken.expiresAt>Date.now()}}
  async verifyCredentials(){if(!this.credentials)return{valid:false,error:'Credentials nejsou nastaveny'};try{await this.token();return{valid:true,verifiedAt:new Date().toISOString(),tokenActive:true}}catch(error){this.accessToken=null;return{valid:false,verifiedAt:new Date().toISOString(),tokenActive:false,error:error.message}}}
  async token(){
    if(!this.credentials)return null
    if(this.accessToken?.expiresAt>Date.now()+30000)return this.accessToken.value
    const body=new URLSearchParams({grant_type:'client_credentials',client_id:this.credentials.clientId,client_secret:this.credentials.clientSecret})
    const response=await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(this.timeout)})
    if(!response.ok)throw new Error(`OpenSky OAuth returned ${response.status}`)
    const data=await response.json();this.accessToken={value:data.access_token,expiresAt:Date.now()+Math.max(30,(data.expires_in||300)-20)*1000};return this.accessToken.value
  }
  parse(state) { return { icao24: state[0], callsign: state[1]?.trim() || state[0].toUpperCase(), originCountry: state[2], longitude: state[5], latitude: state[6], altitude: state[7] ?? state[13], onGround: state[8], velocity: state[9], heading: state[10], verticalRate: state[11], squawk: state[14], updatedAt:state[4] } }
  demo(home) { return DEMO.map(([icao24,callsign,originCountry,lon,lat,altitude,velocity,heading,verticalRate]) => ({ icao24,callsign,originCountry, longitude: home.longitude + lon - 14.4378, latitude: home.latitude + lat - 50.0755, altitude,velocity,heading,verticalRate,onGround:false,updatedAt:Math.floor(Date.now()/1000) })) }
  recordPositions(states){
    const now=Date.now(),cutoff=now-20*60*1000
    for(const aircraft of states){
      const at=(aircraft.updatedAt||Math.floor(now/1000))*1000,list=this.positionHistory.get(aircraft.icao24)||[],last=list.at(-1)
      if(!last||last.at!==at||last.latitude!==aircraft.latitude||last.longitude!==aircraft.longitude)list.push({latitude:aircraft.latitude,longitude:aircraft.longitude,altitude:aircraft.altitude,at})
      this.positionHistory.set(aircraft.icao24,list.filter(point=>point.at>=cutoff).slice(-40))
    }
    for(const[icao,points]of this.positionHistory)if(!points.length||points.at(-1).at<cutoff)this.positionHistory.delete(icao)
  }
  async fetchStates(config) {
    const box = bounds(config.home, config.radiusKm)
    const query = new URLSearchParams(Object.entries(box).map(([key,value]) => [key, value.toFixed(4)]))
    const token=await this.token()
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const response = await fetch(`https://opensky-network.org/api/states/all?${query}`, { headers, signal: AbortSignal.timeout(this.timeout) })
    if (!response.ok) throw new Error(`OpenSky returned ${response.status}`)
    const body = await response.json()
    return (body.states || []).map((state) => this.parse(state)).filter((item) => item.latitude != null && item.longitude != null && !item.onGround)
  }
  async metadataFor(aircraft) {
    const cached = this.metadata.get(aircraft.icao24)
    if (cached && cached.expires > Date.now()) return cached.value
    let value = {}

    // --- Early registration detection (before photo lookup so we can use it) ---
    // Auto-detect Czech registrations from callsigns (OKSEE → OK-SEE, OKB → OK-B)
    if (!value.registration && /^OK[A-Z0-9]{1,6}$/i.test(aircraft.callsign)) {
      const cleanReg = aircraft.callsign.toUpperCase().replace(/^OK/, '')
      value.registration = `OK-${cleanReg}`
    }

    try {
      const response = await fetch(`https://api.adsbdb.com/v0/aircraft/${aircraft.icao24}`, { signal: AbortSignal.timeout(4000) })
      if (response.ok) { const data = (await response.json()).response?.aircraft || {}; if(data.registration)value.registration=data.registration; if(data.type)value.aircraftType=data.type; if(data.manufacturer)value.manufacturer=data.manufacturer; if(data.registered_owner)value.owner=data.registered_owner; if(data.url_photo_thumbnail)value.photoUrl=data.url_photo_thumbnail }
    } catch {}

    if(!value.photoUrl)try{
      const prefix=aircraft.callsign.slice(0,3).toUpperCase()
      const looksLikeRegistration=!AIRLINES[prefix]&&/^[A-Z0-9-]{4,8}$/.test(aircraft.callsign)
      // Build lookups - include hyphenated registration variant when it differs from callsign
      const lookupSet = new Set()
      if(looksLikeRegistration) lookupSet.add(`reg/${encodeURIComponent(aircraft.callsign)}`)
      if(value.registration && value.registration !== aircraft.callsign) lookupSet.add(`reg/${encodeURIComponent(value.registration)}`)
      lookupSet.add(`hex/${encodeURIComponent(aircraft.icao24)}`)
      for(const lookup of lookupSet){
        const response=await fetch(`https://api.planespotters.net/pub/photos/${lookup}`,{headers:{'User-Agent':`AeroplaneApp/0.3 (+${this.contactUrl})`},signal:AbortSignal.timeout(5000)})
        if(!response.ok)continue
        const photo=(await response.json()).photos?.[0]
        if(photo){value.photoUrl=photo.thumbnail_large?.src||photo.thumbnail?.src;value.photoLink=photo.link;value.photoAttribution=photo.photographer;value.photoSource='Planespotters.net';value.photoMatchedBy=lookup.startsWith('reg/')?'registration':'icao24';break}
      }
    }catch{}
    try {
      const response = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(aircraft.callsign)}`, { signal: AbortSignal.timeout(4000) })
      if (response.ok) { const route = (await response.json()).response?.flightroute || {}; value.departure = route.origin?.iata_code || route.origin?.icao_code; value.arrival = route.destination?.iata_code || route.destination?.icao_code; value.airline ||= route.airline?.name; value.airlineIata = route.airline?.iata || route.airline?.iata_code || value.airlineIata; value.airlineIcao = route.airline?.icao || route.airline?.icao_code || value.airlineIcao;if(route.destination?.latitude!=null)value.destinationAirport={iata:route.destination.iata_code,icao:route.destination.icao_code,name:route.destination.name,latitude:route.destination.latitude,longitude:route.destination.longitude,elevation:route.destination.elevation};if(route.origin?.latitude!=null)value.originAirport={iata:route.origin.iata_code,icao:route.origin.icao_code,name:route.origin.name,latitude:route.origin.latitude,longitude:route.origin.longitude} }
    } catch {}
    const prefix = aircraft.callsign.slice(0,3).toUpperCase()
    const known=AIRLINES[prefix]
    value.airline ||= known?.name || (aircraft.originCountry === 'Czech Republic' ? 'Česká republika (Soukromý / GA)' : aircraft.originCountry)
    value.airlineIata=resolveAirlineIata(prefix,value.airline,value.airlineIata)
    value.airlineIcao ||= prefix

    if(value.airlineIata)value.airlineLogoUrl=`https://images.kiwi.com/airlines/64/${encodeURIComponent(value.airlineIata)}.png`
    this.metadata.set(aircraft.icao24, { value, expires: Date.now() + 24 * 60 * 60 * 1000 })
    return value
  }


  async refresh(config) {
    let source = 'live', states
    try { 
      states = await this.fetchStates(config); 
      this.lastError = null;
    } catch (error) { 
      this.lastError = error.message; 
      states = this.demo(config.home); 
      source = 'demo'; 
    }

    this.recordPositions(states)
    const filtered = states.filter((item) => item.altitude >= config.minAltitude && item.altitude <= config.maxAltitude).map((item) => {
      const approach = closestApproach(config.home, item)
      return { ...item, trail:this.positionHistory.get(item.icao24)||[], distanceKm: distanceKm(config.home, item), bearing: bearing(config.home, item), closestApproach: approach }
    }).sort((a,b) => {
      const aScore = a.closestApproach.isApproaching ? a.closestApproach.distanceKm : a.distanceKm + 20
      const bScore = b.closestApproach.isApproaching ? b.closestApproach.distanceKm : b.distanceKm + 20
      return aScore - bScore
    })
    let enriched = await Promise.all(filtered.slice(0, 20).map(async (item) => ({ ...item, ...(await this.metadataFor(item)) })))
    if (config.excludeHelicopters) enriched = enriched.filter((item) => !/helicopter|rotorcraft/i.test(item.aircraftType || ''))
    if (config.excludeLightAircraft) enriched = enriched.filter((item) => !/cessna|piper|light|ultralight|microlight/i.test(`${item.aircraftType || ''} ${item.manufacturer || ''}`))
    enriched = enriched.slice(0, 12).map(item=>({...item,prediction:predictedFlightPath(item)}))
    this.cache = { source, lastError: this.lastError, authenticated:!!this.credentials, updatedAt: new Date().toISOString(), aircraft: enriched }
    return this.cache
  }
  getCache() { return this.cache }
}

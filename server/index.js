import 'dotenv/config'
import compression from 'compression'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'node:path'
import https from 'node:https'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AircraftProvider } from './provider.js'
import { JsonStore } from './store.js'
import { CredentialStore } from './credentials.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 3000)
const interval = Math.max(15000, Number(process.env.REFRESH_INTERVAL_MS || 30000))
const store = new JsonStore(process.env.DATA_DIR || path.join(root, 'data'))
const credentialStore = new CredentialStore(process.env.DATA_DIR || path.join(root,'data'),process.env.CREDENTIALS_ENCRYPTION_KEY)
await credentialStore.init()
const legacyCredentials=process.env.OPENSKY_USERNAME&&process.env.OPENSKY_PASSWORD?{clientId:process.env.OPENSKY_USERNAME,clientSecret:process.env.OPENSKY_PASSWORD}:null
const provider = new AircraftProvider({ timeout: Number(process.env.OPENSKY_TIMEOUT_MS || 9000), credentials:credentialStore.get()||legacyCredentials,contactUrl:process.env.APP_CONTACT_URL })
await store.init()
let credentialValidation=provider.credentials?await provider.verifyCredentials():{valid:false,verifiedAt:null,error:null}

let refreshing
async function refresh() {
  if (refreshing) return refreshing
  refreshing = provider.refresh(store.getConfig()).then(async (snapshot) => {
    const overhead = snapshot.aircraft.filter((item) => item.closestApproach.distanceKm <= 5 && item.closestApproach.seconds <= 900)
    for (const item of overhead) await store.addHistory({ ...item, seenAt: new Date().toISOString() })
    return snapshot
  }).catch((error) => { console.error('refresh_failed', error); return provider.getCache() }).finally(() => { refreshing = null })
  return refreshing
}
await refresh()
setInterval(refresh, interval).unref()

const app = express()
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(express.json({ limit: '32kb' }))
app.use(morgan(process.env.LOG_FORMAT || 'combined'))

app.get('/health', (_req,res) => res.json({ status:'ok', source:provider.getCache()?.source, opensky:provider.credentialStatus(), updatedAt:provider.getCache()?.updatedAt, uptime:process.uptime() }))
app.get('/api/aircraft/overhead', async (_req,res) => res.json(provider.getCache() || await refresh()))
app.post('/api/aircraft/refresh', async (_req,res) => res.json(await refresh()))
app.get('/api/config', (_req,res) => res.json(store.getConfig()))
app.put('/api/config', async (req,res) => { const previous=store.getConfig(),config=await store.updateConfig(req.body);const dataKeys=['radiusKm','minAltitude','maxAltitude','excludeHelicopters','excludeLightAircraft'];const dataChanged=dataKeys.some(key=>previous[key]!==config[key])||previous.home.latitude!==config.home.latitude||previous.home.longitude!==config.home.longitude;if(dataChanged)await refresh();res.json(config) })
app.use('/api/credentials',(_req,res,next)=>{res.set('Cache-Control','no-store, max-age=0');res.set('Pragma','no-cache');next()})
const credentialStatus=()=>({...credentialStore.status(),validation:credentialValidation,tokenActive:provider.credentialStatus().tokenActive,liveData:provider.getCache()?.source==='live',dataSource:provider.getCache()?.source||'unknown'})
app.get('/api/credentials/opensky', (_req,res)=>res.json(credentialStatus()))
app.post('/api/credentials/opensky/verify',async(_req,res)=>{credentialValidation=await provider.verifyCredentials();res.status(credentialValidation.valid?200:401).json(credentialStatus())})
app.put('/api/credentials/opensky',async(req,res)=>{try{await credentialStore.save(req.body);provider.setCredentials(credentialStore.get());credentialValidation=await provider.verifyCredentials();if(credentialValidation.valid)await refresh();res.status(credentialValidation.valid?200:401).json(credentialStatus())}catch(error){res.status(400).json({error:error.message})}})
app.delete('/api/credentials/opensky',async(_req,res)=>{await credentialStore.remove();provider.setCredentials(legacyCredentials);credentialValidation=provider.credentials?await provider.verifyCredentials():{valid:false,verifiedAt:null,error:null};await refresh();res.json(credentialStatus())})
app.get('/api/history', (req,res) => res.json({ items:store.getHistory(Math.min(Number(req.query.limit) || 50, 500)), stats:store.getStats() }))
app.get('/api/weather', async (_req,res) => {
  const { latitude,longitude }=store.getConfig().home
  try { const response=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,visibility&wind_speed_unit=kmh`,{signal:AbortSignal.timeout(5000)});res.status(response.status).json(await response.json()) } catch { res.status(503).json({error:'Weather unavailable'}) }
})
app.get('/api/geocode', async (req,res) => {
  if (!req.query.q) return res.status(400).json({ error:'Missing q' })
  try { const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(req.query.q)}`, { headers:{ 'User-Agent':'AeroplaneApp/0.2' }, signal:AbortSignal.timeout(6000) }); res.status(response.status).json(await response.json()) } catch { res.status(503).json({ error:'Geocoding unavailable' }) }
})
app.use(express.static(path.join(root, 'dist')))
app.get('*path', (_req,res) => res.sendFile(path.join(root, 'dist', 'index.html')))
const tls = process.env.HTTPS_CERT_FILE && process.env.HTTPS_KEY_FILE
if (tls) https.createServer({ cert:readFileSync(process.env.HTTPS_CERT_FILE), key:readFileSync(process.env.HTTPS_KEY_FILE) },app).listen(port,()=>console.log(`Aeroplane App listening with HTTPS on port ${port}`))
else app.listen(port, () => console.log(`Aeroplane App listening on http://0.0.0.0:${port}`))

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_CONFIG = {
  home: { latitude: 50.0755, longitude: 14.4378, label: 'Domov', address: 'Praha' },
  radiusKm: 80, minAltitude: 100, maxAltitude: 15000,
  excludeHelicopters: false, excludeLightAircraft: false,
  displayTooltips: false,
  units: 'metric', language: 'cs', lowAltitudeAlert: 2500,
  rotationSeconds: 12, theme:'dark', mapStyle:'dark',
}

export class JsonStore {
  constructor(directory) { this.directory = path.resolve(directory); this.configFile = path.join(this.directory, 'config.json'); this.historyFile = path.join(this.directory, 'history.json') }
  async init() { await mkdir(this.directory, { recursive: true }); const saved=await this.read(this.configFile, DEFAULT_CONFIG);this.config={...DEFAULT_CONFIG,...saved,home:{...DEFAULT_CONFIG.home,...(saved.home||{})}};this.history = await this.read(this.historyFile, []) }
  async read(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')) } catch { return structuredClone(fallback) } }
  async atomicWrite(file, value) { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, file) }

  getConfig() { return this.config }
  async updateConfig(patch) {
    const next={ ...this.config, ...patch, home: { ...this.config.home, ...(patch.home || {}) } }
    next.radiusKm=Math.max(5,Math.min(250,Number(next.radiusKm)||DEFAULT_CONFIG.radiusKm))
    next.minAltitude=Math.max(0,Number(next.minAltitude)||0)
    next.maxAltitude=Math.max(next.minAltitude,Math.min(25000,Number(next.maxAltitude)||DEFAULT_CONFIG.maxAltitude))
    next.theme=['dark','light'].includes(next.theme)?next.theme:'dark'
    next.mapStyle=['dark','light','satellite'].includes(next.mapStyle)?next.mapStyle:'dark'
    next.displayTooltips=next.displayTooltips===true
    this.config=next;await this.atomicWrite(this.configFile,this.config);return this.config
  }
  async addHistory(entry) { 
    const duplicate = this.history.find((item) => item.icao24 === entry.icao24 && Date.now() - new Date(item.seenAt).getTime() < 10 * 60 * 1000); 
    if (duplicate) return; 
    this.history.unshift(entry); 
    this.history = this.history.slice(0, 5000); 
    await this.atomicWrite(this.historyFile, this.history) 
  }
  getHistory(options = {}) { 
    const { limit = 200, date = null, q = '' } = typeof options === 'number' ? { limit: options } : options
    let list = this.history
    if (date) {
      list = list.filter(item => item.seenAt && item.seenAt.startsWith(date))
    }
    if (q) {
      const term = q.trim().toLowerCase()
      list = list.filter(item => 
        (item.callsign && item.callsign.toLowerCase().includes(term)) ||
        (item.airline && item.airline.toLowerCase().includes(term)) ||
        (item.registration && item.registration.toLowerCase().includes(term)) ||
        (item.aircraftType && item.aircraftType.toLowerCase().includes(term)) ||
        (item.icao24 && item.icao24.toLowerCase().includes(term))
      )
    }
    return limit > 0 ? list.slice(0, limit) : list
  }
  getStats() {
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayItems = this.history.filter(item => item.seenAt && item.seenAt.startsWith(todayStr))
    const count = (key) => Object.entries(this.history.reduce((acc, item) => { const value = item[key] || 'Neznámé'; acc[value] = (acc[value] || 0) + 1; return acc }, {})).sort((a,b) => b[1] - a[1]).slice(0, 8).map(([name, total]) => ({ name, total }))
    return { 
      total: this.history.length, 
      todayCount: todayItems.length, 
      airlines: count('airline'), 
      aircraftTypes: count('aircraftType') 
    }
  }
}

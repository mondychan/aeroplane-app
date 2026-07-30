const EARTH_RADIUS_KM = 6371

export const DEFAULT_HOME = { latitude: 50.0755, longitude: 14.4378, label: 'Domov' }

export const DEMO_AIRCRAFT = [
  { icao24: '4b1801', callsign: 'SWR156', origin: 'Switzerland', longitude: 14.458, latitude: 50.087, altitude: 10972, onGround: false, velocity: 238, heading: 126, verticalRate: -1.3, squawk: '1000', updatedAt: Date.now() / 1000 },
  { icao24: '3c65ac', callsign: 'DLH7LK', origin: 'Germany', longitude: 14.315, latitude: 50.142, altitude: 10363, onGround: false, velocity: 244, heading: 142, verticalRate: 0.2, squawk: '2264', updatedAt: Date.now() / 1000 },
  { icao24: '40621d', callsign: 'BAW948', origin: 'United Kingdom', longitude: 14.581, latitude: 50.024, altitude: 8869, onGround: false, velocity: 251, heading: 291, verticalRate: 2.8, squawk: '5321', updatedAt: Date.now() / 1000 },
  { icao24: '49d08f', callsign: 'CSA62F', origin: 'Czech Republic', longitude: 14.392, latitude: 49.991, altitude: 7315, onGround: false, velocity: 216, heading: 18, verticalRate: 5.4, squawk: '3241', updatedAt: Date.now() / 1000 },
]

export function parseOpenSkyState(state) {
  return {
    icao24: state[0], callsign: state[1]?.trim() || state[0].toUpperCase(), origin: state[2],
    longitude: state[5], latitude: state[6], altitude: state[7] ?? state[13], onGround: state[8],
    velocity: state[9], heading: state[10], verticalRate: state[11], squawk: state[14], updatedAt: state[4],
  }
}

export function distanceKm(home, aircraft) {
  const toRad = (value) => value * Math.PI / 180
  const dLat = toRad(aircraft.latitude - home.latitude)
  const dLon = toRad(aircraft.longitude - home.longitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(home.latitude)) * Math.cos(toRad(aircraft.latitude)) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function bearingFromHome(home, aircraft) {
  const toRad = (value) => value * Math.PI / 180
  const toDeg = (value) => value * 180 / Math.PI
  const dLon = toRad(aircraft.longitude - home.longitude)
  const y = Math.sin(dLon) * Math.cos(toRad(aircraft.latitude))
  const x = Math.cos(toRad(home.latitude)) * Math.sin(toRad(aircraft.latitude)) - Math.sin(toRad(home.latitude)) * Math.cos(toRad(aircraft.latitude)) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function cardinal(degrees = 0) {
  return ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'][Math.round(degrees / 45) % 8]
}

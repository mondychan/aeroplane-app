const EARTH_RADIUS_KM = 6371

const radians = (value) => value * Math.PI / 180
const degrees = (value) => value * 180 / Math.PI

export function distanceKm(from, to) {
  const dLat = radians(to.latitude - from.latitude)
  const dLon = radians(to.longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function bearing(from, to) {
  const dLon = radians(to.longitude - from.longitude)
  const y = Math.sin(dLon) * Math.cos(radians(to.latitude))
  const x = Math.cos(radians(from.latitude)) * Math.sin(radians(to.latitude)) - Math.sin(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.cos(dLon)
  return (degrees(Math.atan2(y, x)) + 360) % 360
}

export function closestApproach(home, aircraft, horizonSeconds = 1800) {
  const latScale = 111.32
  const lonScale = 111.32 * Math.cos(radians(home.latitude))
  const x = (aircraft.longitude - home.longitude) * lonScale
  const y = (aircraft.latitude - home.latitude) * latScale
  const speedKmS = Math.max(0, aircraft.velocity || 0) / 1000
  const heading = radians(aircraft.heading || 0)
  const vx = Math.sin(heading) * speedKmS
  const vy = Math.cos(heading) * speedKmS
  const speedSquared = vx * vx + vy * vy
  const rawTime = speedSquared ? -((x * vx) + (y * vy)) / speedSquared : 0
  const seconds = Math.max(0, Math.min(horizonSeconds, rawTime))
  const closestDistanceKm = Math.hypot(x + vx * seconds, y + vy * seconds)
  return { seconds: Math.round(seconds), distanceKm: closestDistanceKm, isApproaching: rawTime > 0, withinHorizon: rawTime <= horizonSeconds }
}

export function bounds(home, radiusKm) {
  const latDelta = radiusKm / 111
  const lonDelta = radiusKm / (111 * Math.cos(radians(home.latitude)))
  return { lamin: home.latitude - latDelta, lamax: home.latitude + latDelta, lomin: home.longitude - lonDelta, lomax: home.longitude + lonDelta }
}

export function predictedFlightPath(aircraft,maxDistanceKm=80){
  const start={latitude:aircraft.latitude,longitude:aircraft.longitude},destination=aircraft.destinationAirport
  if(destination?.latitude!=null&&destination?.longitude!=null){
    const airportDistance=distanceKm(start,destination)
    if(airportDistance<=maxDistanceKm){
      const heading=radians(aircraft.heading||0),tangentKm=Math.min(Math.max(airportDistance*.38,3),22)
      const control={latitude:start.latitude+(tangentKm*Math.cos(heading))/111.32,longitude:start.longitude+(tangentKm*Math.sin(heading))/(111.32*Math.cos(radians(start.latitude)))}
      const points=Array.from({length:17},(_,index)=>{const t=index/16,one=1-t;return{latitude:one*one*start.latitude+2*one*t*control.latitude+t*t*destination.latitude,longitude:one*one*start.longitude+2*one*t*control.longitude+t*t*destination.longitude}})
      const confidence=airportDistance<=25&&(aircraft.verticalRate||0)<-.5?'high':airportDistance<=45?'medium':'low'
      return{type:'destination-guided',airportCode:destination.iata||destination.icao,airportName:destination.name,distanceKm:airportDistance,confidence,points}
    }
  }
  const seconds=600,speedKm=(aircraft.velocity||0)*seconds/1000,heading=radians(aircraft.heading||0),end={latitude:start.latitude+(speedKm*Math.cos(heading))/111.32,longitude:start.longitude+(speedKm*Math.sin(heading))/(111.32*Math.cos(radians(start.latitude)))}
  return{type:'linear',confidence:'low',points:[start,end]}
}

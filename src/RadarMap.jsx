import { Fragment, useEffect } from 'react'
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const planeIcon=(aircraft,selected)=>L.divIcon({
  className:'aircraft-map-marker',
  html:`<div class="map-plane ${selected?'is-selected':''}" style="transform:rotate(${aircraft.heading||0}deg)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 15 9 22 13 22 16 14 13 14 20 17 22 17 24 12 22 7 24 7 22 10 20 10 13 2 16 2 13 9 9Z"/></svg></div>`,
  iconSize:selected?[34,34]:[26,26],iconAnchor:selected?[17,17]:[13,13],
})

function Recenter({home}){const map=useMap();useEffect(()=>{map.setView([home.latitude,home.longitude],map.getZoom())},[home.latitude,home.longitude]);return null}

function projectedPoint(aircraft,seconds){
  const distance=(aircraft.velocity||0)*seconds/1000
  const angle=(aircraft.heading||0)*Math.PI/180
  return [aircraft.latitude+(distance*Math.cos(angle))/111,aircraft.longitude+(distance*Math.sin(angle))/(111*Math.cos(aircraft.latitude*Math.PI/180))]
}

const TILES={dark:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',light:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',satellite:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'}

export function RadarMap({home,aircraft,selected,onSelect,radiusKm,mapStyle='dark',displayTooltips=false}){
  return <MapContainer center={[home.latitude,home.longitude]} zoom={9} zoomControl={true} attributionControl={false} className="live-map">
    <Recenter home={home}/>
    <TileLayer key={mapStyle} url={TILES[mapStyle]||TILES.dark} subdomains={mapStyle==='satellite'?'abc':'abcd'} maxZoom={19}/>
    <Circle center={[home.latitude,home.longitude]} radius={radiusKm*1000} pathOptions={{color:'#23899b',weight:1,opacity:.25,fillOpacity:.02}}/>
    <Circle center={[home.latitude,home.longitude]} radius={700} pathOptions={{color:'#55d9e5',weight:2,fillColor:'#2f9cff',fillOpacity:.4}}><Tooltip direction="top">{home.label}</Tooltip></Circle>
    {aircraft.map((item,index)=><Fragment key={item.icao24}>
      {item.trail?.length>1&&<Polyline positions={item.trail.map(point=>[point.latitude,point.longitude])} pathOptions={{color:index===selected?'#45d8e3':'#78909a',weight:index===selected?3:1.5,opacity:index===selected ? .95 : .4,lineCap:'round'}}/>}
      <Polyline positions={(item.prediction?.points||[{latitude:item.latitude,longitude:item.longitude},projectedPoint(item,Math.min(Math.max(item.closestApproach?.seconds||300,120),600))]).map(point=>Array.isArray(point)?point:[point.latitude,point.longitude])} pathOptions={{color:index===selected?'#f3c65c':'#8d7f59',weight:index===selected?2:1,opacity:index===selected ? .85 : .3,dashArray:'7 7'}}/>
      {index===selected&&item.prediction?.type==='destination-guided'&&item.destinationAirport&&<Circle center={[item.destinationAirport.latitude,item.destinationAirport.longitude]} radius={550} pathOptions={{color:'#f3c65c',weight:2,fillColor:'#f3c65c',fillOpacity:.2}}><Tooltip permanent direction="top" className="airport-tooltip">{item.prediction.airportCode} · cíl</Tooltip></Circle>}
      <Marker position={[item.latitude,item.longitude]} icon={planeIcon(item,index===selected)} eventHandlers={{click:()=>onSelect(index)}}><Tooltip key={`${displayTooltips}-${index===selected}`} permanent={displayTooltips||index===selected} direction="right" offset={[12,0]} className="plane-tooltip"><b>{item.callsign}</b><br/>{Math.round(item.altitude||0).toLocaleString('cs-CZ')} m · {item.distanceKm?.toFixed(1)} km</Tooltip></Marker>
    </Fragment>)}
  </MapContainer>
}

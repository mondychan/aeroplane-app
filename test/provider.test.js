import test from 'node:test'
import assert from 'node:assert/strict'
import { AircraftProvider,resolveAirlineIata } from '../server/provider.js'

test('provider records ordered position history without duplicating snapshots',()=>{
  const provider=new AircraftProvider(),base={icao24:'abc123',latitude:50,longitude:14,altitude:1000,updatedAt:Math.floor(Date.now()/1000)}
  provider.recordPositions([base]);provider.recordPositions([base]);provider.recordPositions([{...base,longitude:14.1,updatedAt:base.updatedAt+30}])
  const trail=provider.positionHistory.get('abc123')
  assert.equal(trail.length,2)
  assert.equal(trail[0].longitude,14)
  assert.equal(trail[1].longitude,14.1)
})

test('resolves Norwegian Air Sweden logo code from ICAO and airline name',()=>{
  assert.equal(resolveAirlineIata('NSZ','Norwegian Air Sweden AOC'),'D8')
  assert.equal(resolveAirlineIata('XXX','Norwegian Air Sweden AOC'),'D8')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { closestApproach, distanceKm, predictedFlightPath } from '../server/geo.js'

test('distance is zero for the same point', () => assert.equal(distanceKm({latitude:50,longitude:14},{latitude:50,longitude:14}), 0))
test('predicts an approaching eastbound aircraft', () => {
  const result = closestApproach({latitude:50,longitude:14}, {latitude:50,longitude:13.9,velocity:200,heading:90})
  assert.equal(result.isApproaching, true)
  assert.ok(result.seconds > 20 && result.seconds < 100)
  assert.ok(result.distanceKm < .1)
})
test('does not predict a past crossing', () => assert.equal(closestApproach({latitude:50,longitude:14},{latitude:50,longitude:14.1,velocity:200,heading:90}).seconds, 0))
test('curves a descending flight toward its nearby destination airport',()=>{
  const prediction=predictedFlightPath({latitude:50,longitude:14,velocity:100,heading:90,verticalRate:-2,destinationAirport:{latitude:50.1,longitude:14,iata:'PRG',name:'Prague'}})
  assert.equal(prediction.type,'destination-guided')
  assert.equal(prediction.confidence,'high')
  assert.equal(prediction.points.length,17)
  assert.ok(prediction.points[1].longitude>14)
  assert.deepEqual(prediction.points.at(-1),{latitude:50.1,longitude:14})
})

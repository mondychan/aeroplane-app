import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,readFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ApiKeyStore, CredentialStore,parseApiKey,parseCredentials } from '../server/credentials.js'

test('parses credentials from an OpenSky JSON string',()=>{
  assert.deepEqual(parseCredentials('{"clientId":"test-client","clientSecret":"very-secret"}'),{clientId:'test-client',clientSecret:'very-secret'})
})

test('parses CARTO API keys',()=>{
  assert.equal(parseApiKey(' cb1_test-key '),'cb1_test-key')
  assert.throws(()=>parseApiKey(''))
})

test('CARTO API keys are encrypted at rest and masked by status',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'aeroplane-carto-credentials-'))
  try{
    const key=Buffer.alloc(32,8).toString('base64'),store=new ApiKeyStore(directory,key,'carto.key.enc')
    await store.init();await store.save({apiKey:'cb1_secret-key'})
    const stored=await readFile(path.join(directory,'carto.key.enc'),'utf8')
    assert.equal(stored.includes('cb1_secret-key'),false)
    assert.equal(store.status().apiKey,null)
    assert.equal(store.status().configured,true)
    assert.equal(store.get(),'cb1_secret-key')
    const reopened=new ApiKeyStore(directory,key,'carto.key.enc');await reopened.init()
    assert.equal(reopened.get(),'cb1_secret-key')
  }finally{await rm(directory,{recursive:true,force:true})}
})

test('credentials are encrypted at rest and never exposed by status',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'aeroplane-credentials-'))
  try{
    const key=Buffer.alloc(32,7).toString('base64'),store=new CredentialStore(directory,key)
    await store.init();await store.save({clientId:'test-client',clientSecret:'very-secret'})
    const stored=await readFile(path.join(directory,'opensky.credentials.enc'),'utf8')
    assert.equal(stored.includes('very-secret'),false)
    assert.equal(stored.includes('test-client'),false)
    assert.deepEqual(store.get(),{clientId:'test-client',clientSecret:'very-secret'})
    assert.equal('clientSecret' in store.status(),false)
    const reopened=new CredentialStore(directory,key);await reopened.init()
    assert.equal(reopened.get().clientSecret,'very-secret')
  }finally{await rm(directory,{recursive:true,force:true})}
})

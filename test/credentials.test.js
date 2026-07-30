import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,readFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CredentialStore,parseCredentials } from '../server/credentials.js'

test('parses credentials from an OpenSky JSON string',()=>{
  assert.deepEqual(parseCredentials('{"clientId":"test-client","clientSecret":"very-secret"}'),{clientId:'test-client',clientSecret:'very-secret'})
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

import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto'
import { chmod,mkdir,readFile,rename,writeFile } from 'node:fs/promises'
import path from 'node:path'

function decodeKey(value){
  if(!value)return null
  const key=Buffer.from(value,'base64')
  if(key.length!==32)throw new Error('CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  return key
}

export function parseCredentials(input){
  let value=input
  if(typeof value==='string'){try{value=JSON.parse(value)}catch{throw new Error('Vložený obsah není platný JSON')}}
  if(value?.credentials)value=parseCredentials(value.credentials)
  const clientId=String(value?.clientId||'').trim(),clientSecret=String(value?.clientSecret||'').trim()
  if(!clientId||!clientSecret)throw new Error('JSON musí obsahovat clientId a clientSecret')
  if(clientId.length>200||clientSecret.length>1000)throw new Error('Credentials mají neplatnou délku')
  return{clientId,clientSecret}
}

export function parseApiKey(input){
  const value=typeof input==='string'?input:input?.apiKey
  const apiKey=String(value||'').trim()
  if(!apiKey)throw new Error('API key nesmí být prázdný')
  if(apiKey.length>500)throw new Error('API key má neplatnou délku')
  return apiKey
}

export class CredentialStore{
  constructor(directory,keyValue){this.directory=path.resolve(directory);this.file=path.join(this.directory,'opensky.credentials.enc');this.keyFile=path.join(this.directory,'.credentials-key');this.keyValue=keyValue;this.credentials=null}
  async init(){await mkdir(this.directory,{recursive:true});this.key=decodeKey(this.keyValue)||await this.localKey();try{this.credentials=this.decrypt(JSON.parse(await readFile(this.file,'utf8')))}catch{this.credentials=null}}
  async localKey(){try{const key=Buffer.from((await readFile(this.keyFile,'utf8')).trim(),'base64');if(key.length===32)return key}catch{}const key=randomBytes(32);await writeFile(this.keyFile,key.toString('base64'),{mode:0o600});await chmod(this.keyFile,0o600).catch(()=>{});return key}
  encrypt(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return{version:1,algorithm:'aes-256-gcm',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}}
  decrypt(payload){const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(payload.iv,'base64'));decipher.setAuthTag(Buffer.from(payload.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data,'base64')),decipher.final()]).toString('utf8'))}
  async save(input){const credentials=parseCredentials(input),temporary=`${this.file}.tmp`;await writeFile(temporary,JSON.stringify(this.encrypt(credentials)),{mode:0o600});await rename(temporary,this.file);await chmod(this.file,0o600).catch(()=>{});this.credentials=credentials;return this.status()}
  get(){return this.credentials}
  status(){return{configured:!!this.credentials,clientId:this.credentials?mask(this.credentials.clientId):null,storage:'aes-256-gcm'}}
  async remove(){this.credentials=null;await writeFile(this.file,'',{mode:0o600}).catch(()=>{});return this.status()}
}

export class ApiKeyStore{
  constructor(directory,keyValue,fileName='api-key.enc'){this.directory=path.resolve(directory);this.file=path.join(this.directory,fileName);this.keyFile=path.join(this.directory,'.credentials-key');this.keyValue=keyValue;this.apiKey=null}
  async init(){await mkdir(this.directory,{recursive:true});this.key=decodeKey(this.keyValue)||await this.localKey();try{this.apiKey=this.decrypt(JSON.parse(await readFile(this.file,'utf8')))}catch{this.apiKey=null}}
  async localKey(){try{const key=Buffer.from((await readFile(this.keyFile,'utf8')).trim(),'base64');if(key.length===32)return key}catch{}const key=randomBytes(32);await writeFile(this.keyFile,key.toString('base64'),{mode:0o600});await chmod(this.keyFile,0o600).catch(()=>{});return key}
  encrypt(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return{version:1,algorithm:'aes-256-gcm',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}}
  decrypt(payload){const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(payload.iv,'base64'));decipher.setAuthTag(Buffer.from(payload.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(payload.data,'base64')),decipher.final()]).toString('utf8')}
  async save(input){this.apiKey=parseApiKey(input);const temporary=`${this.file}.tmp`;await writeFile(temporary,JSON.stringify(this.encrypt(this.apiKey)),{mode:0o600});await rename(temporary,this.file);await chmod(this.file,0o600).catch(()=>{});return this.status()}
  get(){return this.apiKey}
  status({includeKey=false}={}){return{configured:!!this.apiKey,apiKey:includeKey?this.apiKey:null,maskedApiKey:this.apiKey?mask(this.apiKey):null,storage:'aes-256-gcm'}}
  async remove(){this.apiKey=null;await writeFile(this.file,'',{mode:0o600}).catch(()=>{});return this.status()}
}

function mask(value){return value.length<7?'••••••':`${value.slice(0,4)}••••${value.slice(-3)}`}

# Aeroplane App

Automatizovaný domácí letový displej pro prohlížeč nebo Raspberry Pi. Server pravidelně získává ADS-B polohy z OpenSky, predikuje nejbližší bod trajektorie vůči domu a doplňuje veřejná metadata z ADSBDB.

## Funkce

- serverová OpenSky proxy s cache a obnovou každých 30 sekund,
- predikce času a vzdálenosti nejbližšího průletu,
- typ, registrace, aerolinka, trasa a dostupná fotografie,
- automatické střídání letadel a zotavení po výpadku,
- konfigurace adresy, souřadnic, poloměru, výšek, filtrů, jednotek a jazyka,
- serverová historie, statistiky a upozornění na nízký přelet,
- responzivní kiosk rozložení, Docker, health endpoint, logování a volitelné HTTPS.

## Lokální vývoj

```powershell
npm install
npm run dev:server
```

V druhém terminálu:

```powershell
npm run dev
```

Frontend poběží na `http://localhost:5173` a přes Vite proxy používá backend na portu 3000.

## Produkční provoz

```powershell
npm run build
npm start
```

Aplikace i API jsou dostupné na `http://localhost:3000`. Konfigurace a historie se ukládají do `data/`.

## Docker / Raspberry Pi

```powershell
docker compose up --build -d
```

Otevřete `http://adresa-zarizeni:3010`. Pro Chromium kiosk lze použít například:

```text
chromium --kiosk --noerrdialogs --disable-infobars http://127.0.0.1:3010
```

Compose používá persistentní volume, automatický restart a rotaci logů.

### Spuštění hotového image na serveru

Každý push do větve `main` spustí testy a vytvoří image pro `linux/amd64` i `linux/arm64`:

```text
ghcr.io/mondychan/aeroplane-app:latest
```

Protože je repozitář privátní, server se musí nejprve přihlásit do GitHub Container Registry pomocí GitHub Personal Access Tokenu s oprávněním `read:packages`:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u mondychan --password-stdin
```

Na server přeneste `docker-compose.server.yml`, případně také `.env`, a spusťte:

```bash
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

Novou verzi nasadíte opakováním těchto dvou příkazů. Data, nastavení, historie a šifrované OpenSky credentials zůstávají v persistentním volume `aeroplane-data`.

## Konfigurace

Zkopírujte `.env.example` na `.env`. Důležité proměnné:

- `REFRESH_INTERVAL_MS` – interval serverového načítání, minimálně 15 s,
- `OPENSKY_USERNAME` a `OPENSKY_PASSWORD` – volitelné přihlášení pro vyšší limity,
- `CREDENTIALS_ENCRYPTION_KEY` – doporučený 32bajtový klíč v Base64 pro šifrování OpenSky OAuth credentials,
- `DATA_DIR` – umístění historie a konfigurace,
- `HTTPS_CERT_FILE` a `HTTPS_KEY_FILE` – certifikát a privátní klíč pro přímé HTTPS,
- `TRUST_PROXY=true` – při provozu za reverzní proxy.

Veřejný anonymní OpenSky má omezené kvóty. Server proto odpovědi cacheuje a při nedostupnosti přejde do jasně označeného demo režimu.

## API a monitoring

- `GET /api/aircraft/overhead` – aktuální seřazené přelety,
- `POST /api/aircraft/refresh` – vynucená obnova s ochranou proti souběhu,
- `GET/PUT /api/config` – persistentní nastavení,
- `GET /api/history` – historie a agregované statistiky,
- `GET /api/geocode?q=...` – serverové hledání adresy,
- `GET /health` – zdroj dat, čas poslední obnovy a uptime.

HTTP požadavky se logují na standardní výstup. V Dockeru jsou logy omezené na tři soubory po 10 MB.

### OpenSky OAuth credentials

V nastavení displeje lze zadat `clientId` a `clientSecret` samostatně, vložit celý JSON nebo vybrat JSON soubor. Soubor se načte v prohlížeči a odešle přes stejné zabezpečené API; není veřejně servírován.

Credentials jsou na disku šifrovány AES-256-GCM a API nikdy nevrací secret zpět. V produkci nastavte `CREDENTIALS_ENCRYPTION_KEY` mimo repozitář, použijte HTTPS a omezte přístup k serveru. Bez explicitního klíče server vytvoří lokální klíč v datovém adresáři s omezenými právy, což je pohodlné pro domácí instalaci, ale méně odolné při kompromitaci celého disku.

## Testy

```powershell
npm test
npm run build
```

Testy ověřují geografické výpočty včetně budoucího nejbližšího bodu trajektorie.

# Firma Tizen para TV Samsung

Estado: **2026-10-28**. Basado en la documentaciÃ³n pÃºblica de Samsung/Tizen.
No contiene certificados, claves ni contraseÃ±as.

## 1. Lo bÃ¡sico

Un perfil de firma Tizen tiene dos partes:

- **Author certificate**: identifica al desarrollador. Su clave privada firma el
  paquete. Debe conservarse: para actualizar una app ya instalada se necesita el
  mismo autor.
- **Distributor certificate**: identifica quiÃ©n autoriza la instalaciÃ³n. En TV
  Samsung se asocia a uno o mÃ¡s **DUID** (el ID Ãºnico de cada TV).

La documentaciÃ³n de Samsung lo dice explÃ­citamente: una app firmada solo corre
en los dispositivos registrados en el certificado de distribuidor.

## 2. Consecuencia para compartir

**Un WGT/TPK firmado con el perfil de tu TV no sirve como instalador universal.**
El distribuidor estÃ¡ atado a los DUID registrados.

Hay tres escenarios:

| Escenario | QuÃ© se puede dar | Tiempo de instalaciÃ³n |
|---|---|---|
| Tus TV / flota controlada | Paquete firmado + DUIDs registrados + instalador | 1â€“3 min por TV |
| Usuario cualquiera | Fuente + que firme con su cuenta/DUID | 10â€“30 min |
| Tienda Samsung | PublicaciÃ³n en Seller Office | DÃ­as/semanas y revisiÃ³n |

Por eso **no se debe prometer â€œ1 minutoâ€ a desconocidos** con un paquete firmado
por ti. Solo es realista para TVs cuyo DUID ya estÃ© en tu certificado de
distribuidor y que ya estÃ©n en Developer Mode.

## 2.1 Emulador de TV

Desde **Samsung TV Extension 7.0.1**, el emulador TV solo instala paquetes
firmados con un **certificado Samsung**. No sirve un certificado Tizen local
autofirmado para el emulador TV.

El emulador tiene su propio DUID. Para probar la firma hay que crear un perfil
Samsung que incluya el DUID del emulador, firmar el paquete e instalarlo en el
emulador. Un paquete firmado con el DUID del emulador **no sirve para una TV
real**, y uno firmado con el DUID de la TV no sirve para el emulador.

La guÃ­a oficial de `tizen-agent-skills` documenta el flujo de adquirir el DUID
del emulador (`acquire-duid --serial emulator-26101`) y crear el perfil Samsung.
Es Ãºtil para comprobar el formato de firma y la instalaciÃ³n, no para validar el
DUID retail.

## 3. Flujo con Tizen Studio

1. Instalar Tizen Studio + **Samsung Certificate Extension** + TV Extension.
2. Conectar la TV en Developer Mode.
3. Abrir **Tools > Certificate Manager**.
4. Crear perfil **Samsung > TV**:
   - author certificate;
   - distributor certificate;
   - aÃ±adir el DUID de la TV (manual o desde el dispositivo conectado).
5. Elegir nivel **Public** o **Partner** segÃºn lo que use la app.
6. Firmar:
   - WGT: `tizen package -t wgt -s <perfil> -- dist`
   - TPK: `tizen build-cs -C Release -s <perfil> -- native/ArtWatchTv`
7. Instalar en la TV en Developer Mode:
   - `tizen install ... -s <TV_IP>:26101`
   - o `sdb install` para TPK.

## 3.1 Firma rÃ¡pida para una IA/agente

Objetivo: firmar los paquetes para **esta** TV sin crear certificados nuevos.

1. Comprobar el perfil activo:

   ```powershell
   C:\tizen-sdk\tools\ide\bin\tizen.bat security-profiles list
   ```

   Usa el perfil activo que corresponda a tu TV. **No crear otro author**
   si la app ya estÃ¡ instalada; el update fallarÃ­a por author distinto.

2. Comprobar que el DUID de la TV estÃ¡ en el perfil. Si es otra TV, **parar**:
   hay que crear un perfil con su DUID; no reutilizar `<signing-profile>`.

3. Firmar:

   ```powershell
   npm ci
   npm run build
   C:\tizen-sdk\tools\ide\bin\tizen.bat package -t wgt -s <signing-profile> -- dist
   C:\tizen-sdk\tools\ide\bin\tizen.bat build-cs -C Release -s <signing-profile> -- native/ArtWatchTv
   ```

4. Verificar salidas:

   ```text
   dist\HomePunk.wgt
   native\ArtWatchTv\bin\Release\net6.0\ArtWatch1-1.6.2.tpk
   ```

5. No instalar en la TV sin autorizaciÃ³n explÃ­cita del usuario.

Tiempo estimado si el perfil y las herramientas ya existen:

| Paso | Tiempo |
|---|---:|
| `npm ci` (si falta `node_modules`) | 1â€“2 min |
| `npm run build` | 10â€“60 s |
| Firmar WGT | 5â€“20 s |
| Compilar/firmar TPK | 5â€“20 s |
| Instalar WGT + TPK | 20â€“60 s |
| **Total con entorno listo** | **1â€“3 min** |
| Crear perfil/certificado si falta | **10â€“30 min** |
| Instalar Tizen Studio desde cero | **30â€“60 min** |

## 4. Public vs Partner

- **Public**: suficiente para apps normales; es el punto de partida.
- **Partner**: necesario para APIs/servicios de nivel Partner y para algunos
  casos de arranque en segundo plano.
- El `ArtWatch` es un servicio; hay que verificar en cada modelo si el perfil
  Public basta o si exige Partner. **No estÃ¡ verificado en otras TVs.**

## 5. Reglas prÃ¡cticas

- No compartas `.p12`, `.pwd`, `password.txt` ni la clave del author.
- No uses un certificado Tizen local autofirmado para una TV Samsung: hace
  falta un certificado Samsung online-CA (Public o Partner).
- No cambies el author de una app ya instalada: hay que desinstalarla antes.
- El DUID cambia si se resetea Smart Hub; el certificado deja de coincidir.
- Un perfil de distribuidor puede incluir varios DUID; es la vÃ­a para una flota
  controlada, no para usuarios desconocidos.
- El paquete firmado no se puede â€œre-firmarâ€ sin la clave del author.
- Un instalador para flota debe incluir los DUIDs de esas TVs en el perfil de
  distribuidor; no en un certificado pÃºblico genÃ©rico.

## 6. QuÃ© se puede automatizar

- Detectar la TV y su DUID.
- Conectar por SDB.
- Instalar paquetes ya firmados.
- Comprobar versiÃ³n/estado.

No conviene automatizar la creaciÃ³n del certificado: requiere login de Samsung,
elegir perfil y confirmar DUID. Un instalador puede **guiar** ese paso, pero no
hacerlo invisible.

## 7. Tizen anteriores

La misma estructura author/distributor/DUID aplica, pero:

- hay que usar la **TV Extension y el SDK de la versiÃ³n objetivo** (2.3, 2.4,
  3.0, 4.0â€¦), no el SDK 10;
- **Tizen 2.3/2.4:** Samsung ya no publica esas TV Extension. El paquete
  **3.1.2/4.0b** del archivo se usa como fallback no oficial; no hay garantÃ­a.
- **Tizen 3.0â€“9.0:** usar la extensiÃ³n de esa versiÃ³n y recompilar.
- Tizen 2.3â€“3.0 no tienen Tizen .NET TV; el watcher tendrÃ­a que ser nativo
  C/C++ o web service;
- el comportamiento de servicios en segundo plano y `on-boot` cambia por
  modelo/aÃ±o;
- no estÃ¡ probado en hardware.

Descargas:
- Archivo de TV Extensions:
  <https://developer.samsung.com/smarttv/develop/tools/tv-extension/archive.html>
- Emulador TV:
  <https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-emulator.html>
- Tizen Studio anterior:
  <http://download.tizen.org/sdk/Installer/>
- GuÃ­a de certificados `tizen-agent-skills`:
  <https://github.com/Samsung/tizen-agent-skills/blob/main/tizen-sdk-skills/docs/certificate/certificate-manager-guide.en.md>

Ver [`COMPATIBILIDAD-TIZEN.md`](COMPATIBILIDAD-TIZEN.md) y
[`EMULADOR-TIZEN.md`](EMULADOR-TIZEN.md).

## 8. Referencias

- Crear certificados Samsung:
  <https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html>
- PolÃ­tica de instalaciÃ³n en emulador TV:
  <https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-emulator/application-install-policy.html>
- Developer Mode:
  <https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html>
- Certificados Tizen (concepto author/distributor/DUID):
  <https://developer.samsung.com/galaxy-watch-tizen/getting-certificates/overview.html>
- Tizen .NET TV (solo 2018+):
  <https://developer.samsung.com/smarttv/develop/tizen-net-tv.html>



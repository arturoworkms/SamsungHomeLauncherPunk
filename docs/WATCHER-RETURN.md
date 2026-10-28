# Retorno a HomePunk con ArtWatch

Estado: **ArtWatch 1.6.3**, HomePunk 0.7.20. La app no modifica el firmware ni
la pantalla de inicio del sistema.

## Problema

El botón Home de la TV abre Samsung Home. Para que una app de terceros aparezca
en su lugar sin cambiar el Home del sistema, se usa un servicio que observa el
foco y vuelve a abrir HomePunk.

## Solución

`ArtWatch1.WatchService` es un servicio Tizen que observa qué app tiene el foco
y abre HomePunk cuando aparece Samsung Home.

```text
Home
  ↓
Samsung Home
  ↓  foreground detectado por ArtWatch
AppControl → ArtHome002.Launcher
  ↓
HomePunk
```

El servicio solo **lee** el foreground y **abre** la app. Es un workaround, no
un reemplazo nativo del Home.

## Sin Wi-Fi

El retorno local no necesita Internet. El servicio lee el foco y abre HomePunk
en la misma TV. El launcher consulta el panel por `127.0.0.1:47998`, así que
también funciona sin red. El acceso desde otro equipo (`http://<TV_IP>:47998`)
sí requiere estar en la misma LAN, pero no Internet. Instalar o actualizar
requiere la herramienta de instalación de Tizen por red o USB.

## Componentes

- `native/ArtWatchTv/` — servicio C#/Tizen.
- `ArtWatch1.WatchService` — AppID del servicio.
- `ArtHome002.Launcher` — launcher HomePunk.
- `http://<TV>:47998/status` — estado JSON.
- `/start`, `/stop`, `/boot/on`, `/boot/off` — control por LAN.

El TPK no se versiona en el repo; se compila desde `native/ArtWatchTv` con
Tizen Studio y un perfil de firma propio.

## Flujo de estados

1. Arranque: si `bootEnabled` está activo, espera el evento de boot y abre el
   target.
2. Normal: observa el foreground; cuando detecta Samsung Home inicia un
   episodio de retorno con confirmación y reintentos acotados.
3. `/stop`: desactiva el retorno y lo deja suprimido hasta que se rearme.
4. `/start`: rearma el retorno normal.
5. `/boot/off` y `/boot/on`: controlan solo el arranque.
6. Al abrir un panel o cambiar de app, el servicio no debe relanzar en bucle;
   la supresión `SuppressedUntilExit` evita episodios repetidos mientras
   HomePunk está en foco.

## Instalación

Desde Tizen Studio/CLI, con la TV en Developer Mode y el perfil de firma
correcto:

```powershell
tizen build-cs -C Release -s <signing-profile> -- native/ArtWatchTv
tizen install -n "ArtWatch1-1.6.3.tpk" -s <TV_IP>:26101 -- native/ArtWatchTv/bin/Release/net6.0
```

Después de instalar, comprobar:

```powershell
Invoke-RestMethod http://<TV_IP>:47998/status
```

Debe devolver `version`, `enabled`, `armed`, `bootEnabled` y `focused`.
Para probar sin reiniciar:

```powershell
Invoke-RestMethod -Method Post http://<TV_IP>:47998/start
```

## Límites

- No es un Home nativo: la TV muestra brevemente Samsung Home y luego HomePunk.
- Depende de que Tizen mantenga vivo el servicio en segundo plano.
- El endpoint HTTP no tiene autenticación; úsalo solo en una LAN de confianza.
- No sobrevive a cambios de firmware que retiren las APIs usadas.
- No reemplaza la pantalla de inicio del sistema.

## Referencias

- [`COMPATIBILIDAD-TIZEN.md`](COMPATIBILIDAD-TIZEN.md)
- [`ART-HOME-DATA-MIGRATION.md`](ART-HOME-DATA-MIGRATION.md)
- `native/ArtWatchTv/Program.cs`, `WatchController.cs`, `TransitionJournal.cs`

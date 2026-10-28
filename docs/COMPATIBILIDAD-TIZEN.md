# Compatibilidad con TV Samsung y Tizen anteriores

Estado: **2026-10-27**. Solo está probado el build actual en una
`UN43M70HAFXZX` (M70H, Tizen 10, 1203.9). Todo lo demás es **NO VERIFICADO** en
hardware.

## 1. Qué es portable y qué no

El launcher web (fondo, tarjetas, apps, ajustes) es relativamente portable. El
punto delicado es el **servicio que devuelve el foco a HomePunk**.

Para que funcione en otra TV hacen falta cuatro cosas:

1. Que la TV permita instalar una app de desarrollador firmada.
2. Que exista un runtime compatible (Web, Native o .NET).
3. Que el sistema deje ejecutar un servicio en segundo plano.
4. Que el AppControl pueda abrir la app desde ese servicio.

Si falla cualquiera de las cuatro, el launcher puede abrirse a mano pero el
retorno automático no funcionará.

## 1.1 Firma y DUID

La firma no es universal: el certificado de distribuidor de Samsung está atado
a los DUID de las TVs registradas. Un paquete firmado para una TV no sirve para
otra. Para una flota controlada se pueden registrar varios DUID; para usuarios
desconocidos, cada uno debe firmar con su cuenta. Detalle:
[`FIRMA-TIZEN.md`](FIRMA-TIZEN.md). Para buscar un proyecto que ya corra en la
versión objetivo: [`GITHUB-REFERENCIAS.md`](GITHUB-REFERENCIAS.md).

En Tizen 2.3–3.0 se usa la misma idea author/distributor/DUID, pero con la TV
Extension de esa generación. No se puede firmar un paquete para Tizen 3.0 con
el SDK 10 y esperar que instale.

## 2. Matriz por año

| Año | Tizen | .NET TV | Launcher web | Watcher actual | Camino recomendado |
|---|---:|---|---|---|---|
| 2015 | 2.3 | No | Posible, con UI simple | **No** | Servicio nativo C/C++ o web service; probar |
| 2016 | 2.4 | No | Posible, con UI simple | **No** | Servicio nativo C/C++ o web service; probar |
| 2017 | 3.0 (algunos 2.4) | No | Posible | **No** | Servicio nativo C/C++ o web service; probar |
| 2018 | 4.0 | Inicial | Recompilar | **No** (API 10/net6) | Variante .NET para Tizen 4.0 o nativo |
| 2019 | 5.0 | Sí | Recompilar | **No** (API 10/net6) | Variante .NET para Tizen 5.0 |
| 2020 | 5.5 | Sí | Recompilar | **No** (API 10/net6) | Variante .NET para Tizen 5.5 |
| 2021 | 6.0 | Sí | Recompilar | **No** (API 10/net6) | Variante .NET para Tizen 6.0 |
| 2022 | 6.5 | Sí | Recompilar | **No** (API 10/net6) | Variante .NET para Tizen 6.5 |
| 2023 | 7.0 | Sí | Recompilar | **No** (API 10/net6) | Variante .NET para Tizen 7.0 |
| 2024 | 8.0 | Sí | Recompilar | **No** (API 10/net6) | Variante .NET para Tizen 8.0 |
| 2025 | 9.0 | Sí | Recompilar | **No** (API 10/net6) | Variante .NET para Tizen 9.0 |
| 2026 | 10.0 | Sí | Sí | **Sí** | Build actual |

La tabla de años/Tizen se basa en las especificaciones públicas de Samsung:
2015 = Tizen 2.3; 2016 = 2.4; 2017 = 3.0 (con algunos 2.4); 2018 = 4.0;
2019 = 5.0; 2020 = 5.5; 2021 = 6.0; 2022 = 6.5; 2023 = 7.0; 2024 = 8.0;
2025 = 9.0; 2026 = 10.0.

## 3. Por qué el build actual no es universal

`native/ArtWatchTv/tizen-manifest.xml` declara:

```xml
<manifest api-version="10.0" ...>
```

y el proyecto usa:

```xml
<TargetFramework>net6.0</TargetFramework>
<PackageReference Include="Tizen.NET" Version="10.0.0.17508" />
```

Eso significa:

- una TV con Tizen 4.0/5.0/… no instalará este TPK tal cual;
- el runtime .NET y las librerías nativas deben coincidir con la plataforma;
- bajar solo `api-version` en el XML no crea compatibilidad: hay que recompilar
  contra el SDK/runtime correcto y probar.

Además, el launcher web actual usa un frontend moderno y fondos pesados; en
Tizen 2.3/2.4 conviene una variante ligera (sin animaciones GPU complejas, sin
APIs modernas y con un `required_version` bajo).

## 4. Estrategia de portado

### 4.1 Una base, varios adaptadores

Separar la lógica del watcher en dos capas:

```text
WatchController (estado, supresión, reintentos, journal)
        │
        ├── backend .NET/Tizen 4–10
        ├── backend nativo C/C++ (Tizen 2.3–3.0)
        └── backend web service (fallback)
```

El `WatchController` actual ya está separado de Tizen en
`native/ArtWatchTv/WatchController.cs`; esa parte se puede reutilizar. Lo que
cambia es el adaptador que lee el foreground y lanza la app.

### 4.2 APIs mínimas del adaptador

- Leer la app en foco:
  - .NET/nativo moderno: `app_manager_get_focused_app_context`.
  - Alternativa nativa: `app_operation_get_current_app`.
- Abrir la app:
  - crear el AppControl;
  - fijar el AppID del launcher;
  - enviar la solicitud de apertura.
- Declarar los permisos de app necesarios para AppControl/AppManager.

En Tizen 2.3/2.4/3.0 hay que compilar con el SDK nativo de esa generación y
verificar que las librerías (`libcapi-appfw-app-control`, `app-manager`) estén
presentes en la TV. **No está verificado**.

Descargas:
- TV Extension actual y archivo:
  <https://developer.samsung.com/smarttv/develop/tools/tv-extension/archive.html>
- Emulador TV:
  <https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-emulator.html>
- Tizen Studio anterior:
  <http://download.tizen.org/sdk/Installer/>

Samsung ya no publica TV Extension 2.3/2.4; 3.1.2/4.0b se usa como fallback no
oficial para esos targets. Para 4.0–9.0 se usa la extensión de la versión.

### 4.3 No hardcodear el Home de Samsung

El build actual detecta `com.samsung.tv.csfs`. En otros modelos el AppID del
Home puede cambiar. El adaptador debe:

- tener el AppID actual como valor por defecto;
- permitir una lista/configuración de AppIDs de Home;
- registrar en el journal el AppID observado para diagnosticar;
- no relanzar si el foco ya es HomePunk.

No se debe asumir que `com.samsung.tv.csfs` existe en 2015–2019.

### 4.4 Servicio en segundo plano

El servicio requiere que la TV lo deje vivir en background. Hay que probar:

- `service-application`/`<tizen:service>` con categoría de background;
- `on-boot` y `auto-restart`;
- certificado Partner cuando el modelo lo exija;
- comportamiento tras abrir YouTube/Netflix, tras standby y tras reinicio.

Samsung advierte que las apps se pausan al pasar a background desde 2015 y que
la estabilidad/gestión de memoria cambia según el año. `on-boot` y
`auto-restart` no están garantizados en todos los dispositivos; hay que probarlo
en cada modelo.

### 4.5 Launcher web

Para 2015–2017:

- reducir el bundle y evitar APIs web modernas;
- usar `required_version="2.3"` o `2.4` según el modelo;
- probar resolución 1920×1080 y modelos FHD;
- no asumir `backdrop-filter`, animaciones GPU ni `fetch` moderno;
- empaquetar un WGT separado, no reutilizar el build de Tizen 10.

## 5. Plan de pruebas en hardware

Por cada modelo candidato, en una TV recuperable y con backup:

1. Instalar el WGT/TPK de esa versión.
2. Abrir HomePunk manualmente.
3. Pulsar Home desde HDMI y desde una app.
4. Medir el flash de Samsung Home y el tiempo de retorno.
5. Abrir YouTube/Netflix y volver a Home.
6. Poner standby y despertar.
7. Reiniciar la TV y comprobar `on-boot`.
8. Reiniciar el servicio y comprobar `auto-restart`.
9. Confirmar que no hay bucle de relanzamiento.
10. Desinstalar y verificar que Samsung Home sigue funcionando.

No se debe probar en la TV principal sin una forma de recuperación.

## 6. Qué no promete este proyecto

- No reemplaza la pantalla de inicio del sistema.
- No garantiza compatibilidad con todos los modelos.
- No garantiza que Samsung Apps TV acepte un launcher/watcher.
- No incluye certificados ni claves.
- No convierte una TV vieja en Tizen 10.

## 7. Referencias

- Samsung Smart TV, especificaciones generales:
  <https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html>
- Samsung TV, grupos de modelos:
  <https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html>
- Tizen .NET TV Framework (primeras TV .NET en 2018):
  <https://developer.samsung.com/smarttv/develop/tizen-net-tv.html>
- Tizen .NET TV Q&A:
  <https://developer.samsung.com/smarttv/develop/faq/tizen-net-tv.html>
- Servicios en background y personal preview:
  <https://developer.samsung.com/smarttv/develop/guides/smart-hub-preview/implementing-personal-preview.html>
- Tizen service applications:
  <https://docs.tizen.org/application/native/guides/applications/service-app/>
- Tizen Application API (TV):
  <https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html>

## 8. Estado

- **Tizen 10 / M70H:** probado.
- **Tizen 4.0–9.0:** no probado; requiere build por versión.
- **Tizen 2.3–3.0:** no probado; requiere adaptador nativo/web y hardware.

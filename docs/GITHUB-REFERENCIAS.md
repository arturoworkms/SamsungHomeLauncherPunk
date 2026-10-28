# GitHub por versiÃ³n de Tizen

Objetivo: antes de portar o inventar, buscar un proyecto que ya corra en la
versiÃ³n objetivo. No copiar a ciegas: revisar licencia, modelo probado,
`required_version`, `api-version`, fecha y si usa permisos.

## 1. BÃºsquedas recomendadas

```text
samsung tizen <versiÃ³n> launcher
site:github.com "Tizen 4.0" samsung launcher
site:github.com "Tizen 5.5" samsung home
site:github.com "required_version=\"2.4\"" samsung
samsung tizen service-application home
tizen tv background service samsung
site:github.com "Tizen 9.0" samsung launcher
```

TambiÃ©n sirve la bÃºsqueda de repositorios de GitHub:

```text
https://github.com/search?q=samsung+tizen+launcher&type=repositories
https://github.com/search?q=tizen+tv+service-application&type=code
```

## 2. Repos de referencia por versiÃ³n

> â€œSegÃºn READMEâ€ significa que el dato viene del proyecto, no que lo hayamos
> probado en hardware. **NO VERIFICADO** salvo la columna de notas.

| Tizen | Repo | QuÃ© aporta | Notas |
|---|---|---|---|
| 2.4 | [AhmadHarah33/SimpleHome](https://github.com/AhmadHarah33/SimpleHome) | Launcher para TVs Samsung Tizen 2.4 | MIT; revisar modelo exacto |
| 2.3/2.4 | [Samsung/TizenTVApps](https://github.com/Samsung/TizenTVApps) | Samples web antiguos (2015) | Referencia oficial, no launcher completo |
| 2.3/2.4 | [SamsungDForum/Preview](https://github.com/SamsungDForum/Preview) | Background service y preview para 2015 | Ejemplo oficial de servicio en segundo plano |
| 3.0 | [drak905/Tizen3-Clean-Launcher](https://github.com/drak905/Tizen3-Clean-Launcher) | Launcher Tizen 3.0 estilo CleanFrame | MIT; revisar instalaciÃ³n |
| 3.0 | [kaczordodgers/tv-launcher](https://github.com/kaczordodgers/tv-launcher) | Launcher Tizen 3.0 vÃ­a TizenBrew | Licencia â€œOtherâ€; revisar |
| 3.0â€“6.5 | [axelnanol/tizenportal](https://github.com/axelnanol/tizenportal) | Shell/portal para Tizen 3.0â€“6.5 | Ãštil para UI y lÃ­mites de WebKit |
| 4.0 | [Luis-0508/homeshelf](https://github.com/Luis-0508/homeshelf) | Launcher para Samsung 2018/Tizen 4.0, con lÃ­mites medidos | AGPL; revisar; no asumir permisos |
| 4.0+ | [no-cover/torr-streaming](https://github.com/no-cover/torr-streaming) | Paquete hÃ­brido .NET para Tizen 4.0+ | Referencia de empaquetado, no launcher |
| 8.0 | [victaphu/glass-home-samsung-tv](https://github.com/victaphu/glass-home-samsung-tv) | Home minimalista, probado en Tizen 8 | Revisar licencia/Home |
| 6.5 | [abhaymundhara/samsung-tizen-launcher](https://github.com/abhaymundhara/samsung-tizen-launcher) | Launcher normal firmado para Tizen 6.5 | No permisos; Home se asigna aparte |
| 6.0+ | [berteotti/custom-tv](https://github.com/berteotti/custom-tv) | Home con clima/apps; instala como app normal | Revisar versiÃ³n y Home |
| 9.0 | [jss8649/quiet-tizen](https://github.com/jss8649/quiet-tizen) | Quiet Home y limpieza reversible para Tizen 9 | Revisar si requiere permisos |
| 9.0 | [AnthonMS/samsung-tv-launcher](https://github.com/AnthonMS/samsung-tv-launcher) | Launcher + remapeo de Home | **Usa permisos/HomeControl**; no usar como primera vÃ­a |
| 9.0 | [chaosmanage/samsung-tv-launcher](https://github.com/chaosmanage/samsung-tv-launcher) | Clean Home y takeover de Home | Workaround SDK, con riesgo; revisar |
| 10.0 | Este repo | HomePunk + ArtWatch | Ãšnico probado en M70H/Tizen 10 |

Repos auxiliares:

- [Apps2Samsung/Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung): instalador de paquetes.
- [Apps2Samsung/tizen-community-packages](https://github.com/Apps2Samsung/tizen-community-packages): catÃ¡logo y paquetes por versiÃ³n.
- [Samsung/tizen-docs](https://github.com/Samsung/tizen-docs): APIs y guÃ­as oficiales.
- [SamsungDForum/Preview](https://github.com/SamsungDForum/Preview): servicio en background para 2015.
- [TizenBrew](https://github.com/reisxd/TizenBrew): ejecuciÃ³n de mÃ³dulos en TVs compatibles; revisar versiÃ³n.

## 3. CÃ³mo decidir si un repo sirve

1. **Modelo y aÃ±o:** el cÃ³digo de modelo suele indicar el aÃ±o (J=2015,
   K=2016, M=2017, N=2018, R=2019, T=2020, A=2021, B=2022, C=2023, D=2024,
   E=2025, F=2026).
2. **Tizen real:** Ajustes > Soporte > InformaciÃ³n; o el user-agent.
3. **README:** busca â€œtested onâ€, â€œTizenâ€, â€œfirmwareâ€, â€œrequired_versionâ€.
4. **Manifiesto:** `config.xml` (`required_version`) o `tizen-manifest.xml`
   (`api-version`). Si el target es menor, no instala.
5. **Licencia:** MIT/AGPL/GPL; no copiar sin cumplir.
6. **permisos/Home takeover:** si el README habla de permisos, `sdb permisos`, remapear
   Home o `vconf`, no es primera opciÃ³n para un usuario normal.
7. **Issues/commits:** un repo sin actividad puede no servir en firmware nuevo.
8. **Paquete firmado:** no uses un WGT/TPK firmado por otro; pide fuente o
   firma con el DUID de tu TV.

## 4. Si tu versiÃ³n no es compatible

Plan mÃ­nimo:

1. Busca el repo **igual o mÃ¡s cercano** a tu Tizen; no saltes de 2.3 a 6.0.
2. Copia solo la UI/lÃ³gica web si es compatible; no mezcles paquetes firmados.
3. Ajusta `required_version`/`api-version` y compila con la TV Extension de tu
   versiÃ³n.
4. Prueba en el emulador de esa versiÃ³n; despuÃ©s en una TV real.
5. Si el launcher funciona pero no el watcher:
   - deja primero el launcher manual;
   - para auto-retorno necesitas servicio en segundo plano (`service-application`
     o web service) y probar `on-boot`/`auto-restart`.
6. Si no hay repo: parte de `Samsung/TizenTVApps` o `SamsungDForum/Preview` y
   porta la UI; para el watcher, nativo C/C++ o web service en Tizen 2.3â€“3.0.
7. Documenta modelo/Tizen/resultado; no publiques un â€œfuncionaâ€ sin prueba.

## 5. Tiempo realista

| Caso | Tiempo |
|---|---:|
| Reusar repo y firmar con perfil existente | 20â€“60 min |
| Instalar Tizen Studio + extensiÃ³n + perfil | 1â€“3 h |
| Portar launcher web a otra versiÃ³n | 2â€“8 h |
| Portar watcher a 2.3â€“3.0 nativo | dÃ­as; sin garantÃ­a |
| Validar en TV real | depende de la TV y recuperaciÃ³n |

## 6. Regla de oro

Primero **repositorio y versiÃ³n**; despuÃ©s **firma**; al final **instalaciÃ³n**.
Nunca al revÃ©s. Un paquete firmado para otra TV no se arregla cambiando el
`required_version`.


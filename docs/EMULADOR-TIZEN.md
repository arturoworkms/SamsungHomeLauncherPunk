# Emulador TV Tizen: qué sí y qué no

## Qué se puede comprobar

- Que el WGT compila, empaqueta e instala en el emulador.
- La UI del launcher, navegación, ajustes y lanzamiento de apps.
- El flujo de firma contra el emulador: desde TV Extension 7.0.1 exige un
  certificado Samsung, y se puede crear un perfil con el **DUID del emulador**.
  Ese perfil/prueba no sirve para una TV real.
- La lógica del watcher si el emulador permite ejecutar el TPK de servicio.
- Versiones antiguas de Tizen si se instala la TV Extension/emulador
  correspondiente.

## Firma en emulador

- El emulador TV tiene su propio DUID. Para instalar un paquete hay que crear
  un perfil Samsung que incluya ese DUID.
- Un paquete firmado para el emulador **no** instala en la TV real, y uno
  firmado para la TV real **no** instala en el emulador.
- El certificado Tizen local autofirmado no sirve para el emulador TV; se
  necesita un certificado Samsung.
- La guía de `tizen-agent-skills` documenta adquirir el DUID del emulador y
  generar el perfil Samsung:
  <https://github.com/Samsung/tizen-agent-skills/blob/main/tizen-sdk-skills/docs/certificate/certificate-manager-guide.en.md>

## Qué NO se puede comprobar

- Que un paquete firmado para una TV real se instale en **otra** TV: el
  distribuidor está atado a DUID reales.
- El comportamiento exacto de una TV retail: segundo plano, `on-boot`,
  estabilidad, memoria, foco real y latencia.
- El Home real de Samsung y sus AppID por modelo.
- Que el instalador de 1 minuto funcione en TVs de otras personas.
- Diferencias de hardware, firmware, MAU/XDMA o políticas del modelo.

El emulador sirve para **desarrollo y regresión**, no para validar la firma de
una TV física ni un instalador universal.

## Versiones y descargas

- TV Extension actual:
  <https://developer.samsung.com/smarttv/develop/tools/tv-extension/download.html>
- Archivo de TV Extensions:
  <https://developer.samsung.com/smarttv/develop/tools/tv-extension/archive.html>
- Historial de releases:
  <https://developer.samsung.com/smarttv/develop/tools/tv-extension/release-history.html>
- Emulador TV:
  <https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-emulator.html>
- Certificados Samsung:
  <https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html>
- Política de instalación en emulador:
  <https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-emulator/application-install-policy.html>
- Tizen Studio anterior (archivo no oficial de descargas):
  <http://download.tizen.org/sdk/Installer/>

## Tizen 2.3 y 2.4

Samsung ya no publica las TV Extension 2.3/2.4. La extensión **3.1.2/4.0b**
del archivo se ha usado como fallback para desarrollar para 2.3/2.4, pero es
una vía **no oficial y no verificada** en este proyecto.

Para Tizen 2.3/2.4 el watcher no puede ser el TPK .NET actual: hay que hacer un
servicio nativo C/C++ o web service y probarlo en una TV real.

## Tizen 4.0–9.0

Hay que usar la TV Extension de la versión objetivo y recompilar. No basta con
cambiar `api-version` en el manifiesto.

## Conclusión

El emulador puede decir “el launcher funciona”, pero no puede decir “este
instalador funcionará en la TV de cualquiera”. Para eso hace falta una segunda
TV con su DUID y su propio certificado, o una flota controlada.

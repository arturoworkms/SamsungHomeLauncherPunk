import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { siApple, siAppletv, siGooglecast, siHbomax, siPlaystation, siSpotify, siStremio, siYoutube } from "simple-icons";

type UiApp = { id: string; name: string; iconPath?: string; mark: string; accent: string; logo?: string; mono?: string };
type InputSource = { type: string; number: number; name: string; signal: boolean | null };
type DeviceOption = { id: string; name: string; accent: string; path?: string; custom?: "xbox" | "switch" | "pc" | "soundbar" };
type InputAssignment = { device: string; label?: string };
type SavedInput = { kind: "input"; number: number; device?: string; label?: string };
type StoredFavorite = string | SavedInput;
type Favorite = { key: string; kind: "app" | "input"; name: string; sub?: string; offline?: boolean; app?: UiApp; input?: InputSource; device?: DeviceOption };
type Overlay = "none" | "apps" | "inputs" | "settings" | "entries" | "devices" | "wallpapers";
type Weather = { temperature: number; label: string; symbol: string };
type Settings = { theme: string; wallpaper: string; weather: boolean; boot: boolean };

const SELF_ID = (() => {
  try { return window.tizen?.application?.getCurrentApplication?.()?.appId || "ArtHome002.Launcher"; }
  catch { return "ArtHome002.Launcher"; }
})();
const FAVORITES_KEY = "arturo-home-favorites-v2";
const SETTINGS_KEY = "arturo-home-settings-v2";
// Asignación dispositivo ↔ entrada HDMI, independiente de los favoritos.
const INPUTS_KEY = "arturo-home-inputs-v1";
// El servicio ArtWatch corre en la misma TV.
// Se prueban loopback y localhost.
const WATCHDOG_URLS = [
  "http://127.0.0.1:47998",
  "http://localhost:47998",
];
const MAX_FAVORITES = 8;

async function watchdogRequest(path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  for (const base of WATCHDOG_URLS) {
    try {
      const response = await fetch(`${base}${path}`, { cache: "no-store", ...init });
      if (!response.ok) continue;
      return await response.json() as Record<string, unknown>;
    } catch {
      // Probar el siguiente host local (127.0.0.1 o localhost).
    }
  }
  return null;
}
const HDMI_PATH = "M3 9h18v5h-2.6L16.6 17H7.4L5.6 14H3V9zm3 2v1.6h1.6V11H6zm3.4 0v1.6h1.6V11H9.4zm3.4 0v1.6h1.6V11h-1.6z";
const catalog: UiApp[] = [
  { id: "com.samsung.tv.aria-video", name: "Apple TV", mark: "tv+", accent: "#f3f3f5", logo: "apple" },
  { id: "9Ur5IzDKqV.TizenYouTube", name: "YouTube", mark: "▶", accent: "#ff1538", logo: "youtube" },
  { id: "org.tizen.netflix-app", name: "Netflix", mark: "N", accent: "#e50914", logo: "netflix" },
  { id: "org.tizen.primevideo", name: "Prime Video", mark: "prime", accent: "#25a7e1", logo: "prime" },
  { id: "MCmYXNxgcu.DisneyPlus", name: "Disney+", mark: "D+", accent: "#4d68de", logo: "disney" },
  { id: "5b8c3eb16b.BeamCTVDev", name: "Max", mark: "max", accent: "#7652e8", logo: "max" },
  { id: "OGLLvqej7u.CrunchyrollWebApp", name: "Crunchyroll", mark: "C", accent: "#f47521", logo: "crunchyroll" },
  { id: "rJeHak5zRg.Spotify", name: "Spotify", mark: "●", accent: "#1ed760", logo: "spotify" },
  { id: "IkWsFHtOY9.Stremio", name: "Stremio", mark: "S", accent: "#7657e8", logo: "stremio" },
  { id: "3KA0pm7a7V.TubiTV", name: "Tubi", mark: "tubi", accent: "#ed60d0" },
  { id: "nbCEREFaoy.mercadoplay", name: "Mercado Play", mark: "M", accent: "#ffe600" },
  { id: "com.samsung.tv.google-photos-ui", name: "Google Fotos", mark: "G", accent: "#4285f4", logo: "photos" },
  { id: "com.samsung.tv.SmartThingsApp", name: "SmartThings", mark: "∞", accent: "#5aa7ff" },
  { id: "org.tizen.browser", name: "Internet", mark: "◎", accent: "#39cbd2", logo: "internet" },
  { id: "HEPsqFNie0.tvplusstandalone", name: "Samsung TV Plus", mark: "TV+", accent: "#2b6fff", logo: "tvplus", mono: "TV+" },
];
type WallpaperOption = { id: string; label: string; category: string; thumb?: string; animated?: boolean };
// Fondos: los animados son CSS/GPU (sin vídeo); los estáticos son JPEG 1080p
// optimizados y solo se carga el elegido. Las miniaturas se cargan al abrir.
const WALLPAPERS: WallpaperOption[] = [
  { id: "aurora-live", label: "Aurora en vivo", category: "Animado", thumb: "wallpapers/thumbs/aurora-live.jpg", animated: true },
  { id: "nebula-live", label: "Nebulosa en vivo", category: "Animado", thumb: "wallpapers/thumbs/space-nebula.jpg", animated: true },
  { id: "earth-live", label: "Tierra en vivo", category: "Animado", thumb: "wallpapers/thumbs/space-earth.jpg", animated: true },
  { id: "edgerunners-live", label: "Edgerunners en vivo", category: "Animado", thumb: "wallpapers/thumbs/edgerunners-luna.jpg", animated: true },
  { id: "cyberpunk", label: "Cyberpunk Love", category: "Juego", thumb: "wallpapers/thumbs/cyberpunk.jpg" },
  { id: "horizon", label: "Horizon: Aloy", category: "Juego", thumb: "wallpapers/thumbs/horizon.jpg" },
  { id: "ghost", label: "Ghost of Tsushima", category: "Juego", thumb: "wallpapers/thumbs/ghost.jpg" },
  { id: "god-of-war", label: "God of War", category: "Juego", thumb: "wallpapers/thumbs/god-of-war.jpg" },
  { id: "dark-souls", label: "Dark Souls", category: "Juego", thumb: "wallpapers/thumbs/dark-souls.jpg" },
  { id: "expedition-33", label: "Expedition 33: Luné", category: "Juego", thumb: "wallpapers/thumbs/expedition-33.jpg" },
  { id: "cyberpunk-2077", label: "Cyberpunk 2077", category: "Juego", thumb: "wallpapers/thumbs/cyberpunk-2077.jpg" },
  { id: "mountain", label: "Edgerunners: Luna", category: "Juego", thumb: "wallpapers/thumbs/orbit.jpg" },
  { id: "edgerunners-lucy", label: "Edgerunners: Lucy", category: "Juego", thumb: "wallpapers/thumbs/edgerunners-lucy.jpg" },
  { id: "edgerunners-crew", label: "Edgerunners: Crew", category: "Juego", thumb: "wallpapers/thumbs/edgerunners-crew.jpg" },
  { id: "edgerunners-rebecca", label: "Edgerunners: Rebecca", category: "Juego", thumb: "wallpapers/thumbs/edgerunners-rebecca.jpg" },
  { id: "cat-1", label: "Gato curioso", category: "Gatos", thumb: "wallpapers/thumbs/cat-1.jpg" },
  { id: "cat-2", label: "Gato atigrado", category: "Gatos", thumb: "wallpapers/thumbs/cat-2.jpg" },
  { id: "cat-3", label: "Gato blanco y negro", category: "Gatos", thumb: "wallpapers/thumbs/cat-3.jpg" },
  { id: "cat-4", label: "Gato con lentes", category: "Gatos", thumb: "wallpapers/thumbs/cat-4.jpg" },
  { id: "space-nebula", label: "Nebulosa", category: "Espacio", thumb: "wallpapers/thumbs/space-nebula.jpg" },
  { id: "space-stars", label: "Vía Láctea", category: "Espacio", thumb: "wallpapers/thumbs/space-stars.jpg" },
  { id: "space-earth", label: "Tierra", category: "Espacio", thumb: "wallpapers/thumbs/space-earth.jpg" },
  { id: "land-mountain", label: "Lago Alpino", category: "Paisaje", thumb: "wallpapers/thumbs/land-mountain.jpg" },
  { id: "land-forest", label: "Bosque", category: "Paisaje", thumb: "wallpapers/thumbs/land-forest.jpg" },
  { id: "land-coast", label: "Playa", category: "Paisaje", thumb: "wallpapers/thumbs/land-coast.jpg" },
  { id: "light", label: "Claro", category: "Clásico", thumb: "wallpapers/thumbs/light.jpg" },
  { id: "oled", label: "Negro OLED", category: "Clásico" },
];
const defaultFavoriteIds: StoredFavorite[] = catalog.slice(0, MAX_FAVORITES).map((app) => app.id);
const samsungSettings: UiApp = { id: "org.tizen.menu", name: "Ajustes Samsung", mark: "⚙", accent: "#888" };
// Pantalla de apps de Samsung (instalar/eliminar). Fallback: listado clásico de Tizen.
const APP_STORE_ID = "com.samsung.tv.store";
const APP_STORE_FALLBACK_ID = "org.volt.apps";
const TV_VIEWER_ID = "org.tizen.tv-viewer";
const PREVIEW_APP_STORE = "Abriría Apps de Samsung (mantén pulsado para eliminar)";
// Entradas de reserva cuando no hay Tizen (navegador) o VIDEOSOURCE falla.
const fallbackInputs: InputSource[] = [1, 2, 3, 4].map((number) => ({ type: "HDMI", number, name: `HDMI ${number}`, signal: null }));
// Dispositivos que se pueden asignar a una entrada HDMI (logos de simple-icons
// o glifo propio cuando la marca no está disponible).
const deviceOptions: DeviceOption[] = [
  { id: "ps5", name: "PlayStation 5", accent: "#6c9bff", path: siPlaystation.path },
  { id: "xbox", name: "Xbox", accent: "#5ac36a", custom: "xbox" },
  { id: "switch", name: "Nintendo Switch", accent: "#ff6b6b", custom: "switch" },
  { id: "pc", name: "PC", accent: "#7ce7ff", custom: "pc" },
  { id: "soundbar", name: "Soundbar", accent: "#c9b6ff", custom: "soundbar" },
  { id: "chromecast", name: "Chromecast / Google TV", accent: "#7ba7ff", path: siGooglecast.path },
  { id: "appletv", name: "Apple TV", accent: "#ffffff", path: siApple.path },
  { id: "other", name: "Otro", accent: "#9fb0c0", path: HDMI_PATH },
];
const otherDevice = deviceOptions[deviceOptions.length - 1];
const inputItems = [
  { id: "tv", name: "TV", mark: "TV", accent: "#419ae8", type: "TV", number: 1 },
  { id: "hdmi1", name: "HDMI 1", mark: "1", accent: "#77889b", type: "HDMI", number: 1 },
  { id: "hdmi2", name: "HDMI 2", mark: "2", accent: "#77889b", type: "HDMI", number: 2 },
  { id: "hdmi3", name: "HDMI 3", mark: "3", accent: "#77889b", type: "HDMI", number: 3 },
  { id: "hdmi4", name: "HDMI 4", mark: "4", accent: "#77889b", type: "HDMI", number: 4 },
  { id: "source", name: "Todas las fuentes", mark: "≡", accent: "#4d9ca8", type: "", number: 0 },
  { id: "home", name: "Samsung Home", mark: "⌂", accent: "#3278df", type: "", number: 0 },
];

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}
function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento no disponible: la sesión sigue en memoria */ }
}
// Apps reconocidas por nombre (los ids cambian entre modelos/años de TV).
const nameMatchers: Array<{ logo: string; accent: string; mark: string; test: RegExp }> = [
  { logo: "youtube", accent: "#ff1538", mark: "▶", test: /youtube|\byt\b/i },
  { logo: "netflix", accent: "#e50914", mark: "N", test: /netflix/i },
  { logo: "prime", accent: "#25a7e1", mark: "prime", test: /prime\s*video|amazon/i },
  { logo: "disney", accent: "#4d68de", mark: "D+", test: /disney/i },
  { logo: "max", accent: "#7652e8", mark: "max", test: /\bmax\b|hbo/i },
  { logo: "crunchyroll", accent: "#f47521", mark: "C", test: /crunchyroll/i },
  { logo: "spotify", accent: "#1ed760", mark: "●", test: /spotify/i },
  { logo: "stremio", accent: "#7657e8", mark: "S", test: /stremio/i },
  { logo: "apple", accent: "#f3f3f5", mark: "tv+", test: /apple\s*tv/i },
  { logo: "tubi", accent: "#ed60d0", mark: "tubi", test: /tubi/i },
  { logo: "mercado", accent: "#ffe600", mark: "M", test: /mercado\s*play/i },
  { logo: "photos", accent: "#4285f4", mark: "G", test: /google\s*(fotos|photos)/i },
  { logo: "smartthings", accent: "#5aa7ff", mark: "∞", test: /smartthings/i },
  { logo: "internet", accent: "#39cbd2", mark: "◎", test: /internet|browser|navegador/i },
];
function normalizeName(value: string): string {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
// Clave de dedupe sin signos: "Disney+" y "Disney +" son la misma app.
function stripName(value: string): string {
  return normalizeName(value).replace(/[^a-z0-9]/g, "");
}
// Apps de sistema/servicio que getAppsInfo devuelve aunque no sean del usuario.
const SYSTEM_TERMS = /(smarttv|kant|epop|aot|manager|dashboard|appinfo|service|daemon|bgservice|viewer|automation|bixby|btapp|avcontrol|autofill|preview|wizard|coba|webaccount|cms|castsettings|artapp|factory|sample|aging|usb|p2p|remote|settings?|notice|account|sign|drm|health|camera|keyboard|partial|guide|workspace|browser|internet|input probe|smartthings|\btest\b|oqc)/i;
// Apps que deben aparecer aunque Tizen las marque como sistema o su nombre
// choque con los términos de exclusión.
const ALLOWED_IDS = new Set(["org.tizen.browser", "HEPsqFNie0.tvplusstandalone"]);
const ALLOWED_NAMES = [/^internet$/, /^browser$/, /^navegador$/, /samsung\s*tv\s*plus/, /^tv\s*plus$/];
function isAllowlistedApp(info: TizenApplicationInformation): boolean {
  if (ALLOWED_IDS.has(info.id)) return true;
  const name = normalizeName(info.name || "");
  return ALLOWED_NAMES.some((test) => test.test(name));
}
function isUserApp(info: TizenApplicationInformation): boolean {
  if (info.id === SELF_ID) return false;
  if (isAllowlistedApp(info)) return true; // antes de show/SYSTEM_TERMS
  if (info.show === false) return false;
  const id = info.id || "";
  if (!id) return false;
  if (SYSTEM_TERMS.test(id) || SYSTEM_TERMS.test(normalizeName(info.name || ""))) return false;
  // Marca conocida (por id o por nombre) siempre entra.
  if (knownApp(info)) return true;
  // El resto: nunca com.samsung.* / org.tizen.* (salvo allowlist vía knownApp).
  if (id.startsWith("com.samsung.") || id.startsWith("org.tizen.")) return false;
  // Ids de tienda (10 caracteres + punto) y que tengan icono real.
  return /^[A-Za-z0-9]{10}\./.test(id) && !!info.iconPath;
}
function knownApp(info: TizenApplicationInformation): UiApp | undefined {
  const byId = catalog.find((app) => app.id === info.id);
  if (byId) return byId;
  const name = info.name || "";
  const match = nameMatchers.find((matcher) => matcher.test.test(name));
  if (!match) return undefined;
  return { id: info.id, name, mark: match.mark, accent: match.accent, logo: match.logo };
}
function enrich(info: TizenApplicationInformation): UiApp {
  const known = knownApp(info);
  return { id: info.id, name: info.name || known?.name || info.id, iconPath: info.iconPath, mark: known?.mark || (info.name || "?").slice(0, 1).toUpperCase(), accent: known?.accent || "#596579", logo: known?.logo };
}
function inputKeyOf(number: number): string { return `input:hdmi:${number}`; }
function deviceById(id?: string): DeviceOption { return deviceOptions.find((device) => device.id === id) || otherDevice; }
function isHdmiInput(name: string, number: number): boolean { return name !== `HDMI ${number}`; }
// Acepta ids sueltos, entradas guardadas nuevas ({kind:'input',number}) y el
// formato antiguo con device/label (se migra a arturo-home-inputs-v1).
function normalizeStored(value: StoredFavorite): { kind: "app"; id: string } | { kind: "input"; number: number; device?: string; label?: string } | null {
  if (typeof value === "string") {
    if (value.startsWith("input:")) {
      const number = Number(value.split(":").filter(Boolean).pop());
      return Number.isFinite(number) ? { kind: "input", number } : null;
    }
    return { kind: "app", id: value };
  }
  if (value && typeof value === "object" && value.kind === "input") {
    const number = Number(value.number);
    if (!Number.isFinite(number)) return null;
    return { kind: "input", number, device: value.device, label: value.label };
  }
  return null;
}
// Lee VIDEOSOURCE (conectadas + desconectadas) tolerando las dos variantes de API.
function readVideoSources(success: (sources: VideoSource[]) => void, fail: (message: string) => void): void {
  const info = window.tizen?.systeminfo as unknown as {
    getPropertyValue?: (property: "VIDEOSOURCE", success: (value: unknown) => void, error?: (error: Error) => void) => void;
    getPropertyValueArray?: (property: "VIDEOSOURCE", success: (value: unknown) => void, error?: (error: Error) => void) => void;
  } | undefined;
  if (!info) return fail("VIDEOSOURCE no disponible");
  const apply = (value: unknown) => {
    const raw = value as { connected?: VideoSource[]; disconnected?: VideoSource[] } | VideoSourceGroup[] | null;
    const sources = Array.isArray(raw)
      ? raw.flatMap((group) => [...(group.connected || []), ...(group.disconnected || [])])
      : [...(raw?.connected || []), ...(raw?.disconnected || [])];
    success(sources);
  };
  try {
    if (info.getPropertyValue) info.getPropertyValue("VIDEOSOURCE", apply, (error) => fail(error.message));
    else if (info.getPropertyValueArray) info.getPropertyValueArray("VIDEOSOURCE", apply, (error) => fail(error.message));
    else fail("API VIDEOSOURCE no disponible");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

export function Launcher() {
  const [apps, setApps] = useState<UiApp[]>(catalog);
  const [storedFavorites, setStoredFavorites] = useState<StoredFavorite[]>(() => readJson<StoredFavorite[]>(FAVORITES_KEY, defaultFavoriteIds));
  const [assignments, setAssignments] = useState<Record<string, InputAssignment>>(() => readJson<Record<string, InputAssignment>>(INPUTS_KEY, {}));
  const [inputSources, setInputSources] = useState<InputSource[]>(fallbackInputs);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [favoritePicker, setFavoritePicker] = useState(false);
  const [deviceTarget, setDeviceTarget] = useState<{ number: number; addFavorite: boolean } | null>(null);
  const [deviceReturn, setDeviceReturn] = useState<Overlay>("apps");
  const [ordering, setOrdering] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = readJson<Settings>(SETTINGS_KEY, { theme: "dark", wallpaper: "mountain", weather: true, boot: true });
    const legacy: Record<string, string> = {
      aurora: "aurora-live",
      synthwave: "nebula-live",
      starfield: "nebula-live",
      "game-ps5": "horizon",
      "game-setup": "cyberpunk-2077",
    };
    const wallpaper = legacy[stored.wallpaper] || stored.wallpaper;
    return wallpaper === stored.wallpaper ? stored : { ...stored, wallpaper };
  });
  const [watchdog, setWatchdog] = useState<boolean | null>(null);
  const [bootLaunch, setBootLaunch] = useState<boolean | null>(null);
  const [toast, setToast] = useState("");
  const canvasRef = useRef<HTMLElement>(null);
  const clockRef = useRef<HTMLTimeElement>(null);
  const meridiemRef = useRef<HTMLElement>(null);
  const dateRef = useRef<HTMLElement>(null);
  const selectionRef = useRef<HTMLElement>(null);
  const posRef = useRef({ row: 0, col: 0 });
  const overlayRef = useRef<Overlay>("none");
  const overlayPosRef = useRef(0);
  const appsRef = useRef(apps);
  const pickerRef = useRef(false);
  const deviceRef = useRef<{ number: number; addFavorite: boolean } | null>(null);
  const orderingRef = useRef(false);
  const flipRef = useRef<Map<string, number>>(new Map());
  const pendingOrderRef = useRef(-1);
  // Índice seleccionado en modo orden (independiente del DOM y de posRef).
  const orderIndexRef = useRef(0);
  // Long-press de OK sobre una carátula (modo orden estilo Samsung Home).
  const longPressTimer = useRef(0);
  const enterHeldRef = useRef(false);
  const enterConsumedRef = useRef(false);
  const pendingTileRef = useRef<number | null>(null);
  const toastTimer = useRef(0);
  // true cuando la ventana de vídeo (fallback tvwindow.show) está abierta encima.
  const inputWindowOpenRef = useRef(false);
  // Firma (ids) del último catálogo recibido: evita re-render si no cambió.
  const appsSignatureRef = useRef("");
  const appsRefreshTimer = useRef(0);
  const lastAppsRefreshRef = useRef(0);
  const favoritesRef = useRef<Favorite[]>([]);
  const favorites = useMemo<Favorite[]>(() => {
    const list: Favorite[] = [];
    for (const raw of storedFavorites) {
      const parsed = normalizeStored(raw);
      if (!parsed) continue;
      if (parsed.kind === "app") {
        const app = apps.find((item) => item.id === parsed.id);
        if (app) list.push({ key: parsed.id, kind: "app", name: app.name, app });
      } else {
        const detected = inputSources.find((source) => source.number === parsed.number);
        const input: InputSource = detected || { type: "HDMI", number: parsed.number, name: `HDMI ${parsed.number}`, signal: null };
        // La asignación vive en arturo-home-inputs-v1: si cambia, la carátula cambia.
        const assignment = assignments[String(parsed.number)];
        const device = deviceById(assignment?.device);
        const isOther = device.id === "other";
        const primary = isOther ? input.name : (assignment?.label || device.name);
        const hasEditName = !!detected && isHdmiInput(detected.name, parsed.number);
        const secondary = !isOther && hasEditName && input.name !== primary ? input.name : undefined;
        const offline = detected?.signal === false;
        list.push({ key: inputKeyOf(parsed.number), kind: "input", name: primary, sub: secondary, offline, input, device });
      }
    }
    return list;
  }, [apps, assignments, inputSources, storedFavorites]);
  // Se asigna en el render: moveFavorite siempre ve el orden más reciente.
  favoritesRef.current = favorites;

  useEffect(() => { overlayRef.current = overlay; }, [overlay]);
  useEffect(() => { appsRef.current = apps; }, [apps]);
  useEffect(() => { pickerRef.current = favoritePicker; }, [favoritePicker]);
  useEffect(() => { deviceRef.current = deviceTarget; }, [deviceTarget]);
  useEffect(() => { orderingRef.current = ordering; }, [ordering]);
  useLayoutEffect(() => {
    // El escenario se dibuja a 1920x1080 reales: en una TV 1080p la escala es 1
    // y la tipografía se rasteriza nítida (antes 960x540 se estiraba al doble).
    const fitCanvas = () => {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      canvasRef.current?.style.setProperty("--stage-scale", String(scale));
    };
    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    return () => window.removeEventListener("resize", fitCanvas);
  }, []);
  // FLIP: al reordenar, cada carátula se desliza desde su posición anterior.
  useLayoutEffect(() => {
    const before = flipRef.current;
    if (!before.size) return;
    flipRef.current = new Map();
    const root = canvasRef.current; if (!root) return;
    root.querySelectorAll<HTMLElement>(".app-tile").forEach((tile) => {
      const key = tile.dataset.key; if (!key) return;
      const previous = before.get(key);
      if (previous === undefined) return;
      const dx = previous - tile.offsetLeft;
      if (!dx) return;
      tile.style.transition = "none";
      tile.style.transform = `translateX(${dx}px)`;
      void tile.offsetWidth;
      tile.style.transition = "transform 340ms var(--spring)";
      tile.style.transform = "translateX(0)";
      window.setTimeout(() => { tile.style.transition = ""; tile.style.transform = ""; }, 380);
    });
  }, [favorites]);
  // Cierra la ventana de vídeo del fallback si quedó abierta (evita el negro
  // tapando el launcher al volver con Home/BACK o al recuperar el foco).
  // Compatibilidad: ya no usamos tvwindow.show, así que nunca hay una ventana
  // de vídeo nuestra que ocultar (tvwindow.hide podía dejar la pantalla negra).
  const closeInputWindow = useCallback(() => {
    inputWindowOpenRef.current = false;
  }, []);
  // Avisos flotantes: se desvanecen solos.
  const say = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2800);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  // Los elementos de una fila se ordenan por data-column: las acciones de la
  // cabecera viven fuera del flujo de las carátulas pero son las últimas columnas.
  const rowItems = useCallback((row: number) => {
    const root = canvasRef.current; if (!root) return [] as HTMLElement[];
    return [...root.querySelectorAll<HTMLElement>(`.main-nav[data-row="${row}"]`)]
      .sort((a, b) => Number(a.dataset.column || 0) - Number(b.dataset.column || 0));
  }, []);
  const selectMain = useCallback((row: number, col: number) => {
    const root = canvasRef.current; if (!root) return;
    const candidates = rowItems(row); if (!candidates.length) return;
    col = Math.max(0, Math.min(col, candidates.length - 1));
    root.querySelector(".main-nav.focused")?.classList.remove("focused");
    candidates[col].classList.add("focused");
    posRef.current = { row, col };
    if (row === 0 && selectionRef.current) selectionRef.current.textContent = candidates[col].dataset.name || "";
  }, [rowItems]);
  // Foco inicial (una sola vez; si no, cada cambio de favoritos lo devolvería a la primera).
  useEffect(() => {
    const timer = window.setTimeout(() => selectMain(0, 0), 0);
    return () => window.clearTimeout(timer);
  }, [selectMain]);
  // Tras mover una carátula en modo orden, el foco se coloca cuando React ya
  // reordenó el DOM (así el anillo queda en la carátula que se movió).
  useLayoutEffect(() => {
    const target = pendingOrderRef.current;
    if (target < 0) return;
    pendingOrderRef.current = -1;
    selectMain(0, target);
  }, [selectMain, storedFavorites]);
  const selectOverlay = useCallback((index: number) => {
    const root = canvasRef.current; if (!root) return; const items = [...root.querySelectorAll<HTMLElement>(".overlay.open .overlay-nav")]; if (!items.length) return;
    index = Math.max(0, Math.min(index, items.length - 1)); root.querySelector(".overlay-nav.focused")?.classList.remove("focused"); items[index].classList.add("focused"); items[index].scrollIntoView({ block: "nearest" }); overlayPosRef.current = index;
  }, []);
  const focusOverlaySelector = useCallback((selector: string) => {
    const root = canvasRef.current; if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>(".overlay.open .overlay-nav")];
    const index = items.findIndex((item) => item.matches(selector));
    selectOverlay(index >= 0 ? index : 0);
  }, [selectOverlay]);
  // En el selector de favoritos el panel mezcla dos rejillas (apps + entradas):
  // el movimiento se resuelve por geometría, no por índices fijos de columna.
  const moveOverlayByGeometry = useCallback((dx: number, dy: number) => {
    const root = canvasRef.current; if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>(".overlay.open .overlay-nav")];
    const current = root.querySelector<HTMLElement>(".overlay.open .overlay-nav.focused");
    if (!current || !items.length) return;
    const box = current.getBoundingClientRect();
    const cx = box.left + box.width / 2; const cy = box.top + box.height / 2;
    let best: HTMLElement | null = null; let bestScore = Number.POSITIVE_INFINITY;
    for (const item of items) {
      if (item === current) continue;
      const rect = item.getBoundingClientRect();
      const vx = rect.left + rect.width / 2 - cx;
      const vy = rect.top + rect.height / 2 - cy;
      if (dx !== 0 && (Math.sign(vx) !== dx || Math.abs(vx) < 8)) continue;
      if (dy !== 0 && (Math.sign(vy) !== dy || Math.abs(vy) < 8)) continue;
      const primary = dx !== 0 ? Math.abs(vx) : Math.abs(vy);
      const secondary = dx !== 0 ? Math.abs(vy) : Math.abs(vx);
      const score = primary + secondary * 2.4;
      if (score < bestScore) { bestScore = score; best = item; }
    }
    if (best) selectOverlay(items.indexOf(best));
  }, [selectOverlay]);
  const openOverlay = useCallback((next: Overlay) => {
    // El foco del control remoto se mueve al panel: se apaga el anillo de la fila
    // de abajo para que no se vea un segundo foco tras el glass.
    canvasRef.current?.querySelector(".main-nav.focused")?.classList.remove("focused");
    setOverlay(next); overlayRef.current = next; overlayPosRef.current = 0; window.setTimeout(() => selectOverlay(0), 0);
  }, [selectOverlay]);
  const closeOverlay = useCallback(() => {
    const wasPicker = pickerRef.current;
    setOverlay("none"); overlayRef.current = "none";
    setDeviceTarget(null); deviceRef.current = null;
    canvasRef.current?.querySelector(".overlay-nav.focused")?.classList.remove("focused");
    if (wasPicker) { setFavoritePicker(false); pickerRef.current = false; }
    // Al salir del selector de favoritos se vuelve al lápiz, con la fila ya actualizada.
    window.setTimeout(() => {
      if (wasPicker) {
        const index = rowItems(-1).findIndex((el) => el.classList.contains("pencil"));
        selectMain(-1, index >= 0 ? index : 0);
      } else selectMain(posRef.current.row, posRef.current.col);
    }, 0);
  }, [rowItems, selectMain]);
  // Home llega como app-control `operation/main` (botón Home / arranque).
  const resetToHome = useCallback(() => {
    setOverlay("none"); overlayRef.current = "none";
    setFavoritePicker(false); pickerRef.current = false;
    setDeviceTarget(null); deviceRef.current = null;
    setOrdering(false); orderingRef.current = false;
    posRef.current = { row: 0, col: 0 };
    window.setTimeout(() => selectMain(0, 0), 0);
  }, [selectMain]);
  const launchApp = useCallback((app: UiApp) => {
    if (!window.tizen?.application) return say(`Vista previa · ${app.name}`);
    window.tizen.application.launch(app.id, () => {}, (error) => say(`No se pudo abrir: ${error.message}`));
}, [say]);
  // Abre la pantalla de apps de Samsung ("Administrar apps").
  const launchAppManager = useCallback(() => {
    const manager = window.tizen?.application;
    if (!manager) return say(PREVIEW_APP_STORE);
    const failed = (error: Error) => say(`No se pudo abrir Apps de Samsung: ${error.message}`);
    manager.launch(APP_STORE_ID, () => {}, () => {
      try {
        manager.launch(APP_STORE_FALLBACK_ID, () => {}, (error) => failed(error));
      } catch (error) {
        failed(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, [say]);
  // Cambiar a una entrada: setSource + visor de TV; si el visor no está, hide().
  const activateSource = useCallback((input: InputSource) => {
    const tizen = window.tizen;
    if (!tizen?.systeminfo || !tizen.tvwindow || !tizen.application) return say(`Vista previa · ${input.name}`);
    readVideoSources((sources) => {
      const source = sources.find((item) => String(item.type).toUpperCase() === input.type.toUpperCase() && Number(item.number) === input.number);
      if (!source) return say(`${input.name} no está disponible`);
      // Nunca ocultamos la app: si el visor falla, seguimos en HomePunk.
      // (El hide() en error era lo que dejaba el negro y bloqueaba Home.)
      const viewerFailed = (error: Error) => say(`Entradas: ${error.message}`);
      try {
        tizen.tvwindow!.setSource(source, () => {
          try {
            tizen.application!.launch(TV_VIEWER_ID, () => {}, viewerFailed);
          } catch (error) {
            say(`Entradas: ${error instanceof Error ? error.message : String(error)}`);
          }
        }, (error) => say(`Entradas: ${error.message}`), "MAIN");
      } catch (error) {
        say(`Entradas: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, (message) => say(`Entradas: ${message}`));
  }, [say]);
  const refreshInputs = useCallback(() => {
    readVideoSources((sources) => {
      const found = new Map<number, InputSource>();
      for (const source of sources) {
        if (String(source.type).toUpperCase() !== "HDMI") continue;
        const number = Number(source.number);
        if (!Number.isFinite(number)) continue;
        const editName = (source.editName || "").trim();
        found.set(number, { type: "HDMI", number, name: editName || `HDMI ${number}`, signal: source.signal ?? null });
      }
      setInputSources(found.size ? [...found.values()].sort((a, b) => a.number - b.number) : fallbackInputs);
    }, () => setInputSources(fallbackInputs));
  }, []);
  // Refresco del catálogo (apps desinstaladas desde Samsung, etc.): asíncrono,
  // sin bloquear el primer frame y sin re-render si la lista no cambió.
  const refreshApps = useCallback(() => {
    const api = window.tizen?.application;
    if (!api?.getAppsInfo) return;
    const now = Date.now();
    if (now - lastAppsRefreshRef.current < 2500) return; // evita lag al abrir paneles
    lastAppsRefreshRef.current = now;
    api.getAppsInfo((infos) => {
      const seen = new Set<string>();
      const list = infos.filter(isUserApp).map(enrich)
        .filter((app) => { const key = stripName(app.name); if (seen.has(key)) return false; seen.add(key); return true; })
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      if (!list.length) return; // respuesta rara: se mantiene lo que hay
      const signature = list.map((app) => app.id).join("|");
      if (signature === appsSignatureRef.current) return;
      appsSignatureRef.current = signature;
      setApps(list);
      // Poda: favoritos de apps que ya no están instaladas.
      const installed = new Set(list.map((app) => app.id));
      setStoredFavorites((current) => {
        const next = current.filter((raw) => {
          const parsed = normalizeStored(raw);
          if (!parsed) return false;
          return parsed.kind === "input" || installed.has(parsed.id);
        });
        if (next.length === current.length) return current;
        writeJson(FAVORITES_KEY, next);
        return next;
      });
    }, () => { /* error: se mantiene la lista actual, sin parpadeo */ });
  }, []);
  const scheduleAppsRefresh = useCallback(() => {
    window.clearTimeout(appsRefreshTimer.current);
    appsRefreshTimer.current = window.setTimeout(refreshApps, 300);
  }, [refreshApps]);
  // --- asignación HDMI ↔ dispositivo (persistente e independiente de favoritos) ---
  const saveAssignment = useCallback((number: number, device: DeviceOption) => {
    setAssignments((current) => {
      const next = { ...current, [String(number)]: { device: device.id, label: device.name } };
      writeJson(INPUTS_KEY, next);
      return next;
    });
  }, []);
  const focusInputCard = useCallback((number: number, target: Overlay) => {
    const selector = target === "entries" ? `[data-entry="${number}"]` : `[data-input="${inputKeyOf(number)}"]`;
    focusOverlaySelector(selector);
  }, [focusOverlaySelector]);
  const openDeviceSelector = useCallback((number: number, addFavorite: boolean, returnTo: Overlay) => {
    setDeviceTarget({ number, addFavorite }); deviceRef.current = { number, addFavorite };
    setDeviceReturn(returnTo);
    setOverlay("devices"); overlayRef.current = "devices"; overlayPosRef.current = 0;
    const current = assignments[String(number)]?.device;
    const index = Math.max(0, deviceOptions.findIndex((device) => device.id === current));
    window.setTimeout(() => selectOverlay(index), 0);
  }, [assignments, selectOverlay]);
  const chooseDevice = useCallback((device: DeviceOption) => {
    const target = deviceRef.current;
    if (!target) return;
    saveAssignment(target.number, device);
    if (target.addFavorite) {
      setStoredFavorites((current) => {
        const exists = current.some((raw) => { const parsed = normalizeStored(raw); return parsed?.kind === "input" && parsed.number === target.number; });
        if (exists) return current;
        if (current.length >= MAX_FAVORITES) { say(`Favoritos está lleno (${MAX_FAVORITES}) · quita uno primero`); return current; }
        const next = [...current, { kind: "input", number: target.number } as SavedInput];
        writeJson(FAVORITES_KEY, next);
        return next;
      });
      say(`${device.name} añadida a Favoritos`);
    } else {
      say(`HDMI ${target.number} · ${device.name}`);
    }
    setDeviceTarget(null); deviceRef.current = null;
    setOverlay(deviceReturn); overlayRef.current = deviceReturn;
    window.setTimeout(() => focusInputCard(target.number, deviceReturn), 0);
  }, [deviceReturn, focusInputCard, saveAssignment, say]);
  const cancelDevice = useCallback(() => {
    const target = deviceRef.current;
    setDeviceTarget(null); deviceRef.current = null;
    setOverlay(deviceReturn); overlayRef.current = deviceReturn;
    window.setTimeout(() => { if (target) focusInputCard(target.number, deviceReturn); else selectOverlay(0); }, 0);
  }, [deviceReturn, focusInputCard, selectOverlay]);
  const toggleAppFavorite = useCallback((app: UiApp) => setStoredFavorites((current) => {
    const present = current.some((raw) => raw === app.id);
    if (!present && current.length >= MAX_FAVORITES) { say(`Favoritos está lleno (${MAX_FAVORITES}) · quita uno primero`); return current; }
    const next = present ? current.filter((raw) => raw !== app.id) : [...current, app.id];
    writeJson(FAVORITES_KEY, next);
    say(present ? `${app.name} quitada de Favoritos` : `${app.name} añadida a Favoritos`);
    return next;
  }), [say]);
  // Marcar/desmarcar un HDMI en Favoritos (asignar dispositivo es otra acción).
  const toggleInputFavorite = useCallback((input: InputSource) => {
    const present = favoritesRef.current.some((favorite) => favorite.kind === "input" && favorite.input?.number === input.number);
    const assigned = assignments[String(input.number)];
    const label = assigned?.label || deviceById(assigned?.device).name;
    if (present) {
      setStoredFavorites((current) => {
        const next = current.filter((raw) => { const parsed = normalizeStored(raw); return !(parsed?.kind === "input" && parsed.number === input.number); });
        writeJson(FAVORITES_KEY, next);
        return next;
      });
      say(`HDMI ${input.number} quitada de Favoritos`);
      return;
    }
    if (favoritesRef.current.length >= MAX_FAVORITES) return say(`Favoritos está lleno (${MAX_FAVORITES}) · quita uno primero`);
    setStoredFavorites((current) => {
      const next = [...current, { kind: "input", number: input.number } as SavedInput];
      writeJson(FAVORITES_KEY, next);
      return next;
    });
    say(`HDMI ${input.number} añadida a Favoritos${assigned?.device ? ` · ${label}` : " · asigna su dispositivo"}`);
  }, [assignments, say]);
  const openApps = useCallback(() => { setFavoritePicker(false); pickerRef.current = false; setDeviceTarget(null); deviceRef.current = null; scheduleAppsRefresh(); openOverlay("apps"); }, [openOverlay, scheduleAppsRefresh]);
  const openFavoritePicker = useCallback(() => {
    setFavoritePicker(true); pickerRef.current = true;
    setDeviceTarget(null); deviceRef.current = null;
    refreshInputs();
    scheduleAppsRefresh();
    openOverlay("apps");
    say("OK marca o desmarca · BACK vuelve a Favoritos");
  }, [openOverlay, refreshInputs, say]);
  const openEntries = useCallback(() => {
    refreshInputs();
    openOverlay("entries");
  }, [openOverlay, refreshInputs]);
  const launchFavorite = useCallback((favorite: Favorite) => {
    // Sin diálogo: la tile HDMI cambia de entrada directamente.
    if (favorite.kind === "input" && favorite.input) return activateSource(favorite.input);
    if (favorite.app) launchApp(favorite.app);
  }, [activateSource, launchApp]);
  // --- orden de favoritos ---
  const startOrderingAt = useCallback((index: number) => {
    if (!favoritesRef.current.length) return say("No hay favoritos que ordenar");
    setOverlay("none"); overlayRef.current = "none";
    setFavoritePicker(false); pickerRef.current = false;
    setDeviceTarget(null); deviceRef.current = null;
    setOrdering(true); orderingRef.current = true;
    const target = Math.max(0, Math.min(index, favoritesRef.current.length - 1));
    posRef.current = { row: 0, col: target };
    orderIndexRef.current = target;
    window.setTimeout(() => selectMain(0, target), 0);
    say("Ordenando · ← → mueven · OK guarda · BACK sale");
  }, [say, selectMain]);
  const startOrdering = useCallback(() => startOrderingAt(0), [startOrderingAt]);
  const stopOrdering = useCallback(() => {
    setOrdering(false); orderingRef.current = false;
  }, []);
  const moveFavorite = useCallback((from: number, to: number) => {
    const list = favoritesRef.current;
    const a = list[from]; const b = list[to];
    if (!a || !b) return;
    orderIndexRef.current = to;
    pendingOrderRef.current = to;
    flipRef.current = new Map();
    const root = canvasRef.current;
    root?.querySelectorAll<HTMLElement>(".app-tile").forEach((tile) => {
      const key = tile.dataset.key; if (key) flipRef.current.set(key, tile.offsetLeft);
    });
    setStoredFavorites((current) => {
      const indexA = current.findIndex((raw) => { const parsed = normalizeStored(raw); if (!parsed) return false; return a.kind === "app" ? parsed.kind === "app" && parsed.id === a.key : parsed.kind === "input" && inputKeyOf(parsed.number) === a.key; });
      const indexB = current.findIndex((raw) => { const parsed = normalizeStored(raw); if (!parsed) return false; return b.kind === "app" ? parsed.kind === "app" && parsed.id === b.key : parsed.kind === "input" && inputKeyOf(parsed.number) === b.key; });
      if (indexA < 0 || indexB < 0) return current;
      const next = [...current];
      [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
      writeJson(FAVORITES_KEY, next);
      return next;
    });
    // Red de seguridad: si el layout effect no llegara (motor antiguo), el foco
    // se coloca igualmente en la carátula movida.
    window.setTimeout(() => {
      if (pendingOrderRef.current !== to) return;
      pendingOrderRef.current = -1;
      selectMain(0, to);
    }, 80);
  }, [selectMain]);
  const activateInput = useCallback((index: number) => {
    const item = inputItems[index]; if (!item) return;
    if (item.id === "source") { try { window.webapis?.appcommon?.generateKey("Source"); say("Selector de fuentes Samsung"); } catch (error) { say(`No se pudo abrir Fuentes: ${String(error)}`); } return; }
    if (item.id === "home") return launchApp({ id: "com.samsung.tv.csfs", name: "Samsung Home", mark: "⌂", accent: "#3278df" });
    // Mismo flujo exacto que las tiles HDMI de Favoritos (visor de Samsung).
    return activateSource({ type: item.type, number: item.number, name: item.name, signal: (item as { signal?: boolean | null }).signal ?? null });
  }, [activateSource, launchApp, say]);
  const persistSettings = useCallback((next: Settings) => { setSettings(next); writeJson(SETTINGS_KEY, next); }, []);
  const refreshWatchdog = useCallback(async () => {
    const json = await watchdogRequest("/status");
    setWatchdog(json ? !!json.enabled : null);
    setBootLaunch(json ? !!json.bootEnabled : null);
  }, []);
  const toggleWatchdog = useCallback(async () => {
    const path = watchdog ? "/stop" : "/start";
    try {
      const json = await watchdogRequest(path, { method: "POST" });
      if (!json) throw new Error("sin conexión");
      setWatchdog(!!json.enabled);
      say(json.enabled ? "Auto-retorno activado" : "Auto-retorno desactivado");
    } catch {
      setWatchdog(null);
      say("ArtWatch sin conexión");
    }
  }, [say, watchdog]);
  const toggleBootLaunch = useCallback(async () => {
    const path = bootLaunch ? "/boot/off" : "/boot/on";
    try {
      const json = await watchdogRequest(path, { method: "POST" });
      if (!json) throw new Error("sin conexión");
      setBootLaunch(!!json.bootEnabled);
      say(json.bootEnabled ? "HomePunk se abrirá al encender" : "Arranque directo desactivado");
    } catch {
      setBootLaunch(null);
      say("ArtWatch sin conexión");
    }
  }, [bootLaunch, say]);
  useEffect(() => {
    void refreshWatchdog();
    const timer = window.setInterval(() => { void refreshWatchdog(); }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshWatchdog]);
  // Migración: si un favorito antiguo traía device/label, se copia a INPUTS_KEY.
  useEffect(() => {
    setAssignments((current) => {
      let changed = false;
      const next = { ...current };
      for (const raw of storedFavorites) {
        const parsed = normalizeStored(raw);
        if (!parsed || parsed.kind !== "input" || !parsed.device) continue;
        const key = String(parsed.number);
        if (!next[key]) { next[key] = { device: parsed.device, label: parsed.label }; changed = true; }
      }
      if (changed) writeJson(INPUTS_KEY, next);
      return changed ? next : current;
    });
  }, [storedFavorites]);
  // Nombres reales (editName) de las entradas, sin bloquear el pintado.
  useEffect(() => {
    const hasInput = storedFavorites.some((raw) => { const parsed = normalizeStored(raw); return !!parsed && parsed.kind === "input"; });
    if (!hasInput) return;
    const timer = window.setTimeout(refreshInputs, 600);
    return () => window.clearTimeout(timer);
  }, [refreshInputs, storedFavorites]);
  useEffect(() => { if (overlay === "settings") refreshWatchdog(); }, [overlay, refreshWatchdog]);
  const openWallpapers = useCallback(() => {
    openOverlay("wallpapers");
    const index = WALLPAPERS.findIndex((wp) => wp.id === settings.wallpaper);
    window.setTimeout(() => selectOverlay(index >= 0 ? index : 0), 40);
  }, [openOverlay, selectOverlay, settings.wallpaper]);
  const closeWallpapers = useCallback(() => {
    setOverlay("settings");
    overlayRef.current = "settings";
    window.setTimeout(() => {
      const items = [...(canvasRef.current?.querySelectorAll<HTMLElement>(".overlay.open .overlay-nav") ?? [])];
      const index = items.findIndex((item) => item.classList.contains("setting") && item.textContent?.includes("Fondo"));
      selectOverlay(index >= 0 ? index : 1);
    }, 0);
  }, [selectOverlay]);
  const applyWallpaper = useCallback((wp: WallpaperOption) => {
    persistSettings({ ...settings, wallpaper: wp.id });
    closeOverlay();
    say(`Fondo: ${wp.label}`);
  }, [closeOverlay, persistSettings, say, settings]);
  const applySetting = useCallback((index: number) => {
    if (index === 0) persistSettings({ ...settings, theme: settings.theme === "dark" ? "light" : "dark" });
    if (index === 1) openWallpapers();
    if (index === 2) persistSettings({ ...settings, weather: !settings.weather });
    if (index === 3) toggleWatchdog();
    if (index === 4) toggleBootLaunch();
    if (index === 5) startOrdering();
    if (index === 6) openEntries();
    if (index === 7) launchAppManager();
    if (index === 8) launchApp(samsungSettings);
    if (index === 9) closeOverlay();
  }, [closeOverlay, launchApp, launchAppManager, openEntries, openWallpapers, persistSettings, settings, startOrdering, toggleBootLaunch, toggleWatchdog]);

  useEffect(() => {
    refreshApps();
    return () => window.clearTimeout(appsRefreshTimer.current);
  }, [refreshApps]);
  useEffect(() => { try { window.webapis?.appcommon?.registerKey(["SmartHub"]); } catch { /* API web privada ausente, p. ej. en vista previa de navegador */ } }, []);
  // Latido para medir si el JS sigue vivo en segundo plano (Web Inspector/CDP)
  useEffect(() => {
    const beat = () => { try { localStorage.setItem("arturo-home-heartbeat", String(Date.now())); } catch { /* sin storage */ } };
    beat();
    const timer = window.setInterval(beat, 5000);
    const onVisible = () => beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  useEffect(() => {
    const homeOperations = new Set([
      "http://tizen.org/appcontrol/operation/main",
      "http://samsung.com/appcontrol/operation/eden_resume",
    ]);
    const handleIncoming = () => {
      closeInputWindow();
      scheduleAppsRefresh();
      try {
        const requested = window.tizen?.application?.getCurrentApplication?.()?.getRequestedAppControl?.();
        const operation = requested?.appControl?.operation;
        if (operation && homeOperations.has(operation)) resetToHome();
      } catch { /* la API de app-control no existe en la vista previa del navegador */ }
    };
    handleIncoming();
    const onVisible = () => { if (document.visibilityState === "visible") handleIncoming(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", handleIncoming);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", handleIncoming); };
  }, [closeInputWindow, resetToHome, say, scheduleAppsRefresh]);
  useEffect(() => {
    const timeFormat = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" });
    const dateFormat = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const update = () => {
      const now = new Date();
      const parts = timeFormat.formatToParts(now);
      const digits = parts.filter((part) => part.type !== "dayPeriod").map((part) => part.value).join("").trim();
      const meridiem = (parts.find((part) => part.type === "dayPeriod")?.value || "").replace(/\./g, "").toLowerCase();
      if (clockRef.current) clockRef.current.textContent = digits;
      if (meridiemRef.current) meridiemRef.current.textContent = meridiem;
      if (dateRef.current) dateRef.current.textContent = dateFormat.format(now);
    };
    update(); const timer = window.setInterval(update, 30_000); return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!settings.weather) { setWeather(null); return; } const cached = readJson<{ at: number; value: Weather } | null>("arturo-home-weather", null); if (cached && Date.now() - cached.at < 3_600_000) { setWeather(cached.value); return; }
    fetch("https://api.open-meteo.com/v1/forecast?latitude=32.5149&longitude=-117.0382&current=temperature_2m,weather_code&timezone=America%2FTijuana").then((response) => response.json()).then((data) => { const code = Number(data.current.weather_code); const labels: Record<number, string> = { 0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado", 3: "Nublado", 45: "Niebla", 51: "Llovizna", 61: "Lluvia", 80: "Chubascos", 95: "Tormenta" }; const value = { temperature: Math.round(data.current.temperature_2m), label: labels[code] || (code >= 51 ? "Lluvia" : "Nublado"), symbol: code <= 1 ? "☀" : code <= 3 ? "☁" : "☂" }; setWeather(value); writeJson("arturo-home-weather", { at: Date.now(), value }); }).catch(() => say("Clima sin conexión"));
  }, [say, settings.weather]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key; const code = event.keyCode; const back = key === "Escape" || key === "Backspace" || code === 10009; const home = key === "XF86Home" || code === 10071; const currentOverlay = overlayRef.current;
      const isEnter = key === "Enter" || code === 13;
      if (!isEnter) {
        window.clearTimeout(longPressTimer.current);
        enterHeldRef.current = false;
        pendingTileRef.current = null;
      }
      if (back || home) closeInputWindow();
      if (home) { event.preventDefault(); resetToHome(); return; }
      // --- modo orden: ←/→ mueven la carátula, OK guarda, BACK sale ---
      if (orderingRef.current) {
        const col = orderIndexRef.current;
        if (key === "ArrowLeft") { event.preventDefault(); moveFavorite(col, col - 1); return; }
        if (key === "ArrowRight") { event.preventDefault(); moveFavorite(col, col + 1); return; }
        if (key === "Enter") {
          event.preventDefault();
          enterConsumedRef.current = true; // el keyup de este OK no abre nada
          pendingTileRef.current = null;
          stopOrdering();
          say("Orden guardado");
          return;
        }
        if (back) { event.preventDefault(); stopOrdering(); return; }
        return;
      }
      // --- dentro de un panel: flechas + OK + BACK, sin atajos de letras ---
      if (currentOverlay !== "none") {
        const count = canvasRef.current?.querySelectorAll(".overlay.open .overlay-nav").length || 0;
        const columns = currentOverlay === "settings" ? 2 : currentOverlay === "inputs" ? 3 : 4;
        let index = overlayPosRef.current;
        const geometric = pickerRef.current && currentOverlay === "apps";
        if (key === "ArrowLeft") { if (geometric) moveOverlayByGeometry(-1, 0); else index--; }
        else if (key === "ArrowRight") { if (geometric) moveOverlayByGeometry(1, 0); else index++; }
        else if (key === "ArrowUp") { if (geometric) moveOverlayByGeometry(0, -1); else index -= columns; }
        else if (key === "ArrowDown") { if (geometric) moveOverlayByGeometry(0, 1); else index += columns; }
        else if (back) {
          event.preventDefault();
          if (currentOverlay === "wallpapers") closeWallpapers();
          else if (currentOverlay === "devices") cancelDevice();
          else closeOverlay();
          return;
        }
        else if (key === "Enter") {
          event.preventDefault();
          const focused = canvasRef.current?.querySelector<HTMLElement>(".overlay.open .overlay-nav.focused");
          if (currentOverlay === "devices") {
            const device = deviceOptions.find((option) => option.id === focused?.dataset.device);
            if (device) chooseDevice(device);
            return;
          }
          if (currentOverlay === "entries") {
            const number = Number(focused?.dataset.entry);
            if (Number.isFinite(number)) openDeviceSelector(number, false, "entries");
            return;
          }
          if (currentOverlay === "apps") {
            if (pickerRef.current) {
              if (focused?.dataset.assign !== undefined) {
                const number = Number(focused.dataset.assign);
                if (Number.isFinite(number)) openDeviceSelector(number, false, "apps");
                return;
              }
              if (focused?.dataset.toggleInput !== undefined) {
                const number = Number(focused.dataset.toggleInput);
                const input = inputSources.find((source) => source.number === number);
                if (input) toggleInputFavorite(input);
                return;
              }
              if (focused?.dataset.app) {
                const target = appsRef.current.find((item) => item.id === focused.dataset.app);
                if (target) toggleAppFavorite(target);
              }
              return;
            }
            const app = appsRef.current[index];
            if (app) launchApp(app);
          }
          if (currentOverlay === "wallpapers") {
            const wallpaper = WALLPAPERS.find((wp) => wp.id === focused?.dataset.wallpaper);
            if (wallpaper) applyWallpaper(wallpaper);
            return;
          }
          if (currentOverlay === "inputs") activateInput(index);
          if (currentOverlay === "settings") applySetting(index);
          return;
        }
        else if ((key === "ColorF2Yellow" || code === 405) && currentOverlay === "apps" && pickerRef.current) {
          event.preventDefault();
          const focused = canvasRef.current?.querySelector<HTMLElement>(".overlay.open .overlay-nav.focused");
          if (focused?.dataset.toggleInput !== undefined) {
            const input = inputSources.find((source) => source.number === Number(focused.dataset.toggleInput));
            if (input) toggleInputFavorite(input);
          } else if (focused?.dataset.app) {
            const target = appsRef.current.find((item) => item.id === focused.dataset.app);
            if (target) toggleAppFavorite(target);
          }
          return;
        }
        else return;
        if (geometric && (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown")) return;
        event.preventDefault(); selectOverlay(Math.max(0, Math.min(index, count - 1))); return;
      }
      // --- inicio: fila -1 = accesos rápidos, fila 0 = favoritos + acciones ---
      let { row, col } = posRef.current;
      const total = favorites.length;
      if (!back && (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" || key === "Enter")) event.preventDefault();
      if (key === "ArrowLeft") col--;
      else if (key === "ArrowRight") col++;
      else if (key === "ArrowUp") row--;
      else if (key === "ArrowDown") row++;
      else if (key === "Enter") {
        if (row === -2) {
          if (col === 0) openOverlay("inputs");
          if (col === 1) openApps();
          if (col === 2) launchApp(samsungSettings);
          if (col === 3) openOverlay("settings");
          return;
        }
        if (row === -1) {
          if (col === 0) openApps();
          if (col === 1) launchAppManager();
          if (col === 2) openFavoritePicker();
          return;
        }
        // Carátula: se abre al SOLTAR, para poder detectar el long-press (700 ms)
        // que entra en modo orden con esa carátula ya seleccionada.
        if (event.repeat) return;
        const target = col;
        pendingTileRef.current = target;
        enterConsumedRef.current = false;
        enterHeldRef.current = true;
        window.clearTimeout(longPressTimer.current);
        longPressTimer.current = window.setTimeout(() => {
          if (!enterHeldRef.current) return;
          enterConsumedRef.current = true;
          pendingTileRef.current = null;
          startOrderingAt(target);
        }, 700);
        return;
      }
      else if (back) { say("Samsung Home está disponible en Entradas"); return; }
      else return;
      row = Math.max(-2, Math.min(row, 0));
      selectMain(row, col);
    };
    // Al soltar OK: si no hubo long-press, se abre la carátula pendiente.
    const onKeyUp = (event: KeyboardEvent) => {
      const isEnter = event.key === "Enter" || event.keyCode === 13;
      if (!isEnter) return;
      window.clearTimeout(longPressTimer.current);
      enterHeldRef.current = false;
      if (enterConsumedRef.current) { enterConsumedRef.current = false; pendingTileRef.current = null; return; }
      const pending = pendingTileRef.current;
      pendingTileRef.current = null;
      if (pending === null || orderingRef.current || overlayRef.current !== "none") return;
      const favorite = favoritesRef.current[pending];
      if (favorite) launchFavorite(favorite);
    };
    window.addEventListener("keydown", onKey, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.clearTimeout(longPressTimer.current);
    };
  }, [activateInput, applySetting, applyWallpaper, cancelDevice, chooseDevice, closeInputWindow, closeOverlay, closeWallpapers, favorites, launchApp, launchAppManager, launchFavorite, moveFavorite, moveOverlayByGeometry, openApps, openDeviceSelector, openFavoritePicker, openOverlay, resetToHome, say, selectMain, selectOverlay, startOrdering, startOrderingAt, stopOrdering, toggleAppFavorite, toggleInputFavorite]);

  // Datos de una tarjeta HDMI del panel "TV y entradas": logo asignado, nombre
  // del dispositivo y editName real del televisor como texto secundario.
  const hdmiCard = (number: number) => {
    const assignment = assignments[String(number)];
    const explicit = !!assignment?.device && assignment.device !== "other";
    const device = deviceById(assignment?.device);
    const detected = inputSources.find((source) => source.number === number);
    const editName = detected && detected.name !== `HDMI ${number}` ? detected.name : "";
    // Sin asignación: "HDMI n" con el conector genérico (el editName va de subtítulo).
    const name = explicit ? (assignment?.label || device.name) : `HDMI ${number}`;
    const offline = detected?.signal === false;
    const sub = offline ? "Sin señal" : (editName && editName !== name ? editName : "");
    return { device: explicit ? device : otherDevice, name, sub, offline };
  };
  const panelTitle = overlay === "wallpapers" ? "Fondos"
    : overlay === "devices"
      ? `HDMI ${deviceTarget?.number ?? 1} · ¿qué dispositivo?`
      : overlay === "entries" ? "Editar entradas" : overlay === "apps" ? (favoritePicker ? "Añadir a Favoritos" : "Todas las apps") : "";
  const panelSubtitle = overlay === "wallpapers"
    ? "OK aplica el fondo · BACK vuelve a Configuración"
    : overlay === "devices"
      ? "OK asigna el dispositivo · BACK cancela"
      : overlay === "entries" ? "OK cambia el dispositivo de cada HDMI · BACK vuelve al inicio"
        : favoritePicker ? "OK marca o desmarca · BACK vuelve a Favoritos" : "OK abre la app · BACK vuelve al inicio";

  return (
    <main className={`stage theme-${settings.theme} wallpaper-${settings.wallpaper}${overlay !== "none" ? " overlay-open" : ""}${ordering ? " is-ordering" : ""}`} ref={canvasRef}>
      <div className="wallpaper" aria-hidden="true" />
      <div className="wallpaper-vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="topbar">
        {/* Clima original (texto plano) a la izquierda */}
        <div className="weather-block">
          {weather ? (
            <>
              <b>{weather.symbol} {weather.temperature}°</b>
              <span>{weather.label} · Tijuana</span>
            </>
          ) : (
            <>
              <b>HomePunk</b>
              <span>Listo para ver</span>
            </>
          )}
        </div>

        {/* Reloj centrado en la pantalla */}
        <div className="clock-block">
          <div className="clock-line">
            <time className="clock" ref={clockRef}>8:42</time>
            <span className="clock-meridiem" ref={meridiemRef} />
          </div>
          <span className="clock-date" ref={dateRef}>martes, 20 de octubre</span>
        </div>

        <nav className="quick" aria-label="Accesos rápidos">
          <button className="quick-btn main-nav" data-row="-2" data-column="0" data-name="Entradas" onFocus={() => selectMain(-2, 0)} onMouseEnter={() => selectMain(-2, 0)} onClick={() => openOverlay("inputs")} aria-label="Entradas">
            <span className="quick-glyph"><UiGlyph name="inputs" /></span><span className="quick-label">Entradas</span>
          </button>
          <button className="quick-btn main-nav" data-row="-2" data-column="1" data-name="Todas las apps" onFocus={() => selectMain(-2, 1)} onMouseEnter={() => selectMain(-2, 1)} onClick={openApps} aria-label="Todas las apps">
            <span className="quick-glyph"><UiGlyph name="apps" /></span><span className="quick-label">Apps</span>
          </button>
          <button className="quick-btn main-nav" data-row="-2" data-column="2" data-name="Ajustes Samsung" onFocus={() => selectMain(-2, 2)} onMouseEnter={() => selectMain(-2, 2)} onClick={() => launchApp(samsungSettings)} aria-label="Ajustes Samsung">
            <span className="quick-glyph"><UiGlyph name="settings" /></span><span className="quick-label">Samsung</span>
          </button>
          <button className="quick-btn main-nav" data-row="-2" data-column="3" data-name="Configuración" onFocus={() => selectMain(-2, 3)} onMouseEnter={() => selectMain(-2, 3)} onClick={() => openOverlay("settings")} aria-label="Configuración">
            <span className="quick-glyph"><UiGlyph name="tune" /></span><span className="quick-label">Configuración</span>
          </button>
        </nav>
      </header>

      <section className="favorites" aria-label="Favoritos">
        <div className="fav-head">
          <div className="section-heading">
            <h1>{ordering ? "Ordenando" : "Favoritos"}</h1>
            <span className="section-sep" aria-hidden="true" />
            <span className="selection" ref={selectionRef}>{favorites[0]?.name}</span>
            {ordering && <span className="order-hint">← → mueven · OK guarda</span>}
          </div>
          <div className="fav-actions">
            <button
              className="fav-action main-nav"
              data-row="-1" data-column="0" data-name="Todas las apps"
              onFocus={() => selectMain(-1, 0)} onMouseEnter={() => selectMain(-1, 0)}
              onClick={openApps} aria-label="Todas las apps"
            >
              <span className="fav-action-glyph"><UiGlyph name="apps" /></span><span className="fav-action-label">Todas las apps</span>
            </button>
            <button
              className="fav-action main-nav"
              data-row="-1" data-column="1" data-name="Administrar apps"
              onFocus={() => selectMain(-1, 1)} onMouseEnter={() => selectMain(-1, 1)}
              onClick={launchAppManager} aria-label="Administrar apps"
            >
              <span className="fav-action-glyph"><UiGlyph name="store" /></span><span className="fav-action-label">Administrar apps</span>
            </button>
            <button
              className={`fav-action pencil main-nav${favoritePicker ? " is-active" : ""}`}
              data-row="-1" data-column="2" data-name="Editar"
              onFocus={() => selectMain(-1, 2)} onMouseEnter={() => selectMain(-1, 2)}
              onClick={openFavoritePicker} aria-label="Añadir a Favoritos" aria-pressed={favoritePicker}
            >
              <UiGlyph name="pencil" />
            </button>
          </div>
        </div>
        <div className="app-row">
          {favorites.length > 0
            ? favorites.map((favorite, index) => <FavoriteTile key={favorite.key} favorite={favorite} row={0} index={index} focused={index === 0} onFocus={selectMain} onOpen={launchFavorite} />)
            : <p className="favorites-empty">Sin favoritos · usa el lápiz para añadir apps o entradas</p>}
        </div>
      </section>

      <div className={`toast${toast ? " on" : ""}`} role="status" aria-live="polite">{toast}</div>
      <div className="brandmark" aria-hidden="true"><span className="brandmark-dot" />HomePunk</div>

      <Panel open={overlay === "apps"} title={panelTitle} subtitle={panelSubtitle} onClose={closeOverlay}>
        <div className="panel-scroll">
          {favoritePicker && (
            <>
              <h3 className="picker-title">Entradas</h3>
              <div className="panel-grid picker-entries">
                {inputSources.map((input) => {
                  const key = inputKeyOf(input.number);
                  const info = hdmiCard(input.number);
                  const isFavorite = favorites.some((favorite) => favorite.kind === "input" && favorite.input?.number === input.number);
                  return (
                    <div key={key} className={`input-fav${isFavorite ? " is-favorite" : ""}`}>
                      <button
                        className="input-fav-main overlay-nav"
                        data-input={key}
                        data-assign={input.number}
                        data-name={`HDMI ${input.number}`}
                        onClick={() => openDeviceSelector(input.number, false, "apps")}
                        aria-label={`Asignar dispositivo a HDMI ${input.number}`}
                      >
                        <span className="input-card-art">
                          <DeviceLogo device={info.device} />
                          <i>{`HDMI ${input.number}`}</i>
                        </span>
                        <span className="input-name">{info.name}</span>
                        {info.sub && <span className={`input-sub${info.offline ? " is-offline" : ""}`}>{info.sub}</span>}
                        <span className="input-fav-action"><UiGlyph name="tune" />Asignar dispositivo</span>
                      </button>
                      <button
                        className={`input-fav-toggle overlay-nav${isFavorite ? " on" : ""}`}
                        data-toggle-input={input.number}
                        data-name={`HDMI ${input.number}`}
                        onClick={() => toggleInputFavorite(input)}
                        aria-pressed={isFavorite}
                        aria-label={isFavorite ? `Quitar HDMI ${input.number} de Favoritos` : `Añadir HDMI ${input.number} a Favoritos`}
                      >{isFavorite ? "✓" : "+"}</button>
                    </div>
                  );
                })}
              </div>
              <h3 className="picker-title">Aplicaciones</h3>
            </>
          )}
          <div className="panel-grid apps-grid">
            {apps.map((app) => {
              const isFavorite = storedFavorites.includes(app.id);
              return (
                <button
                  key={app.id}
                  className={`panel-app overlay-nav${isFavorite ? " is-favorite" : ""}`}
                  data-app={app.id}
                  data-name={app.name}
                  onClick={() => (favoritePicker ? toggleAppFavorite(app) : launchApp(app))}
                  aria-pressed={favoritePicker ? isFavorite : undefined}
                >
                  <span className="panel-art"><Brand app={app} panel /></span>
                  <span className="panel-name">{app.name}</span>
                  {favoritePicker
                    ? <i className={`panel-toggle${isFavorite ? " on" : ""}`} aria-hidden="true">{isFavorite ? "✓" : "+"}</i>
                    : isFavorite && <i className="panel-star" aria-label="En Favoritos">★</i>}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel open={overlay === "entries"} title={panelTitle} subtitle={panelSubtitle} onClose={closeOverlay}>
        <div className="panel-grid entries-grid">
          {inputSources.map((input) => {
            const assignment = assignments[String(input.number)];
            const device = deviceById(assignment?.device);
            const unassigned = !assignment?.device;
            const offline = input.signal === false;
            const hasEditName = input.name !== `HDMI ${input.number}`;
            return (
              <button key={input.number} className="input-card is-device overlay-nav" data-entry={input.number} data-name={`HDMI ${input.number}`} onClick={() => openDeviceSelector(input.number, false, "entries")}>
                <span className="input-card-art">
                  <DeviceLogo device={unassigned ? otherDevice : device} />
                  <i>{`HDMI ${input.number}`}</i>
                </span>
                <span className="input-name">{unassigned ? "Sin asignar" : (assignment?.label || device.name)}</span>
                {offline ? <span className="input-sub is-offline">Sin señal</span>
                  : hasEditName ? <span className="input-sub">{input.name}</span> : null}
                <span className="input-fav-action"><UiGlyph name="tune" />Cambiar dispositivo</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel open={overlay === "devices"} title={panelTitle} subtitle={panelSubtitle} onClose={closeOverlay}>
        <div className="panel-grid apps-grid">
          {deviceOptions.map((device) => (
            <button key={device.id} className="device-card overlay-nav" data-device={device.id} data-name={device.name} onClick={() => chooseDevice(device)}>
              <span className="device-art"><DeviceLogo device={device} /></span>
              <span className="panel-name">{device.name}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel open={overlay === "inputs"} title="TV y entradas" subtitle="Incluye un regreso seguro al inicio original" onClose={closeOverlay}>
        <div className="panel-grid inputs-grid">
          {inputItems.map((item, index) => item.type === "HDMI" ? (
            <button key={item.id} className="input-card is-device overlay-nav" onClick={() => activateInput(index)} style={{ "--accent": item.accent } as React.CSSProperties}>
              <span className="input-card-art">
                <DeviceLogo device={hdmiCard(item.number).device} />
                <i>{`HDMI ${item.number}`}</i>
              </span>
              <span className="input-name">{hdmiCard(item.number).name}</span>
              {hdmiCard(item.number).sub && <span className={`input-sub${hdmiCard(item.number).offline ? " is-offline" : ""}`}>{hdmiCard(item.number).sub}</span>}
            </button>
          ) : (
            <button key={item.id} className="input-card overlay-nav" onClick={() => activateInput(index)} style={{ "--accent": item.accent } as React.CSSProperties}>
              <b className="input-mark">{item.mark}</b>
              <span className="input-name">{item.name}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel open={overlay === "settings"} title="Configuración" subtitle="Los cambios se guardan automáticamente" onClose={closeOverlay}>
        <div className="settings-grid">
          <Setting index={0} label="Tema" value={settings.theme === "dark" ? "Oscuro" : "Claro"} icon="theme" onApply={applySetting} />
          <Setting index={1} label="Fondo" value={WALLPAPERS.find((wp) => wp.id === settings.wallpaper)?.label || "Orbit"} icon="wallpaper" onApply={applySetting} />
          <Setting index={2} label="Clima" value={settings.weather ? "Tijuana · activado" : "Desactivado"} icon="weather" onApply={applySetting} />
          <Setting index={3} label="Auto-retorno" value={watchdog === null ? "ArtWatch sin conexión" : watchdog ? "ON · volver al pulsar Home" : "OFF · Home queda en Samsung"} icon="settings" onApply={applySetting} />
          <Setting index={4} label="Abrir HomePunk al encender" value={bootLaunch === null ? "ArtWatch sin conexión" : bootLaunch ? "ON · arranque directo" : "OFF · respetar HDMI/Home"} icon="power" onApply={applySetting} />
          <Setting index={5} label="Ordenar favoritos" value="← → mueven · OK guarda" icon="reorder" onApply={applySetting} />
          <Setting index={6} label="Editar entradas" value="HDMI 1-4 · dispositivo y logo" icon="hdmi" onApply={applySetting} />
          <Setting index={7} label="Administrar apps" value="Apps de Samsung · instalar o eliminar" icon="store" onApply={applySetting} />
          <Setting index={8} label="Ajustes Samsung" value="Imagen, sonido y red" icon="settings" onApply={applySetting} />
          <Setting index={9} label="Cerrar" value="Volver al inicio" icon="close" onApply={applySetting} />
        </div>
      </Panel>

      <Panel open={overlay === "wallpapers"} title="Fondos" subtitle="Elige un fondo · los animados usan CSS, sin vídeo" onClose={closeWallpapers}>
        <div className="wallpaper-grid panel-grid">
          {WALLPAPERS.map((wp) => (
            <button
              key={wp.id}
              className={`wallpaper-card overlay-nav${settings.wallpaper === wp.id ? " is-current" : ""}`}
              data-wallpaper={wp.id}
              onClick={() => applyWallpaper(wp)}
            >
              <span
                className={`wallpaper-card-art wallpaper-card-art-${wp.id}`}
                style={wp.thumb ? { backgroundImage: `url(${wp.thumb})` } : undefined}
              />
              <span className="wallpaper-card-shade" />
              <span className="wallpaper-card-tag">{wp.category}</span>
              <span className="wallpaper-card-name">{wp.label}</span>
              {settings.wallpaper === wp.id && <span className="wallpaper-card-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </Panel>
    </main>
  );
}
const GLOBE_PATH = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a8.2 8.2 0 0 1 0-4h3.08a16.5 16.5 0 0 0 0 4H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A8.03 8.03 0 0 1 5.08 16zm2.95-8H5.08a8.03 8.03 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96a13.7 13.7 0 0 1-1.91-3.96h3.82A13.7 13.7 0 0 1 12 19.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.08a8.2 8.2 0 0 1 0 4h-3.08z";
const vectorBrands: Record<string, { path: string }> = {
  apple: siAppletv,
  youtube: siYoutube,
  spotify: siSpotify,
  max: siHbomax,
  internet: { path: GLOBE_PATH },
};
// Logos de marca a color. Disney+ y Max usan los SVG originales del paquete
// (ruta RELATIVA, sin "/" inicial, sin filtros); Prime Video se inlinea con el
// mismo trazado del asset en blanco (su SVG original es negro).
const brandImages: Record<string, { src: string }> = {
  disney: { src: "brands/disney-plus.svg" },
  netflix: { src: "brands/netflix.svg" },
  crunchyroll: { src: "brands/crunchyroll.svg" },
  photos: { src: "brands/google-photos.svg" },
  internet: { src: "brands/samsung-internet.svg" },
};
const PRIME_VIDEO_PATH = "M0 9.508c0-.043.01-.073.028-.09.018-.017.047-.025.086-.025h.329c.07 0 .112.034.127.101l.032.119c.091-.088.202-.159.33-.21a1.04 1.04 0 0 1 .396-.079c.294 0 .528.109.7.326.171.217.257.51.257.88 0 .254-.042.475-.127.665-.086.19-.201.335-.347.437a.85.85 0 0 1-.502.154c-.125 0-.243-.02-.355-.06a.857.857 0 0 1-.288-.164v1.003c0 .043-.008.073-.025.09-.017.016-.046.025-.09.025H.115c-.04 0-.068-.009-.086-.025-.019-.017-.028-.047-.028-.09zm1.113.32a.868.868 0 0 0-.447.124v1.206a.834.834 0 0 0 .447.124c.17 0 .296-.058.376-.174.081-.117.121-.3.121-.55 0-.254-.04-.439-.118-.555-.08-.116-.206-.174-.379-.174zm2.248-.087c.121-.134.236-.23.344-.286a.733.733 0 0 1 .345-.085h.063c.043 0 .073.009.092.025.018.017.027.047.027.09v.385c0 .04-.008.068-.025.087-.017.018-.046.027-.089.027a.923.923 0 0 1-.082-.004 1.369 1.369 0 0 0-.383.025c-.1.02-.186.045-.256.076v1.54c0 .04-.008.069-.025.087-.016.018-.046.028-.089.028h-.437c-.04 0-.069-.01-.087-.028-.018-.018-.028-.047-.028-.087V9.508c0-.043.01-.073.028-.09.018-.017.047-.025.087-.025h.328c.07 0 .112.034.128.1zm1.526-.71a.396.396 0 0 1-.278-.096.338.338 0 0 1-.105-.262c0-.11.035-.197.105-.26a.395.395 0 0 1 .278-.097c.116 0 .208.032.278.096.07.064.105.151.105.261a.34.34 0 0 1-.105.262.396.396 0 0 1-.278.096zm-.333.477c0-.043.01-.073.027-.09.019-.017.048-.025.087-.025h.438c.043 0 .072.008.089.025s.025.047.025.09v2.113c0 .04-.008.069-.025.087-.017.018-.046.028-.09.028h-.437c-.04 0-.068-.01-.087-.028-.018-.018-.027-.047-.027-.087zm1.837.11c.161-.107.306-.183.435-.227.13-.045.263-.067.4-.067.273 0 .466.098.579.294.155-.104.3-.18.438-.225.137-.046.278-.069.424-.069.213 0 .377.06.495.179.117.12.175.286.175.5v1.618c0 .04-.008.069-.025.087-.017.019-.046.027-.089.027h-.438c-.04 0-.068-.008-.086-.027-.018-.018-.028-.047-.028-.087V10.15c0-.208-.092-.312-.278-.312-.164 0-.33.04-.497.119v1.664c0 .04-.008.069-.025.087-.017.019-.046.027-.09.027h-.437c-.04 0-.068-.008-.086-.027-.019-.018-.028-.047-.028-.087V10.15c0-.208-.093-.312-.278-.312-.17 0-.337.04-.502.123v1.66c0 .04-.008.069-.025.087-.017.019-.046.027-.089.027h-.438c-.039 0-.068-.008-.086-.027-.018-.018-.027-.047-.027-.087V9.508c0-.043.009-.073.027-.09.018-.017.047-.025.086-.025h.329c.07 0 .112.034.128.101zm4.387 1.16a1.81 1.81 0 0 1-.451-.05c.018.204.08.35.185.44.105.088.263.132.476.132.085 0 .168-.005.249-.016a3.08 3.08 0 0 0 .362-.078.143.143 0 0 1 .023-.002c.052 0 .078.035.078.105v.211c0 .049-.007.083-.02.103a.169.169 0 0 1-.08.053 1.953 1.953 0 0 1-.708.128c-.377 0-.666-.103-.868-.312-.203-.207-.304-.505-.304-.893 0-.398.104-.71.31-.935.207-.227.494-.34.862-.34.283 0 .504.069.664.206a.69.69 0 0 1 .24.55c0 .23-.087.403-.258.52-.172.119-.425.177-.76.177zm.064-.99c-.292 0-.46.18-.506.54.122.025.257.037.406.037.155 0 .267-.024.337-.071.07-.047.105-.12.105-.218 0-.193-.114-.289-.342-.289zm2.948 1.946a.21.21 0 0 1-.075-.011.119.119 0 0 1-.05-.037.274.274 0 0 1-.038-.071l-.777-2.04a1.863 1.863 0 0 1-.023-.063.162.162 0 0 1-.009-.05c0-.047.03-.07.091-.07h.454c.049 0 .084.01.107.028.023.018.04.049.052.092l.468 1.622.477-1.622a.175.175 0 0 1 .052-.092c.023-.018.058-.027.107-.027h.44c.061 0 .091.022.091.068a.16.16 0 0 1-.009.05l-.022.065-.777 2.039a.274.274 0 0 1-.039.07.122.122 0 0 1-.047.038.207.207 0 0 1-.078.01zm2.02-2.703a.393.393 0 0 1-.277-.097.338.338 0 0 1-.105-.26c0-.11.035-.198.105-.262a.393.393 0 0 1 .277-.096c.115 0 .207.032.277.096.07.064.104.151.104.261 0 .11-.034.197-.104.261a.393.393 0 0 1-.277.097zm-.218 2.703c-.04 0-.068-.01-.086-.028-.019-.018-.028-.047-.028-.087V9.507c0-.043.01-.072.028-.09.018-.016.047-.024.086-.024h.436c.042 0 .072.008.089.025.016.017.024.046.024.09v2.111c0 .04-.008.07-.024.087-.017.019-.047.028-.09.028zm1.948.05a.869.869 0 0 1-.513-.153.97.97 0 0 1-.334-.426 1.6 1.6 0 0 1-.116-.63c0-.38.09-.682.268-.91a.856.856 0 0 1 .709-.341.98.98 0 0 1 .622.206V8.458c0-.043.01-.073.027-.09.018-.016.047-.025.087-.025h.436c.042 0 .071.009.088.025.017.017.025.047.025.09v3.161c0 .04-.008.07-.025.087-.017.019-.046.028-.088.028h-.364a.135.135 0 0 1-.084-.023.137.137 0 0 1-.043-.078l-.027-.105a.958.958 0 0 1-.668.256zm.218-.504a.762.762 0 0 0 .418-.128v-1.21a.872.872 0 0 0-.45-.114c-.16 0-.28.06-.358.18-.08.121-.118.304-.118.548 0 .245.041.426.124.546.084.119.212.178.384.178zm2.588-.51c-.169 0-.315-.016-.44-.05.018.201.078.345.18.432.103.087.257.13.465.13.083 0 .164-.005.242-.016a2.997 2.997 0 0 0 .354-.076.135.135 0 0 1 .022-.002c.05 0 .075.035.075.103v.207c0 .048-.007.082-.02.101a.165.165 0 0 1-.077.052 1.895 1.895 0 0 1-.69.126c-.367 0-.65-.102-.846-.306-.197-.204-.296-.496-.296-.876 0-.39.1-.695.302-.917.202-.222.482-.333.84-.333.276 0 .492.068.647.203a.678.678 0 0 1 .234.539c0 .225-.084.395-.251.51-.168.115-.415.173-.74.173zm.063-.97c-.285 0-.45.176-.494.53.119.024.25.036.396.036.15 0 .26-.024.329-.07.068-.046.102-.117.102-.213 0-.19-.111-.284-.333-.284zm2.442 2.003c-.36 0-.642-.11-.845-.328-.203-.218-.304-.523-.304-.914 0-.388.101-.691.304-.91.203-.218.485-.327.845-.327s.642.109.845.327c.203.219.304.522.304.91 0 .39-.101.696-.304.914-.203.218-.485.328-.845.328zm0-.514c.318 0 .477-.242.477-.728 0-.483-.16-.724-.477-.724-.318 0-.477.241-.477.724 0 .486.16.728.477.728zm-6.844 1.886c.405-.306.944-.408 1.39-.408.418 0 .756.09.828.185.15.2-.039 1.584-.775 2.244-.112.102-.22.047-.17-.087.166-.442.536-1.436.36-1.677-.175-.242-1.158-.115-1.6-.058-.068.008-.107-.02-.112-.061v-.023c.004-.036.03-.078.079-.115zm-10.184-.172a.105.105 0 0 1 .106-.091c.027 0 .057.009.089.028a11.778 11.778 0 0 0 6.194 1.772c1.52 0 3.19-.34 4.726-1.043.232-.105.426.164.2.346-1.371 1.09-3.359 1.67-5.07 1.67-2.397 0-4.557-.956-6.191-2.547a.173.173 0 0 1-.054-.097Z";
function monogramOf(name: string): string {
  const clean = (name || "").trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const palette = ["#5b8def", "#8a6cf0", "#e2688c", "#e0893c", "#3fb28a", "#3aa7c8", "#7a8fa6", "#b06ad8"];
  return palette[hash % palette.length];
}
// Carátula: SIEMPRE nuestro arte (vector o wordmark). Las apps desconocidas usan
// un monograma con color; el icono real de Tizen solo aparece en los paneles.
function Brand({ app, panel = false }: { app: UiApp; panel?: boolean }) {
  const vector = app.logo ? vectorBrands[app.logo] : undefined;
  const image = app.logo ? brandImages[app.logo] : undefined;
  const isPrime = app.logo === "prime";
  const isStremioCombo = app.logo === "stremio";
  const isTvPlusMono = app.logo === "tvplus";
  const art = !!vector || !!image || isPrime || isStremioCombo || isTvPlusMono;
  const accent = art ? app.accent : colorFor(app.name);
  const realIcon = app.iconPath;
  return <span className={`brand brand-${app.logo || "generic"}`} style={{ "--accent": accent } as React.CSSProperties}>
    <span className="brand-glare" aria-hidden="true" />
    {vector && !image && <svg className="fallback-logo" viewBox="0 0 24 24" aria-hidden="true"><path d={vector.path} /></svg>}
    {image && <img className="brand-img" src={image.src} alt="" />}
    {isStremioCombo && <span className="brand-combo">
      <svg className="combo-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={siStremio.path} fill="#ffffff" /></svg>
      <img className="combo-word" src="brands/stremio-wordmark.png" alt="" />
    </span>}
    {isTvPlusMono && <b className="tvplus-mono">TV<small>+</small></b>}
    {isPrime && <svg className="fallback-logo prime-logo" viewBox="0 0 24 24" aria-hidden="true"><path d={PRIME_VIDEO_PATH} fill="#ffffff" /></svg>}
    {!art && panel && realIcon && <img className="actual-icon" src={realIcon} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
    {!art && !(panel && realIcon) && <b className="monogram">{app.mono || monogramOf(app.name)}</b>}
  </span>;
}
// Logo del dispositivo asignado a una entrada HDMI.
function DeviceLogo({ device }: { device?: DeviceOption }) {
  const option = device || otherDevice;
  return (
    <span className="device-logo" style={{ "--device": option.accent } as React.CSSProperties}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {option.path ? <path d={option.path} fill="currentColor" /> : <DeviceGlyph kind={option.custom} />}
      </svg>
    </span>
  );
}
function DeviceGlyph({ kind }: { kind?: DeviceOption["custom"] }) {
  if (kind === "xbox") return (
    <>
      <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6.4 6.1c3.1 2.4 8 8.2 10.9 11.9M17.6 6.1c-3.1 2.4-8 8.2-10.9 11.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>
  );
  if (kind === "switch") return (
    <>
      <rect x="2.9" y="3.2" width="7.7" height="17.6" rx="3.7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.4" y="3.2" width="7.7" height="17.6" rx="3.7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="6.8" cy="7.9" r="1.6" fill="currentColor" />
      <circle cx="17.2" cy="16.1" r="1.6" fill="currentColor" />
    </>
  );
  if (kind === "pc") return (
    <>
      <rect x="2.4" y="4" width="19.2" height="12.2" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.2 20.2h5.6M12 16.6v3.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>
  );
  if (kind === "soundbar") return (
    <>
      <rect x="1.8" y="8.4" width="20.4" height="7.2" rx="3.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="6.2" cy="12" r="1.05" fill="currentColor" />
      <circle cx="10.1" cy="12" r="1.05" fill="currentColor" />
      <circle cx="13.9" cy="12" r="1.05" fill="currentColor" />
      <circle cx="17.8" cy="12" r="1.05" fill="currentColor" />
    </>
  );
  return null;
}
// Carátula de una entrada de vídeo: logo del dispositivo + etiqueta + HDMI n.
function InputBrand({ favorite }: { favorite: Favorite }) {
  const number = favorite.input?.number ?? 0;
  const sub = favorite.offline ? "Sin señal" : favorite.sub;
  // Misma tarjeta que el panel "TV y entradas", escalada a la carátula.
  // Superficie única: un solo gradiente con el logo grande, sin caja interna.
  return <span className="tile-input">
    <span className="tile-input-tag">{`HDMI ${number}`}</span>
    <span className="tile-input-logo"><DeviceLogo device={favorite.device} /></span>
    <span className="tile-input-name">{favorite.name}</span>
    {sub && <span className={`tile-input-sub${favorite.offline ? " is-offline" : ""}`}>{sub}</span>}
  </span>;
}
function FavoriteTile({ favorite, row, index, focused, onFocus, onOpen }: { favorite: Favorite; row: number; index: number; focused: boolean; onFocus: (row: number, col: number) => void; onOpen: (favorite: Favorite) => void }) {
  return (
    <button className={`app-tile main-nav ${focused ? "focused" : ""} ${favorite.kind}`} data-row={row} data-column={index} data-key={favorite.key} data-name={favorite.name} aria-label={favorite.name} onMouseEnter={() => onFocus(row, index)} onFocus={() => onFocus(row, index)} onClick={() => onOpen(favorite)}>
      <span className="tile-lift">
        <span className="tile-face">
          {favorite.kind === "input" ? <InputBrand favorite={favorite} /> : favorite.app ? <Brand app={favorite.app} /> : null}
          <span className="tile-gloss" aria-hidden="true" />
          <span className="tile-rim" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
function Panel({ open, title, subtitle, children, onClose }: { open: boolean; title: string; subtitle: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className={`overlay ${open ? "open" : ""}`}>
      <div className="panel" role="dialog" aria-label={title} aria-hidden={!open}>
        <header className="panel-head">
          <div className="panel-titles"><h2>{title}</h2><p>{subtitle}</p></div>
          <button className="close" onClick={onClose} aria-label="Cerrar"><UiGlyph name="close" /></button>
        </header>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}
function Setting({ index, label, value, icon, onApply }: { index: number; label: string; value: string; icon: string; onApply: (index: number) => void }) {
  return <button className="setting overlay-nav" onClick={() => onApply(index)}><b className="setting-icon"><UiGlyph name={icon} /></b><span className="setting-copy"><strong>{label}</strong><small>{value}</small></span></button>;
}
const glyphPaths: Record<string, string> = {
  inputs: "M4 5h16v11H4V5m-2-2v15h8v2H7v2h10v-2h-3v-2h8V3H2z",
  apps: "M5.5 3h4A1.5 1.5 0 0 1 11 4.5v4A1.5 1.5 0 0 1 9.5 10h-4A1.5 1.5 0 0 1 4 8.5v-4A1.5 1.5 0 0 1 5.5 3zm9 0h4A1.5 1.5 0 0 1 20 4.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 8.5v-4A1.5 1.5 0 0 1 14.5 3zm-9 9h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 19h-4A1.5 1.5 0 0 1 4 17.5v-4A1.5 1.5 0 0 1 5.5 12zm9 0h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.49.49 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z",
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  theme: "M12 3a9 9 0 1 0 9 9c0-4.97-4.03-9-9-9zm0 16V5a7 7 0 0 1 0 14z",
  wallpaper: "M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zm-2 0H5l4-5 3 4 2-2 5 3zM8.5 11A2.5 2.5 0 1 1 8.5 6a2.5 2.5 0 0 1 0 5z",
  weather: "M6.76 4.84 5.35 3.43 3.93 4.84l1.42 1.42 1.41-1.42zM4 10H1v2h3v-2zm9-9h-2v3h2V1zm7.07 3.84-1.42-1.41-1.41 1.41 1.41 1.42 1.42-1.42zM17.24 17.16l1.41 1.41 1.42-1.41-1.42-1.42-1.41 1.42zM20 10v2h3v-2h-3zm-8-4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM11 18v3h2v-3h-2zM3.93 17.16l1.42 1.41 1.41-1.41-1.41-1.42-1.42 1.42z",
  reorder: "M7 10l-4 4 4 4v-3h10v3l4-4-4-4v3H7v-3zm10-4V3l4 4-4 4V8H7v3L3 7l4-4v3h10z",
  power: "M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12a7 7 0 1 1-11.41-5.41L6.17 5.17A9 9 0 1 0 21 12a8.9 8.9 0 0 0-3.17-6.83z",
  close: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z",
  pencil: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  store: "M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z",
  hdmi: HDMI_PATH,
  sun: "M11 1h2v3.2h-2V1zm0 18.8h2V23h-2v-3.2zM1 11h3.2v2H1v-2zm18.8 0H23v2h-3.2v-2zM4.4 5.8l1.4-1.4 2.3 2.3-1.4 1.4-2.3-2.3zm11.5 11.5 1.4-1.4 2.3 2.3-1.4 1.4-2.3-2.3zM18.2 4.4l1.4 1.4-2.3 2.3-1.4-1.4 2.3-2.3zM6.7 15.9l1.4 1.4-2.3 2.3-1.4-1.4 2.3-2.3zM12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6z",
  sparkle: "M12 2l1.9 5.6 5.6 1.9-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z"
};
function UiGlyph({ name }: { name: string }) {
  const path = glyphPaths[name] || glyphPaths.sparkle;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}

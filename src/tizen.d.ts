interface TizenApplicationControl {
  operation: string;
  uri?: string;
  mime?: string;
  category?: string;
  data?: unknown[];
}

interface TizenRequestedAppControl {
  appControl: TizenApplicationControl;
  caller?: string;
}

interface TizenCurrentApplication {
  appId: string;
  getRequestedAppControl(): TizenRequestedAppControl | null;
  /** Manda la app a segundo plano (no oculta la ventana de vídeo). */
  hide(): void;
  exit(): void;
}

interface TizenApplicationApi {
  launch(appId: string, success?: () => void, error?: (error: Error) => void): void;
  getAppsInfo(success: (apps: TizenApplicationInformation[]) => void, error?: (error: Error) => void): void;
  getCurrentApplication(): TizenCurrentApplication;
  exit(): void;
}

interface TizenApplicationInformation {
  id: string;
  name: string;
  iconPath?: string;
  version?: string;
  show?: boolean;
}

interface VideoSource {
  type: string;
  number: number;
  signal: boolean | null;
  editName: string | null;
}

interface VideoSourceGroup {
  connected: VideoSource[];
  disconnected: VideoSource[];
}

interface TizenSystemInfoApi {
  getPropertyValue(property: "VIDEOSOURCE", success: (source: VideoSourceGroup) => void, error?: (error: Error) => void): void;
  getPropertyValueArray(property: "VIDEOSOURCE", success: (sources: VideoSourceGroup[]) => void, error?: (error: Error) => void): void;
}

interface TizenTvWindowApi {
  setSource(source: VideoSource, success: () => void, error?: (error: Error) => void, type?: "MAIN" | "SUB"): void;
  show(success: () => void, error?: (error: Error) => void, rectangle?: string[], type?: "MAIN", zPosition?: "FRONT" | "BEHIND"): void;
  hide(success: () => void, error?: (error: Error) => void, type?: "MAIN"): void;
}

interface TizenGlobal {
  application: TizenApplicationApi;
  systeminfo: TizenSystemInfoApi;
  tvwindow: TizenTvWindowApi;
}

interface Window {
  tizen?: TizenGlobal;
  webapis?: {
    appcommon?: {
      registerKey(keyNames: string[]): boolean;
      generateKey(keyName: string): void;
    };
  };
}

declare module "*.css";

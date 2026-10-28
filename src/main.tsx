import ReactDOM from "react-dom/client";
import { Launcher } from "./Launcher";
import "./styles.css";

// El primer frame es lo que mide la latencia Home→HomePunk: montamos la UI sin
// arrancar telemetría/diagnostics en producción (menos trabajo al inicio).
ReactDOM.createRoot(document.getElementById("root")!).render(<Launcher />);

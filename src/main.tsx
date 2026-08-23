import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import Home from "../app/page";
import MultiplayerApp from "./MultiplayerApp";

function App() {
  const [online, setOnline] = useState(false);
  return online ? <MultiplayerApp onExit={() => setOnline(false)} /> : <Home onOnline={() => setOnline(true)} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

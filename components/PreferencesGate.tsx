"use client";
import { useEffect, useState, type ReactNode } from "react";
import { initializePreferences, retryPreferences, hasPendingPreferences } from "@/lib/preferences-client";

export default function PreferencesGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const load = () => { setError(""); void initializePreferences().then(() => setReady(true)).catch(error => setError(String(error))); };
  useEffect(() => {
    load();
    const status = (event: Event) => setError((event as CustomEvent<string>).detail);
    const leave = (event: BeforeUnloadEvent) => { if (hasPendingPreferences()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("preferences-status", status);
    window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("preferences-status", status); window.removeEventListener("beforeunload", leave); };
  }, []);
  return <>
    {error && <div role="alert" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999, padding: 12, background: "#762424", color: "white" }}>
      Configuracion sin sincronizar: {error}. No cierres esta pagina.
      <button type="button" onClick={ready ? retryPreferences : load}>Reintentar</button>
    </div>}
    {ready ? children : (
      <main className="preferences-loading" role="status" aria-live="polite">
        <div className="preferences-loading-card">
          <span>Cargando configuracion...</span>
          <div className="panel-loading-bar" />
        </div>
      </main>
    )}
  </>;
}

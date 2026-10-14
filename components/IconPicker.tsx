"use client";
import { useEffect, useState } from "react";
import { MdChevronLeft, MdChevronRight, MdSearch, MdRefresh } from "react-icons/md";
import type { CatalogIcon } from "@/lib/icon-catalog";
import type { IconReference } from "@/lib/macro-widgets";
import WidgetDialog from "@/components/WidgetDialog";
import RichTooltip from "@/components/RichTooltip";
import LibraryIcon, { cacheIcons, IconDrawing } from "@/components/LibraryIcon";

export default function IconPicker({ value, onSelect, onClose, apiBase = "", locale = "es" }: {
  value: IconReference; onSelect: (icon: IconReference) => void; onClose: () => void; apiBase?: string; locale?: string;
}) {
  const es = locale.startsWith("es");
  const [collections, setCollections] = useState<{ id: string; name: string; license: string; licenseUrl: string }[]>([]);
  const [collection, setCollection] = useState(value.collection);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ icons: CatalogIcon[]; total: number } | null>(null);
  const [selected, setSelected] = useState(value);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/api/icons`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setCollections(payload.collections);
    }).catch((failure) => { if (!controller.signal.aborted) setError(String(failure.message)); });
    return () => controller.abort();
  }, [apiBase, retry]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      fetch(`${apiBase}/api/icons?${new URLSearchParams({ collection, q: search, page: String(page) })}`, { signal: controller.signal }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        cacheIcons(apiBase, collection, payload.icons);
        setResult(payload); setLoading(false);
      }).catch((failure) => { if (!controller.signal.aborted) { setError(String(failure.message)); setLoading(false); } });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [apiBase, collection, search, page, retry]);
  const pack = collections.find((item) => item.id === collection);
  return <WidgetDialog title={es ? "Seleccionar icono" : "Select icon"} onClose={onClose} className="icon-picker" footer={<>
    <span className="icon-picker-selection"><LibraryIcon apiBase={apiBase} icon={selected} /><span>{selected.name}</span></span>
    <button type="button" className="dialog-button" onClick={onClose}>{es ? "Cancelar" : "Cancel"}</button>
    <button type="button" className="dialog-button primary" onClick={() => onSelect(selected)}>{es ? "Seleccionar" : "Select"}</button>
  </>}>
    <div className="icon-picker-filters"><label>{es ? "Coleccion" : "Collection"}<select value={collection} onChange={(event) => { setCollection(event.target.value); setPage(0); setResult(null); }}>
      {!collections.length && <option value={collection}>{collection}</option>}
      {collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label><label>{es ? "Buscar icono" : "Search icons"}<span className="icon-search"><MdSearch /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></span></label></div>
    {error && <p role="alert" className="macro-widget-error">{error} <button type="button" onClick={() => setRetry((item) => item + 1)} aria-label={es ? "Reintentar" : "Retry"}><MdRefresh /></button></p>}
    <div className="icon-picker-grid" aria-busy={loading}>
      {loading ? <p role="status">{es ? "Cargando..." : "Loading..."}</p> : !result?.icons.length ? <p>{es ? "Sin resultados" : "No results"}</p> : result.icons.map((icon) => <RichTooltip key={icon.name} content={icon.name}>
        <button type="button" aria-label={icon.name} aria-pressed={selected.collection === collection && selected.name === icon.name} onClick={() => setSelected({ collection, name: icon.name })}><IconDrawing icon={icon} /></button>
      </RichTooltip>)}
    </div>
    <div className="icon-picker-pagination"><span>{result?.total ?? 0} {es ? "iconos" : "icons"}</span>
      <button type="button" disabled={loading || page === 0} onClick={() => setPage((item) => item - 1)} aria-label={es ? "Anterior" : "Previous"}><MdChevronLeft /></button>
      <span>{page + 1} / {Math.max(1, Math.ceil((result?.total ?? 0) / 60))}</span>
      <button type="button" disabled={loading || (page + 1) * 60 >= (result?.total ?? 0)} onClick={() => setPage((item) => item + 1)} aria-label={es ? "Siguiente" : "Next"}><MdChevronRight /></button>
    </div>
    {pack && <a className="icon-picker-license" href={pack.licenseUrl} target="_blank" rel="noreferrer">{pack.name}: {pack.license}</a>}
  </WidgetDialog>;
}

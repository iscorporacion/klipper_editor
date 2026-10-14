"use client";
import { createElement, useEffect, useState } from "react";
import { MdHelpOutline } from "react-icons/md";
import type { CatalogIcon } from "@/lib/icon-catalog";
import type { IconReference } from "@/lib/macro-widgets";

const cache = new Map<string, CatalogIcon>();
const requests = new Map<string, Promise<CatalogIcon>>();
export function cacheIcons(apiBase: string, collection: string, icons: CatalogIcon[]) {
  icons.forEach((icon) => cache.set(`${apiBase}/${collection}/${icon.name}`, icon));
}
export function IconDrawing({ icon }: { icon: CatalogIcon }) {
  function draw(nodes: CatalogIcon["children"]): ReturnType<typeof createElement>[] {
    return nodes.map((node, key) => createElement(node.tag, { ...node.attr, key }, ...draw(node.children)));
  }
  return <svg stroke="currentColor" fill="currentColor" strokeWidth="0" {...icon.attr} width="1em" height="1em" aria-hidden="true">{draw(icon.children)}</svg>;
}
export default function LibraryIcon({ icon, apiBase = "" }: { icon: IconReference; apiBase?: string }) {
  const key = `${apiBase}/${icon.collection}/${icon.name}`;
  const [loaded, setLoaded] = useState<{ key: string; icon: CatalogIcon } | null>(null);
  useEffect(() => {
    let active = true;
    if (cache.has(key)) { setLoaded({ key, icon: cache.get(key)! }); return; }
    let request = requests.get(key);
    if (!request) {
      request = fetch(`${apiBase}/api/icons?${new URLSearchParams({ collection: icon.collection, name: icon.name })}`).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        cache.set(key, payload.icon);
        return payload.icon as CatalogIcon;
      }).finally(() => requests.delete(key));
      requests.set(key, request);
    }
    request.then((value) => { if (active) setLoaded({ key, icon: value }); }).catch(() => {});
    return () => { active = false; };
  }, [key, apiBase, icon.collection, icon.name]);
  const value = cache.get(key) ?? (loaded?.key === key ? loaded.icon : null);
  return value ? <IconDrawing icon={value} /> : <MdHelpOutline />;
}

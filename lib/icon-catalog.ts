import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";

type IconNode = { tag: string; attr: Record<string, unknown>; children: IconNode[] };
type SourceIcon = { tag: string; attr: Record<string, unknown>; child: SourceIcon[] };
export type CatalogIcon = { name: string; attr: Record<string, unknown>; children: IconNode[] };
const root = path.join(process.cwd(), "node_modules", "react-icons");
function loadGeneratedModule(filename: string) {
  const module = { exports: {} as Record<string, unknown> };
  // Extract native geometry from the installed generated modules without loading React or every icon into the client.
  runInNewContext(readFileSync(path.join(root, filename), "utf8"), {
    module, require: (name: string) => {
      if (name !== "../lib") throw new Error("Unsupported icon dependency");
      return { GenIcon: (data: SourceIcon) => () => data };
    }
  }, { timeout: 5000 });
  return module.exports;
}
export const iconCollections = loadGeneratedModule("lib/iconsManifest.js").IconsManifest as { id: string; name: string; license: string; licenseUrl: string }[];
const packs = new Map<string, Record<string, (props: object) => SourceIcon>>();
export function getIconPack(collection: string) {
  if (!iconCollections.some((item) => item.id === collection)) throw new Error("Unknown icon collection");
  let pack = packs.get(collection);
  if (!pack) {
    pack = loadGeneratedModule(`${collection}/index.js`) as Record<string, (props: object) => SourceIcon>;
    if (packs.size >= 3) packs.delete(packs.keys().next().value!);
    packs.set(collection, pack!);
  }
  return pack!;
}
export function catalogIcon(collection: string, name: string): CatalogIcon {
  const pack = getIconPack(collection);
  if (!Object.hasOwn(pack, name) || typeof pack[name] !== "function") throw new Error("Unknown icon");
  const data = pack[name]({});
  function children(nodes: SourceIcon[]): IconNode[] {
    return nodes.map((node) => ({ tag: node.tag, attr: node.attr, children: children(node.child ?? []) }));
  }
  return { name, attr: data.attr, children: children(data.child ?? []) };
}

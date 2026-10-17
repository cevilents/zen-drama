// Live check for the Narto channel. Usage: node test-narto.mjs [provider ...]
import * as narto from "./lib/narto.mjs";

const providers = process.argv.slice(2).length ? process.argv.slice(2) : ["reelshort", "goodshort"];

for (const source of providers) {
  console.log(`\n=== ${source} ===`);
  try {
    const l = await narto.list(source, "trending", 1).catch((e) => ({ items: [], err: e.message }));
    console.log(`list: ${l.items.length}${l.err ? " ERR " + l.err : ""} | first: ${l.items[0]?.title ?? "-"} (${l.items[0]?.id ?? "-"})`);
    const s = await narto.search(source, "love");
    console.log(`search: ${s.items.length} | first: ${s.items[0]?.title ?? "-"} (${s.items[0]?.id ?? "-"})`);
    const id = (s.items[0] || l.items[0])?.id;
    if (!id) {
      console.log("no usable id");
      continue;
    }
    const d = await narto.detail(source, id);
    console.log(`detail: ${d.title} | eps: ${d.episodes.length} | ep1: ${JSON.stringify(d.episodes[0])}`);
    const e = await narto.episode(source, id, 1);
    console.log(`episode: ${e.type} ${e.url.slice(0, 80)}`);
  } catch (err) {
    console.log(`ERR: ${err.message}`);
  }
}

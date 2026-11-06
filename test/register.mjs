// Loaded with `node --import`. Points `import ... from "obsidian"` at our stand-in and
// gives the code the `window` it expects, so the plugin can run under plain Node.
import { register } from "node:module";

globalThis.window = globalThis;
register("./loader.mjs", import.meta.url);

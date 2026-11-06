export async function resolve(specifier, context, nextResolve) {
	if (specifier === "obsidian") {
		return { url: new URL("./stub-obsidian.mjs", import.meta.url).href, shortCircuit: true };
	}
	return nextResolve(specifier, context);
}

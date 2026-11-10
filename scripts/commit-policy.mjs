export function isInternalPath(path) {
  const normalized = path.replaceAll("\\", "/");
  return (
    /^docs\/(?!public\/)/i.test(normalized) ||
    /^CONTRIBUTING\.md$/i.test(normalized) ||
    /(^|\/)(verification|verficaction|memory|memories|decision|decisions|\.agent|\.agents|\.codex|\.harness|\.cache)(\/|$)/i.test(
      normalized,
    ) ||
    /(^|\/)MEMORY\.md$/i.test(normalized)
  );
}

/** Stable hue from string for avatar background. */
export function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

/**
 * Avatar label: first character of the first word (Unicode-safe).
 * Example: "Alice Bob" → "A", "芦苇 社会人" → "芦"
 */
export function avatarFor(nickname: string): { initials: string; bg: string } {
  const trimmed = nickname.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  let label: string
  if (parts.length === 0) {
    label = '?'
  } else {
    const firstWord = parts[0]!
    const ch = [...firstWord][0]
    label = ch ? ch.toLocaleUpperCase() : '?'
  }

  const h = hashString(trimmed.toLowerCase())
  const hue = h % 360
  const bg = `hsl(${hue} 70% 40%)`
  return { initials: label, bg }
}

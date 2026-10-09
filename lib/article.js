/**
 * "A" or "An" before a number as it is read aloud: an 8-week, an 11-week,
 * an 18-week, an 80-week; a 6-week, a 12-week. Pure.
 */
export function aOrAn(n, capital = true) {
  const s = String(Math.round(Math.abs(Number(n))))
  const an = /^8/.test(s) || /^1[18]$/.test(s) || /^1[18]\d{3}$/.test(s)
  const word = an ? 'an' : 'a'
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word
}

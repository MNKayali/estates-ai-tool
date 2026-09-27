/**
 * lib/saveBlob.js — save a fetched file (the PDF or Word report) in the browser.
 * Browser only.
 *
 * The object URL is revoked after a delay, not straight after click(): the
 * download starts asynchronously, and Firefox and Safari can cancel it when the
 * URL is revoked in the same tick.
 */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

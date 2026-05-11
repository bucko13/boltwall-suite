export async function copyUrl(url = window.location.href) {
  await navigator.clipboard.writeText(url);
  return url;
}

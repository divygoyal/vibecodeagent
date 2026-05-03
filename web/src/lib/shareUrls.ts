// Helpers for building public share / embed URLs and snippets for a dashboard share token.
// `/view/[token]` is the public render path used by the custom-dashboard share system.

const FALLBACK_ORIGIN = 'https://trafficclaw.com';

function origin(): string {
  if (typeof window === 'undefined') return FALLBACK_ORIGIN;
  return window.location.origin;
}

export function getPublicShareUrl(token: string): string {
  return `${origin()}/view/${token}`;
}

export function getEmbedUrl(token: string): string {
  return `${getPublicShareUrl(token)}?embed=true`;
}

export function getEmbedIframeSnippet(token: string, height = 800): string {
  return `<iframe src="${getEmbedUrl(token)}" width="100%" height="${height}" frameborder="0" style="border:none;border-radius:12px;max-width:100%;" loading="lazy" allowtransparency="true"></iframe>`;
}

export function getEmbedScriptSnippet(token: string, height = 800): string {
  const slug = token.slice(0, 8);
  return `<div id="tc-dashboard-${slug}"></div>
<script>
(function(){var d=document.getElementById("tc-dashboard-${slug}");var i=document.createElement("iframe");i.src="${getEmbedUrl(token)}";i.style.cssText="width:100%;height:${height}px;border:none;border-radius:12px;";i.loading="lazy";i.allowTransparency=true;d.appendChild(i);})();
</script>`;
}

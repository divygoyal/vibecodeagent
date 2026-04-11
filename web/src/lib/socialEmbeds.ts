export type XWidgetVisibleCards = 1 | 2 | 3 | 4;

export interface XWidgetConfig {
    visibleCards: XWidgetVisibleCards;
}

export interface SocialEmbedTokenRecord {
    token: string;
    platform: string;
    domain: string;
    source_site_url: string | null;
    label: string | null;
    is_active: boolean;
    created_at: string | null;
    last_used_at: string | null;
    config: XWidgetConfig;
}

export const DEFAULT_X_WIDGET_CONFIG: XWidgetConfig = {
    visibleCards: 3,
};

export function normalizeXWidgetConfig(input: unknown): XWidgetConfig {
    if (!input || typeof input !== 'object') {
        return DEFAULT_X_WIDGET_CONFIG;
    }

    const candidate = input as Partial<XWidgetConfig> & {
        tweetCount?: unknown;
        visibleCards?: unknown;
    };
    const requestedVisibleCards = Number(candidate.visibleCards);
    const legacyTweetCount = Number(candidate.tweetCount);

    let visibleCards: XWidgetVisibleCards = 3;
    if (requestedVisibleCards === 1 || requestedVisibleCards === 2 || requestedVisibleCards === 3 || requestedVisibleCards === 4) {
        visibleCards = requestedVisibleCards;
    } else if (legacyTweetCount === 1 || legacyTweetCount === 2 || legacyTweetCount === 3 || legacyTweetCount === 4) {
        visibleCards = legacyTweetCount;
    }

    return {
        visibleCards,
    };
}

export function serializeXWidgetConfig(config?: Partial<XWidgetConfig> | null): XWidgetConfig {
    return normalizeXWidgetConfig(config);
}

export function buildXEmbedCode({
    token,
    origin,
}: {
    token: string;
    origin: string;
}) {
    const embedUrl = `${origin}/embed/x/${token}`;
    const frameId = `trafficclaw-x-${token.slice(0, 12)}`;

    return `<!-- TrafficClaw X mentions widget -->
<iframe
  id="${frameId}"
  src="${embedUrl}"
  width="100%"
  height="620"
  frameborder="0"
  loading="lazy"
  style="width:100%;max-width:1460px;display:block;margin:0 auto;border:0;overflow:hidden;border-radius:18px;background:#05080d;"
></iframe>
<script>
(function() {
  var iframe = document.getElementById('${frameId}');
  if (!iframe) return;
  window.addEventListener('message', function(event) {
    if (event.origin !== '${origin}') return;
    var data = event.data || {};
    if (data.type === 'trafficclaw:x-embed-resize' && data.token === '${token}') {
      var nextHeight = Math.max(360, Number(data.height) || 0);
      iframe.style.height = nextHeight + 'px';
    }
  });
})();
</script>`;
}

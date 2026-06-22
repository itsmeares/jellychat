using System;
using System.Globalization;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Applies web content transformations for JellyChat.
/// </summary>
public static class JellyChatWebTransformer
{
    private const string JellyChatAssetMarker = "<!-- JellyChat React assets -->";

    /// <summary>
    /// Injects JellyChat assets into jellyfin-web index page.
    /// </summary>
    /// <param name="payload">The transformation payload.</param>
    /// <returns>The transformed index.html content.</returns>
    public static string TransformIndexHtml(WebContentTransformPayload payload)
    {
        if (payload.Contents.Contains(JellyChatAssetMarker, StringComparison.Ordinal))
        {
            return payload.Contents;
        }

        string version = typeof(JellyChatWebTransformer).Assembly.GetName().Version?.ToString() ?? "0.0.0";
        string cssHref = string.Format(CultureInfo.InvariantCulture, "/web/ConfigurationPage?name=jellychat.css&v={0}", Uri.EscapeDataString(version));
        string scriptSrc = string.Format(CultureInfo.InvariantCulture, "/web/ConfigurationPage?name=jellychat.js&v={0}", Uri.EscapeDataString(version));
        string assets = string.Format(
            CultureInfo.InvariantCulture,
            "{0}<link rel=\"stylesheet\" data-jellychat-style=\"true\" href=\"{1}\"><script defer data-jellychat-script=\"true\" data-jellychat-api=\"JellyChat/Events\" src=\"{2}\"></script>",
            JellyChatAssetMarker,
            cssHref,
            scriptSrc);

        if (payload.Contents.Contains("</head>", StringComparison.OrdinalIgnoreCase))
        {
            return payload.Contents.Replace("</head>", string.Format(CultureInfo.InvariantCulture, "{0}</head>", assets), StringComparison.OrdinalIgnoreCase);
        }

        return payload.Contents.Replace("</body>", string.Format(CultureInfo.InvariantCulture, "{0}</body>", assets), StringComparison.OrdinalIgnoreCase);
    }
}

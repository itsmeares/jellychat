using System;
using System.Globalization;
using System.IO;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Applies web content transformations for JellyChat.
/// </summary>
public static class JellyChatWebTransformer
{
    private const string JellyChatScriptMarker = "<!-- JellyChat jellychat.js -->";

    /// <summary>
    /// Injects JellyChat script into jellyfin-web index page.
    /// </summary>
    /// <param name="payload">The transformation payload.</param>
    /// <returns>The transformed index.html content.</returns>
    public static string TransformIndexHtml(WebContentTransformPayload payload)
    {
        if (payload.Contents.Contains(JellyChatScriptMarker, StringComparison.Ordinal))
        {
            return payload.Contents;
        }

        string scriptContent = GetJellyChatScript();
        if (string.IsNullOrEmpty(scriptContent))
        {
            return payload.Contents;
        }

        string injectedScript = string.Format(CultureInfo.InvariantCulture, "{0}<script>{1}</script>", JellyChatScriptMarker, scriptContent);

        return payload.Contents.Replace("</body>", string.Format(CultureInfo.InvariantCulture, "{0}</body>", injectedScript), StringComparison.Ordinal);
    }

    /// <summary>
    /// Returns embedded jellychat.js content for plugin web path.
    /// </summary>
    /// <returns>Script content.</returns>
    public static string GetJellyChatScript()
    {
        const string resourcePath = "Jellyfin.Plugin.JellyChat.Web.jellychat.js";
        using Stream? stream = typeof(JellyChatWebTransformer).Assembly.GetManifestResourceStream(resourcePath);
        if (stream is null)
        {
            return string.Empty;
        }

        using StreamReader reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}

using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Injects JellyChat external assets into safe Jellyfin Web entry HTML responses.
/// </summary>
public sealed class JellyChatWebInjectionMiddleware
{
    private static readonly Encoding HtmlEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

    private static readonly Regex MarkerBlockRegex = new(
        @"<!--\s*JellyChat:start\b.*?<!--\s*JellyChat:end\s*-->",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant);

    private static readonly Regex LegacyAssetsRegex = new(
        @"<!--\s*JellyChat React assets\s*-->\s*<link\b[^>]*\bdata-jellychat-style=""true""[^>]*>\s*<script\b[^>]*\bdata-jellychat-script=""true""[^>]*>\s*</script>\s*",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant);

    private static readonly Regex JellyChatCssTagRegex = new(
        @"<link\b[^>]*\bhref=""[^""]*/JellyChat/Assets/jellychat\.css\?v=[^""]*""[^>]*>\s*",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant);

    private static readonly Regex JellyChatAppearanceCssTagRegex = new(
        @"<link\b[^>]*\bhref=""[^""]*/JellyChat/Assets/appearance\.css\?v=[^""]*""[^>]*>\s*",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant);

    private static readonly Regex JellyChatCustomCssTagRegex = new(
        @"<link\b[^>]*\bhref=""[^""]*/JellyChat/Assets/custom\.css\?v=[^""]*""[^>]*>\s*",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant);

    private static readonly Regex JellyChatScriptTagRegex = new(
        @"<script\b[^>]*\bsrc=""[^""]*/JellyChat/Assets/jellychat\.js\?v=[^""]*""[^>]*>\s*</script>\s*",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant);

    private readonly RequestDelegate _next;
    private readonly JellyChatAssetProvider _assetProvider;
    private readonly ILogger<JellyChatWebInjectionMiddleware> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatWebInjectionMiddleware"/> class.
    /// </summary>
    /// <param name="next">The next middleware.</param>
    /// <param name="assetProvider">JellyChat asset provider.</param>
    /// <param name="logger">Logger instance.</param>
    public JellyChatWebInjectionMiddleware(
        RequestDelegate next,
        JellyChatAssetProvider assetProvider,
        ILogger<JellyChatWebInjectionMiddleware> logger)
    {
        _next = next;
        _assetProvider = assetProvider;
        _logger = logger;
    }

    /// <summary>
    /// Handles the current request.
    /// </summary>
    /// <param name="context">The current HTTP context.</param>
    /// <returns>A task representing the asynchronous operation.</returns>
    public async Task InvokeAsync(HttpContext context)
    {
        if (!ShouldInspectRequest(context.Request))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        IHeaderDictionary requestHeaders = context.Request.Headers;
        HeaderSnapshot acceptEncoding = RemoveRequestHeader(requestHeaders, "Accept-Encoding");
        HeaderSnapshot ifNoneMatch = RemoveRequestHeader(requestHeaders, "If-None-Match");
        HeaderSnapshot ifModifiedSince = RemoveRequestHeader(requestHeaders, "If-Modified-Since");

        Stream originalBody = context.Response.Body;
        using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await _next(context).ConfigureAwait(false);
            buffer.Position = 0;
            context.Response.Body = originalBody;

            if (!ShouldTransformResponse(context.Response))
            {
                await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
                return;
            }

            string html;
            using (var reader = new StreamReader(buffer, HtmlEncoding, detectEncodingFromByteOrderMarks: true, bufferSize: 4096, leaveOpen: true))
            {
                html = await reader.ReadToEndAsync().ConfigureAwait(false);
            }

            if (!TryInjectAssets(html, context.Request.Path.Value ?? string.Empty, ResolveAssetPathBase(context.Request), out string transformedHtml))
            {
                byte[] originalBytes = HtmlEncoding.GetBytes(html);
                context.Response.ContentLength = originalBytes.Length;
                await originalBody.WriteAsync(originalBytes).ConfigureAwait(false);
                return;
            }

            byte[] responseBytes = HtmlEncoding.GetBytes(transformedHtml);
            RewriteHtmlCacheHeaders(context.Response, responseBytes.Length);
            await originalBody.WriteAsync(responseBytes).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            context.Response.Body = originalBody;
            _logger.LogError(ex, "Failed to inject JellyChat assets into Jellyfin Web HTML.");
            throw;
        }
        finally
        {
            RestoreRequestHeader(requestHeaders, acceptEncoding);
            RestoreRequestHeader(requestHeaders, ifNoneMatch);
            RestoreRequestHeader(requestHeaders, ifModifiedSince);
            context.Response.Body = originalBody;
        }
    }

    private static bool ShouldInspectRequest(HttpRequest request)
    {
        if (!HttpMethods.IsGet(request.Method))
        {
            return false;
        }

        string path = request.Path.Value ?? string.Empty;
        return TryInferPathBaseFromWebPath(path, out _);
    }

    private static bool ShouldTransformResponse(HttpResponse response)
    {
        if (response.StatusCode < StatusCodes.Status200OK || response.StatusCode >= StatusCodes.Status300MultipleChoices)
        {
            return false;
        }

        string contentType = response.ContentType ?? string.Empty;
        return contentType.StartsWith("text/html", StringComparison.OrdinalIgnoreCase);
    }

    private bool TryInjectAssets(string html, string path, string assetPathBase, out string transformedHtml)
    {
        transformedHtml = html;
        int bodyIndex = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (bodyIndex < 0)
        {
            _logger.LogWarning("JellyChat could not inject assets into {Path} because </body> was not found.", path);
            return false;
        }

        string withoutJellyChat = RemoveExistingJellyChatAssets(html);
        bodyIndex = withoutJellyChat.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (bodyIndex < 0)
        {
            _logger.LogWarning("JellyChat could not inject assets into {Path} after removing stale marker blocks because </body> was not found.", path);
            return false;
        }

        string version = _assetProvider.AssetVersion;
        string encodedVersion = Uri.EscapeDataString(version);
        string appearanceVersion = Uri.EscapeDataString(_assetProvider.GetAppearanceAsset().Version);
        string customCssVersion = Uri.EscapeDataString(_assetProvider.GetCustomCssAsset().Version);
        string stylesheetUrl = BuildAssetUrl(assetPathBase, "jellychat.css", encodedVersion);
        string appearanceStylesheetUrl = BuildAssetUrl(assetPathBase, "appearance.css", appearanceVersion);
        string customCssStylesheetUrl = BuildAssetUrl(assetPathBase, "custom.css", customCssVersion);
        string scriptUrl = BuildAssetUrl(assetPathBase, "jellychat.js", encodedVersion);
        string assetBlock = string.Format(
            CultureInfo.InvariantCulture,
            "{0}<!-- JellyChat:start v{1} -->{0}<link rel=\"stylesheet\" href=\"{2}\" data-jellychat-style=\"true\">{0}<link rel=\"stylesheet\" href=\"{3}\" data-jellychat-appearance=\"true\">{0}<link rel=\"stylesheet\" href=\"{4}\" data-jellychat-custom=\"true\" disabled>{0}<script defer src=\"{5}\" data-jellychat-script=\"true\"></script>{0}<!-- JellyChat:end -->{0}",
            Environment.NewLine,
            version,
            stylesheetUrl,
            appearanceStylesheetUrl,
            customCssStylesheetUrl,
            scriptUrl);

        transformedHtml = string.Concat(
            withoutJellyChat.AsSpan(0, bodyIndex),
            assetBlock,
            withoutJellyChat.AsSpan(bodyIndex));
        return true;
    }

    private static string ResolveAssetPathBase(HttpRequest request)
    {
        if (request.PathBase.HasValue)
        {
            return NormalizePathBase(request.PathBase.Value ?? string.Empty);
        }

        return TryInferPathBaseFromWebPath(request.Path.Value ?? string.Empty, out string inferredPathBase)
            ? inferredPathBase
            : string.Empty;
    }

    private static bool TryInferPathBaseFromWebPath(string path, out string pathBase)
    {
        pathBase = string.Empty;
        string normalizedPath = path.TrimEnd('/');
        if (string.Equals(normalizedPath, "/web", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        const string WebIndexSuffix = "/web/index.html";
        if (normalizedPath.EndsWith(WebIndexSuffix, StringComparison.OrdinalIgnoreCase))
        {
            pathBase = NormalizePathBase(normalizedPath[..^WebIndexSuffix.Length]);
            return true;
        }

        const string WebSuffix = "/web";
        if (normalizedPath.EndsWith(WebSuffix, StringComparison.OrdinalIgnoreCase))
        {
            pathBase = NormalizePathBase(normalizedPath[..^WebSuffix.Length]);
            return true;
        }

        return false;
    }

    private static string NormalizePathBase(string pathBase)
    {
        string normalizedPathBase = pathBase.TrimEnd('/');
        return string.Equals(normalizedPathBase, "/", StringComparison.Ordinal) ? string.Empty : normalizedPathBase;
    }

    private static string BuildAssetUrl(string assetPathBase, string assetName, string encodedVersion)
    {
        string normalizedPathBase = NormalizePathBase(assetPathBase);
        return string.Concat(normalizedPathBase, "/JellyChat/Assets/", assetName, "?v=", encodedVersion);
    }

    private static string RemoveExistingJellyChatAssets(string html)
    {
        string withoutMarkerBlocks = MarkerBlockRegex.Replace(html, string.Empty);
        string withoutLegacyBlock = LegacyAssetsRegex.Replace(withoutMarkerBlocks, string.Empty);
        string withoutCssTags = JellyChatCssTagRegex.Replace(withoutLegacyBlock, string.Empty);
        string withoutAppearanceCssTags = JellyChatAppearanceCssTagRegex.Replace(withoutCssTags, string.Empty);
        string withoutCustomCssTags = JellyChatCustomCssTagRegex.Replace(withoutAppearanceCssTags, string.Empty);
        return JellyChatScriptTagRegex.Replace(withoutCustomCssTags, string.Empty);
    }

    private static void RewriteHtmlCacheHeaders(HttpResponse response, long contentLength)
    {
        response.Headers.Remove("Content-Encoding");
        response.Headers.Remove("ETag");
        response.Headers.Remove("Last-Modified");
        response.Headers.CacheControl = "no-cache";
        response.ContentLength = contentLength;
    }

    private static HeaderSnapshot RemoveRequestHeader(IHeaderDictionary headers, string name)
    {
        bool existed = headers.TryGetValue(name, out StringValues value);
        if (existed)
        {
            headers.Remove(name);
        }

        return new HeaderSnapshot(name, existed, value);
    }

    private static void RestoreRequestHeader(IHeaderDictionary headers, HeaderSnapshot snapshot)
    {
        if (snapshot.Existed)
        {
            headers[snapshot.Name] = snapshot.Value;
        }
        else
        {
            headers.Remove(snapshot.Name);
        }
    }

    private readonly record struct HeaderSnapshot(string Name, bool Existed, StringValues Value);
}

using Jellyfin.Plugin.JellyChat.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// JellyChat frontend asset endpoints.
/// </summary>
[ApiController]
[Route("JellyChat/Assets")]
[AllowAnonymous]
public sealed class JellyChatAssetsController : ControllerBase
{
    private readonly JellyChatAssetProvider _assetProvider;
    private readonly ILogger<JellyChatAssetsController> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatAssetsController"/> class.
    /// </summary>
    /// <param name="assetProvider">JellyChat asset provider.</param>
    /// <param name="logger">Logger instance.</param>
    public JellyChatAssetsController(JellyChatAssetProvider assetProvider, ILogger<JellyChatAssetsController> logger)
    {
        _assetProvider = assetProvider;
        _logger = logger;
    }

    /// <summary>
    /// Gets a known JellyChat frontend asset.
    /// </summary>
    /// <param name="assetName">The requested asset name.</param>
    /// <param name="version">Optional cache-busting asset version.</param>
    /// <returns>The requested asset, or 404 when unavailable.</returns>
    [HttpGet("{assetName}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetAsset([FromRoute] string assetName, [FromQuery(Name = "v")] string? version)
    {
        if (string.Equals(assetName, "appearance.css", System.StringComparison.OrdinalIgnoreCase))
        {
            JellyChatAppearanceAsset appearance = _assetProvider.GetAppearanceAsset();
            Response.Headers["X-Content-Type-Options"] = "nosniff";
            Response.Headers.CacheControl = string.Equals(version, appearance.Version, System.StringComparison.Ordinal)
                ? "public, max-age=31536000, immutable"
                : "no-cache";
            return File(appearance.Content, "text/css; charset=utf-8");
        }

        if (!_assetProvider.TryOpenAsset(assetName, out var stream, out string contentType, out string resourceName) || stream is null)
        {
            _logger.LogWarning("JellyChat asset {AssetName} could not be found in embedded resources.", assetName);
            return NotFound();
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers.CacheControl = string.Equals(version, _assetProvider.AssetVersion, System.StringComparison.Ordinal)
            ? "public, max-age=31536000, immutable"
            : "no-cache";
        if (_logger.IsEnabled(LogLevel.Debug))
        {
            _logger.LogDebug("Serving JellyChat asset {AssetName} from {ResourceName}.", assetName, resourceName);
        }

        return File(stream, contentType);
    }
}

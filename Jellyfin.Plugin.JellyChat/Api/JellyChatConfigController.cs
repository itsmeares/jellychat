using Jellyfin.Plugin.JellyChat.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// Serves the server defaults the web client needs.
/// </summary>
[ApiController]
[Route("JellyChat")]
[Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class JellyChatConfigController : ControllerBase
{
    /// <summary>
    /// Gets the server defaults for theme, layout and behavior.
    /// </summary>
    /// <returns>The client configuration.</returns>
    [HttpGet("Config")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<JellyChatClientConfig> GetConfig()
    {
        var configuration = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        return Ok(JellyChatClientConfig.From(configuration));
    }
}

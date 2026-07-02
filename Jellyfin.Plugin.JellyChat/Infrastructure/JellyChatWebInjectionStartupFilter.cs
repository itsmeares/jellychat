using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Adds JellyChat self-contained web injection middleware to the Jellyfin pipeline.
/// </summary>
public sealed class JellyChatWebInjectionStartupFilter : IStartupFilter
{
    private readonly ILogger<JellyChatWebInjectionStartupFilter> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatWebInjectionStartupFilter"/> class.
    /// </summary>
    /// <param name="logger">Logger instance.</param>
    public JellyChatWebInjectionStartupFilter(ILogger<JellyChatWebInjectionStartupFilter> logger)
    {
        _logger = logger;
    }

    /// <inheritdoc />
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return builder =>
        {
            builder.UseMiddleware<JellyChatWebInjectionMiddleware>();
            _logger.LogInformation("Registered JellyChat self-contained web injection middleware.");
            next(builder);
        };
    }
}

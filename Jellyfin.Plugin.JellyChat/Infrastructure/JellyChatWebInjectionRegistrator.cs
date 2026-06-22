using System;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Registers JellyChat web transformations.
/// </summary>
public class JellyChatWebInjectionRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<JellyChatEventStore>();
        serviceCollection.AddHostedService<JellyChatWebInjectionStartupService>();
    }
}

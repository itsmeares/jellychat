using System;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Registers JellyChat web services.
/// </summary>
public class JellyChatWebInjectionRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<JellyChatEventStore>();
        serviceCollection.AddSingleton<JellyChatAssetProvider>();
        serviceCollection.AddSingleton<IStartupFilter, JellyChatWebInjectionStartupFilter>();
    }
}

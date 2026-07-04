using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Resolves JellyChat embedded web assets.
/// </summary>
public sealed class JellyChatAssetProvider
{
    private static readonly Assembly PluginAssembly = typeof(JellyChatAssetProvider).Assembly;
    private static readonly Dictionary<string, JellyChatAssetDefinition> Assets = new(StringComparer.OrdinalIgnoreCase)
    {
        ["jellychat.css"] = new JellyChatAssetDefinition("Jellyfin.Plugin.JellyChat.Web.jellychat.css", "text/css"),
        ["jellychat.js"] = new JellyChatAssetDefinition("Jellyfin.Plugin.JellyChat.Web.jellychat.js", "application/javascript")
    };

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatAssetProvider"/> class.
    /// </summary>
    public JellyChatAssetProvider()
    {
        PluginVersion = ResolvePluginVersion();
        AssetVersion = ResolveAssetVersion(PluginVersion);
    }

    /// <summary>
    /// Gets the plugin version used for cache-busting asset URLs.
    /// </summary>
    public string PluginVersion { get; }

    /// <summary>
    /// Gets the content-aware asset version used for cache-busting asset URLs.
    /// </summary>
    public string AssetVersion { get; }

    /// <summary>
    /// Opens a known JellyChat asset.
    /// </summary>
    /// <param name="assetName">The requested asset name.</param>
    /// <param name="stream">The opened embedded resource stream.</param>
    /// <param name="contentType">The asset content type.</param>
    /// <param name="resourceName">The embedded resource name.</param>
    /// <returns>A value indicating whether the asset was found.</returns>
    public bool TryOpenAsset(string assetName, out Stream? stream, out string contentType, out string resourceName)
    {
        stream = null;
        contentType = string.Empty;
        resourceName = string.Empty;

        if (!Assets.TryGetValue(assetName, out var asset))
        {
            return false;
        }

        stream = PluginAssembly.GetManifestResourceStream(asset.ResourceName);
        contentType = asset.ContentType;
        resourceName = asset.ResourceName;
        return stream is not null;
    }

    private static string ResolvePluginVersion()
    {
        string? informationalVersion = PluginAssembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrWhiteSpace(informationalVersion))
        {
            return informationalVersion.Split('+', StringSplitOptions.TrimEntries)[0];
        }

        Version? assemblyVersion = PluginAssembly.GetName().Version;
        return assemblyVersion is null
            ? "0.0.0"
            : string.Format(
                System.Globalization.CultureInfo.InvariantCulture,
                "{0}.{1}.{2}",
                assemblyVersion.Major,
                assemblyVersion.Minor,
                assemblyVersion.Build);
    }

    private static string ResolveAssetVersion(string pluginVersion)
    {
        using var hash = SHA256.Create();

        foreach (JellyChatAssetDefinition asset in Assets.Values)
        {
            byte[] resourceNameBytes = Encoding.UTF8.GetBytes(asset.ResourceName);
            _ = hash.TransformBlock(resourceNameBytes, 0, resourceNameBytes.Length, null, 0);

            using Stream? stream = PluginAssembly.GetManifestResourceStream(asset.ResourceName);
            if (stream is null)
            {
                continue;
            }

            var buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = stream.Read(buffer, 0, buffer.Length)) > 0)
            {
                _ = hash.TransformBlock(buffer, 0, bytesRead, null, 0);
            }
        }

        _ = hash.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
        string digest = Convert.ToHexString(hash.Hash ?? Array.Empty<byte>());
        return string.Concat(pluginVersion, "-", digest[..Math.Min(12, digest.Length)]);
    }

    private sealed record JellyChatAssetDefinition(string ResourceName, string ContentType);
}

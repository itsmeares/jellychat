using System.Text;
using Jellyfin.Plugin.JellyChat.Configuration;
using Jellyfin.Plugin.JellyChat.Infrastructure;

namespace Jellyfin.Plugin.JellyChat.Tests;

public sealed class JellyChatAppearanceStylesheetTests
{
    [Fact]
    public void BuildWithDefaultsProducesEmptyStylesheet()
    {
        JellyChatAppearanceAsset asset = JellyChatAppearanceStylesheet.Build(new PluginConfiguration());

        Assert.Empty(asset.Content);
        Assert.Equal("E3B0C44298FC", asset.Version);
    }

    [Fact]
    public void BuildWithOnlyCustomCssPreservesExactContent()
    {
        const string CustomCss = "\nbody > .skinHeader { display: none; }\n";

        JellyChatAppearanceAsset asset = JellyChatAppearanceStylesheet.Build(
            new PluginConfiguration { CustomCss = CustomCss });

        Assert.Equal(CustomCss, Encoding.UTF8.GetString(asset.Content));
    }

    [Fact]
    public void BuildPlacesColorOverridesBeforeUnmodifiedCustomCss()
    {
        const string CustomCss = "#jellyChatDrawer { backdrop-filter: blur(8px); }\nbody { --brand: coral; }";
        var configuration = new PluginConfiguration
        {
            AccentColor = "  hsl(192 100% 45%)  ",
            DrawerBackgroundColor = "var(--brand-drawer)",
            PanelBackgroundColor = "rgb(20 30 40)",
            BorderColor = "rgba(255, 255, 255, 0.25)",
            TextColor = "#fefefe",
            CustomCss = CustomCss
        };

        JellyChatAppearanceAsset asset = JellyChatAppearanceStylesheet.Build(configuration);
        string css = Encoding.UTF8.GetString(asset.Content);

        Assert.Contains("--jellychat-accent: hsl(192 100% 45%);", css, StringComparison.Ordinal);
        Assert.Contains("--jellychat-drawer-background: var(--brand-drawer);", css, StringComparison.Ordinal);
        Assert.Contains("--jellychat-panel-background: rgb(20 30 40);", css, StringComparison.Ordinal);
        Assert.Contains("--jellychat-border: rgba(255, 255, 255, 0.25);", css, StringComparison.Ordinal);
        Assert.Contains("--jellychat-text: #fefefe;", css, StringComparison.Ordinal);
        Assert.DoesNotContain("--jellychat-drawer-background-alpha", css, StringComparison.Ordinal);
        Assert.EndsWith(CustomCss, css, StringComparison.Ordinal);
    }

    [Fact]
    public void BuildVersionChangesWithCustomCss()
    {
        var firstConfiguration = new PluginConfiguration { CustomCss = ".one { color: red; }" };
        var secondConfiguration = new PluginConfiguration { CustomCss = ".two { color: red; }" };

        JellyChatAppearanceAsset first = JellyChatAppearanceStylesheet.Build(firstConfiguration);
        JellyChatAppearanceAsset same = JellyChatAppearanceStylesheet.Build(firstConfiguration);
        JellyChatAppearanceAsset second = JellyChatAppearanceStylesheet.Build(secondConfiguration);

        Assert.Equal(first.Version, same.Version);
        Assert.NotEqual(first.Version, second.Version);
    }
}

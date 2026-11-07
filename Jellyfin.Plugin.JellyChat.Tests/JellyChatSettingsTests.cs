using System.Text;
using Jellyfin.Plugin.JellyChat.Api;
using Jellyfin.Plugin.JellyChat.Configuration;
using Jellyfin.Plugin.JellyChat.Infrastructure;

namespace Jellyfin.Plugin.JellyChat.Tests;

public sealed class JellyChatSettingsTests
{
    [Fact]
    public void LegacyColorsMigrateToTheCustomThemeOnce()
    {
        var configuration = new PluginConfiguration { AccentColor = "#ff0000", TextColor = "#eeeeee" };

        Assert.True(JellyChatConfigurationMigration.Apply(configuration));
        Assert.Equal("custom", configuration.DefaultTheme);
        Assert.Equal("#ff0000", configuration.CustomAccent);
        Assert.Equal("#eeeeee", configuration.CustomText);
        Assert.Equal(JellyChatConfigurationMigration.CurrentSchemaVersion, configuration.SchemaVersion);
        Assert.False(JellyChatConfigurationMigration.Apply(configuration));
    }

    [Fact]
    public void FreshConfigurationKeepsTheVioletDefault()
    {
        var configuration = new PluginConfiguration();

        JellyChatConfigurationMigration.Apply(configuration);

        Assert.Equal("violet", configuration.DefaultTheme);
        Assert.Equal("docked", configuration.DefaultLayout);
    }

    [Theory]
    [InlineData("#8b7cf6", "#8b7cf6")]
    [InlineData("rgba(0, 0, 0, .5)", "rgba(0, 0, 0, .5)")]
    [InlineData("red; } body { display:none", "")]
    [InlineData("url(javascript:alert(1))", "")]
    [InlineData("", "")]
    public void OnlySafeColorsPass(string input, string expected)
    {
        Assert.Equal(expected, JellyChatThemeValues.Color(input));
    }

    [Fact]
    public void UnknownChoicesFallBackAndBlurIsClamped()
    {
        Assert.Equal("violet", JellyChatThemeValues.Theme("neon"));
        Assert.Equal("floating", JellyChatThemeValues.Layout(" Floating "));
        Assert.Equal(60, JellyChatThemeValues.Blur(500));
        Assert.Equal(0, JellyChatThemeValues.Blur(0));
    }

    [Fact]
    public void StylesheetWritesSafeValuesAndLegacyMirrors()
    {
        var configuration = new PluginConfiguration { CustomAccent = "#123456", CustomText = "red; x", CustomGlassBlur = 12 };

        string css = Encoding.UTF8.GetString(JellyChatAppearanceStylesheet.Build(configuration).Content);

        Assert.Contains("--jellychat-custom-accent: #123456;", css, StringComparison.Ordinal);
        Assert.Contains("--jellychat-accent: #123456;", css, StringComparison.Ordinal);
        Assert.Contains("--jellychat-custom-blur: 12px;", css, StringComparison.Ordinal);
        Assert.DoesNotContain("--jellychat-custom-text", css, StringComparison.Ordinal);
    }

    [Fact]
    public void ChangeTokenCompletesWhenAnEventIsAdded()
    {
        var store = new JellyChatEventStore();
        var userId = Guid.NewGuid();
        var room = new JellyChatSyncPlayRoomSnapshot(
            Guid.NewGuid(),
            "Night",
            [new JellyChatSyncPlayParticipant("session-1", userId, "alice", "session-1")]);
        Task before = store.ChangeToken;

        Assert.False(before.IsCompleted);
        Assert.True(store.TryAddOrGet(room, new JellyChatEvent { Type = "chat.message", Text = "hi", SessionId = "session-1", UserId = userId, GroupId = room.GroupId }, out _));

        Assert.True(before.IsCompleted);
        Assert.NotSame(before, store.ChangeToken);
    }

    [Fact]
    public void OversizedEventFieldsAreRejected()
    {
        var request = new JellyChatEventRequest { Type = "chat.message", Text = new string('x', 2001) };

        Assert.False(JellyChatEventValidator.TryCreate(request, Guid.NewGuid(), Guid.NewGuid(), "alice", "s", out _, out string error));
        Assert.Contains("too long", error, StringComparison.Ordinal);
        Assert.False(JellyChatEventValidator.TryCreate(new JellyChatEventRequest { Type = "reaction.emoji", Emoji = new string('x', 40) }, Guid.NewGuid(), Guid.NewGuid(), "alice", "s", out _, out _));
        Assert.True(JellyChatEventValidator.TryCreate(new JellyChatEventRequest { Type = "chat.message", Text = "ok" }, Guid.NewGuid(), Guid.NewGuid(), "alice", "s", out _, out _));
    }
}

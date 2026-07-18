using System.Reflection;
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.JellyChat.Tests;

public sealed class JellyChatConfigurationPageTests
{
    private const string ResourceName = "Jellyfin.Plugin.JellyChat.Configuration.configPage.html";

    [Fact]
    public void AppearanceColorsUseSharedInPagePopover()
    {
        string html = ReadConfigurationPage();

        Assert.DoesNotContain("type=\"color\"", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ColorPicker", html, StringComparison.Ordinal);
        Assert.Equal(5, Regex.Matches(html, "class=\"emby-button jellyChatColorSwatch\"").Count);
        Assert.Equal(5, Regex.Matches(html, "aria-haspopup=\"dialog\"").Count);
        Assert.Single(Regex.Matches(html, "<div id=\"JellyChatColorPopover\"").Cast<Match>());
        Assert.Contains("id=\"JellyChatColorSaturationValue\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatColorHue\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatColorAlpha\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatColorPreview\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatColorHex\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatColorApply\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatColorCancel\"", html, StringComparison.Ordinal);
        Assert.Contains("position: fixed", html, StringComparison.Ordinal);
        Assert.Contains("document.body.appendChild(popover)", html, StringComparison.Ordinal);
        Assert.Contains("document.addEventListener('pointerdown'", html, StringComparison.Ordinal);
        Assert.Contains("event.key === 'Escape'", html, StringComparison.Ordinal);
    }

    [Fact]
    public void AppearancePopoverProvidesColorControlsAndKeepsAdvancedInputs()
    {
        string html = ReadConfigurationPage();

        Assert.DoesNotContain("JellyChatColorPalette", html, StringComparison.Ordinal);
        Assert.DoesNotContain("var palette", html, StringComparison.Ordinal);
        Assert.Contains("function rgbToHsv", html, StringComparison.Ordinal);
        Assert.Contains("function hsvToRgb", html, StringComparison.Ordinal);
        Assert.Contains("function parseHex", html, StringComparison.Ordinal);
        Assert.Contains("return 'rgba('", html, StringComparison.Ordinal);
        Assert.Contains("type=\"range\" min=\"0\" max=\"360\"", html, StringComparison.Ordinal);
        Assert.Contains("type=\"range\" min=\"0\" max=\"100\"", html, StringComparison.Ordinal);

        Assert.Contains("id=\"JellyChatAccentColor\" type=\"text\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatDrawerBackgroundColor\" type=\"text\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatPanelBackgroundColor\" type=\"text\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatBorderColor\" type=\"text\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatTextColor\" type=\"text\"", html, StringComparison.Ordinal);
        Assert.Contains("CSS.supports('color', value)", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatResetColors\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatResetCustomCss\"", html, StringComparison.Ordinal);
        Assert.Contains("id=\"JellyChatResetAll\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void AppearancePickerStylesAreMountedInsideConfigurationPage()
    {
        string html = ReadConfigurationPage();
        int page = html.IndexOf("id=\"JellyChatConfigPage\"", StringComparison.Ordinal);
        int style = html.IndexOf("<style>", StringComparison.Ordinal);
        int content = html.IndexOf("<div data-role=\"content\">", StringComparison.Ordinal);

        Assert.True(page >= 0);
        Assert.True(style > page);
        Assert.True(content > style);
    }

    [Fact]
    public void GeneratedPickerColorClearsHexErrorAndEnablesApply()
    {
        string html = ReadConfigurationPage();
        string renderPicker = ReadBetween(html, "function renderPicker", "function setDraftRgb");

        Assert.Contains("hexInput.value = rgbToHex(rgb);", renderPicker, StringComparison.Ordinal);
        Assert.Contains("hexInput.setCustomValidity('');", renderPicker, StringComparison.Ordinal);
        Assert.Contains("element('JellyChatColorApply').disabled = false;", renderPicker, StringComparison.Ordinal);
    }

    [Fact]
    public void PickerOnlyReturnsFocusForExplicitDismissal()
    {
        string html = ReadConfigurationPage();
        string applyPicker = ReadBetween(html, "function applyColorPopover", "function updateSaturationValue");
        string outsidePointer = ReadBetween(html, "document.addEventListener('pointerdown'", "document.addEventListener('keydown'");
        string escapeKey = ReadBetween(html, "document.addEventListener('keydown'", "window.addEventListener('resize'");
        string cancelButton = ReadBetween(html, "element('JellyChatColorCancel').addEventListener", "document.addEventListener('pointerdown'");
        string openPicker = ReadBetween(html, "function openColorPopover", "function applyColorPopover");
        string resetColors = ReadBetween(html, "function resetColors", "element('JellyChatResetColors')");

        Assert.Contains("closeColorPopover(false);", applyPicker, StringComparison.Ordinal);
        Assert.Contains("colorInput.focus();", applyPicker, StringComparison.Ordinal);
        Assert.DoesNotContain("closeColorPopover(true);", applyPicker, StringComparison.Ordinal);
        Assert.Contains("closeColorPopover(false);", outsidePointer, StringComparison.Ordinal);
        Assert.DoesNotContain("closeColorPopover(true);", outsidePointer, StringComparison.Ordinal);
        Assert.DoesNotContain("targetSwatch", outsidePointer, StringComparison.Ordinal);
        Assert.Contains("closeColorPopover(false);", resetColors, StringComparison.Ordinal);
        Assert.Contains("closeColorPopover(true);", escapeKey, StringComparison.Ordinal);
        Assert.Contains("closeColorPopover(true);", cancelButton, StringComparison.Ordinal);
        Assert.Contains("closeColorPopover(true);", openPicker, StringComparison.Ordinal);
    }

    private static string ReadConfigurationPage()
    {
        Assembly assembly = typeof(Plugin).Assembly;
        using Stream? stream = assembly.GetManifestResourceStream(ResourceName);
        Assert.NotNull(stream);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static string ReadBetween(string value, string startMarker, string endMarker)
    {
        int start = value.IndexOf(startMarker, StringComparison.Ordinal);
        int end = value.IndexOf(endMarker, start + startMarker.Length, StringComparison.Ordinal);
        Assert.True(start >= 0);
        Assert.True(end > start);
        return value[start..end];
    }
}
